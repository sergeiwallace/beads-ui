// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  type BoardState,
  backlogView,
  boardView,
  buildColumns,
  EMPTY_FILTER_STATE,
  INITIAL_BOARD_STATE,
  type Issue,
  isRankKey,
  keyBetween,
  orderByRank,
  planRank,
  RANK_KEY,
  readRank,
  reduceBoard,
  resolveRank,
  type Status,
  WEB_RANK_DEFAULT,
} from "../src/index.ts";
import { unwrap } from "./helpers.ts";

const STATUSES: Status[] = [
  { name: "open", category: "active", builtin: true },
  { name: "in_progress", category: "wip", builtin: true },
  { name: "closed", category: "done", builtin: true },
];

function issue(id: string, fields: Partial<Issue> & { rank?: unknown } = {}): Issue {
  const { rank, ...rest } = fields;
  return {
    id,
    title: `Task ${id}`,
    status: "open",
    priority: 2,
    type: "task",
    labels: [],
    dependencies: [],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    metadata: rank === undefined ? {} : { [RANK_KEY]: rank },
    ...rest,
  };
}

function board(issues: Issue[]): BoardState {
  return reduceBoard(INITIAL_BOARD_STATE, {
    type: "load-succeeded",
    issues,
    statuses: STATUSES,
    at: "2026-11-09T05:00:00",
  });
}

const column = (state: BoardState, status = "open"): string[] =>
  buildColumns(state.statuses, state.issues, { rank: true })
    .columns.find((candidate) => candidate.status.name === status)
    ?.issues.map((entry) => entry.id) ?? [];

const rankOf = (state: BoardState, id: string): unknown =>
  state.issues.find((entry) => entry.id === id)?.metadata[RANK_KEY];

// A seeded draw in [0, 1), so a jittered test is repeatable.
function seeded(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1_103_515_245 + 12_345) % 2_147_483_648;
    return x / 2_147_483_648;
  };
}

