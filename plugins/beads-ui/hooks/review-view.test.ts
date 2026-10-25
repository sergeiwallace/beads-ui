import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { REVIEW_FILTER_KEYS } from "../core/src/index.ts";
import { ISSUE_KEY, REVIEW_FILTER_KEY, reviewItemKey } from "./components/review.ts";
import { OVERVIEW_KEY } from "./levels.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { ME } from "./tests/mine.ts";
import { render } from "./tests/render.ts";
import {
  BAND_PROPS,
  CWD,
  countScript,
  INVENTORY_PATH,
  inventoryOf,
  type Listed,
  listRowsOf,
  listScript,
  ok,
  PANE_PROPS,
  REFRESHER_TOKEN,
  type Script,
  SESSION,
  SHOW,
  START_MS,
  STATE_DIR,
  STORE_LIST,
  VIEWPORT,
  world,
} from "./tests/world.ts";

// T-2C.6 and T-2C.7 (D-38, D-40, D-41): the Review view in the pane (key 7) and the band's
// overview, its scope, filter, sorts and groups, and the review indicator on task rows, at the
// hooks entry point. A host refresher is played running, its review snapshot written under its
// token; the held store's command is a stub argv the world answers.

const PYTHON = "/opt/fleet/.venv/bin/python";
const HELD = "/opt/fleet/scripts/held_cli.py";
const CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";
const REVIEW_CONFIG = `[review]\ncommand = ["${PYTHON}", "${HELD}", "review", "--scope", "pair", "--json"]\n`;
const SNAPSHOT = `${STATE_DIR}/review-${REFRESHER_TOKEN}.json`;
const HARNESS = "/home/me/projects/ai-harness";
const FM = "aih-ec2-firstmate-1";
const REVIEW_GLYPH = "✎";

const TASKS: readonly Listed[] = [
  { id: "BU-1", status: "in_progress", assignee: ME, priority: 1, title: "the reviewed work" },
  { id: "BU-2", status: "open", assignee: ME, priority: 2, title: "nothing to review" },
  { id: "BU-3", status: "open", assignee: "kg-ec2-1", priority: 2, title: "someone else's" },
  { id: "BU-9", status: "open", assignee: ME, priority: 1, title: "the epic" },
];

const joined = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: TASKS.find((one) => one.id === id)?.title ?? id,
  status: "open",
  priority: 2,
  labels: [],
  updatedAt: "2026-10-24T00:00:00Z",
  store: CWD,
  ...extra,
});

const held = (dir: string, file: string, extra: Record<string, unknown>) => ({
  path: `${HARNESS}/docs/held/${dir}/${file}`,
  store: "ai-harness",
  relpath: `docs/held/${dir}/${file}`,
  kind: "decision",
  status: "open",
  session: `${ME}@sem-kg-ec2`,
  machine: "sem-kg-ec2",
  task: "none",
  title: file,
  ask: "",
  createdAt: "2026-10-25T09:00:00Z",
  selection: "current",
  ...extra,
});

/** Held by this session, about no task. */
const MINE_HELD = held("sem-kg-ec2--aih-ec2-3", "a-mine.md", {
  title: "my own decision",
  ask: "Pick (a) or (b).",
  createdAt: "2026-10-25T09:00:00Z",
});
/** Held by another session, about an issue this session owns. */
const OWNED = held("sem-kg-ec2--kg-ec2-1", "b-owned.md", {
  kind: "blocker",
  session: "kg-ec2-1@sem-kg-ec2",
  task: "BU-1",
  title: "a blocker on my issue",
  ask: "Approve the space request.",
  createdAt: "2026-10-25T10:00:00Z",
  issue: joined("BU-1", { assignee: ME, priority: 1, parent: "BU-9", labels: ["ux"] }),
});
/** Held by another session, about an issue it owns: neither held nor owned here. */
const THEIRS = held("sem-kg-ec2--kg-ec2-1", "c-theirs.md", {
  session: "kg-ec2-1@sem-kg-ec2",
  task: "BU-3",
  title: "someone else's decision",
  createdAt: "2026-10-25T08:00:00Z",
  issue: joined("BU-3", { assignee: "kg-ec2-1" }),
});
/** On the pair's other host. */
const PARTNER = held("acn-mac--aih-3", "d-partner.md", {
  session: "aih-3@acn-mac",
  machine: "acn-mac",
  title: "the partner host's question",
  createdAt: "2026-10-25T07:00:00Z",
});
/** Outside the pair: every other field would put it in this session's list and on BU-1's row. */
const OUTSIDE = held("fw-lnx--aih-ec2-3", "e-outside.md", {
  machine: "fw-lnx",
  task: "BU-1",
  title: "an item from outside the pair",
  createdAt: "2026-10-25T11:00:00Z",
  issue: joined("BU-1", { assignee: ME }),
});
const OLD = held("sem-kg-ec2--aih-ec2-3", "f-old.md", {
  kind: "summary",
  title: "an old summary",
  selection: "superseded",
  createdAt: "2026-10-25T06:00:00Z",
});
const ANSWERED = held("sem-kg-ec2--aih-ec2-3", "g-answered.md", {
  title: "an answered decision",
  status: "answered",
  createdAt: "2026-10-25T05:00:00Z",
  answeredAt: "2026-10-25T12:00:00Z",
});
const ITEMS = [MINE_HELD, OWNED, THEIRS, PARTNER, OUTSIDE, OLD, ANSWERED];

