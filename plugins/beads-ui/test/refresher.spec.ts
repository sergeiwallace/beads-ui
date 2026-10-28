// Runners: Vitest only. It starts the host refresher (refresher/refresher.mjs) as a real Node
// process against a stub `bd` in a temporary directory, which the mod environment cannot.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
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
/** The build this plugin's manifest names, which the refresher records in its lease. */
const BUILD: string = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../.claude-plugin/plugin.json"), "utf8"),
).version;
const FAST = ["--beat-ms", "300", "--renew-ms", "100", "--stale-ms", "1500", "--idle-ms", "4000"];
/** FAST, but a lease stays live for a minute and so does an idle refresher: only a build ousts. */
const LIVE_HOLDER = [...FAST.slice(0, 4), "--stale-ms", "60000", "--idle-ms", "60000"];

// A stub bd: it logs each call with the directory it ran in and the process that ran it, fails when the store directory holds
// a `fail` file, never answers when it holds a `hang` file, and answers `bd count --by-assignee`
// from the store's `issues.json`.
const STUB = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ cwd: process.cwd(), args, ppid: process.ppid }) + "\\n");
if (fs.existsSync("fail")) { process.stderr.write("Error: database is locked\\n"); process.exit(1); }
if (fs.existsSync("hang")) { setInterval(() => {}, 1000); return; }
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
    issue_type: "task", assignee: issue.assignee, parent: issue.parent, owner: "someone@example.com",
    created_at: at, updated_at: at, created_by: "someone", dependency_count: 0,
    ...(issue.closedAt === undefined ? {} : { closed_at: new Date(issue.closedAt).toISOString() }),
    metadata: { display_id: "S-issue-" + i, other: "dropped" }, labels: ["id:S-issue-" + i],
  }));
  const closed = args.includes("closed");
  const limit = Number(args[args.indexOf("--limit") + 1]);
  const ids = args.find((arg) => arg.startsWith("--id="))?.slice(5).split(",");
  const labels = args.find((arg) => arg.startsWith("--label-any="))?.slice(12).split(",");
  const picked = ids !== undefined
    ? rows.filter((row) => ids.includes(row.id))
    : labels !== undefined
      ? rows.filter((row) => row.labels.some((label) => labels.includes(label)))
      : closed
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
  parent?: string;
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
function launch(h: Host, token: string, more: string[] = FAST, refresher = REFRESHER): number {
  const ran = spawnSync(
    process.execPath,
    [refresher, "start", "--state-dir", h.state, "--home", h.home, "--token", token, ...more],
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
/** The snapshot a session takes as current: the one of the token `lease.json` names. */
const current = (h: Host) => {
  const token = lease(h)?.token;
  return typeof token === "string" ? readJson(join(h.state, `counts-${token}.json`)) : undefined;
};
const calls = (h: Host) =>
  readFileSync(h.log, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { cwd: string; args: string[]; ppid: number });

const HOUR = 3_600_000;
const STORES: Record<string, Issue[]> = {
  OPS: [
    { status: "open", assignee: "ops-vm-3" },
    { status: "in_progress", assignee: "ops-vm-firstmate-1" },
    { status: "closed", assignee: "ops-vm-3", closedAt: Date.now() - HOUR },
    { status: "closed", assignee: "ops-vm-3", closedAt: Date.now() - 72 * HOUR },
  ],
  BU: [{ status: "blocked", assignee: "ops-vm-3" }, { status: "open" }],
};

// Each test starts real Node processes, and a stub bd for every count: on a loaded host the first
// snapshot alone can take seconds, so the tests get room that does not depend on load.
describe("the host refresher", { timeout: 30_000 }, () => {
  it("should start detached in its own process group and write every store's counts by owner with a heartbeat", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3");

    const pid = launch(h, "token-aaaaaaaa");
    const written = await until(() => snapshot(h));

    const pgid = spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" });
    expect(pgid.stdout.trim()).toBe(String(pid));
    expect(written.token).toBe("token-aaaaaaaa");
    expect(written.pid).toBe(pid);
    expect(Math.abs(Date.now() - written.beatAt)).toBeLessThan(5_000);
    const ops = written.stores.find((store: { name: string }) => store.name === "OPS");
    expect(ops).toMatchObject({
      ok: true,
      statuses: {
        open: { "ops-vm-3": 1 },
        in_progress: { "ops-vm-firstmate-1": 1 },
        blocked: {},
      },
      done: { "24h": { "ops-vm-3": 1 } },
    });
    expect(lease(h)).toMatchObject({ token: "token-aaaaaaaa", pid });
  });

  it("should leave exactly one refresher holding the lease when two start at the same moment", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3");

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

  for (const held of [BUILD, "999.0.0"]) {
    it(`should start nothing and read nothing when a live refresher of build ${held === BUILD ? "its own" : held} holds the lease`, async () => {
      const h = host(STORES);
      register(h, "ops-vm-3");
      writeFileSync(
        join(h.state, "lease.json"),
        JSON.stringify({ token: "someone-else1", pid: 1, beatAt: Date.now(), version: held }),
      );

      // The holder's beat is written once, so it must stay live for as long as the launch takes:
      // under FAST's 1500 ms stale-ms a launch slower than that on a loaded host found it stale
      // and rightly took the lease over. A minute of stale-ms keeps it live whatever the load.
      const pid = launch(h, "token-loser111", LIVE_HOLDER);
      await until(() => (alive(pid) ? undefined : true));

      expect(calls(h)).toEqual([]);
      expect(snapshot(h)).toBeUndefined();
      expect(existsSync(join(h.state, "counts-token-loser111.json"))).toBe(false);
      expect(lease(h).token).toBe("someone-else1");
    });
  }

  // BU-4af: a refresher from an older build kept its lease across a plugin upgrade, so sessions
  // of the newer build found no snapshot they read and counted every store themselves. Builds
  // before 0.9.2 write only counts.json; builds before 0.9.4 record no build in their lease.
  it("should take over the live lease of an older build's refresher, its last snapshot current under the new token from the moment the lease names it", async () => {
    const h = host({ ...STORES, HUNG: [{ status: "open" }] });
    writeFileSync(join(h.root, "HUNG", "hang"), "");
    register(h, "ops-vm-3");
    const beatAt = Date.now() - 5_000;
    const old = {
      schema: 1,
      token: "old-build-token1",
      pid: 1,
      beatAt,
      stores: [{ path: join(h.root, "OPS"), name: "OPS", ok: false, readAt: beatAt, error: "x" }],
    };
    writeFileSync(join(h.state, "counts.json"), JSON.stringify(old));
    writeFileSync(
      join(h.state, "lease.json"),
      JSON.stringify({ token: "old-build-token1", pid: 1, beatAt: Date.now() }),
    );

    // The hung store holds the new refresher's first snapshot back to its 3-second deadline, so
    // what is current the moment it takes the lease is what it wrote before taking it.
    const pid = launch(h, "token-newbuild", [...LIVE_HOLDER, "--cycle-ms", "3000"]);
    await until(() => (lease(h)?.token === "token-newbuild" || !alive(pid) ? true : undefined));

    expect(lease(h)).toMatchObject({ token: "token-newbuild", pid, version: BUILD });
    expect(current(h)).toMatchObject({ token: "token-newbuild", pid, beatAt, stores: old.stores });
    expect(current(h).stoppedAt).toBeUndefined();
  });

  it("should leave an older build's refresher no lease, so it stops reading and exits, once a newer build's refresher starts", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3");
    // The older build: this refresher with no manifest beside it, so its lease records no build,
    // as every build before 0.9.4 wrote it.
    const older = join(h.root, "older-plugin");
    cpSync(resolve(import.meta.dirname, "../refresher"), join(older, "refresher"), {
      recursive: true,
    });
    cpSync(resolve(import.meta.dirname, "../core/src"), join(older, "core/src"), {
      recursive: true,
    });
    writeFileSync(join(older, "package.json"), '{"type":"module"}\n');
    const ousted = launch(h, "token-olderbld", LIVE_HOLDER, join(older, "refresher/refresher.mjs"));
    await until(() => current(h));
    expect(lease(h)).toMatchObject({ token: "token-olderbld" });
    expect(lease(h).version).toBeUndefined();

    const holder = launch(h, "token-newerbld", LIVE_HOLDER);
    await until(() => (lease(h)?.token === "token-newerbld" || !alive(holder) ? true : undefined));
    expect(lease(h)).toMatchObject({ token: "token-newerbld", version: BUILD });
    await until(() => (alive(ousted) ? undefined : true));
    const fromOusted = () => calls(h).filter((call) => call.ppid === ousted).length;
    const before = fromOusted();
    await new Promise((done) => setTimeout(done, 700));

    expect(fromOusted()).toBe(before);
    expect(alive(holder)).toBe(true);
    expect(lease(h)?.token).toBe("token-newerbld");
    await until(() => (current(h)?.token === "token-newerbld" ? true : undefined));
  });

  it("should take over a lease whose heartbeat is stale", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3");
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
    register(fresh, "ops-vm-3");
    writeFileSync(
      join(fresh.state, "lease.json"),
      JSON.stringify({
        token: "killed-refresher",
        pid: 1,
        beatAt: Date.now() - 40_000,
        version: BUILD,
      }),
    );
    const refused = launch(fresh, "token-tooearly", DEFAULT_STALE);
    await until(() => (alive(refused) ? undefined : true));
    expect(lease(fresh).token).toBe("killed-refresher");

    const dead = host(STORES);
    register(dead, "ops-vm-3");
    writeFileSync(
      join(dead.state, "lease.json"),
      JSON.stringify({
        token: "killed-refresher",
        pid: 1,
        beatAt: Date.now() - 55_000,
        version: BUILD,
      }),
    );
    launch(dead, "token-replaces", DEFAULT_STALE);
    const written = await until(() => snapshot(dead));

    expect(written.token).toBe("token-replaces");
    expect(lease(dead).token).toBe("token-replaces");
  });

  it("should stop reading and writing and exit, leaving the new holder's lease, when another refresher takes its lease while it is stopped", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3");
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

  it("should leave the new holder's snapshot as the current one when it was stalled between its lease check and its write", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3");
    // The session registers once, so FAST's 4-second idle exit could stop the new holder before
    // the stalled one wakes on a loaded host; a minute keeps both running for the whole case.
    const running = [...FAST.slice(0, 6), "--idle-ms", "60000"];
    // The first refresher stalls after the lease check before each snapshot write, its renewals
    // with it, for longer than the lease's staleness (1.5 s here).
    const ousted = launch(h, "token-stalled1", [...running, "--pause-ms", "6000"]);
    await until(() =>
      lease(h)?.token === "token-stalled1" && Date.now() - lease(h).beatAt > 1_800
        ? true
        : undefined,
    );

    launch(h, "token-holder01", running);
    await until(() =>
      lease(h)?.token === "token-holder01" && snapshot(h)?.token === "token-holder01"
        ? true
        : undefined,
    );
    // The stalled refresher wakes, writes and finds itself ousted.
    await until(() => (alive(ousted) ? undefined : true));

    expect(lease(h)?.token).toBe("token-holder01");
    expect(snapshot(h)?.token).toBe("token-holder01");
    expect(current(h)?.token).toBe("token-holder01");
  });

  it("should leave a newer holder's lease alone when it is stopped on purpose after losing it", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3");
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
    const extra = join(h.root, "qa-store");
    mkdirSync(extra);
    writeFileSync(
      join(extra, "issues.json"),
      JSON.stringify([{ status: "open", assignee: "qa-vm-3" }]),
    );
    register(h, "ops-vm-3");
    register(h, "ops-vm-firstmate-1", { windows: ["24h", "7d"] });
    writeFileSync(
      join(h.state, "sessions", "qa-vm-3.json"),
      JSON.stringify({
        id: "qa-vm-3",
        seenAt: Date.now(),
        windows: ["24h"],
        stores: [{ name: "qa-store", path: extra }],
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
    const ops = written.stores.find((store: { name: string }) => store.name === "OPS");
    expect(ops.done).toEqual({ "24h": { "ops-vm-3": 1 }, "7d": { "ops-vm-3": 2 } });
    expect(
      written.stores.find((store: { name: string }) => store.name === "qa-store"),
    ).toMatchObject({ ok: true, statuses: { open: { "qa-vm-3": 1 } } });
    // D-42: the sessions registered live, which the agent indicator dims by; not the closed one.
    expect(written.sessions).toEqual(["ops-vm-3", "ops-vm-firstmate-1", "qa-vm-3"]);
  });

  it("should name a store that cannot be read and still count the rest", async () => {
    const h = host(STORES);
    writeFileSync(join(h.root, "BU", "fail"), "");
    register(h, "ops-vm-3");

    launch(h, "token-partial1");
    const written = await until(() => snapshot(h));

    expect(written.stores.find((store: { name: string }) => store.name === "BU")).toMatchObject({
      ok: false,
      error: "exit 1, Error: database is locked",
    });
    expect(written.stores.find((store: { name: string }) => store.name === "OPS").ok).toBe(true);
  });

  it("should write the snapshot by the beat's deadline with the stores that answered, a store that hangs marked unread", async () => {
    const h = host({
      ...STORES,
      QA: [{ status: "open", assignee: "qa-vm-1" }],
      WS: [{ status: "open", assignee: "qa-vm-2" }],
      HUNG: [{ status: "open" }],
    });
    writeFileSync(join(h.root, "HUNG", "hang"), "");
    register(h, "ops-vm-3");

    const launched = Date.now();
    // A 3-second deadline. Read one after another, the hung store's four reads would wait out
    // 8 seconds each before the first snapshot; the bound leaves room for a loaded host's launch.
    launch(h, "token-deadline", [...FAST, "--cycle-ms", "3000"]);
    const written = await until(() => snapshot(h));

    expect(written.beatAt - launched).toBeLessThan(12_000);
    const byName = (name: string) =>
      written.stores.find((store: { name: string }) => store.name === name);
    expect(byName("HUNG")).toMatchObject({
      ok: false,
      error: "not read before the beat's deadline",
    });
    for (const name of ["OPS", "BU", "QA", "WS"]) expect(byName(name)?.ok).toBe(true);
  });

  it("should count each database once when sessions reach it through a linked worktree or a symlinked path", async () => {
    const h = host(STORES);
    // A linked worktree of OPS: its own `.beads` directory, the same database (prefix OPS).
    const worktree = join(h.root, "OPS", ".worktrees", "ops-vm-1");
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, "issues.json"), JSON.stringify(STORES.OPS));
    // The main tree through a symlinked parent, as `~/projects` links to `/data/projects`, from a
    // session whose bd named no prefix.
    const linked = join(h.root, "linked");
    symlinkSync(h.root, linked);
    writeFileSync(
      join(h.state, "sessions", "ops-vm-1.json"),
      JSON.stringify({
        id: "ops-vm-1",
        seenAt: Date.now(),
        windows: ["24h"],
        stores: [
          { name: "ops-vm-1", path: worktree, prefix: "OPS" },
          { name: "OPS", path: join(linked, "OPS") },
        ],
      }),
    );

    launch(h, "token-dedupe01");
    const written = await until(() => snapshot(h));

    expect(written.stores.map((store: { path: string }) => store.path).sort()).toEqual(
      [join(h.root, "OPS"), join(h.root, "BU")].sort(),
    );
    expect(new Set(calls(h).map((call) => call.cwd))).toEqual(
      new Set([join(h.root, "OPS"), join(h.root, "BU")]),
    );
  });

  it("should beat once a minute by default, no sooner", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3");

    launch(h, "token-cadence1", []);
    await until(() => snapshot(h));
    await new Promise((done) => setTimeout(done, 1_500));

    expect(calls(h)).toHaveLength(8);
  });

  it("should mark the snapshot stopped and release the lease when no session has registered for a while", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3", { seenAt: Date.now() - 10 * 60_000 });

    const pid = launch(h, "token-idle1111", [...FAST.slice(0, 6), "--idle-ms", "500"]);
    await until(() => (alive(pid) ? undefined : true));

    expect(snapshot(h).stoppedAt).toEqual(expect.any(Number));
    expect(existsSync(join(h.state, "lease.json"))).toBe(false);
  });

  it("should mark the snapshot stopped and release the lease when it is sent SIGTERM", async () => {
    const h = host(STORES);
    register(h, "ops-vm-3");
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
        join(
          h.state,
          "boards",
          String(snapshot(h)?.token),
          `${join(h.root, store).replace(/[^A-Za-z0-9._-]/g, "_")}.json`,
        ),
      );
    const entryOf = (h: Host, store: string) =>
      snapshot(h)?.boards?.find((entry: { path: string }) => entry.path === join(h.root, store));
    const lists = (h: Host) => calls(h).filter((call) => call.args[0] === "list");
    const closedAt = (n: number) => Date.now() - n * HOUR;
    const MANY: Record<string, Issue[]> = {
      OPS: [
        { status: "open", assignee: "ops-vm-3" },
        { status: "in_progress" },
        ...Array.from({ length: 40 }, (_, i) => ({ status: "closed", closedAt: closedAt(i + 1) })),
      ],
      BU: [{ status: "open" }],
    };

    it("should keep a board of the drawn fields for each store a pane reads: the open issues and the newest closed page", async () => {
      const h = host(MANY);
      register(h, "ops-vm-3", { boards: [{ name: "OPS", path: join(h.root, "OPS") }] });

      launch(h, "token-boards11");
      const entry = await until(() => entryOf(h, "OPS"));
      const board = boardOf(h, "OPS");

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
      register(h, "ops-vm-3", { boards: [{ name: "OPS", path: join(h.root, "OPS") }] });

      // The session registers once, so FAST's 4-second idle exit would stop the refresher before
      // the head moves on a loaded host; a minute keeps it beating for the whole case.
      launch(h, "token-unchang1", [...FAST.slice(0, 6), "--idle-ms", "60000"]);
      await until(() => entryOf(h, "OPS"));
      const heads = () => calls(h).filter((call) => call.args[0] === "vc").length;
      await until(() => (heads() >= 3 ? true : undefined));

      // Three beats, one head each, and the issues read at the first only.
      expect(lists(h)).toHaveLength(2);
      const first = entryOf(h, "OPS");
      expect(first.checkedAt).toBeGreaterThanOrEqual(first.readAt);

      writeFileSync(join(h.root, "OPS", "head"), "head-2");
      const moved = await until(() => (entryOf(h, "OPS")?.head === "head-2" ? true : undefined));

      expect(moved).toBe(true);
      expect(lists(h)).toHaveLength(4);
      expect(boardOf(h, "OPS").head).toBe("head-2");
    });

    it("should take over the last refresher's board without reading the store again while its head has not moved, then drop the last one's files", async () => {
      const h = host(MANY);
      register(h, "ops-vm-3", { boards: [{ name: "OPS", path: join(h.root, "OPS") }] });
      const first = launch(h, "token-boardsA1", [...FAST.slice(0, 6), "--idle-ms", "60000"]);
      await until(() => entryOf(h, "OPS"));
      process.kill(first, "SIGTERM");
      await until(() => (alive(first) ? undefined : true));
      expect(lists(h)).toHaveLength(2);

      launch(h, "token-boardsB1", [...FAST.slice(0, 6), "--idle-ms", "60000"]);
      await until(() => (snapshot(h)?.token === "token-boardsB1" ? entryOf(h, "OPS") : undefined));

      expect(lists(h)).toHaveLength(2);
      expect(boardOf(h, "OPS")?.head).toBe("head-1");
      await until(() =>
        existsSync(join(h.state, "counts-token-boardsA1.json")) ||
        existsSync(join(h.state, "boards", "token-boardsA1"))
          ? undefined
          : true,
      );
      expect(current(h)?.token).toBe("token-boardsB1");
    });

    it("should write no board and name the store when its snapshot would pass 4 MiB", async () => {
      const long = "x".repeat(5_000);
      const h = host({
        OPS: Array.from({ length: 1_000 }, () => ({ status: "open", title: long })),
      });
      register(h, "ops-vm-3", { boards: [{ name: "OPS", path: join(h.root, "OPS") }] });

      launch(h, "token-toobig11");
      const entry = await until(() => entryOf(h, "OPS"));

      expect(entry.ok).toBe(false);
      expect(entry.error).toMatch(
        /^its board snapshot would be 5\.\d MiB, past the 4 MiB a session can read; the pane reads this store itself$/,
      );
      expect(boardOf(h, "OPS")).toBeUndefined();
    });

    it("should read a store again within a few seconds of a session's wake marker, not at the next beat", async () => {
      const h = host(STORES);
      register(h, "ops-vm-3", { boards: [{ name: "OPS", path: join(h.root, "OPS") }] });
      // The default minute beat: only the marker can bring a read sooner.
      launch(h, "token-wakeup11", ["--renew-ms", "100", "--idle-ms", "60000"]);
      await until(() => entryOf(h, "OPS"));

      writeFileSync(
        join(h.root, "OPS", "issues.json"),
        JSON.stringify([...(STORES.OPS ?? []), { status: "open", assignee: "ops-vm-3" }]),
      );
      writeFileSync(join(h.root, "OPS", "head"), "head-2");
      const wrote = Date.now();
      writeFileSync(
        join(h.state, "wake", "_marker.json"),
        JSON.stringify({ path: join(h.root, "OPS"), at: wrote }),
      );
      await until(() => (entryOf(h, "OPS")?.head === "head-2" ? true : undefined));
      const took = Date.now() - wrote;

      expect(took).toBeLessThan(10_000);
      const ops = snapshot(h).stores.find((store: { name: string }) => store.name === "OPS");
      expect(ops.statuses.open).toEqual({ "ops-vm-3": 2 });
      expect(existsSync(join(h.state, "wake", "_marker.json"))).toBe(false);
      // BU was not woken: its counts are still the first beat's.
      expect(calls(h).filter((call) => call.cwd === join(h.root, "BU"))).toHaveLength(4);
    });

    it("should read the main tree's counts and the worktree's board again on a wake marker from a linked worktree", async () => {
      const h = host(STORES);
      const tree = join(h.root, "OPS", ".worktrees", "ops-vm-3");
      mkdirSync(tree, { recursive: true });
      writeFileSync(join(tree, "issues.json"), JSON.stringify(STORES.OPS));
      register(h, "ops-vm-3", { boards: [{ name: "ops-vm-3", path: tree, prefix: "OPS" }] });
      launch(h, "token-wakeup22", ["--renew-ms", "100", "--idle-ms", "60000"]);
      await until(() =>
        snapshot(h)?.boards?.find((entry: { path: string }) => entry.path === tree),
      );

      const more = JSON.stringify([
        ...(STORES.OPS ?? []),
        { status: "open", assignee: "ops-vm-3" },
      ]);
      for (const dir of [join(h.root, "OPS"), tree]) {
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
      const ops = await until(() => {
        const store = snapshot(h).stores.find(
          (one: { path: string }) => one.path === join(h.root, "OPS"),
        );
        return store?.statuses?.open?.["ops-vm-3"] === 2 ? store : undefined;
      });

      expect(ops.statuses.open).toEqual({ "ops-vm-3": 2 });
      expect(snapshot(h).stores.map((store: { path: string }) => store.path)).not.toContain(tree);
    });
  });

  // T-2C.5, D-37: the held store's review verb, run once a beat through the user's
  // `[review] command`. A stub held command logs each call and prints `review.json` from its
  // directory, or only `unchanged` while `--if-changed` names the fingerprint in `fingerprint`;
  // a `fail` file there makes it exit 4 with the store's JSON refusal.
  describe("the review beat (T-2C.5)", () => {
    const HELD = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dir = path.dirname(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(path.join(dir, "held.log"), JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
if (fs.existsSync(path.join(dir, "fail"))) {
  process.stdout.write(JSON.stringify({ status: "error", key: "pairs", detail: "message-transports.json is malformed" }) + "\\n");
  process.stderr.write("held: pairs: message-transports.json is malformed\\n");
  process.exit(1);
}
const fingerprint = fs.readFileSync(path.join(dir, "fingerprint"), "utf8").trim();
const at = args.indexOf("--if-changed");
if (at >= 0 && args[at + 1] === fingerprint) {
  process.stdout.write(JSON.stringify({ unchanged: true, fingerprint }) + "\\n");
  process.exit(0);
}
const payload = JSON.parse(fs.readFileSync(path.join(dir, "review.json"), "utf8"));
process.stdout.write(JSON.stringify({ ...payload, fingerprint }) + "\\n");
`;
    // The verb's own item shape (ai-harness held_cli.py review, REVIEW_KEYS and its derived fields).
    const item = (n: number, task: string, extra: Record<string, unknown> = {}) => ({
      path: `/home/me/projects/ai-harness/docs/held/host-c--ops-vm-3/2026-10-25-0${n}-decision-x.md`,
      store: "ai-harness",
      relpath: `docs/held/host-c--ops-vm-3/2026-10-25-0${n}-decision-x.md`,
      kind: "decision",
      status: "open",
      session: "ops-vm-3@host-c",
      machine: "host-c",
      task,
      title: `D-${n}: a decision`,
      ask: "Approve (a).",
      source_skill: "/format-decision",
      created_at: `2026-10-25T0${n}:00:00Z`,
      answered_at: null,
      answer_recorded_in: null,
      decider: null,
      escalated: false,
      ai_resolved: false,
      selection: "current",
      superseded_by: null,
      ...extra,
    });
    const payloadOf = (items: unknown[]) => ({
      schema: 1,
      host: "host-c",
      pair: ["host-a", "host-c"],
      scope: "pair",
      read_at: "2026-10-25T11:00:00Z",
      stores: {},
      items,
      malformed: [],
    });
    const STORE: Record<string, Issue[]> = {
      S: [
        { status: "in_progress", assignee: "ops-vm-3", title: "the reviewed task", parent: "S-9" },
        { status: "blocked", title: "the task named by its display id" },
      ],
    };

    /** A host whose user config names the stub held command, and the files the stub reads. */
    function reviewHost(items: unknown[], config = true) {
      const h = host(STORE);
      const held = join(h.root, "held");
      mkdirSync(held);
      writeFileSync(join(held, "held_cli"), HELD);
      chmodSync(join(held, "held_cli"), 0o755);
      writeFileSync(join(held, "fingerprint"), "fp-1");
      writeFileSync(join(held, "review.json"), JSON.stringify(payloadOf(items)));
      writeFileSync(join(held, "held.log"), "");
      const configPath = join(h.home, ".config", "beads-ui", "beads-ui.toml");
      mkdirSync(join(h.home, ".config", "beads-ui"), { recursive: true });
      // The install's own form: the whole review call, whose verb the refresher replaces.
      writeFileSync(
        configPath,
        config
          ? `[review]\ncommand = ["${join(held, "held_cli")}", "review", "--scope", "pair", "--json"]\n`
          : `[sync]\ncommand = ["publish"]\n`,
      );
      const heldCalls = () =>
        readFileSync(join(held, "held.log"), "utf8")
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => JSON.parse(line) as { args: string[]; cwd: string });
      return { ...h, held, configPath, heldCalls };
    }
    const reviewOf = (h: Host) => {
      const token = lease(h)?.token;
      return typeof token === "string"
        ? readJson(join(h.state, `review-${token}.json`))
        : undefined;
    };
    const KEEP = [...FAST.slice(0, 6), "--idle-ms", "60000"];
    const joins = (h: Host) =>
      calls(h).filter(
        (call) =>
          call.args[0] === "list" &&
          call.args.some((arg) => arg.startsWith("--id=") || arg.startsWith("--label-any=")),
      );

    it("should run the review verb with the user's command and write the pair's items, each joined to its issue by bd id or display id", async () => {
      const h = reviewHost([item(1, "S-0"), item(2, "S-issue-1"), item(3, "none")]);
      register(h, "ops-vm-3");

      launch(h, "token-review01", [...KEEP, "--config", h.configPath]);
      const written = await until(() => reviewOf(h));

      expect(h.heldCalls()[0]).toEqual({
        args: ["review", "--scope", "pair", "--json"],
        cwd: h.home,
      });
      expect(written).toMatchObject({
        schema: 1,
        token: "token-review01",
        fingerprint: "fp-1",
        host: "host-c",
        pair: ["host-a", "host-c"],
      });
      expect(written.error).toBeUndefined();
      const [first, second, third] = written.items;
      expect(first.issue).toEqual({
        id: "S-0",
        displayId: "S-issue-0",
        title: "the reviewed task",
        status: "in_progress",
        priority: 2,
        labels: ["id:S-issue-0"],
        parent: "S-9",
        assignee: "ops-vm-3",
        updatedAt: "2026-10-01T00:00:00.000Z",
        store: join(h.root, "S"),
      });
      expect(second.issue).toMatchObject({ id: "S-1", displayId: "S-issue-1", status: "blocked" });
      expect(third.issue).toBeUndefined();
      expect(first).toMatchObject({ kind: "decision", task: "S-0", selection: "current" });
      expect(joins(h).map((call) => call.args.filter((arg) => arg.startsWith("--")))).toEqual([
        ["--json", "--brief", "--all", "--limit", "--id=S-0,S-issue-1"],
        ["--json", "--brief", "--all", "--limit", "--label-any=id:S-0,id:S-issue-1"],
      ]);
    });

    it("should pass the last fingerprint, keep the items while the verb prints unchanged, and join again only once the store's head moves", async () => {
      const h = reviewHost([item(1, "S-0")]);
      register(h, "ops-vm-3");

      launch(h, "token-review02", [...KEEP, "--config", h.configPath]);
      const first = await until(() => reviewOf(h));
      await until(() => (h.heldCalls().length >= 3 ? true : undefined));
      const kept = await until(() => {
        const now = reviewOf(h);
        return now !== undefined && now.checkedAt > first.checkedAt ? now : undefined;
      });

      expect(h.heldCalls()[1]?.args).toEqual([
        "review",
        "--scope",
        "pair",
        "--json",
        "--if-changed",
        "fp-1",
      ]);
      expect(kept.readAt).toBe(first.readAt);
      expect(kept.items).toEqual(first.items);
      expect(joins(h)).toHaveLength(2);

      const issues = JSON.parse(readFileSync(join(h.root, "S", "issues.json"), "utf8"));
      issues[0].status = "closed";
      writeFileSync(join(h.root, "S", "issues.json"), JSON.stringify(issues));
      writeFileSync(join(h.root, "S", "head"), "head-2");
      const rejoined = await until(() =>
        reviewOf(h)?.items?.[0]?.issue?.status === "closed" ? reviewOf(h) : undefined,
      );

      expect(rejoined.joins[0]).toMatchObject({ path: join(h.root, "S"), head: "head-2" });
      expect(joins(h)).toHaveLength(4);
      expect(rejoined.readAt).toBe(first.readAt);
    });

    it("should run the review verb again within a few seconds of a session's review wake marker, not at the next beat", async () => {
      const h = reviewHost([item(1, "S-0")]);
      register(h, "ops-vm-3");
      // The default minute beat: only the marker can bring a run sooner.
      launch(h, "token-review05", [
        "--renew-ms",
        "100",
        "--idle-ms",
        "60000",
        "--config",
        h.configPath,
      ]);
      const first = await until(() => reviewOf(h));

      writeFileSync(join(h.held, "fingerprint"), "fp-2");
      writeFileSync(
        join(h.held, "review.json"),
        JSON.stringify(payloadOf([item(1, "S-0", { status: "answered" })])),
      );
      const woke = Date.now();
      writeFileSync(
        join(h.state, "wake", "review.json"),
        JSON.stringify({ path: first.items[0].path, at: woke }),
      );
      const read = await until(() =>
        reviewOf(h)?.fingerprint === "fp-2" ? reviewOf(h) : undefined,
      );

      expect(Date.now() - woke).toBeLessThan(10_000);
      expect(read.items[0].status).toBe("answered");
      expect(h.heldCalls()[1]?.args).toEqual([
        "review",
        "--scope",
        "pair",
        "--json",
        "--if-changed",
        "fp-1",
      ]);
      expect(existsSync(join(h.state, "wake", "review.json"))).toBe(false);
    });

    it("should run no held command and write no review snapshot while [review] command is unset", async () => {
      const h = reviewHost([item(1, "S-0")], false);
      register(h, "ops-vm-3");

      launch(h, "token-review03", [...KEEP, "--config", h.configPath]);
      await until(() =>
        current(h) !== undefined && (current(h)?.beatAt ?? 0) > 0 ? true : undefined,
      );
      await until(() =>
        calls(h).filter((call) => call.args[0] === "count").length >= 8 ? true : undefined,
      );

      expect(h.heldCalls()).toEqual([]);
      expect(existsSync(join(h.state, "review-token-review03.json"))).toBe(false);
    });

    it("should keep the last items and name the failure when the command fails, and write the failure alone when it never answered", async () => {
      const h = reviewHost([item(1, "S-0")]);
      writeFileSync(join(h.held, "fail"), "");
      register(h, "ops-vm-3");

      launch(h, "token-review04", [...KEEP, "--config", h.configPath]);
      const failed = await until(() => reviewOf(h));

      expect(failed.items).toEqual([]);
      expect(failed.error).toBe(
        "the review command did not answer: exited 1, the review command refused: message-transports.json is malformed, held: pairs: message-transports.json is malformed",
      );

      rmSync(join(h.held, "fail"));
      const read = await until(() => (reviewOf(h)?.items?.length === 1 ? reviewOf(h) : undefined));
      expect(read.error).toBeUndefined();

      writeFileSync(join(h.held, "fail"), "");
      const kept = await until(() =>
        reviewOf(h)?.error !== undefined && reviewOf(h)?.checkedAt > read.checkedAt
          ? reviewOf(h)
          : undefined,
      );
      expect(kept.items).toEqual(read.items);
      expect(kept.fingerprint).toBe("fp-1");
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
