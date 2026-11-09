import {
  type Issue,
  keyBetween,
  type Priority,
  RANK_KEY,
  type RandomSource,
  readRank,
  storeName,
} from "@beads-ui/core";
import type { BdClient, BdResult } from "@sergeiwallace/beads-ui-bd-node";
import type { WebConfig } from "./config.ts";

/** What every route reads through: the store's bd client and the call-time settings. */
export interface ApiContext {
  repoRoot: string;
  bd: BdClient;
  /** Read again on every call, so an edit to `beads-ui.toml` applies to the next request. */
  config(): Promise<WebConfig>;
  random: RandomSource;
  /** An ISO stamp for "as of". */
  now(): string;
}

export interface ApiRequest {
  params: Readonly<Record<string, string>>;
  body: unknown;
}

export interface ApiReply {
  status: number;
  body: unknown;
}

export type ApiErrorKind =
  | "stale"
  | "not-found"
  | "failed"
  | "timeout"
  | "invalid"
  | "malformed-rank"
  | "rank-off"
  | "unknown-route";

/** Every error body is `{ error: ApiError }`; `source` names what failed (`bd list`, a field). */
export interface ApiError {
  kind: ApiErrorKind;
  message: string;
  source?: string;
  exitCode?: number | null;
}

export interface Route {
  method: "GET" | "POST";
  /** Under `/api/`; a `:name` segment is a parameter. */
  path: string;
  handle(request: ApiRequest, context: ApiContext): Promise<ApiReply>;
}

const STATUS_BY_KIND: Readonly<Record<ApiErrorKind, number>> = {
  stale: 409,
  "rank-off": 409,
  "not-found": 404,
  "unknown-route": 404,
  invalid: 400,
  "malformed-rank": 422,
  failed: 502,
  timeout: 504,
};

export function failure(error: ApiError): ApiReply {
  return { status: STATUS_BY_KIND[error.kind], body: { error } };
}

const firstLine = (text: string): string => text.trim().split("\n")[0] ?? "";

/** The reply for a bd call that did not succeed, naming the call as its source. */
function bdFailure<T>(source: string, result: Exclude<BdResult<T>, { kind: "ok" }>): ApiReply {
  switch (result.kind) {
    case "stale":
      return failure({
        kind: "stale",
        source,
        exitCode: result.exitCode,
        message: firstLine(result.stderr) || `${result.id} changed elsewhere; nothing was written`,
      });
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function text(body: unknown, key: string): string | undefined {
  if (!isObject(body)) return undefined;
  const value = body[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function invalid(message: string): ApiReply {
  return failure({ kind: "invalid", message });
}

// bd's argument checks (no blank, no leading "-") throw RangeError; that is the caller's input.
async function guardedWrite(
  write: () => Promise<BdResult<void>>,
): Promise<BdResult<void> | ApiReply> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof RangeError) return invalid(error.message);
    throw error;
  }
}

const isReply = (value: BdResult<void> | ApiReply): value is ApiReply => "status" in value;

async function boardRoute(_request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const config = await context.config();
  // One bd process at a time: an embedded store takes one writer, and reads queue behind it.
  const statuses = await context.bd.statuses();
  if (statuses.kind !== "ok") return bdFailure("bd statuses", statuses);
  const issues = await context.bd.board();
  if (issues.kind !== "ok") return bdFailure("bd list", issues);
  return {
    status: 200,
    body: {
      store: storeName(context.repoRoot),
      statuses: statuses.value,
      issues: issues.value,
      rank: config.rank,
      softWipLimit: config.softWipLimit,
      refreshSeconds: config.refreshSeconds,
      asOf: context.now(),
      problems: config.problems,
    },
  };
}

async function issueRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const id = request.params.id ?? "";
  let shown: BdResult<Issue>;
  try {
    shown = await context.bd.show(id);
  } catch (error) {
    if (error instanceof RangeError) return invalid(error.message);
    throw error;
  }
  if (shown.kind !== "ok") return bdFailure("bd show", shown);
  const comments = await context.bd.comments(id);
  if (comments.kind === "ok") {
    return { status: 200, body: { issue: shown.value, comments: comments.value } };
  }
  // The issue still shows; its comments say why they are missing instead of reading as none.
  const { body } = bdFailure("bd comments", comments);
  return {
    status: 200,
    body: {
      issue: shown.value,
      comments: null,
      commentsError: (body as { error: ApiError }).error,
    },
  };
}

async function statusRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const id = request.params.id ?? "";
  const to = text(request.body, "to");
  const shown = text(request.body, "shown");
  if (to === undefined || shown === undefined) {
    return invalid("a status move needs `to` and `shown`, the status the card was drawn in");
  }
  const result = await guardedWrite(() =>
    context.bd.update(id, { status: to }, { ifStatus: shown }),
  );
  if (isReply(result)) return result;
  if (result.kind !== "ok") return bdFailure("bd update", result);
  return { status: 200, body: { id, status: to } };
}

