// The dispatch ladder's policy (web app design D-6, D-7, D-10, § Configuration, T-W2.1, T-W2.3):
// what `[dispatch]`, `[dispatch.carriers]` and `[dispatch.local]` say, what the target host's
// wake policy says, and from both the plan one delivery follows. Also the hourly rate cap, the
// goal-pause hold and the pointer a carrier sends, which names dispatches and never their bodies.
// Pure: the server reads the files and runs the carriers.

import { parseToml, type TomlTable, type TomlValue } from "./config.ts";

/** Cross-host carriers, in the fleet's ladder order (D-7). */
export const CARRIERS = ["agent-mail", "buzz", "git-inbox"] as const;
export type CarrierName = (typeof CARRIERS)[number];

/**
 * Delivery on the target host (D-6): the notifier lands what a carrier brought, then the
 * prompt-injection pointer, then the mod's submit, then the turn-end pull, which is the floor.
 */
export const LOCAL_RUNGS = ["notifier", "prompt-injection", "mod-submit", "turn-end"] as const;
export type LocalRungName = (typeof LOCAL_RUNGS)[number];
/** The local rungs that type into a session; never used while automatic wakes are off. */
export type ActiveRungName = "prompt-injection" | "mod-submit";

/** Every rung a dispatch's ladder record can name. */
export type RungName = CarrierName | ActiveRungName | "turn-end";

export interface DispatchPolicy {
  /** Dispatches to one session written within this many seconds go as one event. */
  coalesceWindowS: number;
  /** Past this many dispatches to one session in an hour, further ones are held. */
  maxPerSessionPerHour: number;
  /** With no shown receipt by then, the ladder tries its next local rung. */
  shownWithinS: number;
  carriers: CarrierName[];
  local: LocalRungName[];
}

export const DEFAULT_DISPATCH_POLICY: Readonly<DispatchPolicy> = Object.freeze({
  coalesceWindowS: 20,
  maxPerSessionPerHour: 30,
  shownWithinS: 60,
  carriers: [...CARRIERS],
  local: [...LOCAL_RUNGS],
});

export type PolicyRead = { ok: true; policy: DispatchPolicy } | { ok: false; reason: string };

const isTable = (value: TomlValue | undefined): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);

class Unreadable extends Error {}

function count(table: TomlTable, key: string, fallback: number, least: number): number {
  const value = table[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < least) {
    throw new Unreadable(`dispatch.${key} must be a whole number of at least ${least}`);
  }
  return value;
}

function order<T extends string>(
  table: TomlTable | undefined,
  name: string,
  known: readonly T[],
  fallback: readonly T[],
): T[] {
  const value = table?.order;
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.length === 0) {
    throw new Unreadable(`${name}.order must be a list of ${known.join(", ")}`);
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (!(known as readonly string[]).includes(entry)) {
      throw new Unreadable(
        `${name}.order names ${JSON.stringify(entry)}, not one of ${known.join(", ")}`,
      );
    }
    if (seen.has(entry)) throw new Unreadable(`${name}.order names ${entry} twice`);
    seen.add(entry);
  }
  return value as T[];
}

/**
 * The policy `beads-ui.toml` sets, its defaults where it is silent. Unreadable, with the reason
 * shown beside the dispatch, when the file does not parse or a setting is not one the ladder can
 * follow; the ladder then delivers at the next turn end only (T-W2.1). `turn-end` cannot be left
 * out of `[dispatch.local] order`, and git-inbox carries a pointer or nothing (D-7).
 */
