// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  decodeQueueFilters,
  encodeQueueFilters,
  heldEntry,
  INITIAL_REVIEW_QUEUE,
  type Issue,
  NOTHING_TO_REVIEW,
  parseReviewOutput,
  type QueueFilters,
  type ReviewItem,
  type ReviewQueueEntry,
  type ReviewQueueState,
  reduceReviewQueue,
  reviewQueueView,
  taskEntry,
  withQueueFilters,
} from "../src/index.ts";

// T-W1.1 of the web app design: the Review queue's model half.

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

const task = (id: string, extra: Partial<Issue> = {}, repo = "beads-ui"): ReviewQueueEntry =>
  taskEntry({ issue: issue(id, extra), repo });

/** Held items through the review command's own parser, as the server reads them. */
function heldItems(rows: Record<string, unknown>[]): ReviewItem[] {
  const parsed = parseReviewOutput(
    JSON.stringify({
      schema: 1,
      fingerprint: "f1",
      host: "host-c",
      pair: ["host-c", "host-a"],
      scope: "pair",
      read_at: "2026-11-09T00:00:00Z",
      items: rows.map((row) => ({
        store: "ai-harness",
        relpath: `docs/held/${String(row.name)}.md`,
        path: `/repos/ai-harness/docs/held/${String(row.name)}.md`,
        kind: "decision",
        status: "open",
        session: "session-a@host-c",
        machine: "host-c",
        task: "none",
        title: `held ${String(row.name)}`,
        created_at: "2026-10-05T00:00:00Z",
        ...row,
      })),
    }),
  );
  if (!parsed.ok || parsed.value.unchanged) throw new Error("fixture did not parse");
  return parsed.value.items;
}

const loaded = (entries: ReviewQueueEntry[], filters: QueueFilters = {}): ReviewQueueState =>
  reduceReviewQueue(
    { ...INITIAL_REVIEW_QUEUE, filters },
    {
      type: "loaded",
      entries,
    },
  );

const sectionIds = (state: ReviewQueueState, action: string): string[] =>
  reviewQueueView(state)
    .sections.find((section) => section.action === action)
    ?.entries.map((entry) => entry.id) ?? [];