const rowOf = (item: { relpath: string }) => item.relpath.split("/").slice(-2).join("/");

const snapshotOf = (items: readonly unknown[]) =>
  JSON.stringify({
    schema: 1,
    token: REFRESHER_TOKEN,
    readAt: START_MS - 30_000,
    checkedAt: START_MS - 30_000,
    fingerprint: "fp-1",
    host: "sem-kg-ec2",
    pair: ["acn-mac", "sem-kg-ec2"],
    scope: "pair",
    items,
    joins: [],
  });

const BODY = "## the item\n\nIts body.\n";
const isHeld = (argv: readonly string[], verb: string) =>
  argv[0] === PYTHON && argv[1] === HELD && argv[2] === verb;

const SCRIPT: Script = (key, argv, cwd) => {
  if (isHeld(argv, "show"))
    return ok(JSON.stringify({ path: argv[3], frontmatter: {}, body: BODY }));
  if (key === STORE_LIST) return ok(JSON.stringify(listRowsOf(TASKS)));
  if (key.startsWith("bd show ")) {
    const id = argv[2];
    return ok(JSON.stringify(listRowsOf(TASKS.filter((one) => one.id === id))));
  }
  return (
    listScript({ [CWD]: TASKS })(key, argv, cwd) ?? countScript({ [CWD]: TASKS })(key, argv, cwd)
  );
};

async function started(
  $: Engine,
  on: On,
  options: { session?: string; config?: string; items?: readonly unknown[] } = {},
) {
  const w = world(on, {
    env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: options.session ?? ME },
    refresher: true,
    files: {
      [CONFIG]: options.config ?? REVIEW_CONFIG,
      [SNAPSHOT]: snapshotOf(options.items ?? ITEMS),
      [INVENTORY_PATH]: inventoryOf({ BU: { repo: CWD } }),
    },
    script: SCRIPT,
  });
  await $.session.start(SESSION);
  await w.clock.settle();
  return w;
}

type Clock = { clock: { settle: () => Promise<unknown> } };

const mountPane = ($: Engine, surface: "terminal" | "vscode" = "terminal") =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface,
    component: "Pane",
    props: PANE_PROPS,
    requestId: PANE_ID,
    viewport: VIEWPORT,
  });

/** The pane open on the Review view, reached by its key, 7. */
async function reviewPane($: Engine, w: Clock) {
  await $.command.run(SHOW);
  await w.clock.settle();
  const ui = await mountPane($);
  await ui.press({ key: "tab:review" });
  await w.clock.settle();
  return ui;
}

type Mounted = Awaited<ReturnType<typeof mountPane>>;

/** The items the Review view draws, in order, by their row key. */
const listed = async (ui: { findAll: Mounted["findAll"] }) =>
  (await ui.findAll({}))
    .map((element) => element.key ?? "")
    .filter((key) => key.startsWith("review-item:"))
    .map((key) => key.slice("review-item:".length));

const textOf = async (ui: Mounted, key: string) => (await ui.find({ key }))?.text;

async function filter(ui: Mounted, w: Clock, text: string) {
  await ui.input({ key: REVIEW_FILTER_KEY, text });
  await w.clock.settle();
}

