// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  boardRow,
  GLYPHS,
  gutterColumns,
  gutterOf,
  gutterText,
  INDICATORS,
  type Indicator,
  IndicatorRegistry,
  type Issue,
  indicatorRead,
  legendOf,
  NARROW_GUTTER_COLUMNS,
  openReviewIndex,
  parseBdList,
  type ReviewItem,
  resolveGlyphs,
  withIndicatorsTable,
} from "../src/index.ts";
import { unwrap } from "./helpers.ts";

// D-41, D-42 and T-2C.3: the row indicator registry, its blocked and agent entries, and the gutter.

const issue = (id: string, fields: Partial<Issue> = {}): Issue => ({
  id,
  title: `${id} title`,
  status: "open",
  priority: 2,
  type: "task",
  labels: [],
  dependencies: [],
  createdAt: "2026-10-25T00:00:00Z",
  updatedAt: "2026-10-25T00:00:00Z",
  metadata: {},
  ...fields,
});

const enabled = INDICATORS.enabled({});
const at = (target: Issue, issues: readonly Issue[], live?: ReadonlySet<string>, columns = 120) =>
  gutterOf({ issue: target, read: indicatorRead([target, ...issues]), live }, enabled, columns);
const shown = (cells: ReturnType<typeof at>) =>
  cells.map((cell) => (cell.id === undefined ? "-" : `${cell.id}${cell.dim ? ":dim" : ""}`));

describe("the row indicator registry (D-41, T-2C.3)", () => {
  test("should list agent, blocked and review in that order, every one built", () => {
    expect(INDICATORS.all().map((entry) => entry.id)).toEqual(["agent", "blocked", "review"]);
    expect(INDICATORS.built().map((entry) => entry.id)).toEqual(["agent", "blocked", "review"]);
    for (const entry of INDICATORS.all()) expect(GLYPHS[entry.glyph].kind).toBe("indicator");
  });

  test("should drop an indicator from the gutter when [indicators] switches it off", () => {
    const switches = resolveGlyphs("[indicators]\nagent = false\n").switches;
    expect(INDICATORS.enabled(switches).map((entry) => entry.id)).toEqual(["blocked", "review"]);
  });

  test("should name a non-boolean switch and keep that indicator on", () => {
    const read = resolveGlyphs('[indicators]\nblocked = "no"\n');
    expect(read.switches).toEqual({});
    expect(read.problems).toEqual(["indicators.blocked must be true or false; drawing it"]);
  });

  test("should write ascii and every switch into [indicators] and keep the other tables", () => {
    const text = withIndicatorsTable("[panel]\nshown = 5\n", true, { agent: false, blocked: true });
    expect(text).toBe(
      "[panel]\nshown = 5\n\n[indicators]\nascii = true\nagent = false\nblocked = true\n",
    );
    expect(resolveGlyphs(text)).toEqual({
      ascii: true,
      switches: { agent: false, blocked: true },
      problems: [],
    });
  });

  test("should draw an added entry in the gutter and the legend with no other change", () => {
    const registry = new IndicatorRegistry(INDICATORS.all());
    const p0: Indicator = {
      id: "urgent",
      glyph: "view.board",
      token: "priority.p0",
      label: "priority 0",
      detect: ({ issue: one }) => (one.priority === 0 ? "on" : undefined),
    };
    const remove = registry.register(p0);
    const target = issue("BU-1", { priority: 0 });
    const cells = gutterOf(
      { issue: target, read: indicatorRead([target]), live: undefined },
      registry.enabled({}),
      120,
    );
    expect(shown(cells)).toEqual(["-", "-", "-", "urgent"]);
    expect(legendOf(registry.built()).map((line) => line.id)).toEqual([
      "agent",
      "blocked",
      "review",
      "urgent",
    ]);
    remove();
    expect(registry.built().map((entry) => entry.id)).toEqual(["agent", "blocked", "review"]);
  });
});

