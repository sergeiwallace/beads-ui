import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { repoName, send } from "../../../apps/web/test/auth-env.ts";
import { CLIENT_CAPABILITIES_TOOL } from "../src/server.ts";
import { BOARD_URI, CONFIRM_TOOL, DRAFT_TOOL, SEND_TOOL } from "../src/tools/dispatch.ts";
import { type Connected, connect, startWorld, textOf, type World } from "./harness.ts";

interface CapabilitiesBody {
  client: { name: string; version: string };
  appDisplay: { supported: boolean; mimeType: string; boardResourceUri: string };
  dispatchConsent: {
    modelTool: string;
    mode: string;
    directSendAvailableToModel: boolean;
    appOnlyToolsEnabled: boolean;
    confirmationChannels: string[];
  };
}

let world: World;
let agy: Connected;
let codex: Connected;
let appHost: Connected;

beforeAll(async () => {
  world = await startWorld();
  agy = await connect(world, { app: false, clientName: "agy", clientVersion: "1.5.16" });
  codex = await connect(world, { app: false, clientName: "codex", clientVersion: "0.1.0" });
  appHost = await connect(world, {
    app: true,
    clientName: "claude-desktop",
    clientVersion: "1.0.0",
  });
});

afterAll(async () => {
  await agy?.close();
  await codex?.close();
  await appHost?.close();
  await world?.close();
});

describe.each([
  { label: "agy", clientName: "agy", clientVersion: "1.5.16", getConn: () => agy },
  { label: "codex", clientName: "codex", clientVersion: "0.1.0", getConn: () => codex },
])("portable beads-ui MCP client ($label)", ({ label, clientName, clientVersion, getConn }) => {
  it("should exercise task tools against the fixture store without exposing app-only send tools", async () => {
    const conn = getConn();
    const { tools } = await conn.client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "beads_list",
        "beads_ready",
        "beads_show",
        "beads_update_status",
        "beads_create",
        "beads_close",
        DRAFT_TOOL,
        CLIENT_CAPABILITIES_TOOL,
      ]),
    );
    expect(names).not.toContain(SEND_TOOL);
    expect(names).not.toContain(CONFIRM_TOOL);

    const repo = repoName(world.store.dir);
    const created = await conn.client.callTool({
      name: "beads_create",
      arguments: { title: `Fixture task from ${label}`, priority: 1 },
    });
    expect(created.isError, textOf(created)).toBeFalsy();
    const id = (created.structuredContent as { id: string }).id;

    expect(textOf(await conn.client.callTool({ name: "beads_list", arguments: {} }))).toContain(
      `${repo}: ${id} [open] P1 Fixture task from ${label}`,
    );
    expect(textOf(await conn.client.callTool({ name: "beads_ready", arguments: {} }))).toContain(
      id,
    );
    const moved = await conn.client.callTool({
      name: "beads_update_status",
      arguments: { id, to: "in_progress" },
    });
    expect(textOf(moved)).toBe(`${id} moved from open to in_progress`);
    expect(textOf(await conn.client.callTool({ name: "beads_show", arguments: { id } }))).toContain(
      `${id} [in_progress] P1 Fixture task from ${label}`,
    );

    const closed = await conn.client.callTool({ name: "beads_close", arguments: { id } });
    expect(closed.isError, textOf(closed)).toBeFalsy();

    const owner = `portable-${label}-owner`;
    const ownedId = await world.store.create(`Owned task for ${owner}`, { status: "in_progress" });
    await world.store.bd("update", ownedId, "--assignee", owner);
    const drafted = await conn.client.callTool({
      name: DRAFT_TOOL,
      arguments: { repo, task: ownedId, text: `Check status from ${label}` },
    });
    expect(drafted.isError, textOf(drafted)).toBeFalsy();
    expect((drafted.structuredContent as { draft: { state: string } }).draft.state).toBe("draft");

    const queued = (
      (
        await send(world.server, `/api/receiver/v1/dispatches?session=${owner}`, {
          headers: { authorization: `Bearer ${world.receiverToken}` },
        })
      ).json() as { dispatches: unknown[] }
    ).dispatches;
    expect(queued).toEqual([]);
  });

  it("should honestly report unsupported app display and web-confirmation-only dispatch consent", async () => {
    const conn = getConn();
    const reply = await conn.client.callTool({ name: CLIENT_CAPABILITIES_TOOL, arguments: {} });
    expect(reply.isError, textOf(reply)).toBeFalsy();
    const body = reply.structuredContent as unknown as CapabilitiesBody;
    expect(body).toEqual({
      client: { name: clientName, version: clientVersion },
      appDisplay: {
        supported: false,
        mimeType: RESOURCE_MIME_TYPE,
        boardResourceUri: BOARD_URI,
      },
      dispatchConsent: {
        modelTool: DRAFT_TOOL,
        mode: "web-confirmation-only",
        directSendAvailableToModel: false,
        appOnlyToolsEnabled: false,
        confirmationChannels: ["web-review"],
      },
    });
    expect(textOf(reply)).toContain(`client: ${clientName} (${clientVersion})`);
    expect(textOf(reply)).toContain("appDisplay: unsupported");
    expect(textOf(reply)).toContain("dispatchConsent: web-confirmation-only");
  });
});

describe("MCP Apps capable host capability reporting", () => {
  it("should report app display supported and mcp-app-or-web-confirmation consent", async () => {
    const reply = await appHost.client.callTool({ name: CLIENT_CAPABILITIES_TOOL, arguments: {} });
    expect(reply.isError, textOf(reply)).toBeFalsy();
    const body = reply.structuredContent as unknown as CapabilitiesBody;
    expect(body).toEqual({
      client: { name: "claude-desktop", version: "1.0.0" },
      appDisplay: {
        supported: true,
        mimeType: RESOURCE_MIME_TYPE,
        boardResourceUri: BOARD_URI,
      },
      dispatchConsent: {
        modelTool: DRAFT_TOOL,
        mode: "mcp-app-or-web-confirmation",
        directSendAvailableToModel: false,
        appOnlyToolsEnabled: true,
        confirmationChannels: ["mcp-app", "web-review"],
      },
    });
  });
});
