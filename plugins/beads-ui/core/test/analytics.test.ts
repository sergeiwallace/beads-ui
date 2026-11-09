// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  analyticsView,
  currentSprint,
  type Issue,
  type IssueFlow,
  parseBdHistoryEvents,
  type SprintInfo,
  statusChanges,
} from "../src/index.ts";
import { storeStatuses, unwrap } from "./helpers.ts";

// T-3.3: "When Analytics renders, the system shall draw throughput, cycle time with a rolling
// average, cumulative flow, a count-based sprint burndown and aging work in progress from bd
// history --events." Each event list below is `bd history <id> --events --json` as bd 1.3.4
// writes it: newest first, a status move's old value the issue's snapshot.

const statuses = storeStatuses();

const issue = (id: string, fields: Partial<Issue> = {}): Issue => ({
  id,
  title: `title of ${id}`,
  status: "open",
  priority: 2,
  type: "task",
  labels: [],
  dependencies: [],
  createdAt: "2026-10-01T09:00:00Z",
  updatedAt: "2026-10-01T09:00:00Z",
  metadata: {},
  ...fields,
});

type Step = ["created" | "closed" | "reopened" | "label_added"] | ["status_changed", string];

/** bd's JSON for `steps`, each `[at, step]`, oldest first as written; bd prints them reversed. */
function history(id: string, steps: [string, ...Step][]): string {
  let status = "open";
  const rows = steps.map(([at, type, to], i) => {
    const row: Record<string, string> = {
      id: `${id}-e${i}`,
      issue_id: id,
      event_type: type,
      actor: "host-a/session-1",
      old_value: "",
      new_value: "",
      created_at: at,
    };
    if (type === "status_changed" && to !== undefined) {
      row.old_value = JSON.stringify({ id, status });
      row.new_value = JSON.stringify({ status: to });
      status = to;
    }
    if (type === "closed") {
      row.new_value = "Closed";
      status = "closed";
    }
    if (type === "reopened") status = "open";
    return row;
  });
  return JSON.stringify(rows.reverse());
}

const flow = (fields: Issue, steps: [string, ...Step][]): IssueFlow => ({
  issue: fields,
  changes: statusChanges(fields, unwrap(parseBdHistoryEvents(history(fields.id, steps)))),
});

const NOW = Date.parse("2026-11-09T12:00:00Z");

describe("an issue's status changes from bd history --events", () => {
  test("should read bd's newest-first list oldest first, a close and reopen in one second in order", () => {
    const fields = issue("BU-1", { status: "closed" });
    const events = unwrap(
      parseBdHistoryEvents(
        history("BU-1", [
          ["2026-11-01T09:00:00Z", "created"],
          ["2026-11-02T09:00:00Z", "status_changed", "in_progress"],
          ["2026-11-03T09:00:00Z", "closed"],
          ["2026-11-03T09:00:00Z", "reopened"],
          ["2026-11-03T09:00:00Z", "label_added"],
          ["2026-11-03T09:00:00Z", "closed"],
        ]),
      ),
    );

    expect(statusChanges(fields, events).map((change) => change.status)).toEqual([
      "open",
      "in_progress",
      "closed",
      "open",
      "closed",
    ]);
  });

  test("should open first and end on the issue's own status when bd lists one second's events out of order", () => {
    const fields = issue("BU-3", { status: "closed", closedAt: "2026-11-03T09:00:00Z" });
    // Created and closed in the same second, listed as if the close came first.
    const events = unwrap(
      parseBdHistoryEvents(
        JSON.stringify([
          {
            id: "e-created",
            issue_id: "BU-3",
            event_type: "created",
            actor: "host-a/session-1",
            created_at: "2026-11-03T09:00:00Z",
          },
          {
            id: "e-closed",
            issue_id: "BU-3",
            event_type: "closed",
            actor: "host-a/session-1",
            new_value: "Closed",
            created_at: "2026-11-03T09:00:00Z",
          },
        ]),
      ),
    );

    expect(statusChanges(fields, events).map((change) => change.status)).toEqual([
      "open",
      "closed",
    ]);
    // A close and a reopen inside one second, listed reopen-last: the issue is closed now.
    const raced = unwrap(
      parseBdHistoryEvents(
        JSON.stringify(
          [
            ["e-reopened", "reopened", "2026-11-03T09:00:00Z"],
            ["e-closed", "closed", "2026-11-03T09:00:00Z"],
            ["e-created", "created", "2026-11-03T08:00:00Z"],
          ].map(([id, type, at]) => ({
            id,
            issue_id: "BU-3",
            event_type: type,
            actor: "host-a/session-1",
            created_at: at,
          })),
        ),
      ),
    );
    expect(statusChanges(fields, raced).at(-1)?.status).toBe("closed");
  });

  test("should fall back to the issue's own dates when bd returns no event that moves it", () => {
    const fields = issue("BU-2", {
      status: "closed",
      startedAt: "2026-11-02T00:00:00Z",
      closedAt: "2026-11-04T00:00:00Z",
    });

    expect(statusChanges(fields, []).map((change) => change.status)).toEqual([
      "open",
      "in_progress",
      "closed",
    ]);
  });
});

