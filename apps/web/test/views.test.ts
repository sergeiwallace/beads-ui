import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../server/server.ts";
import {
  type HostEnv,
  hostConfig,
  hostEnv,
  repoName,
  SAME_ORIGIN_WRITE,
  signIn,
} from "./auth-env.ts";
import { type FakeQueue, startFakeQueue } from "./queue-fake.ts";
import { createStore, failingBd, type TestStore } from "./store.ts";

// Phase 3's remaining routes through the real server and a real bd store: GET /api/roadmap
// (T-3.2), GET /api/analytics (T-3.3), GET /api/sessions and the queue-routed status write
// (T-3.4). The work queue is an in-process fake answering ai-core's real routes and shapes
// (queue-fake.ts); set BEADS_UI_LIVE_QUEUE_URL to also read a live queue on loopback.

let store: TestStore;
let host: HostEnv;
let clientDir: string;
let server: RunningServer;
let queue: FakeQueue;
const cleanup: (() => Promise<void>)[] = [];
/** Each started server's session cookie: every route needs one (web app design T-W0.1). */
const cookies = new Map<RunningServer, string>();
/** The work queue's repository the tests' leased tasks belong to, on the host's allowlist. */
const QUEUE_REPO = "demo";

const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
/** A due date at UTC noon, so its day reads the same in every time zone. */
const due = (offset: number) => `${day(offset)}T12:00:00Z`;

/** A loopback URL with nothing listening: a port taken from the OS, then released. */
async function closedUrl(): Promise<string> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

async function start(bdEnv?: NodeJS.ProcessEnv) {
  const started = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: host.configEnv,
    ...(bdEnv === undefined ? {} : { bdEnv }),
  });
  cookies.set(started, await signIn(started));
  return started;
}

async function get(path: string, on: RunningServer = server) {
  const response = await fetch(new URL(path, on.url), {
    headers: { cookie: cookies.get(on) ?? "" },
  });
  return { status: response.status, body: await response.json() };
}

