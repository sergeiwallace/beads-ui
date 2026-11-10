// The receiver API, version 1 (web app design § Receiver API, T-W0.3, T-W0.2): the three routes a
// receiving host's notifier calls with that host's receiver token. The authentication layer has
// already resolved the token to its host; each route answers only for a dispatch whose target is
// that host and the named session. Every refusal is the same empty 404, so a caller learns
// nothing about whether a dispatch exists; a store that cannot be reached is an empty 503, which
// the receiving client retries rather than reading as a refusal.

import {
  DispatchStoreError,
  isHeld,
  isOutstanding,
  RECEIPT_STATES,
  type ReceiptInput,
  type ReceiptState,
  type StoredDispatch,
} from "@beads-ui/core";
import { isAllowed } from "./allowlist.ts";
import type { ApiContext, ApiReply, ApiRequest, Route } from "./routes.ts";

export const RECEIVER_PREFIX = "/api/receiver/v1";

/**
 * A handoff request's progress steps (T-W2.2), each posted by the holder: `sent` once it has
 * reassigned its claim and published the store, `taken` when it relays the receiver's reply, and
 * `verified` when its verify step ran, with that step's exit status.
 */
export const HANDOFF_STEPS = ["sent", "taken", "verified"] as const;

/** A progress note's text: `sent`, `taken: <reason>`, `verified exit 0: <reason>`. */
export const progressText = (step: string, exitCode: number | undefined, reason: unknown) => {
  const head = exitCode === undefined ? step : `${step} exit ${exitCode}`;
  return typeof reason === "string" && reason !== "" ? `${head}: ${reason}` : head;
};

/** The longest failure reason a receipt may carry. */
export const MAX_REASON_LENGTH = 2_000;

const REFUSED: ApiReply = { status: 404, body: "" };
const UNAVAILABLE: ApiReply = { status: 503, body: "" };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSession = (value: unknown): value is string => typeof value === "string" && value !== "";

const addressedTo = (dispatch: StoredDispatch, host: string, session: string): boolean =>
  dispatch.record.target.host === host && dispatch.record.target.session === session;

/** Runs a route for a receiving host; a store outage is an empty 503, never a refusal. */
function receiverRoute(
  handle: (host: string, request: ApiRequest, context: ApiContext) => Promise<ApiReply>,
): Route["handle"] {
  return async (request, context) => {
    if (request.caller.kind !== "receiver") return REFUSED;
    try {
      await context.dispatches.expireDue();
      return await handle(request.caller.host, request, context);
    } catch (error) {
      if (error instanceof DispatchStoreError) return UNAVAILABLE;
      throw error;
    }
  };
}

/** The outstanding records, without bodies, addressed to the token's host and the named session. */
const listDispatches = receiverRoute(async (host, { query }, context) => {
  const session = query.get("session");
  if (!isSession(session)) return REFUSED;
  const outstanding = await context.dispatches.store.outstanding({ host, session });
  const allowlist = await context.allowlist(host);
  const dispatches = outstanding
    .filter((dispatch) => !isHeld(dispatch) && isAllowed(allowlist, dispatch.record.task.repo))
    .map((dispatch) => dispatch.record);
  return { status: 200, body: { dispatches } };
});

/**
 * The body's exact bytes, only for the dispatch's own target while it is outstanding, and only
 * when its task's repository is on the requesting host's allowlist (T-W0.2).
 */
const dispatchBody = receiverRoute(async (host, { params, query }, context) => {
  const session = query.get("session");
  const dispatch = await context.dispatches.store.get(params.id ?? "");
  if (!isSession(session) || dispatch === undefined) return REFUSED;
  if (!addressedTo(dispatch, host, session) || !isOutstanding(dispatch) || isHeld(dispatch)) {
    return REFUSED;
  }
  if (!isAllowed(await context.allowlist(host), dispatch.record.task.repo)) return REFUSED;
  const body = await context.dispatches.store.body(dispatch.record.id);
  return body === undefined ? REFUSED : { status: 200, body };
});

const isReceiptState = (value: unknown): value is ReceiptState =>
  typeof value === "string" && (RECEIPT_STATES as readonly string[]).includes(value);