const isPriority = (value: unknown): value is Priority =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;

async function priorityRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const id = request.params.id ?? "";
  const priority = isObject(request.body) ? request.body.priority : undefined;
  const shown = text(request.body, "shown");
  if (!isPriority(priority) || shown === undefined) {
    return invalid("a priority write needs `priority` (0 to 4) and `shown`, the drawn status");
  }
  const result = await guardedWrite(() => context.bd.update(id, { priority }, { ifStatus: shown }));
  if (isReply(result)) return result;
  if (result.kind !== "ok") return bdFailure("bd update", result);
  return { status: 200, body: { id, priority } };
}

/**
 * A neighbour's current key, read from the store rather than trusted from the page: a neighbour
 * that moved, lost its rank or vanished makes the reorder stale; a malformed rank names itself.
 */
async function neighbourKey(
  context: ApiContext,
  id: string | undefined,
  shown: string,
): Promise<{ key: string | undefined } | ApiReply> {
  if (id === undefined) return { key: undefined };
  const read = await context.bd.show(id);
  if (read.kind === "notFound") {
    return failure({
      kind: "stale",
      source: "bd show",
      message: `${id} is no longer in the store`,
    });
  }
  if (read.kind !== "ok") return bdFailure("bd show", read);
  const issue = read.value;
  if (issue.status !== shown) {
    return failure({
      kind: "stale",
      source: "bd show",
      message: `${id} is now ${issue.status}, not ${shown}`,
    });
  }
  const rank = readRank(issue);
  if (rank.kind === "malformed") {
    return failure({
      kind: "malformed-rank",
      source: `metadata.${RANK_KEY} of ${id}`,
      message: rank.message,
    });
  }
  if (rank.kind === "unranked") {
    return failure({ kind: "stale", source: "bd show", message: `${id} has no rank any more` });
  }
  return { key: rank.key };
}

async function rankRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const id = request.params.id ?? "";
  const shown = text(request.body, "shown");
  const above = text(request.body, "above");
  const below = text(request.body, "below");
  if (shown === undefined) return invalid("a reorder needs `shown`, the card's drawn status");
  if (above === id || below === id) return invalid("a card cannot be its own neighbour");
  const config = await context.config();
  if (!config.rank) {
    const where = config.source === undefined ? "" : ` in ${config.source}`;
    return failure({
      kind: "rank-off",
      source: "views.rank",
      message: `views.rank is off${where}, so cards keep their sorted order`,
    });
  }
  let bounds: [{ key: string | undefined } | ApiReply, { key: string | undefined } | ApiReply];
  try {
    bounds = [await neighbourKey(context, above, shown), await neighbourKey(context, below, shown)];
  } catch (error) {
    if (error instanceof RangeError) return invalid(error.message);
    throw error;
  }
  const [low, high] = bounds;
  if ("status" in low) return low;
  if ("status" in high) return high;
  const key = keyBetween(low.key, high.key, context.random);
  if (!key.ok) {
    return key.error.kind === "out-of-order"
      ? failure({ kind: "stale", source: "bd show", message: key.error.message })
      : failure({
          kind: "malformed-rank",
          source: `metadata.${RANK_KEY}`,
          message: key.error.message,
        });
  }
  const result = await guardedWrite(() =>
    context.bd.update(id, { metadata: { [RANK_KEY]: key.value } }, { ifStatus: shown }),
  );
  if (isReply(result)) return result;
  if (result.kind !== "ok") return bdFailure("bd update", result);
  return { status: 200, body: { id, rank: key.value } };
}

/** Every API route, in one table, so a later layer can stand in front of all of them. */
export const ROUTES: readonly Route[] = [
  { method: "GET", path: "/api/board", handle: boardRoute },
  { method: "GET", path: "/api/issues/:id", handle: issueRoute },
  { method: "POST", path: "/api/issues/:id/status", handle: statusRoute },
  { method: "POST", path: "/api/issues/:id/priority", handle: priorityRoute },
  { method: "POST", path: "/api/issues/:id/rank", handle: rankRoute },
];

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

/** The route a method and path name, with its decoded parameters; undefined for none. */
export function matchRoute(
  method: string,
  pathname: string,
  routes: readonly Route[] = ROUTES,
): RouteMatch | undefined {
  const parts = pathname.split("/");
  for (const route of routes) {
    if (route.method !== method) continue;
    const pattern = route.path.split("/");
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const matched = pattern.every((segment, i) => {
      const part = parts[i] ?? "";
      if (segment.startsWith(":")) {
        try {
          params[segment.slice(1)] = decodeURIComponent(part);
        } catch {
          return false;
        }
        return part !== "";
      }
      return segment === part;
    });
    if (matched) return { route, params };
  }
  return undefined;
}
