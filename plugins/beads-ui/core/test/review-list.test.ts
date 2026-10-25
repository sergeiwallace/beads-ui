// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  DEFAULT_REVIEW_FILTER,
  groupReviewItems,
  initialReviewFilter,
  inPair,
  openItemsOf,
  openReviewIndex,
  parseReviewFilter,
  REVIEW_FILTER_KEYS,
  REVIEW_SORTS,
  type ReviewFilterState,
  type ReviewIssue,
  type ReviewItem,
  type ReviewSort,
  reviewListView,
  scopedItems,
  sortReviewItems,
  submitReviewFilter,
} from "../src/index.ts";

// T-2C.6 and T-2C.7 (D-38, D-40, D-41): the Review view's rules, pure.

const issue = (id: string, extra: Partial<ReviewIssue> = {}): ReviewIssue => ({
  id,
  title: `issue ${id}`,
  status: "open",
  priority: 2,
  labels: [],
  updatedAt: "2026-10-24T00:00:00Z",
  store: "/home/me/projects/beads-ui",
  ...extra,
});

const item = (name: string, extra: Partial<ReviewItem> = {}): ReviewItem => ({
  path: `/home/me/projects/ai-harness/docs/held/sem-kg-ec2--aih-ec2-3/${name}.md`,
  store: "ai-harness",
  relpath: `docs/held/sem-kg-ec2--aih-ec2-3/${name}.md`,
  kind: "decision",
  status: "open",
  session: "aih-ec2-3@sem-kg-ec2",
  machine: "sem-kg-ec2",
  task: "none",
  title: name,
  ask: "",
  createdAt: "2026-10-25T09:00:00Z",
  selection: "current",
  ...extra,
});

const names = (items: readonly ReviewItem[]) => items.map((one) => one.title);
const filtered = (items: readonly ReviewItem[], text: string) => {
  const parsed = parseReviewFilter(text);
  if (!parsed.ok) throw new Error(`${text} did not parse`);
  const state: ReviewFilterState = { text, filter: parsed.value };
  return reviewListView({
    scoped: items,
    scope: "pair",
    firstmate: true,
    pair: [],
    filter: state,
    sort: "created",
    group: "none",
    configured: true,
  }).entries.flatMap((entry) => (entry.kind === "item" ? [entry.row.label] : []));
};

