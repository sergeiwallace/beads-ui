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

import {
  BEAT_MS,
  IDLE_EXIT_MS,
  LEASE_FILE,
  parseSessionEntry,
  RENEW_MS,
  SESSION_LIVE_MS,
  SESSIONS_DIR,
  SNAPSHOT_FILE,
  SNAPSHOT_SCHEMA,
  STALE_MS,
  storeReads,
  storeSnapshotOf,
} from "../core/src/snapshot.ts";
import { parseStoreInventory, STORE_INVENTORY_FILE } from "../core/src/views/band.ts";

const COUNT_TIMEOUT_MS = 8_000;
/** A registry file this old names a session long gone; the holder removes it. */
const REGISTRY_KEEP_MS = 86_400_000;

const NUMBER_FLAGS = ["beat-ms", "renew-ms", "stale-ms", "idle-ms"];

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

function count(store, argv) {
  return new Promise((resolve) => {
    execFile(
      argv[0],
      argv.slice(1),
      {
        cwd: store.path,
        timeout: COUNT_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
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
  const lease = new FileLease(dir, token, options["stale-ms"] ?? STALE_MS);
  if (!lease.acquire(Date.now())) return;

  const snapshotPath = join(dir, SNAPSHOT_FILE);
  let lastSeen = Date.now();
  let last = { schema: SNAPSHOT_SCHEMA, token, pid: process.pid, beatAt: lastSeen, stores: [] };
  let beatTimer;
  let renewTimer;
  let stopped = false;

  const quit = () => {
    stopped = true;
    clearTimeout(beatTimer);
    clearInterval(renewTimer);
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
    if (!lease.holds()) return quit();
    const sessions = liveSessions(dir, began, () => lease.holds());
    lastSeen = Math.max(lastSeen, ...sessions.map((session) => session.seenAt));
    if (began - lastSeen > idleMs) return stop();
    const windows = [...new Set(sessions.flatMap((session) => session.windows))];
    const stores = [];
    for (const store of storesToRead(options.home, sessions)) {
      if (!lease.holds()) return quit();
      const answers = [];
      for (const read of storeReads(windows, Date.now())) {
        answers.push({ key: read.key, ...(await count(store, read.argv)) });
      }
      stores.push(storeSnapshotOf(store, answers, Date.now()));
    }
    if (stopped || !lease.holds()) return quit();
    last = { schema: SNAPSHOT_SCHEMA, token, pid: process.pid, beatAt: Date.now(), stores };
    writeWhole(snapshotPath, `${JSON.stringify(last)}\n`, token);
    beatTimer = setTimeout(beat, Math.max(0, beatMs - (Date.now() - began)));
  };
  await beat();
}

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
