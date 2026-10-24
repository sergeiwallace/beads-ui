// Runners: Vitest only. It starts the host refresher (refresher/refresher.mjs) as a real Node
// process against a stub `bd` in a temporary directory, which the mod environment cannot.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const REFRESHER = resolve(import.meta.dirname, "../refresher/refresher.mjs");
const FAST = ["--beat-ms", "300", "--renew-ms", "100", "--stale-ms", "1500", "--idle-ms", "4000"];

// A stub bd: it logs each call with the directory it ran in and the process that ran it, fails when the store directory holds
// a `fail` file, and answers `bd count --by-assignee` from the store's `issues.json`.
const STUB = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ cwd: process.cwd(), args, ppid: process.ppid }) + "\\n");
if (fs.existsSync("fail")) { process.stderr.write("Error: database is locked\\n"); process.exit(1); }
const issues = JSON.parse(fs.readFileSync("issues.json", "utf8"));
const flag = (name) => args.find((arg) => arg.startsWith(name + "="))?.slice(name.length + 1);
const status = flag("--status");
const after = flag("--closed-after");
const by = {};
for (const issue of issues) {
  if (status !== undefined && issue.status !== status) continue;
  if (after !== undefined && !(issue.closedAt > Date.parse(after))) continue;
  const group = issue.assignee ?? "(unassigned)";
  by[group] = (by[group] ?? 0) + 1;
}
const groups = Object.keys(by).sort().map((group) => ({ count: by[group], group }));
process.stdout.write(JSON.stringify({ groups, schema_version: 1, total: issues.length }) + "\\n");
`;

interface Issue {
  status: string;
  assignee?: string;
  closedAt?: number;
}

const scratch: string[] = [];
const started: number[] = [];

afterEach(() => {
  for (const pid of started.splice(0)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A home with a store inventory over `stores`, a state directory and a stub bd on the PATH. */
function host(stores: Record<string, Issue[]>, unsynced: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "beads-ui-refresher-"));
  scratch.push(root);
  const home = join(root, "home");
  const state = join(root, "state");
  const bin = join(root, "bin");
  mkdirSync(join(home, ".beads/shared-server"), { recursive: true });
  mkdirSync(join(state, "sessions"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(bin, "bd"), STUB);
  chmodSync(join(bin, "bd"), 0o755);
  const entries: Record<string, unknown> = {};
  for (const [name, issues] of Object.entries(stores)) {
    const repo = join(root, name);
    mkdirSync(repo);
    writeFileSync(join(repo, "issues.json"), JSON.stringify(issues));
    entries[name] = {
      repo,
      attestation: {
        verdict: "shared",
        sync_state: unsynced.includes(name) ? "local_ahead" : "converged",
      },
    };
  }
  writeFileSync(
    join(home, ".beads/shared-server/publish-sweep.json"),
    JSON.stringify({ schema: 1, stores: entries, skipped: [] }),
  );
  const log = join(root, "bd.log");
  writeFileSync(log, "");
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, STUB_LOG: log };
  return { root, home, state, log, env };
}

type Host = ReturnType<typeof host>;

function register(h: Host, id: string, extra: Partial<{ seenAt: number; windows: string[] }> = {}) {
  const entry = { id, seenAt: Date.now(), windows: ["24h"], stores: [], ...extra };
  writeFileSync(join(h.state, "sessions", `${id}.json`), JSON.stringify(entry));
}

/** Runs the launcher as a session's mod does; resolves the refresher's pid. */
function launch(h: Host, token: string, more: string[] = FAST): number {
  const ran = spawnSync(
    process.execPath,
    [REFRESHER, "start", "--state-dir", h.state, "--home", h.home, "--token", token, ...more],
    { env: h.env, encoding: "utf8" },
  );
  expect(ran.status, ran.stderr).toBe(0);
  const { pid } = JSON.parse(ran.stdout) as { pid: number };
  started.push(pid);
  return pid;
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" })
      .stdout.trim()
      .startsWith("Z")
      ? false
      : true;
  } catch {
    return false;
  }
};

async function until<T>(read: () => T | undefined, ms = 8_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((done) => setTimeout(done, 50));
  }
}

const readJson = (path: string) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
};
const snapshot = (h: Host) => readJson(join(h.state, "counts.json"));
const lease = (h: Host) => readJson(join(h.state, "lease.json"));
const calls = (h: Host) =>
  readFileSync(h.log, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { cwd: string; args: string[]; ppid: number });

const HOUR = 3_600_000;
const STORES: Record<string, Issue[]> = {
  AIH: [
    { status: "open", assignee: "aih-ec2-3" },
    { status: "in_progress", assignee: "aih-ec2-firstmate-1" },
    { status: "closed", assignee: "aih-ec2-3", closedAt: Date.now() - HOUR },
    { status: "closed", assignee: "aih-ec2-3", closedAt: Date.now() - 72 * HOUR },
  ],
  BU: [{ status: "blocked", assignee: "aih-ec2-3" }, { status: "open" }],
};

describe("the host refresher", () => {
  it("should start detached in its own process group and write every store's counts by owner with a heartbeat", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3");

    const pid = launch(h, "token-aaaaaaaa");
    const written = await until(() => snapshot(h));

    const pgid = spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" });
    expect(pgid.stdout.trim()).toBe(String(pid));
    expect(written.token).toBe("token-aaaaaaaa");
    expect(written.pid).toBe(pid);
    expect(Math.abs(Date.now() - written.beatAt)).toBeLessThan(5_000);
    const aih = written.stores.find((store: { name: string }) => store.name === "AIH");
    expect(aih).toMatchObject({
      ok: true,
      statuses: {
        open: { "aih-ec2-3": 1 },
        in_progress: { "aih-ec2-firstmate-1": 1 },
        blocked: {},
      },
      done: { "24h": { "aih-ec2-3": 1 } },
    });
    expect(lease(h)).toMatchObject({ token: "token-aaaaaaaa", pid });
  });

  it("should leave exactly one refresher holding the lease when two start at the same moment", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3");

    const pids = [launch(h, "token-first111"), launch(h, "token-second22")];
    await until(() => snapshot(h));
    await until(() => (pids.filter(alive).length === 1 ? true : undefined));

    const holder = lease(h);
    const winner = pids.find(alive);
    expect(holder.pid).toBe(winner);
    expect(snapshot(h).pid).toBe(winner);
    // Only the holder ran bd: the stub logs the process that started it.
    expect(new Set(calls(h).map((call) => call.ppid))).toEqual(new Set([winner]));
  });

  it("should start nothing and read nothing when a live refresher holds the lease", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3");
    writeFileSync(
      join(h.state, "lease.json"),
      JSON.stringify({ token: "someone-else1", pid: 1, beatAt: Date.now() }),
    );

    const pid = launch(h, "token-loser111");
    await until(() => (alive(pid) ? undefined : true));

    expect(calls(h)).toEqual([]);
    expect(snapshot(h)).toBeUndefined();
    expect(lease(h).token).toBe("someone-else1");
  });

  it("should take over a lease whose heartbeat is stale", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3");
    writeFileSync(
      join(h.state, "lease.json"),
      JSON.stringify({ token: "gone-refresher", pid: 1, beatAt: Date.now() - 60_000 }),
    );

    launch(h, "token-takeover");
    const written = await until(() => snapshot(h));

    expect(written.token).toBe("token-takeover");
    expect(lease(h).token).toBe("token-takeover");
  });

  it("should stop reading and writing and exit when another refresher takes its lease", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3");
    const pid = launch(h, "token-ousted11");
    await until(() => snapshot(h));

    writeFileSync(
      join(h.state, "lease.json"),
      JSON.stringify({ token: "new-holder111", pid: 1, beatAt: Date.now() }),
    );
    await until(() => (alive(pid) ? undefined : true));
    const before = calls(h).length;
    const last = snapshot(h);
    await new Promise((done) => setTimeout(done, 700));

    expect(calls(h).length).toBe(before);
    expect(snapshot(h)).toEqual(last);
    expect(lease(h).token).toBe("new-holder111");
  });

  it("should run the same bd calls a beat whatever the number of sessions, and count their windows and stores", async () => {
    const h = host(STORES);
    const extra = join(h.root, "kg-store");
    mkdirSync(extra);
    writeFileSync(
      join(extra, "issues.json"),
      JSON.stringify([{ status: "open", assignee: "kg-ec2-3" }]),
    );
    register(h, "aih-ec2-3");
    register(h, "aih-ec2-firstmate-1", { windows: ["24h", "7d"] });
    writeFileSync(
      join(h.state, "sessions", "kg-ec2-3.json"),
      JSON.stringify({
        id: "kg-ec2-3",
        seenAt: Date.now(),
        windows: ["24h"],
        stores: [{ name: "kg-store", path: extra }],
      }),
    );
    register(h, "closed-long-ago", { seenAt: Date.now() - 10 * 60_000, windows: ["90m"] });

    launch(h, "token-counting");
    const written = await until(() => snapshot(h));

    // Three stores, three statuses and two windows: 15 calls, none per session.
    const first = calls(h).slice(0, 15);
    expect(first).toHaveLength(15);
    expect(new Set(first.map((call) => call.cwd)).size).toBe(3);
    expect(first.every((call) => call.args.includes("--by-assignee"))).toBe(true);
    expect(first.some((call) => call.args.some((arg) => arg.startsWith("--assignee")))).toBe(false);
    const aih = written.stores.find((store: { name: string }) => store.name === "AIH");
    expect(aih.done).toEqual({ "24h": { "aih-ec2-3": 1 }, "7d": { "aih-ec2-3": 2 } });
    expect(
      written.stores.find((store: { name: string }) => store.name === "kg-store"),
    ).toMatchObject({ ok: true, statuses: { open: { "kg-ec2-3": 1 } } });
  });

  it("should name a store that cannot be read and still count the rest", async () => {
    const h = host(STORES);
    writeFileSync(join(h.root, "BU", "fail"), "");
    register(h, "aih-ec2-3");

    launch(h, "token-partial1");
    const written = await until(() => snapshot(h));

    expect(written.stores.find((store: { name: string }) => store.name === "BU")).toMatchObject({
      ok: false,
      error: "exit 1, Error: database is locked",
    });
    expect(written.stores.find((store: { name: string }) => store.name === "AIH").ok).toBe(true);
  });

  it("should beat once a minute by default, no sooner", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3");

    launch(h, "token-cadence1", []);
    await until(() => snapshot(h));
    await new Promise((done) => setTimeout(done, 1_500));

    expect(calls(h)).toHaveLength(8);
  });

  it("should mark the snapshot stopped and release the lease when no session has registered for a while", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3", { seenAt: Date.now() - 10 * 60_000 });

    const pid = launch(h, "token-idle1111", [...FAST.slice(0, 6), "--idle-ms", "500"]);
    await until(() => (alive(pid) ? undefined : true));

    expect(snapshot(h).stoppedAt).toEqual(expect.any(Number));
    expect(existsSync(join(h.state, "lease.json"))).toBe(false);
  });

  it("should mark the snapshot stopped and release the lease when it is sent SIGTERM", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3");
    const pid = launch(h, "token-sigterm1");
    await until(() => snapshot(h));

    process.kill(pid, "SIGTERM");
    await until(() => (alive(pid) ? undefined : true));

    expect(snapshot(h).stoppedAt).toEqual(expect.any(Number));
    expect(existsSync(join(h.state, "lease.json"))).toBe(false);
  });

  it("should refuse to start without a state directory, a home and a token", () => {
    const ran = spawnSync(process.execPath, [REFRESHER, "start", "--home", "/tmp"], {
      encoding: "utf8",
    });

    expect(ran.status).toBe(2);
    expect(ran.stderr).toBe("beads-ui refresher: --state-dir is required\n");
  });
});
