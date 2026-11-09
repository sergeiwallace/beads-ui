// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  beadsSessionsView,
  claimedAt,
  type Issue,
  LIVENESS_UNAVAILABLE,
  leasedTask,
  parseQueueSessions,
  parseQueueTaskEvents,
  parseQueueTasks,
  queueSessionsView,
} from "../src/index.ts";
import { storeStatuses, unwrap } from "./helpers.ts";

// T-3.4: the Sessions view from the work queue's registry where `[queue] url` is set, else from
// the store's assignees. The rows below are ai-core's `SessionOut`, `TaskOut` and
// `QueueEventOut` as `GET /api/queue/sessions`, `/tasks` and `/tasks/{repo}/{task_id}` return them.

const statuses = storeStatuses();
const NOW = Date.parse("2026-11-09T12:00:00Z");

const issue = (id: string, fields: Partial<Issue> = {}): Issue => ({
  id,
  title: `title of ${id}`,
  status: "open",
  priority: 2,
  type: "task",
  labels: [],
  dependencies: [],
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  metadata: {},
  ...fields,
});

const SESSIONS = [
  {
    id: "host-a/session-2",
    machine: "host-a",
    name: "session-2",
    state: "gone",
    last_heartbeat_at: "2026-11-08T12:00:00Z",
    ctx_pct: null,
  },
  {
    id: "host-a/session-1",
    machine: "host-a",
    name: "session-1",
    harness: "claude-code",
    state: "busy",
    last_heartbeat_at: "2026-11-09T11:59:15Z",
  },
  { id: "host-b/session-3", machine: "host-b", name: null, state: "idle" },
];

const TASKS = [
  {
    repo: "demo",
    task_id: "demo-1",
    display_id: "demo-first",
    title: "First",
    status: "in_progress",
    queue_state: "assigned",
    owner_session: "host-a/session-1",
  },
  {
    repo: "other",
    task_id: "other-9",
    title: "Elsewhere",
    queue_state: "active",
    owner_session: "host-b/session-3",
  },
  { repo: "demo", task_id: "demo-2", queue_state: "done", owner_session: "host-a/session-2" },
];

describe("the Sessions view from the work queue (T-3.4)", () => {
  test("should show each session's state, current task, last heartbeat and claim age", () => {
    const view = queueSessionsView({
      sessions: unwrap(parseQueueSessions(SESSIONS)),
      tasks: unwrap(parseQueueTasks(TASKS)),
      claims: { "other/other-9": "2026-11-09T09:30:00Z" },
      issues: [
        issue("demo-1", {
          status: "in_progress",
          assignee: "host-a/session-1",
          startedAt: "2026-11-09T10:00:00Z",
        }),
      ],
      store: "demo",
      statuses,
      now: NOW,
    });

    expect(view.source).toBe("queue");
    expect(view.liveness).toBe("available");
    expect(view.note).toBe("2 of 3 sessions in the work queue's registry are live.");
    expect(view.rows).toEqual([
      {
        id: "host-a/session-1",
        machine: "host-a",
        name: "session-1",
        state: "busy",
        assigned: 1,
        lastHeartbeatAt: "2026-11-09T11:59:15Z",
        heartbeatAge: "45s",
        currentTask: { repo: "demo", id: "demo-1", label: "demo-first", title: "First" },
        claimedAt: "2026-11-09T10:00:00Z",
        claimAge: "2h",
        claimSource: "beads",
      },
      {
        id: "host-b/session-3",
        machine: "host-b",
        name: "session-3",
        state: "idle",
        assigned: 0,
        currentTask: { repo: "other", id: "other-9", label: "other-9", title: "Elsewhere" },
        claimedAt: "2026-11-09T09:30:00Z",
        claimAge: "2h 30m",
        claimSource: "queue",
      },
      {
        id: "host-a/session-2",
        machine: "host-a",
        name: "session-2",
        state: "gone",
        assigned: 0,
        lastHeartbeatAt: "2026-11-08T12:00:00Z",
        heartbeatAge: "1d",
      },
    ]);
  });

  test("should name the field when the queue returns a row it cannot read", () => {
    const result = parseQueueSessions([{ id: "host-a/s", machine: "host-a" }]);

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "parse-error",
        source: "the work queue",
        path: "$[0].state",
        message: "expected a non-empty string",
      },
    });
    expect(parseQueueTasks({ detail: "nope" }).ok).toBe(false);
  });

  test("should find a lease only on a task the queue holds as assigned or active", () => {
    const tasks = unwrap(parseQueueTasks(TASKS));

    expect(leasedTask(tasks, "demo", "demo-1")?.ownerSession).toBe("host-a/session-1");
    expect(leasedTask(tasks, "demo", "demo-2")).toBeUndefined();
    expect(leasedTask(tasks, "other", "demo-1")).toBeUndefined();
  });

  test("should take the newest claim event of a task's queue timeline as its claim time", () => {
    const events = unwrap(
      parseQueueTaskEvents({
        task: {},
        events: [
          { id: "e1", ts: "2026-11-08T08:00:00Z", kind: "queue.task.assigned", session_id: "a" },
          { id: "e2", ts: "2026-11-08T09:00:00Z", kind: "queue.task.blocked" },
          { id: "e3", ts: "2026-11-09T07:00:00Z", kind: "queue.task.assigned", session_id: "b" },
        ],
      }),
    );

    expect(claimedAt(events)).toBe("2026-11-09T07:00:00Z");
    expect(claimedAt([])).toBeUndefined();
  });
});

describe("the Sessions view without the work queue (T-3.4)", () => {
  test("should list the store's assignees alone and say that liveness is unavailable", () => {
    const view = beadsSessionsView(
      [
        issue("demo-1", {
          status: "in_progress",
          assignee: "host-a/session-1",
          startedAt: "2026-11-09T11:00:00Z",
        }),
        issue("demo-2", { assignee: "host-a/session-1" }),
        issue("demo-3", { status: "closed", assignee: "host-b/session-9" }),
        issue("demo-4", { assignee: "person-a" }),
        issue("demo-5"),
      ],
      { statuses, now: NOW },
    );

    expect(view.source).toBe("beads");
    expect(view.liveness).toBe("unavailable");
    expect(view.note).toBe(LIVENESS_UNAVAILABLE);
    expect(view.rows).toEqual([
      {
        id: "host-a/session-1",
        machine: "host-a",
        name: "session-1",
        assigned: 2,
        currentTask: { id: "demo-1", label: "demo-1", title: "title of demo-1" },
        claimedAt: "2026-11-09T11:00:00Z",
        claimAge: "1h",
        claimSource: "beads",
      },
      { id: "person-a", machine: "", name: "person-a", assigned: 1 },
    ]);
    expect(
      view.rows.some((row) => row.state !== undefined || row.lastHeartbeatAt !== undefined),
    ).toBe(false);
  });
});
