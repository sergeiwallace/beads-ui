import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { filterAllowed, isAllowed } from "../server/allowlist.ts";
import { ROUTES, type Route } from "../server/routes.ts";
import { startServer } from "../server/server.ts";
import { type HostEnv, hostConfig, hostEnv, repoName, runCli, send, signIn } from "./auth-env.ts";
import { createStore, slowBd, type TestStore } from "./store.ts";

// T-W0.2: the per-host repository allowlist, through requests to the running server.

const UNLISTED = "private-notes";

interface QueueRow {
  id: string;
  repo?: string;
}

/**
 * Routes the queue reader, the dispatch writer and the receiver body will be: each reads its rows
 * or its target through the allowlist exactly as those legs must.
 */
const probeRoutes = (rows: QueueRow[]): Route[] => [
  {
    method: "GET",
    path: "/api/probe/queue",
    handle: async (_request, context) => ({
      status: 200,
      body: {
        rows: filterAllowed(
          rows,
          (row) => row.repo,
          await context.allowlist(),
          context.health,
          "work queue",
        ),
      },
    }),
  },
  {
    method: "POST",
    path: "/api/probe/dispatch",
    dispatch: true,
    handle: async ({ body }, context) => {
      const { host, repo } = body as { host: string; repo: string };
      return isAllowed(await context.allowlist(host), repo)
        ? { status: 200, body: { queued: true } }
        : {
            status: 403,
            body: { error: { kind: "forbidden", message: `not on ${host}'s allowlist` } },
          };
    },
  },
  {
    method: "GET",
    path: "/api/receiver/v1/probe/body",
    handle: async ({ caller, query }, context) =>
      caller.kind === "receiver" &&
      isAllowed(await context.allowlist(caller.host), query.get("repo") ?? "")
        ? { status: 200, body: "the dispatch body" }
        : { status: 404, body: "" },
  },
];

let store: TestStore;
let env: HostEnv;
let clientDir: string;
const cleanup: (() => Promise<void>)[] = [];

const listing = (repos: string[] | undefined, extra?: string) =>
  hostConfig({ allowRepos: repos, ...(extra === undefined ? {} : { extra }) });

async function start(options: { bdEnv?: NodeJS.ProcessEnv; rows?: QueueRow[] } = {}) {
  const server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: env.configEnv,
    routes: [...ROUTES, ...probeRoutes(options.rows ?? [])],
    ...(options.bdEnv === undefined ? {} : { bdEnv: options.bdEnv }),
  });
  cleanup.push(server.close);
  return server;
}

const reached = (marker: string) =>
  access(marker).then(
    () => true,
    () => false,
  );

beforeAll(async () => {
  store = await createStore("allow");
  env = await hostEnv();
  clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>beads-ui client</title>");
});

afterAll(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
  await store?.remove();
  await env?.remove();
});

describe("opening stores", () => {
  it("should open the served store when its repository is on [hosts] allow_repos", async () => {
    await env.write(listing([repoName(store.dir)]));
    const server = await start();
    expect(server.storeClosed).toBeUndefined();
    const cookie = await signIn(server);
    expect((await send(server, "/api/board", { headers: { cookie } })).status).toBe(200);
  });

  it("should run no bd command against a store whose repository is not listed, and not name it", async () => {
    await env.write(listing(["some-work-repo"]));
    const watched = await slowBd(["where", "list", "statuses", "show", "comments", "update"], 0);
    cleanup.push(watched.remove);
    const server = await start({ bdEnv: watched.env });
    expect(server.storeClosed).toContain("not on [hosts] allow_repos");
    const cookie = await signIn(server);
    const board = await send(server, "/api/board", { headers: { cookie } });
    expect(board.status).toBe(503);
    expect(board.json()).toMatchObject({
      error: { kind: "store-closed", source: "[hosts] allow_repos" },
    });
    expect(board.text).not.toContain(repoName(store.dir));
    expect(await reached(watched.marker)).toBe(false);

    // Read at call time: listing the repository opens the store without a restart.
    await env.write(listing([repoName(store.dir)]));
    expect((await send(server, "/api/board", { headers: { cookie } })).status).toBe(200);
    expect(await reached(watched.marker)).toBe(true);
  });

  it("should open no store and say why when the allowlist is missing", async () => {
    await env.write(listing(undefined));
    const server = await start();
    expect(server.storeClosed).toContain("[hosts] allow_repos is missing");
    const cookie = await signIn(server);
    const board = await send(server, "/api/board", { headers: { cookie } });
    expect(board.status).toBe(503);
    expect(board.json()).toMatchObject({
      error: { message: expect.stringContaining("[hosts] allow_repos is missing") },
    });
    const health = await send(server, "/api/health", { headers: { cookie } });
    expect(health.json()).toMatchObject({ allowlist: { readable: false } });
  });

  it("should open no store and say why when the allowlist is not a list", async () => {
    await env.write(
      listing([repoName(store.dir)]).replace(/allow_repos = .*/, 'allow_repos = "everything"'),
    );
    const server = await start();
    expect(server.storeClosed).toContain("must be a list of repository names");
    const cookie = await signIn(server);
    expect((await send(server, "/api/board", { headers: { cookie } })).status).toBe(503);
  });

  it("should close the store when the allowlist file stops parsing", async () => {
    await env.write(listing([repoName(store.dir)]));
    const server = await start();
    const cookie = await signIn(server);
    await env.write(`${listing([repoName(store.dir)])}\nthis is not toml\n`);
    const board = await send(server, "/api/board", { headers: { cookie } });
    expect(board.status).toBe(503);
    expect(board.json()).toMatchObject({
      error: { message: expect.stringContaining("cannot be read") },
    });
  });
});

