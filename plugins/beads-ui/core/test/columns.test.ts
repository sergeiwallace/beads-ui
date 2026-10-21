import { describe, expect, test } from "claude-code/testing";
import {
  buildColumns,
  buildSwimlanes,
  nextSwimlaneMode,
  parseSwimlaneMode,
  type Status,
} from "../src/index.ts";
import { allIssues, byId, ids, storeStatuses } from "./helpers.ts";

describe("buildColumns", () => {
  test("should give one column per bd status in category order with counts when the board opens", () => {
    const { columns, unplaced } = buildColumns(storeStatuses(), allIssues());

    expect(columns.map((column) => [column.status.name, column.count])).toEqual([
      ["open", 20],
      ["in_progress", 2],
      ["blocked", 0],
      ["hooked", 0],
      ["review", 0],
      ["uat", 0],
      ["deferred", 0],
      ["pinned", 0],
      ["closed", 8],
    ]);
    expect(unplaced).toEqual([]);
  });

  test("should place the done category last when bd lists a done status first", () => {
    const statuses: Status[] = [
      { name: "shipped", category: "done", builtin: false },
      ...storeStatuses(),
    ];

    const names = buildColumns(statuses, allIssues()).columns.map((column) => column.status.name);

    expect(names.slice(-2)).toEqual(["shipped", "closed"]);
    expect(names[0]).toBe("open");
  });

  test("should sort each column by priority then created when no sort is given", () => {
    const open = buildColumns(storeStatuses(), allIssues()).columns[0];

    expect(open?.issues[0]?.id).toBe("BU-mg2.3.1");
    expect(ids(open?.issues.slice(-2) ?? [])).toEqual(["BU-mg2.12", "BU-2zw"]);
  });

  test("should flag a column over its soft limit when the count exceeds it", () => {
    const { columns } = buildColumns(storeStatuses(), allIssues(), {
      softWipLimit: { in_progress: 1, open: 25 },
    });

    const inProgress = columns.find((column) => column.status.name === "in_progress");
    const open = columns.find((column) => column.status.name === "open");
    expect([inProgress?.limit, inProgress?.overLimit]).toEqual([1, true]);
    expect([open?.limit, open?.overLimit]).toEqual([25, false]);
    expect(columns.find((column) => column.status.name === "closed")?.overLimit).toBe(false);
  });

  test("should return an issue whose status bd did not list as unplaced instead of dropping it", () => {
    const issues = allIssues();
    const stray = { ...byId(issues, "BU-2zw"), status: "triage" };

    const { columns, unplaced } = buildColumns(storeStatuses(), [stray, byId(issues, "BU-mg2")]);

    expect(ids(unplaced)).toEqual(["BU-2zw"]);
    expect(columns.reduce((sum, column) => sum + column.count, 0)).toBe(1);
  });

  test("should return no columns and every issue unplaced when bd returned no statuses", () => {
    const result = buildColumns([], allIssues());

    expect(result.columns).toEqual([]);
    expect(result.unplaced).toHaveLength(30);
  });
});

describe("buildSwimlanes", () => {
  test("should give one row per distinct assignee plus an unassigned row when set to assignee", () => {
    const lanes = buildSwimlanes(allIssues(), "assignee");

    expect(lanes.map((lane) => [lane.label, lane.issues.length])).toEqual([
      ["aih-3", 7],
      ["aih-ec2-3", 2],
      ["unassigned", 21],
    ]);
  });

  test("should keep the unassigned row when every issue has an assignee", () => {
    const assigned = allIssues().filter((issue) => issue.assignee !== undefined);

    const lanes = buildSwimlanes(assigned, "assignee");

    expect(lanes.at(-1)).toEqual({ key: "", label: "unassigned", issues: [] });
  });

  test("should group by parent and label each lane from the parent issue when set to epic", () => {
    const lanes = buildSwimlanes(allIssues(), "epic");

    expect(lanes.map((lane) => [lane.key, lane.issues.length])).toEqual([
      ["BU-mg2", 13],
      ["BU-mg2.1", 3],
      ["BU-mg2.2", 2],
      ["BU-mg2.3", 10],
      ["", 2],
    ]);
    expect(lanes[3]?.label).toBe(
      "BU-beads-ui-claude-code-aeyb beads-ui Claude Code mod: the task manager inside the Claude Code TUI, with mouse control",
    );
    expect(lanes.at(-1)?.label).toBe("no epic");
  });

  test("should label an epic lane with the bare parent id when the parent is not loaded", () => {
    const children = allIssues().filter((issue) => issue.parent === "BU-mg2.3");

    const lanes = buildSwimlanes(children, "epic");

    expect(lanes[0]?.label).toBe("BU-mg2.3");
  });

  test("should return a single lane holding every issue when set to none", () => {
    const lanes = buildSwimlanes(allIssues(), "none");

    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.issues).toHaveLength(30);
  });
});

describe("parseSwimlaneMode", () => {
  test("should accept each mode when read from a persisted preference", () => {
    expect(parseSwimlaneMode("assignee")).toEqual({ ok: true, value: "assignee" });
  });

  test("should return the accepted modes when the preference is unknown", () => {
    expect(parseSwimlaneMode("sprint")).toEqual({
      ok: false,
      error: {
        kind: "unknown-swimlane",
        text: "sprint",
        acceptedModes: ["none", "assignee", "epic"],
      },
    });
  });
});

describe("nextSwimlaneMode", () => {
  test("should cycle none, assignee, epic and back when the swimlane key is pressed", () => {
    expect([
      nextSwimlaneMode("none"),
      nextSwimlaneMode("assignee"),
      nextSwimlaneMode("epic"),
    ]).toEqual(["assignee", "epic", "none"]);
  });
});
