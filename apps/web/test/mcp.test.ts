import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../server/server.ts";
import {
  type HostEnv,
  hostConfig,
  hostEnv,
  type Reply,
  repoName,
  runCli,
  SAME_ORIGIN_WRITE,
  send,
  signIn,
} from "./auth-env.ts";
import { createStore, type TestStore } from "./store.ts";

// The MCP server's routes on the running server (web app design Phase W4, D-17): the dispatch
// requests it submits with the MCP token, the refusals the web server makes, the drafts it keeps
// until the user confirms them, and what a receiver is then offered, read through the receiver
// API with the receiving host's own token.

let store: TestStore;
let env: HostEnv;
let server: RunningServer;
let cookie: string;
let mcpToken: string;
let receiverToken: string;
let counter = 0;

const HOST = "host-b";

const requestId = () => {
  counter += 1;
  return `mcp-route-test-${String(counter).padStart(6, "0")}`;
};

const mcp = (path: string, body: unknown, token: string | null = mcpToken): Promise<Reply> =>
  send(server, `/api/mcp/v1/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });

const listed = async (owner: string) =>
  (
    (
      await send(server, `/api/receiver/v1/dispatches?session=${owner}`, {
        headers: { authorization: `Bearer ${receiverToken}` },
      })
    ).json() as { dispatches: { id: string; task: { repo: string; id: string } }[] }
  ).dispatches;

let session = 0;
async function ownedTask() {
  session += 1;
  const owner = `route-worker-${session}`;
  const id = await store.create(`Task for ${owner}`, { status: "in_progress" });
  await store.bd("update", id, "--assignee", owner);
  return { id, owner, repo: repoName(store.dir) };
}

beforeAll(async () => {
  store = await createStore("mcp");
  env = await hostEnv();
  const name = repoName(store.dir);
  await env.write(
    hostConfig({
      allowRepos: [name],
      auth: { signing_key: "state:dispatch-signing-key", signing_key_id: "host-a-20261110" },
      extra: [`[hosts.${HOST}]\nallow_repos = ["${name}"]`, `[dispatch]\nhost = "${HOST}"`].join(
        "\n\n",
      ),
    }),
  );
  receiverToken = (await runCli(env, store.dir, ["issue-receiver-token", HOST])).stdout.trim();
  const clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
  server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: env.configEnv,
  });
  cookie = await signIn(server);
  mcpToken = (await readFile(join(env.stateDir, "mcp-token"), "utf8")).trim();
});

afterAll(async () => {
  await server?.close();
  await env?.remove();
  await store?.remove();
});

describe("an MCP dispatch request the web server refuses (W4)", () => {
  it("should refuse a request with no MCP token, or another route's credential, and write nothing", async () => {
    const { id, owner, repo } = await ownedTask();
    const request = { id: requestId(), user: "owner", repo, task: id, text: "Go" };
    expect((await mcp("dispatches", request, null)).status).toBe(401);
    expect((await mcp("dispatches", request, receiverToken)).status).toBe(401);
    expect((await mcp("drafts", request, "x".repeat(43))).status).toBe(401);
    expect(await listed(owner)).toEqual([]);
    expect((await mcp("dispatches", request)).status).toBe(201);
    expect(await listed(owner)).toHaveLength(1);
  });

  it("should refuse a request that names a user other than the host's configured user", async () => {
    const { id, owner, repo } = await ownedTask();
    for (const path of ["dispatches", "drafts"]) {
      const reply = await mcp(path, {
        id: requestId(),
        user: "intruder",
        repo,
        task: id,
        text: "Go",
      });
      expect(reply.status).toBe(403);
      expect(reply.text).toMatch(/other than this host's configured user/);
    }
    const unnamed = await mcp("dispatches", { id: requestId(), repo, task: id, text: "Go" });
    expect(unnamed.status).toBe(403);
    expect(await listed(owner)).toEqual([]);
  });

  it("should refuse a request that repeats a dispatch id, whether it was sent or drafted", async () => {
    const { id, owner, repo } = await ownedTask();
    const sent = { id: requestId(), user: "owner", repo, task: id, text: "Once" };
    expect((await mcp("dispatches", sent)).status).toBe(201);
    const again = await mcp("dispatches", sent);
    expect(again.status).toBe(409);
    expect(again.text).toMatch(/already used/);
    expect((await mcp("drafts", sent)).status).toBe(409);
    const drafted = { ...sent, id: requestId() };
    expect((await mcp("drafts", drafted)).status).toBe(201);
    expect((await mcp("dispatches", drafted)).status).toBe(409);
    expect(await listed(owner)).toHaveLength(1);
  });

  it("should refuse a task outside the host's allowlist without naming the repository", async () => {
    for (const path of ["dispatches", "drafts"]) {
      const reply = await mcp(path, {
        id: requestId(),
        user: "owner",
        repo: "unlisted-private-repo",
        task: "x-1",
        text: "Go",
      });
      expect(reply.status).toBe(403);
      expect(reply.text).toMatch(/allowlist/);
      expect(reply.text).not.toContain("unlisted-private-repo");
    }
  });
});

describe("a draft (W4)", () => {
  it("should send nothing until the user confirms it in the web app, then send it once", async () => {
    const { id, owner, repo } = await ownedTask();
    const draftId = requestId();
    const drafted = await mcp("drafts", {
      id: draftId,
      user: "owner",
      repo,
      task: id,
      text: "Wait",
    });
    expect(drafted.status).toBe(201);
    await server.ladder.idle();
    expect(await listed(owner)).toEqual([]);
    const waiting = (await send(server, "/api/drafts", { headers: { cookie } })).json() as {
      drafts: { id: string; text: string }[];
    };
    expect(waiting.drafts.find((draft) => draft.id === draftId)?.text).toBe("Wait");

    const confirm = () =>
      send(server, `/api/drafts/${draftId}/confirm`, {
        method: "POST",
        headers: { ...SAME_ORIGIN_WRITE, cookie },
        body: "{}",
      });
    const first = await confirm();
    expect(first.status, first.text).toBe(201);
    expect((await listed(owner)).map((one) => one.task.id)).toEqual([id]);
    const second = await confirm();
    expect(second.status).toBe(409);
    expect(await listed(owner)).toHaveLength(1);
    const after = (await send(server, "/api/drafts", { headers: { cookie } })).json() as {
      drafts: { id: string }[];
    };
    expect(after.drafts.map((draft) => draft.id)).not.toContain(draftId);
  });

  it("should refuse a confirm that names a user other than the configured user", async () => {
    const { id, owner, repo } = await ownedTask();
    const draftId = requestId();
    await mcp("drafts", { id: draftId, user: "owner", repo, task: id, text: "Mine" });
    const reply = await mcp(`drafts/${draftId}/confirm`, { user: "intruder" });
    expect(reply.status).toBe(403);
    expect(await listed(owner)).toEqual([]);
    expect((await mcp(`drafts/${draftId}/confirm`, { user: "owner" })).status).toBe(201);
    expect(await listed(owner)).toHaveLength(1);
  });

  it("should keep a draft's text out of the store once it is sent", async () => {
    const { id, repo } = await ownedTask();
    const draftId = requestId();
    await mcp("drafts", { id: draftId, user: "owner", repo, task: id, text: "Private words" });
    await mcp(`drafts/${draftId}/confirm`, { user: "owner" });
    const file = await readFile(join(env.stateDir, "mcp-drafts.json"), "utf8");
    expect(file).not.toContain("Private words");
  });
});
