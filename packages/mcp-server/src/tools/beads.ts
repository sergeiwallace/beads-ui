// The six task tools (beads-ui design, The MCP App, T-4.1): reads for the model and writes the app
// or the model calls. Each reads or writes through the web server's MCP routes, so the host's
// repository allowlist (web app design D-18) applies to every store read here as it does there.

import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { WebClient } from "../web.ts";
import { ok, refusal, storeQuery, textResult } from "./result.ts";

interface Row {
  id: string;
  title: string;
  status: string;
  priority: number;
  type?: string;
  assignee?: string;
  repository?: string;
}

const line = (row: Row): string =>
  [
    row.repository === undefined ? undefined : `${row.repository}:`,
    row.id,
    `[${row.status}]`,
    `P${row.priority}`,
    row.title,
    row.assignee === undefined || row.assignee === "" ? undefined : `(${row.assignee})`,
  ]
    .filter((part) => part !== undefined)
    .join(" ");

interface ReadNote {
  repository: string;
  ok: boolean;
  error?: { message?: string };
}

const unreadLines = (reads: readonly ReadNote[] | undefined): string[] =>
  (reads ?? [])
    .filter((read) => !read.ok)
    .map((read) => `${read.repository} could not be read: ${read.error?.message ?? "no reason"}`);

function listing(heading: string, rows: readonly Row[], reads?: readonly ReadNote[]) {
  const lines = rows.length === 0 ? ["none"] : rows.map(line);
  return textResult(`${heading}\n${[...lines, ...unreadLines(reads)].join("\n")}`, {
    issues: [...rows],
  });
}

const store = z
  .string()
  .optional()
  .describe("The repository of one open store; every open store when left out");
const id = z.string().min(1).describe("The issue id, as beads_list shows it");

export function registerBeadsTools(server: McpServer, web: WebClient): void {
  server.registerTool(
    "beads_list",
    {
      title: "List tasks",
      description: "Lists the tasks in the open Beads stores this host may show.",
      inputSchema: z.object({ store }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const reply = await web.get(`board${storeQuery(args.store)}`);
      if (!ok(reply)) return refusal("beads_list", reply);
      const body = reply.body as { issues: Row[]; reads?: ReadNote[] };
      return listing(`${body.issues.length} tasks`, body.issues, body.reads);
    },
  );

  server.registerTool(
    "beads_ready",
    {
      title: "Ready tasks",
      description: "Lists the tasks with no open blocker (bd ready).",
      inputSchema: z.object({ store }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const reply = await web.get(`ready${storeQuery(args.store)}`);
      if (!ok(reply)) return refusal("beads_ready", reply);
      const body = reply.body as { issues: Row[]; reads?: ReadNote[] };
      return listing(`${body.issues.length} ready tasks`, body.issues, body.reads);
    },
  );

  server.registerTool(
    "beads_show",
    {
      title: "Show a task",
      description: "Shows one task with its description and comments.",
      inputSchema: z.object({ id, store }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const reply = await web.get(`issues/${encodeURIComponent(args.id)}${storeQuery(args.store)}`);
      if (!ok(reply)) return refusal("beads_show", reply);
      const body = reply.body as {
        issue: Row & { description?: string };
        comments: { author?: string; text: string }[] | null;
        repository: string;
      };
      const issue = { ...body.issue, repository: body.repository };
      const parts = [line(issue)];
      if (issue.description !== undefined && issue.description !== "") {
        parts.push("", issue.description);
      }
      for (const comment of body.comments ?? []) {
        parts.push("", `${comment.author ?? "someone"}: ${comment.text}`);
      }
      return textResult(parts.join("\n"), { issue, comments: body.comments });
    },
  );

  server.registerTool(
    "beads_update_status",
    {
      title: "Move a task",
      description: "Moves a task to another status, refused if it changed since it was read.",
      inputSchema: z.object({ id, to: z.string().min(1).describe("The status to move to"), store }),
    },
    async (args) => {
      const path = `issues/${encodeURIComponent(args.id)}`;
      const shown = await web.get(`${path}${storeQuery(args.store)}`);
      if (!ok(shown)) return refusal("beads_update_status", shown);
      const from = (shown.body as { issue: Row }).issue.status;
      const reply = await web.post(`${path}/status${storeQuery(args.store)}`, {
        to: args.to,
        shown: from,
      });
      if (!ok(reply)) return refusal("beads_update_status", reply);
      return textResult(`${args.id} moved from ${from} to ${args.to}`, {
        id: args.id,
        from,
        status: args.to,
      });
    },
  );

  server.registerTool(
    "beads_create",
    {
      title: "Create a task",
      description: "Creates a task in an open store.",
      inputSchema: z.object({
        title: z.string().min(1),
        type: z.string().optional().describe("bug, feature, task, epic or chore"),
        priority: z.number().int().min(0).max(4).optional(),
        store,
      }),
    },
    async (args) => {
      const reply = await web.post(`issues${storeQuery(args.store)}`, {
        title: args.title,
        ...(args.type === undefined ? {} : { type: args.type }),
        ...(args.priority === undefined ? {} : { priority: args.priority }),
      });
      if (!ok(reply)) return refusal("beads_create", reply);
      const body = reply.body as { id: string; repository: string };
      return textResult(`created ${body.id} in ${body.repository}`, body);
    },
  );

  server.registerTool(
    "beads_close",
    {
      title: "Close a task",
      description: "Closes a task.",
      inputSchema: z.object({ id, store }),
      annotations: { destructiveHint: false },
    },
    async (args) => {
      const reply = await web.post(
        `issues/${encodeURIComponent(args.id)}/close${storeQuery(args.store)}`,
        {},
      );
      if (!ok(reply)) return refusal("beads_close", reply);
      return textResult(`closed ${args.id}`, { id: args.id, status: "closed" });
    },
  );
}
