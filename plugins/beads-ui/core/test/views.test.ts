import { describe, expect, test } from "claude-code/testing";
import {
  type BoardState,
  backlogView,
  boardView,
  EMPTY_FILTER_STATE,
  INITIAL_BOARD_STATE,
  parseBdReady,
  parseBdShow,
  parseFilter,
  planMove,
  reduceBoard,
  submitFilter,
  truncate,
} from "../src/index.ts";
import ready from "./fixtures/bd-ready.json.ts";
import show5 from "./fixtures/bd-show-BU-mg2.3.5.json.ts";
import { allIssues, ids, storeStatuses, unwrap } from "./helpers.ts";

const AT = "2026-10-21T01:12:04Z";
const loaded = (): BoardState =>
  reduceBoard(INITIAL_BOARD_STATE, {
    type: "load-succeeded",
    issues: allIssues(),
    statuses: storeStatuses(),
    at: AT,
  });
const cardsIn = (state: BoardState, status: string, columnWidth = 30) => {
  const view = boardView(state, { columnWidth });
  const index = view.columns.findIndex((column) => column.status === status);
  return view.lanes.flatMap((lane) => lane.cells[index] ?? []);
};

describe("truncate", () => {
  test("should cut to the width with an ellipsis and fold whitespace when the text is long", () => {
    expect(truncate("Board  tab\nwith keyboard", 9)).toBe("Board ta…");
    expect(truncate("short", 9)).toBe("short");
  });

  test("should return an empty string when the width is below one", () => {
    expect(truncate("anything", 0)).toBe("");
    expect(truncate("anything", Number.NaN)).toBe("");
  });
});

describe("boardView", () => {
  test("should head one column per bd status in category order with counts when the pane opens", () => {
    const view = boardView(loaded(), { columnWidth: 20 });

    expect(view.columns.map((column) => column.label)).toEqual([
      "open 20",
      "in_progress 2",
      "blocked 0",
      "hooked 0",
      "review 0",
      "uat 0",
      "deferred 0",
      "pinned 0",
      "closed 8",
    ]);
    expect(view.columns.map((column) => column.token)).toEqual([
      "status.active",
      "status.wip",
      "status.wip",
      "status.wip",
      "status.wip",
      "status.wip",
      "status.frozen",
      "status.frozen",
      "status.done",
    ]);
    expect(view.asOf).toBe("as of 01:12:04");
    expect(view.loading).toBe(false);
  });

  test("should draw each card with display id, title, badge, assignee and Move to targets cut to the column width", () => {
    const card = cardsIn(loaded(), "in_progress", 16).find((c) => c.id === "BU-mg2");

    expect(card).toEqual({
      id: "BU-mg2",
      displayId: "BU-epic-beads-u…",
      title: "EPIC beads-ui:…",
      priority: "P1",
      priorityToken: "priority.p1",
      assignee: "@aih-ec2-3",
      moveTargets: ["open", "blocked", "hooked", "review", "uat", "deferred", "pinned", "closed"],
      pending: false,
    });
  });

  test("should colour a header with the warning token when its count passes the soft limit", () => {
    const view = boardView(loaded(), { columnWidth: 20, softWipLimit: { in_progress: 1 } });

    expect(view.columns[1]).toEqual({
      status: "in_progress",
      label: "in_progress 2",
      count: 2,
      token: "warning",
      overLimit: true,
    });
  });

  test("should draw one row per distinct assignee plus an unassigned row when the swimlane is assignee", () => {
    const view = boardView(loaded(), { columnWidth: 20, swimlane: "assignee" });

    expect(view.lanes.map((lane) => lane.label)).toEqual(["aih-3", "aih-ec2-3", "unassigned"]);
    expect(view.lanes.map((lane) => lane.cells.map((cell) => cell.length))).toEqual([
      [0, 0, 0, 0, 0, 0, 0, 0, 7],
      [0, 1, 0, 0, 0, 0, 0, 0, 1],
      [20, 1, 0, 0, 0, 0, 0, 0, 0],
    ]);
  });

  test("should show a filter line and the unfiltered board when a ready filter has no ready set", () => {
    const view = boardView(loaded(), {
      columnWidth: 20,
      filter: unwrap(parseFilter("ready:true")),
    });

    expect(view.filterLine).toBe("ready: needs the bd ready result");
    expect(view.columns[0]?.count).toBe(20);
  });

  test("should report loading with no columns when nothing has loaded yet", () => {
    const view = boardView(INITIAL_BOARD_STATE, { columnWidth: 20 });

    expect([view.loading, view.columns, view.asOf]).toEqual([true, [], undefined]);
  });
});

