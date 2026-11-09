// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import { type Issue, parseSprintSelection, sprintSelectionText, sprintView } from "../src/index.ts";
import { storeStatuses } from "./helpers.ts";

// T-W1.0 of the web app design, over D-5 of the beads-ui design: a sprint's members carry the
// `sprint:<name>` label, its dates sit on the `milestone` issue titled `Sprint <name>`.

const issue = (id: string, extra: Partial<Issue> = {}): Issue => ({
  id,
  title: `issue ${id}`,
  status: "open",
  priority: 2,
  type: "task",
  labels: [],
  dependencies: [],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-02T00:00:00Z",
  metadata: {},
  ...extra,
});

const milestone = (id: string, name: string, extra: Partial<Issue> = {}): Issue =>
  issue(id, { type: "milestone", title: `Sprint ${name}`, ...extra });

const store = (): Issue[] => [
  milestone("BU-m1", "s1", {
    dueAt: "2026-11-14T00:00:00Z",
    metadata: { "sprint.starts_at": "2026-11-01T00:00:00Z" },
  }),
  milestone("BU-m2", "s2", {
    dueAt: "2026-11-28T00:00:00Z",
    metadata: { sprint: { starts_at: "2026-11-15T00:00:00Z" } },
  }),
  milestone("BU-m0", "s0", { status: "closed", dueAt: "2026-10-31T00:00:00Z" }),
  issue("BU-a", { labels: ["sprint:s1"], priority: 1 }),
  issue("BU-b", { labels: ["sprint:s1", "ui"], status: "in_progress" }),
  issue("BU-c", { labels: ["sprint:s1"], status: "closed" }),
  issue("BU-d", { labels: ["sprint:s2"] }),
  issue("BU-e", { labels: ["sprint:s0"], status: "closed" }),
  issue("BU-f", { labels: ["sprint:hotfix"] }),
  issue("BU-g", { priority: 0 }),
  issue("BU-h", { status: "blocked" }),
  issue("BU-i", { status: "closed" }),
];

const ids = (issues: readonly Issue[]): string[] => issues.map((one) => one.id);

describe("the selected sprint", () => {
  test("should list the selected sprint's issues as a board and as a list when the Sprint view loads", () => {
    const view = sprintView(store(), {
      statuses: storeStatuses(),
      selection: { kind: "sprint", name: "s1" },
    });

    expect(ids(view.list)).toEqual(["BU-a", "BU-b", "BU-c"]);
    const columns = Object.fromEntries(
      view.board.columns.map((column) => [column.status.name, ids(column.issues)]),
    );
    expect(columns.open).toEqual(["BU-a"]);
    expect(columns.in_progress).toEqual(["BU-b"]);
    expect(columns.closed).toEqual(["BU-c"]);
    expect(view.board.unplaced).toEqual([]);
    expect(view.sprint).toMatchObject({
      name: "s1",
      milestoneId: "BU-m1",
      startsAt: "2026-11-01T00:00:00Z",
      dueAt: "2026-11-14T00:00:00Z",
      open: true,
      members: 3,
    });
  });

  test("should list a sprint by its label alone, without dates, when it has no milestone", () => {
    const view = sprintView(store(), {
      statuses: storeStatuses(),
      selection: { kind: "sprint", name: "hotfix" },
    });

    expect(ids(view.list)).toEqual(["BU-f"]);
    expect(view.sprint).toEqual({ name: "hotfix", open: true, members: 1 });
  });

  test("should show an empty board and list when the selected sprint names no issue", () => {
    const view = sprintView(store(), {
      statuses: storeStatuses(),
      selection: { kind: "sprint", name: "never" },
    });

    expect(view.list).toEqual([]);
    expect(view.board.columns.every((column) => column.issues.length === 0)).toBe(true);
    expect(view.sprint).toBeUndefined();
  });

  test("should order the list and every column by the given order when the view has one", () => {
    const reversed = (list: readonly Issue[]): Issue[] =>
      [...list].sort((a, b) => (a.id < b.id ? 1 : -1));
    const view = sprintView([...store(), issue("BU-z", { labels: ["sprint:s1"] })], {
      statuses: storeStatuses(),
      selection: { kind: "sprint", name: "s1" },
      order: reversed,
    });

    expect(ids(view.list)).toEqual(["BU-z", "BU-c", "BU-b", "BU-a"]);
    expect(
      ids(view.board.columns.find((column) => column.status.name === "open")?.issues ?? []),
    ).toEqual(["BU-z", "BU-a"]);
  });
});

describe("the backlog and the picker", () => {
  test("should list every unfinished issue in no sprint when the backlog is selected", () => {
    const view = sprintView(store(), { statuses: storeStatuses(), selection: { kind: "backlog" } });

    expect(ids(view.list)).toEqual(["BU-g", "BU-h"]);
    expect(view.sprint).toBeUndefined();
  });

  test("should offer the backlog and every open sprint by start date, and leave out a closed sprint, when the picker draws", () => {
    const view = sprintView(store(), {
      statuses: storeStatuses(),
      selection: { kind: "sprint", name: "s2" },
    });

    expect(view.picker.map((entry) => [entry.label, entry.count, entry.selected])).toEqual([
      ["Backlog", 2, false],
      ["s1", 3, false],
      ["s2", 1, true],
      ["hotfix", 1, false],
    ]);
    expect(view.picker.map((entry) => entry.selection)).toEqual([
      { kind: "backlog" },
      { kind: "sprint", name: "s1" },
      { kind: "sprint", name: "s2" },
      { kind: "sprint", name: "hotfix" },
    ]);
  });

  test("should treat closed as the done status when the store returned no statuses", () => {
    const view = sprintView(store(), { statuses: [], selection: { kind: "backlog" } });

    expect(ids(view.list)).toEqual(["BU-g", "BU-h"]);
    expect(view.picker.map((entry) => entry.label)).not.toContain("s0");
  });

  test("should read a stored selection back and fall back to the backlog when it names none", () => {
    expect(parseSprintSelection(sprintSelectionText({ kind: "sprint", name: "s1" }))).toEqual({
      kind: "sprint",
      name: "s1",
    });
    expect(parseSprintSelection("backlog")).toEqual({ kind: "backlog" });
    expect(parseSprintSelection("sprint:")).toEqual({ kind: "backlog" });
    expect(parseSprintSelection("garbage")).toEqual({ kind: "backlog" });
  });
});
