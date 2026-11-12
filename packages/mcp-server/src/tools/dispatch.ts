// The dispatch tools (web app design Phase W4, § Shared code). The MCP App cannot post into a
// Claude Code session, so a session prompt goes through the web server's dispatch API with this
// host's MCP token; the web server signs it and its dispatch ladder carries it, exactly as it
// carries a prompt from the web app's composer. This server holds no signing key.
//
// A prompt the model asks for is only ever a draft: `beads_dispatch` sends nothing, and the user
// confirms the draft in the MCP App or in the web app. The MCP App's own Send and Confirm controls
// call the two app-only tools, which a host that advertises the app capability never offers to
// the model; on a host that does not, they are not registered at all (T-4.1).

import { randomBytes } from "node:crypto";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { WebClient } from "../web.ts";
import { ok, refusal, textResult } from "./result.ts";

export const BOARD_URI = "ui://beads-ui/board";
export const DRAFT_TOOL = "beads_dispatch";
export const SEND_TOOL = "beads_dispatch_send";
export const CONFIRM_TOOL = "beads_dispatch_confirm";

/** A request id the web server accepts once: 22 base64url characters. */
export const newRequestId = (): string => randomBytes(16).toString("base64url");

interface DraftBody {
  id: string;
  repo: string;
  task: string;
  text?: string;
  state: string;
  dispatch?: string;
}

interface DispatchBody {
  id: string;
  target: { session: string; host: string };
  state: string;
}

const task = {
  repo: z.string().min(1).describe("The task's repository, as beads_list names it"),
  task: z.string().min(1).describe("The task's id"),
  text: z.string().min(1).describe("The prompt for the session that owns the task"),
};

const sent = (dispatch: DispatchBody, via: string) =>
  textResult(
    `sent ${via} as dispatch ${dispatch.id} to ${dispatch.target.session}@${dispatch.target.host} (${dispatch.state}); the dispatch ladder delivers it as it does a web dispatch`,
    { dispatch },
  );

export interface DispatchTools {
  /** The model's tool: a draft only, shown in the board view when the host has the app capability. */
  draft: RegisteredTool;
  /** The MCP App's Send and Confirm, enabled only for a host that advertises the app capability. */
  appOnly: RegisteredTool[];
}

export function registerDispatchTools(server: McpServer, web: WebClient): DispatchTools {
  const draft = server.registerTool(
    DRAFT_TOOL,
    {
      title: "Draft a session prompt",
      description:
        "Drafts a prompt for the Claude Code session that owns a task. Nothing is sent: the user confirms the draft in the beads-ui MCP App or in the web app. Returns the draft id.",
      inputSchema: z.object(task),
    },
    async (args) => {
      const reply = await web.postAsUser("drafts", { id: newRequestId(), ...args });
      if (!ok(reply)) return refusal(DRAFT_TOOL, reply);
      const body = (reply.body as { draft: DraftBody }).draft;
      return textResult(
        `draft ${body.id}: nothing was sent. The user confirms it in the beads-ui MCP App, or in the web app's Review view under Drafts.`,
        { draft: body },
      );
    },
  );

  const send = registerAppTool(
    server,
    SEND_TOOL,
    {
      title: "Send a session prompt",
      description: "The MCP App's Send control: sends the prompt the user typed in the app.",
      inputSchema: z.object({
        id: z.string().min(1).describe("The request id the app minted for this send"),
        ...task,
      }),
      _meta: { ui: { resourceUri: BOARD_URI, visibility: ["app"] } },
    },
    async (args) => {
      const reply = await web.postAsUser("dispatches", { ...args });
      if (!ok(reply)) return refusal(SEND_TOOL, reply);
      return sent((reply.body as { dispatch: DispatchBody }).dispatch, "from the MCP App");
    },
  );

  const confirm = registerAppTool(
    server,
    CONFIRM_TOOL,
    {
      title: "Confirm a drafted session prompt",
      description: "The MCP App's Confirm control: sends a draft the user confirmed in the app.",
      inputSchema: z.object({ draft: z.string().min(1).describe("The draft id") }),
      _meta: { ui: { resourceUri: BOARD_URI, visibility: ["app"] } },
    },
    async (args) => {
      const reply = await web.postAsUser(`drafts/${encodeURIComponent(args.draft)}/confirm`, {});
      if (!ok(reply)) return refusal(CONFIRM_TOOL, reply);
      return sent((reply.body as { dispatch: DispatchBody }).dispatch, `draft ${args.draft}`);
    },
  );

  send.disable();
  confirm.disable();
  return { draft, appOnly: [send, confirm] };
}

/** For a host with the app capability: the app-only tools, and the draft shown in the board view. */
export function enableApp(tools: DispatchTools): void {
  tools.draft.update({ _meta: { ui: { resourceUri: BOARD_URI }, "ui/resourceUri": BOARD_URI } });
  for (const tool of tools.appOnly) tool.enable();
}