describe("the Review view's filter (T-2C.6)", () => {
  const items = [
    item("decided", { kind: "decision" }),
    item("blocking", { kind: "blocker", createdAt: "2026-10-25T08:00:00Z" }),
  ];

  test("should keep only the items of the kind when the filter holds kind:", () => {
    expect(filtered(items, "kind:blocker")).toEqual(["blocker: blocking"]);
  });

  test("should keep only the items of the status when the filter holds status:", () => {
    const both = [item("open one"), item("answered one", { status: "answered" })];
    expect(filtered(both, "status:answered")).toEqual(["decision: answered one"]);
  });

  test("should keep the selection named, and every selection for all, when the filter holds selection:", () => {
    const all = [
      item("now"),
      item("old", { selection: "superseded", createdAt: "2026-10-25T08:00:00Z" }),
      item("decider", { selection: "escalated", createdAt: "2026-10-25T07:00:00Z" }),
      item("ai", { selection: "ai-resolved", createdAt: "2026-10-25T06:00:00Z" }),
    ];
    expect(filtered(all, "selection:superseded")).toEqual(["decision: old"]);
    expect(filtered(all, "selection:escalated")).toEqual(["decision: decider"]);
    expect(filtered(all, "selection:ai-resolved")).toEqual(["decision: ai"]);
    expect(filtered(all, "selection:all")).toHaveLength(4);
  });

  test("should keep the items a session holds, by its whole name or its slug, when the filter holds session:", () => {
    const both = [item("mine"), item("theirs", { session: "kg-ec2-1@sem-kg-ec2" })];
    expect(filtered(both, "session:kg-ec2-1")).toEqual(["decision: theirs"]);
    expect(filtered(both, "session:kg-ec2-1@sem-kg-ec2")).toEqual(["decision: theirs"]);
  });

  test("should keep the items of the machine when the filter holds machine:", () => {
    const both = [item("here"), item("there", { machine: "acn-mac" })];
    expect(filtered(both, "machine:acn-mac")).toEqual(["decision: there"]);
  });

  test("should keep the items about the task, by the item's task or its issue's ids, when the filter holds task:", () => {
    const both = [
      item("by id", { task: "BU-1", issue: issue("BU-1", { displayId: "BU-one-x" }) }),
      item("other", { task: "BU-2" }),
    ];
    expect(filtered(both, "task:BU-1")).toEqual(["decision: by id"]);
    expect(filtered(both, "task:BU-one-x")).toEqual(["decision: by id"]);
  });

  test("should keep the items whose issue's parent is the epic when the filter holds epic:", () => {
    const both = [
      item("child", { task: "BU-1.1", issue: issue("BU-1.1", { parent: "BU-1" }) }),
      item("orphan", { task: "BU-2", issue: issue("BU-2") }),
    ];
    expect(filtered(both, "epic:BU-1")).toEqual(["decision: child"]);
  });

  test("should keep the items whose issue carries the label when the filter holds label:", () => {
    const both = [
      item("labelled", { task: "BU-1", issue: issue("BU-1", { labels: ["ux"] }) }),
      item("bare", { task: "BU-2", issue: issue("BU-2") }),
    ];
    expect(filtered(both, "label:ux")).toEqual(["decision: labelled"]);
  });

  test("should keep the items whose issue has the priority, as 1 or P1, when the filter holds priority:", () => {
    const both = [
      item("urgent", { task: "BU-1", issue: issue("BU-1", { priority: 1 }) }),
      item("later", { task: "BU-2", issue: issue("BU-2", { priority: 3 }) }),
      item("no issue"),
    ];
    expect(filtered(both, "priority:1")).toEqual(["decision: urgent"]);
    expect(filtered(both, "priority:P1")).toEqual(["decision: urgent"]);
  });

  test("should keep the items holding every free word in their title or ask, in any case", () => {
    const both = [
      item("Confluence space", { ask: "approve the request" }),
      item("install", { ask: "run it on acn-mac" }),
    ];
    expect(filtered(both, "APPROVE confluence")).toEqual(["decision: Confluence space"]);
    expect(filtered(both, "acn-mac")).toEqual(["decision: install"]);
  });

  test("should open on status:open selection:current", () => {
    const state = initialReviewFilter();
    expect(state.text).toBe(DEFAULT_REVIEW_FILTER);
    expect(DEFAULT_REVIEW_FILTER).toBe("status:open selection:current");
    expect(state.filter.terms).toEqual([
      { key: "status", value: "open" },
      { key: "selection", value: "current" },
    ]);
  });

  test("should keep the previous filter and name the accepted keys when a key is unknown", () => {
    const before = submitReviewFilter(initialReviewFilter(), "kind:blocker");
    const after = submitReviewFilter(before, "kind:decision owner:me");

    expect(after.text).toBe("kind:decision owner:me");
    expect(after.filter).toEqual(before.filter);
    const view = reviewListView({
      scoped: items,
      scope: "pair",
      firstmate: true,
      pair: [],
      filter: after,
      sort: "updated",
      group: "none",
      configured: true,
    });
    expect(view.filterError).toBe(
      `unknown filter key "owner", so the previous filter is kept; accepted keys: ${REVIEW_FILTER_KEYS.join(", ")}, and free text`,
    );
    expect(view.entries.map((entry) => entry.kind === "item" && entry.row.label)).toEqual([
      "blocker: blocking",
    ]);
  });

  test("should refuse a selection or a priority it does not know and keep the previous filter", () => {
    const before = initialReviewFilter();
    expect(submitReviewFilter(before, "selection:latest").error).toMatchObject({
      kind: "invalid-value",
      message: "selection: takes current, superseded, escalated, ai-resolved, all",
    });
    expect(submitReviewFilter(before, "priority:9").filter).toEqual(before.filter);
  });
});

