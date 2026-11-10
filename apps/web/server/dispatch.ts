// The Review queue's reads and the dispatch routes (web app design § The Review queue, § Composer
// and dispatch, T-W1.1, T-W1.2, T-W1.3, T-W1.6). The held store's `review`, `options` and `show`
// verbs run as subprocesses with a timeout; a failed run is named with its exit code, never read as
// an empty queue. A prompt, an answer or an unblock is a signed dispatch record written through the
// dispatch service, mirrored as a bd comment on its task; in this phase it is delivered when the
// receiving session next asks the receiver API at a turn end (rung 5).

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type DeliveryState,
  type DispatchKind,
  type DispatchTarget,
  type DispatchTask,
  deliveryLabel,
  GOAL_PAUSED,
  heldBase,
  type Issue,
  isFinalDelivery,
  parseReviewOutput,
  parseToml,
  REVIEW_TIMEOUT_MS,
  type ReviewItem,
  resolveReview,
  rungSummary,
  type StoredDispatch,
  type TomlTable,
  type TomlValue,
} from "@beads-ui/core";
import type { BdResult } from "@sergeiwallace/beads-ui-bd-node";
import { filterAllowed } from "./allowlist.ts";
import { readUserConfig } from "./config.ts";
import { DispatchRefused } from "./dispatch-service.ts";
import { Serial } from "./dispatch-store/common.ts";
import { QueueClient } from "./queue.ts";
import type { OpenStore } from "./registry.ts";
// Types only: routes.ts imports this file's route block, so a value import back would be a cycle.
import type { ApiContext, ApiError, ApiReply, ApiRequest, Route } from "./routes.ts";

const STATUS_BY_KIND: Readonly<Record<string, number>> = {
  invalid: 400,
  forbidden: 403,
  "not-found": 404,
  stale: 409,
  "not-held": 409,
  failed: 502,
  timeout: 504,
};

/** An error reply in routes.ts's shape, `{ error: ApiError }`. */
const failure = (error: ApiError): ApiReply => ({
  status: STATUS_BY_KIND[error.kind] ?? 500,
  body: { error },
});

/** The reply for a bd call that did not succeed, naming the call as its source. */
function bdFailure(source: string, result: Exclude<BdResult<unknown>, { kind: "ok" }>): ApiReply {
  switch (result.kind) {
    case "stale":
      return failure({ kind: "stale", source, message: `${result.id} changed elsewhere` });
    case "notFound":
      return failure({ kind: "not-found", source, message: `${result.id} is not in this store` });
    case "timeout":
      return failure({
        kind: "timeout",
        source: result.command,
        message: `${result.command} did not finish within ${result.timeoutMs} ms`,
      });
    case "failed":
      return failure({
        kind: "failed",
        source,
        exitCode: result.exitCode,
        message: result.message,
      });
  }
}

/** The open store a write names by its repository. */
async function storeNamed(context: ApiContext, repo: string): Promise<OpenStore | ApiReply> {
  const open = await context.stores.open();
  return (
    open.find((store) => store.repository === repo) ??
    failure({
      kind: "not-found",
      source: "repo",
      message: `no open store on this host is named ${JSON.stringify(repo)}`,
    })
  );
}

const isStore = (value: OpenStore | ApiReply): value is OpenStore => "bd" in value;

/** The `beads-ui.toml` table of the dispatch settings this file reads. */
export const DISPATCH_TABLE = "dispatch";
/** What the server runs to unblock a task with no owning session (T-W1.6). */
export const DEFAULT_UNBLOCK_COMMAND = ["bd-unblock"];
/** How long the server's own unblock may run. */
export const UNBLOCK_TIMEOUT_MS = 30_000;
/** The author bd records on the comments the server writes. */
export const DISPATCH_ACTOR = "beads-ui-web";
/** The statuses whose tasks the Review queue lists: blocked to unblock, in progress to prompt. */
export const REVIEW_TASK_STATUSES = ["blocked", "in_progress"] as const;
/** Where an unblock's next-step prompt waits until the unblock is acted on. */
export const FOLLOW_UPS_FILE = "dispatch-follow-ups.json";
/** The source the Review view names for a held read. */
export const HELD_REVIEW_SOURCE = "held review";
export const HELD_OPTIONS_SOURCE = "held options";
export const HELD_SHOW_SOURCE = "held show";
/** The answer statement D-3 records with a control-chosen option, so nothing reads as typed. */
export const CONTROL_STATEMENT =
  "Chosen with a control in the beads-ui Review queue, not typed: the option letter above is the answer.";

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

type Run =
  | { kind: "exited"; exitCode: number; stdout: string; stderr: string }
  | { kind: "timeout" }
  | { kind: "unrunnable"; message: string };

/** Runs `argv` with no shell, within `timeoutMs`. */
function run(argv: readonly string[], options: { cwd?: string; timeoutMs: number }): Promise<Run> {
  const [bin, ...args] = argv;
  if (bin === undefined) return Promise.resolve({ kind: "unrunnable", message: "no command" });
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      {
        encoding: "utf8",
        timeout: options.timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ kind: "exited", exitCode: 0, stdout, stderr });
          return;
        }
        if (error.killed === true) resolve({ kind: "timeout" });
        else if (typeof error.code === "number") {
          resolve({ kind: "exited", exitCode: error.code, stdout, stderr });
        } else resolve({ kind: "unrunnable", message: `${bin}: ${error.code ?? error.message}` });
      },
    );
  });
}

