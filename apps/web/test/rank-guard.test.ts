import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "../server/server.ts";
import {
  type HostEnv,
  hostConfig,
  hostEnv,
  repoName,
  SAME_ORIGIN_WRITE,
  send,
  signIn,
} from "./auth-env.ts";
import { scriptedBd, shQuote } from "./host-stores.ts";
import { createStore, type TestStore } from "./store.ts";

// T-3.2's reorder guard: the key written lies between the neighbours as they stand at the write,
// so a neighbour reordered after its key was read makes the reorder stale.

let store: TestStore;
let env: HostEnv;
let clientDir: string;
const cleanup: (() => Promise<void>)[] = [];

beforeAll(async () => {
  store = await createStore("race");
  env = await hostEnv(hostConfig({ allowRepos: [repoName(store.dir)] }));
  clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>beads-ui client</title>");
});

afterAll(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
  await store?.remove();
  await env?.remove();
});

/**
 * A bd that, the first time the server reads `neighbour`, answers with what the store holds and
 * then moves it: `change` is the bd update arguments another actor runs.
 */
async function serverWhereAfterItsRead(neighbour: string, change: string[]) {
  const flag = join(env.configHome, `moved-${neighbour}`);
  const racing = await scriptedBd(
    [
      `if [ "$1" = show ] && [ "$2" = ${shQuote(neighbour)} ] && [ ! -e ${shQuote(flag)} ]; then`,
      `  touch ${shQuote(flag)}`,
      '  "$REAL" "$@"; status=$?',
      `  "$REAL" update ${shQuote(neighbour)} ${change.map(shQuote).join(" ")} >/dev/null 2>&1`,
      "  exit $status",
      "fi",
    ].join("\n"),
  );
  cleanup.push(racing.remove);
  const server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: env.configEnv,
    bdEnv: racing.env,
  });
  cleanup.push(server.close);
  const cookie = await signIn(server);
  return (path: string, body: unknown) =>
    send(server, path, {
      method: "POST",
      headers: { ...SAME_ORIGIN_WRITE, cookie },
      body: JSON.stringify(body),
    });
}

describe("POST /api/issues/:id/rank with a neighbour moving under it", () => {
  it("should answer 409 and write no key when the neighbour above is reordered after its key was read", async () => {
    const above = await store.create("Above", { rank: "a0" });
    const below = await store.create("Below", { rank: "a1" });
    const card = await store.create("Dropped between");
    const post = await serverWhereAfterItsRead(above, [
      `--metadata=${JSON.stringify({ rank: "a5" })}`,
    ]);

    const reply = await post(`/api/issues/${card}/rank`, { shown: "open", above, below });

    expect(reply.status).toBe(409);
    expect(reply.json()).toMatchObject({
      error: { kind: "stale", message: expect.stringContaining(above) },
    });
    expect((await store.show(card)).metadata?.rank).toBeUndefined();
    expect((await store.show(above)).metadata?.rank).toBe("a5");
  });

  it("should answer 409 and write no key when the neighbour below changes status after its key was read", async () => {
    const above = await store.create("Above too", { rank: "a3" });
    const below = await store.create("Below too", { rank: "a4" });
    const card = await store.create("Dropped again");
    const post = await serverWhereAfterItsRead(below, ["--status", "in_progress"]);

    const reply = await post(`/api/issues/${card}/rank`, { shown: "open", above, below });

    expect(reply.status).toBe(409);
    expect(reply.json()).toMatchObject({
      error: { kind: "stale", message: expect.stringContaining(below) },
    });
    expect((await store.show(card)).metadata?.rank).toBeUndefined();
  });
});
