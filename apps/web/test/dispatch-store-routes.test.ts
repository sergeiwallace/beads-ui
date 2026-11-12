import { appendFile, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JOURNAL_FILE } from "../server/dispatch-store/local.ts";
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

// The local dispatch store through the running server (web app design T-W0.5): a restart keeps
// every outstanding dispatch with its receipts, and a store that cannot be written refuses a new
// dispatch through the route, says why, and never reports it queued. The contract suite covers
// the same rules against the store itself; these go in through the routes a user's request takes.

const HOST = "host-b";

let store: TestStore;
let env: HostEnv;
let clientDir: string;
let token: string;
let session = 0;

interface Written {
  dispatch: { id: string; state: string };
}

type Indicators = Record<"delivery" | "response", { text: string; source: string }>;

const start = () =>
  startServer({ repoRoot: store.dir, port: 0, clientDir, configEnv: env.configEnv });

async function post(server: RunningServer, path: string, body: unknown): Promise<Reply> {
  const cookie = await signIn(server);
  return send(server, path, {
    method: "POST",
    headers: { ...SAME_ORIGIN_WRITE, cookie },
    body: JSON.stringify(body),
  });
}

async function status(server: RunningServer, id: string): Promise<Indicators> {
  const cookie = await signIn(server);
  const reply = await send(server, `/api/dispatch/${id}`, { headers: { cookie } });
  expect(reply.status, reply.text).toBe(200);
  return reply.json() as Indicators;
}

const receipt = (server: RunningServer, id: string, worker: string, state: string) =>
  send(server, `/api/receiver/v1/dispatches/${id}/receipts`, {
    method: "POST",
    body: JSON.stringify({ session: worker, state }),
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });

async function ownedTask(): Promise<{ id: string; worker: string }> {
  session += 1;
  const worker = `store-worker-${session}`;
  const id = await store.create(`Store task ${session}`, { status: "in_progress" });
  await store.bd("update", id, "--assignee", worker);
  return { id, worker };
}

const comments = async (id: string) =>
  (JSON.parse(await store.bd("comments", id, "--json")) as { text: string }[] | null) ?? [];

beforeAll(async () => {
  store = await createStore("store-routes");
  env = await hostEnv();
  const name = repoName(store.dir);
  await env.write(
    hostConfig({
      allowRepos: [name],
      auth: { signing_key: "state:dispatch-signing-key", signing_key_id: "host-a-20261109" },
      extra: [`[hosts.${HOST}]\nallow_repos = ["${name}"]`, `[dispatch]\nhost = "${HOST}"`].join(
        "\n\n",
      ),
    }),
  );
  clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
  token = (await runCli(env, store.dir, ["issue-receiver-token", HOST])).stdout.trim();
});

afterAll(async () => {
  await env?.remove();
  await store?.remove();
});

describe("the local dispatch store across a restart (T-W0.5)", () => {
  it("should show an outstanding dispatch with the receipt it was given before the server stopped", async () => {
    const task = await ownedTask();
    const first = await start();
    let id: string;
    try {
      const written = await post(first, "/api/dispatch/prompt", {
        repo: repoName(store.dir),
        task: task.id,
        text: "Taken, then a restart",
      });
      expect(written.status, written.text).toBe(201);
      id = (written.json() as Written).dispatch.id;
      expect((await receipt(first, id, task.worker, "taken")).status).toBe(204);
      expect((await status(first, id)).delivery.text).toBe("taken");
    } finally {
      await first.close();
    }

    const second = await start();
    try {
      const after = await status(second, id);
      expect(after.delivery).toMatchObject({
        text: "taken",
        source: `receipt from ${task.worker}@${HOST}`,
      });
      expect(after.response.text).toBe("working on it");
      // The recovered dispatch still takes the next receipt in order.
      expect((await receipt(second, id, task.worker, "acted")).status).toBe(204);
      expect((await status(second, id)).delivery.text).toBe("acted on");
    } finally {
      await second.close();
    }
  });
});

describe("the same dispatch id written twice (T-W0.5)", () => {
  it("should keep one record, with its receipts, when the journal holds its create line twice", async () => {
    // Every route mints a new dispatch id, so a repeated id reaches the store only through its
    // journal: a create line written again, as a retried append would, after a receipt landed.
    const task = await ownedTask();
    const journal = join(env.stateDir, JOURNAL_FILE);
    const first = await start();
    let id: string;
    try {
      const written = await post(first, "/api/dispatch/prompt", {
        repo: repoName(store.dir),
        task: task.id,
        text: "Written, then its create line again",
      });
      expect(written.status, written.text).toBe(201);
      id = (written.json() as Written).dispatch.id;
      expect((await receipt(first, id, task.worker, "taken")).status).toBe(204);
    } finally {
      await first.close();
    }
    const lines = (await readFile(journal, "utf8")).split("\n");
    const create = lines.find((line) => line.includes('"op":"create"') && line.includes(id));
    expect(create, "the dispatch's create line in the journal").toBeDefined();
    await appendFile(journal, `${create}\n`);

    const second = await start();
    try {
      const listed = await send(second, `/api/receiver/v1/dispatches?session=${task.worker}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(listed.status, listed.text).toBe(200);
      const ids = (listed.json() as { dispatches: { id: string }[] }).dispatches.map((d) => d.id);
      expect(ids.filter((one) => one === id)).toHaveLength(1);
      expect((await status(second, id)).delivery.text).toBe("taken");
    } finally {
      await second.close();
    }
  });
});

describe("a dispatch store that cannot be written (T-W0.5)", () => {
  it("should refuse a prompt through the route, say why, and report nothing queued", async () => {
    const task = await ownedTask();
    const server = await start();
    const journal = join(env.stateDir, JOURNAL_FILE);
    try {
      // A first dispatch writes the journal, so the refusal below is about writing, not creating.
      const before = await post(server, "/api/dispatch/prompt", {
        repo: repoName(store.dir),
        task: task.id,
        text: "Written while the store is writable",
      });
      expect(before.status, before.text).toBe(201);
      const commentsBefore = (await comments(task.id)).length;

      await chmod(journal, 0o400);
      const refused = await post(server, "/api/dispatch/prompt", {
        repo: repoName(store.dir),
        task: task.id,
        text: "Written while the store is read-only",
      });
      expect(refused.status).toBeGreaterThanOrEqual(400);
      expect(refused.status).not.toBe(201);
      expect((refused.json() as { error: { message: string } }).error.message).toMatch(
        /cannot write|refused/,
      );
      expect(refused.text).not.toMatch(/"state":"queued"/);
      expect(refused.text).not.toContain("Written while the store is read-only");
      expect(await comments(task.id)).toHaveLength(commentsBefore);
    } finally {
      await chmod(journal, 0o600);
      await server.close();
    }
  });
});
