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
  symlinkSync,
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
if (args[0] === "vc") {
  const commit = fs.existsSync("head") ? fs.readFileSync("head", "utf8").trim() : "head-1";
  process.stdout.write(JSON.stringify({ branch: "main", commit, schema_version: 1 }) + "\\n");
  process.exit(0);
}
if (args[0] === "statuses") {
  process.stdout.write(JSON.stringify({ built_in_statuses: [{ name: "open", category: "active" }, { name: "closed", category: "done" }] }) + "\\n");
  process.exit(0);
}
if (args[0] === "list") {
  const at = new Date(Date.UTC(2026, 9, 1)).toISOString();
  const rows = issues.map((issue, i) => ({
    id: "S-" + i, title: issue.title ?? "issue " + i, status: issue.status, priority: 2,
    issue_type: "task", assignee: issue.assignee, owner: "someone@example.com",
    created_at: at, updated_at: at, created_by: "someone", dependency_count: 0,
    ...(issue.closedAt === undefined ? {} : { closed_at: new Date(issue.closedAt).toISOString() }),
    metadata: { display_id: "S-issue-" + i, other: "dropped" }, labels: ["id:S-issue-" + i],
  }));
  const closed = args.includes("closed");
  const limit = Number(args[args.indexOf("--limit") + 1]);
  const picked = closed
    ? rows.filter((row) => row.status === "closed").sort((a, b) => (a.closed_at < b.closed_at ? 1 : -1))
    : rows.filter((row) => row.status !== "closed");
  fs.writeSync(1, JSON.stringify(limit > 0 ? picked.slice(0, limit) : picked) + "\\n");
  process.exit(0);
}
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
  title?: string;
}

const scratch: string[] = [];
const started: number[] = [];

