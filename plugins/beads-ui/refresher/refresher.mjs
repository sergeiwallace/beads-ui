// The beads-ui host refresher (design D-26, T-1B.4): one process per host reads every Beads
// store's counts once a minute and writes them to a snapshot every session's band reads, so the
// number of `bd` calls no longer grows with the number of sessions.
//
//   node refresher.mjs start --state-dir <dir> --home <home> --token <token>
//
// `start` is what a session's mod spawns: it starts `run` detached from the session (its own
// process group and session, so it outlives the session that started it, which Claude Code
// ends with its module) and exits at once, printing `{"pid": N}`. `run` holds the file lease
// `<state-dir>/lease.json` under `--token`: it takes it only when no live refresher holds it,
// re-checks it before every read and write, and exits when it is not the holder. No
// dependencies: Node runs this file and the core modules it imports with its type stripping.
//
// For each store a live session's pane reads, it also keeps a board snapshot in
// `<state-dir>/boards/`, re-read only when the store's Dolt head moved (T-1B.4, D-29), and it
// re-reads a store a session just wrote to as soon as that session drops a marker in
// `<state-dir>/wake/`.

import { execFile, spawn } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { boardReadArgvs, headArgv, statusesArgv } from "../core/src/argv.ts";
import {
  BEAT_MS,
  BOARD_MAX_BYTES,
  BOARD_SCHEMA,
  BOARDS_DIR,
  boardFileName,
  boardRow,
  IDLE_EXIT_MS,
  LEASE_DEAD_MS,
  LEASE_FILE,
  parseHead,
  parseSessionEntry,
  parseSnapshot,
  parseWake,
  RENEW_MS,
  SESSION_LIVE_MS,
  SESSIONS_DIR,
  SNAPSHOT_FILE,
  SNAPSHOT_SCHEMA,
  storeReads,
  storeSnapshotOf,
  WAKE_DIR,
  WAKE_POLL_MS,
} from "../core/src/snapshot.ts";
import { parseStoreInventory, STORE_INVENTORY_FILE } from "../core/src/views/band.ts";

const COUNT_TIMEOUT_MS = 8_000;
/** A board read lists every open issue: more time and room than a count. */
const BOARD_TIMEOUT_MS = 30_000;
const BOARD_BUFFER = 256 * 1024 * 1024;
/** A registry file this old names a session long gone; the holder removes it. */
const REGISTRY_KEEP_MS = 86_400_000;

const NUMBER_FLAGS = ["beat-ms", "renew-ms", "stale-ms", "idle-ms", "wake-ms"];

/** The command and its `--name value` options; the timings exist so tests can run in seconds. */
function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === undefined || !flag.startsWith("--") || value === undefined) {
      throw new Error(`expected --name value pairs, got ${JSON.stringify(rest.slice(i))}`);
    }
    options[flag.slice(2)] = value;
  }
  for (const name of ["state-dir", "home", "token"]) {
    if (typeof options[name] !== "string" || options[name] === "") {
      throw new Error(`--${name} is required`);
    }
  }
  if (!options["state-dir"].startsWith("/")) throw new Error("--state-dir must be absolute");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(options.token)) {
    throw new Error("--token must be 8 to 64 letters, digits, _ or -");
  }
  for (const name of NUMBER_FLAGS) {
    if (options[name] !== undefined) {
      const ms = Number(options[name]);
      if (!Number.isInteger(ms) || ms < 10) throw new Error(`--${name} must be a whole number`);
      options[name] = ms;
    }
  }
  return { command, options };
}

const readText = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
};

