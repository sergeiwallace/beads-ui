import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { repoName } from "../../../apps/web/test/auth-env.ts";
import { BOARD_URI, CONFIRM_TOOL, DRAFT_TOOL, SEND_TOOL } from "../src/tools/dispatch.ts";
import { type Connected, connect, startWorld, textOf, type World } from "./harness.ts";

// beads-ui design T-4.1, through the server started over stdio: the tools and the board resource
// it registers, and how it degrades on a host that does not advertise the MCP Apps capability.

const TASK_TOOLS = [
  "beads_list",
  "beads_show",
  "beads_ready",
  "beads_update_status",
  "beads_create",
  "beads_close",
];

let world: World;
let app: Connected;
let text: Connected;

beforeAll(async () => {
  world = await startWorld();
  app = await connect(world, { app: true });
  text = await connect(world, { app: false });
});

afterAll(async () => {
  await app?.close();
  await text?.close();
  await world?.close();
});

describe("the server over stdio (T-4.1)", () => {
  it("should register the six task tools and the ui://beads-ui/board resource as text/html;profile=mcp-app", async () => {
    const names = (await app.client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([...TASK_TOOLS, DRAFT_TOOL]));
    const { resources } = await app.client.listResources();
    expect(resources).toContainEqual(
      expect.objectContaining({ uri: BOARD_URI, mimeType: RESOURCE_MIME_TYPE }),
    );
    const read = await app.client.readResource({ uri: BOARD_URI });
    const [content] = read.contents as { uri: string; mimeType: string; text: string }[];
    expect(content?.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(content?.text).toContain("globalThis.McpApps = {");
    expect(content?.text).toContain("beads_dispatch_confirm");
    expect(content?.text).not.toMatch(
      /<\/script>[\s\S]*<\/script>[\s\S]*<\/script>[\s\S]*<\/script>/,
    );
  });

  it("should list, create, show, move, find ready and close a task through the web server", async () => {
    const repo = repoName(world.store.dir);
    const created = await app.client.callTool({
      name: "beads_create",
      arguments: { title: "Made over MCP", priority: 1 },
    });
    expect(created.isError, textOf(created)).toBeFalsy();
    const id = (created.structuredContent as { id: string }).id;
    expect(textOf(await app.client.callTool({ name: "beads_list", arguments: {} }))).toContain(
      `${repo}: ${id} [open] P1 Made over MCP`,
    );
    expect(textOf(await app.client.callTool({ name: "beads_ready", arguments: {} }))).toContain(id);
    const moved = await app.client.callTool({
      name: "beads_update_status",
      arguments: { id, to: "in_progress" },
    });
    expect(textOf(moved)).toBe(`${id} moved from open to in_progress`);
    expect(textOf(await app.client.callTool({ name: "beads_show", arguments: { id } }))).toContain(
      `${id} [in_progress] P1 Made over MCP`,
    );
    const closed = await app.client.callTool({ name: "beads_close", arguments: { id } });
    expect(closed.isError, textOf(closed)).toBeFalsy();
    expect((await world.store.show(id)).status).toBe("closed");
  });

  it("should answer a write the store refuses as an error naming the refusal, and write nothing", async () => {
    const result = await app.client.callTool({
      name: "beads_close",
      arguments: { id: "mcp-nope" },
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^beads_close: /);
  });
});

describe("a host that does not advertise io.modelcontextprotocol/ui (T-4.1)", () => {
  it("should register no app-only tool", async () => {
    const { tools } = await text.client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([...TASK_TOOLS, DRAFT_TOOL]));
    expect(names).not.toContain(SEND_TOOL);
    expect(names).not.toContain(CONFIRM_TOOL);
    for (const tool of tools) {
      expect((tool._meta as { ui?: unknown } | undefined)?.ui).toBeUndefined();
    }
  });

  it("should still answer every tool with text, and keep serving", async () => {
    const id = await world.store.create("Read over a text host");
    const repo = repoName(world.store.dir);
    const results = [
      await text.client.callTool({ name: "beads_list", arguments: {} }),
      await text.client.callTool({ name: "beads_ready", arguments: {} }),
      await text.client.callTool({ name: "beads_show", arguments: { id } }),
      await text.client.callTool({ name: "beads_update_status", arguments: { id, to: "open" } }),
      await text.client.callTool({ name: "beads_create", arguments: { title: "Text made" } }),
      await text.client.callTool({ name: "beads_close", arguments: { id } }),
      await text.client.callTool({ name: DRAFT_TOOL, arguments: { repo, task: id, text: "Hi" } }),
    ];
    for (const result of results) {
      const [first] = result.content as { type: string; text: string }[];
      expect(first?.type).toBe("text");
      expect(first?.text).not.toBe("");
    }
    expect(await text.client.ping()).toBeDefined();
  });

  it("should answer with text, not fail, when the web server cannot be reached", async () => {
    const lost = await connect({ ...world, url: "http://127.0.0.1:9/" }, { app: false });
    try {
      const result = await lost.client.callTool({ name: "beads_list", arguments: {} });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/cannot be reached/);
      expect(await lost.client.ping()).toBeDefined();
    } finally {
      await lost.close();
    }
  });
});