const firstLine = (text: string): string => text.trim().split("\n")[0] ?? "";

/** A held read that did not succeed, as the Review view names it (T-W1.1). */
export interface ReadFailure {
  source: string;
  exitCode: number | null;
  detail?: string;
}

function runFailure(source: string, outcome: Run, timeoutMs: number): ReadFailure {
  if (outcome.kind === "timeout") {
    return { source, exitCode: null, detail: `did not finish within ${timeoutMs} ms` };
  }
  if (outcome.kind === "unrunnable") return { source, exitCode: null, detail: outcome.message };
  const detail = firstLine(outcome.stderr) || firstLine(outcome.stdout);
  return { source, exitCode: outcome.exitCode, ...(detail === "" ? {} : { detail }) };
}

const isTable = (value: TomlValue | undefined): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The settings this file reads from the user's own `beads-ui.toml`, at call time. */
export interface DispatchSettings {
  /** `[review] command`: the held store's tool; undefined leaves held items unread. */
  held?: string[];
  /** `[dispatch] host`: this host's name as receivers know it, for an owner named with no host. */
  host?: string;
  /** `[dispatch] unblock_command`. */
  unblockCommand: string[];
  problems: string[];
}

export async function readDispatchSettings(context: ApiContext): Promise<DispatchSettings> {
  const file = await readUserConfig(context.dispatches.configEnv);
  const text = file.kind === "file" ? file.text : undefined;
  const review = resolveReview(text);
  const settings: DispatchSettings = {
    unblockCommand: [...DEFAULT_UNBLOCK_COMMAND],
    problems: [...review.problems],
  };
  if (review.command !== undefined) settings.held = review.command;
  if (text === undefined) return settings;
  const parsed = parseToml(text);
  if (!parsed.ok) return settings;
  const table = parsed.value[DISPATCH_TABLE];
  if (!isTable(table)) return settings;
  if (typeof table.host === "string" && table.host.trim() !== "") settings.host = table.host.trim();
  else if (table.host !== undefined) settings.problems.push("dispatch.host must be a host name");
  const command = table.unblock_command;
  if (
    Array.isArray(command) &&
    command.length > 0 &&
    command.every((arg) => typeof arg === "string")
  ) {
    settings.unblockCommand = command as string[];
  } else if (command !== undefined) {
    settings.problems.push(
      'dispatch.unblock_command must be a list of arguments such as ["bd-unblock"]',
    );
  }
  return settings;
}

/** The text a held item was refused for, as the Review view shows it. */
export const REVIEW_UNSET =
  'Held items are not read: set [review] command in your own beads-ui.toml, such as command = ["held_cli.py"].';

/** A held item on the Review queue, with the open store it belongs to and its joined issue. */
export interface HeldRow {
  item: ReviewItem;
  /** The open store's repository the item's held store is. */
  repository: string;
  joined?: { repo: string; issue: Issue };
}

type HeldRead =
  | { state: "unset"; message: string }
  | { state: "failed"; failure: ReadFailure }
  | { state: "ok"; rows: HeldRow[] };

const lastSegment = (entry: string): string => entry.replace(/\/+$/, "").split("/").pop() ?? entry;

/** The `docs/held` store directories the review payload names, by store name. */
function heldStoreDirs(stdout: string): Map<string, string> {
  const dirs = new Map<string, string>();
  try {
    const json = JSON.parse(stdout) as { stores?: Record<string, { path?: unknown }> };
    for (const [name, store] of Object.entries(json.stores ?? {})) {
      if (typeof store?.path === "string")
        dirs.set(name, store.path.replace(/\/docs\/held\/?$/, ""));
    }
  } catch {
    // parseReviewOutput reports output that is not JSON.
  }
  return dirs;
}

/** The open store a held item's held store is: the same repository name, or the same directory. */
function storeOfHeld(
  item: ReviewItem,
  open: readonly OpenStore[],
  dirs: ReadonlyMap<string, string>,
): OpenStore | undefined {
  const dir = dirs.get(item.store);
  return open.find(
    (store) =>
      lastSegment(store.repository) === item.store || (dir !== undefined && store.path === dir),
  );
}

/** The issues the queue reads from each open store, each with its repository. */
interface TaskRead {
  issues: { repo: string; issue: Issue }[];
  failures: ReadFailure[];
}

async function readTasks(open: readonly OpenStore[]): Promise<TaskRead> {
  const read: TaskRead = { issues: [], failures: [] };
  for (const store of open) {
    const board = await store.bd.board();
    if (board.kind !== "ok") {
      const reply = bdFailure("bd list", board).body as {
        error: { message: string; exitCode?: number | null };
      };
      read.failures.push({
        source: `${store.repository}: bd list`,
        exitCode: reply.error.exitCode ?? null,
        detail: reply.error.message,
      });
      continue;
    }
    for (const issue of board.value) read.issues.push({ repo: store.repository, issue });
  }
  return read;
}