/** Writes `text` to `path` whole: a reader sees the old file or the new one, never a part. */
function writeWhole(path, text, token) {
  const temp = `${path}.${token}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, path);
}

/**
 * The lease a refresher holds in the state directory: `{ token, pid, beatAt }`. It is taken by a
 * hard link of a file holding the new token, which fails when any lease file is there, so two
 * refreshers taking it at once cannot both win; a stale one (not renewed for `staleMs`) is first
 * renamed aside, which only one of them can do.
 */
class FileLease {
  constructor(dir, token, staleMs) {
    this.path = join(dir, LEASE_FILE);
    this.token = token;
    this.staleMs = staleMs;
  }

  read() {
    const text = readText(this.path);
    if (text === undefined) return existsSync(this.path) ? { garbled: true } : undefined;
    try {
      const value = JSON.parse(text);
      return typeof value?.token === "string" && Number.isFinite(value?.beatAt)
        ? value
        : { garbled: true };
    } catch {
      return { garbled: true };
    }
  }

  holds() {
    return this.read()?.token === this.token;
  }

  record(now) {
    return `${JSON.stringify({ token: this.token, pid: process.pid, beatAt: now })}\n`;
  }

  acquire(now) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const held = this.read();
      if (held?.token === this.token) return true;
      if (held !== undefined && held.garbled !== true && now - held.beatAt <= this.staleMs) {
        return false;
      }
      if (held !== undefined) {
        const aside = `${this.path}.stale.${this.token}`;
        try {
          renameSync(this.path, aside);
          unlinkSync(aside);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      const temp = `${this.path}.${this.token}.tmp`;
      writeFileSync(temp, this.record(now));
      try {
        linkSync(temp, this.path);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        continue;
      } finally {
        unlinkSync(temp);
      }
      return this.holds();
    }
    return false;
  }

  /** Renews the heartbeat; false, writing nothing, when another refresher holds the lease. */
  renew(now) {
    if (!this.holds()) return false;
    writeWhole(this.path, this.record(now), this.token);
    return true;
  }

  release() {
    if (this.holds()) unlinkSync(this.path);
  }
}

function count(store, argv, timeout = COUNT_TIMEOUT_MS, maxBuffer = 4 * 1024 * 1024) {
  return new Promise((resolve) => {
    execFile(
      argv[0],
      argv.slice(1),
      {
        cwd: store.path,
        timeout,
        maxBuffer,
        env: { ...process.env, NO_COLOR: "1" },
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ ok: true, stdout });
          return;
        }
        const why = `${stderr}`.trim().split("\n")[0] || `${stdout}`.trim().split("\n")[0] || "";
        const exit =
          typeof error.code === "number" ? `exit ${error.code}` : "timed out or could not start";
        resolve({ ok: false, error: why === "" ? exit : `${exit}, ${why}` });
      },
    );
  });
}

/** One store's counts by owner for every done window asked for. */
async function countStore(store, windows) {
  const answers = [];
  for (const read of storeReads(windows, Date.now())) {
    answers.push({ key: read.key, ...(await count(store, read.argv)) });
  }
  return storeSnapshotOf(store, answers, Date.now());
}

const parseJson = (text) => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

/**
 * One store's board snapshot (T-1B.4, D-29). The store's Dolt head is read first: when it is the
 * head `known` was read at and the file is there, nothing else is read and only `checkedAt`
 * moves. Otherwise `bd statuses`, the open issues and the most recent closed page are read, cut
 * to the fields the board draws and written whole, unless the file would pass BOARD_MAX_BYTES,
 * which the entry names instead. `writable` is the lease check, made just before the write;
 * undefined means it failed and nothing was written.
 */
async function readBoard(store, known, dir, token, writable) {
  const checkedAt = Date.now();
  const failed = (error) => ({ path: store.path, ok: false, checkedAt, error });
  const head = await count(store, headArgv());
  if (!head.ok) return failed(`bd vc status failed (${head.error})`);
  const commit = parseHead(head.stdout);
  if (commit === undefined) return failed("bd vc status named no commit");
  const file = boardFileName(store.path);
  const path = join(dir, BOARDS_DIR, file);
  if (known?.ok === true && known.head === commit && existsSync(path)) {
    return { ...known, checkedAt };
  }
  const [openArgv, closedArgv] = boardReadArgvs();
  const parts = [];
  for (const argv of [statusesArgv(), openArgv, closedArgv]) {
    const ran = await count(store, argv, BOARD_TIMEOUT_MS, BOARD_BUFFER);
    if (!ran.ok) return failed(`${argv.slice(0, 2).join(" ")} failed (${ran.error})`);
    const json = parseJson(ran.stdout);
    if (!json.ok) return failed(`${argv.slice(0, 2).join(" ")} did not answer JSON`);
    parts.push(json.value);
  }
  const [statuses, open, closed] = parts;
  if (!Array.isArray(open) || !Array.isArray(closed)) return failed("bd list answered no list");
  const issues = [...open, ...closed].map(boardRow).filter((row) => row !== undefined);
  const readAt = Date.now();
  const text = `${JSON.stringify({ schema: BOARD_SCHEMA, path: store.path, name: store.name, head: commit, readAt, statuses, issues })}\n`;
  const bytes = Buffer.byteLength(text);
  if (bytes > BOARD_MAX_BYTES) {
    const mib = (bytes / 1_048_576).toFixed(1);
    return failed(
      `its board snapshot would be ${mib} MiB, past the 4 MiB a session can read; the pane reads this store itself`,
    );
  }
  if (!writable()) return undefined;
  writeWhole(path, text, token);
  return { path: store.path, ok: true, file, head: commit, readAt, checkedAt: readAt, bytes };
}

/** Keeps `value` for `path` unless the map holds one whose reads began later. */
function keepNewer(map, path, value, startedAt) {
  const held = map.get(path);
  if (held === undefined || held.startedAt <= startedAt) map.set(path, { value, startedAt });
}

/** The sessions registered in the last SESSION_LIVE_MS; older files past a day are removed. */
function liveSessions(dir, now, isHolder) {
  const sessionsDir = join(dir, SESSIONS_DIR);
  let names = [];
  try {
    names = readdirSync(sessionsDir).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const live = [];
  for (const name of names) {
    const path = join(sessionsDir, name);
    const entry = parseSessionEntry(readText(path) ?? "");
    if (entry === undefined) continue;
    if (now - entry.seenAt <= SESSION_LIVE_MS) live.push(entry);
    else if (now - entry.seenAt > REGISTRY_KEEP_MS && isHolder()) {
      try {
        unlinkSync(path);
      } catch {
        // another holder removed it first
      }
    }
  }
  return live;
}

/** Every inventory store, then each store a live session reads that the inventory lacks. */
function storesToRead(home, sessions) {
  const inventory = parseStoreInventory(readText(join(home, STORE_INVENTORY_FILE)) ?? "");
  const stores = inventory.ok ? inventory.value.map(({ name, path }) => ({ name, path })) : [];
  const trim = (path) => path.replace(/\/+$/, "");
  for (const session of sessions) {
    for (const store of session.stores) {
      if (!stores.some((known) => trim(known.path) === trim(store.path))) stores.push(store);
    }
  }
  return stores;
}

async function run(options) {
  const dir = options["state-dir"];
  const token = options.token;
  const beatMs = options["beat-ms"] ?? BEAT_MS;
  const renewMs = options["renew-ms"] ?? RENEW_MS;
  const idleMs = options["idle-ms"] ?? IDLE_EXIT_MS;
  mkdirSync(dir, { recursive: true });
  const lease = new FileLease(dir, token, options["stale-ms"] ?? LEASE_DEAD_MS);
  if (!lease.acquire(Date.now())) return;

  const snapshotPath = join(dir, SNAPSHOT_FILE);
  const wakeDir = join(dir, WAKE_DIR);
  mkdirSync(join(dir, BOARDS_DIR), { recursive: true });
  mkdirSync(wakeDir, { recursive: true });
  let lastSeen = Date.now();
  let last = { schema: SNAPSHOT_SCHEMA, token, pid: process.pid, beatAt: lastSeen, stores: [] };
  let beatTimer;
  let renewTimer;
  let wakeTimer;
  let stopped = false;
  // Each store's newest counts and board entry, with when their reads began: a wake read and a
  // beat can overlap, and the read that began later wins.
  const counts = new Map();
  const boards = new Map();
  // A restarted refresher keeps the boards the last one read, so an unchanged store is not read.
  const previous = parseSnapshot(readText(snapshotPath) ?? "");
  for (const entry of previous.ok ? (previous.value.boards ?? []) : []) {
    boards.set(entry.path, { value: entry, startedAt: 0 });
  }
  let storeList = [];
  let boardList = [];
  let windows = [];

  const quit = () => {
    stopped = true;
    clearTimeout(beatTimer);
    clearInterval(renewTimer);
    clearInterval(wakeTimer);
  };
  const holds = () => !stopped && lease.holds();
  /** Writes the snapshot from the newest reads; false, writing nothing, without the lease. */
  const publish = () => {
    if (!holds()) return false;
    const values = (map, list) =>
      list.flatMap((store) => {
        const held = map.get(store.path);
        return held === undefined ? [] : [held.value];
      });
    last = {
      schema: SNAPSHOT_SCHEMA,
      token,
      pid: process.pid,
      beatAt: Date.now(),
      stores: values(counts, storeList),
      boards: values(boards, boardList),
    };
    writeWhole(snapshotPath, `${JSON.stringify(last)}\n`, token);
    return true;
  };
  /** Reads one store's counts, and its board when a pane reads it; false once the lease is lost. */
  const readStore = async (store, withBoard) => {
    const startedAt = Date.now();
    keepNewer(counts, store.path, await countStore(store, windows), startedAt);
    if (!withBoard) return holds();
    if (!holds()) return false;
    const entry = await readBoard(store, boards.get(store.path)?.value, dir, token, holds);
    if (entry === undefined) return false;
    keepNewer(boards, store.path, entry, startedAt);
    return holds();
  };
  // Stopping on purpose marks the snapshot, so a session starts the next refresher at its next
  // minute check rather than three minutes on.
  const stop = () => {
    if (stopped) return;
    quit();
    if (lease.holds()) {
      writeWhole(snapshotPath, `${JSON.stringify({ ...last, stoppedAt: Date.now() })}\n`, token);
      lease.release();
    }
  };
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    process.on(signal, () => {
      stop();
      process.exit(0);
    });
  }

  renewTimer = setInterval(() => {
    if (!lease.renew(Date.now())) quit();
  }, renewMs);

  const beat = async () => {
    const began = Date.now();
    if (!holds()) return quit();
    const sessions = liveSessions(dir, began, () => lease.holds());
    lastSeen = Math.max(lastSeen, ...sessions.map((session) => session.seenAt));
    if (began - lastSeen > idleMs) return stop();
    windows = [...new Set(sessions.flatMap((session) => session.windows))];
    storeList = storesToRead(options.home, sessions);
    boardList = unique(sessions.flatMap((session) => session.boards));
    for (const store of storeList) {
      const withBoard = boardList.some((board) => samePath(board.path, store.path));
      if (!(await readStore(store, withBoard))) return quit();
    }
    for (const store of boardList) {
      if (storeList.some((known) => samePath(known.path, store.path))) continue;
      if (!holds()) return quit();
      const entry = await readBoard(store, boards.get(store.path)?.value, dir, token, holds);
      if (entry === undefined) return quit();
      keepNewer(boards, store.path, entry, began);
    }
    for (const map of [counts, boards]) {
      for (const path of map.keys()) {
        if (![...storeList, ...boardList].some((store) => store.path === path)) map.delete(path);
      }
    }
    if (!publish()) return quit();
    beatTimer = setTimeout(beat, Math.max(0, beatMs - (Date.now() - began)));
  };

  // A session that wrote to a store drops a marker naming it (T-1B.5): that store is read again
  // within a second or so, rather than at the next beat, and the snapshot written.
  let waking = false;
  const wake = async () => {
    if (waking || stopped) return;
    let names = [];
    try {
      names = readdirSync(wakeDir).filter((name) => name.endsWith(".json"));
    } catch {
      return;
    }
    if (names.length === 0) return;
    if (!holds()) return quit();
    waking = true;
    try {
      const paths = new Set();
      for (const name of names) {
        const path = join(wakeDir, name);
        const marker = parseWake(readText(path) ?? "");
        if (!holds()) return quit();
        try {
          unlinkSync(path);
        } catch {
          // a marker another write replaced meanwhile is read at the next poll
        }
        if (marker !== undefined) paths.add(marker.path.replace(/\/+$/, ""));
      }
      for (const path of paths) {
        const store =
          storeList.find((known) => samePath(known.path, path)) ??
          boardList.find((known) => samePath(known.path, path));
        if (store === undefined) continue;
        const withBoard = boardList.some((board) => samePath(board.path, path));
        if (!(await readStore(store, withBoard))) return quit();
      }
      if (!publish()) return quit();
    } finally {
      waking = false;
    }
  };

  await beat();
  if (!stopped) wakeTimer = setInterval(() => void wake(), options["wake-ms"] ?? WAKE_POLL_MS);
}

const samePath = (a, b) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
const unique = (stores) => [
  ...new Map(stores.map((store) => [store.path.replace(/\/+$/, ""), store])).values(),
];

function start(options) {
  mkdirSync(options["state-dir"], { recursive: true });
  const self = fileURLToPath(import.meta.url);
  const args = process.argv.slice(3);
  const child = spawn(process.execPath, [self, "run", ...args], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  process.stdout.write(`${JSON.stringify({ pid: child.pid })}\n`);
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "start") start(options);
  else if (command === "run") await run(options);
  else throw new Error(`unknown command ${JSON.stringify(command)}; expected start or run`);
} catch (error) {
  process.stderr.write(`beads-ui refresher: ${error instanceof Error ? error.message : error}\n`);
  process.exit(2);
}
