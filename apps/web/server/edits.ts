// Phase W1's quick edits (web app design T-W1.0): sprint membership, the owner picker's
// candidates and its write, and a backlog or sprint list's reorder. Every write is one guarded bd
// call on the issue's own store, so a value that changed since the page drew it writes nothing.

import {
  type Issue,
  keyBetween,
  parseSprintSelection,
  RANK_KEY,
  readRank,
  SPRINT_LABEL_PREFIX,
  sprintLabelsOf,
  sprintSelectionText,
} from "@beads-ui/core";
import { filterAllowed } from "./allowlist.ts";
import { QueueClient } from "./queue.ts";
import type { OpenStore } from "./registry.ts";
import {
  type ApiContext,
  type ApiReply,
  type ApiRequest,
  bdFailure,
  failure,
  guardedWrite,
  invalid,
  isObject,
  isReply,
  isStore,
  storeOf,
  text,
} from "./routes.ts";

/** The status a bd claim sets; an assigned task in it is held by a live claim. */
export const CLAIMED_STATUS = "in_progress";

const stale = (message: string): ApiReply => failure({ kind: "stale", source: "bd show", message });

/** `true` when the issue's sprint labels are what `from` (`backlog` or `sprint:<name>`) names. */
function isIn(issue: Issue, from: string): boolean {
  const names = sprintLabelsOf(issue);
  const selection = parseSprintSelection(from);
  return selection.kind === "backlog" ? names.length === 0 : names.includes(selection.name);
}

/**
 * Moves an issue between the backlog and a sprint (D-5 of the beads-ui design: a sprint's members
 * carry its `sprint:<name>` label). The issue's other sprint labels go, so it sits in one place.
 * Body: `to` and `from` (`backlog` or `sprint:<name>`) and `shown`, the drawn status; an issue
 * whose status or membership moved since is stale and nothing is written.
 */
export async function sprintRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const id = request.params.id ?? "";
  const to = text(request.body, "to");
  const from = text(request.body, "from");
  const shown = text(request.body, "shown");
  if (to === undefined || from === undefined || shown === undefined) {
    return invalid(
      "a sprint move needs `to` and `from` (backlog or sprint:<name>) and `shown`, the drawn status",
    );
  }
  const target = parseSprintSelection(to);
  if (to !== "backlog" && target.kind === "backlog") {
    return invalid(`\`to\` names backlog or sprint:<name>, not ${JSON.stringify(to)}`);
  }
  const store = await storeOf(request, context);
  if (!isStore(store)) return store;
  let read: Awaited<ReturnType<typeof store.bd.show>>;
  try {
    read = await store.bd.show(id);
  } catch (error) {
    if (error instanceof RangeError) return invalid(error.message);
    throw error;
  }
  if (read.kind !== "ok") return bdFailure("bd show", read);
  const issue = read.value;
  if (issue.status !== shown) return stale(`${id} is now ${issue.status}, not ${shown}`);
  if (!isIn(issue, from)) {
    return stale(`${id} moved out of ${from} elsewhere; nothing was written`);
  }
  const add = target.kind === "sprint" ? `${SPRINT_LABEL_PREFIX}${target.name}` : undefined;
  const remove = sprintLabelsOf(issue)
    .map((name) => `${SPRINT_LABEL_PREFIX}${name}`)
    .filter((label) => label !== add);
  const adding = add !== undefined && !issue.labels.includes(add) ? [add] : [];
  const sprint = sprintSelectionText(target);
  if (adding.length === 0 && remove.length === 0) {
    return { status: 200, body: { id, sprint, unchanged: true } };
  }
  // bd takes a status guard only beside a field update, and labels are not one, so the write also
  // sets the status the guard pins it to: it can never change the status.
  const result = await guardedWrite(() =>
    store.bd.update(
      id,
      { status: shown, addLabels: adding, removeLabels: remove },
      { ifStatus: shown },
    ),
  );
  if (isReply(result)) return result;
  if (result.kind !== "ok") return bdFailure("bd update", result);
  return { status: 200, body: { id, sprint } };
}

/** One session the owner picker offers. */
export interface OwnerCandidate {
  /** The assignee slug bd records: the session's name without its host. */
  name: string;
  /** The registry's state for it (`active`, `idle`), or undefined when read from the store. */
  state?: string;
  machine?: string;
}

export interface OwnerCandidates {
  candidates: OwnerCandidate[];
  /** Where the list came from: the work queue's session registry, or the store's assignees. */
  source: "the work queue" | "the store's assignees";
  /** `[handoff] receivers`, when it narrowed the list. */
  rule?: string[];
  /** The registry read that failed, when the list fell back to the store's assignees. */
  queueError?: { source: string; message: string };
}

