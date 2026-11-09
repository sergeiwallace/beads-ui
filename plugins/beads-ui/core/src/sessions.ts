// The Sessions view and the work-queue adapter's reads (T-3.4, D-11, D-17). Where `[queue] url`
// is set the view is the queue's session registry, the only source of liveness: each session's
// state, current task, last heartbeat and claim age. Without it the view is the store's assignees
// alone, and says that liveness is unavailable. Pure: the server makes the calls.

import type { Issue, Status } from "./model.ts";
import { statusCategory } from "./views/timeline.ts";

/** A row of the queue's `GET /api/queue/sessions` (ai-core `SessionOut`). */
export interface QueueSession {
  id: string;
  machine: string;
  name: string;
  state: string;
  repo?: string;
  startedAt?: string;
  lastHeartbeatAt?: string;
  endedAt?: string;
}

/** A row of the queue's `GET /api/queue/tasks` (ai-core `TaskOut`). */
export interface QueueTask {
  repo: string;
  taskId: string;
  displayId?: string;
  title?: string;
  status?: string;
  queueState: string;
  ownerSession?: string;
}

/** A row of a task's `events` in `GET /api/queue/tasks/{repo}/{task_id}` (`QueueEventOut`). */
export interface QueueEvent {
  kind: string;
  ts: string;
  sessionId?: string;
}

export interface QueueParseError {
  kind: "parse-error";
  source: "the work queue";
  path: string;
  message: string;
}

export type QueueParseResult<T> = { ok: true; value: T } | { ok: false; error: QueueParseError };

/** The queue states in which a session holds a fenced lease on its task (ai-core D-25, F-3). */
export const LEASED_QUEUE_STATES: readonly string[] = ["assigned", "active"];
/** The event the queue records when a claim grants a lease (state-machine rows T5 and T7). */
export const CLAIM_EVENT = "queue.task.assigned";

type Json = Record<string, unknown>;

class Invalid {
  readonly path: string;
  readonly message: string;
  constructor(path: string, message: string) {
    this.path = path;
    this.message = message;
  }
}

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function required(row: Json, key: string, path: string): string {
  const value = row[key];
  if (typeof value !== "string" || value === "") {
    throw new Invalid(`${path}.${key}`, "expected a non-empty string");
  }
  return value;
}