/** The held items the host's allowlist permits, open and current, each joined to its issue. */
async function readHeld(
  context: ApiContext,
  settings: DispatchSettings,
  open: readonly OpenStore[],
  issues: TaskRead["issues"],
): Promise<HeldRead> {
  if (settings.held === undefined) return { state: "unset", message: REVIEW_UNSET };
  const argv = [...heldBase(settings.held), "review", "--scope", "pair", "--json"];
  const outcome = await run(argv, { timeoutMs: REVIEW_TIMEOUT_MS });
  if (outcome.kind !== "exited") {
    return { state: "failed", failure: runFailure(HELD_REVIEW_SOURCE, outcome, REVIEW_TIMEOUT_MS) };
  }
  const parsed = parseReviewOutput(outcome.stdout);
  const empty = !parsed.ok || parsed.value.unchanged || parsed.value.items.length === 0;
  if (outcome.exitCode !== 0 && empty) {
    return { state: "failed", failure: runFailure(HELD_REVIEW_SOURCE, outcome, REVIEW_TIMEOUT_MS) };
  }
  if (!parsed.ok || parsed.value.unchanged) {
    const failed = runFailure(HELD_REVIEW_SOURCE, outcome, REVIEW_TIMEOUT_MS);
    return {
      state: "failed",
      failure: { ...failed, detail: parsed.ok ? "printed no items" : parsed.error },
    };
  }
  const dirs = heldStoreDirs(outcome.stdout);
  const current = parsed.value.items.filter(
    (item) => item.status === "open" && item.selection === "current",
  );
  const allowlist = await context.allowlist();
  const placed = current.map((item) => ({ item, store: storeOfHeld(item, open, dirs) }));
  const kept = filterAllowed(
    placed,
    (row) => row.store?.repository,
    allowlist,
    context.health,
    "the held store",
  );
  const rows = kept.map(({ item, store }): HeldRow => {
    const row: HeldRow = { item, repository: store?.repository ?? item.store };
    const joined = issues.find(
      ({ issue }) =>
        item.task !== "none" && (issue.id === item.task || issue.displayId === item.task),
    );
    if (joined !== undefined) row.joined = joined;
    return row;
  });
  return { state: "ok", rows };
}

/** The structured-options command's stdout for `paths`, or why it could not be read. */
async function readOptions(
  settings: DispatchSettings,
  paths: readonly string[],
): Promise<{ state: "ok"; stdout: string } | { state: "failed"; failure: ReadFailure }> {
  // An item path is an argument, never an option: one that starts with "-" is refused before the
  // call, and the paths follow "--" so the held tool reads every one of them as an item.
  const flagLike = paths.find((path) => path.startsWith("-"));
  if (flagLike !== undefined) {
    return {
      state: "failed",
      failure: {
        source: HELD_OPTIONS_SOURCE,
        exitCode: null,
        detail: `refused an item path that starts with "-": ${JSON.stringify(flagLike)}`,
      },
    };
  }
  const held = settings.held ?? [];
  const argv = [...heldBase(held), "options", "--scope", "pair", "--", ...paths];
  const outcome = await run(argv, { timeoutMs: REVIEW_TIMEOUT_MS });
  if (outcome.kind !== "exited" || outcome.stdout.trim() === "") {
    return {
      state: "failed",
      failure: runFailure(HELD_OPTIONS_SOURCE, outcome, REVIEW_TIMEOUT_MS),
    };
  }
  return { state: "ok", stdout: outcome.stdout };
}

/** Why the options read failed when its output could not be filtered (T-W1.1). */
export const OPTIONS_UNREADABLE = "printed output that is not the options JSON";

/**
 * Keeps only the options of `paths`, so nothing the allowlist hid leaves the server; undefined
 * when the output is not the options JSON, which then leaves the server not at all.
 */
function optionsFor(stdout: string, paths: ReadonlySet<string>): string | undefined {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  const payload = json as { items?: unknown };
  if (typeof json !== "object" || json === null || Array.isArray(json)) return undefined;
  if (!Array.isArray(payload.items)) return undefined;
  const items = payload.items.filter(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      paths.has(String((row as { item?: unknown }).item)),
  );
  return JSON.stringify({ ...payload, items });
}

const cache = new WeakMap<ApiContext, { at: number; rows: Map<string, HeldRow> }>();
const CACHE_MS = 60_000;

async function openStores(context: ApiContext): Promise<OpenStore[]> {
  return context.stores.open();
}

/** The Review view's read: held items with their options, blocked and in-progress tasks. */
async function reviewRoute(_request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const settings = await readDispatchSettings(context);
  const open = await openStores(context);
  const tasks = await readTasks(open);
  const held = await readHeld(context, settings, open, tasks.issues);
  let options:
    | { state: "ok"; stdout: string }
    | { state: "failed"; failure: ReadFailure }
    | {
        state: "unset";
      } = { state: "unset" };
  if (held.state === "ok") {
    cache.set(context, {
      at: Date.now(),
      rows: new Map(held.rows.map((row) => [row.item.path, row])),
    });
    const paths = new Set(held.rows.map((row) => row.item.path));
    const read =
      held.rows.length === 0
        ? { state: "ok" as const, stdout: '{"version":1,"items":[]}' }
        : await readOptions(settings, []);
    if (read.state === "failed") options = read;
    else {
      const kept = optionsFor(read.stdout, paths);
      options =
        kept === undefined
          ? {
              state: "failed",
              failure: { source: HELD_OPTIONS_SOURCE, exitCode: 0, detail: OPTIONS_UNREADABLE },
            }
          : { state: "ok", stdout: kept };
    }
  }
  const shownTasks = tasks.issues.filter(({ issue }) =>
    (REVIEW_TASK_STATUSES as readonly string[]).includes(issue.status),
  );
  return {
    status: 200,
    body: {
      asOf: context.now(),
      held,
      options,
      tasks: shownTasks,
      goals: tasks.issues.filter(({ issue }) => issue.type === "goal").map(({ issue }) => issue.id),
      failures: tasks.failures,
      problems: settings.problems,
      health: context.health.lines(),
    },
  };
}