export function resolveDispatchPolicy(text: string | undefined): PolicyRead {
  if (text === undefined) return { ok: true, policy: { ...DEFAULT_DISPATCH_POLICY } };
  const parsed = parseToml(text);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: `beads-ui.toml line ${parsed.error.line}: ${parsed.error.message}`,
    };
  }
  const dispatch = parsed.value.dispatch;
  if (dispatch === undefined) return { ok: true, policy: { ...DEFAULT_DISPATCH_POLICY } };
  try {
    if (!isTable(dispatch)) throw new Unreadable("dispatch must be a table");
    const carriers = dispatch.carriers;
    const local = dispatch.local;
    if (carriers !== undefined && !isTable(carriers)) {
      throw new Unreadable("dispatch.carriers must be a table");
    }
    if (local !== undefined && !isTable(local))
      throw new Unreadable("dispatch.local must be a table");
    const payload = carriers?.git_inbox_payload;
    if (payload !== undefined && payload !== "pointer") {
      throw new Unreadable('dispatch.carriers.git_inbox_payload can only be "pointer"');
    }
    const policy: DispatchPolicy = {
      coalesceWindowS: count(
        dispatch,
        "coalesce_window_s",
        DEFAULT_DISPATCH_POLICY.coalesceWindowS,
        0,
      ),
      maxPerSessionPerHour: count(
        dispatch,
        "max_per_session_per_hour",
        DEFAULT_DISPATCH_POLICY.maxPerSessionPerHour,
        1,
      ),
      shownWithinS: count(dispatch, "shown_within_s", DEFAULT_DISPATCH_POLICY.shownWithinS, 1),
      carriers: order(carriers, "dispatch.carriers", CARRIERS, DEFAULT_DISPATCH_POLICY.carriers),
      local: order(local, "dispatch.local", LOCAL_RUNGS, DEFAULT_DISPATCH_POLICY.local),
    };
    if (!policy.local.includes("turn-end")) {
      throw new Unreadable("dispatch.local.order must keep turn-end, the floor every dispatch has");
    }
    return { ok: true, policy };
  } catch (error) {
    if (error instanceof Unreadable) return { ok: false, reason: error.message };
    throw error;
  }
}

/** The target host's event-driven wake policy, its call-time kill switch. */
export type WakePolicy =
  | { state: "on" }
  | { state: "off" }
  | { state: "unreadable"; reason: string };

/**
 * The wake policy file's text (the idle wake's `idle-wake.json`): a JSON object whose
 * `automatic_wakes` is a boolean, at schema 1. Anything else is unreadable, never a guess.
 */
export function parseWakePolicy(text: string): WakePolicy {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { state: "unreadable", reason: "the wake policy is not JSON" };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { state: "unreadable", reason: "the wake policy is not a JSON object" };
  }
  const { automatic_wakes: wakes, schema } = json as Record<string, unknown>;
  if (typeof wakes !== "boolean") {
    return {
      state: "unreadable",
      reason: "the wake policy's automatic_wakes is not true or false",
    };
  }
  if (schema !== undefined && schema !== 1) {
    return {
      state: "unreadable",
      reason: `the wake policy is schema ${JSON.stringify(schema)}, not 1`,
    };
  }
  return { state: wakes ? "on" : "off" };
}

/** What the composer shows while automatic wakes are off (T-W2.1). */
export const WAKES_OFF = "automatic wakes off";

export type DeliveryPlan =
  /** Carriers, then the active rungs if nothing is shown in time, then the turn-end floor. */
  | { mode: "active"; carriers: CarrierName[]; local: ActiveRungName[] }
  /** Carriers only: the notifier's passive header lands it at the next tool call or turn end. */
  | { mode: "passive"; carriers: CarrierName[]; waiting: typeof WAKES_OFF }
  /** Nothing sent: the session picks the dispatch up at its next turn end. */
  | { mode: "turn-end"; reason: string };

/** The plan for one delivery, from the policy and the target host's wake policy, both read now. */
export function planDelivery(policy: PolicyRead, wake: WakePolicy): DeliveryPlan {
  if (!policy.ok) {
    return { mode: "turn-end", reason: `the dispatch policy is unreadable: ${policy.reason}` };
  }
  if (wake.state === "unreadable") {
    return {
      mode: "turn-end",
      reason: `the target host's wake policy is unreadable: ${wake.reason}`,
    };
  }
  const carriers = policy.policy.local.includes("notifier") ? [...policy.policy.carriers] : [];
  if (wake.state === "off") return { mode: "passive", carriers, waiting: WAKES_OFF };
  const local = policy.policy.local.filter(
    (rung): rung is ActiveRungName => rung === "prompt-injection" || rung === "mod-submit",
  );
  return { mode: "active", carriers, local };
}

export const HOUR_MS = 3_600_000;

export type RateCheck =
  | { held: false; count: number }
  | { held: true; count: number; releaseAt: number; reason: string };