describe("queue rows", () => {
  it("should return only the rows of allowlisted repositories and count the rest in a health line without naming them", async () => {
    const listed = repoName(store.dir);
    await env.write(listing([listed]));
    const server = await start({
      rows: [
        { id: "kept", repo: listed },
        { id: "dropped", repo: UNLISTED },
        { id: "unattributed" },
      ],
    });
    const cookie = await signIn(server);
    const queue = await send(server, "/api/probe/queue", { headers: { cookie } });
    expect(queue.json()).toEqual({ rows: [{ id: "kept", repo: listed }] });
    expect(queue.text).not.toContain(UNLISTED);
    const health = await send(server, "/api/health", { headers: { cookie } });
    expect(health.json()).toMatchObject({
      hidden: 2,
      lines: ["2 rows from repositories not on this host's allowlist are hidden"],
    });
    const board = await send(server, "/api/board", { headers: { cookie } });
    expect(board.json()).toMatchObject({
      health: ["2 rows from repositories not on this host's allowlist are hidden"],
    });
    for (const reply of [health, board]) expect(reply.text).not.toContain(UNLISTED);
  });

  it("should return no queue row while the allowlist is unreadable", async () => {
    await env.write(listing(undefined));
    const server = await start({ rows: [{ id: "kept", repo: repoName(store.dir) }] });
    const cookie = await signIn(server);
    const queue = await send(server, "/api/probe/queue", { headers: { cookie } });
    expect(queue.json()).toEqual({ rows: [] });
  });
});

const PUBLISHED = `[hosts.host-b]\nallow_repos = ["work-repo"]`;

describe("dispatch targets and receiver bodies", () => {
  it("should refuse a dispatch whose task repository is not on the target host's published allowlist", async () => {
    await env.write(listing([repoName(store.dir)], PUBLISHED));
    const server = await start();
    const cookie = await signIn(server);
    const dispatch = (host: string, repo: string) =>
      send(server, "/api/probe/dispatch", {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
          "x-beads-ui": "1",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ host, repo }),
      });
    expect((await dispatch("host-b", "work-repo")).status).toBe(200);
    expect((await dispatch("host-b", UNLISTED)).status).toBe(403);
    expect((await dispatch("host-c", "work-repo")).status).toBe(403);
  });

  it("should return a dispatch body only when its repository is on the requesting host's allowlist", async () => {
    await env.write(listing([repoName(store.dir)], PUBLISHED));
    const server = await start();
    const issued = await runCli(env, store.dir, ["issue-receiver-token", "host-b"]);
    const headers = { authorization: `Bearer ${issued.stdout.trim()}` };
    const listed = await send(server, "/api/receiver/v1/probe/body?repo=work-repo", { headers });
    expect(listed.status).toBe(200);
    expect(listed.text).toBe("the dispatch body");
    const unlisted = await send(server, `/api/receiver/v1/probe/body?repo=${UNLISTED}`, {
      headers,
    });
    expect(unlisted.status).toBe(404);
    expect(unlisted.text).toBe("");
  });
});