/** The held item `path` names, from the last Review read, or read again when it is not there. */
async function heldRow(context: ApiContext, path: string): Promise<HeldRow | undefined> {
  const cached = cache.get(context);
  const found =
    cached !== undefined && Date.now() - cached.at < CACHE_MS ? cached.rows.get(path) : undefined;
  if (found !== undefined) return found;
  const settings = await readDispatchSettings(context);
  const open = await openStores(context);
  const tasks = await readTasks(open);
  const held = await readHeld(context, settings, open, tasks.issues);
  if (held.state !== "ok") return undefined;
  const rows = new Map(held.rows.map((row) => [row.item.path, row]));
  cache.set(context, { at: Date.now(), rows });
  return rows.get(path);
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const textOf = (body: unknown, key: string): string | undefined => {
  if (!isObject(body)) return undefined;
  const value = body[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

const invalid = (message: string): ApiReply => failure({ kind: "invalid", message });
const refused = (message: string, source = "dispatch"): ApiReply =>
  failure({ kind: "forbidden", source, message });

/** A held item's Markdown body, through the held store's `show` verb. */
async function heldBodyRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const path = request.query.get("path") ?? "";
  const row = await heldRow(context, path);
  if (row === undefined) {
    return failure({
      kind: "not-found",
      source: HELD_SHOW_SOURCE,
      message: "no open held item on this host's Review queue has that path",
    });
  }
  const settings = await readDispatchSettings(context);
  const argv = [...heldBase(settings.held ?? []), "show", path, "--json"];
  const outcome = await run(argv, { timeoutMs: REVIEW_TIMEOUT_MS });
  const failed = runFailure(HELD_SHOW_SOURCE, outcome, REVIEW_TIMEOUT_MS);
  if (outcome.kind !== "exited" || outcome.exitCode !== 0) {
    return failure({
      kind: "failed",
      source: HELD_SHOW_SOURCE,
      exitCode: failed.exitCode,
      message: failed.detail ?? "the show verb failed",
    });
  }
  let body: unknown;
  try {
    body = (JSON.parse(outcome.stdout) as { body?: unknown }).body;
  } catch {
    body = undefined;
  }
  if (typeof body !== "string") {
    return failure({
      kind: "failed",
      source: HELD_SHOW_SOURCE,
      exitCode: 0,
      message: "the show verb printed no body",
    });
  }
  return { status: 200, body: { path, body } };
}

const sessionPart = (session: string): string => {
  const at = session.indexOf("@");
  return at < 0 ? session : session.slice(0, at);
};
const hostPart = (session: string): string | undefined => {
  const at = session.indexOf("@");
  return at < 0 ? undefined : session.slice(at + 1) || undefined;
};

type Resolved<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * The session a task's dispatch goes to: its assignee, at the host the assignee names, else the
 * host the work queue's session registry has it on, else `[dispatch] host`.
 */
export async function ownerOf(
  issue: Issue,
  context: ApiContext,
  settings: DispatchSettings,
): Promise<Resolved<DispatchTarget> | { ok: false; reason: string; unowned: true }> {
  const assignee = issue.assignee?.trim() ?? "";
  if (assignee === "") {
    return { ok: false, unowned: true, reason: `${issue.id} has no owning session` };
  }
  const session = sessionPart(assignee);
  const named = hostPart(assignee);
  if (named !== undefined) return { ok: true, value: { session, host: named } };
  const config = await context.config();
  if (config.queueUrl !== undefined) {
    const sessions = await new QueueClient(config.queueUrl).sessions();
    if (sessions.ok) {
      const live = sessions.value.find((row) => row.name === session && row.state !== "gone");
      if (live !== undefined && live.machine !== "") {
        return { ok: true, value: { session, host: live.machine } };
      }
    }
  }
  if (settings.host !== undefined) return { ok: true, value: { session, host: settings.host } };
  return {
    ok: false,
    reason: `${issue.id}'s owner ${assignee} names no host, the work queue does not place it, and [dispatch] host is not set`,
  };
}

/** The session holding a held item, at the machine the item names. */
function holderOf(item: ReviewItem): Resolved<DispatchTarget> {
  const session = sessionPart(item.session);
  const host = hostPart(item.session) ?? (item.machine === "" ? undefined : item.machine);
  if (session === "" || host === undefined) {
    return { ok: false, reason: `the held item names no session at a host (${item.session})` };
  }
  return { ok: true, value: { session, host } };
}

export interface DispatchSummaryBody {
  id: string;
  kind: DispatchKind;
  target: DispatchTarget;
  state: DeliveryState;
  mirrorError?: string;
}

/** A comment on the dispatch's task naming the dispatch id (T-W1.3). */
async function mirror(store: OpenStore, id: string, text: string): Promise<string | undefined> {
  try {
    const result = await store.bd.comment(id, text, DISPATCH_ACTOR);
    return result.kind === "ok"
      ? undefined
      : (bdFailure("bd comments add", result).body as { error: { message: string } }).error.message;
  } catch (error) {
    return (error as Error).message;
  }
}

/** What the ladder notes when the user clears the composer's arm-goal control (T-W2.3). */
export const ARM_GOAL_CLEARED = "the user cleared arm-goal for this dispatch";

/**
 * Writes one signed dispatch, mirrors it on the task when the task is an issue in `store`, and
 * hands it to the dispatch ladder (D-6).
 */
export async function writeDispatch(
  context: ApiContext,
  input: {
    task: DispatchTask;
    target: DispatchTarget;
    kind: DispatchKind;
    body: string;
    armGoal: boolean;
    /** True when the user cleared the composer's arm-goal control for this one dispatch. */
    armGoalCleared?: boolean;
    /** The open store whose issue the task is, for the mirrored comment; none for a held-only item. */
    mirrorIn?: OpenStore;
  },
): Promise<ApiReply> {
  let created: Awaited<ReturnType<ApiContext["dispatches"]["create"]>>;
  try {
    created = await context.dispatches.create({
      task: input.task,
      target: input.target,
      kind: input.kind,
      body: input.body,
      arm_goal: input.armGoal,
    });
  } catch (error) {
    if (error instanceof DispatchRefused) return refused(error.message);
    throw error;
  }
  const { record, state } = created.dispatch;
  const summary: DispatchSummaryBody = {
    id: record.id,
    kind: record.kind,
    target: record.target,
    state,
  };
  const cleared = input.armGoalCleared === true;
  if (created.created && cleared) {
    await context.dispatches.store.annotate(record.id, {
      op: "note",
      id: record.id,
      at: context.now(),
      source: "the composer",
      text: ARM_GOAL_CLEARED,
    });
  }
  if (input.mirrorIn !== undefined && created.created) {
    const problem = await mirror(
      input.mirrorIn,
      input.task.id,
      `beads-ui dispatch ${record.id}: ${record.kind} for ${record.target.session}@${record.target.host}${cleared ? ", arm-goal cleared by the user" : ""}, delivered through the dispatch ladder.`,
    );
    if (problem !== undefined) summary.mirrorError = problem;
  }
  if (created.created) await context.ladder.submit(record);
  return { status: 201, body: { dispatch: summary } };
}

/** The issue a write names by `repo` and `task` in the body, read from its open store. */
async function taskIn(
  request: ApiRequest,
  context: ApiContext,
): Promise<{ store: OpenStore; issue: Issue } | ApiReply> {
  const repo = textOf(request.body, "repo");
  const id = textOf(request.body, "task");
  if (repo === undefined || id === undefined)
    return invalid("name the task with `repo` and `task`");
  const store = await storeNamed(context, repo);
  if (!isStore(store)) return store;
  let shown: Awaited<ReturnType<OpenStore["bd"]["show"]>>;
  try {
    shown = await store.bd.show(id);
  } catch (error) {
    if (error instanceof RangeError) return invalid(error.message);
    throw error;
  }
  if (shown.kind !== "ok") return bdFailure("bd show", shown);
  return { store, issue: shown.value };
}

const isReply = (value: unknown): value is ApiReply =>
  isObject(value) && typeof value.status === "number" && "body" in value;

/** A prompt on a task, to its owning session, or on a held item, to the session holding it. */
async function promptRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const text = textOf(request.body, "text");
  if (text === undefined) return invalid("a prompt needs `text`");
  const armGoal = !(isObject(request.body) && request.body.armGoal === false);
  const path = textOf(request.body, "item");
  if (path !== undefined) {
    const row = await heldRow(context, path);
    if (row === undefined)
      return refused("no open held item on this host's Review queue has that path");
    const target = holderOf(row.item);
    if (!target.ok) return refused(target.reason);
    const open = await openStores(context);
    const joinedStore = open.find((store) => store.repository === row.joined?.repo);
    return writeDispatch(context, {
      task:
        row.joined === undefined
          ? { repo: row.repository, id: row.item.relpath || row.item.path }
          : { repo: row.joined.repo, id: row.joined.issue.id },
      target: target.value,
      kind: "prompt",
      body: text,
      armGoal,
      armGoalCleared: !armGoal,
      ...(joinedStore === undefined || row.joined === undefined ? {} : { mirrorIn: joinedStore }),
    });
  }
  const found = await taskIn(request, context);
  if (isReply(found)) return found;
  const settings = await readDispatchSettings(context);
  const target = await ownerOf(found.issue, context, settings);
  if (!target.ok) return refused(target.reason);
  return writeDispatch(context, {
    task: { repo: found.store.repository, id: found.issue.id },
    target: target.value,
    kind: "prompt",
    body: text,
    armGoal,
    armGoalCleared: !armGoal,
    mirrorIn: found.store,
  });
}

/** The exact bytes a control-chosen answer records (D-3): each decision's letter, then the statement. */
export function controlAnswer(
  choices: readonly { decision: string; key: string; label: string }[],
): string {
  const lines = choices.map((choice) => `${choice.decision}: (${choice.key}) ${choice.label}`);
  return `${lines.join("\n")}\n\n${CONTROL_STATEMENT}\n`;
}

interface OptionDecision {
  id: string;
  options: { key: string; label: string }[];
}

/** The decisions of one item, from the options command; undefined when it gave none. */
async function decisionsOf(
  settings: DispatchSettings,
  path: string,
): Promise<OptionDecision[] | string> {
  const read = await readOptions(settings, [path]);
  if (read.state === "failed") {
    const code = read.failure.exitCode === null ? "no exit code" : `exit ${read.failure.exitCode}`;
    const why = read.failure.detail === undefined ? "" : `: ${read.failure.detail}`;
    return `${read.failure.source} could not be read (${code})${why}`;
  }
  try {
    const json = JSON.parse(read.stdout) as {
      items?: { item?: string; error?: unknown; decisions?: OptionDecision[] }[];
    };
    const item = json.items?.find((row) => row.item === path);
    if (item === undefined || item.error !== null || !Array.isArray(item.decisions)) {
      return "the options command gave no options for this item";
    }
    return item.decisions;
  } catch {
    return "the options command printed no JSON";
  }
}

/**
 * An answer to a held item, to the session holding it (T-W1.2): `choices`, one option per decision
 * chosen with a control, recorded as D-3's letter and statement; or `text`, typed, recorded as typed.
 */
async function answerRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const path = textOf(request.body, "item");
  if (path === undefined) return invalid("an answer names its held item with `item`");
  const followUp = textOf(request.body, "followUp");
  const typed =
    isObject(request.body) && typeof request.body.text === "string" ? request.body.text : undefined;
  const rawChoices = isObject(request.body) ? request.body.choices : undefined;
  if ((typed === undefined) === (rawChoices === undefined)) {
    return invalid("an answer is either `choices` or `text`");
  }
  const row = await heldRow(context, path);
  if (row === undefined)
    return refused("no open held item on this host's Review queue has that path");
  const target = holderOf(row.item);
  if (!target.ok) return refused(target.reason);
  let answer: string;
  if (typed !== undefined) {
    if (typed.trim() === "") return invalid("a typed answer cannot be empty");
    answer = typed;
  } else {
    if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
      return invalid("`choices` is a list of { decision, key }");
    }
    const settings = await readDispatchSettings(context);
    const decisions = await decisionsOf(settings, path);
    if (typeof decisions === "string") return refused(decisions, HELD_OPTIONS_SOURCE);
    const chosen: { decision: string; key: string; label: string }[] = [];
    for (const decision of decisions) {
      const pick = rawChoices.find(
        (choice) => isObject(choice) && choice.decision === decision.id,
      ) as { key?: unknown } | undefined;
      const option = decision.options.find((one) => one.key === pick?.key);
      if (option === undefined) {
        return invalid(`${decision.id} has no chosen option of its own`);
      }
      chosen.push({ decision: decision.id, key: option.key, label: option.label });
    }
    if (chosen.length !== rawChoices.length) {
      return invalid("`choices` names a decision this item does not hold");
    }
    answer = controlAnswer(chosen);
  }
  const open = await openStores(context);
  const joinedStore = open.find((store) => store.repository === row.joined?.repo);
  const body = JSON.stringify({
    version: 1,
    item: { store: row.item.store, relpath: row.item.relpath, path: row.item.path },
    answer,
  });
  const task =
    row.joined === undefined
      ? { repo: row.repository, id: row.item.relpath || row.item.path }
      : { repo: row.joined.repo, id: row.joined.issue.id };
  const reply = await writeDispatch(context, {
    task,
    target: target.value,
    kind: "answer",
    body,
    armGoal: followUp !== undefined,
    ...(joinedStore === undefined || row.joined === undefined ? {} : { mirrorIn: joinedStore }),
  });
  if (reply.status === 201) {
    (reply.body as { answer?: string }).answer = answer;
    if (followUp !== undefined) {
      const { dispatch } = reply.body as { dispatch: DispatchSummaryBody };
      await queueFollowUp(context, {
        unblock: dispatch.id,
        task,
        target: target.value,
        text: followUp,
      });
    }
  }
  return reply;
}

