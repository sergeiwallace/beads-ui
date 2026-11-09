// The dispatch store (web app design D-14, T-W0.5, Data Model → Dispatch record): where a signed
// dispatch, its receipts and its tombstone live. The queue-backed and the local store keep the same
// entries and read them through the one fold below, so both answer every question the same way.

import {
  type DeliveryMachine,
  type DeliveryState,
  deliveryMachine,
  isFinalDelivery,
  reduceDelivery,
} from "./delivery-state.ts";

export const DISPATCH_KINDS = ["prompt", "answer", "unblock", "handoff-request"] as const;
export type DispatchKind = (typeof DISPATCH_KINDS)[number];

export interface DispatchTask {
  repo: string;
  id: string;
}

export interface DispatchTarget {
  session: string;
  host: string;
}

/** Envelope version 1: the Ed25519 signature over the record's signed fields (D-20). */
export interface DispatchEnvelope {
  version: 1;
  signing_key_id: string;
  /** base64url, unpadded, 64 bytes. */
  signature: string;
}

/** The fields the envelope signs, in the contract's names (Data Model → Envelope wire format). */
export interface SignedDispatchFields {
  /** A ULID, the idempotency key for every consumer. */
  id: string;
  task: DispatchTask;
  target: DispatchTarget;
  kind: DispatchKind;
  body_ref: string;
  /** `sha256:` and 64 lowercase hex characters of the exact body bytes. */
  body_digest: string;
  arm_goal: boolean;
  created_by: string;
  /** UTC RFC 3339 to the millisecond with a `Z` suffix. */
  created_at: string;
  expires_at: string;
  signing_key_id: string;
}

export interface DispatchRecord extends SignedDispatchFields {
  envelope: DispatchEnvelope;
}

/** The states a receiving session reports through the receiver API. */
export const RECEIPT_STATES = ["taken", "acted", "failed"] as const;
export type ReceiptState = (typeof RECEIPT_STATES)[number];

export interface ReceiptInput {
  state: ReceiptState;
  session: string;
  host: string;
  at: string;
  reason?: string;
}

/** Why a body was deleted: the dispatch was consumed (acted on or failed) or it expired. */
export type TombstoneCause = "acted" | "failed" | "expired";

/** One appended entry after a dispatch's record; the store's log holds nothing else about it. */
export type DispatchEntry =
  | ({ op: "receipt"; id: string } & ReceiptInput)
  | { op: "expired"; id: string; at: string }
  | { op: "tombstone"; id: string; at: string; cause: TombstoneCause };

export interface Tombstone {
  at: string;
  cause: TombstoneCause;
}

/** A dispatch as the store holds it: the record, its delivery state and its receipts. */
export interface StoredDispatch {
  record: DispatchRecord;
  state: DeliveryState;
  machine: DeliveryMachine;
  receipts: (ReceiptInput & { source: string })[];
  /** Present once the body is deleted; the record and its receipts stay. */
  tombstone?: Tombstone;
}

export type ReceiptRefusal = {
  ok: false;
  problem: "unknown-dispatch" | "wrong-target" | "rejected";
  detail: string;
};

export type ReceiptResult = { ok: true; dispatch: StoredDispatch } | ReceiptRefusal;

export interface CreateResult {
  /** False when a record with this id was already stored; the store keeps that one. */
  created: boolean;
  dispatch: StoredDispatch;
}

/**
 * Both implementations: `queue` writes to the work queue's prompt store where `queue.url` is set,
 * `local` to an append-only file otherwise (D-14). A write the store cannot make throws
 * `DispatchStoreError` and leaves no record, so nothing is reported as queued that is not stored.
 */
export interface DispatchStore {
  readonly kind: "queue" | "local";
  create(record: DispatchRecord, body: Uint8Array): Promise<CreateResult>;
  get(id: string): Promise<StoredDispatch | undefined>;
  /** The body bytes, or undefined once the dispatch is tombstoned or for an unknown id. */
  body(id: string): Promise<Uint8Array | undefined>;
  /** Every dispatch to `target` not yet acted on, failed or expired, oldest first. */
  outstanding(target: DispatchTarget): Promise<StoredDispatch[]>;
  receipt(id: string, receipt: ReceiptInput): Promise<ReceiptResult>;
  /** Expires every open dispatch whose `expires_at` is at or before `now`; returns their ids. */
  expire(now: string): Promise<string[]>;
  /** Drops the bytes of every tombstoned body and of any body no record holds. */
  compact(): Promise<void>;
  /** Copies what a backup may hold into `destination`, never a body; returns the files written. */
  backup(destination: string): Promise<string[]>;
}