function optional(row: Json, key: string, path: string): string | undefined {
  const value = row[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Invalid(`${path}.${key}`, "expected a string");
  return value;
}

function rows<T>(json: unknown, parse: (row: Json, path: string) => T): QueueParseResult<T[]> {
  try {
    if (!Array.isArray(json)) throw new Invalid("$", "expected an array");
    return {
      ok: true,
      value: json.map((row, i) => {
        if (!isObject(row)) throw new Invalid(`$[${i}]`, "expected an object");
        return parse(row, `$[${i}]`);
      }),
    };
  } catch (cause) {
    if (cause instanceof Invalid) {
      return {
        ok: false,
        error: {
          kind: "parse-error",
          source: "the work queue",
          path: cause.path,
          message: cause.message,
        },
      };
    }
    throw cause;
  }
}

function assign<T extends object>(target: T, key: keyof T, value: string | undefined): void {
  if (value !== undefined) (target as Record<keyof T, unknown>)[key] = value;
}

export function parseQueueSessions(json: unknown): QueueParseResult<QueueSession[]> {
  return rows(json, (row, path) => {
    const id = required(row, "id", path);
    const session: QueueSession = {
      id,
      machine: required(row, "machine", path),
      name: optional(row, "name", path) ?? splitAssignee(id).name,
      state: required(row, "state", path),
    };
    assign(session, "repo", optional(row, "repo", path));
    assign(session, "startedAt", optional(row, "started_at", path));
    assign(session, "lastHeartbeatAt", optional(row, "last_heartbeat_at", path));
    assign(session, "endedAt", optional(row, "ended_at", path));
    return session;
  });
}

export function parseQueueTasks(json: unknown): QueueParseResult<QueueTask[]> {
  return rows(json, (row, path) => {
    const task: QueueTask = {
      repo: required(row, "repo", path),
      taskId: required(row, "task_id", path),
      queueState: required(row, "queue_state", path),
    };
    assign(task, "displayId", optional(row, "display_id", path));
    assign(task, "title", optional(row, "title", path));
    assign(task, "status", optional(row, "status", path));
    assign(task, "ownerSession", optional(row, "owner_session", path));
    return task;
  });
}

/** The `events` of a queue task detail (`GET /api/queue/tasks/{repo}/{task_id}`). */
export function parseQueueTaskEvents(json: unknown): QueueParseResult<QueueEvent[]> {
  const events = isObject(json) ? json.events : undefined;
  return rows(events, (row, path) => {
    const event: QueueEvent = { kind: required(row, "kind", path), ts: required(row, "ts", path) };
    assign(event, "sessionId", optional(row, "session_id", path));
    return event;
  });
}

/** The task the queue holds a lease on for `repo` and `taskId`, or undefined for none. */
export function leasedTask(
  tasks: readonly QueueTask[],
  repo: string,
  taskId: string,
): QueueTask | undefined {
  return tasks.find(
    (task) =>
      task.repo === repo &&
      task.taskId === taskId &&
      task.ownerSession !== undefined &&
      LEASED_QUEUE_STATES.includes(task.queueState),
  );
}

/** When the newest claim in a task's queue events granted its lease, or undefined for none. */
export function claimedAt(events: readonly QueueEvent[]): string | undefined {
  let latest: { at: number; ts: string } | undefined;
  for (const event of events) {
    if (event.kind !== CLAIM_EVENT) continue;
    const at = Date.parse(event.ts);
    if (!Number.isNaN(at) && (latest === undefined || at > latest.at))
      latest = { at, ts: event.ts };
  }
  return latest?.ts;
}

/** An age as a short span: `45s`, `12m`, `3h 5m`, `2d 4h`. */
export function ageText(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`;
}

export interface SessionTask {
  repo?: string;
  id: string;
  label: string;
  title?: string;
}

export interface SessionRow {
  id: string;
  machine: string;
  name: string;
  /** The queue's state for the session; undefined when liveness is unavailable. */
  state?: string;
  currentTask?: SessionTask;
  lastHeartbeatAt?: string;
  heartbeatAge?: string;
  claimedAt?: string;
  claimAge?: string;
  /** What the claim age was read from: the queue's claim event, or the issue's `started_at`. */
  claimSource?: "queue" | "beads";
  /** The store's tasks this session is assigned that are not done. */
  assigned: number;
}

export interface SessionsView {
  source: "queue" | "beads";
  liveness: "available" | "unavailable";
  rows: SessionRow[];
  /** The sentence above the rows. */
  note: string;
}

/** `assignee` is `<machine>/<session>` (D-17); a bare name is a session on no named machine. */
function splitAssignee(assignee: string): { machine: string; name: string } {
  const slash = assignee.indexOf("/");
  return slash <= 0
    ? { machine: "", name: assignee }
    : { machine: assignee.slice(0, slash), name: assignee.slice(slash + 1) };
}

const openAssigned = (issues: readonly Issue[], statuses: readonly Status[], session: string) =>
  issues.filter(
    (issue) => issue.assignee === session && statusCategory(issue.status, statuses) !== "done",
  );

const age = (now: number, stamp: string | undefined): string | undefined => {
  if (stamp === undefined) return undefined;
  const at = Date.parse(stamp);
  return Number.isNaN(at) ? undefined : ageText(now - at);
};

export const LIVENESS_UNAVAILABLE =
  "Liveness is unavailable: [queue] url is not set, so these sessions come from the store's assignees alone.";

/**
 * The Sessions view without the queue: one row per assignee of a task in the store that is not
 * done, its current task the one it moved to work in progress last. No state and no heartbeat,
 * since only the queue's registry knows them.
 */
export function beadsSessionsView(
  issues: readonly Issue[],
  options: { statuses: readonly Status[]; now: number },
): SessionsView {
  const names = new Set<string>();
  for (const issue of issues) {
    if (issue.assignee !== undefined && statusCategory(issue.status, options.statuses) !== "done") {
      names.add(issue.assignee);
    }
  }
  const rows = [...names].sort().map((assignee): SessionRow => {
    const tasks = openAssigned(issues, options.statuses, assignee);
    const working = tasks
      .filter((issue) => statusCategory(issue.status, options.statuses) === "wip")
      .sort((a, b) => (b.startedAt ?? b.updatedAt).localeCompare(a.startedAt ?? a.updatedAt));
    const row: SessionRow = { id: assignee, ...splitAssignee(assignee), assigned: tasks.length };
    const current = working[0];
    if (current !== undefined) {
      row.currentTask = {
        id: current.id,
        label: current.displayId ?? current.id,
        title: current.title,
      };
      const claimAge = age(options.now, current.startedAt);
      if (current.startedAt !== undefined && claimAge !== undefined) {
        row.claimedAt = current.startedAt;
        row.claimAge = claimAge;
        row.claimSource = "beads";
      }
    }
    return row;
  });
  return { source: "beads", liveness: "unavailable", rows, note: LIVENESS_UNAVAILABLE };
}

export interface QueueSessionsInput {
  sessions: readonly QueueSession[];
  /** The queue's leased tasks (LEASED_QUEUE_STATES). */
  tasks: readonly QueueTask[];
  /** Claim times from the queue's events, by `<repo>/<task_id>`. */
  claims: Readonly<Record<string, string>>;
  /** This store's issues and its name as the queue knows it, for a claim age from `started_at`. */
  issues: readonly Issue[];
  store: string;
  statuses: readonly Status[];
  now: number;
}

/**
 * The Sessions view from the queue's registry: every session with its state, the task it holds
 * a lease on, its last heartbeat, and how long ago that claim was made. The claim time is the
 * queue's claim event; a task the queue leased without one (a projection of a Beads claim) takes
 * the issue's `started_at` when the issue is in this store.
 */
export function queueSessionsView(input: QueueSessionsInput): SessionsView {
  const leased = new Map<string, QueueTask>();
  for (const task of input.tasks) {
    if (task.ownerSession !== undefined && LEASED_QUEUE_STATES.includes(task.queueState)) {
      leased.set(task.ownerSession, task);
    }
  }
  const order = (state: string) => (state === "gone" ? 1 : 0);
  const sessions = [...input.sessions].sort(
    (a, b) => order(a.state) - order(b.state) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const rows = sessions.map((session): SessionRow => {
    const row: SessionRow = {
      id: session.id,
      machine: session.machine,
      name: session.name,
      state: session.state,
      assigned: openAssigned(input.issues, input.statuses, session.id).length,
    };
    if (session.lastHeartbeatAt !== undefined) {
      row.lastHeartbeatAt = session.lastHeartbeatAt;
      const heartbeatAge = age(input.now, session.lastHeartbeatAt);
      if (heartbeatAge !== undefined) row.heartbeatAge = heartbeatAge;
    }
    const task = leased.get(session.id);
    if (task !== undefined) {
      const current: SessionTask = {
        repo: task.repo,
        id: task.taskId,
        label: task.displayId ?? task.taskId,
      };
      if (task.title !== undefined) current.title = task.title;
      row.currentTask = current;
      const fromQueue = input.claims[`${task.repo}/${task.taskId}`];
      const issue =
        task.repo === input.store
          ? input.issues.find((candidate) => candidate.id === task.taskId)
          : undefined;
      const claimed = fromQueue ?? issue?.startedAt;
      const claimAge = age(input.now, claimed);
      if (claimed !== undefined && claimAge !== undefined) {
        row.claimedAt = claimed;
        row.claimAge = claimAge;
        row.claimSource = fromQueue === undefined ? "beads" : "queue";
      }
    }
    return row;
  });
  const live = sessions.filter((session) => session.state !== "gone").length;
  return {
    source: "queue",
    liveness: "available",
    rows,
    note: `${live} of ${sessions.length} sessions in the work queue's registry are live.`,
  };
}
