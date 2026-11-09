// Analytics (T-3.3, R-9): throughput, cycle time with a rolling average, cumulative flow, a
// count-based sprint burndown and aging work in progress, each read from the store's events
// audit table (`bd history --events`, D-16). Pure: the surface supplies the issues, their events
// and the time; the web app draws the charts.

import type { HistoryEvent, Issue, Status, StatusCategory } from "./model.ts";
import { STATUS_CATEGORIES } from "./model.ts";
import type { SprintInfo } from "./sprint-view.ts";
import { sprintLabelsOf } from "./sprint-view.ts";
import { statusCategory } from "./views/timeline.ts";

export const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** How many weeks Analytics looks back unless asked otherwise. */
export const ANALYTICS_DEFAULT_WEEKS = 12;
/** The most weeks one read may cover. */
export const ANALYTICS_MAX_WEEKS = 52;
/** How many closed issues the cycle-time rolling average takes, the newest one included. */
export const ROLLING_WINDOW = 5;

/** One move of an issue into a status, at a time in milliseconds. */
export interface StatusChange {
  at: number;
  status: string;
}

const time = (stamp: string | undefined): number | undefined => {
  if (stamp === undefined) return undefined;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? undefined : ms;
};

function statusOfJson(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) return undefined;
    const status = (value as Record<string, unknown>).status;
    return typeof status === "string" && status !== "" ? status : undefined;
  } catch {
    return undefined;
  }
}

/** Within one second, `created` comes first; bd orders nothing else inside a second. */
const tieRank = (event: HistoryEvent): number => (event.type === "created" ? 0 : 1);

/**
 * The statuses `issue` moved through, oldest first, from its events: `created` opens it,
 * `status_changed` names the status it moved to, `closed` and `reopened` close and reopen it.
 * bd lists events newest first by a one-second stamp, so the list is read back to front, and
 * events inside one second can come in either order: `created` goes first among them, and the
 * list always ends on the issue's own status, which is the one fact no ordering can get wrong.
 * With no event that moves it, the issue's `created_at`, `started_at` and `closed_at` stand in.
 */
export function statusChanges(issue: Issue, events: readonly HistoryEvent[]): StatusChange[] {
  const ordered = events
    .map((event, index) => ({ event, index, at: time(event.createdAt) }))
    .filter(
      (entry): entry is { event: HistoryEvent; index: number; at: number } =>
        entry.at !== undefined,
    )
    .sort((a, b) => a.at - b.at || tieRank(a.event) - tieRank(b.event) || b.index - a.index);
  const changes: StatusChange[] = [];
  const firstMove = ordered.find((entry) => entry.event.type === "status_changed");
  const initial = statusOfJson(firstMove?.event.oldValue) ?? "open";
  for (const { event, at } of ordered) {
    // bd import keeps created_at but stamps the created event at import time.
    if (event.type === "created") {
      changes.push({ at: Math.min(at, time(issue.createdAt) ?? at), status: initial });
    } else if (event.type === "status_changed") {
      const status = statusOfJson(event.newValue);
      if (status !== undefined) changes.push({ at, status });
    } else if (event.type === "closed") changes.push({ at, status: "closed" });
    else if (event.type === "reopened") changes.push({ at, status: "open" });
  }
  const last = changes[changes.length - 1];
  if (last !== undefined) {
    if (last.status !== issue.status) {
      const settled = time(issue.closedAt) ?? time(issue.updatedAt) ?? last.at;
      changes.push({ at: Math.max(last.at, settled), status: issue.status });
    }
    return changes;
  }
  const created = time(issue.createdAt);
  const started = time(issue.startedAt);
  const closed = time(issue.closedAt);
  const fallback: StatusChange[] = [];
  if (created !== undefined) fallback.push({ at: created, status: "open" });
  if (started !== undefined) fallback.push({ at: started, status: "in_progress" });
  if (closed !== undefined) fallback.push({ at: closed, status: "closed" });
  if (fallback.length === 0 || fallback[fallback.length - 1]?.status !== issue.status) {
    fallback.push({ at: time(issue.updatedAt) ?? created ?? 0, status: issue.status });
  }
  return fallback;
}

/** The status an issue was in at `at`, or undefined before it was created. */
function statusAt(changes: readonly StatusChange[], at: number): string | undefined {
  let status: string | undefined;
  for (const change of changes) {
    if (change.at > at) break;
    status = change.status;
  }
  return status;
}

/** One issue with what Analytics reads of it. */
export interface IssueFlow {
  issue: Issue;
  changes: StatusChange[];
}

