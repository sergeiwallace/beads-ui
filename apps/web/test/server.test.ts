import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOOPBACK } from "../server/config.ts";
import { type RunningServer, startServer } from "../server/server.ts";
import { type HostEnv, hostConfig, hostEnv, repoName, signIn } from "./auth-env.ts";
import { createStore, failingBd, slowBd, type TestStore } from "./store.ts";

let store: TestStore;
let host: HostEnv;
let clientDir: string;
let server: RunningServer;
const cleanup: (() => Promise<void>)[] = [];
/** Each started server's session cookie: every route needs one (web app design T-W0.1). */
const cookies = new Map<RunningServer, string>();

async function start(options: { bdEnv?: NodeJS.ProcessEnv; repoRoot?: string } = {}) {
  const started = await startServer({
    repoRoot: options.repoRoot ?? store.dir,
    port: 0,
    clientDir,
    configEnv: host.configEnv,
    ...(options.bdEnv === undefined ? {} : { bdEnv: options.bdEnv }),
  });
  cookies.set(started, await signIn(started));
  return started;
}

/** What a signed-in same-origin page's write carries. */
const writeHeaders = (on: RunningServer) => ({
  "content-type": "application/json",
  "x-beads-ui": "1",
  "sec-fetch-site": "same-origin",
  cookie: cookies.get(on) ?? "",
});

async function get(path: string, on: RunningServer = server) {
  const response = await fetch(new URL(path, on.url), {
    headers: { cookie: cookies.get(on) ?? "" },
  });
  const type = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    type,
    body: type.startsWith("application/json") ? await response.json() : await response.text(),
  };
}