/** A write the store could not make, with the reason the server shows. */
export class DispatchStoreError extends Error {
  override name = "DispatchStoreError";
}

/** The source a receipt's state is proved by, as the delivery machine records it. */
export const receiptSource = (receipt: ReceiptInput): string =>
  `receipt from ${receipt.session}@${receipt.host}`;

/** A record and its entries, in append order, as the stored dispatch every reader sees. */
export function foldDispatch(
  record: DispatchRecord,
  entries: readonly DispatchEntry[],
): StoredDispatch {
  let machine = deliveryMachine("queued", "dispatch record");
  const receipts: StoredDispatch["receipts"] = [];
  let tombstone: Tombstone | undefined;
  for (const entry of entries) {
    if (entry.id !== record.id) continue;
    if (entry.op === "receipt") {
      const { op: _op, id: _id, ...receipt } = entry;
      const source = receiptSource(receipt);
      const transition: { to: string; source: string; at: string; reason?: string } = {
        to: receipt.state,
        source,
        at: receipt.at,
      };
      if (receipt.reason !== undefined) transition.reason = receipt.reason;
      const next = reduceDelivery(machine, transition);
      if (next.history.length > machine.history.length) receipts.push({ ...receipt, source });
      machine = next;
    } else if (entry.op === "expired") {
      machine = reduceDelivery(machine, { to: "expired", source: "expiry", at: entry.at });
    } else {
      tombstone = { at: entry.at, cause: entry.cause };
    }
  }
  const stored: StoredDispatch = { record, state: machine.state, machine, receipts };
  if (tombstone !== undefined) stored.tombstone = tombstone;
  return stored;
}

/**
 * What appending `receipt` to a dispatch would do: the entries to append (the receipt, then a
 * tombstone when it ends the dispatch), or why it is refused. A receipt is recorded only for the
 * dispatch's own target (T-W0.3) and only as a move the delivery machine allows.
 */
export function planReceipt(
  record: DispatchRecord,
  entries: readonly DispatchEntry[],
  receipt: ReceiptInput,
): { ok: true; entries: DispatchEntry[] } | ReceiptRefusal {
  const { target } = record;
  if (receipt.session !== target.session || receipt.host !== target.host) {
    return {
      ok: false,
      problem: "wrong-target",
      detail: `dispatch ${record.id} is addressed to another session`,
    };
  }
  const before = foldDispatch(record, entries);
  const entry: DispatchEntry = { op: "receipt", id: record.id, ...receipt };
  const after = foldDispatch(record, [...entries, entry]);
  if (after.machine.rejected.length > before.machine.rejected.length) {
    const rejected = after.machine.rejected.at(-1);
    return { ok: false, problem: "rejected", detail: rejected?.problem ?? "rejected" };
  }
  const planned: DispatchEntry[] = [entry];
  if (isFinalDelivery(after.state)) {
    planned.push({
      op: "tombstone",
      id: record.id,
      at: receipt.at,
      cause: receipt.state === "acted" ? "acted" : "failed",
    });
  }
  return { ok: true, entries: planned };
}

/** The entries that expire a dispatch at `now`, or none when it is not due or is already final. */
export function planExpiry(
  record: DispatchRecord,
  entries: readonly DispatchEntry[],
  now: string,
): DispatchEntry[] {
  const { state } = foldDispatch(record, entries);
  if (isFinalDelivery(state) || record.expires_at > now) return [];
  return [
    { op: "expired", id: record.id, at: now },
    { op: "tombstone", id: record.id, at: now, cause: "expired" },
  ];
}

/** True while a dispatch still waits on its target: not final and its body not deleted. */
export const isOutstanding = (dispatch: StoredDispatch): boolean =>
  !isFinalDelivery(dispatch.state) && dispatch.tombstone === undefined;