async function post(path: string, body: unknown) {
  const response = await fetch(new URL(path, server.url), {
    method: "POST",
    headers: { ...SAME_ORIGIN_WRITE, cookie: cookies.get(server) ?? "" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/**
 * Writes the host's own beads-ui.toml, read again on the next request: the allowlist with the
 * store's repository and the queue's, the `[auth]` table, and `extra` (`[queue]` is read from
 * this file alone, never the repository's).
 */
const configure = (extra?: string) =>
  host.write(
    hostConfig({
      allowRepos: [repoName(store.dir), QUEUE_REPO],
      ...(extra === undefined ? {} : { extra }),
    }),
  );

const created = async (...args: string[]) =>
  (JSON.parse(await store.bd("create", ...args, "--json")) as { id: string }).id;

beforeAll(async () => {
  store = await createStore("views");
  host = await hostEnv();
  await configure();
  clientDir = await mkdtemp(join(tmpdir(), "beads-ui-web-client-"));
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>beads-ui client</title>");
  queue = await startFakeQueue();
  server = await start();
});

afterEach(async () => {
  await rm(join(store.dir, "beads-ui.toml"), { force: true });
  await configure();
  queue.sessions = [];
  queue.tasks = [];
  queue.requests.splice(0);
});

afterAll(async () => {
  await server?.close();
  await queue?.close();
  for (const step of cleanup.splice(0)) await step();
  await store?.remove();
  await host?.remove();
  if (clientDir !== undefined) await rm(clientDir, { recursive: true });
});

describe("GET /api/roadmap (T-3.2)", () => {
  it("should place epics and milestones by due date and return their blocks and parent-child lines", async () => {
    const platform = await created("Platform epic", "-t", "epic", "--due", due(20));
    const launch = await created("Launch", "-t", "milestone", "--due", due(30));
    const sub = await created("Sub epic", "-t", "epic", "--due", due(25), "--parent", platform);
    const undated = await created("Someday epic", "-t", "epic");
    const task = await created("A task", "--due", due(5));
    await store.bd("dep", "add", launch, platform);
    await store.bd("dep", "add", undated, launch);

    const reply = await get("/api/roadmap");

    expect(reply.status).toBe(200);
    const { view } = reply.body;
    const bars = view.bars.map((bar: { id: string; due: string }) => [bar.id, bar.due]);
    expect(bars).toEqual([
      [platform, day(20)],
      [sub, day(25)],
      [launch, day(30)],
    ]);
    expect(view.bars.map((bar: { id: string }) => bar.id)).not.toContain(task);
    expect(view.links).toEqual(
      expect.arrayContaining([
        { from: platform, to: launch, kind: "blocks" },
        { from: platform, to: sub, kind: "parent-child" },
      ]),
    );
    expect(view.links).toHaveLength(2);
    expect(view.undated.map((item: { id: string }) => item.id)).toEqual([undated]);
    expect(view.unplacedLinks).toBe(1);
  });

  it("should name bd list and its exit status when the store read fails", async () => {
    const failing = await failingBd(["list"]);
    cleanup.push(failing.remove);
    const broken = await start(failing.env);
    cleanup.push(broken.close);

    const reply = await get("/api/roadmap", broken);

    expect(reply.status).toBe(502);
    expect(reply.body.error).toMatchObject({ kind: "failed", source: "bd list", exitCode: 1 });
  });
});

describe("GET /api/analytics (T-3.3)", () => {
  it("should draw every chart from bd history --events", async () => {
    const done = await store.create("Done work");
    await store.bd("update", done, "--status", "in_progress");
    await store.bd("close", done);
    const working = await store.create("Working", { status: "in_progress" });
    const sprintStart = day(-3);
    await created(
      "Sprint s1",
      "-t",
      "milestone",
      "--due",
      due(4),
      `--metadata=${JSON.stringify({ "sprint.starts_at": sprintStart })}`,
    );
    const member = await store.create("Sprint member");
    await store.bd("update", member, "--add-label", "sprint:s1");
    await store.bd("close", member);
    await store.bd("update", await store.create("Open member"), "--add-label", "sprint:s1");

    const reply = await get("/api/analytics?weeks=2");

    expect(reply.status).toBe(200);
    const { view } = reply.body;
    expect(view.range.weeks).toBe(2);
    expect(view.throughput).toHaveLength(2);
    expect(view.throughput[1].closed).toBeGreaterThanOrEqual(2);
    expect(view.cycleTime.map((point: { id: string }) => point.id)).toContain(done);
    expect(view.cycleTime.every((p: { rollingAverage: number }) => p.rollingAverage >= 0)).toBe(
      true,
    );
    expect(view.cumulativeFlow).toHaveLength(14);
    const today = view.cumulativeFlow.at(-1).counts;
    expect(today.done).toBeGreaterThanOrEqual(2);
    expect(today.wip).toBeGreaterThanOrEqual(1);
    expect(view.aging.map((item: { id: string }) => item.id)).toContain(working);
    expect(reply.body.sprint).toBe("s1");
    expect(view.burndown).toMatchObject({ kind: "drawn", sprint: "s1", members: 2 });
    expect(view.burndown.days[0]).toEqual({ day: sprintStart, remaining: 2, ideal: 2 });
    expect(view.burndown.days.find((d: { day: string }) => d.day === day(0)).remaining).toBe(1);
    expect(reply.body.histories.failed).toEqual([]);
    expect(reply.body.cost).toEqual({ configured: false });
  });

  it("should refuse a weeks value outside 1 to 52 and a sprint the store does not name", async () => {
    expect((await get("/api/analytics?weeks=0")).body.error).toMatchObject({
      kind: "invalid",
      source: "weeks",
    });
    expect((await get("/api/analytics?weeks=x")).status).toBe(400);
    const missing = await get("/api/analytics?sprint=nope");
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe("no sprint named nope in this store");
  });

  it("should fall back to each issue's dates and name it when its bd history read fails", async () => {
    const id = await store.create("No history");
    const failing = await failingBd(["history"]);
    cleanup.push(failing.remove);
    const broken = await start(failing.env);
    cleanup.push(broken.close);

    const reply = await get("/api/analytics", broken);

    expect(reply.status).toBe(200);
    const failed = reply.body.histories.failed.map((f: { id: string }) => f.id);
    expect(failed).toContain(id);
    expect(reply.body.histories.failed[0].message).toContain("database is locked");
    expect(reply.body.view.cumulativeFlow.at(-1).counts.active).toBeGreaterThanOrEqual(1);
  });

  describe("where a Claude Code cost export is configured", () => {
    let exportDir: string;
    beforeAll(async () => {
      exportDir = await mkdtemp(join(tmpdir(), "beads-ui-cost-"));
    });
    afterAll(() => rm(exportDir, { recursive: true }));

    const otlp = (session: string, cost: number, tokens: number) =>
      JSON.stringify({
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: "service.name", value: { stringValue: "claude-code" } }],
            },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: "claude_code.cost.usage",
                    sum: {
                      aggregationTemporality: 1,
                      dataPoints: [
                        {
                          attributes: [{ key: "session.id", value: { stringValue: session } }],
                          asDouble: cost,
                        },
                      ],
                    },
                  },
                  {
                    name: "claude_code.token.usage",
                    sum: {
                      aggregationTemporality: 1,
                      dataPoints: [
                        {
                          attributes: [
                            { key: "session.id", value: { stringValue: session } },
                            { key: "type", value: { stringValue: "output" } },
                          ],
                          asInt: String(tokens),
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      });

    it("should show cost and tokens for each issue closed with a session id", async () => {
      const id = await store.create("Closed by a session");
      await store.bd("close", id, "--session", "session-cost-1");
      const plain = await store.create("Closed by hand");
      await store.bd("close", plain);
      await writeFile(join(exportDir, "metrics.jsonl"), `${otlp("session-cost-1", 0.42, 1234)}\n`);
      await configure(`[analytics]\ncost_export = "${join(exportDir, "metrics.jsonl")}"\n`);

      const reply = await get("/api/analytics");

      expect(reply.body.cost.configured).toBe(true);
      const rows = reply.body.cost.rows;
      expect(rows.map((row: { id: string }) => row.id)).not.toContain(plain);
      expect(rows.find((row: { id: string }) => row.id === id)).toMatchObject({
        sessionId: "session-cost-1",
        usage: { costUsd: 0.42, totalTokens: 1234 },
      });
    });

    it("should say the export cannot be read rather than show no cost", async () => {
      await configure(`[analytics]\ncost_export = "${join(exportDir, "missing.jsonl")}"\n`);

      const reply = await get("/api/analytics");

      expect(reply.status).toBe(200);
      expect(reply.body.cost).toMatchObject({
        configured: true,
        error: { message: "cannot read the cost export (ENOENT)" },
      });
    });
  });
});

describe("GET /api/sessions (T-3.4)", () => {
  it("should render from Beads assignees alone and say liveness is unavailable when queue.url is empty", async () => {
    const id = await store.create("Claimed here", { status: "in_progress" });
    await store.bd("update", id, "--assignee", "host-a/session-1");
    await configure('[queue]\nurl = ""\n');

    const reply = await get("/api/sessions");

    expect(reply.status).toBe(200);
    const { view } = reply.body;
    expect(view.source).toBe("beads");
    expect(view.liveness).toBe("unavailable");
    expect(view.note).toMatch(/^Liveness is unavailable/);
    const row = view.rows.find((r: { id: string }) => r.id === "host-a/session-1");
    expect(row).toMatchObject({ machine: "host-a", name: "session-1" });
    expect(row.currentTask.id).toBe(id);
    expect(row.state).toBeUndefined();
    expect(row.lastHeartbeatAt).toBeUndefined();
  });

  it("should read /api/queue/sessions and show state, current task, last heartbeat and claim age", async () => {
    const heartbeat = new Date(Date.now() - 90_000).toISOString();
    const claimed = new Date(Date.now() - 2 * 3_600_000).toISOString();
    queue.sessions = [
      {
        id: "host-a/session-1",
        machine: "host-a",
        repo: QUEUE_REPO,
        state: "busy",
        last_heartbeat_at: heartbeat,
      },
      {
        id: "host-b/session-2",
        machine: "host-b",
        repo: QUEUE_REPO,
        state: "idle",
        last_heartbeat_at: heartbeat,
      },
      { id: "host-b/old", machine: "host-b", repo: QUEUE_REPO, state: "gone" },
    ];
    queue.tasks = [
      {
        repo: "demo",
        task_id: "demo-1",
        title: "Leased task",
        queue_state: "assigned",
        owner_session: "host-a/session-1",
        events: [{ kind: "queue.task.assigned", ts: claimed, session_id: "host-a/session-1" }],
      },
      { repo: "demo", task_id: "demo-2", queue_state: "done", owner_session: "host-b/session-2" },
    ];
    await configure(`[queue]\nurl = "${queue.url}"\nrepo = "demo"\n`);

    const reply = await get("/api/sessions");

    expect(reply.status).toBe(200);
    const { view } = reply.body;
    expect(view).toMatchObject({ source: "queue", liveness: "available" });
    expect(view.rows.map((row: { id: string }) => row.id)).toEqual([
      "host-a/session-1",
      "host-b/session-2",
      "host-b/old",
    ]);
    expect(view.rows[0]).toMatchObject({
      state: "busy",
      currentTask: { repo: "demo", id: "demo-1", title: "Leased task" },
      lastHeartbeatAt: heartbeat,
      heartbeatAge: "1m",
      claimedAt: claimed,
      claimAge: "2h",
      claimSource: "queue",
    });
    expect(view.rows[1].currentTask).toBeUndefined();
    expect(view.rows[2]).toMatchObject({ state: "gone" });
  });

  it("should drop every queue session and task from a repository off the host's allowlist and count it", async () => {
    queue.sessions = [
      { id: "host-a/shown", machine: "host-a", repo: QUEUE_REPO, state: "busy" },
      { id: "host-a/hidden", machine: "host-a", repo: "private-repo", state: "busy" },
      { id: "host-a/no-repo", machine: "host-a", repo: null, state: "busy" },
    ];
    queue.tasks = [
      {
        repo: "private-repo",
        task_id: "p-1",
        title: "Private",
        queue_state: "assigned",
        owner_session: "host-a/shown",
      },
    ];
    await configure(`[queue]\nurl = "${queue.url}"\n`);

    const reply = await get("/api/sessions");

    expect(reply.body.view.rows.map((row: { id: string }) => row.id)).toEqual(["host-a/shown"]);
    expect(reply.body.view.rows[0].currentTask).toBeUndefined();
    expect(JSON.stringify(reply.body)).not.toContain("private-repo");
    const health = await get("/api/health");
    expect(health.body.hidden).toBe(3);
    expect(health.body.lines).toEqual([
      "3 rows from repositories not on this host's allowlist are hidden",
    ]);
  });

  it("should read [queue] from the host's own file, never the repository's", async () => {
    queue.sessions = [{ id: "host-a/s", machine: "host-a", repo: QUEUE_REPO, state: "busy" }];
    await writeFile(join(store.dir, "beads-ui.toml"), `[queue]\nurl = "${queue.url}"\n`);

    const reply = await get("/api/sessions");

    expect(reply.body.view.source).toBe("beads");
  });

  it("should show the store's assignees and name the failed queue read when the queue does not answer", async () => {
    await configure(`[queue]\nurl = "${await closedUrl()}"\n`);

    const reply = await get("/api/sessions");

    expect(reply.status).toBe(200);
    expect(reply.body.view.source).toBe("beads");
    expect(reply.body.queueError).toMatchObject({
      kind: "failed",
      source: "GET /api/queue/sessions",
    });
  });

  it.skipIf(process.env.BEADS_UI_LIVE_QUEUE_URL === undefined)(
    "should read a live work queue's registry when one answers on loopback",
    async () => {
      const live = process.env.BEADS_UI_LIVE_QUEUE_URL ?? "";
      const registry = (await (await fetch(`${live}/api/queue/sessions`)).json()) as {
        repo: string | null;
      }[];
      const repos = [...new Set(registry.flatMap((row) => (row.repo === null ? [] : [row.repo])))];
      await host.write(
        hostConfig({
          allowRepos: [repoName(store.dir), ...repos],
          extra: `[queue]\nurl = "${live}"\n`,
        }),
      );

      const reply = await get("/api/sessions");

      expect(reply.body.queueError).toBeUndefined();
      expect(reply.body.view.source).toBe("queue");
      expect(reply.body.view.rows).toHaveLength(registry.filter((row) => row.repo !== null).length);
      for (const row of reply.body.view.rows) expect(typeof row.state).toBe("string");
    },
  );
});

describe("a status move on a task the queue holds a lease on (T-3.4)", () => {
  it("should write through POST /api/queue/tasks/{repo}/{task_id}/status and leave bd unwritten", async () => {
    const id = await store.create("Leased");
    queue.tasks = [
      {
        repo: "demo",
        task_id: id,
        status: "open",
        queue_state: "assigned",
        owner_session: "host-a/s",
      },
    ];
    await configure(`[queue]\nurl = "${queue.url}"\nrepo = "demo"\n`);

    const reply = await post(`/api/issues/${id}/status`, { to: "in_progress", shown: "open" });

    expect(reply.status).toBe(202);
    expect(reply.body).toEqual({ id, status: "in_progress", via: "queue", holder: "host-a/s" });
    expect(queue.requests).toEqual([
      {
        repo: "demo",
        taskId: id,
        body: { status: "in_progress", actor: "beads-ui-web", expected_status: "open" },
      },
    ]);
    expect((await store.show(id)).status).toBe("open");
  });

  it("should show the queue's 409 conflict when the expected status is stale", async () => {
    const id = await store.create("Moved in the queue");
    queue.tasks = [
      {
        repo: "demo",
        task_id: id,
        status: "blocked",
        queue_state: "active",
        owner_session: "host-a/s",
      },
    ];
    await configure(`[queue]\nurl = "${queue.url}"\nrepo = "demo"\n`);

    const reply = await post(`/api/issues/${id}/status`, { to: "in_progress", shown: "open" });

    expect(reply.status).toBe(409);
    expect(reply.body.error).toEqual({
      kind: "stale",
      source: "POST /api/queue/tasks/{repo}/{task_id}/status",
      message: `the work queue holds ${id} as blocked, not open; nothing was written`,
    });
    expect((await store.show(id)).status).toBe("open");
  });

  it("should write through bd when the queue holds no lease on the task", async () => {
    const id = await store.create("Not leased");
    queue.tasks = [{ repo: "demo", task_id: id, status: "open", queue_state: "backlog" }];
    await configure(`[queue]\nurl = "${queue.url}"\nrepo = "demo"\n`);

    const reply = await post(`/api/issues/${id}/status`, { to: "in_progress", shown: "open" });

    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ id, status: "in_progress" });
    expect(queue.requests).toEqual([]);
    expect((await store.show(id)).status).toBe("in_progress");
  });

  it("should write through bd and say the lease went unchecked when the queue does not answer", async () => {
    const id = await store.create("Queue down");
    await configure(`[queue]\nurl = "${await closedUrl()}"\nrepo = "demo"\n`);

    const reply = await post(`/api/issues/${id}/status`, { to: "in_progress", shown: "open" });

    expect(reply.status).toBe(200);
    expect(reply.body.notice).toMatch(
      /^the work queue could not be read, so .+ was written through bd/,
    );
    expect((await store.show(id)).status).toBe("in_progress");
  });
});
