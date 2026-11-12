// The MCP server's dispatch routes and the drafts it leaves for the user (web app design Phase
// W4, § Shared code, D-17). The MCP server holds no signing key: it submits a session prompt here
// with the host's MCP token (auth.ts admits `/api/mcp/` on that token alone), and this server
// signs it and hands it to the same dispatch ladder a web dispatch takes (dispatch.ts promptTask).
// Each request names the host's configured user and carries an id of its own, never accepted
// twice. A prompt from the user's own control in the MCP App is sent at once; one a model asked
// for is kept as a draft, and sent only when the user confirms it in the MCP App or the web app.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AuthRefused, loadAuth } from "./auth.ts";
import { promptTask } from "./dispatch.ts";
import { Serial } from "./dispatch-store/common.ts";
// Types only: routes.ts imports this file's route block, so a value import back would be a cycle.
import type { ApiContext, ApiError, ApiReply, ApiRequest, Route } from "./routes.ts";

/** The drafts and the request ids already used, in the server's state directory (mode 0600). */
export const DRAFTS_FILE = "mcp-drafts.json";
/** A request id: 16 to 64 URL-safe characters, minted by the MCP server or the MCP App. */
export const REQUEST_ID = /^[A-Za-z0-9_-]{16,64}$/;
/** The refusal for a task outside this host's allowlist; it never names the repository. */
export const OUTSIDE_ALLOWLIST =
  "the task is not in a store this host's allowlist opens, so nothing was written";
/** What stands for the repository in a refusal passed back to the MCP server. */
const REDACTED = "the task's repository";

export interface Draft {
  id: string;
  repo: string;
  task: string;
  /** Deleted once the draft is sent, as a dispatch body is. */
  text?: string;
  state: "draft" | "sent";
  created_at: string;
  /** The dispatch the confirmed draft was sent as. */
  dispatch?: string;
  confirmed_by?: string;
  confirmed_at?: string;
}

interface DraftFile {
  version: 1;
  drafts: Draft[];
  /** Every request id this server has accepted, so a repeat is refused. */
  used: string[];
}

const STATUS_BY_KIND: Readonly<Record<string, number>> = {
  invalid: 400,
  forbidden: 403,
  "not-found": 404,
  stale: 409,
};

