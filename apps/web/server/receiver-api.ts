// The receiver API, version 1 (web app design § Receiver API, T-W0.3, T-W0.2): the three routes a
// receiving host's notifier calls with that host's receiver token. The authentication layer has
// already resolved the token to its host; each route answers only for a dispatch whose target is
// that host and the named session. Every refusal is the same empty 404, so a caller learns
// nothing about whether a dispatch exists; a store that cannot be reached is an empty 503, which
// the receiving client retries rather than reading as a refusal.

import {
  DispatchStoreError,
  isOutstanding,
  RECEIPT_STATES,
  type ReceiptInput,
  type ReceiptState,
  type StoredDispatch,
} from "@beads-ui/core";
import { isAllowed } from "./allowlist.ts";
import type { ApiContext, ApiReply, ApiRequest, Route } from "./routes.ts";

export const RECEIVER_PREFIX = "/api/receiver/v1";

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
    .filter((dispatch) => isAllowed(allowlist, dispatch.record.task.repo))
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
  if (!addressedTo(dispatch, host, session) || !isOutstanding(dispatch)) return REFUSED;
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

/** The receiver routes, in their own block of the route table. */
export const RECEIVER_ROUTES: readonly Route[] = [
  { method: "GET", path: `${RECEIVER_PREFIX}/dispatches`, handle: listDispatches },
  { method: "GET", path: `${RECEIVER_PREFIX}/dispatches/:id/body`, handle: dispatchBody },
  { method: "POST", path: `${RECEIVER_PREFIX}/dispatches/:id/receipts`, handle: postReceipt },
];