describe("the Review view's sorts (T-2C.6)", () => {
  const a = item("a", {
    kind: "blocker",
    session: "kg-ec2-1@sem-kg-ec2",
    task: "BU-2",
    createdAt: "2026-10-25T07:00:00Z",
    answeredAt: "2026-10-25T11:00:00Z",
    issue: issue("BU-2", { priority: 0, parent: "BU-9" }),
  });
  const b = item("b", {
    kind: "decision",
    session: "aih-ec2-3@sem-kg-ec2",
    task: "BU-1",
    createdAt: "2026-10-25T09:00:00Z",
    issue: issue("BU-1", { priority: 1, parent: "BU-8" }),
  });
  const c = item("c", {
    kind: "summary",
    session: "aih-ec2-firstmate-1@sem-kg-ec2",
    task: "none",
    createdAt: "2026-10-25T08:00:00Z",
  });

  const cases: [ReviewSort, string[]][] = [
    ["updated", ["a", "b", "c"]],
    ["created", ["b", "c", "a"]],
    ["priority", ["a", "b", "c"]],
    ["task", ["b", "a", "c"]],
    ["epic", ["b", "a", "c"]],
    ["kind", ["a", "b", "c"]],
    ["session", ["b", "c", "a"]],
  ];
  for (const [sort, order] of cases) {
    test(`should order by ${sort}, with the items that have none last, when the sort is ${sort}`, () => {
      expect(names(sortReviewItems([c, b, a], sort))).toEqual(order);
    });
  }

  test("should cover every sort the view offers", () => {
    expect(cases.map(([sort]) => sort)).toEqual([...REVIEW_SORTS]);
  });

  for (const sort of REVIEW_SORTS) {
    test(`should order ties by updated, newest first, when the sort is ${sort}`, () => {
      const same = { kind: "decision", session: "s@h", task: "BU-1", issue: issue("BU-1") };
      const older = item("older", { ...same, createdAt: "2026-10-25T09:00:00Z" });
      const newer = item("newer", {
        ...same,
        createdAt: "2026-10-25T09:00:00Z",
        answeredAt: "2026-10-25T12:00:00Z",
      });
      expect(names(sortReviewItems([older, newer], sort))).toEqual(["newer", "older"]);
    });
  }
});

describe("the Review view's groups (T-2C.6)", () => {
  const one = item("one", {
    kind: "decision",
    task: "BU-1",
    session: "aih-ec2-3@sem-kg-ec2",
    issue: issue("BU-1", { parent: "BU-9", title: "first" }),
  });
  const two = item("two", {
    kind: "blocker",
    task: "BU-1",
    session: "kg-ec2-1@sem-kg-ec2",
    createdAt: "2026-10-25T08:00:00Z",
    issue: issue("BU-1", { parent: "BU-9", title: "first" }),
  });
  const three = item("three", { kind: "decision", createdAt: "2026-10-25T07:00:00Z" });
  const sorted = sortReviewItems([one, two, three], "created");
  const counts = (group: Parameters<typeof groupReviewItems>[1]) =>
    groupReviewItems(sorted, group, (id) => (id === "BU-9" ? "the epic" : undefined)).map(
      (g) => `${g.label} (${g.items.length})`,
    );

  test("should draw one header with its count per task when grouping by task", () => {
    expect(counts("task")).toEqual(["BU-1: first (2)", "no task (1)"]);
  });

  test("should draw one header with its count per epic, named by its title, when grouping by epic", () => {
    expect(counts("epic")).toEqual(["BU-9: the epic (2)", "no epic (1)"]);
  });

  test("should draw one header with its count per kind when grouping by kind", () => {
    expect(counts("kind")).toEqual(["decision (2)", "blocker (1)"]);
  });

  test("should draw one header with its count per session when grouping by session", () => {
    expect(counts("session")).toEqual(["aih-ec2-3@sem-kg-ec2 (2)", "kg-ec2-1@sem-kg-ec2 (1)"]);
  });

  test("should draw no header when grouping by none, and each group's header with its whole count on every page it spans", () => {
    const view = (group: "none" | "task", page: number) =>
      reviewListView({
        scoped: [one, two, three],
        scope: "pair",
        firstmate: true,
        pair: [],
        filter: initialReviewFilter(),
        sort: "created",
        group,
        page,
        pageItems: 1,
        configured: true,
      }).entries.map((entry) =>
        entry.kind === "group" ? `# ${entry.label} (${entry.count})` : entry.row.label,
      );
    expect(view("none", 0)).toEqual(["decision: one"]);
    expect(view("task", 1)).toEqual(["# BU-1: first (2)", "blocker: two"]);
  });
});