const failure = (error: ApiError): ApiReply => ({
  status: STATUS_BY_KIND[error.kind] ?? 500,
  body: { error },
});
const invalid = (message: string) => failure({ kind: "invalid", source: "mcp", message });
const refused = (message: string, source = "mcp") =>
  failure({ kind: "forbidden", source, message });

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const textOf = (body: unknown, key: string): string | undefined => {
  if (!isObject(body)) return undefined;
  const value = body[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

const serial = new Serial();

async function readDrafts(dir: string): Promise<DraftFile> {
  try {
    const json = JSON.parse(await readFile(join(dir, DRAFTS_FILE), "utf8")) as Partial<DraftFile>;
    return {
      version: 1,
      drafts: Array.isArray(json.drafts) ? json.drafts : [],
      used: Array.isArray(json.used) ? json.used : [],
    };
  } catch {
    return { version: 1, drafts: [], used: [] };
  }
}

async function writeDrafts(dir: string, file: DraftFile): Promise<void> {
  const path = join(dir, DRAFTS_FILE);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const next = `${path}.${randomBytes(6).toString("hex")}.new`;
  await writeFile(next, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await rename(next, path);
}

/** Refuses a request that names a user other than the host's configured user (D-17). */
async function userRefusal(
  request: ApiRequest,
  context: ApiContext,
): Promise<ApiReply | undefined> {
  let configured: string;
  try {
    configured = (await loadAuth(context.dispatches.configEnv)).configuredUser;
  } catch (error) {
    if (error instanceof AuthRefused) return refused(error.message, "[auth]");
    throw error;
  }
  return textOf(request.body, "user") === configured
    ? undefined
    : refused("the request names a user other than this host's configured user", "user");
}

/** Refuses a task whose repository is not an open store, which the allowlist decides (D-18). */
async function allowlistRefusal(context: ApiContext, repo: string): Promise<ApiReply | undefined> {
  const open = await context.stores.open();
  return open.some((store) => store.repository === repo)
    ? undefined
    : refused(OUTSIDE_ALLOWLIST, "allowlist");
}

/** A refusal passed back with the repository's name taken out of its message. */
function redacted(reply: ApiReply, repo: string): ApiReply {
  if (reply.status < 400 || !isObject(reply.body) || !isObject(reply.body.error)) return reply;
  const error = reply.body.error as unknown as ApiError;
  return {
    status: reply.status,
    body: { error: { ...error, message: error.message.replaceAll(repo, REDACTED) } },
  };
}

interface Prompt {
  id: string;
  repo: string;
  task: string;
  text: string;
}

/** The checks every MCP dispatch request passes, in order, before anything is written. */
async function admitted(request: ApiRequest, context: ApiContext): Promise<Prompt | ApiReply> {
  const user = await userRefusal(request, context);
  if (user !== undefined) return user;
  const id = textOf(request.body, "id");
  if (id === undefined || !REQUEST_ID.test(id)) {
    return invalid("a dispatch request carries an `id` of 16 to 64 URL-safe characters");
  }
  const repo = textOf(request.body, "repo");
  const task = textOf(request.body, "task");
  const text = textOf(request.body, "text");
  if (repo === undefined || task === undefined || text === undefined) {
    return invalid("a dispatch request names `repo`, `task` and `text`");
  }
  const outside = await allowlistRefusal(context, repo);
  if (outside !== undefined) return outside;
  return { id, repo, task, text };
}

const isPrompt = (value: Prompt | ApiReply): value is Prompt => "text" in value;

const repeated = (id: string) =>
  failure({ kind: "stale", source: "id", message: `dispatch request ${id} was already used` });

/** Marks `id` used, or answers that it already was; under the serial, so a race is refused too. */
function claim(file: DraftFile, id: string): ApiReply | undefined {
  if (file.used.includes(id)) return repeated(id);
  file.used.push(id);
  return undefined;
}

const publicDraft = (draft: Draft) => ({ ...draft });

/** A draft from a model's tool call: stored, and nothing sent (W4). */
async function draftRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const prompt = await admitted(request, context);
  if (!isPrompt(prompt)) return prompt;
  return serial.run(async () => {
    const dir = context.dispatches.stateDir;
    const file = await readDrafts(dir);
    const used = claim(file, prompt.id);
    if (used !== undefined) return used;
    const draft: Draft = {
      id: prompt.id,
      repo: prompt.repo,
      task: prompt.task,
      text: prompt.text,
      state: "draft",
      created_at: context.now(),
    };
    file.drafts.push(draft);
    await writeDrafts(dir, file);
    return { status: 201, body: { draft: publicDraft(draft) } };
  });
}

/** A prompt the user sent with the MCP App's own Send control: signed and sent now. */
async function sendRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const prompt = await admitted(request, context);
  if (!isPrompt(prompt)) return prompt;
  const used = await serial.run(async () => {
    const dir = context.dispatches.stateDir;
    const file = await readDrafts(dir);
    const repeat = claim(file, prompt.id);
    if (repeat === undefined) await writeDrafts(dir, file);
    return repeat;
  });
  if (used !== undefined) return used;
  const reply = await promptTask(context, {
    repo: prompt.repo,
    task: prompt.task,
    text: prompt.text,
    armGoal: true,
  });
  return redacted(reply, prompt.repo);
}

/** Sends a draft the user confirmed, once; a second confirm is refused. */
function confirmDraft(context: ApiContext, id: string, by: string): Promise<ApiReply> {
  return serial.run(async () => {
    const dir = context.dispatches.stateDir;
    const file = await readDrafts(dir);
    const draft = file.drafts.find((one) => one.id === id);
    if (draft === undefined) {
      return failure({ kind: "not-found", source: "drafts", message: `no draft ${id}` });
    }
    if (draft.state !== "draft") {
      return failure({
        kind: "stale",
        source: "drafts",
        message: `draft ${id} was already confirmed and sent as dispatch ${draft.dispatch}`,
      });
    }
    const outside = await allowlistRefusal(context, draft.repo);
    if (outside !== undefined) return outside;
    const reply = await promptTask(context, {
      repo: draft.repo,
      task: draft.task,
      text: draft.text ?? "",
      armGoal: true,
    });
    if (reply.status !== 201) return redacted(reply, draft.repo);
    draft.state = "sent";
    draft.dispatch = (reply.body as { dispatch: { id: string } }).dispatch.id;
    draft.confirmed_by = by;
    draft.confirmed_at = context.now();
    delete draft.text;
    await writeDrafts(dir, file);
    return { status: 201, body: { ...(reply.body as object), draft: publicDraft(draft) } };
  });
}

async function mcpConfirmRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const user = await userRefusal(request, context);
  if (user !== undefined) return user;
  return confirmDraft(context, request.params.id ?? "", "the user, in the MCP App");
}

async function mcpDraftRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const draft = (await readDrafts(context.dispatches.stateDir)).drafts.find(
    (one) => one.id === request.params.id,
  );
  return draft === undefined
    ? failure({ kind: "not-found", source: "drafts", message: `no draft ${request.params.id}` })
    : { status: 200, body: { draft: publicDraft(draft) } };
}

/** The web app's list of drafts waiting for the user's confirmation. */
async function draftsRoute(_request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const { drafts } = await readDrafts(context.dispatches.stateDir);
  return {
    status: 200,
    body: { drafts: drafts.filter((draft) => draft.state === "draft").map(publicDraft) },
  };
}

async function webConfirmRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const by =
    request.caller.kind === "browser"
      ? `${request.caller.identity ?? "the signed-in user"}, in the web app`
      : "the user";
  return confirmDraft(context, request.params.id ?? "", by);
}

/** The MCP server's routes (MCP token) and the web app's drafts routes (browser session). */
export const MCP_ROUTES: readonly Route[] = [
  { method: "POST", path: "/api/mcp/v1/drafts", handle: draftRoute },
  { method: "GET", path: "/api/mcp/v1/drafts/:id", handle: mcpDraftRoute },
  { method: "POST", path: "/api/mcp/v1/drafts/:id/confirm", handle: mcpConfirmRoute },
  { method: "POST", path: "/api/mcp/v1/dispatches", handle: sendRoute },
  { method: "GET", path: "/api/drafts", handle: draftsRoute },
  { method: "POST", path: "/api/drafts/:id/confirm", dispatch: true, handle: webConfirmRoute },
];