/**
 * Records a receipt from the dispatch's own target, as a move its delivery state allows; acted or
 * failed ends the dispatch, which deletes its body and appends its tombstone.
 */
const postReceipt = receiverRoute(async (host, { params, body }, context) => {
  if (!isObject(body)) return REFUSED;
  const { session, state, reason } = body;
  if (!isSession(session) || !isReceiptState(state)) return REFUSED;
  if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)) {
    return REFUSED;
  }
  const receipt: ReceiptInput = { state, session, host, at: context.now() };
  if (reason !== undefined && reason !== "") receipt.reason = reason;
  const result = await context.dispatches.store.receipt(params.id ?? "", receipt);
  return result.ok ? { status: 204, body: null } : REFUSED;
});

/**
 * The notifier showed the dispatch's header to its own target (T-W2.1): the dispatch is shown,
 * with this receipt as its source, and the ladder tries no further local rung.
 */
const postShown = receiverRoute(async (host, { params, body }, context) => {
  if (!isObject(body) || !isSession(body.session)) return REFUSED;
  return (await context.ladder.shown(params.id ?? "", { host, session: body.session }))
    ? { status: 204, body: null }
    : REFUSED;
});

/**
 * A handoff request's progress from its own target, the holder, while it is outstanding (T-W2.2):
 * `{"session", "step": "sent" | "taken" | "verified", "reason"?, "exit_code"?}`. `reason` carries
 * the evidence (the publication, the reply); `exit_code`, the verify step's exit status, is
 * required on `verified` and refused on any other step. Recorded as a note on the dispatch.
 */
const postProgress = receiverRoute(async (host, { params, body }, context) => {
  if (!isObject(body) || !isSession(body.session)) return REFUSED;
  const { session, step, reason } = body;
  const exitCode = body.exit_code;
  if (typeof step !== "string" || !(HANDOFF_STEPS as readonly string[]).includes(step)) {
    return REFUSED;
  }
  if (reason !== undefined && (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH)) {
    return REFUSED;
  }
  if (step === "verified") {
    if (typeof exitCode !== "number" || !Number.isInteger(exitCode) || exitCode < 0) return REFUSED;
  } else if (exitCode !== undefined) {
    return REFUSED;
  }
  const dispatch = await context.dispatches.store.get(params.id ?? "");
  if (dispatch === undefined || dispatch.record.kind !== "handoff-request") return REFUSED;
  if (!addressedTo(dispatch, host, session) || !isOutstanding(dispatch)) return REFUSED;
  const noted = await context.dispatches.store.annotate(dispatch.record.id, {
    op: "note",
    id: dispatch.record.id,
    at: context.now(),
    source: `progress receipt from ${session}@${host}`,
    text: progressText(step, step === "verified" ? (exitCode as number) : undefined, reason),
  });
  return noted.ok ? { status: 204, body: null } : REFUSED;
});

/** A session's goal state (D-10): active, none, or paused with the window it recorded. */
const postGoal = receiverRoute(async (host, { body }, context) => {
  if (!isObject(body) || !isSession(body.session)) return REFUSED;
  const problem = await context.ladder.reportGoal({ host, session: body.session }, body);
  return problem === undefined ? { status: 204, body: null } : REFUSED;
});

/** The receiver routes, in their own block of the route table. */
export const RECEIVER_ROUTES: readonly Route[] = [
  { method: "POST", path: `${RECEIVER_PREFIX}/sessions/goal`, handle: postGoal },
  { method: "GET", path: `${RECEIVER_PREFIX}/dispatches`, handle: listDispatches },
  { method: "GET", path: `${RECEIVER_PREFIX}/dispatches/:id/body`, handle: dispatchBody },
  { method: "POST", path: `${RECEIVER_PREFIX}/dispatches/:id/receipts`, handle: postReceipt },
  { method: "POST", path: `${RECEIVER_PREFIX}/dispatches/:id/shown`, handle: postShown },
  { method: "POST", path: `${RECEIVER_PREFIX}/dispatches/:id/progress`, handle: postProgress },
];