describe("sorting a section", () => {
  test("should order items by priority, then impact, then age, then id when a section sorts", () => {
    const entries = [
      task("BU-age-new", {
        priority: 1,
        metadata: { value: 5 },
        createdAt: "2026-10-09T00:00:00Z",
      }),
      task("BU-age-old", {
        priority: 1,
        metadata: { value: 5 },
        createdAt: "2026-10-01T00:00:00Z",
      }),
      task("BU-p0", { priority: 0, metadata: { value: 1 } }),
      task("BU-impact-high", { priority: 1, metadata: { value: 13 } }),
      task("BU-tie-b", { priority: 1, metadata: { value: 5 }, createdAt: "2026-10-01T00:00:00Z" }),
      task("BU-p3", { priority: 3, metadata: { value: 20 } }),
    ];

    expect(sectionIds(loaded(entries), "prompt")).toEqual([
      "BU-p0",
      "BU-impact-high",
      "BU-age-old",
      "BU-tie-b",
      "BU-age-new",
      "BU-p3",
    ]);
  });

  test("should sort an item with no curation value after every item that has one when priorities tie", () => {
    const entries = [
      task("BU-none", { priority: 1, createdAt: "2026-01-01T00:00:00Z" }),
      task("BU-low", { priority: 1, metadata: { value: 1 } }),
      task("BU-off-scale", {
        priority: 1,
        metadata: { value: 4 },
        createdAt: "2026-02-01T00:00:00Z",
      }),
    ];

    expect(sectionIds(loaded(entries), "prompt")).toEqual(["BU-low", "BU-none", "BU-off-scale"]);
  });

  test("should read value and effort as the curation scorer writes them when the metadata holds numbers or digit strings", () => {
    const fromString = task("BU-string", { metadata: { value: "8", effort: "3" } });
    const fromNumber = task("BU-number", { metadata: { value: 8, effort: 3 } });

    expect([fromString.impact, fromString.size]).toEqual([8, 3]);
    expect([fromNumber.impact, fromNumber.size]).toEqual([8, 3]);
    expect(task("BU-junk", { metadata: { value: "high", effort: 7 } }).impact).toBeUndefined();
  });

  test("should take a held item's priority, impact and size from its joined issue when the item has one", () => {
    const [joined, bare] = heldItems([
      { name: "joined", task: "BU-epic.1" },
      { name: "bare", created_at: "2026-01-01T00:00:00Z" },
    ]) as [ReviewItem, ReviewItem];
    const held = heldEntry(joined, {
      issue: issue("BU-epic.1", { priority: 0, metadata: { value: 13, effort: 5 } }),
      repo: "beads-ui",
    });

    expect([held.priority, held.impact, held.size, held.repo]).toEqual([0, 13, 5, "beads-ui"]);
    const state = loaded([heldEntry(bare), held]);
    expect(sectionIds(state, "answer")).toEqual([joined.path, bare.path]);
  });

  test("should sort an item with no priority after every prioritised item and not throw when the reducer receives one", () => {
    const [bare] = heldItems([{ name: "no-issue", created_at: "2025-01-01T00:00:00Z" }]) as [
      ReviewItem,
    ];
    const noPriority = { ...task("BU-null"), priority: null } as unknown as ReviewQueueEntry;
    const entries = [heldEntry(bare), task("BU-p4", { priority: 4 })];

    expect(sectionIds(loaded(entries), "answer")).toEqual([bare.path]);
    const mixed = loaded([noPriority, task("BU-p4", { priority: 4 }), task("BU-p2")]);
    expect(sectionIds(mixed, "prompt")).toEqual(["BU-p2", "BU-p4", "BU-null"]);
  });
});

describe("grouping by next action", () => {
  test("should put held items under answer, blocked tasks under unblock and the rest under prompt when the queue loads", () => {
    const [decision, blocker] = heldItems([
      { name: "decision", kind: "decision" },
      { name: "blocker", kind: "blocker" },
    ]) as [ReviewItem, ReviewItem];
    const state = loaded([
      task("BU-blocked", { status: "blocked" }),
      heldEntry(decision),
      task("BU-open"),
      heldEntry(blocker),
    ]);

    const view = reviewQueueView(state);
    expect(view.sections.map((section) => section.action)).toEqual(["answer", "unblock", "prompt"]);
    expect(sectionIds(state, "answer").sort()).toEqual([blocker.path, decision.path].sort());
    expect(sectionIds(state, "unblock")).toEqual(["BU-blocked"]);
    expect(sectionIds(state, "prompt")).toEqual(["BU-open"]);
  });
});