describe("the blocked indicator (T-2C.3)", () => {
  test("should show when the issue's status is blocked", () => {
    expect(shown(at(issue("BU-1", { status: "blocked" }), []))).toEqual(["-", "blocked", "-"]);
  });

  test("should show when an open issue blocks it through a blocks dependency", () => {
    const blocker = issue("BU-2", { status: "in_progress" });
    const target = issue("BU-1", { dependencies: [{ type: "blocks", id: "BU-2" }] });
    expect(shown(at(target, [blocker]))).toEqual(["-", "blocked", "-"]);
  });

  test("should not show when the blocking issue is closed or outside the read", () => {
    const closed = issue("BU-2", { status: "closed" });
    const target = issue("BU-1", {
      dependencies: [
        { type: "blocks", id: "BU-2" },
        { type: "blocks", id: "BU-9" },
        { type: "parent-child", id: "BU-3" },
      ],
    });
    expect(shown(at(target, [closed, issue("BU-3")]))).toEqual(["-", "-", "-"]);
  });

  test("should read a board snapshot row's blocks dependency, the snapshot keeping no other kind", () => {
    const row = boardRow({
      id: "BU-1",
      title: "t",
      status: "open",
      priority: 1,
      issue_type: "task",
      created_at: "2026-10-25T00:00:00Z",
      updated_at: "2026-10-25T00:00:00Z",
      dependencies: [
        { issue_id: "BU-1", depends_on_id: "BU-0", type: "parent-child", created_at: "x" },
        { issue_id: "BU-1", depends_on_id: "BU-2", type: "blocks", created_at: "x" },
      ],
    });
    expect(row?.dependencies).toEqual([{ depends_on_id: "BU-2", type: "blocks" }]);
    const [target] = unwrap(parseBdList(JSON.stringify([row])));
    if (target === undefined) throw new Error("no row");
    expect(shown(at(target, [issue("BU-2")]))).toEqual(["-", "blocked", "-"]);
  });
});

describe("the agent indicator (D-42, T-2C.3)", () => {
  const agentRow = (id: string, fields: Partial<Issue>) =>
    issue(id, { parent: "BU-1", status: "in_progress", assignee: "ops-vm-3", ...fields });

  test("should show when an in-progress child carries the agent label", () => {
    const child = agentRow("BU-1.1", { title: "a plain title", labels: ["agent"] });
    expect(shown(at(issue("BU-1"), [child], new Set(["ops-vm-3"])))).toEqual(["agent", "-", "-"]);
  });

  test("should show when an in-progress child's title names an agent or a coordinator agent", () => {
    for (const title of ["bu-row agent: the gutter", "bu-review coordinator agent: review items"]) {
      const child = agentRow("BU-1.1", { title });
      expect(shown(at(issue("BU-1"), [child], new Set(["ops-vm-3"]))), title).toEqual([
        "agent",
        "-",
        "-",
      ]);
    }
  });

  test("should show on the agent row itself while it is in progress", () => {
    const row = agentRow("BU-1.1", { labels: ["agent"] });
    expect(shown(at(row, [], new Set(["ops-vm-3"])))).toEqual(["agent", "-", "-"]);
  });

  test("should not show for a closed agent row, a title that only mentions an agent, or a grandchild", () => {
    const closed = agentRow("BU-1.1", { labels: ["agent"], status: "closed" });
    const mention = agentRow("BU-1.2", { title: "Agent Mail: the agent-process ledger" });
    const grandchild = agentRow("BU-1.3.1", { labels: ["agent"], parent: "BU-1.3" });
    expect(shown(at(issue("BU-1"), [closed, mention, grandchild], new Set(["ops-vm-3"])))).toEqual([
      "-",
      "-",
      "-",
    ]);
  });

  test("should dim the glyph when the row's assignee is not live in the session registry", () => {
    const child = agentRow("BU-1.1", { labels: ["agent"], assignee: "aih-gone" });
    expect(shown(at(issue("BU-1"), [child], new Set(["ops-vm-3"])))).toEqual([
      "agent:dim",
      "-",
      "-",
    ]);
    const unassigned = issue("BU-1.1", {
      parent: "BU-1",
      status: "in_progress",
      labels: ["agent"],
    });
    expect(shown(at(issue("BU-1"), [unassigned], new Set(["ops-vm-3"])))).toEqual([
      "agent:dim",
      "-",
      "-",
    ]);
  });

  test("should draw the glyph undimmed when no session registry was read", () => {
    const child = agentRow("BU-1.1", { labels: ["agent"], assignee: "aih-gone" });
    expect(shown(at(issue("BU-1"), [child], undefined))).toEqual(["agent", "-", "-"]);
  });
});