/** An unblock's next-step prompt, kept until the unblock it follows is acted on. */
interface FollowUp {
  unblock: string;
  task: DispatchTask;
  target: DispatchTarget;
  state: "pending" | "sent" | "dropped";
  /** Deleted once sent or dropped, as a dispatch body is. */
  text?: string;
  prompt?: string;
  reason?: string;
}

const followUpSerial = new Serial();

async function readFollowUps(dir: string): Promise<FollowUp[]> {
  try {
    const json = JSON.parse(await readFile(join(dir, FOLLOW_UPS_FILE), "utf8")) as {
      followUps?: FollowUp[];
    };
    return Array.isArray(json.followUps) ? json.followUps : [];
  } catch {
    return [];
  }
}

/** Keeps a next-step prompt until the dispatch it follows is acted on. */
function queueFollowUp(
  context: ApiContext,
  input: { unblock: string; task: DispatchTask; target: DispatchTarget; text: string },
): Promise<void> {
  return followUpSerial.run(async () => {
    const dir = context.dispatches.stateDir;
    const followUps = await readFollowUps(dir);
    followUps.push({ ...input, state: "pending" });
    await writeFollowUps(dir, followUps);
  });
}

async function writeFollowUps(dir: string, followUps: readonly FollowUp[]): Promise<void> {
  const path = join(dir, FOLLOW_UPS_FILE);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const next = `${path}.${randomBytes(6).toString("hex")}.new`;
  await writeFile(next, `${JSON.stringify({ version: 1, followUps }, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await rename(next, path);
}

/**
 * Sends every pending next-step prompt whose unblock was acted on to the same session, and drops
 * the ones whose unblock failed or expired (T-W1.6). Runs on each status read and each sweep.
 */
export function releaseFollowUps(context: ApiContext): Promise<void> {
  return followUpSerial.run(async () => {
    const dir = context.dispatches.stateDir;
    const followUps = await readFollowUps(dir);
    let changed = false;
    for (const followUp of followUps) {
      if (followUp.state !== "pending") continue;
      const unblock = await context.dispatches.store.get(followUp.unblock);
      if (unblock === undefined || !isFinalDelivery(unblock.state)) continue;
      changed = true;
      if (unblock.state !== "acted") {
        followUp.state = "dropped";
        followUp.reason = `the unblock ${unblock.state === "failed" ? `failed${unblock.machine.reason === undefined ? "" : `: ${unblock.machine.reason}`}` : "expired"}`;
        delete followUp.text;
        continue;
      }
      try {
        const created = await context.dispatches.create({
          task: followUp.task,
          target: followUp.target,
          kind: "prompt",
          body: followUp.text ?? "",
          arm_goal: true,
        });
        followUp.state = "sent";
        followUp.prompt = created.dispatch.record.id;
        if (created.created) await context.ladder.submit(created.dispatch.record);
        const open = await openStores(context).catch(() => [] as OpenStore[]);
        const store = open.find((one) => one.repository === followUp.task.repo);
        if (store !== undefined) {
          await mirror(
            store,
            followUp.task.id,
            `beads-ui dispatch ${created.dispatch.record.id}: the next-step prompt after unblock ${followUp.unblock}, for ${followUp.target.session}@${followUp.target.host}.`,
          );
        }
      } catch (error) {
        if (!(error instanceof DispatchRefused)) throw error;
        followUp.state = "dropped";
        followUp.reason = error.message;
      }
      delete followUp.text;
    }
    if (changed) await writeFollowUps(dir, followUps);
  });
}

/** The `[unblocked]`-reading resolution comment the server writes before its own bd-unblock. */
export const resolutionComment = (text: string, at: string): string =>
  `Resolution (beads-ui web, ${at}):\n${text}`;

/**
 * An unblock from the Review queue (T-W1.6): to the task's owning session as a dispatch of kind
 * unblock, with an optional next-step prompt sent once it is acted on; with no owning session, the
 * server writes the resolution comment and runs bd-unblock itself.
 */
async function unblockRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const resolution = textOf(request.body, "resolution");
  if (resolution === undefined) return invalid("an unblock needs its `resolution`");
  const followUp = textOf(request.body, "followUp");
  const found = await taskIn(request, context);
  if (isReply(found)) return found;
  const { store, issue } = found;
  if (issue.status !== "blocked")
    return refused(`${issue.id} is ${issue.status}, not blocked`, "bd show");
  const settings = await readDispatchSettings(context);
  const target = await ownerOf(issue, context, settings);
  if (!target.ok) {
    if (!("unowned" in target)) return refused(target.reason);
    const commented = await mirror(store, issue.id, resolutionComment(resolution, context.now()));
    if (commented !== undefined) {
      return failure({ kind: "failed", source: "bd comments add", message: commented });
    }
    // The comment above keeps the resolution whole; bd-unblock takes a `--why` of one line only.
    const why = resolution.replace(/\s+/g, " ").trim();
    const argv = [...settings.unblockCommand, issue.id, "--to", "in_progress", "--why", why];
    const outcome = await run(argv, { cwd: store.path, timeoutMs: UNBLOCK_TIMEOUT_MS });
    if (outcome.kind !== "exited" || outcome.exitCode !== 0) {
      const failed = runFailure(settings.unblockCommand.join(" "), outcome, UNBLOCK_TIMEOUT_MS);
      return failure({
        kind: "failed",
        source: failed.source,
        exitCode: failed.exitCode,
        message: failed.detail ?? "the unblock command failed",
      });
    }
    const message = `${issue.id} had no owning session, so this server unblocked it${followUp === undefined ? "" : "; the next-step prompt was not sent, as no session owns the task"}`;
    return { status: 200, body: { via: "server", message } };
  }
  const reply = await writeDispatch(context, {
    task: { repo: store.repository, id: issue.id },
    target: target.value,
    kind: "unblock",
    body: JSON.stringify({ version: 1, resolution, to: "in_progress" }),
    armGoal: followUp !== undefined,
    mirrorIn: store,
  });
  if (reply.status === 201 && followUp !== undefined) {
    const { dispatch } = reply.body as { dispatch: DispatchSummaryBody };
    await queueFollowUp(context, {
      unblock: dispatch.id,
      task: { repo: store.repository, id: issue.id },
      target: target.value,
      text: followUp,
    });
  }
  return reply.status === 201
    ? { status: 201, body: { via: "dispatch", ...(reply.body as object) } }
    : reply;
}

type Tone = "ok" | "busy" | "warn" | "error" | "idle";
interface IndicatorBody {
  text: string;
  source: string;
  tone: Tone;
}

const DELIVERY_TONE: Readonly<Record<DeliveryState, Tone>> = {
  queued: "idle",
  waiting: "warn",
  shown: "busy",
  taken: "busy",
  acted: "ok",
  failed: "error",
  expired: "error",
};

/** Whether the target session is live, by the only registry that knows: the work queue's. */
async function livenessOf(context: ApiContext, target: DispatchTarget): Promise<IndicatorBody> {
  const config = await context.config();
  if (config.queueUrl === undefined) {
    return { text: "unknown", source: "no work queue is configured ([queue] url)", tone: "idle" };
  }
  const sessions = await new QueueClient(config.queueUrl).sessions();
  if (!sessions.ok) {
    return {
      text: "unknown",
      source: `the work queue (${sessions.failure.message})`,
      tone: "warn",
    };
  }
  const row = sessions.value.find(
    (session) => session.name === target.session && session.machine === target.host,
  );
  const source = "the work queue's session registry";
  if (row === undefined) return { text: "not registered", source, tone: "warn" };
  const beat = row.lastHeartbeatAt === undefined ? "" : `, last heartbeat ${row.lastHeartbeatAt}`;
  return { text: `${row.state}${beat}`, source, tone: row.state === "gone" ? "error" : "ok" };
}

function responseOf(dispatch: StoredDispatch): IndicatorBody {
  const receipt = dispatch.receipts.at(-1);
  if (receipt === undefined) {
    return { text: "none yet", source: "receipts from the target session", tone: "idle" };
  }
  const text =
    receipt.state === "taken"
      ? "working on it"
      : receipt.state === "acted"
        ? `acted on${receipt.reason === undefined ? "" : `: ${receipt.reason}`}`
        : `failed: ${receipt.reason ?? "no reason given"}`;
  const tone: Tone =
    receipt.state === "failed" ? "error" : receipt.state === "acted" ? "ok" : "busy";
  return { text, source: `${receipt.source} at ${receipt.at}`, tone };
}

/** A dispatch's three indicators now (D-5, T-W1.3), and an unblock's next-step prompt. */
async function statusRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  await context.dispatches.expireDue();
  await releaseFollowUps(context);
  const dispatch = await context.dispatches.store.get(request.params.id ?? "");
  if (dispatch === undefined) {
    return failure({ kind: "not-found", source: "dispatch store", message: "no such dispatch" });
  }
  const { record, machine, state } = dispatch;
  const summary = rungSummary(dispatch.rungs);
  const label = deliveryLabel(machine);
  const body: Record<string, unknown> = {
    id: record.id,
    kind: record.kind,
    target: record.target,
    state,
    final: isFinalDelivery(state),
    liveness: await livenessOf(context, record.target),
    delivery: {
      text: summary === undefined || isFinalDelivery(state) ? label : `${label} (${summary})`,
      source: machine.source,
      tone: DELIVERY_TONE[state],
    },
    response: responseOf(dispatch),
    ladder: {
      rungs: dispatch.rungs,
      ...(summary === undefined ? {} : { summary }),
      notes: dispatch.notes,
      ...(dispatch.hold === undefined ? {} : { hold: dispatch.hold }),
    },
    deliverNow: dispatch.hold?.reason === GOAL_PAUSED,
  };
  if (record.kind === "unblock") {
    const followUp = (await readFollowUps(context.dispatches.stateDir)).find(
      (one) => one.unblock === record.id,
    );
    if (followUp !== undefined) {
      body.followUp = {
        state: followUp.state,
        ...(followUp.prompt === undefined ? {} : { prompt: followUp.prompt }),
        ...(followUp.reason === undefined ? {} : { reason: followUp.reason }),
      };
      if (followUp.state === "pending") body.final = false;
    }
  }
  return { status: 200, body };
}

/** "Deliver now" on a dispatch waiting on a paused goal (T-W2.3): delivered at once. */
async function deliverNowRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const id = request.params.id ?? "";
  const by =
    request.caller.kind === "browser"
      ? (request.caller.identity ?? "the signed-in user")
      : "the user";
  const done = await context.ladder.deliverNow(id, by);
  if (!done.ok)
    return failure({ kind: "not-held", source: "dispatch ladder", message: done.reason });
  return { status: 200, body: { id, released: true } };
}

/** The work queue's skill catalog, for the composer's typeahead. */
async function skillsRoute(_request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const config = await context.config();
  if (config.queueUrl === undefined) {
    return failure({
      kind: "not-found",
      source: "[queue] url",
      message: "no work queue is configured, so there is no skill catalog",
    });
  }
  let response: Response;
  try {
    response = await fetch(`${config.queueUrl.replace(/\/+$/, "")}/api/queue/skills`, {
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    return failure({
      kind: "failed",
      source: "GET /api/queue/skills",
      message: (error as Error).message,
    });
  }
  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !Array.isArray(json)) {
    return failure({
      kind: "failed",
      source: "GET /api/queue/skills",
      message: `the work queue answered ${response.status}`,
    });
  }
  const skills = json.flatMap((row) =>
    isObject(row) && typeof row.name === "string"
      ? [{ name: row.name, ...(typeof row.source === "string" ? { source: row.source } : {}) }]
      : [],
  );
  return { status: 200, body: { skills } };
}

/** The Review queue's and the composer's routes, in their own block of the route table. */
export const DISPATCH_ROUTES: readonly Route[] = [
  { method: "GET", path: "/api/review", handle: reviewRoute },
  { method: "GET", path: "/api/review/body", handle: heldBodyRoute },
  { method: "GET", path: "/api/dispatch/skills", handle: skillsRoute },
  { method: "POST", path: "/api/dispatch/prompt", dispatch: true, handle: promptRoute },
  { method: "POST", path: "/api/dispatch/answer", dispatch: true, handle: answerRoute },
  { method: "POST", path: "/api/dispatch/unblock", dispatch: true, handle: unblockRoute },
  { method: "GET", path: "/api/dispatch/:id", handle: statusRoute },
  {
    method: "POST",
    path: "/api/dispatch/:id/deliver-now",
    dispatch: true,
    handle: deliverNowRoute,
  },
];