/** A `[handoff] receivers` pattern: `*` matches any run of characters, nothing else is special. */
export function matchesPattern(name: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(name);
}

const allowedBy = (rule: readonly string[] | undefined) => (name: string) =>
  rule === undefined || rule.some((pattern) => matchesPattern(name, pattern));

const byName = (a: OwnerCandidate, b: OwnerCandidate) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/**
 * The sessions an owner change may name under the fleet's handoff rules: a session the work
 * queue's registry holds and has not marked gone, on a repository this host's allowlist permits,
 * and named by `[handoff] receivers` when the user's file sets it. Without a queue, or while it
 * cannot be read, the store's own assignees, narrowed by the same rule.
 */
export async function ownerCandidates(
  context: ApiContext,
  store: OpenStore,
): Promise<OwnerCandidates | ApiReply> {
  const config = await context.config();
  const rule = config.handoffReceivers;
  const allowed = allowedBy(rule);
  const ruled = rule === undefined ? {} : { rule };
  const fromStore = async (queueError?: { source: string; message: string }) => {
    const issues = await store.bd.board();
    if (issues.kind !== "ok") return bdFailure("bd list", issues);
    const names = new Set<string>();
    for (const issue of issues.value) {
      if (issue.assignee !== undefined && issue.assignee !== "") names.add(issue.assignee);
    }
    const listed: OwnerCandidates = {
      candidates: [...names]
        .filter(allowed)
        .map((name) => ({ name }))
        .sort(byName),
      source: "the store's assignees",
      ...ruled,
    };
    if (queueError !== undefined) listed.queueError = queueError;
    return listed;
  };
  if (config.queueUrl === undefined) return fromStore();
  const sessions = await new QueueClient(config.queueUrl).sessions();
  if (!sessions.ok) {
    return fromStore({ source: sessions.failure.source, message: sessions.failure.message });
  }
  const shown = filterAllowed(
    sessions.value,
    (session) => session.repo,
    await context.allowlist(),
    context.health,
    "the work queue sessions",
  );
  const seen = new Map<string, OwnerCandidate>();
  for (const session of shown) {
    if (session.state === "gone" || !allowed(session.name) || seen.has(session.name)) continue;
    seen.set(session.name, { name: session.name, state: session.state, machine: session.machine });
  }
  return { candidates: [...seen.values()].sort(byName), source: "the work queue", ...ruled };
}

/** `GET /api/owners?store=`: the owner picker's candidates for the store's issues. */
export async function ownersRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const store = await storeOf(request, context);
  if (!isStore(store)) return store;
  const listed = await ownerCandidates(context, store);
  if ("status" in listed) return listed;
  return { status: 200, body: { store: store.repository, ...listed } };
}

export interface HandoffRequest {
  store: OpenStore;
  id: string;
  /** The session holding the claim, as the page drew it. */
  holder: string;
  /** The receiver the user picked. */
  receiver: string;
}

/**
 * The owner change of a task a live session holds a claim on. The fleet's handoff is receiver
 * first (D-9): the holder is asked to hand the claim over, and the server never reassigns it
 * itself. Sending that request is T-W2.2's handoff dispatch, a later phase; until it lands, this
 * function is the one place that change plugs in, and it writes nothing and says why.
 */
export async function requestOwnerHandoff(request: HandoffRequest): Promise<ApiReply> {
  return failure({
    kind: "handoff-required",
    source: "owner change",
    message: `${request.holder} holds the claim on ${request.id}; moving it to ${request.receiver} needs a handoff request to ${request.holder}, which this server does not send yet, so nothing was written`,
  });
}

/**
 * The owner picker's write. Body: `to`, the picked session; `shown`, the assignee the page drew
 * (`""` for none); `status`, the drawn status. A task a live session has claimed (assigned and in
 * progress) goes to requestOwnerHandoff; any other takes a guarded assignee write, which bd
 * refuses (stale) when the assignee or status changed since the page drew them.
 */
export async function ownerRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const id = request.params.id ?? "";
  const to = text(request.body, "to");
  const shown = isObject(request.body) ? request.body.shown : undefined;
  const status = text(request.body, "status");
  if (to === undefined || typeof shown !== "string" || status === undefined) {
    return invalid(
      "an owner change needs `to`, the session picked, `shown`, the drawn assignee (empty for none), and `status`, the drawn status",
    );
  }
  if (to === shown) return invalid(`${to} already owns ${id}`);
  const store = await storeOf(request, context);
  if (!isStore(store)) return store;
  const listed = await ownerCandidates(context, store);
  if ("status" in listed) return listed;
  if (!listed.candidates.some((candidate) => candidate.name === to)) {
    const rule =
      listed.rule === undefined ? "" : ` and [handoff] receivers = ${JSON.stringify(listed.rule)}`;
    return invalid(
      `${to} is not a session the handoff rules allow (read from ${listed.source}${rule})`,
    );
  }
  if (shown !== "" && status === CLAIMED_STATUS) {
    return requestOwnerHandoff({ store, id, holder: shown, receiver: to });
  }
  const result = await guardedWrite(() =>
    store.bd.update(id, { assignee: to }, { ifStatus: status, ifAssignee: shown }),
  );
  if (isReply(result)) return result;
  if (result.kind !== "ok") return bdFailure("bd update", result);
  return { status: 200, body: { id, assignee: to } };
}