describe("keyBetween", () => {
  test("should give a key that sorts strictly between its neighbours when both are set", () => {
    const key = unwrap(keyBetween("a0", "a1"));

    expect("a0" < key && key < "a1").toBe(true);
    expect(isRankKey(key)).toBe(true);
  });

  test("should keep every card in the order it was dropped when cards go in at the top, middle and bottom", () => {
    const random = seeded(7);
    const order: string[] = [];
    for (let i = 0; i < 300; i++) {
      const slot = Math.floor(random() * (order.length + 1));
      const key = unwrap(keyBetween(order[slot - 1], order[slot], random));
      order.splice(slot, 0, key);
    }

    expect([...order].sort()).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
    expect(order.every(isRankKey)).toBe(true);
  });

  test("should draw different keys in one gap when two reorders draw differently", () => {
    const first = unwrap(keyBetween("a0", "a1", seeded(1)));
    const second = unwrap(keyBetween("a0", "a1", seeded(2)));

    expect(first).not.toBe(second);
    for (const key of [first, second]) expect("a0" < key && key < "a1").toBe(true);
  });

  test("should refuse a neighbour whose rank is not a fractional-index key", () => {
    for (const bad of ["0.5", "", "a00", "b1", "a 1", "A00000000000000000000000000"]) {
      const result = keyBetween(bad, undefined);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("malformed-rank");
    }
  });

  test("should refuse neighbours given out of order", () => {
    const result = keyBetween("a2", "a1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("out-of-order");
  });
});

describe("readRank and orderByRank", () => {
  test("should read a number or a non-key string in metadata.rank as malformed, never as a rank", () => {
    expect(readRank(issue("t-1", { rank: 0.5 })).kind).toBe("malformed");
    expect(readRank(issue("t-2", { rank: "zz!" })).kind).toBe("malformed");
    expect(readRank(issue("t-3")).kind).toBe("unranked");
    expect(readRank(issue("t-4", { rank: "a0" }))).toEqual({ kind: "ranked", key: "a0" });
  });

  test("should put ranked cards first by key and keep the incoming order for the rest", () => {
    const ordered = orderByRank([
      issue("u-1"),
      issue("r-2", { rank: "a2" }),
      issue("m-1", { rank: 7 }),
      issue("r-1", { rank: "a1" }),
      issue("u-2"),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual(["r-1", "r-2", "u-1", "m-1", "u-2"]);
  });
});

describe("planRank", () => {
  const three = () =>
    board([
      issue("t-a", { rank: "a0" }),
      issue("t-b", { rank: "a1" }),
      issue("t-c", { rank: "a2" }),
    ]);

  test("should write a key between the slot's neighbours and leave every other card's rank as it was", () => {
    const state = three();
    const plan = unwrap(planRank(state, "t-c", 1, seeded(3)));
    const next = reduceBoard(state, plan.event);

    expect([plan.above, plan.below, plan.shown]).toEqual(["t-a", "t-b", "open"]);
    expect("a0" < plan.event.key && plan.event.key < "a1").toBe(true);
    expect(column(next)).toEqual(["t-a", "t-c", "t-b"]);
    expect([rankOf(next, "t-a"), rankOf(next, "t-b")]).toEqual(["a0", "a1"]);
  });

  test("should land a card dropped among unranked cards at the end of the ranked run, ranking no other card", () => {
    const state = board([
      issue("t-a", { rank: "a0" }),
      issue("t-x", { createdAt: "2026-10-01T00:00:00Z" }),
      issue("t-y", { createdAt: "2026-10-02T00:00:00Z" }),
      issue("t-z", { createdAt: "2026-10-03T00:00:00Z" }),
    ]);
    const plan = unwrap(planRank(state, "t-z", 2, seeded(4)));
    const next = reduceBoard(state, plan.event);

    expect([plan.above, plan.below]).toEqual(["t-a", undefined]);
    expect(column(next)).toEqual(["t-a", "t-z", "t-x", "t-y"]);
    expect([rankOf(next, "t-x"), rankOf(next, "t-y")]).toEqual([undefined, undefined]);
  });

  test("should refuse a reorder that leaves the card where it already is", () => {
    const result = planRank(three(), "t-b", 1, seeded(5));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("same-place");
  });

  test("should refuse a reorder of a card whose move is still in flight", () => {
    const moving = reduceBoard(three(), { type: "move-requested", id: "t-a", to: "in_progress" });
    const result = planRank(moving, "t-a", 0, seeded(6));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("move-pending");
  });
});

describe("reduceBoard reorders", () => {
  const reordered = () => {
    const state = board([issue("t-a", { rank: "a0" }), issue("t-b", { rank: "a1" }), issue("t-c")]);
    return reduceBoard(state, { type: "rank-requested", id: "t-c", key: "a0V" });
  };

  test("should restore the card's rank, flag the conflict and re-read it when the write exits 13", () => {
    const failed = reduceBoard(reordered(), {
      type: "rank-failed",
      id: "t-c",
      exitCode: 13,
      message: "status mismatch",
    });

    expect(rankOf(failed, "t-c")).toBeUndefined();
    expect(column(failed)).toEqual(["t-a", "t-b", "t-c"]);
    expect(failed.rankConflict).toEqual({ id: "t-c" });
    expect(failed.refresh).toEqual(["t-c"]);
    expect(boardView(failed, { columnWidth: 80 }).conflictLine).toBe(
      "t-c changed elsewhere before the reorder; restored and refreshed",
    );
  });

  test("should report another failure as a reorder error with its message, not as a conflict", () => {
    const failed = reduceBoard(reordered(), {
      type: "rank-failed",
      id: "t-c",
      exitCode: null,
      message: "metadata.rank of t-a: 0.5 is not a key",
    });

    expect(failed.rankConflict).toBeUndefined();
    expect(failed.refresh).toEqual([]);
    expect(boardView(failed, { columnWidth: 80 }).conflictLine).toBe(
      "reordering t-c failed: metadata.rank of t-a: 0.5 is not a key",
    );
  });

  test("should keep a reorder in flight drawn when the board reloads before the write returns", () => {
    const reloaded = reduceBoard(reordered(), {
      type: "load-succeeded",
      issues: [issue("t-a", { rank: "a0" }), issue("t-b", { rank: "a1" }), issue("t-c")],
      statuses: STATUSES,
      at: "2026-11-09T05:00:10",
    });

    expect(column(reloaded)).toEqual(["t-a", "t-c", "t-b"]);
  });

  test("should take the server's key when the write succeeds", () => {
    const done = reduceBoard(reordered(), { type: "rank-succeeded", id: "t-c", key: "a0Vx" });

    expect(rankOf(done, "t-c")).toBe("a0Vx");
    expect(done.ranking).toEqual({});
  });
});

describe("the Backlog under rank", () => {
  test("should order open issues by priority, then rank, then age when views.rank is on", () => {
    const issues = [
      issue("p2-old", { createdAt: "2026-10-01T00:00:00Z" }),
      issue("p2-ranked", { rank: "a5", createdAt: "2026-10-09T00:00:00Z" }),
      issue("p1-new", { priority: 1, createdAt: "2026-10-08T00:00:00Z" }),
      issue("p1-ranked", { priority: 1, rank: "a0", createdAt: "2026-10-09T00:00:00Z" }),
      issue("p2-new", { createdAt: "2026-10-05T00:00:00Z" }),
      issue("done", { status: "closed" }),
    ];
    const rows = (rank: boolean) =>
      backlogView(issues, {
        statuses: STATUSES,
        filter: EMPTY_FILTER_STATE,
        titleWidth: 80,
        rank,
      }).rows.map((row) => row.id);

    expect(rows(true)).toEqual(["p1-ranked", "p1-new", "p2-ranked", "p2-old", "p2-new"]);
    expect(rows(false)).toEqual(["p1-new", "p1-ranked", "p2-old", "p2-new", "p2-ranked"]);
  });
});

describe("resolveRank", () => {
  test("should turn rank on in the web app when the file does not set views.rank", () => {
    expect(WEB_RANK_DEFAULT).toBe(true);
    expect(resolveRank(undefined, WEB_RANK_DEFAULT)).toEqual({ rank: true, problems: [] });
    expect(resolveRank("[views]\nsoft_wip_limit = { in_progress = 3 }\n", true).rank).toBe(true);
  });

  test("should turn rank off for a store whose file sets views.rank = false", () => {
    expect(resolveRank("[views]\nrank = false\n", WEB_RANK_DEFAULT)).toEqual({
      rank: false,
      problems: [],
    });
  });

  test("should keep the default and say why when views.rank is not true or false", () => {
    expect(resolveRank('[views]\nrank = "yes"\n', true)).toEqual({
      rank: true,
      problems: ['views.rank must be true or false, not "yes"; using true'],
    });
  });
});