export interface ThroughputWeek {
  /** The week's first day, `YYYY-MM-DD`. */
  start: string;
  closed: number;
}

export interface CycleTimePoint {
  id: string;
  label: string;
  /** When it was done, `YYYY-MM-DD`. */
  closed: string;
  /** From its first move into a work-in-progress status to its last move into a done one. */
  days: number;
  /** The mean of this point and the ROLLING_WINDOW - 1 closed before it. */
  rollingAverage: number;
}

export interface FlowDay {
  day: string;
  counts: Record<StatusCategory, number>;
}

export interface AgingItem {
  id: string;
  label: string;
  title: string;
  status: string;
  assignee?: string;
  /** Since it last moved into a work-in-progress status. */
  days: number;
}

export type Burndown =
  | {
      kind: "drawn";
      sprint: string;
      members: number;
      days: { day: string; remaining?: number; ideal: number }[];
    }
  | { kind: "none"; message: string };

export interface AnalyticsView {
  range: { start: string; end: string; weeks: number };
  throughput: ThroughputWeek[];
  cycleTime: CycleTimePoint[];
  /** Done issues with no move into a work-in-progress status, left out of cycle time. */
  closedWithoutStart: number;
  cumulativeFlow: FlowDay[];
  burndown: Burndown;
  aging: AgingItem[];
}

const dateOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const startOfDay = (ms: number): number => Math.floor(ms / DAY_MS) * DAY_MS;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const labelOf = (issue: Issue): string => issue.displayId ?? issue.id;

/** The last time `changes` moved into a `category` status from one outside it. */
function lastEntry(
  changes: readonly StatusChange[],
  statuses: readonly Status[],
  category: StatusCategory,
): number | undefined {
  let entered: number | undefined;
  let inside = false;
  for (const change of changes) {
    const now = statusCategory(change.status, statuses) === category;
    if (now && !inside) entered = change.at;
    inside = now;
  }
  return inside ? entered : undefined;
}

function firstEntry(
  changes: readonly StatusChange[],
  statuses: readonly Status[],
  category: StatusCategory,
): number | undefined {
  return changes.find((change) => statusCategory(change.status, statuses) === category)?.at;
}

const emptyCounts = (): Record<StatusCategory, number> => ({
  active: 0,
  wip: 0,
  frozen: 0,
  done: 0,
});

function burndownOf(
  flows: readonly IssueFlow[],
  sprint: SprintInfo | undefined,
  statuses: readonly Status[],
  now: number,
): Burndown {
  if (sprint === undefined) {
    return { kind: "none", message: "No sprint: label issues sprint:<name> to draw a burndown." };
  }
  const start = time(sprint.startsAt);
  const due = time(sprint.dueAt);
  if (start === undefined || due === undefined) {
    return {
      kind: "none",
      message: `Sprint ${sprint.name} has no ${start === undefined ? "start" : "due"} date: set it on its milestone, Sprint ${sprint.name}.`,
    };
  }
  const members = flows.filter((flow) => sprintLabelsOf(flow.issue).includes(sprint.name));
  const first = startOfDay(start);
  const last = Math.max(first, startOfDay(due));
  const span = (last - first) / DAY_MS;
  const days: { day: string; remaining?: number; ideal: number }[] = [];
  for (let day = first; day <= last; day += DAY_MS) {
    const index = (day - first) / DAY_MS;
    const ideal = round1(span === 0 ? 0 : members.length * (1 - index / span));
    const point: { day: string; remaining?: number; ideal: number } = { day: dateOf(day), ideal };
    if (day <= now) {
      const end = Math.min(day + DAY_MS - 1, now);
      point.remaining = members.filter((flow) => {
        const status = statusAt(flow.changes, end);
        return status === undefined || statusCategory(status, statuses) !== "done";
      }).length;
    }
    days.push(point);
  }
  return { kind: "drawn", sprint: sprint.name, members: members.length, days };
}

export interface AnalyticsOptions {
  statuses: readonly Status[];
  /** The time to measure at, in milliseconds. */
  now: number;
  weeks?: number;
  /** Issues done before the window starts that `flows` leaves out: the done band's floor. */
  doneBefore?: number;
  /** The sprint the burndown draws, with its dates; none draws no burndown. */
  sprint?: SprintInfo;
  /**
   * The sprint's members with their changes, those done before the window too, kept apart from
   * `flows` so they never count twice in the cumulative flow; `flows`' labelled issues when unset.
   */
  members?: readonly IssueFlow[];
}