type Neighbour = { key: string | undefined } | ApiReply;

/** A list neighbour's key, read again from its store: it must still be ranked and at `priority`. */
async function listNeighbour(
  store: OpenStore,
  id: string | undefined,
  priority: number,
): Promise<Neighbour> {
  if (id === undefined) return { key: undefined };
  const read = await store.bd.show(id);
  if (read.kind === "notFound") return stale(`${id} is no longer in the store`);
  if (read.kind !== "ok") return bdFailure("bd show", read);
  if (read.value.priority !== priority) {
    return stale(`${id} is now P${read.value.priority}, not P${priority}`);
  }
  const rank = readRank(read.value);
  if (rank.kind === "malformed") {
    return failure({
      kind: "malformed-rank",
      source: `metadata.${RANK_KEY} of ${id}`,
      message: rank.message,
    });
  }
  if (rank.kind === "unranked") return stale(`${id} has no rank any more`);
  return { key: rank.key };
}

/**
 * A backlog or sprint list's reorder (T-W1.0, D-21): the list orders by priority, then rank, so a
 * row moves among the ranked rows of its own priority, and its key is written between its
 * neighbours' as they stand when the write runs. Body: `shown`, the drawn status; `priority`, the
 * drawn priority; `above` and `below`, the neighbours' ids, with `aboveStore` and `belowStore` for
 * a neighbour in another store.
 */
export async function listRankRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const id = request.params.id ?? "";
  const shown = text(request.body, "shown");
  const priority = isObject(request.body) ? request.body.priority : undefined;
  const above = text(request.body, "above");
  const below = text(request.body, "below");
  if (shown === undefined || typeof priority !== "number") {
    return invalid("a list reorder needs `shown`, the drawn status, and `priority`, the drawn one");
  }
  if (above === id || below === id) return invalid("a row cannot be its own neighbour");
  const config = await context.config();
  if (!config.rank) {
    const where = config.source === undefined ? "" : ` in ${config.source}`;
    return failure({
      kind: "rank-off",
      source: "views.rank",
      message: `views.rank is off${where}, so rows keep their sorted order`,
    });
  }
  const store = await storeOf(request, context);
  if (!isStore(store)) return store;
  const storeFor = async (key: string) => {
    const named = text(request.body, key);
    return named === undefined ? store : storeOf(request, context, named);
  };
  const aboveStore = await storeFor("aboveStore");
  if (!isStore(aboveStore)) return aboveStore;
  const belowStore = await storeFor("belowStore");
  if (!isStore(belowStore)) return belowStore;
  try {
    const own = await store.bd.show(id);
    if (own.kind !== "ok") return bdFailure("bd show", own);
    if (own.value.priority !== priority) {
      return stale(`${id} is now P${own.value.priority}, not P${priority}`);
    }
    const low = await listNeighbour(aboveStore, above, priority);
    if ("status" in low) return low;
    const high = await listNeighbour(belowStore, below, priority);
    if ("status" in high) return high;
    const key = keyBetween(low.key, high.key, context.random);
    if (!key.ok) {
      return key.error.kind === "out-of-order"
        ? stale(key.error.message)
        : failure({
            kind: "malformed-rank",
            source: `metadata.${RANK_KEY}`,
            message: key.error.message,
          });
    }
    // Each neighbour is read again just before the write: one reordered meanwhile is stale.
    for (const [neighbourStore, neighbour, before] of [
      [aboveStore, above, low.key],
      [belowStore, below, high.key],
    ] as const) {
      if (neighbour === undefined) continue;
      const now = await listNeighbour(neighbourStore, neighbour, priority);
      if ("status" in now) return now;
      if (now.key !== before) {
        return stale(
          `${neighbour} was reordered elsewhere while this reorder was written; nothing was written`,
        );
      }
    }
    const result = await guardedWrite(() =>
      store.bd.update(id, { metadata: { [RANK_KEY]: key.value } }, { ifStatus: shown }),
    );
    if (isReply(result)) return result;
    if (result.kind !== "ok") return bdFailure("bd update", result);
    return { status: 200, body: { id, rank: key.value } };
  } catch (error) {
    if (error instanceof RangeError) return invalid(error.message);
    throw error;
  }
}