describe("filters and the URL", () => {
  const goals = new Set(["BU-goal-1"]);
  const entries = (): ReviewQueueEntry[] => [
    taskEntry(
      {
        issue: issue("BU-match", {
          parent: "BU-epic",
          type: "bug",
          assignee: "session-a",
          metadata: { effort: 3 },
          dependencies: [{ type: "relates-to", id: "BU-goal-1" }],
        }),
        repo: "beads-ui",
      },
      goals,
    ),
    taskEntry(
      {
        issue: issue("BU-other-repo", {
          parent: "BU-epic",
          type: "bug",
          assignee: "session-a",
          metadata: { effort: 3 },
          dependencies: [{ type: "relates-to", id: "BU-goal-1" }],
        }),
        repo: "app-portal",
      },
      goals,
    ),
    taskEntry(
      {
        issue: issue("BU-no-goal", {
          parent: "BU-epic",
          type: "bug",
          assignee: "session-a",
          metadata: { effort: 3 },
          dependencies: [{ type: "blocks", id: "BU-goal-1" }],
        }),
        repo: "beads-ui",
      },
      goals,
    ),
  ];
  const all: QueueFilters = {
    epic: ["BU-epic"],
    goal: ["BU-goal-1"],
    type: ["bug", "task"],
    size: ["3"],
    owner: ["session-a"],
    repo: ["beads-ui"],
  };

  test("should keep only the items every applied filter matches when filters for all six keys are set", () => {
    let state = loaded(entries());
    for (const [key, values] of Object.entries(all)) {
      state = reduceReviewQueue(state, {
        type: "set-filter",
        key: key as keyof QueueFilters,
        values: values ?? [],
      });
    }

    const view = reviewQueueView(state);
    expect(sectionIds(state, "prompt")).toEqual(["BU-match"]);
    expect([view.shown, view.total]).toEqual([1, 3]);
  });

  test("should encode the filters in the URL and show the same filtered list when that URL is opened", () => {
    let state = loaded(entries());
    for (const [key, values] of Object.entries(all)) {
      state = reduceReviewQueue(state, {
        type: "set-filter",
        key: key as keyof QueueFilters,
        values: values ?? [],
      });
    }
    const query = reviewQueueView(state).query;

    expect(query).toBe(
      "epic=BU-epic&goal=BU-goal-1&type=bug,task&size=3&owner=session-a&repo=beads-ui",
    );
    const opened = reduceReviewQueue(loaded(entries()), { type: "open-url", query: `?${query}` });
    expect(opened.filters).toEqual(state.filters);
    expect(reviewQueueView(opened).sections).toEqual(reviewQueueView(state).sections);
  });

  test("should keep a comma or space inside a value and every other URL parameter when the filters round-trip", () => {
    const filters: QueueFilters = { owner: ["team a,b", "session-a"], epic: ["BU-1"] };
    const query = withQueueFilters("?view=review&owner=old&item=BU-9", filters);

    expect(query).toBe("view=review&item=BU-9&epic=BU-1&owner=session-a,team%20a%2Cb");
    expect(decodeQueueFilters(query)).toEqual({ epic: ["BU-1"], owner: ["session-a", "team a,b"] });
    expect(encodeQueueFilters({})).toBe("");
  });

  test("should drop a value that is not valid percent-encoding and ignore other keys when a URL is opened", () => {
    expect(decodeQueueFilters("type=bug,%E0%A4%A&sort=age&repo=&size=3+5")).toEqual({
      type: ["bug"],
      size: ["3 5"],
    });
  });

  test("should clear every filter and show the whole queue when the filters are cleared", () => {
    const state = reduceReviewQueue(loaded(entries(), { repo: ["nowhere"] }), {
      type: "clear-filters",
    });

    expect(reviewQueueView(state).shown).toBe(3);
    expect(reviewQueueView(state).query).toBe("");
  });
});

describe("a failed read", () => {
  test("should show the task items, name the failed read and its exit code, and not say nothing to review when the held review command fails", () => {
    const state = reduceReviewQueue(INITIAL_REVIEW_QUEUE, {
      type: "loaded",
      entries: [task("BU-blocked", { status: "blocked" })],
      failures: [{ source: "held review", exitCode: 3, detail: "store locked" }],
    });

    const view = reviewQueueView(state);
    expect(sectionIds(state, "unblock")).toEqual(["BU-blocked"]);
    expect(view.failureLines).toEqual(["held review could not be read (exit 3): store locked"]);
    expect(view.emptyText).toBeUndefined();
  });

  test("should say the reads failed rather than nothing to review when no item could be read", () => {
    const failed = reduceReviewQueue(INITIAL_REVIEW_QUEUE, {
      type: "loaded",
      entries: [],
      failures: [{ source: "held review", exitCode: null }],
    });

    expect(reviewQueueView(failed).emptyText).toBe("nothing shown: 1 read(s) failed");
    expect(reviewQueueView(failed).failureLines).toEqual([
      "held review could not be read (no exit code)",
    ]);
    const empty = reduceReviewQueue(INITIAL_REVIEW_QUEUE, { type: "loaded", entries: [] });
    expect(reviewQueueView(empty).emptyText).toBe(NOTHING_TO_REVIEW);
  });
});