/**
 * Analytics over `flows`: every issue not done before the window, each with its status changes.
 * The window is the `weeks` whole weeks ending on the day of `now`.
 */
export function analyticsView(
  flows: readonly IssueFlow[],
  options: AnalyticsOptions,
): AnalyticsView {
  const { statuses, now } = options;
  const weeks = Math.min(
    ANALYTICS_MAX_WEEKS,
    Math.max(1, Math.floor(options.weeks ?? ANALYTICS_DEFAULT_WEEKS)),
  );
  const today = startOfDay(now);
  const windowStart = today - (weeks * 7 - 1) * DAY_MS;
  const doneAt = (flow: IssueFlow) => lastEntry(flow.changes, statuses, "done");

  const throughput: ThroughputWeek[] = Array.from({ length: weeks }, (_, i) => ({
    start: dateOf(windowStart + i * WEEK_MS),
    closed: 0,
  }));
  const finished: { flow: IssueFlow; at: number }[] = [];
  for (const flow of flows) {
    const at = doneAt(flow);
    if (at === undefined || at < windowStart || at > now) continue;
    finished.push({ flow, at });
    const week = throughput[Math.floor((at - windowStart) / WEEK_MS)];
    if (week !== undefined) week.closed++;
  }

  finished.sort((a, b) => a.at - b.at);
  const cycleTime: CycleTimePoint[] = [];
  let closedWithoutStart = 0;
  for (const { flow, at } of finished) {
    const started = firstEntry(flow.changes, statuses, "wip") ?? time(flow.issue.startedAt);
    if (started === undefined || started > at) {
      closedWithoutStart++;
      continue;
    }
    const days = round1((at - started) / DAY_MS);
    const recent = [...cycleTime.slice(-(ROLLING_WINDOW - 1)).map((point) => point.days), days];
    cycleTime.push({
      id: flow.issue.id,
      label: labelOf(flow.issue),
      closed: dateOf(at),
      days,
      rollingAverage: round1(recent.reduce((sum, value) => sum + value, 0) / recent.length),
    });
  }

  const cumulativeFlow: FlowDay[] = [];
  for (let day = windowStart; day <= today; day += DAY_MS) {
    const end = Math.min(day + DAY_MS - 1, now);
    const counts = emptyCounts();
    counts.done = options.doneBefore ?? 0;
    for (const flow of flows) {
      const status = statusAt(flow.changes, end);
      if (status !== undefined) counts[statusCategory(status, statuses)]++;
    }
    cumulativeFlow.push({ day: dateOf(day), counts });
  }

  const aging: AgingItem[] = [];
  for (const flow of flows) {
    if (statusCategory(flow.issue.status, statuses) !== "wip") continue;
    const since =
      lastEntry(flow.changes, statuses, "wip") ??
      time(flow.issue.startedAt) ??
      time(flow.issue.updatedAt);
    if (since === undefined) continue;
    const item: AgingItem = {
      id: flow.issue.id,
      label: labelOf(flow.issue),
      title: flow.issue.title,
      status: flow.issue.status,
      days: round1(Math.max(0, now - since) / DAY_MS),
    };
    if (flow.issue.assignee !== undefined) item.assignee = flow.issue.assignee;
    aging.push(item);
  }
  aging.sort((a, b) => b.days - a.days || (a.id < b.id ? -1 : 1));

  return {
    range: { start: dateOf(windowStart), end: dateOf(today), weeks },
    throughput,
    cycleTime,
    closedWithoutStart,
    cumulativeFlow,
    burndown: burndownOf(options.members ?? flows, options.sprint, statuses, now),
    aging,
  };
}

/** The categories in the order the cumulative flow stacks them, done at the bottom. */
export const FLOW_ORDER: readonly StatusCategory[] = [...STATUS_CATEGORIES].reverse();

/**
 * The sprint a burndown draws when none is asked for: the open sprint with dates that started
 * last on or before `now`, else the open sprint that starts first.
 */
export function currentSprint(sprints: readonly SprintInfo[], now: number): SprintInfo | undefined {
  const open = sprints.filter((sprint) => sprint.open && time(sprint.startsAt) !== undefined);
  const started = open
    .filter((sprint) => (time(sprint.startsAt) ?? 0) <= now)
    .sort((a, b) => (time(b.startsAt) ?? 0) - (time(a.startsAt) ?? 0));
  if (started[0] !== undefined) return started[0];
  return open.sort((a, b) => (time(a.startsAt) ?? 0) - (time(b.startsAt) ?? 0))[0];
}
