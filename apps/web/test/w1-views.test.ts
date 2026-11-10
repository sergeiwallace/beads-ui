import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../server/server.ts";
import { type HostEnv, hostConfig, hostEnv, repoName, signIn } from "./auth-env.ts";
import { type FakeQueue, startFakeQueue } from "./queue-fake.ts";
import { createStore, type TestStore } from "./store.ts";

// Phase W1's Sprint, inline-edit, Queue and detail routes (web app design T-W1.0, T-W1.5,
// T-W1.7), each through the running server and a real bd store.

let store: TestStore;
let host: HostEnv;
let clientDir: string;
let server: RunningServer;
let cookie: string;
let queue: FakeQueue;
let heldDir: string;
let scenarioFile: string;

const WRITE = {
  "content-type": "application/json",
  "x-beads-ui": "1",
  "sec-fetch-site": "same-origin",
};

async function get(path: string) {
  const response = await fetch(new URL(path, server.url), { headers: { cookie } });
  const type = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    body: type.startsWith("application/json") ? await response.json() : await response.text(),
  };
}

async function post(path: string, body: unknown) {
  const response = await fetch(new URL(path, server.url), {
    method: "POST",
    headers: { ...WRITE, cookie },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

const repo = () => repoName(store.dir);

/** The user's file: the allowlist, plus whatever a test adds. */
async function settings(extra?: string) {
  await host.write(hostConfig({ allowRepos: [repo()], ...(extra === undefined ? {} : { extra }) }));
}

// A stand-in for the held store's tool: `review --scope pair --json`, `show <path> --json` and
// `options <path>`, each answering from the scenario file a test writes.
const HELD = `#!/usr/bin/env node
const { readFileSync } = require("node:fs");
const scenario = JSON.parse(readFileSync(${JSON.stringify("SCENARIO")}, "utf8"));
const [verb, path] = process.argv.slice(2);
const answer = scenario[verb];
if (answer === undefined) { process.stderr.write("no " + verb + " verb\\n"); process.exit(2); }
if (answer.exit !== 0) { process.stderr.write(answer.stderr ?? "refused\\n"); process.exit(answer.exit); }
process.stdout.write(typeof answer.stdout === "string" ? answer.stdout : JSON.stringify(answer.stdout));
`;

beforeAll(async () => {
  store = await createStore("w1");
  host = await hostEnv();
  queue = await startFakeQueue();
  await settings();
  clientDir = await mkdtemp(join(tmpdir(), "beads-ui-web-client-"));
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
  heldDir = await mkdtemp(join(tmpdir(), "beads-ui-web-held-"));
  scenarioFile = join(heldDir, "scenario.json");
  await writeFile(join(heldDir, "held"), HELD.replace("SCENARIO", scenarioFile));
  await chmod(join(heldDir, "held"), 0o755);
  server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: host.configEnv,
  });
  cookie = await signIn(server);
});

afterAll(async () => {
  await server?.close();
  await queue?.close();
  await store?.remove();
  await host?.remove();
  if (clientDir !== undefined) await rm(clientDir, { recursive: true });
  if (heldDir !== undefined) await rm(heldDir, { recursive: true });
});

beforeEach(async () => {
  queue.sessions.splice(0);
  queue.tasks.splice(0);
  await settings();
});

const labelsOf = async (id: string) =>
  (JSON.parse(await store.bd("show", id, "--json")) as [{ labels?: string[] }])[0].labels ?? [];
const assigneeOf = async (id: string) =>
  (JSON.parse(await store.bd("show", id, "--json")) as [{ assignee?: string }])[0].assignee;

describe("POST /api/issues/:id/sprint", () => {
  it("should write the sprint label through a guarded bd write and move it back to the backlog", async () => {
    const id = await store.create("Sprint member");

    const into = await post(`/api/issues/${id}/sprint`, {
      to: "sprint:s1",
      from: "backlog",
      shown: "open",
    });
    expect(into.body).toEqual({ id, sprint: "sprint:s1" });
    expect(into.status).toBe(200);
    expect(await labelsOf(id)).toContain("sprint:s1");

    const moved = await post(`/api/issues/${id}/sprint`, {
      to: "sprint:s2",
      from: "sprint:s1",
      shown: "open",
    });
    expect(moved.status).toBe(200);
    expect((await labelsOf(id)).filter((label) => label.startsWith("sprint:"))).toEqual([
      "sprint:s2",
    ]);

    const back = await post(`/api/issues/${id}/sprint`, {
      to: "backlog",
      from: "sprint:s2",
      shown: "open",
    });
    expect(back.status).toBe(200);
    expect((await labelsOf(id)).some((label) => label.startsWith("sprint:"))).toBe(false);
  });

  it("should write nothing and answer stale when the issue's status or sprint changed since it was drawn", async () => {
    const id = await store.create("Moved elsewhere");
    await store.bd("update", id, "--status", "in_progress");

    const byStatus = await post(`/api/issues/${id}/sprint`, {
      to: "sprint:s1",
      from: "backlog",
      shown: "open",
    });
    expect(byStatus.status).toBe(409);
    expect(byStatus.body.error.kind).toBe("stale");

    const bySprint = await post(`/api/issues/${id}/sprint`, {
      to: "backlog",
      from: "sprint:s9",
      shown: "in_progress",
    });
    expect(bySprint.status).toBe(409);
    expect(await labelsOf(id)).toEqual([]);
  });

  it("should refuse a target that is neither the backlog nor a sprint", async () => {
    const id = await store.create("Bad target");
    const reply = await post(`/api/issues/${id}/sprint`, {
      to: "s1",
      from: "backlog",
      shown: "open",
    });
    expect(reply.status).toBe(400);
  });
});

describe("the owner picker's routes", () => {
  it("should offer the queue's sessions that are not gone, on an allowed repository, named by [handoff] receivers", async () => {
    await settings(`[queue]\nurl = "${queue.url}"\n\n[handoff]\nreceivers = ["team-*"]`);
    queue.sessions.push(
      { id: "host-a/team-1", machine: "host-a", state: "active", repo: repo() },
      { id: "host-a/team-2", machine: "host-a", state: "gone", repo: repo() },
      { id: "host-a/other-1", machine: "host-a", state: "active", repo: repo() },
      { id: "host-b/team-3", machine: "host-b", state: "idle", repo: "not-allowed" },
    );

    const reply = await get("/api/owners");

    expect(reply.status).toBe(200);
    expect(reply.body.source).toBe("the work queue");
    expect(reply.body.rule).toEqual(["team-*"]);
    expect(reply.body.candidates).toEqual([{ name: "team-1", state: "active", machine: "host-a" }]);
  });

  it("should fall back to the store's assignees and name the failed registry read", async () => {
    await settings(`[queue]\nurl = "http://127.0.0.1:9/"`);
    const id = await store.create("Assigned");
    await store.bd("update", id, "--assignee=session-z");

    const reply = await get("/api/owners");

    expect(reply.body.source).toBe("the store's assignees");
    expect(reply.body.candidates).toContainEqual({ name: "session-z" });
    expect(reply.body.queueError.source).toBe("GET /api/queue/sessions");
  });

  it("should write the assignee of an unclaimed task through a guarded bd write", async () => {
    await settings(`[queue]\nurl = "${queue.url}"`);
    queue.sessions.push({
      id: "host-a/session-a",
      machine: "host-a",
      state: "active",
      repo: repo(),
    });
    const id = await store.create("Unclaimed");

    const reply = await post(`/api/issues/${id}/owner`, {
      to: "session-a",
      shown: "",
      status: "open",
    });

    expect(reply).toEqual({ status: 200, body: { id, assignee: "session-a" } });
    expect(await assigneeOf(id)).toBe("session-a");
  });

  it("should write nothing when the assignee changed since the page drew it", async () => {
    await settings(`[queue]\nurl = "${queue.url}"`);
    queue.sessions.push({
      id: "host-a/session-a",
      machine: "host-a",
      state: "active",
      repo: repo(),
    });
    const id = await store.create("Taken meanwhile");
    await store.bd("update", id, "--assignee=session-q");

    const reply = await post(`/api/issues/${id}/owner`, {
      to: "session-a",
      shown: "",
      status: "open",
    });

    expect(reply.status).toBe(409);
    expect(await assigneeOf(id)).toBe("session-q");
  });

  it("should send a claimed task's change to the handoff path and never reassign the claim itself", async () => {
    await settings(`[queue]\nurl = "${queue.url}"`);
    queue.sessions.push({
      id: "host-a/session-a",
      machine: "host-a",
      state: "active",
      repo: repo(),
    });
    const id = await store.create("Claimed");
    await store.bd("update", id, "--assignee=session-h", "--status", "in_progress");

    const reply = await post(`/api/issues/${id}/owner`, {
      to: "session-a",
      shown: "session-h",
      status: "in_progress",
    });

    // T-W2.2: session-h names no host and the queue does not place it, so its liveness cannot be
    // established; the handoff path writes nothing and offers a retry.
    expect(reply.status).toBe(409);
    expect(reply.body.error.kind).toBe("owner-unknown");
    expect(reply.body.error.message).toMatch(/^owner state unknown: .*session-h/);
    expect(await assigneeOf(id)).toBe("session-h");
  });

  it("should refuse a session the handoff rules do not allow, naming the rule, before anything is written", async () => {
    await settings(`[queue]\nurl = "${queue.url}"\n\n[handoff]\nreceivers = ["team-*"]`);
    queue.sessions.push({ id: "host-a/other-1", machine: "host-a", state: "active", repo: repo() });
    const id = await store.create("Ruled out");

    const reply = await post(`/api/issues/${id}/owner`, {
      to: "other-1",
      shown: "",
      status: "open",
    });

    expect(reply.status).toBe(400);
    expect(reply.body.error.message).toContain('[handoff] receivers = ["team-*"]');
    expect(await assigneeOf(id)).toBeUndefined();
  });
});

describe("POST /api/issues/:id/list-rank", () => {
  it("should write a key between its neighbours of the same priority and renumber neither", async () => {
    const a = await store.create("Rank a", { priority: 1, rank: "a0" });
    const b = await store.create("Rank b", { priority: 1, rank: "a1" });
    const c = await store.create("Rank c", { priority: 1 });

    const reply = await post(`/api/issues/${c}/list-rank`, {
      shown: "open",
      priority: 1,
      above: a,
      below: b,
    });

    expect(reply.status).toBe(200);
    const key = (await store.show(c)).metadata?.rank as string;
    expect("a0" < key && key < "a1").toBe(true);
    expect((await store.show(a)).metadata?.rank).toBe("a0");
    expect((await store.show(b)).metadata?.rank).toBe("a1");
  });

  it("should write nothing when a neighbour is no longer at the drawn priority", async () => {
    const a = await store.create("Moved neighbour", { priority: 1, rank: "b0" });
    const c = await store.create("Reordered", { priority: 1 });
    await store.bd("update", a, "--priority=3");

    const reply = await post(`/api/issues/${c}/list-rank`, {
      shown: "open",
      priority: 1,
      above: a,
    });

    expect(reply.status).toBe(409);
    expect((await store.show(c)).metadata?.rank).toBeUndefined();
  });
});

describe("GET /api/queue-view", () => {
  it("should list every open task by priority, then rank, then age without a queue, and say so", async () => {
    const reply = await get("/api/queue-view");

    expect(reply.status).toBe(200);
    expect(reply.body.order.kind).toBe("priority-rank-age");
    const priorities = reply.body.rows.map((row: { priority: number }) => row.priority);
    expect(priorities).toEqual([...priorities].sort((x, y) => x - y));
    expect(reply.body.rows.every((row: { status: string }) => row.status !== "closed")).toBe(true);
  });

  it("should show only blocked tasks under the blocked filter, each with its blocker", async () => {
    const blocker = await store.create("The blocker", { priority: 0 });
    const waiting = await store.create("Waits on it", { priority: 0 });
    await store.bd("dep", "add", waiting, blocker);
    const stuck = await store.create("Stuck", { priority: 0 });
    await store.bd("update", stuck, "--status", "blocked");
    await store.bd("comments", "add", stuck, "--", "Blocked: waiting on the vendor");

    const reply = await get("/api/queue-view?blocked=1");

    const rows = reply.body.rows as {
      id: string;
      blocked: boolean;
      blockers: { id: string }[];
      blockNote?: string;
    }[];
    expect(rows.every((row) => row.blocked)).toBe(true);
    expect(rows.find((row) => row.id === waiting)?.blockers.map((one) => one.id)).toEqual([
      blocker,
    ]);
    expect(rows.find((row) => row.id === stuck)?.blockNote).toBe("Blocked: waiting on the vendor");
    expect(rows.some((row) => row.id === blocker)).toBe(false);
  });

  it("should put the tasks the queue serves first, in its order, where the queue is configured", async () => {
    await settings(`[queue]\nurl = "${queue.url}"`);
    const late = await store.create("Ready in the queue", { priority: 4 });
    queue.tasks.push({ repo: repo(), task_id: late, queue_state: "ready" });

    const reply = await get("/api/queue-view");

    expect(reply.body.order.kind).toBe("queue");
    expect(reply.body.rows[0]).toMatchObject({ id: late, queueState: "ready" });
  });

  it("should order by priority and say the queue's order could not be read when it cannot be", async () => {
    await settings(`[queue]\nurl = "http://127.0.0.1:9/"`);

    const reply = await get("/api/queue-view");

    expect(reply.body.order.kind).toBe("priority");
    expect(reply.body.order.label).toBe("priority: the work queue's order could not be read");
    expect(reply.body.order.error.source).toBe("GET /api/queue/tasks");
  });
});

describe("GET /api/held/item", () => {
  const PATH = "/held/docs/held/d.md";
  const review = (storeDir: string) => ({
    exit: 0,
    stdout: {
      schema: 1,
      fingerprint: "f1",
      host: "host-a",
      pair: ["host-a"],
      scope: "pair",
      read_at: "2026-11-09T00:00:00Z",
      items: [
        {
          path: PATH,
          store: storeDir,
          kind: "decision",
          status: "open",
          session: "s@host-a",
          title: "Pick one",
          task: "t-1",
        },
      ],
    },
  });
  const OPTIONS = {
    exit: 0,
    stdout: {
      version: 1,
      items: [
        {
          item: PATH,
          kind: "decision",
          decisions: [
            {
              id: "D-1",
              title: "Pick one",
              anchor: "d-1",
              recommended: "a",
              options: [
                { key: "a", label: "A" },
                { key: "b", label: "B" },
              ],
            },
          ],
          error: null,
        },
      ],
    },
  };
  const scenario = (value: unknown) => writeFile(scenarioFile, JSON.stringify(value));
  const withHeld = () => settings(`[review]\ncommand = ["${join(heldDir, "held")}"]`);

  it("should return the item's whole body and its option cards", async () => {
    await withHeld();
    await scenario({
      review: review(store.dir),
      show: { exit: 0, stdout: { body: "# Body\n\ntext" } },
      options: OPTIONS,
    });

    const reply = await get(`/api/held/item?path=${encodeURIComponent(PATH)}`);

    expect(reply.status).toBe(200);
    expect(reply.body.body).toBe("# Body\n\ntext");
    expect(reply.body.store).toBe(repo());
    expect(reply.body.options.cards.map((card: { id: string }) => card.id)).toEqual(["D-1"]);
  });

  it("should name the body's failed read, its store and exit code, and still return the item", async () => {
    await withHeld();
    await scenario({
      review: review(store.dir),
      show: { exit: 3, stderr: "locked\n" },
      options: OPTIONS,
    });

    const reply = await get(`/api/held/item?path=${encodeURIComponent(PATH)}`);

    expect(reply.status).toBe(200);
    expect(reply.body.body).toBeUndefined();
    expect(reply.body.bodyError).toEqual({
      source: "held show",
      store: repo(),
      exitCode: 3,
      message: "the show command exited 3: locked",
    });
  });

  it("should refuse an item in a store this host's allowlist does not open", async () => {
    await withHeld();
    await scenario({
      review: review("/somewhere/else"),
      show: { exit: 0, stdout: { body: "x" } },
      options: OPTIONS,
    });

    const reply = await get(`/api/held/item?path=${encodeURIComponent(PATH)}`);

    expect(reply.status).toBe(403);
  });

  it("should refuse a path the review command does not list", async () => {
    await withHeld();
    await scenario({
      review: review(store.dir),
      show: { exit: 0, stdout: { body: "x" } },
      options: OPTIONS,
    });

    const reply = await get(`/api/held/item?path=${encodeURIComponent("/etc/passwd")}`);

    expect(reply.status).toBe(404);
    expect(reply.body.error.source).toBe("held review");
  });
});