async function post(path: string, body: unknown) {
  const response = await fetch(new URL(path, server.url), {
    method: "POST",
    headers: writeHeaders(server),
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  store = await createStore();
  host = await hostEnv();
  await host.write(hostConfig({ allowRepos: [repoName(store.dir)] }));
  clientDir = await mkdtemp(join(tmpdir(), "beads-ui-web-client-"));
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>beads-ui client</title>");
  server = await start();
});

afterAll(async () => {
  await server?.close();
  for (const step of cleanup.splice(0)) await step();
  await store?.remove();
  await host?.remove();
  if (clientDir !== undefined) await rm(clientDir, { recursive: true });
});

describe("the server's address and routes", () => {
  it("should listen on 127.0.0.1 and nowhere else", () => {
    expect(server.server.address()).toMatchObject({ address: LOOPBACK });
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it("should refuse to start in a directory where bd finds no store", async () => {
    const empty = await mkdtemp(join(tmpdir(), "beads-ui-web-empty-"));
    cleanup.push(() => rm(empty, { recursive: true }));
    await host.write(hostConfig({ allowRepos: [repoName(store.dir), repoName(empty)] }));
    try {
      await expect(start({ repoRoot: empty })).rejects.toThrow(/no Beads store found from/);
    } finally {
      await host.write(hostConfig({ allowRepos: [repoName(store.dir)] }));
    }
  });

  it("should answer an unknown /api/ path with a JSON 404, never the client page", async () => {
    const reply = await get("/api/nope");
    expect(reply.status).toBe(404);
    expect(reply.body).toEqual({
      error: { kind: "unknown-route", message: "no API route GET /api/nope" },
    });
    expect((await get("/api")).status).toBe(404);
  });

  it("should serve the client page for an app path outside /api/", async () => {
    const reply = await get("/backlog");
    expect(reply.status).toBe(200);
    expect(reply.body).toContain("beads-ui client");
  });
});

describe("GET /api/board", () => {
  it("should return the store's bd statuses and issues with rank on by default", async () => {
    const id = await store.create("Board read");
    const reply = await get("/api/board");
    expect(reply.status).toBe(200);
    const statuses = reply.body.statuses.map((status: { name: string }) => status.name);
    expect(statuses).toEqual(expect.arrayContaining(["open", "in_progress", "closed"]));
    expect(reply.body.issues.map((issue: { id: string }) => issue.id)).toContain(id);
    expect(reply.body.rank).toBe(true);
  });

  it("should name bd list as the source with bd's exit status when the read fails", async () => {
    const failing = await failingBd(["list"]);
    cleanup.push(failing.remove);
    const broken = await start({ bdEnv: failing.env });
    cleanup.push(broken.close);
    const reply = await get("/api/board", broken);
    expect(reply.status).toBe(502);
    expect(reply.body).toEqual({
      error: {
        kind: "failed",
        source: "bd list",
        exitCode: 1,
        message: "bd list exited 1: Error: database is locked",
      },
    });
  });

  it("should read views.rank from beads-ui.toml on every call", async () => {
    await writeFile(join(store.dir, "beads-ui.toml"), "[views]\nrank = false\n");
    try {
      expect((await get("/api/board")).body.rank).toBe(false);
    } finally {
      await rm(join(store.dir, "beads-ui.toml"));
    }
    expect((await get("/api/board")).body.rank).toBe(true);
  });
});

describe("GET /api/issues/:id", () => {
  it("should return the issue and its comments from the store", async () => {
    const id = await store.create("Detail read", { priority: 1 });
    await store.bd("comments", "add", id, "--", "first note");
    const reply = await get(`/api/issues/${id}`);
    expect(reply.status).toBe(200);
    expect(reply.body.issue).toMatchObject({
      id,
      title: "Detail read",
      priority: 1,
      status: "open",
    });
    expect(reply.body.comments.map((comment: { text: string }) => comment.text)).toEqual([
      "first note",
    ]);
  });

  it("should answer 404 naming bd show for an id the store does not hold", async () => {
    const reply = await get("/api/issues/web-nothere");
    expect(reply.status).toBe(404);
    expect(reply.body.error).toMatchObject({ kind: "not-found", source: "bd show" });
  });

  it("should still show the issue and name bd comments as the source when its comments cannot be read", async () => {
    const id = await store.create("Comments fail");
    const failing = await failingBd(["comments"]);
    cleanup.push(failing.remove);
    const broken = await start({ bdEnv: failing.env });
    cleanup.push(broken.close);
    const reply = await get(`/api/issues/${id}`, broken);
    expect(reply.status).toBe(200);
    expect(reply.body.issue.id).toBe(id);
    expect(reply.body.comments).toBeNull();
    expect(reply.body.commentsError).toMatchObject({
      kind: "failed",
      source: "bd comments",
      exitCode: 1,
    });
  });
});

describe("POST /api/issues/:id/status", () => {
  it("should move the issue with a guarded write when the shown status still holds", async () => {
    const id = await store.create("Move me");
    const reply = await post(`/api/issues/${id}/status`, { to: "in_progress", shown: "open" });
    expect(reply).toEqual({ status: 200, body: { id, status: "in_progress" } });
    expect((await store.show(id)).status).toBe("in_progress");
  });

  it("should answer 409 with exit 13 and write nothing when another actor moved it first", async () => {
    const id = await store.create("Raced");
    await store.bd("update", id, "--status", "blocked");
    const reply = await post(`/api/issues/${id}/status`, { to: "in_progress", shown: "open" });
    expect(reply.status).toBe(409);
    expect(reply.body.error).toMatchObject({ kind: "stale", source: "bd update", exitCode: 13 });
    expect((await store.show(id)).status).toBe("blocked");
  });

  it("should answer 400 when the body names no shown status", async () => {
    const id = await store.create("No guard");
    const reply = await post(`/api/issues/${id}/status`, { to: "in_progress" });
    expect(reply.status).toBe(400);
    expect((await store.show(id)).status).toBe("open");
  });
});

describe("POST /api/issues/:id/priority", () => {
  it("should write the priority guarded by the shown status", async () => {
    const id = await store.create("Reprioritize", { priority: 3 });
    const reply = await post(`/api/issues/${id}/priority`, { priority: 0, shown: "open" });
    expect(reply).toEqual({ status: 200, body: { id, priority: 0 } });
    expect((await store.show(id)).priority).toBe(0);
  });

  it("should answer 409 with exit 13 and keep the priority when the status changed elsewhere", async () => {
    const id = await store.create("Priority raced", { priority: 3 });
    await store.bd("update", id, "--status", "in_progress");
    const reply = await post(`/api/issues/${id}/priority`, { priority: 0, shown: "open" });
    expect(reply.status).toBe(409);
    expect(reply.body.error).toMatchObject({ kind: "stale", exitCode: 13 });
    expect((await store.show(id)).priority).toBe(3);
  });
});

describe("POST /api/issues/:id/rank", () => {
  it("should write metadata.rank between the neighbours' keys and leave the neighbours as they were", async () => {
    const above = await store.create("Ranked above", { rank: "a0" });
    const below = await store.create("Ranked below", { rank: "a1" });
    const card = await store.create("Dropped between");
    const reply = await post(`/api/issues/${card}/rank`, { shown: "open", above, below });
    expect(reply.status).toBe(200);
    const key = reply.body.rank as string;
    expect("a0" < key && key < "a1").toBe(true);
    expect((await store.show(card)).metadata?.rank).toBe(key);
    expect((await store.show(above)).metadata?.rank).toBe("a0");
    expect((await store.show(below)).metadata?.rank).toBe("a1");
  });

  it("should answer 422 naming the neighbour when its rank is malformed, and write nothing", async () => {
    const above = await store.create("Malformed above");
    // bd types a --set-metadata value from its spelling, so this stores the number 0.5.
    await store.bd("update", above, "--set-metadata", "rank=0.5");
    const card = await store.create("Not reordered");
    const reply = await post(`/api/issues/${card}/rank`, { shown: "open", above });
    expect(reply.status).toBe(422);
    expect(reply.body.error).toMatchObject({
      kind: "malformed-rank",
      source: `metadata.rank of ${above}`,
    });
    expect((await store.show(card)).metadata?.rank).toBeUndefined();
  });

  it("should answer 409 stale when a neighbour moved to another status", async () => {
    const above = await store.create("Moved neighbour", { rank: "a0" });
    await store.bd("update", above, "--status", "in_progress");
    const card = await store.create("Stale reorder");
    const reply = await post(`/api/issues/${card}/rank`, { shown: "open", above });
    expect(reply.status).toBe(409);
    expect(reply.body.error).toMatchObject({
      kind: "stale",
      message: `${above} is now in_progress, not open`,
    });
  });

  it("should answer 409 with exit 13 when the card itself moved before its rank was written", async () => {
    const card = await store.create("Card moved");
    await store.bd("update", card, "--status", "deferred");
    const reply = await post(`/api/issues/${card}/rank`, { shown: "open" });
    expect(reply.status).toBe(409);
    expect(reply.body.error).toMatchObject({ kind: "stale", exitCode: 13 });
    expect((await store.show(card)).metadata?.rank).toBeUndefined();
  });

  it("should refuse a reorder while views.rank is off, read at call time", async () => {
    const card = await store.create("Rank off");
    await writeFile(join(store.dir, "beads-ui.toml"), "[views]\nrank = false\n");
    try {
      const reply = await post(`/api/issues/${card}/rank`, { shown: "open" });
      expect(reply.status).toBe(409);
      expect(reply.body.error).toMatchObject({ kind: "rank-off", source: "views.rank" });
    } finally {
      await rm(join(store.dir, "beads-ui.toml"));
    }
    expect((await post(`/api/issues/${card}/rank`, { shown: "open" })).status).toBe(200);
  });
});

describe("stopping the server", () => {
  it("should finish a write in flight, its bd call included, before it stops", async () => {
    const id = await store.create("Written during the stop");
    const slow = await slowBd(["update"], 2);
    cleanup.push(slow.remove);
    const stopping = await start({ bdEnv: slow.env });
    const write = fetch(new URL(`/api/issues/${id}/status`, stopping.url), {
      method: "POST",
      headers: writeHeaders(stopping),
      body: JSON.stringify({ to: "in_progress", shown: "open" }),
    });
    // The stop starts once the server's bd update is running.
    await expect
      .poll(() =>
        access(slow.marker).then(
          () => true,
          () => false,
        ),
      )
      .toBe(true);

    await stopping.close();

    expect((await write).status).toBe(200);
    expect((await store.show(id)).status).toBe("in_progress");
  });
  it("should not resolve its stop while a request whose client went away still runs its bd call", async () => {
    const id = await store.create("Abandoned during the stop");
    const slow = await slowBd(["update"], 2);
    cleanup.push(slow.remove);
    const stopping = await start({ bdEnv: slow.env });
    const abort = new AbortController();
    const write = fetch(new URL(`/api/issues/${id}/status`, stopping.url), {
      method: "POST",
      headers: writeHeaders(stopping),
      body: JSON.stringify({ to: "in_progress", shown: "open" }),
      signal: abort.signal,
    }).catch(() => undefined);
    await expect
      .poll(() =>
        access(slow.marker).then(
          () => true,
          () => false,
        ),
      )
      .toBe(true);
    abort.abort();
    await write;

    await stopping.close();

    // Read straight after the stop: the abandoned handler's bd update has already written.
    expect((await store.show(id)).status).toBe("in_progress");
  });
});