describe("the Review view in the pane (T-2C.6, D-40)", () => {
  test("should be key 7 in the pane's nav", async ($, on) => {
    const w = await started($, on);
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await mountPane($);

    const tab = await ui.find({ key: "tab:review" });
    expect(tab?.props.hotkey).toBe("7");
    expect(tab?.props.label).toBe("Review");
  });

  test("should list a non-firstmate's held items and the items about issues it owns, open and current, and no other (D-38)", async ($, on) => {
    const w = await started($, on);
    const ui = await reviewPane($, w);

    expect(await listed(ui)).toEqual([rowOf(OWNED), rowOf(MINE_HELD)]);
    expect(await textOf(ui, "review-view:heading")).toContain(
      "Review: 2 of 4 items, this session's own",
    );
    expect(await ui.find({ key: "review:scope" })).toBeUndefined();
    expect((await ui.find({ key: REVIEW_FILTER_KEY }))?.props.value).toBe(
      "status:open selection:current",
    );
  });

  test("should list a non-firstmate's own superseded and answered items once the filter lets them through, and still none it neither holds nor owns", async ($, on) => {
    const w = await started($, on);
    const ui = await reviewPane($, w);

    await filter(ui, w, "selection:all");

    expect((await listed(ui)).sort()).toEqual(
      [rowOf(OWNED), rowOf(MINE_HELD), rowOf(OLD), rowOf(ANSWERED)].sort(),
    );
  });

  test("should list every item of the pair for the firstmate, and switch to its own and back with a", async ($, on) => {
    const own = held("sem-kg-ec2--aih-ec2-firstmate-1", "h-fm.md", {
      session: `${FM}@sem-kg-ec2`,
      title: "the firstmate's own",
      createdAt: "2026-10-25T04:00:00Z",
    });
    const w = await started($, on, { session: FM, items: [...ITEMS, own] });
    const ui = await reviewPane($, w);

    expect(await listed(ui)).toEqual([
      rowOf(OWNED),
      rowOf(MINE_HELD),
      rowOf(THEIRS),
      rowOf(PARTNER),
      rowOf(own),
    ]);
    expect(await textOf(ui, "review-view:heading")).toContain(
      "Review: 5 of 7 items, the pair's (acn-mac, sem-kg-ec2)",
    );
    const scope = await ui.find({ key: "review:scope" });
    expect(scope?.props.hotkey).toBe("a");
    expect(scope?.props.label).toBe("Showing: the pair's");

    await ui.press({ key: "review:scope" });
    await w.clock.settle();
    expect(await listed(ui)).toEqual([rowOf(own)]);
    expect((await ui.find({ key: "review:scope" }))?.props.label).toBe("Showing: mine");

    await ui.press({ key: "review:scope" });
    await w.clock.settle();
    expect(await listed(ui)).toHaveLength(5);
  });

  test("should draw no item from outside the snapshot's pair in the Review view, an issue's Detail or a row's indicator (D-38)", async ($, on) => {
    const w = await started($, on, { session: FM, items: [OUTSIDE] });
    const ui = await reviewPane($, w);

    await filter(ui, w, "selection:all");
    expect(await listed(ui)).toEqual([]);
    expect(await textOf(ui, "review-view:empty")).toBe("No held item in the pair.");

    await ui.press({ key: "tab:tasks" });
    await w.clock.settle();
    const desktop = await mountPane($, "vscode");
    const rows = render(await desktop.drawn(), 118);
    expect(rows.find((one) => one.includes("BU-1 "))).toBeDefined();
    expect(rows.join("\n")).not.toContain(REVIEW_GLYPH);

    await desktop.press({ key: "task:BU-1" });
    await w.clock.settle();
    expect(await desktop.find({ key: "detail-heading" })).toBeDefined();
    expect(
      (await desktop.findAll({})).some((element) => (element.key ?? "").includes("e-outside")),
    ).toBe(false);
  });

  test("should say how to set the command while [review] command is unset", async ($, on) => {
    const w = await started($, on, { config: '[sync]\ncommand = ["publish"]\n' });
    const ui = await reviewPane($, w);

    expect(await listed(ui)).toEqual([]);
    expect(await textOf(ui, "review-view:unset")).toBe(
      'Held items are not read: set [review] command in your own beads-ui.toml, such as command = ["held_cli.py"].',
    );
    expect(w.runs.some((argv) => argv[0] === PYTHON)).toBe(false);
  });
});

