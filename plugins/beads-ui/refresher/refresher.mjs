// The beads-ui host refresher (design D-26, T-1B.4): one process per host reads every Beads
// store's counts once a minute and writes them to a snapshot every session's band reads, so the
// number of `bd` calls no longer grows with the number of sessions.
//
//   node refresher.mjs start --state-dir <dir> --home <home> --token <token>
//
// `start` is what a session's mod spawns: it starts `run` detached from the session (its own
// process group and session, so it outlives the session that started it, which Claude Code
// ends with its module) and exits at once, printing `{"pid": N}`. `run` holds the file lease
// `<state-dir>/lease.json` (a hard link to its own `lease-<token>.json`) under `--token`: it takes it only when no live refresher holds it,
// or when the live one is an older plugin build (the lease records each refresher's build),
// re-checks it before every read and write, and exits when it is not the holder. No
// dependencies: Node runs this file and the core modules it imports with its type stripping.
//
// For each store a live session's pane reads, it also keeps a board snapshot in
// `<state-dir>/boards/<token>/`, re-read only when the store's Dolt head moved (T-1B.4, D-29),
// and it re-reads a store a session just wrote to as soon as that session drops a marker in
// `<state-dir>/wake/`.
//
// Every snapshot it writes is its own: `counts-<token>.json` and `boards/<token>/`, which no
// other refresher writes. A session reads the snapshot of the token `lease.json` names, so a
// refresher ousted while it was stopped between its lease check and its write writes only its
// own files, which nobody reads any more. `counts.json`, the last published snapshot, is
// replaced only after the holder's own file is written and the lease checked again; a session
// reads it only when no lease names a refresher.

