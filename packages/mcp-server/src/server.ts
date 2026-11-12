// The beads-ui MCP server (beads-ui design T-4.1, web app design Phase W4): the six task tools,
// the dispatch tools and the `ui://beads-ui/board` resource, over stdio for Claude Desktop and
// Claude Code. A host that does not advertise the MCP Apps capability gets no app-only tool, and
// every tool still answers with text.

import {
  getUiCapability,
  RESOURCE_MIME_TYPE,
  registerAppResource,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import type { McpEnv } from "./config.ts";
import { registerBeadsTools } from "./tools/beads.ts";
import { BOARD_URI, enableApp, registerDispatchTools } from "./tools/dispatch.ts";
import { boardHtml } from "./view.ts";
import { webClient } from "./web.ts";

export const SERVER_INFO = { name: "beads-ui", version: "0.1.0" };

export function createServer(env: McpEnv): McpServer {
  const server = new McpServer(SERVER_INFO);
  const web = webClient(env);
  registerBeadsTools(server, web);
  const dispatch = registerDispatchTools(server, web);
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
    if (ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE)) enableApp(dispatch);
  };
  return server;
}
