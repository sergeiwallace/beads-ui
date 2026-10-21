// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  BLOCK_MAX_CHARS,
  type BoardPageLimit,
  type BoardState,
  type BoardViewOptions,
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
  stepPage,
  storeName,
} from "../src/index.ts";
import { allIssues, storeStatuses } from "./helpers.ts";

const boardOf = (issues: Issue[], statuses = storeStatuses()): BoardState =>
  reduceBoard(INITIAL_BOARD_STATE, {
    type: "load-succeeded",
    issues,
    statuses,
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

  // A budget of 20 cards with every other cost zero, so the arithmetic below is in cards.
  const LIMIT: BoardPageLimit = {
    perCell: 12,
    minPerCell: 1,
    budget: 20,
    card: 1,
    cardText: 0,
    option: 0,
    nameChar: 0,
    pager: 0,
    header: 0,
    lane: 0,
  };
  const many = (count: number, assignees = 1) =>
    Array.from({ length: count }, (_, i) => ({
      ...(allIssues()[0] as Issue),
      id: `BU-x${i}`,
      status: i % 2 === 0 ? "open" : "closed",
      assignee: `aih-${i % assignees}`,
    }));

  /** Every card id on every lane page and cell page, walking the pages as the surface would. */
  function walk(
    issues: Issue[],
    options: Partial<BoardViewOptions> = {},
    statuses = storeStatuses(),
  ) {
    const seen: string[] = [];
    const base = { columnWidth: 30, pageLimit: LIMIT, ...options };
    const first = boardView(boardOf(issues, statuses), base);
    let drawnMost = 0;
    for (let lanePage = 0; lanePage < first.lanePage.pages; lanePage++) {
      const atLanes = boardView(boardOf(issues, statuses), { ...base, lanePage });
      const cells = atLanes.lanes.flatMap((lane) => lane.pages);
      const deepest = Math.max(...cells.map((page) => page.pages));
      for (let step = 0; step < deepest; step++) {
        const pages = Object.fromEntries(
          cells.map((page) => [page.key, Math.min(step, page.pages - 1)]),
        );
        const view = boardView(boardOf(issues, statuses), { ...base, lanePage, pages });
        const drawn = view.lanes.flatMap((lane) => lane.cells.flat());
        drawnMost = Math.max(drawnMost, drawn.length);
        for (const lane of view.lanes) {
          lane.cells.forEach((cell, i) => {
            if (step < (lane.pages[i]?.pages ?? 0)) seen.push(...cell.map((card) => card.id));
          });
        }
      }
    }
    return { first, seen, drawnMost };
  }

  test("should page each cell so every card is reachable and no page passes the budget when the store is large", () => {
    const issues = many(300);

    const { first, seen, drawnMost } = walk(issues);
    const open = first.columns.findIndex((column) => column.status === "open");
    const page = first.lanes[0]?.pages[open];

    expect([...seen].sort()).toEqual(issues.map((issue) => issue.id).sort());
    expect(seen).toHaveLength(issues.length);
    expect(page).toEqual({ key: ":open", page: 0, pages: 15, from: 1, to: 10, total: 150 });
    expect(drawnMost).toBeLessThanOrEqual(LIMIT.budget);
    expect(first.columns[open]?.count).toBe(150);
  });

  test("should split the swimlanes into lane pages that fit when one card per cell is over the budget", () => {
    // 29 assignees, an odd count, so every lane holds both open and closed cards: two cells each.
    const issues = many(300, 29);

    const { first, seen, drawnMost } = walk(issues, { swimlane: "assignee" });

    expect(first.lanePage).toEqual({ key: "lanes", page: 0, pages: 3, from: 1, to: 10, total: 30 });
    expect([...seen].sort()).toEqual(issues.map((issue) => issue.id).sort());
    expect(drawnMost).toBeLessThanOrEqual(LIMIT.budget);
  });

  test("should split one lane into column windows that fit when one card per column is over the budget", () => {
    // 30 custom statuses beside the store's own, two cards each: 30 cards at one per cell.
    const custom = Array.from({ length: 30 }, (_, i) => ({
      name: `custom-${i}`,
      category: "wip" as const,
      builtin: false,
    }));
    const issues = Array.from({ length: 60 }, (_, i) => ({
      ...(allIssues()[0] as Issue),
      id: `BU-c${i}`,
      status: `custom-${i % 30}`,
    }));
    const statuses = [...storeStatuses(), ...custom];
    const everyColumn = boardView(boardOf(issues, statuses), { columnWidth: 30 }).columns.map(
      (column) => column.status,
    );

    const { first, seen, drawnMost } = walk(issues, {}, statuses);
    const windows = Array.from({ length: first.lanePage.pages }, (_, lanePage) =>
      boardView(boardOf(issues, statuses), { columnWidth: 30, pageLimit: LIMIT, lanePage }),
    );

    expect(first.columnWindow).toMatchObject({ from: 1, total: everyColumn.length });
    expect(windows.flatMap((view) => view.columns.map((column) => column.status))).toEqual(
      everyColumn,
    );
    expect([...seen].sort()).toEqual(issues.map((issue) => issue.id).sort());
    expect(seen).toHaveLength(issues.length);
    expect(drawnMost).toBeLessThanOrEqual(LIMIT.budget);
    expect(first.lanes[0]?.cells.flat()[0]?.moveTargets).toHaveLength(everyColumn.length - 1);
  });

  test("should clamp a page past the last one to the last page when the cell shrank", () => {
    const view = boardView(boardOf(many(300)), {
      columnWidth: 30,
      pageLimit: LIMIT,
      pages: { ":open": 99 },
    });
    const open = view.columns.findIndex((column) => column.status === "open");

    expect(view.lanes[0]?.pages[open]).toMatchObject({ page: 14, from: 141, to: 150 });
    expect(view.lanes[0]?.cells[open]).toHaveLength(10);
  });

  test("should draw every card on one page when no limit is given", () => {
    const view = boardView(boardOf(allIssues()), { columnWidth: 30 });

    expect(view.lanes[0]?.pages.every((page) => page.pages === 1)).toBe(true);
    expect(view.lanes[0]?.cells.flat()).toHaveLength(allIssues().length);
    expect(view.lanePage.pages).toBe(1);
  });

  test("should step a page forward and back, wrapping at either end", () => {
    expect([stepPage(0, 3, 1), stepPage(2, 3, 1), stepPage(0, 3, -1), stepPage(0, 1, 1)]).toEqual([
      1, 0, 2, 0,
    ]);
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
