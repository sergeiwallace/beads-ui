import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type RunningServer, startServer } from "../server/server.ts";
import {
  type HostEnv,
  hostConfig,
  hostEnv,
  repoName,
  SAME_ORIGIN_WRITE,
  send,
  signIn,
} from "./auth-env.ts";
import { createStore, type TestStore } from "./store.ts";

// The dispatch ladder across a server restart (web app design T-W2.1, D-6): a coalescing window
// or a shown deadline that was running when the server stopped is planned again when it starts,
// rather than left to the turn-end pickup alone. The carriers are the stand-in fleet tools.

const FAKE_TOOL = fileURLToPath(new URL("./fixtures/fake-fleet-tool.mjs", import.meta.url));
const HOST = "host-b";

let store: TestStore;
let env: HostEnv;
let tools: string;
let clientDir: string;
let session = 0;

const tool = (name: string) => JSON.stringify([process.execPath, FAKE_TOOL, tools, name]);

function config(coalesce: number, shownWithin: number) {
  const name = repoName(store.dir);
  return hostConfig({
    allowRepos: [name],
    auth: { signing_key: "state:dispatch-signing-key", signing_key_id: "host-a-20261109" },
    extra: [
      `[hosts.${HOST}]\nallow_repos = ["${name}"]`,
      `[dispatch]\nhost = "${HOST}"\ncoalesce_window_s = ${coalesce}\nshown_within_s = ${shownWithin}`,
      `[dispatch.carriers]\nagent_mail_command = ${tool("agent-mail")}`,
      `[dispatch.local]\nprompt_injection_command = ${tool("prompt-injection")}`,
    ].join("\n\n"),
  });
}

async function calls(name: string): Promise<{ args: string[] }[]> {
  const path = join(tools, `${name}.jsonl`);
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { args: string[] });
}

const start = () =>
  startServer({ repoRoot: store.dir, port: 0, clientDir, configEnv: env.configEnv });

async function prompt(server: RunningServer, task: string, text: string): Promise<string> {
  const cookie = await signIn(server);
  const reply = await send(server, "/api/dispatch/prompt", {
    method: "POST",
    headers: { ...SAME_ORIGIN_WRITE, cookie },
    body: JSON.stringify({ repo: repoName(store.dir), task, text }),
  });
  expect(reply.status, reply.text).toBe(201);
  return (reply.json() as { dispatch: { id: string } }).dispatch.id;
}

async function ownedTask(): Promise<string> {
  session += 1;
  const id = await store.create(`Restart task ${session}`, { status: "in_progress" });
  await store.bd("update", id, "--assignee", `restart-worker-${session}`);
  return id;
}

const waitFor = <T>(check: () => Promise<T>) =>
  vi.waitFor(check, { timeout: 20_000, interval: 100 });

beforeAll(async () => {
  store = await createStore("restart");
  env = await hostEnv();
  tools = join(env.configHome, "tools");
  await mkdir(tools, { recursive: true });
  await mkdir(join(env.configHome, "ai-harness"), { recursive: true });
  await writeFile(
    join(env.configHome, "ai-harness", "idle-wake.json"),
    JSON.stringify({ schema: 1, automatic_wakes: true }),
  );
  clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
});

afterAll(async () => {
  await env?.remove();
  await store?.remove();
});

describe("the ladder across a restart (T-W2.1)", () => {
  it("should carry a dispatch whose coalescing window was running when the server stopped", async () => {
    await env.write(config(30, 30));
    const task = await ownedTask();
    const first = await start();
    const dispatch = await prompt(first, task, "Written just before a restart");
    await first.close();
    expect(await calls("agent-mail")).toEqual([]);

    const second = await start();
    try {
      await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
      const [mail] = await calls("agent-mail");
      expect(mail?.args[mail.args.indexOf("--subject") + 1]).toBe(`beads-ui dispatch ${dispatch}`);
    } finally {
      await second.close();
    }
  });

  it("should try the next rung for a carried dispatch whose shown deadline was running when the server stopped", async () => {
    // The first server's shown deadline is far off, so it cannot try the next rung before it
    // stops however slow the stop is; the second reads the short one at its start.
    await env.write(config(0, 600));
    const task = await ownedTask();
    const before = (await calls("agent-mail")).length;
    const first = await start();
    const dispatch = await prompt(first, task, "Carried, then a restart");
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(before + 1));
    await first.close();
    expect(await calls("prompt-injection")).toEqual([]);

    await env.write(config(0, 2));
    const second = await start();
    try {
      // Every carried dispatch whose deadline the stop cut short is planned again, the first
      // test's included, so this one is found by its own claim key.
      const claim = `beads-ui-dispatch-${dispatch}`;
      const keyOf = (call: { args: string[] }) => call.args[call.args.indexOf("--key") + 1];
      await waitFor(async () =>
        expect((await calls("prompt-injection")).map(keyOf)).toContain(claim),
      );
    } finally {
      await second.close();
    }
  });
});
