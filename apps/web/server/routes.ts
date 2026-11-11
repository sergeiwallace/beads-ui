import {
  type Issue,
  keyBetween,
  type Priority,
  RANK_KEY,
  type RandomSource,
  readRank,
  type Status,
} from "@beads-ui/core";
import type { BdResult } from "@sergeiwallace/beads-ui-bd-node";
import type { Allowlist, AllowlistHealth } from "./allowlist.ts";
import type { Caller } from "./auth.ts";
import type { WebConfig } from "./config.ts";
import { DISPATCH_ROUTES } from "./dispatch.ts";
import type { DispatchLadder } from "./dispatch-ladder.ts";
import type { DispatchService } from "./dispatch-service.ts";
import { listRankRoute, ownerRoute, ownersRoute, sprintRoute } from "./edits.ts";
import type { HeadsFeed } from "./heads-feed.ts";
import { heldItemRoute } from "./held-detail.ts";
import { handoffRoute } from "./owner-handoff.ts";
import { queueViewRoute } from "./queue-view.ts";
import { RECEIVER_ROUTES } from "./receiver-api.ts";
import type { OpenStore, StoreRegistry } from "./registry.ts";
import { analyticsRoute, queueStatusWrite, roadmapRoute, sessionsRoute } from "./views.ts";

/** What every route reads through: the host's open stores and the call-time settings. */
export interface ApiContext {
  /** The directory the server started in; its `beads-ui.toml` is the settings file it reads. */
  repoRoot: string;
  /**
   * Every store on the host whose repository is on the allowlist (D-18), read again on every
   * call; each store's bd client runs nothing once its repository leaves the allowlist.
   */
  stores: StoreRegistry;
  /** Read again on every call, so an edit to `beads-ui.toml` applies to the next request. */
  config(): Promise<WebConfig>;
  /**
   * This host's repository allowlist, or with `host` that host's published copy, read again on
   * every call. Every queue or store row passes filterAllowed before it is returned.
   */
  allowlist(host?: string): Promise<Allowlist>;
  /** What filterAllowed dropped, counted for the health line without naming a repository. */
  health: AllowlistHealth;
  /** The dispatch store the receiver API serves, with the signer and the expiry sweep. */
  dispatches: DispatchService;
  /** How a written dispatch reaches its session (D-6, D-7, D-10). */
  ladder: DispatchLadder;
  /** The change feed: a store's board read is kept until its Dolt head moves (D-13). */
  feed?: HeadsFeed<StoreBoard>;
  random: RandomSource;
  /** An ISO stamp for "as of". */
  now(): string;
}