describe("the Review view's filter, sorts and groups at the entry point (T-2C.6)", () => {
  /** The firstmate's view, so every pair item is in scope. */
  async function all($: Engine, on: On) {
    const w = await started($, on, { session: FM });
    return { w, ui: await reviewPane($, w) };
  }

  const cases: [string, string[]][] = [
    ["kind:blocker", [rowOf(OWNED)]],
    ["status:answered selection:all", [rowOf(ANSWERED)]],
    ["selection:superseded status:open", [rowOf(OLD)]],
    ["session:kg-ec2-1", [rowOf(OWNED), rowOf(THEIRS)]],
    ["machine:acn-mac", [rowOf(PARTNER)]],
    ["task:BU-1", [rowOf(OWNED)]],
    ["epic:BU-9", [rowOf(OWNED)]],
    ["label:ux", [rowOf(OWNED)]],
    ["priority:P1", [rowOf(OWNED)]],
    ["space approve", [rowOf(OWNED)]],
  ];
  for (const [text, expected] of cases) {
    test(`should keep only the matching items when the filter is "${text}"`, async ($, on) => {
      const { w, ui } = await all($, on);
      await filter(ui, w, text);
      expect(await listed(ui)).toEqual(expected);
    });
  }

  test("should keep the previous filter and name the accepted keys when a key is unknown", async ($, on) => {
    const { w, ui } = await all($, on);
    await filter(ui, w, "kind:blocker");

    await filter(ui, w, "owner:me");

    expect(await listed(ui)).toEqual([rowOf(OWNED)]);
    expect(await textOf(ui, "review-view:filter-error")).toBe(
      `unknown filter key "owner", so the previous filter is kept; accepted keys: ${REVIEW_FILTER_KEYS.join(", ")}, and free text`,
    );
  });

  test("should step through every sort with o, label updated by the time it orders by, and order the list by each", async ($, on) => {
    const { w, ui } = await all($, on);
    const sortLabel = async () => (await ui.find({ key: "review:sort" }))?.props.label;
    expect((await ui.find({ key: "review:sort" }))?.props.hotkey).toBe("o");

    const seen: [unknown, string[]][] = [];
    for (let i = 0; i < 7; i++) {
      seen.push([await sortLabel(), await listed(ui)]);
      await ui.press({ key: "review:sort" });
      await w.clock.settle();
    }

    expect(seen).toEqual([
      [
        "Sort: updated (answered, else held)",
        [rowOf(OWNED), rowOf(MINE_HELD), rowOf(THEIRS), rowOf(PARTNER)],
      ],
      ["Sort: created (held)", [rowOf(OWNED), rowOf(MINE_HELD), rowOf(THEIRS), rowOf(PARTNER)]],
      ["Sort: priority", [rowOf(OWNED), rowOf(THEIRS), rowOf(MINE_HELD), rowOf(PARTNER)]],
      ["Sort: task", [rowOf(OWNED), rowOf(THEIRS), rowOf(MINE_HELD), rowOf(PARTNER)]],
      ["Sort: epic", [rowOf(OWNED), rowOf(MINE_HELD), rowOf(THEIRS), rowOf(PARTNER)]],
      ["Sort: kind", [rowOf(OWNED), rowOf(MINE_HELD), rowOf(THEIRS), rowOf(PARTNER)]],
      ["Sort: session", [rowOf(PARTNER), rowOf(MINE_HELD), rowOf(OWNED), rowOf(THEIRS)]],
    ]);
    expect(await sortLabel()).toBe("Sort: updated (answered, else held)");
  });

  test("should draw a header with its count per group when grouping by task, epic, kind and session with s", async ($, on) => {
    const { w, ui } = await all($, on);
    expect((await ui.find({ key: "review:group" }))?.props.hotkey).toBe("s");
    const headers = async () =>
      (await ui.findAll({}))
        .filter((element) => (element.key ?? "").startsWith("review-group:"))
        .map((element) => element.text);

    const seen: [unknown, unknown[]][] = [];
    for (let i = 0; i < 5; i++) {
      seen.push([(await ui.find({ key: "review:group" }))?.props.label, await headers()]);
      await ui.press({ key: "review:group" });
      await w.clock.settle();
    }

    expect(seen).toEqual([
      ["Group: none", []],
      ["Group: task", ["BU-1: the reviewed work (1)", "no task (2)", "BU-3: someone else's (1)"]],
      ["Group: epic", ["BU-9: the epic (1)", "no epic (3)"]],
      ["Group: kind", ["blocker (1)", "decision (3)"]],
      [
        "Group: session",
        ["kg-ec2-1@sem-kg-ec2 (2)", "aih-ec2-3@sem-kg-ec2 (1)", "aih-3@acn-mac (1)"],
      ],
    ]);
  });
});