import { execFile, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { boardReadArgvs, headArgv, statusesArgv } from "../core/src/argv.ts";
import {
  BEAT_MS,
  BOARD_MAX_BYTES,
  BOARD_SCHEMA,
  BOARDS_DIR,
  boardFileName,
  boardRow,
  buildOf,
  IDLE_EXIT_MS,
  isRefresherToken,
  LEASE_DEAD_MS,
  LEASE_FILE,
  laterBuild,
  MANIFEST_PATH,
  parseHead,
  parseSessionEntry,
  parseSnapshot,
  parseWake,
  RENEW_MS,
  SESSION_LIVE_MS,
  SESSIONS_DIR,
  SNAPSHOT_FILE,
  SNAPSHOT_SCHEMA,
  snapshotFileName,
  snapshotLive,
  storeReads,
  storeSnapshotOf,
  WAKE_DIR,
  WAKE_POLL_MS,
} from "../core/src/snapshot.ts";
import { parseStoreInventory, STORE_INVENTORY_FILE } from "../core/src/views/band.ts";

const COUNT_TIMEOUT_MS = 8_000;
/** A board read lists every open issue: more time and room than a count. */
const BOARD_TIMEOUT_MS = 30_000;
/**
 * Every read of a beat, and of a wake, ends within this of its start, and the snapshot is written
 * then with what answered. Beats start BEAT_MS apart, so two snapshots are at most 88 s apart:
 * within T-1B.4's 90, however many stores there are and however slowly they answer.
 */
const CYCLE_MS = 28_000;
/** How many stores a beat reads at once. */
const CONCURRENT_STORES = 4;
/** The error of a read the cycle's deadline cut short, or never started. */
const UNREAD = "not read before the beat's deadline";
const BOARD_BUFFER = 256 * 1024 * 1024;
/** A registry file this old names a session long gone; the holder removes it. */
const REGISTRY_KEEP_MS = 86_400_000;

// `pause-ms` stalls the process, its timers with it, after each lease check before a snapshot
// write, as swap or a stopped process stalls a real one: a test's window between the two.
const NUMBER_FLAGS = [
  "beat-ms",
  "renew-ms",
  "stale-ms",
  "idle-ms",
  "wake-ms",
  "pause-ms",
  "cycle-ms",
];

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
  if (!isRefresherToken(options.token)) {
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

/** A lease record's length: every renewal overwrites the same bytes in place, never truncating. */
const LEASE_RECORD_BYTES = 192;

const inodeOf = (path) => {
  try {
    const { dev, ino } = statSync(path);
    return `${dev}:${ino}`;
  } catch {
    return undefined;
  }
};

/**
 * The lease a refresher holds in the state directory. Each refresher keeps its own file,
 * `lease-<token>.json` (`{ token, pid, beatAt, version }`), and renews only that file, in place. The shared
 * `lease.json` is a hard link to the holder's file, so it reads the holder's heartbeat, and a
 * refresher holds the lease while `lease.json` is its own file's inode. No refresher ever writes
 * through `lease.json`, so one that stalls after a check and then renews writes only to its own
 * file, which an ousted refresher no longer has linked.
 *
 * The shared name only changes by a rename that moves it aside, which one refresher at a time
 * can do: a taker moves aside a holder it found stale (and puts back, by a link that fails when
 * the name is taken, any newer one it moved instead), then links its own file in, which fails
 * when another linked first. A refresher that stops moves the name aside the same way and drops
 * it only when it is its own file.
 */
class FileLease {
  constructor(dir, token, staleMs, build) {
    this.dir = dir;
    this.path = join(dir, LEASE_FILE);
    this.own = join(dir, `lease-${token}.json`);
    this.token = token;
    this.staleMs = staleMs;
    this.build = build;
  }

  /** The holder `lease.json` names: its record and inode, `garbled` when unreadable. */
  read() {
    const inode = inodeOf(this.path);
    if (inode === undefined) return undefined;
    const text = readText(this.path);
    try {
      const value = JSON.parse(text ?? "");
      return typeof value?.token === "string" && Number.isFinite(value?.beatAt)
        ? { ...value, inode }
        : { garbled: true, inode };
    } catch {
      return { garbled: true, inode };
    }
  }

  holds() {
    const own = inodeOf(this.own);
    return own !== undefined && inodeOf(this.path) === own;
  }

  record(now) {
    const version = this.build === undefined ? {} : { version: this.build };
    const text = JSON.stringify({ token: this.token, pid: process.pid, beatAt: now, ...version });
    return `${text.padEnd(LEASE_RECORD_BYTES - 1, " ")}\n`;
  }

  /** Overwrites the own file's record in place: the inode `lease.json` links to stays the same. */
  writeOwn(now, flags) {
    const fd = openSync(this.own, flags);
    try {
      writeSync(fd, this.record(now), 0);
    } finally {
      closeSync(fd);
    }
  }

  /**
   * Moves `lease.json` aside and returns the moved file's inode, or undefined when there was
   * none to move. The rename is atomic, so two refreshers never move the same file.
   */
  moveAside(kind) {
    const aside = `${this.path}.${kind}.${this.token}`;
    try {
      renameSync(this.path, aside);
    } catch (error) {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    }
    return { aside, inode: inodeOf(aside) };
  }

  /** Puts a moved-aside lease back unless the name is taken again, then drops the aside name. */
  putBack(aside) {
    try {
      linkSync(aside, this.path);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    unlinkSync(aside);
  }

  acquire(now) {
    this.writeOwn(now, "w");
    for (let attempt = 0; attempt < 3; attempt++) {
      const held = this.read();
      if (held !== undefined && held.inode === inodeOf(this.own)) return true;
      // A live holder keeps the lease unless this is a later build (BU-4af): an upgrade's first
      // refresher replaces the older one, which finds the lease gone at its next check and exits.
      if (
        held !== undefined &&
        held.garbled !== true &&
        now - held.beatAt <= this.staleMs &&
        !laterBuild(this.build, typeof held.version === "string" ? held.version : undefined)
      ) {
        break;
      }
      if (held !== undefined) {
        const moved = this.moveAside("stale");
        if (moved === undefined) continue;
        if (moved.inode !== held.inode) {
          // Another taker linked in after the read: its lease is fresh, so it goes back.
          this.putBack(moved.aside);
          continue;
        }
        unlinkSync(moved.aside);
      }
      try {
        linkSync(this.own, this.path);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        continue;
      }
      if (this.holds()) {
        this.dropStale(now);
        return true;
      }
    }
    unlinkSync(this.own);
    return false;
  }

  /** Removes other refreshers' own files that no lease names and no renewal keeps fresh. */
  dropStale(now) {
    for (const name of readdirSync(this.dir)) {
      if (!/^lease-.+\.json$/.test(name) || join(this.dir, name) === this.own) continue;
      const path = join(this.dir, name);
      try {
        const { nlink } = statSync(path);
        const beatAt = JSON.parse(readText(path) ?? "").beatAt;
        if (nlink === 1 && !(now - beatAt <= this.staleMs)) unlinkSync(path);
      } catch {
        // gone already, or being written: left for the next holder
      }
    }
  }

  /**
   * Renews the heartbeat in the own file; false, writing nothing, when the lease is not held. A
   * refresher ousted after the check writes only its own file, which no lease names any more.
   */
  renew(now) {
    if (!this.holds()) return false;
    try {
      this.writeOwn(now, "r+");
    } catch {
      return false;
    }
    return true;
  }

  /** Gives the lease up: removes `lease.json` only when it is this refresher's own file. */
  release() {
    const moved = this.moveAside("release");
    if (moved !== undefined) {
      if (moved.inode === inodeOf(this.own)) unlinkSync(moved.aside);
      else this.putBack(moved.aside);
    }
    try {
      unlinkSync(this.own);
    } catch {
      // already removed by a newer holder
    }
  }
}

/**
 * One bd call in the store's directory, given at most `timeout` and never past `deadline`. A call
 * the deadline cuts short, or leaves no time to start, answers `unread`.
 */
function count(store, argv, deadline, timeout = COUNT_TIMEOUT_MS, maxBuffer = 4 * 1024 * 1024) {
  const left = deadline - Date.now();
  if (left <= 0) return Promise.resolve({ ok: false, error: UNREAD, unread: true });
  const cut = left < timeout;
  return new Promise((resolve) => {
    execFile(
      argv[0],
      argv.slice(1),
      {
        cwd: store.path,
        timeout: Math.min(timeout, left),
        maxBuffer,
        env: { ...process.env, NO_COLOR: "1" },
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ ok: true, stdout });
          return;
        }
        if (cut && error.killed === true) {
          resolve({ ok: false, error: UNREAD, unread: true });
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

/**
 * One store's counts by owner for every done window asked for, by `deadline`: a store with a read
 * left unanswered then is marked unread. Undefined once `holds` fails.
 */
async function countStore(store, windows, holds, deadline) {
  const answers = [];
  for (const read of storeReads(windows, Date.now())) {
    if (!holds()) return undefined;
    answers.push({ key: read.key, ...(await count(store, read.argv, deadline)) });
  }
  return storeSnapshotOf({ name: store.name, path: store.path }, answers, Date.now());
}

/** Runs `tasks` at most `limit` at a time; false, starting no more, once one answers false. */
async function inTurn(tasks, limit) {
  let next = 0;
  let ok = true;
  const worker = async () => {
    while (ok && next < tasks.length) {
      const task = tasks[next++];
      if (!(await task())) ok = false;
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return ok;
}

const parseJson = (text) => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

/**
 * One store's board snapshot (T-1B.4, D-29), in this refresher's own `boards/<token>/`. The
 * store's Dolt head is read first: when it is the head `known` was read at and the file is there,
 * nothing else is read and only `checkedAt` moves; `inherited` is the file the last refresher
 * wrote at that head, linked in rather than read again. Otherwise `bd statuses`, the open issues
 * and the most recent closed page are read, cut to the fields the board draws and written whole,
 * unless the file would pass BOARD_MAX_BYTES, which the entry names instead. `writable` is the
 * lease check, made just before the write; undefined means it failed and nothing was written. A
 * read the cycle's `deadline` cuts short keeps `known` as it was, its `checkedAt` unmoved.
 */
async function readBoard(store, known, dir, token, writable, inherited, deadline) {
  const checkedAt = Date.now();
  const failed = (error) => ({ path: store.path, ok: false, checkedAt, error });
  const head = await count(store, headArgv(), deadline);
  if (head.unread === true) return known ?? failed(UNREAD);
  if (!head.ok) return failed(`bd vc status failed (${head.error})`);
  const commit = parseHead(head.stdout);
  if (commit === undefined) return failed("bd vc status named no commit");
  const file = boardFileName(store.path);
  const path = join(dir, BOARDS_DIR, token, file);
  if (known?.ok === true && known.head === commit) {
    if (existsSync(path)) return { ...known, checkedAt };
    if (inherited !== undefined && existsSync(inherited)) {
      if (!writable()) return undefined;
      try {
        linkSync(inherited, path);
        return { ...known, checkedAt };
      } catch {
        // gone meanwhile: read the store as for a moved head
      }
    }
  }
  const [openArgv, closedArgv] = boardReadArgvs();
  const parts = [];
  for (const argv of [statusesArgv(), openArgv, closedArgv]) {
    const ran = await count(store, argv, deadline, BOARD_TIMEOUT_MS, BOARD_BUFFER);
    if (ran.unread === true) return known ?? failed(UNREAD);
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

/** A synchronous stall of `ms`: the event loop, and so every timer, waits with it. */
const stall = (ms) => {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * Removes the snapshots of other refreshers' tokens once they are older than `staleMs`: a
 * `counts-<token>.json` whose heartbeat is that old, and a `boards/<token>/` directory with no
 * fresh counts of its token and no file added within `staleMs`. `isHolder` is checked before
 * each removal; a session never reads them, since no lease names their tokens.
 */
function dropOtherTokens(dir, token, now, staleMs, isHolder) {
  const old = (path) => {
    try {
      return now - statSync(path).mtimeMs > staleMs;
    } catch {
      return false;
    }
  };
  const fresh = new Set([token]);
  for (const name of readdirSync(dir)) {
    const match = /^counts-(.+)\.json$/.exec(name);
    if (match === null || match[1] === token) continue;
    const parsed = parseSnapshot(readText(join(dir, name)) ?? "");
    const beatAt = parsed.ok ? parsed.value.beatAt : undefined;
    const stale = beatAt === undefined ? old(join(dir, name)) : now - beatAt > staleMs;
    if (!stale) {
      fresh.add(match[1]);
      continue;
    }
    if (!isHolder()) return;
    try {
      unlinkSync(join(dir, name));
    } catch {
      // another holder removed it first
    }
  }
  const boardsDir = join(dir, BOARDS_DIR);
  for (const name of readdirSync(boardsDir)) {
    const path = join(boardsDir, name);
    if (fresh.has(name) || !old(path)) continue;
    if (!isHolder()) return;
    try {
      if (statSync(path).isDirectory()) {
        for (const file of readdirSync(path)) unlinkSync(join(path, file));
        rmdirSync(path);
      } else {
        unlinkSync(path);
      }
    } catch {
      // being written, or removed by another holder: left for the next pass
    }
  }
}

/**
 * Writes the last published snapshot's counts as this refresher's own, when that snapshot is live:
 * its stores and heartbeat as they were, with no boards (their files are the last refresher's).
 * True when it wrote.
 */
function seed(snapshotPath, ownPath, token, now) {
  const previous = parseSnapshot(readText(snapshotPath) ?? "");
  if (!previous.ok || !snapshotLive(previous.value, now)) return false;
  const { beatAt, stores } = previous.value;
  const text = `${JSON.stringify({ schema: SNAPSHOT_SCHEMA, token, pid: process.pid, beatAt, stores })}\n`;
  writeWhole(ownPath, text, token);
  return true;
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

/** A directory with its symlinks resolved; the path as given when it cannot be resolved. */
const realOf = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path.replace(/\/+$/, "");
  }
};

/**
 * Whether two stores are one database: the same prefix, the database's name on the shared
 * server, or, where either names none, the same directory once symlinks are resolved. A linked
 * worktree has its own `.beads` directory and its main tree's prefix.
 */
const sameDatabase = (a, b) =>
  a.prefix !== undefined && b.prefix !== undefined
    ? a.prefix === b.prefix
    : realOf(a.path) === realOf(b.path);

/**
 * Every inventory store, then each store a live session reads whose database neither the
 * inventory nor an earlier session store holds: each database is counted once, by whichever
 * path a session reaches it.
 */
function storesToRead(home, sessions) {
  const inventory = parseStoreInventory(readText(join(home, STORE_INVENTORY_FILE)) ?? "");
  const stores = inventory.ok
    ? inventory.value.map(({ name, path, prefix }) => withPrefix({ name, path }, prefix))
    : [];
  for (const session of sessions) {
    for (const store of session.stores) {
      if (!stores.some((known) => sameDatabase(known, store))) stores.push(store);
    }
  }
  return stores;
}

const withPrefix = (store, prefix) => (prefix === undefined ? store : { ...store, prefix });

async function run(options) {
  const dir = options["state-dir"];
  const token = options.token;
  const beatMs = options["beat-ms"] ?? BEAT_MS;
  const renewMs = options["renew-ms"] ?? RENEW_MS;
  const idleMs = options["idle-ms"] ?? IDLE_EXIT_MS;
  mkdirSync(dir, { recursive: true });
  const build = buildOf(
    readText(join(dirname(fileURLToPath(import.meta.url)), "..", MANIFEST_PATH)),
  );
  const lease = new FileLease(dir, token, options["stale-ms"] ?? LEASE_DEAD_MS, build);
  const snapshotPath = join(dir, SNAPSHOT_FILE);
  const ownPath = join(dir, snapshotFileName(token));
  // The last published counts, under this token before it takes the lease: a session reads them
  // from the moment the lease names it, not after its first beat, so a takeover (of a killed
  // refresher or of an older build's) leaves no minute where sessions read every store themselves.
  const seeded = seed(snapshotPath, ownPath, token, Date.now());
  if (!lease.acquire(Date.now())) {
    if (seeded) unlinkSync(ownPath);
    return;
  }
  // The holder it replaced may have dropped the seed as another token's old file just before the
  // takeover; it is written again now that no other refresher holds the lease.
  if (seeded && !existsSync(ownPath)) seed(snapshotPath, ownPath, token, Date.now());

  const pauseMs = options["pause-ms"] ?? 0;
  const cycleMs = options["cycle-ms"] ?? CYCLE_MS;
  const staleMs = options["stale-ms"] ?? LEASE_DEAD_MS;
  const wakeDir = join(dir, WAKE_DIR);
  mkdirSync(join(dir, BOARDS_DIR, token), { recursive: true });
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
  // A restarted refresher keeps the boards the last one published, so an unchanged store is not
  // read: their files are linked into its own directory.
  const previous = parseSnapshot(readText(snapshotPath) ?? "");
  const inherited = new Map();
  for (const entry of previous.ok ? (previous.value.boards ?? []) : []) {
    boards.set(entry.path, { value: entry, startedAt: 0 });
    if (entry.ok && isRefresherToken(previous.value.token) && previous.value.token !== token) {
      inherited.set(entry.path, join(dir, BOARDS_DIR, previous.value.token, entry.file));
    }
  }
  const boardOf = (store, deadline) =>
    readBoard(
      store,
      boards.get(store.path)?.value,
      dir,
      token,
      writable,
      inherited.get(store.path),
      deadline,
    );
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
  /** The lease check before a write; `pause-ms` stalls between it and the write. */
  const writable = () => {
    if (!holds()) return false;
    stall(pauseMs);
    return true;
  };
  /**
   * Writes the snapshot from the newest reads into this refresher's own file, then, checking the
   * lease again, replaces `counts.json`; false once the lease is not held.
   */
  const publish = () => {
    if (!writable()) return false;
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
    const text = `${JSON.stringify(last)}\n`;
    writeWhole(ownPath, text, token);
    if (!holds()) return false;
    writeWhole(snapshotPath, text, token);
    dropOtherTokens(dir, token, Date.now(), staleMs, holds);
    return true;
  };
  /** Reads one store's counts, and its board when a pane reads it; false once the lease is lost. */
  const readStore = async (store, withBoard, deadline) => {
    const startedAt = Date.now();
    const counted = await countStore(store, windows, holds, deadline);
    if (counted === undefined) return false;
    keepNewer(counts, store.path, counted, startedAt);
    if (!withBoard) return holds();
    if (!holds()) return false;
    const entry = await boardOf(store, deadline);
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
      const text = `${JSON.stringify({ ...last, stoppedAt: Date.now() })}\n`;
      writeWhole(ownPath, text, token);
      if (lease.holds()) writeWhole(snapshotPath, text, token);
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
    // CONCURRENT_STORES stores at a time, every read ending by the deadline: then the snapshot
    // is written with what answered, and a store still unanswered is marked unread.
    const deadline = began + cycleMs;
    const reads = storeList.map((store) => () => {
      const withBoard = boardList.some((board) => samePath(board.path, store.path));
      return readStore(store, withBoard, deadline);
    });
    for (const store of boardList) {
      if (storeList.some((known) => samePath(known.path, store.path))) continue;
      reads.push(async () => {
        if (!holds()) return false;
        const entry = await boardOf(store, deadline);
        if (entry === undefined) return false;
        keepNewer(boards, store.path, entry, began);
        return true;
      });
    }
    if (!(await inTurn(reads, CONCURRENT_STORES))) return quit();
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
      const deadline = Date.now() + cycleMs;
      for (const path of paths) {
        // A session in a linked worktree names its own directory: its counts are its main
        // tree's entry, and its board its own.
        const board = boardList.find((known) => samePath(known.path, path));
        const store =
          storeList.find((known) => samePath(known.path, path)) ??
          (board === undefined ? undefined : storeList.find((known) => sameDatabase(known, board)));
        if (store !== undefined) {
          const withBoard = boardList.some((known) => samePath(known.path, store.path));
          if (!(await readStore(store, withBoard, deadline))) return quit();
        }
        if (board !== undefined && (store === undefined || !samePath(store.path, board.path))) {
          const startedAt = Date.now();
          if (!holds()) return quit();
          const entry = await boardOf(board, deadline);
          if (entry === undefined) return quit();
          keepNewer(boards, board.path, entry, startedAt);
        }
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