export interface ApiRequest {
  params: Readonly<Record<string, string>>;
  query: URLSearchParams;
  body: unknown;
  /** Who the authentication layer admitted: a browser session, a receiving host, or the MCP server. */
  caller: Caller;
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
  | "unknown-route"
  | "unauthenticated"
  | "forbidden"
  | "store-closed"
  // An owner change on a claimed task, which goes through the holder's handoff (edits.ts).
  | "handoff-required"
  // An owner change whose holder's liveness the fleet's check could not establish (T-W2.2).
  | "owner-unknown"
  // A dispatch action its dispatch's state does not allow, such as deliver now (T-W2.3).
  | "not-held";

/** Every error body is `{ error: ApiError }`; `source` names what failed (`bd list`, a field). */
export interface ApiError {
  kind: ApiErrorKind;
  message: string;
  source?: string;
  exitCode?: number | null;
  /** True when the same request may succeed once the state it names changes. */
  retry?: boolean;
}

/**
 * One API route. Its path's prefix decides the one credential it takes (auth.ts routeClass):
 * `/api/receiver/` the receiver token, `/api/mcp/` the MCP token, any other the browser session.
 */
export interface Route {
  method: "GET" | "POST";
  /** Under `/api/`; a `:name` segment is a parameter. */
  path: string;
  /**
   * A route that makes a session act: behind Tailscale Serve it also needs the request's
   * identity on `[auth] dispatch_identities`, on top of the session.
   */
  dispatch?: boolean;
  /** A string or byte body is sent as text/plain; any other as JSON. */
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
  unauthenticated: 401,
  forbidden: 403,
  "store-closed": 503,
  "handoff-required": 409,
  "owner-unknown": 409,
  "not-held": 409,
};

export function failure(error: ApiError): ApiReply {
  return { status: STATUS_BY_KIND[error.kind], body: { error } };
}

const firstLine = (text: string): string => text.trim().split("\n")[0] ?? "";

/** The reply for a bd call that did not succeed, naming the call as its source. */
export function bdFailure<T>(
  source: string,
  result: Exclude<BdResult<T>, { kind: "ok" }>,
): ApiReply {
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

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function text(body: unknown, key: string): string | undefined {
  if (!isObject(body)) return undefined;
  const value = body[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function invalid(message: string): ApiReply {
  return failure({ kind: "invalid", message });
}

// bd's argument checks (no blank, no leading "-") throw RangeError; that is the caller's input.
export async function guardedWrite(
  write: () => Promise<BdResult<void>>,
): Promise<BdResult<void> | ApiReply> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof RangeError) return invalid(error.message);
    throw error;
  }
}

export const isReply = (value: BdResult<void> | ApiReply): value is ApiReply => "status" in value;

/** The `store` query parameter: the repository, as the board names it, a request addresses. */
export const STORE_PARAM = "store";

/**
 * The open store a request addresses: the one `?store=` names, or with none named the only open
 * store. A store that is not open, or no name while several are, is refused.
 */
export async function storeOf(
  request: ApiRequest,
  context: ApiContext,
  name: string | null = request.query.get(STORE_PARAM),
): Promise<OpenStore | ApiReply> {
  const open = await context.stores.open();
  if (name !== null && name !== "") {
    return (
      open.find((store) => store.repository === name) ??
      failure({
        kind: "not-found",
        source: STORE_PARAM,
        message: `no open store on this host is named ${JSON.stringify(name)}`,
      })
    );
  }
  const [only] = open;
  if (open.length === 1 && only !== undefined) return only;
  return invalid(`${open.length} stores are open: name one with ?${STORE_PARAM}=<repository>`);
}

export const isStore = (value: OpenStore | ApiReply): value is OpenStore => "bd" in value;

/** The stores read at once by the all-stores view; each store still runs one bd at a time. */
const CONCURRENT_STORES = 4;

async function inTurn<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      const task = tasks[i];
      if (task !== undefined) results[i] = await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export type StoreBoard =
  | { repository: string; ok: true; statuses: Status[]; issues: Issue[] }
  | { repository: string; ok: false; reply: ApiReply };

export async function readStoreBoard(store: OpenStore): Promise<StoreBoard> {
  // One bd process at a time: an embedded store takes one writer, and reads queue behind it.
  const statuses = await store.bd.statuses();
  if (statuses.kind !== "ok") {
    return { repository: store.repository, ok: false, reply: bdFailure("bd statuses", statuses) };
  }
  const issues = await store.bd.board();
  if (issues.kind !== "ok") {
    return { repository: store.repository, ok: false, reply: bdFailure("bd list", issues) };
  }
  return { repository: store.repository, ok: true, statuses: statuses.value, issues: issues.value };
}

const errorOf = (reply: ApiReply): ApiError => (reply.body as { error: ApiError }).error;

/**
 * The Board's and the Backlog's read: the store `?store=` names, or every open store, each issue
 * carrying its `repository`. A store that cannot be read is named with its error in `reads` and
 * the others still return; only when every store failed is the reply itself the failure.
 */
async function boardRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const config = await context.config();
  const named = request.query.get(STORE_PARAM);
  const open = await context.stores.open();
  let stores = open;
  if (named !== null && named !== "") {
    const chosen = await storeOf(request, context, named);
    if (!isStore(chosen)) return chosen;
    stores = [chosen];
  }
  const boards = await inTurn(
    stores.map((store) => () => context.feed?.read(store) ?? readStoreBoard(store)),
    CONCURRENT_STORES,
  );
  const reads = boards.map((board) =>
    board.ok
      ? { repository: board.repository, ok: true, count: board.issues.length }
      : { repository: board.repository, ok: false, error: errorOf(board.reply) },
  );
  if (boards.every((board) => !board.ok)) {
    const [first] = boards;
    if (first !== undefined && !first.ok) {
      if (boards.length === 1) return first.reply;
      return { status: first.reply.status, body: { error: errorOf(first.reply), reads } };
    }
  }
  const statuses: Status[] = [];
  const issues: (Issue & { repository: string })[] = [];
  for (const board of boards) {
    if (!board.ok) continue;
    for (const status of board.statuses) {
      if (!statuses.some((known) => known.name === status.name)) statuses.push(status);
    }
    for (const issue of board.issues) issues.push({ ...issue, repository: board.repository });
  }
  const [one] = stores;
  return {
    status: 200,
    body: {
      store: stores.length === 1 && one !== undefined ? one.repository : "every open store",
      chosen: named === null || named === "" ? null : named,
      repositories: open.map((store) => store.repository),
      reads,
      statuses,
      issues,
      rank: config.rank,
      softWipLimit: config.softWipLimit,
      refreshSeconds: config.refreshSeconds,
      asOf: context.now(),
      problems: config.problems,
      health: healthLines(context),
    },
  };
}

