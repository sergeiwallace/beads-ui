import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../server/server.ts";
import { type HostEnv, hostConfig, hostEnv, repoName, signIn } from "./auth-env.ts";
import { createStore, type LockedBd, lockedBd, type TestStore } from "./store.ts";

// The web server's bd calls on one store, through its HTTP routes, against a bd that runs one call
// at a time, as an embedded store does, and takes 3 s per `bd list` (beads-ui design, the bd-node
// adapter).

let store: TestStore;
let host: HostEnv;
let clientDir: string;
let slow: LockedBd;
let server: RunningServer | undefined;
let cookie = "";

const hosts = (extra?: string) =>
  hostConfig({ allowRepos: [repoName(store.dir)], ...(extra === undefined ? {} : { extra }) });

async function start() {
  server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: host.configEnv,
    bdEnv: slow.env,
  });
  cookie = await signIn(server);
  return server;
}

async function board(on: RunningServer, signal?: AbortSignal) {
  const response = await fetch(new URL("/api/board", on.url), {
    headers: { cookie },
    ...(signal === undefined ? {} : { signal }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const listCalls = async () =>
  (await readFile(slow.calls, "utf8").catch(() => "")).split("\n").filter(Boolean).length;

beforeAll(async () => {
  store = await createStore("queue");
  await store.create("Read under load");
  host = await hostEnv();
  clientDir = await mkdtemp(join(tmpdir(), "beads-ui-web-client-"));
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await slow?.remove();
});

afterAll(async () => {
  await store?.remove();
  await host?.remove();
  if (clientDir !== undefined) await rm(clientDir, { recursive: true });
});

describe("one store's bd calls", () => {
  it("should answer four Board reads made at once, none timing out, when each bd list takes 3 s and the store runs one at a time", async () => {
    await host.write(hosts());
    slow = await lockedBd(["list"], 3);
    const on = await start();

    const replies = await Promise.all([board(on), board(on), board(on), board(on)]);

    expect(replies.map((reply) => reply.status)).toEqual([200, 200, 200, 200]);
    expect(await listCalls()).toBe(8);
  }, 120_000);

  it("should answer a read that waited longer than [web] bd_queue_wait_seconds with a failure naming the wait, read at the call", async () => {
    await host.write(hosts());
    slow = await lockedBd(["list"], 3);
    const on = await start();
    // Set after the start: the bound is read at each call.
    await host.write(hosts("[web]\nbd_queue_wait_seconds = 2"));

    const replies = await Promise.all([board(on), board(on)]);

    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 502]);
    const failed = replies.find((reply) => reply.status !== 200);
    expect(JSON.stringify(failed?.body)).toContain(
      "waited 2000 ms for this store's earlier bd calls and did not run",
    );
  }, 120_000);

  it("should drop a queued read whose request was abandoned before its bd call started", async () => {
    await host.write(hosts());
    slow = await lockedBd(["list"], 3);
    const on = await start();
    const first = board(on);
    await expect.poll(listCalls, { timeout: 20_000 }).toBe(1);
    const abandoned = new AbortController();
    const second = board(on, abandoned.signal).catch(() => undefined);
    // The second read is in line behind the first's bd list when its client goes away.
    await new Promise((resolve) => setTimeout(resolve, 500));
    abandoned.abort();
    await second;

    expect((await first).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    expect(await listCalls()).toBe(2);
  }, 120_000);
});