describe("the gutter (D-41, T-2C.3)", () => {
  test("should give every row one cell per enabled indicator, blank or glyph, so rows align", () => {
    const blocked = at(issue("BU-1", { status: "blocked" }), []);
    const none = at(issue("BU-2"), []);
    expect(blocked.length).toBe(enabled.length);
    expect(none.length).toBe(enabled.length);
    expect(gutterText(blocked)).toBe(` ${GLYPHS["indicator.blocked"].glyph} `);
    expect(gutterText(none)).toBe("   ");
    expect(gutterColumns(enabled, 120)).toBe(enabled.length + 1);
  });

  test("should draw one cell below 48 columns, the first indicator in registry order that fires", () => {
    const child = issue("BU-1.1", {
      parent: "BU-1",
      status: "in_progress",
      labels: ["agent"],
      assignee: "ops-vm-3",
    });
    const both = issue("BU-1", { status: "blocked" });
    const narrow = NARROW_GUTTER_COLUMNS - 1;
    expect(shown(at(both, [child], new Set(["ops-vm-3"]), narrow))).toEqual(["agent"]);
    expect(shown(at(issue("BU-2", { status: "blocked" }), [], undefined, narrow))).toEqual([
      "blocked",
    ]);
    expect(shown(at(issue("BU-3"), [], undefined, narrow))).toEqual(["-"]);
    expect(gutterColumns(enabled, narrow)).toBe(2);
    expect(shown(at(both, [child], new Set(["ops-vm-3"]), NARROW_GUTTER_COLUMNS))).toEqual([
      "agent",
      "blocked",
      "-",
    ]);
  });

  test("should take no columns when every indicator is switched off", () => {
    const none = INDICATORS.enabled({ agent: false, blocked: false, review: false });
    expect(gutterColumns(none, 120)).toBe(0);
    expect(
      gutterOf({ issue: issue("BU-1"), read: indicatorRead([]), live: undefined }, none, 40),
    ).toEqual([]);
  });

  test("should give each legend line its glyph, its ASCII form and its meaning", () => {
    expect(legendOf(INDICATORS.built())).toEqual([
      {
        id: "agent",
        glyph: "⟳",
        ascii: "*",
        label: "an agent is working on it; dimmed when its session is not live on this host",
      },
      { id: "blocked", glyph: "⊘", ascii: "!", label: "blocked, or an open issue blocks it" },
      {
        id: "review",
        glyph: "✎",
        ascii: "?",
        label: "an open, current review item is about it: a held decision, blocker or question",
      },
    ]);
  });
});

describe("the review indicator (T-2C.7)", () => {
  const item = (task: string, extra: Partial<ReviewItem> = {}): ReviewItem => ({
    path: `/p/docs/held/host-c--ops-vm-3/${task}-${extra.title ?? "x"}.md`,
    store: "ai-harness",
    relpath: "",
    kind: "decision",
    status: "open",
    session: "ops-vm-3@host-c",
    machine: "host-c",
    task,
    title: "x",
    ask: "",
    createdAt: "2026-10-25T09:00:00Z",
    selection: "current",
    ...extra,
  });
  const reviewed = (target: Issue, items: readonly ReviewItem[]) =>
    shown(
      gutterOf(
        {
          issue: target,
          read: indicatorRead([target]),
          live: undefined,
          review: openReviewIndex(items),
        },
        enabled,
        120,
      ),
    );

  test("should show when an open, current review item names the issue by its bd id or its display id", () => {
    expect(reviewed(issue("BU-1"), [item("BU-1")])).toEqual(["-", "-", "review"]);
    expect(reviewed(issue("BU-1", { displayId: "BU-one-x" }), [item("BU-one-x")])).toEqual([
      "-",
      "-",
      "review",
    ]);
  });

  test("should not show for an answered, superseded, escalated or ai-resolved item, or one about another issue", () => {
    const items = [
      item("BU-1", { status: "answered", title: "a" }),
      item("BU-1", { selection: "superseded", title: "b" }),
      item("BU-1", { selection: "escalated", title: "c" }),
      item("BU-1", { selection: "ai-resolved", title: "d" }),
      item("BU-2", { title: "e" }),
    ];
    expect(reviewed(issue("BU-1"), items)).toEqual(["-", "-", "-"]);
  });

  test("should not show while no review snapshot was read", () => {
    expect(shown(at(issue("BU-1"), []))).toEqual(["-", "-", "-"]);
  });
});