// Each refresher leads its own process group, its stub bd children with it: the whole group is
// ended, and its directory removed only once the refresher is gone.
afterEach(async () => {
  const pids = started.splice(0);
  for (const pid of pids) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  await until(() => (pids.some(alive) ? undefined : true));
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
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

function register(
  h: Host,
  id: string,
  extra: Partial<{
    seenAt: number;
    windows: string[];
    boards: { name: string; path: string; prefix?: string }[];
  }> = {},
) {
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
    const stat = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
    return !stat.stdout.trim().startsWith("Z");
  } catch {
    return false;
  }
};

async function until<T>(read: () => T | undefined, ms = 20_000): Promise<T> {
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

// Each test starts real Node processes, and a stub bd for every count: on a loaded host the first
// snapshot alone can take seconds, so the tests get room that does not depend on load.
describe("the host refresher", { timeout: 30_000 }, () => {
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

    // The holder's beat is written once, so it must stay live for as long as the launch takes:
    // under FAST's 1500 ms stale-ms a launch slower than that on a loaded host found it stale and
    // rightly took the lease over. A minute of stale-ms keeps it live whatever the load.
    const pid = launch(h, "token-loser111", [
      ...FAST.slice(0, 4),
      "--stale-ms",
      "60000",
      ...FAST.slice(6),
    ]);
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

  it("should take over, by default, the lease of a killed refresher once it is 50 seconds unrenewed and not before", async () => {
    const DEFAULT_STALE = ["--beat-ms", "300", "--renew-ms", "100", "--idle-ms", "4000"];
    const fresh = host(STORES);
    register(fresh, "aih-ec2-3");
    writeFileSync(
      join(fresh.state, "lease.json"),
      JSON.stringify({ token: "killed-refresher", pid: 1, beatAt: Date.now() - 40_000 }),
    );
    const refused = launch(fresh, "token-tooearly", DEFAULT_STALE);
    await until(() => (alive(refused) ? undefined : true));
    expect(lease(fresh).token).toBe("killed-refresher");

    const dead = host(STORES);
    register(dead, "aih-ec2-3");
    writeFileSync(
      join(dead.state, "lease.json"),
      JSON.stringify({ token: "killed-refresher", pid: 1, beatAt: Date.now() - 55_000 }),
    );
    launch(dead, "token-replaces", DEFAULT_STALE);
    const written = await until(() => snapshot(dead));

    expect(written.token).toBe("token-replaces");
    expect(lease(dead).token).toBe("token-replaces");
  });

  it("should stop reading and writing and exit, leaving the new holder's lease, when another refresher takes its lease while it is stopped", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3");
    const ousted = launch(h, "token-ousted11");
    await until(() => snapshot(h));

    // Stalled past the lease's staleness (1.5 s here), as swap or load stalls a real one.
    process.kill(ousted, "SIGSTOP");
    await new Promise((done) => setTimeout(done, 2_000));
    const holder = launch(h, "token-newhold1");
    await until(() => (lease(h)?.token === "token-newhold1" ? true : undefined));
    const held = lease(h);
    process.kill(ousted, "SIGCONT");
    await until(() => (alive(ousted) ? undefined : true));
    const fromOusted = () => calls(h).filter((call) => call.ppid === ousted).length;
    const before = fromOusted();
    await new Promise((done) => setTimeout(done, 700));

    expect(fromOusted()).toBe(before);
    expect(alive(holder)).toBe(true);
    expect(lease(h)?.token).toBe("token-newhold1");
    expect(lease(h)?.pid).toBe(held.pid);
    expect(existsSync(join(h.state, "lease-token-ousted11.json"))).toBe(false);
  });

  it("should leave a newer holder's lease alone when it is stopped on purpose after losing it", async () => {
    const h = host(STORES);
    register(h, "aih-ec2-3");
    const ousted = launch(h, "token-ousted22");
    await until(() => snapshot(h));

    process.kill(ousted, "SIGSTOP");
    await new Promise((done) => setTimeout(done, 2_000));
    launch(h, "token-newhold2");
    await until(() => (lease(h)?.token === "token-newhold2" ? true : undefined));
    // SIGTERM is queued while it is stopped, so it runs the stop path the moment it resumes.
    process.kill(ousted, "SIGTERM");
    process.kill(ousted, "SIGCONT");
    await until(() => (alive(ousted) ? undefined : true));

    expect(lease(h)?.token).toBe("token-newhold2");
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

  it("should count each database once when sessions reach it through a linked worktree or a symlinked path", async () => {
    const h = host(STORES);
    // A linked worktree of AIH: its own `.beads` directory, the same database (prefix AIH).
    const worktree = join(h.root, "AIH", ".worktrees", "aih-ec2-1");
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, "issues.json"), JSON.stringify(STORES.AIH));
    // The main tree through a symlinked parent, as `~/projects` links to `/data/projects`, from a
    // session whose bd named no prefix.
    const linked = join(h.root, "linked");
    symlinkSync(h.root, linked);
    writeFileSync(
      join(h.state, "sessions", "aih-ec2-1.json"),
      JSON.stringify({
        id: "aih-ec2-1",
        seenAt: Date.now(),
        windows: ["24h"],
        stores: [
          { name: "aih-ec2-1", path: worktree, prefix: "AIH" },
          { name: "AIH", path: join(linked, "AIH") },
        ],
      }),
    );

    launch(h, "token-dedupe01");
    const written = await until(() => snapshot(h));

    expect(written.stores.map((store: { path: string }) => store.path).sort()).toEqual(
      [join(h.root, "AIH"), join(h.root, "BU")].sort(),
    );
    expect(new Set(calls(h).map((call) => call.cwd))).toEqual(
      new Set([join(h.root, "AIH"), join(h.root, "BU")]),
    );
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

  describe("board snapshots (T-1B.4, T-1B.8)", () => {
    const boardOf = (h: Host, store: string) =>
      readJson(
        join(h.state, "boards", `${join(h.root, store).replace(/[^A-Za-z0-9._-]/g, "_")}.json`),
      );
    const entryOf = (h: Host, store: string) =>
      snapshot(h)?.boards?.find((entry: { path: string }) => entry.path === join(h.root, store));
    const lists = (h: Host) => calls(h).filter((call) => call.args[0] === "list");
    const closedAt = (n: number) => Date.now() - n * HOUR;
    const MANY: Record<string, Issue[]> = {
      AIH: [
        { status: "open", assignee: "aih-ec2-3" },
        { status: "in_progress" },
        ...Array.from({ length: 40 }, (_, i) => ({ status: "closed", closedAt: closedAt(i + 1) })),
      ],
      BU: [{ status: "open" }],
    };

    it("should keep a board of the drawn fields for each store a pane reads: the open issues and the newest closed page", async () => {
      const h = host(MANY);
      register(h, "aih-ec2-3", { boards: [{ name: "AIH", path: join(h.root, "AIH") }] });

      launch(h, "token-boards11");
      const entry = await until(() => entryOf(h, "AIH"));
      const board = boardOf(h, "AIH");

      expect(entry).toMatchObject({ ok: true, head: "head-1", file: expect.any(String) });
      expect(board.head).toBe("head-1");
      expect(board.statuses).toEqual({
        built_in_statuses: [
          { name: "open", category: "active" },
          { name: "closed", category: "done" },
        ],
      });
      const statuses = board.issues.map((row: { status: string }) => row.status);
      expect(statuses.filter((status: string) => status !== "closed")).toEqual([
        "open",
        "in_progress",
      ]);
      // 40 closed in the store, 25 drawn: the newest first.
      const closed = board.issues.filter((row: { status: string }) => row.status === "closed");
      expect(closed).toHaveLength(25);
      expect(closed[0].closed_at > closed[24].closed_at).toBe(true);
      expect(Object.keys(board.issues[0]).sort()).toEqual(
        [
          "assignee",
          "created_at",
          "id",
          "issue_type",
          "labels",
          "metadata",
          "priority",
          "status",
          "title",
          "updated_at",
        ].sort(),
      );
      expect(board.issues[0].metadata).toEqual({ display_id: "S-issue-0" });
      // BU has no pane reading it: counted, but no board kept.
      expect(entryOf(h, "BU")).toBeUndefined();
      expect(
        lists(h).some((call) => call.args.includes("--all")),
        "no read of every closed issue",
      ).toBe(false);
    });

    it("should not re-read a store's issues while its head has not moved, and re-read them once it moves", async () => {
      const h = host(MANY);
      register(h, "aih-ec2-3", { boards: [{ name: "AIH", path: join(h.root, "AIH") }] });

      // The session registers once, so FAST's 4-second idle exit would stop the refresher before
      // the head moves on a loaded host; a minute keeps it beating for the whole case.
      launch(h, "token-unchang1", [...FAST.slice(0, 6), "--idle-ms", "60000"]);
      await until(() => entryOf(h, "AIH"));
      const heads = () => calls(h).filter((call) => call.args[0] === "vc").length;
      await until(() => (heads() >= 3 ? true : undefined));

      // Three beats, one head each, and the issues read at the first only.
      expect(lists(h)).toHaveLength(2);
      const first = entryOf(h, "AIH");
      expect(first.checkedAt).toBeGreaterThanOrEqual(first.readAt);

      writeFileSync(join(h.root, "AIH", "head"), "head-2");
      const moved = await until(() => (entryOf(h, "AIH")?.head === "head-2" ? true : undefined));

      expect(moved).toBe(true);
      expect(lists(h)).toHaveLength(4);
      expect(boardOf(h, "AIH").head).toBe("head-2");
    });

    it("should write no board and name the store when its snapshot would pass 4 MiB", async () => {
      const long = "x".repeat(5_000);
      const h = host({
        AIH: Array.from({ length: 1_000 }, () => ({ status: "open", title: long })),
      });
      register(h, "aih-ec2-3", { boards: [{ name: "AIH", path: join(h.root, "AIH") }] });

      launch(h, "token-toobig11");
      const entry = await until(() => entryOf(h, "AIH"));

      expect(entry.ok).toBe(false);
      expect(entry.error).toMatch(
        /^its board snapshot would be 5\.\d MiB, past the 4 MiB a session can read; the pane reads this store itself$/,
      );
      expect(boardOf(h, "AIH")).toBeUndefined();
    });

    it("should read a store again within a few seconds of a session's wake marker, not at the next beat", async () => {
      const h = host(STORES);
      register(h, "aih-ec2-3", { boards: [{ name: "AIH", path: join(h.root, "AIH") }] });
      // The default minute beat: only the marker can bring a read sooner.
      launch(h, "token-wakeup11", ["--renew-ms", "100", "--idle-ms", "60000"]);
      await until(() => entryOf(h, "AIH"));

      writeFileSync(
        join(h.root, "AIH", "issues.json"),
        JSON.stringify([...(STORES.AIH ?? []), { status: "open", assignee: "aih-ec2-3" }]),
      );
      writeFileSync(join(h.root, "AIH", "head"), "head-2");
      const wrote = Date.now();
      writeFileSync(
        join(h.state, "wake", "_marker.json"),
        JSON.stringify({ path: join(h.root, "AIH"), at: wrote }),
      );
      await until(() => (entryOf(h, "AIH")?.head === "head-2" ? true : undefined));
      const took = Date.now() - wrote;

      expect(took).toBeLessThan(10_000);
      const aih = snapshot(h).stores.find((store: { name: string }) => store.name === "AIH");
      expect(aih.statuses.open).toEqual({ "aih-ec2-3": 2 });
      expect(existsSync(join(h.state, "wake", "_marker.json"))).toBe(false);
      // BU was not woken: its counts are still the first beat's.
      expect(calls(h).filter((call) => call.cwd === join(h.root, "BU"))).toHaveLength(4);
    });

    it("should read the main tree's counts and the worktree's board again on a wake marker from a linked worktree", async () => {
      const h = host(STORES);
      const tree = join(h.root, "AIH", ".worktrees", "aih-ec2-3");
      mkdirSync(tree, { recursive: true });
      writeFileSync(join(tree, "issues.json"), JSON.stringify(STORES.AIH));
      register(h, "aih-ec2-3", { boards: [{ name: "aih-ec2-3", path: tree, prefix: "AIH" }] });
      launch(h, "token-wakeup22", ["--renew-ms", "100", "--idle-ms", "60000"]);
      await until(() =>
        snapshot(h)?.boards?.find((entry: { path: string }) => entry.path === tree),
      );

      const more = JSON.stringify([
        ...(STORES.AIH ?? []),
        { status: "open", assignee: "aih-ec2-3" },
      ]);
      for (const dir of [join(h.root, "AIH"), tree]) {
        writeFileSync(join(dir, "issues.json"), more);
        writeFileSync(join(dir, "head"), "head-2");
      }
      writeFileSync(
        join(h.state, "wake", "_marker.json"),
        JSON.stringify({ path: tree, at: Date.now() }),
      );
      await until(() =>
        snapshot(h)?.boards?.find(
          (entry: { path: string; head: string }) => entry.path === tree && entry.head === "head-2",
        ),
      );
      const aih = await until(() => {
        const store = snapshot(h).stores.find(
          (one: { path: string }) => one.path === join(h.root, "AIH"),
        );
        return store?.statuses?.open?.["aih-ec2-3"] === 2 ? store : undefined;
      });

      expect(aih.statuses.open).toEqual({ "aih-ec2-3": 2 });
      expect(snapshot(h).stores.map((store: { path: string }) => store.path)).not.toContain(tree);
    });
  });

  it("should refuse to start without a state directory, a home and a token", () => {
    const ran = spawnSync(process.execPath, [REFRESHER, "start", "--home", "/tmp"], {
      encoding: "utf8",
    });

    expect(ran.status).toBe(2);
    expect(ran.stderr).toBe("beads-ui refresher: --state-dir is required\n");
  });
});
