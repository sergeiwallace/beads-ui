// The composer's delivery state (web app design D-5, T-W1.3, Data Model → Dispatch record): one
// dispatch's state over the dispatch record's states, each move carrying the record that proves
// it. A move its state does not allow keeps the state and is recorded as rejected, never thrown.

export const DELIVERY_STATES = [
  "queued",
  "waiting",
  "shown",
  "taken",
  "acted",
  "failed",
  "expired",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

/**
 * Where each state may go. A dispatch waits (automatic wakes off, a paused goal) only before it is
 * delivered; a turn-end pickup takes it with no shown receipt; once taken it can only be acted on
 * or fail. `acted`, `failed` and `expired` are final.
 */
export const DELIVERY_TRANSITIONS: Readonly<Record<DeliveryState, readonly DeliveryState[]>> = {
  queued: ["waiting", "shown", "taken", "failed", "expired"],
  waiting: ["queued", "shown", "taken", "failed", "expired"],
  shown: ["taken", "failed", "expired"],
  taken: ["acted", "failed"],
  acted: [],
  failed: [],
  expired: [],
};

export const isDeliveryState = (value: unknown): value is DeliveryState =>
  typeof value === "string" && (DELIVERY_STATES as readonly string[]).includes(value);

export interface DeliveryTransition {
  to: DeliveryState;
  /** The record that proves the move: a queue receipt, a mail shown receipt, a bd comment. */
  source: string;
  at?: string;
  /** Why: a failure's reason, or what a dispatch waits on ("automatic wakes off"). */
  reason?: string;
}

export interface AppliedTransition extends DeliveryTransition {
  from: DeliveryState;
}

export interface RejectedTransition {
  from: DeliveryState;
  /** What was asked, as given; it need not be a state at all. */
  to: string;
  source: string;
  at?: string;
  problem: string;
}

export interface DeliveryMachine {
  state: DeliveryState;
  /** The record behind the current state. */
  source: string;
  reason?: string;
  history: AppliedTransition[];
  rejected: RejectedTransition[];
}

/** A dispatch's machine, at `queued` for a new one or at the state its stored record holds. */
export function deliveryMachine(
  state: DeliveryState = "queued",
  source = "dispatch record",
): DeliveryMachine {
  return { state, source, history: [], rejected: [] };
}

export const allowsTransition = (from: DeliveryState, to: DeliveryState): boolean =>
  DELIVERY_TRANSITIONS[from].includes(to);

export const isFinalDelivery = (state: DeliveryState): boolean =>
  DELIVERY_TRANSITIONS[state].length === 0;

/** `machine` after `transition`, or unchanged in state with the refusal appended to `rejected`. */
export function reduceDelivery(
  machine: DeliveryMachine,
  transition: { to: string; source: string; at?: string; reason?: string },
): DeliveryMachine {
  const from = machine.state;
  const { to } = transition;
  if (!isDeliveryState(to) || !allowsTransition(from, to)) {
    const problem = !isDeliveryState(to)
      ? `${to} is not a delivery state`
      : isFinalDelivery(from)
        ? `${from} is final`
        : `${from} cannot become ${to}; it can become ${DELIVERY_TRANSITIONS[from].join(", ")}`;
    const rejected: RejectedTransition = { from, to, source: transition.source, problem };
    if (transition.at !== undefined) rejected.at = transition.at;
    return { ...machine, rejected: [...machine.rejected, rejected] };
  }
  const applied: AppliedTransition = { from, to, source: transition.source };
  if (transition.at !== undefined) applied.at = transition.at;
  if (transition.reason !== undefined) applied.reason = transition.reason;
  const next: DeliveryMachine = {
    state: to,
    source: transition.source,
    history: [...machine.history, applied],
    rejected: machine.rejected,
  };
  if (transition.reason !== undefined) next.reason = transition.reason;
  return next;
}

const LABELS: Readonly<Record<DeliveryState, string>> = {
  queued: "queued",
  waiting: "waiting",
  shown: "shown",
  taken: "taken",
  acted: "acted on",
  failed: "failed",
  expired: "expired",
};

/** The delivery indicator's text: `acted on`, `waiting: automatic wakes off`, `failed: <why>`. */
export function deliveryLabel(machine: DeliveryMachine): string {
  const label = LABELS[machine.state];
  const withReason = machine.state === "waiting" || machine.state === "failed";
  return withReason && machine.reason !== undefined && machine.reason !== ""
    ? `${label}: ${machine.reason}`
    : label;
}