/**
 * Whether one more dispatch to a session goes now: `sentAt` are the times dispatches to it were
 * sent, and at `max` in the trailing hour the next is held until the oldest of them leaves it.
 */
export function rateCheck(sentAt: readonly number[], nowMs: number, max: number): RateCheck {
  const inWindow = sentAt.filter((at) => at > nowMs - HOUR_MS && at <= nowMs).sort((a, b) => a - b);
  if (inWindow.length < max) return { held: false, count: inWindow.length };
  const oldest = inWindow[inWindow.length - max] ?? nowMs;
  return {
    held: true,
    count: inWindow.length,
    releaseAt: oldest + HOUR_MS,
    reason: `held: ${inWindow.length} dispatches to this session in the last hour reached max_per_session_per_hour = ${max}`,
  };
}

/** A receiving session's goal, as it reports it through the receiver API (D-10). */
export type GoalReport =
  | { state: "active" | "none"; at: string }
  | { state: "paused"; at: string; until?: string; reason?: string };

export const GOAL_PAUSED = "goal paused";

/** A goal report from a receiver's JSON body, or why it is not one. */
export function parseGoalReport(body: unknown, at: string): GoalReport | string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return "not an object";
  const { state, until, reason } = body as Record<string, unknown>;
  if (state === "active" || state === "none") return { state, at };
  if (state !== "paused") return 'state must be "active", "none" or "paused"';
  const report: GoalReport = { state, at };
  if (until !== undefined) {
    if (
      typeof until !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(until)
    ) {
      return "until must be a UTC RFC 3339 time";
    }
    report.until = until;
  }
  if (typeof reason === "string" && reason !== "") report.reason = reason.slice(0, 200);
  return report;
}

/** Whether a dispatch to a session waits on its goal now: paused, and the pause not yet over. */
export function goalHold(
  report: GoalReport | undefined,
  now: string,
): { held: false } | { held: true; reason: typeof GOAL_PAUSED; until?: string } {
  if (report?.state !== "paused") return { held: false };
  if (report.until !== undefined && Date.parse(report.until) <= Date.parse(now))
    return { held: false };
  return report.until === undefined
    ? { held: true, reason: GOAL_PAUSED }
    : { held: true, reason: GOAL_PAUSED, until: report.until };
}

/** What a carrier, the injected line and the mod's submit say: dispatch ids and digests only. */
export interface DispatchPointer {
  subject: string;
  /** One `beads-ui dispatch <id> <body_digest>` line per dispatch. */
  text: string;
}

export function dispatchPointer(
  dispatches: readonly { id: string; body_digest: string }[],
): DispatchPointer {
  const ids = dispatches.map((dispatch) => dispatch.id);
  return {
    subject:
      ids.length === 1 ? `beads-ui dispatch ${ids[0]}` : `beads-ui dispatches ${ids.join(", ")}`,
    text: dispatches
      .map((dispatch) => `beads-ui dispatch ${dispatch.id} ${dispatch.body_digest}`)
      .join("\n"),
  };
}

/** One rung's attempt on a dispatch, as its ladder record holds it. */
export interface RungAttempt {
  rung: RungName;
  outcome: "sent" | "failed" | "skipped";
  detail: string;
  at: string;
  /** Every dispatch id that went out in the same carried event, this one included. */
  event?: string[];
}

/** The delivery indicator's line for a dispatch's rungs: which delivered, or which failed and why. */
export function rungSummary(rungs: readonly RungAttempt[]): string | undefined {
  if (rungs.length === 0) return undefined;
  const failed = rungs
    .filter((rung) => rung.outcome !== "sent")
    .map((rung) => `${rung.rung} ${rung.outcome} (${rung.detail})`);
  const sent = rungs.filter((rung) => rung.outcome === "sent").map((rung) => rung.rung);
  const delivered = sent.filter((rung) => rung !== "turn-end");
  const parts: string[] = [];
  if (delivered.length > 0) parts.push(`delivered by ${delivered.join(", then ")}`);
  if (sent.includes("turn-end")) parts.push("left for turn-end pickup");
  if (failed.length > 0) parts.push(failed.join("; "));
  return parts.join("; ");
}
