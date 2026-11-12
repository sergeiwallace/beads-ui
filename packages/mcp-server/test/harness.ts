// The MCP server under test, started over stdio as Claude Desktop starts it, against a running
// beads-ui web server over a real Beads store. The web server, its host settings and the fleet
// tool stand-ins are the web app's own test harness (apps/web/test).

import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { type RunningServer, startServer } from "../../../apps/web/server/server.ts";
import {
  type HostEnv,
  hostConfig,
  hostEnv,
  repoName,
  runCli,
  signIn,
} from "../../../apps/web/test/auth-env.ts";
import { createStore, type TestStore } from "../../../apps/web/test/store.ts";

export const BIN = fileURLToPath(new URL("../bin/beads-ui-mcp.mjs", import.meta.url));
const FAKE_TOOL = fileURLToPath(
  new URL("../../../apps/web/test/fixtures/fake-fleet-tool.mjs", import.meta.url),
);
export const HOST = "host-b";

export interface World {
  store: TestStore;
  env: HostEnv;
  server: RunningServer;
  cookie: string;
  /** The receiving host's token, to read what a receiver is offered. */
  receiverToken: string;
  /** Where the fleet tool stand-ins record their calls. */
  tools: string;
  url: string;
  close(): Promise<void>;
}

const tool = (tools: string, name: string) =>
  JSON.stringify([process.execPath, FAKE_TOOL, tools, name]);

export async function startWorld(): Promise<World> {
  const store = await createStore("mcp");
  const env = await hostEnv();
  const tools = join(env.configHome, "tools");
  await mkdir(tools, { recursive: true });
  const name = repoName(store.dir);
  await env.write(
    hostConfig({
      allowRepos: [name],
      auth: { signing_key: "state:dispatch-signing-key", signing_key_id: "host-a-20261110" },
      extra: [
        `[hosts.${HOST}]\nallow_repos = ["${name}"]`,
        `[dispatch]\nhost = "${HOST}"\ncoalesce_window_s = 0\nshown_within_s = 1`,
        [
          "[dispatch.carriers]",
          `agent_mail_command = ${tool(tools, "agent-mail")}`,
          `buzz_command = ${tool(tools, "buzz")}`,
          `git_inbox_command = ${tool(tools, "git-inbox")}`,
        ].join("\n"),
        [
          "[dispatch.local]",
          `prompt_injection_command = ${tool(tools, "prompt-injection")}`,
          `mod_submit_command = ${tool(tools, "mod-submit")}`,
        ].join("\n"),
      ].join("\n\n"),
    }),
  );
  await mkdir(join(env.configHome, "ai-harness"), { recursive: true });
  await writeFile(
    join(env.configHome, "ai-harness", "idle-wake.json"),
    JSON.stringify({ schema: 1, automatic_wakes: true }),
  );
  const clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
  const receiverToken = (
    await runCli(env, store.dir, ["issue-receiver-token", HOST])
  ).stdout.trim();
  const server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: env.configEnv,
  });
  const cookie = await signIn(server);
  return {
    store,
    env,
    server,
    cookie,
    receiverToken,
    tools,
    url: `http://127.0.0.1:${server.port}/`,
    async close() {
      await server.close();
      await env.remove();
      await store.remove();
    },
  };
}

export interface Connected {
  client: Client;
  close(): Promise<void>;
}

/**
 * Starts the server over stdio. With `app` the client advertises the MCP Apps capability, as
 * Claude Desktop does. `isolated` gives the server only a copy of the MCP token and the user, and
 * state and config homes of its own, so nothing of the web server's (its signing key included)
 * is within its reach.
 */
export async function connect(
  world: World,
  options: { app: boolean; isolated?: boolean; token?: string },
): Promise<Connected> {
  let env: Record<string, string>;
  let scratch: string | undefined;
  const base = { PATH: process.env.PATH ?? "", BEADS_UI_URL: world.url };
  if (options.isolated === true) {
    scratch = await mkdtemp(join(tmpdir(), "beads-ui-mcp-alone-"));
    const tokenFile = join(scratch, "token");
    if (options.token === undefined) {
      await copyFile(join(world.env.stateDir, "mcp-token"), tokenFile);
    } else {
      await writeFile(tokenFile, `${options.token}\n`);
    }
    env = {
      ...base,
      HOME: scratch,
      XDG_CONFIG_HOME: join(scratch, "config"),
      XDG_STATE_HOME: join(scratch, "state"),
      BEADS_UI_MCP_TOKEN_FILE: tokenFile,
      BEADS_UI_USER: "owner",
    };
  } else {
    env = {
      ...base,
      HOME: world.env.configHome,
      XDG_CONFIG_HOME: world.env.configHome,
      XDG_STATE_HOME: world.env.stateHome,
    };
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN],
    env,
    stderr: "pipe",
  });
  const capabilities = options.app
    ? { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } }
    : {};
  const client = new Client(
    { name: options.app ? "app-host" : "text-host", version: "1.0.0" },
    { capabilities },
  );
  await client.connect(transport);
  return {
    client,
    async close() {
      await client.close();
      if (scratch !== undefined && existsSync(scratch)) await rm(scratch, { recursive: true });
    },
  };
}

export interface FleetCall {
  args: string[];
}

export async function calls(world: World, name: string): Promise<FleetCall[]> {
  const path = join(world.tools, `${name}.jsonl`);
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as FleetCall);
}

export const flag = (call: FleetCall | undefined, name: string) =>
  call?.args[call.args.indexOf(name) + 1];

/** The text of a tool result's text parts. */
export const textOf = (result: unknown): string =>
  ((result as { content?: { type: string; text?: string }[] }).content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