describe("the Review view's pages and keys (T-2C.6, T-2B.4)", () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    held("sem-kg-ec2--aih-ec2-firstmate-1", `m-${String(i).padStart(2, "0")}.md`, {
      session: `${FM}@sem-kg-ec2`,
      title: `item ${i}`,
      createdAt: new Date(Date.UTC(2026, 9, 25, 0, i)).toISOString(),
    }),
  );

  test("should page the list and list in the options menu every key it draws, the firstmate's a and the pager's p and b included", async ($, on) => {
    const w = await started($, on, { session: FM, items: many });
    const ui = await reviewPane($, w);

    expect(await listed(ui)).toHaveLength(25);
    expect(await textOf(ui, "review-view:pages")).toContain("page 1 of 2");
    await ui.press({ key: "review:later" });
    await w.clock.settle();
    expect(await listed(ui)).toHaveLength(5);
    expect(JSON.stringify(await ui.drawn()).length).toBeLessThan(100_000);

    const drawn = (await ui.findAll({ type: "Button" }))
      .filter((button) => !(button.key ?? "").startsWith("menu:"))
      .map((button) => button.props.hotkey)
      .filter((key): key is string => typeof key === "string");
    await ui.press({ key: "menu" });
    const menu = (await ui.findAll({ type: "Button" }))
      .map((button) => button.key ?? "")
      .filter((key) => key.startsWith("menu:item:"))
      .map((key) => key.slice("menu:item:".length));
    for (const command of ["view.scope", "view.sort", "board.swimlane", "page.next", "page.back"]) {
      expect(menu, command).toContain(command);
    }
    for (const key of ["a", "o", "s", "p", "b"]) expect(drawn, key).toContain(key);
  });
});

describe("opening an item from the Review view (T-2C.6)", () => {
  test("should show the item in the reader of T-2C.5, and Go to issue should open its issue's Detail", async ($, on) => {
    const w = await started($, on);
    const ui = await reviewPane($, w);

    await ui.press({ key: reviewItemKey(rowOf(OWNED)) });
    await w.clock.settle();

    expect(await textOf(ui, "reader-title")).toBe("blocker: a blocker on my issue");
    expect(w.runs.filter((argv) => isHeld(argv, "show"))).toEqual([
      [PYTHON, HELD, "show", OWNED.path, "--json"],
    ]);
    expect((await ui.find({ key: "tab:review" }))?.props.dimColor).toBeUndefined();

    await ui.press({ key: ISSUE_KEY });
    await w.clock.settle();
    expect(await ui.find({ key: "reader" })).toBeUndefined();
    expect(await textOf(ui, "detail-heading")).toContain("BU-1");
  });

  test("should close the reader back onto the Review view's list", async ($, on) => {
    const w = await started($, on);
    const ui = await reviewPane($, w);
    await ui.press({ key: reviewItemKey(rowOf(MINE_HELD)) });
    await w.clock.settle();

    await ui.press({ key: "reader:close" });
    await w.clock.settle();

    expect(await ui.find({ key: "reader" })).toBeUndefined();
    expect(await listed(ui)).toEqual([rowOf(OWNED), rowOf(MINE_HELD)]);
  });
});

