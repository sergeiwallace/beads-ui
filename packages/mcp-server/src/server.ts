import {
  getUiCapability,
  RESOURCE_MIME_TYPE,
  registerAppResource,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { McpEnv } from "./config.ts";
import { registerBeadsTools } from "./tools/beads.ts";
import { BOARD_URI, DRAFT_TOOL, enableApp, registerDispatchTools } from "./tools/dispatch.ts";
import { textResult } from "./tools/result.ts";
import { boardHtml } from "./view.ts";
import { webClient } from "./web.ts";

export const SERVER_INFO = { name: "beads-ui", version: "0.1.0" };
export const CLIENT_CAPABILITIES_TOOL = "beads_client_capabilities";

export function createServer(env: McpEnv): McpServer {
  const server = new McpServer(SERVER_INFO);
  const web = webClient(env);
  registerBeadsTools(server, web);
  const dispatch = registerDispatchTools(server, web);
  let appDisplaySupported = false;

  server.registerTool(
    CLIENT_CAPABILITIES_TOOL,
    {
      title: "Report client capabilities",
      description:
        "Reports this MCP client's negotiated app-display support and human dispatch-consent posture.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const clientVersion = server.server.getClientVersion();
      const client = {
        name: clientVersion?.name ?? "unknown",
        version: clientVersion?.version ?? "unknown",
      };
      const appDisplay = {
        supported: appDisplaySupported,
        mimeType: RESOURCE_MIME_TYPE,
        boardResourceUri: BOARD_URI,
      };
      const dispatchConsent = {
        modelTool: DRAFT_TOOL,
        mode: appDisplaySupported ? "mcp-app-or-web-confirmation" : "web-confirmation-only",
        directSendAvailableToModel: false,
        appOnlyToolsEnabled: appDisplaySupported,
        confirmationChannels: appDisplaySupported ? ["mcp-app", "web-review"] : ["web-review"],
      };
      const summary = [
        `client: ${client.name} (${client.version})`,
        `appDisplay: ${appDisplay.supported ? "supported" : "unsupported"}`,
        `dispatchConsent: ${dispatchConsent.mode} (model tool ${DRAFT_TOOL} drafts only)`,
      ].join("\n");
      return textResult(summary, { client, appDisplay, dispatchConsent });
    },
  );

  registerAppResource(
    server,
    "beads-ui board",
    BOARD_URI,
    { description: "The beads-ui board, its session-prompt drafts and their Confirm control" },
    async () => ({
      contents: [{ uri: BOARD_URI, mimeType: RESOURCE_MIME_TYPE, text: await boardHtml() }],
    }),
  );
  server.server.oninitialized = () => {
    const ui = getUiCapability(server.server.getClientCapabilities());
    if (ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE)) {
      appDisplaySupported = true;
      enableApp(dispatch);
    }
  };
  return server;
}
