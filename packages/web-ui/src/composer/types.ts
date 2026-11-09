import type { DeliveryState } from "@beads-ui/core";

// What the server's dispatch routes answer (apps/web/server/dispatch.ts), as the composer and the
// Review view draw it. Each indicator names the record its text comes from (web app design D-5).

export interface DispatchTargetView {
  session: string;
  host: string;
}

/** A dispatch just written: its id, whom it is for, and the state the store recorded. */
export interface DispatchSummary {
  id: string;
  kind: string;
  target: DispatchTargetView;
  state: DeliveryState;
  /** Why the bd comment that mirrors the dispatch on its task was not written, when it was not. */
  mirrorError?: string;
}

export type IndicatorTone = "ok" | "busy" | "warn" | "error" | "idle";

/** One of the three indicators: what it says, and the record that says it. */
export interface Indicator {
  text: string;
  source: string;
  tone: IndicatorTone;
}

export interface FollowUpView {
  state: "pending" | "sent" | "dropped";
  /** The follow-up prompt's dispatch, once sent. */
  prompt?: string;
  reason?: string;
}

/** A dispatch's state as the status route reads it now. */
export interface DispatchStatus {
  id: string;
  kind: string;
  target: DispatchTargetView;
  state: DeliveryState;
  /** True once the state cannot change again: acted, failed or expired. */
  final: boolean;
  liveness: Indicator;
  delivery: Indicator;
  response: Indicator;
  /** An unblock's next-step prompt, delivered to the same session once the unblock is acted on. */
  followUp?: FollowUpView;
}