describe("the Review view in the band's overview (T-2C.6, D-35)", () => {
  const band = ($: Engine, maxRows = 14) =>
    $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "AbovePrompt",
      props: { ...BAND_PROPS, maxRows },
      viewport: VIEWPORT,
    });

  test("should draw the same list, filter and sort controls through the shared components, within maxRows, and open an item in the pane's reader", async ($, on) => {
    const w = await started($, on, { session: FM });
    await (await band($)).press({ key: OVERVIEW_KEY });
    await w.clock.settle();
    await (await band($)).press({ key: "tab:review" });
    await w.clock.settle();

    const shown = await band($);
    expect(await listed(shown)).toEqual([
      rowOf(OWNED),
      rowOf(MINE_HELD),
      rowOf(THEIRS),
      rowOf(PARTNER),
    ]);
    for (const key of ["review:scope", "review:sort", "review:group", REVIEW_FILTER_KEY]) {
      expect(await shown.find({ key }), key).toBeDefined();
    }
    expect((await shown.find({ key: "review:sort" }))?.props.hotkey).toBeUndefined();
    expect(render(await shown.drawn(), 120).length).toBeLessThanOrEqual(14);

    await shown.press({ key: "review:sort" });
    await w.clock.settle();
    expect((await (await band($)).find({ key: "review:sort" }))?.props.label).toBe(
      "Sort: created (held)",
    );

    await (await band($)).press({ key: reviewItemKey(rowOf(OWNED)) });
    await w.clock.settle();
    const pane = await mountPane($);
    expect(await textOf(pane, "reader-title")).toBe("blocker: a blocker on my issue");
  });

  test("should list only a non-firstmate's own items on the band too (D-38)", async ($, on) => {
    const w = await started($, on);
    await (await band($)).press({ key: OVERVIEW_KEY });
    await w.clock.settle();
    await (await band($)).press({ key: "tab:review" });
    await w.clock.settle();

    expect(await listed(await band($))).toEqual([rowOf(OWNED), rowOf(MINE_HELD)]);
  });
});

describe("the review indicator (T-2C.7, D-41)", () => {
  test("should show on the rows of an issue with an open, current review item, and on no other", async ($, on) => {
    const w = await started($, on);
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await mountPane($, "vscode");

    const rows = render(await ui.drawn(), 118);
    expect(rows.find((one) => one.includes("BU-1 "))).toContain(REVIEW_GLYPH);
    expect(rows.find((one) => one.includes("BU-2 "))).toBeDefined();
    expect(rows.find((one) => one.includes("BU-2 "))).not.toContain(REVIEW_GLYPH);
  });

  test("should show on the band's rows too", async ($, on) => {
    const w = await started($, on);
    const band = () =>
      $.ui.mount({
        plugin: PLUGIN_NAME,
        surface: "terminal",
        component: "AbovePrompt",
        props: { ...BAND_PROPS, maxRows: 10 },
        viewport: VIEWPORT,
      });
    await $.command.run(SHOW);
    await w.clock.settle();
    await (await band()).press({ key: "band:expand" });
    await w.clock.settle();

    const rows = render(await (await band()).drawn(), 120);
    expect(rows.find((one) => one.includes("BU-1 "))).toContain(REVIEW_GLYPH);
    expect(rows.find((one) => one.includes("BU-2 "))).not.toContain(REVIEW_GLYPH);
  });

  test("should name the count in the row's options menu and open the first item in the reader", async ($, on) => {
    const second = held("sem-kg-ec2--aih-ec2-3", "i-second.md", {
      task: "BU-1",
      title: "a second item on BU-1",
      createdAt: "2026-10-25T11:30:00Z",
      issue: joined("BU-1", { assignee: ME }),
    });
    const w = await started($, on, { items: [...ITEMS, second] });
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await mountPane($, "vscode");

    await ui.press({ key: "taskmenu:BU-1" });
    await w.clock.settle();
    const item = await ui.find({ key: "menu:item:card.review" });
    expect(item?.props.label).toBe("Review items: 2 open, current; open the first");

    await ui.press({ key: "menu:item:card.review" });
    await w.clock.settle();
    expect(await textOf(ui, "reader-title")).toBe("blocker: a blocker on my issue");

    await ui.press({ key: "reader:close" });
    await w.clock.settle();
    expect(await textOf(ui, "detail-heading")).toContain("BU-1");

    await ui.press({ key: "tab:tasks" });
    await ui.press({ key: "taskmenu:BU-2" });
    await w.clock.settle();
    expect(await ui.find({ key: "menu:item:card.review" })).toBeUndefined();
  });

  test("should draw its glyph, ASCII form and meaning in the legend and switch it in Settings", async ($, on) => {
    const w = await started($, on);
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await mountPane($);

    await ui.press({ key: "help" });
    expect((await ui.find({ key: "help", type: "Box" }))?.text).toContain(
      `${REVIEW_GLYPH} (?) review: an open, current review item is about it`,
    );
    await ui.press({ key: "help" });
    await ui.press({ key: "tab:settings" });
    expect(await ui.find({ key: "settings:indicator:review:row" })).toBeDefined();
  });
});