const healthLines = (context: ApiContext): string[] => context.health.lines();

/**
 * The host's health: whether the allowlist reads, which stores are open, and how many stores and
 * rows the allowlist hid, never which repositories they came from.
 */
async function healthRoute(_request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const allowlist = await context.allowlist();
  const stores = await context.stores.read();
  return {
    status: 200,
    body: {
      allowlist: allowlist.ok
        ? { readable: true, source: allowlist.source }
        : { readable: false, reason: allowlist.reason },
      stores: stores.open.map((store) => store.repository),
      ...(stores.closed === undefined ? {} : { closed: stores.closed }),
      hidden: context.health.hidden,
      lines: healthLines(context),
    },
  };
}

async function issueRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const id = request.params.id ?? "";
  const store = await storeOf(request, context);
  if (!isStore(store)) return store;
  let shown: BdResult<Issue>;
  try {
    shown = await store.bd.show(id);
  } catch (error) {
    if (error instanceof RangeError) return invalid(error.message);
    throw error;
  }
  if (shown.kind !== "ok") return bdFailure("bd show", shown);
  const { repository } = store;
  const comments = await store.bd.comments(id);
  if (comments.kind === "ok") {
    return { status: 200, body: { issue: shown.value, comments: comments.value, repository } };
  }
  // The issue still shows; its comments say why they are missing instead of reading as none.
  return {
    status: 200,
    body: {
      issue: shown.value,
      comments: null,
      commentsError: errorOf(bdFailure("bd comments", comments)),
      repository,
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
  const store = await storeOf(request, context);
  if (!isStore(store)) return store;
  // A task the work queue holds a lease on moves through the queue (T-3.4).
  const queued = await queueStatusWrite(context, store.repository, id, to, shown);
  if ("reply" in queued) return queued.reply;
  const result = await guardedWrite(() => store.bd.update(id, { status: to }, { ifStatus: shown }));
  if (isReply(result)) return result;
  if (result.kind !== "ok") return bdFailure("bd update", result);
  return {
    status: 200,
    body: { id, status: to, ...(queued.notice === undefined ? {} : { notice: queued.notice }) },
  };
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
  const store = await storeOf(request, context);
  if (!isStore(store)) return store;
  const result = await guardedWrite(() => store.bd.update(id, { priority }, { ifStatus: shown }));
  if (isReply(result)) return result;
  if (result.kind !== "ok") return bdFailure("bd update", result);
  return { status: 200, body: { id, priority } };
}

type Bound = { key: string | undefined } | ApiReply;

/**
 * A neighbour's current key, read from its own store rather than trusted from the page: a
 * neighbour that moved, lost its rank or vanished makes the reorder stale; a malformed rank names
 * itself.
 */
async function neighbourKey(
  store: OpenStore,
  id: string | undefined,
  shown: string,
): Promise<Bound> {
  if (id === undefined) return { key: undefined };
  const read = await store.bd.show(id);
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

/**
 * The reorder's guard on its neighbours: each is read again just before the write, and one that
 * moved, changed status or changed key since the key was chosen makes the reorder stale, so the
 * written key always lies between the neighbours as they stand.
 */
async function neighboursHeld(
  neighbours: readonly { store: OpenStore; id: string | undefined; key: string | undefined }[],
  shown: string,
): Promise<ApiReply | undefined> {
  for (const neighbour of neighbours) {
    if (neighbour.id === undefined) continue;
    const now = await neighbourKey(neighbour.store, neighbour.id, shown);
    if ("status" in now) return now;
    if (now.key !== neighbour.key) {
      return failure({
        kind: "stale",
        source: "bd show",
        message: `${neighbour.id} was reordered elsewhere while this reorder was written; nothing was written`,
      });
    }
  }
  return undefined;
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
  // The card's store is `?store=`; a neighbour in the all-stores view may sit in another store,
  // named by `aboveStore` or `belowStore`, and is read there.
  const store = await storeOf(request, context);
  if (!isStore(store)) return store;
  const neighbourStore = async (key: string) => {
    const named = text(request.body, key);
    return named === undefined ? store : storeOf(request, context, named);
  };
  const aboveStore = await neighbourStore("aboveStore");
  if (!isStore(aboveStore)) return aboveStore;
  const belowStore = await neighbourStore("belowStore");
  if (!isStore(belowStore)) return belowStore;
  let bounds: [Bound, Bound];
  try {
    bounds = [
      await neighbourKey(aboveStore, above, shown),
      await neighbourKey(belowStore, below, shown),
    ];
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
  const moved = await neighboursHeld(
    [
      { store: aboveStore, id: above, key: low.key },
      { store: belowStore, id: below, key: high.key },
    ],
    shown,
  );
  if (moved !== undefined) return moved;
  const result = await guardedWrite(() =>
    store.bd.update(id, { metadata: { [RANK_KEY]: key.value } }, { ifStatus: shown }),
  );
  if (isReply(result)) return result;
  if (result.kind !== "ok") return bdFailure("bd update", result);
  return { status: 200, body: { id, rank: key.value } };
}

/** Every API route, in one table, so a later layer can stand in front of all of them. */
export const ROUTES: readonly Route[] = [
  { method: "GET", path: "/api/board", handle: boardRoute },
  { method: "GET", path: "/api/health", handle: healthRoute },
  { method: "GET", path: "/api/issues/:id", handle: issueRoute },
  { method: "POST", path: "/api/issues/:id/status", handle: statusRoute },
  { method: "POST", path: "/api/issues/:id/priority", handle: priorityRoute },
  { method: "POST", path: "/api/issues/:id/rank", handle: rankRoute },
  // Phase 3's remaining views: Roadmap, Analytics and Sessions (server/views.ts).
  { method: "GET", path: "/api/roadmap", handle: roadmapRoute },
  { method: "GET", path: "/api/analytics", handle: analyticsRoute },
  { method: "GET", path: "/api/sessions", handle: sessionsRoute },
  // Phase W1's Sprint moves, owner picker, list reorder, Queue view and held-item detail
  // (edits.ts, queue-view.ts, held-detail.ts).
  { method: "POST", path: "/api/issues/:id/sprint", handle: sprintRoute },
  { method: "POST", path: "/api/issues/:id/owner", handle: ownerRoute },
  { method: "GET", path: "/api/handoff", handle: handoffRoute },
  { method: "POST", path: "/api/issues/:id/list-rank", handle: listRankRoute },
  { method: "GET", path: "/api/owners", handle: ownersRoute },
  { method: "GET", path: "/api/queue-view", handle: queueViewRoute },
  { method: "GET", path: "/api/held/item", handle: heldItemRoute },
  // The receiver API (receiver-api.ts), authorised by a receiving host's token.
  ...RECEIVER_ROUTES,
  // The Review queue and the composer's dispatches (dispatch.ts).
  ...DISPATCH_ROUTES,
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
