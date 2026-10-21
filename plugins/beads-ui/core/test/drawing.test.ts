// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  BLOCK_MAX_CHARS,
  type BoardState,
  bandView,
  boardView,
  clockStamp,
  DEFAULT_SORT,
  fitBlock,
  INITIAL_BOARD_STATE,
  type Issue,
  nextSort,
  reduceBoard,
  SORT_CYCLE,
  sortLabel,
  storeName,
} from "../src/index.ts";
import { allIssues, storeStatuses } from "./helpers.ts";

const boardOf = (issues: Issue[]): BoardState =>
  reduceBoard(INITIAL_BOARD_STATE, {
    type: "load-succeeded",
    issues,
    statuses: storeStatuses(),
    at: "2026-10-21T01:12:04",
  });

describe("bandView", () => {
  test("should count open, in-progress and blocked issues when the store has loaded", () => {
    const view = bandView(allIssues(), {
      store: "beads-ui",
      loadedAt: "2026-10-21T01:12:04",
      width: 120,
    });

    expect(view.counts.map((count) => [count.status, count.count])).toEqual([
      ["open", 20],
      ["in_progress", 2],
      ["blocked", 0],
    ]);
    expect(view.line).toBe("beads beads-ui | 20 open | 2 in progress | 0 blocked | as of 01:12:04");
  });

  test("should cut the line to the width when the band is narrow", () => {
    expect(bandView(allIssues(), { store: "beads-ui", width: 20 }).line).toBe(
      "beads beads-ui | 20…",
    );
  });
});

describe("boardView with a sort and a card budget", () => {
  test("should order each column by the sort when one is given", () => {
    const createdDesc = { key: "created", direction: "desc" } as const;

    const open = (sort?: typeof createdDesc) =>
      boardView(boardOf(allIssues()), {
        columnWidth: 30,
        ...(sort ? { sort } : {}),
      }).lanes[0]?.cells[0]?.map((card) => card.id) ?? [];

    const byCreated = [...allIssues()]
      .filter((issue) => issue.status === "open")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((issue) => issue.id);
    expect(open(createdDesc)).toEqual(byCreated);
    expect(open()).not.toEqual(byCreated);
  });

  test("should draw at most the per-cell and total budget and count the rest when the store is large", () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      ...(allIssues()[0] as Issue),
      id: `BU-x${i}`,
      status: i % 2 === 0 ? "open" : "closed",
    }));

    const view = boardView(boardOf(many), {
      columnWidth: 30,
      cardLimit: { perCell: 12, total: 20 },
    });
    const lane = view.lanes[0];
    const open = view.columns.findIndex((column) => column.status === "open");
    const closed = view.columns.findIndex((column) => column.status === "closed");

    expect([lane?.cells[open]?.length, lane?.hidden[open]]).toEqual([12, 138]);
    expect([lane?.cells[closed]?.length, lane?.hidden[closed]]).toEqual([8, 142]);
    expect(view.columns[open]?.count).toBe(150);
  });

  test("should hide nothing when no budget is given", () => {
    const lane = boardView(boardOf(allIssues()), { columnWidth: 30 }).lanes[0];

    expect(lane?.hidden.every((count) => count === 0)).toBe(true);
  });
});

describe("sort cycle", () => {
  test("should step through the cycle and back to the default when the o key is pressed", () => {
    let spec = DEFAULT_SORT;
    const seen: string[] = [];
    for (let i = 0; i <= SORT_CYCLE.length; i++) {
      seen.push(sortLabel(spec));
      spec = nextSort(spec);
    }

    expect(seen).toEqual([
      "priority",
      "created:desc",
      "updated:desc",
      "due",
      "assignee",
      "priority",
    ]);
  });

  test("should go back to the default when the stored sort is outside the cycle", () => {
    expect(nextSort({ key: "created", direction: "asc" })).toEqual(DEFAULT_SORT);
  });
});

describe("text helpers", () => {
  test("should give the local wall-clock time when the surface reports its offset", () => {
    const ms = Date.UTC(2026, 9, 21, 1, 12, 4);

    expect(clockStamp(ms, 0)).toBe("2026-10-21T01:12:04");
    expect(clockStamp(ms, -120)).toBe("2026-10-21T03:12:04");
    expect(clockStamp(ms, 300)).toBe("2026-10-20T20:12:04");
  });

  test("should name the store by its directory when given a path", () => {
    expect(storeName("/data/projects/beads-ui/")).toBe("beads-ui");
    expect(storeName("/")).toBe("/");
  });

  test("should cut a block to the mod's limit and say so when it is longer", () => {
    const long = "x".repeat(BLOCK_MAX_CHARS + 50);

    const cut = fitBlock(long);

    expect(cut.length).toBe(BLOCK_MAX_CHARS);
    expect(cut.endsWith("[cut at 10000 characters]")).toBe(true);
    expect(fitBlock("short")).toBe("short");
  });
});