describe("whose items the Review view lists (T-2C.6, D-38)", () => {
  const held = item("held here");
  const owned = item("owned", {
    session: "kg-ec2-1@sem-kg-ec2",
    task: "BU-1",
    issue: issue("BU-1", { assignee: "aih-ec2-3" }),
  });
  const neither = item("neither", { session: "kg-ec2-1@sem-kg-ec2" });
  const sameNameOtherHost = item("same name, other host", { session: "aih-ec2-3@acn-mac" });
  const items = [held, owned, neither, sameNameOtherHost];

  test("should list the items a session holds and those about issues it owns, and no other, on mine", () => {
    expect(
      names(scopedItems(items, { session: "aih-ec2-3", host: "sem-kg-ec2", scope: "mine" })),
    ).toEqual(["held here", "owned"]);
  });

  test("should list every item on pair", () => {
    expect(
      names(scopedItems(items, { session: "aih-ec2-3", host: "sem-kg-ec2", scope: "pair" })),
    ).toEqual(names(items));
  });

  test("should list nothing for a session with no name on mine", () => {
    expect(scopedItems(items, { session: undefined, host: "sem-kg-ec2", scope: "mine" })).toEqual(
      [],
    );
  });

  test("should keep only the items whose machine is in the snapshot's pair, or this host's when it names none", () => {
    const outside = [
      item("here"),
      item("partner", { machine: "acn-mac" }),
      item("far", { machine: "fw-lnx" }),
    ];
    expect(names(inPair(outside, { pair: ["acn-mac", "sem-kg-ec2"], host: "sem-kg-ec2" }))).toEqual(
      ["here", "partner"],
    );
    expect(names(inPair(outside, { pair: [], host: "sem-kg-ec2" }))).toEqual(["here"]);
    expect(inPair(outside, { pair: [], host: "" })).toEqual([]);
  });
});

describe("the review indicator's count (T-2C.7)", () => {
  test("should count an issue's open, current items by its bd id and its display id, oldest first", () => {
    const bu1 = issue("BU-1", { displayId: "BU-one-x" });
    const index = openReviewIndex([
      item("by display id", { task: "BU-one-x", createdAt: "2026-10-25T10:00:00Z" }),
      item("by id", { task: "BU-1", issue: bu1, createdAt: "2026-10-25T08:00:00Z" }),
      item("answered", { task: "BU-1", status: "answered" }),
      item("superseded", { task: "BU-1", selection: "superseded" }),
      item("elsewhere", { task: "BU-2" }),
    ]);
    expect(names(openItemsOf(index, { id: "BU-1", displayId: "BU-one-x" }))).toEqual([
      "by id",
      "by display id",
    ]);
    expect(openItemsOf(index, { id: "BU-3" })).toEqual([]);
  });
});