describe("Analytics over the events (T-3.3)", () => {
  const flows: IssueFlow[] = [
    flow(issue("BU-a", { status: "closed" }), [
      ["2026-10-20T09:00:00Z", "created"],
      ["2026-10-21T09:00:00Z", "status_changed", "in_progress"],
      ["2026-10-23T09:00:00Z", "closed"],
    ]),
    flow(issue("BU-b", { status: "closed" }), [
      ["2026-10-27T09:00:00Z", "created"],
      ["2026-10-27T10:00:00Z", "status_changed", "in_progress"],
      ["2026-11-02T10:00:00Z", "closed"],
    ]),
    // Closed straight from open: in throughput, never in cycle time.
    flow(issue("BU-c", { status: "closed" }), [
      ["2026-11-03T09:00:00Z", "created"],
      ["2026-11-04T09:00:00Z", "closed"],
    ]),
    flow(issue("BU-d", { status: "closed" }), [
      ["2026-11-01T09:00:00Z", "created"],
      ["2026-11-05T09:00:00Z", "status_changed", "in_progress"],
      ["2026-11-06T09:00:00Z", "closed"],
    ]),
    flow(issue("BU-w", { status: "in_progress", assignee: "host-a/session-1" }), [
      ["2026-10-25T09:00:00Z", "created"],
      ["2026-10-26T12:00:00Z", "status_changed", "in_progress"],
      ["2026-10-30T12:00:00Z", "status_changed", "blocked"],
      ["2026-10-31T12:00:00Z", "status_changed", "open"],
      ["2026-11-07T12:00:00Z", "status_changed", "in_progress"],
    ]),
    flow(issue("BU-o"), [["2026-11-08T09:00:00Z", "created"]]),
  ];

  test("should count throughput per week in the window ending today", () => {
    const view = analyticsView(flows, { statuses, now: NOW, weeks: 3 });

    expect(view.range).toEqual({ start: "2026-10-20", end: "2026-11-09", weeks: 3 });
    expect(view.throughput).toEqual([
      { start: "2026-10-20", closed: 1 },
      { start: "2026-10-27", closed: 1 },
      { start: "2026-11-03", closed: 2 },
    ]);
  });

  test("should give each done issue its cycle time and a rolling average, and leave out one never started", () => {
    const view = analyticsView(flows, { statuses, now: NOW, weeks: 3 });

    expect(view.cycleTime).toEqual([
      { id: "BU-a", label: "BU-a", closed: "2026-10-23", days: 2, rollingAverage: 2 },
      { id: "BU-b", label: "BU-b", closed: "2026-11-02", days: 6, rollingAverage: 4 },
      { id: "BU-d", label: "BU-d", closed: "2026-11-06", days: 1, rollingAverage: 3 },
    ]);
    expect(view.closedWithoutStart).toBe(1);
  });

  test("should count each day's issues by status category on top of the done before the window", () => {
    const view = analyticsView(flows, { statuses, now: NOW, weeks: 3, doneBefore: 10 });
    const day = (stamp: string) => view.cumulativeFlow.find((entry) => entry.day === stamp)?.counts;

    expect(view.cumulativeFlow).toHaveLength(21);
    expect(day("2026-10-20")).toEqual({ active: 1, wip: 0, frozen: 0, done: 10 });
    expect(day("2026-10-30")).toEqual({ active: 0, wip: 2, frozen: 0, done: 11 });
    expect(day("2026-11-09")).toEqual({ active: 1, wip: 1, frozen: 0, done: 14 });
  });

  test("should list work in progress oldest first, aged from its last move into progress", () => {
    const view = analyticsView(flows, { statuses, now: NOW, weeks: 3 });

    expect(view.aging).toEqual([
      {
        id: "BU-w",
        label: "BU-w",
        title: "title of BU-w",
        status: "in_progress",
        assignee: "host-a/session-1",
        days: 2,
      },
    ]);
  });

  test("should burn a sprint down by count of members not done each day, up to today", () => {
    const members = [
      flow(issue("BU-s1", { labels: ["sprint:7"], status: "closed" }), [
        ["2026-11-02T09:00:00Z", "created"],
        ["2026-11-04T09:00:00Z", "closed"],
      ]),
      flow(issue("BU-s2", { labels: ["sprint:7"], status: "closed" }), [
        ["2026-11-02T09:00:00Z", "created"],
        ["2026-11-06T09:00:00Z", "closed"],
      ]),
      flow(issue("BU-s3", { labels: ["sprint:7"] }), [["2026-11-02T09:00:00Z", "created"]]),
      flow(issue("BU-s4", { labels: ["sprint:7"] }), [["2026-11-02T09:00:00Z", "created"]]),
    ];
    const sprint: SprintInfo = {
      name: "7",
      open: true,
      members: 4,
      startsAt: "2026-11-03",
      dueAt: "2026-11-11T00:00:00Z",
    };

    const view = analyticsView([...flows, ...members], { statuses, now: NOW, sprint });

    expect(view.burndown).toEqual({
      kind: "drawn",
      sprint: "7",
      members: 4,
      days: [
        { day: "2026-11-03", remaining: 4, ideal: 4 },
        { day: "2026-11-04", remaining: 3, ideal: 3.5 },
        { day: "2026-11-05", remaining: 3, ideal: 3 },
        { day: "2026-11-06", remaining: 2, ideal: 2.5 },
        { day: "2026-11-07", remaining: 2, ideal: 2 },
        { day: "2026-11-08", remaining: 2, ideal: 1.5 },
        { day: "2026-11-09", remaining: 2, ideal: 1 },
        { day: "2026-11-10", ideal: 0.5 },
        { day: "2026-11-11", ideal: 0 },
      ],
    });
  });

  test("should burn down the members given apart, and count none of them in the cumulative flow", () => {
    // Done before a one-week window: in the burndown, never on top of the done floor.
    const early = flow(issue("BU-m1", { labels: ["sprint:9"], status: "closed" }), [
      ["2026-10-20T09:00:00Z", "created"],
      ["2026-10-22T09:00:00Z", "closed"],
    ]);
    const open = flow(issue("BU-m2", { labels: ["sprint:9"] }), [
      ["2026-10-20T09:00:00Z", "created"],
    ]);
    const sprint: SprintInfo = {
      name: "9",
      open: true,
      members: 2,
      startsAt: "2026-10-21",
      dueAt: "2026-11-11T00:00:00Z",
    };

    const view = analyticsView([open], {
      statuses,
      now: NOW,
      weeks: 1,
      doneBefore: 1,
      sprint,
      members: [early, open],
    });

    expect(view.burndown.kind === "drawn" && view.burndown.members).toBe(2);
    expect(view.burndown.kind === "drawn" && view.burndown.days.at(-3)?.remaining).toBe(1);
    expect(view.cumulativeFlow.at(-1)?.counts).toEqual({ active: 1, wip: 0, frozen: 0, done: 1 });
  });

  test("should say why no burndown is drawn when the sprint has no start date or there is none", () => {
    const undated: SprintInfo = { name: "8", open: true, members: 2, dueAt: "2026-11-20" };

    expect(analyticsView(flows, { statuses, now: NOW, sprint: undated }).burndown).toEqual({
      kind: "none",
      message: "Sprint 8 has no start date: set it on its milestone, Sprint 8.",
    });
    expect(analyticsView(flows, { statuses, now: NOW }).burndown.kind).toBe("none");
  });

  test("should pick the open sprint that started last as the current one", () => {
    const sprints: SprintInfo[] = [
      { name: "6", open: false, members: 3, startsAt: "2026-10-27" },
      { name: "7", open: true, members: 4, startsAt: "2026-11-03" },
      { name: "8", open: true, members: 1, startsAt: "2026-11-17" },
      { name: "x", open: true, members: 1 },
    ];

    expect(currentSprint(sprints, NOW)?.name).toBe("7");
    expect(currentSprint(sprints.slice(2), NOW)?.name).toBe("8");
    expect(currentSprint([], NOW)).toBeUndefined();
  });
});