describe("planMove and reduceBoard", () => {
  test("should run bd update with the guard on the shown status when a status is picked", () => {
    const plan = unwrap(planMove(loaded(), "BU-mg2.3.5", "in_progress"));

    expect(plan.argv).toEqual([
      "bd",
      "update",
      "BU-mg2.3.5",
      "--status",
      "in_progress",
      "--if-status",
      "open",
    ]);
    expect(plan.event).toEqual({ type: "move-requested", id: "BU-mg2.3.5", to: "in_progress" });
  });

  test("should show the card in its new column at once and confirm it when bd exits 0", () => {
    const moving = reduceBoard(loaded(), {
      type: "move-requested",
      id: "BU-mg2.3.5",
      to: "review",
    });

    expect(cardsIn(moving, "review").map((card) => [card.id, card.pending])).toEqual([
      ["BU-mg2.3.5", true],
    ]);
    const done = reduceBoard(moving, { type: "move-succeeded", id: "BU-mg2.3.5" });
    expect(cardsIn(done, "review").map((card) => card.pending)).toEqual([false]);
    expect(done.pending).toEqual({});
  });

  test("should restore the card, show a conflict line and refresh the issue when bd exits 13", () => {
    const moving = reduceBoard(loaded(), {
      type: "move-requested",
      id: "BU-mg2.3.5",
      to: "review",
    });

    const refused = reduceBoard(moving, {
      type: "move-failed",
      id: "BU-mg2.3.5",
      exitCode: 13,
      message: "status precondition failed",
    });

    expect(cardsIn(refused, "open").map((card) => card.id)).toContain("BU-mg2.3.5");
    expect(cardsIn(refused, "review")).toEqual([]);
    expect(boardView(refused, { columnWidth: 20 }).conflictLine).toBe(
      "BU-mg2.3.5 changed elsewhere before the move to review; restored to open and refreshed",
    );
    expect(refused.refresh).toEqual(["BU-mg2.3.5"]);

    const [fresh] = unwrap(parseBdShow(show5));
    if (fresh === undefined) throw new Error("bd show fixture is empty");
    const refreshed = reduceBoard(refused, { type: "issue-refreshed", issue: fresh });
    expect(refreshed.refresh).toEqual([]);
    expect(cardsIn(refreshed, "open").map((card) => card.id)).toContain("BU-mg2.3.5");
  });

  test("should restore the card and name the exit code without a refresh when bd fails otherwise", () => {
    const moving = reduceBoard(loaded(), { type: "move-requested", id: "BU-2zw", to: "closed" });

    const failed = reduceBoard(moving, {
      type: "move-failed",
      id: "BU-2zw",
      exitCode: 1,
      message: "database is locked",
    });

    expect(cardsIn(failed, "open").map((card) => card.id)).toContain("BU-2zw");
    expect(failed.refresh).toEqual([]);
    expect(boardView(failed, { columnWidth: 20 }).conflictLine).toBe(
      "moving BU-2zw failed (exit 1): database is locked",
    );
  });

  test("should keep a pending move on screen when a refresh lands before bd answers", () => {
    const moving = reduceBoard(loaded(), { type: "move-requested", id: "BU-2zw", to: "review" });

    const reloaded = reduceBoard(moving, {
      type: "load-succeeded",
      issues: allIssues(),
      statuses: storeStatuses(),
      at: "2026-10-21T01:12:14Z",
    });

    expect(cardsIn(reloaded, "review").map((card) => card.id)).toEqual(["BU-2zw"]);
  });

  test("should refuse a move to an unknown or current status, of an unknown issue, or twice", () => {
    const state = loaded();
    const moving = reduceBoard(state, { type: "move-requested", id: "BU-2zw", to: "review" });
    const kinds = [
      planMove(state, "BU-2zw", "triage"),
      planMove(state, "BU-2zw", "open"),
      planMove(state, "BU-nope", "review"),
      planMove(moving, "BU-2zw", "closed"),
    ].map((result) => !result.ok && result.error.kind);

    expect(kinds).toEqual(["unknown-status", "same-status", "unknown-issue", "move-pending"]);
  });
});

describe("a failed bd list", () => {
  test("should keep the last board and show the exit code when bd list fails", () => {
    const failed = reduceBoard(loaded(), {
      type: "load-failed",
      exitCode: 1,
      message: "dolt server unreachable",
    });

    const view = boardView(failed, { columnWidth: 20 });
    expect(view.columns[0]?.label).toBe("open 20");
    expect(view.errorLine).toBe(
      "bd list failed (exit 1): dolt server unreachable; showing the board as of 01:12:04; retrying on the next refresh",
    );
  });

  test("should say it timed out and clear the line when the next refresh succeeds", () => {
    const timedOut = reduceBoard(INITIAL_BOARD_STATE, {
      type: "load-failed",
      exitCode: null,
      message: "",
    });
    expect(boardView(timedOut, { columnWidth: 20 }).errorLine).toBe(
      "bd list timed out; retrying on the next refresh",
    );

    const recovered = reduceBoard(timedOut, {
      type: "load-succeeded",
      issues: allIssues(),
      statuses: storeStatuses(),
      at: AT,
    });
    expect(boardView(recovered, { columnWidth: 20 }).errorLine).toBeUndefined();
  });
});

describe("backlogView", () => {
  const options = (filterText: string) => ({
    statuses: storeStatuses(),
    filter: submitFilter(EMPTY_FILTER_STATE, filterText),
    readyIds: new Set(ids(unwrap(parseBdReady(ready)))),
    titleWidth: 24,
  });
  const rowIds = (text: string) => backlogView(allIssues(), options(text)).rows.map((r) => r.id);

  test("should list open issues by priority then created date when the Backlog tab renders", () => {
    const view = backlogView(allIssues(), options(""));

    expect(view.total).toBe(20);
    expect(view.rows.map((row) => row.id)).toEqual([
      "BU-mg2.3.1",
      "BU-mg2.3.2",
      "BU-mg2.3.3",
      "BU-mg2.3.4",
      "BU-mg2.3.5",
      "BU-mg2.3.6",
      "BU-mg2.3.7",
      "BU-mg2.3.8",
      "BU-mg2.3.9",
      "BU-mg2.3.10",
      "BU-mg2.4",
      "BU-mg2.5",
      "BU-mg2.6",
      "BU-mg2.7",
      "BU-mg2.8",
      "BU-mg2.9",
      "BU-mg2.10",
      "BU-mg2.11",
      "BU-mg2.12",
      "BU-2zw",
    ]);
    expect(view.rows[0]).toEqual({
      id: "BU-mg2.3.1",
      displayId: "BU-t-0-1-core-module-gset",
      priority: "P1",
      priorityToken: "priority.p1",
      type: "task",
      assignee: "",
      title: "T-0.1: core module and…",
      created: "2026-10-21",
    });
  });

  test("should honour the type, label, assignee and ready predicates when a filter is set", () => {
    expect(rowIds("type:epic")).toEqual([
      "BU-mg2.4",
      "BU-mg2.5",
      "BU-mg2.8",
      "BU-mg2.9",
      "BU-mg2.10",
      "BU-mg2.11",
      "BU-mg2.12",
    ]);
    expect(rowIds("label:id:BU-t-1-2-backlog-tab-vptb")).toEqual(["BU-mg2.3.6"]);
    expect(rowIds("assignee:aih-3")).toEqual([]);
    expect(rowIds("type:bug ready:true")).toEqual(["BU-2zw"]);
    expect(rowIds("ready:false")).toEqual([]);
  });

  test("should show the accepted keys and keep the list when the filter has an unknown key", () => {
    const before = submitFilter(EMPTY_FILTER_STATE, "type:epic");
    const after = submitFilter(before, "type:epic owner:sergei");

    const view = backlogView(allIssues(), { ...options(""), filter: after });

    expect(view.rows.map((row) => row.id)).toEqual(rowIds("type:epic"));
    expect(view.filterLine).toBe(
      'unknown filter key "owner"; accepted keys: type, label, assignee, sprint, ready',
    );
  });

  test("should show a filter line when a ready filter has no ready set", () => {
    const { readyIds: _drop, ...noReady } = options("ready:true");

    const view = backlogView(allIssues(), noReady);

    expect(view.filterLine).toBe("ready: needs the bd ready result");
    expect(view.rows).toHaveLength(20);
  });

  test("should fall back to the open status when bd returned no statuses", () => {
    expect(backlogView(allIssues(), { ...options(""), statuses: [] }).total).toBe(20);
  });
});
