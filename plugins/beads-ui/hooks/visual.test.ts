import type { On, RenderPropsOf } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { NAV_ENTRIES, priorityToken, SPACE } from "../core/src/index.ts";
import list from "../core/test/fixtures/bd-list-all-brief.json.ts";
import { colorOf } from "./components/look.ts";
import { REVIEW_FILTER_KEY } from "./components/review.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { overflows } from "./tests/width.ts";
import {
  exit,
  ok,
  PANE_PROPS,
  SESSION,
  SHOW,
  STORE_LIST,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// T-2C.12, the pane's visual pass (D-43): framed sections, the header bar, accented Board cards,
// one spacing scale and one weight scale, hover on pressable rows, and an empty and an error
// state per view, walked over the trees the pane draws as Claude Code mounts it.

const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";
const WIDTHS = [40, 48, 64, 72, 80, 120];
const VIEWS = ["tasks", "board", "backlog", "timeline", "settings", "review"] as const;
const FED_BY_THE_BOARD = ["tasks", "board", "backlog", "timeline"] as const;

interface Drawn {
  type?: string;
  props?: Record<string, unknown>;
  hover?: Record<string, unknown>;
  children?: unknown[];
}

/** Every element node of a drawn tree, in order. */
function nodesOf(tree: unknown): Drawn[] {
  const out: Drawn[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const node = value as Drawn;
    if (typeof node.type === "string") out.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return out;
}

const nodeOf = (tree: unknown, key: string): Drawn | undefined =>
  nodesOf(tree).find((node) => node.props?.key === key);

const keyed = (tree: unknown, prefix: string): Drawn[] =>
  nodesOf(tree).filter((node) => String(node.props?.key ?? "").startsWith(prefix));

/** The text a node draws: its strings and its nested Texts' strings, in order. */
function textIn(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textIn).join("");
  if (typeof value !== "object" || value === null) return "";
  return ((value as Drawn).children ?? []).map(textIn).join("");
}

const SPACING_PROPS = [
  "gap",
  "columnGap",
  "rowGap",
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "margin",
  "marginX",
  "marginY",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
];

/** Each spacing a drawn tree sets off the spacing scale, as `<key or type> <prop>=<value>`. */
export function offScale(tree: unknown): string[] {
  const scale = new Set<unknown>(Object.values(SPACE));
  return nodesOf(tree).flatMap((node) =>
    SPACING_PROPS.filter(
      (prop) => node.props?.[prop] !== undefined && !scale.has(node.props?.[prop]),
    ).map(
      (prop) => `${String(node.props?.key ?? node.type)} ${prop}=${String(node.props?.[prop])}`,
    ),
  );
}

async function opened(
  $: Engine,
  on: On,
  options: WorldOptions = {},
  props: Partial<RenderPropsOf["Pane"]> = {},
  surface: "terminal" | "vscode" = "terminal",
) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const columns = props.bodyColumns ?? PANE_PROPS.bodyColumns;
  const ui = await $.ui.mount({
    plugin: PLUGIN_NAME,
    surface,
    component: "Pane",
    props: { ...PANE_PROPS, ...props },
    requestId: PANE_ID,
    viewport: { ...VIEWPORT, columns: Math.max(VIEWPORT.columns, columns * 2) },
  });
  return { w, ui };
}

const EMPTY: WorldOptions = { script: (key) => (key === STORE_LIST ? ok("[]") : undefined) };
/** The store with a due date on one epic, so the Timeline draws a row. */
const DATED: WorldOptions = {
  script: (key) =>
    key === STORE_LIST
      ? ok(
          JSON.stringify(
            (JSON.parse(list) as Record<string, unknown>[]).map((row) =>
              row.id === "BU-mg2" ? { ...row, due_at: "2026-12-15T00:00:00Z" } : row,
            ),
          ),
        )
      : undefined,
};
/** A Text whose own children are strings alone: the innermost Text of a line. */
const leafText = (node: Drawn) =>
  node.type === "Text" && (node.children ?? []).every((child) => typeof child === "string");
const UNREAD: WorldOptions = {
  script: (key) => (key === STORE_LIST ? exit(1, "Error: database is locked") : undefined),
};

const title = (view: string) => {
  const entry = NAV_ENTRIES.find((one) => one.view === view);
  return `${entry?.glyph} ${entry?.labels.wide}`;
};

describe("framed sections and the header bar (T-2C.12)", () => {
  test("should draw every view but the Board in a framed section titled with its glyph and name, and the Board's title over its framed cards", async ($, on) => {
    const { w, ui } = await opened($, on);

    for (const view of VIEWS) {
      await ui.press({ key: `tab:${view}` });
      const tree = await ui.drawn();
      const section = nodeOf(tree, `section:${view}`);
      expect(section, view).toBeDefined();
      expect(textIn(nodeOf(tree, `section:${view}:title`))).toBe(title(view));
      expect(section?.props?.borderStyle, view).toBe(view === "board" ? undefined : "round");
    }
    await ui.press({ key: "tab:backlog" });
    const open = keyed(await ui.drawn(), "open:")[0]?.props?.key;
    await ui.press({ key: String(open ?? "open:missing") });
    await w.clock.settle();
    expect(nodeOf(await ui.drawn(), "section:detail")?.props?.borderStyle).toBe("round");
  });

  test("should draw the views unframed and untitled where the pane is short", async ($, on) => {
    const { ui } = await opened(
      $,
      on,
      {},
      { placement: "dock", scroll: { offset: 0, bodyRows: 11 } },
    );

    await ui.press({ key: "tab:tasks" });
    const tree = await ui.drawn();

    expect(nodeOf(tree, "section:tasks")?.props?.borderStyle).toBeUndefined();
    expect(nodeOf(tree, "section:tasks:title")).toBeUndefined();
  });

  test("should draw the views titled but unframed in the narrow tier, below 48 columns", async ($, on) => {
    const { ui } = await opened($, on, {}, { bodyColumns: 40 });

    await ui.press({ key: "tab:review" });
    const tree = await ui.drawn();

    expect(nodeOf(tree, "section:review")?.props?.borderStyle).toBeUndefined();
    expect(textIn(nodeOf(tree, "section:review:title"))).toBe(title("review"));
  });

  test("should draw the header bar on the header's fill, its store on the heading weight and its read time on the meta weight", async ($, on) => {
    const { ui } = await opened($, on);

    const header = nodeOf(await ui.drawn(), "header");
    expect(header?.props?.backgroundColor).toBe(colorOf("surface.header"));
    expect(header?.props?.paddingX).toBe(SPACE.tight);
    const parts = nodesOf(header).filter((node) => node.type === "Text");
    expect(parts.some((node) => node.props?.bold === true && textIn(node) === "beads-ui")).toBe(
      true,
    );
    expect(parts.some((node) => node.props?.dimColor === true && /as of/.test(textIn(node)))).toBe(
      true,
    );
  });
});

describe("the Board's cards (T-2C.12)", () => {
  test("should frame every card in its column's status accent, draw its priority bold in the priority's colour, and turn the frame to the focus colour under the pointer", async ($, on) => {
    const { ui } = await opened($, on);
    await ui.press({ key: "tab:board" });
    const tree = await ui.drawn();

    const groups = keyed(tree, "group:");
    expect(groups.length).toBeGreaterThan(1);
    let checked = 0;
    for (const group of groups) {
      for (const column of keyed(group, "column:")) {
        const header = nodesOf(column).find((node) => node.type === "Text");
        const status = String(column.props?.key).split(":").at(-1);
        const cards = keyed(group, "card:").filter(
          (card) => nodesOf(card).find((node) => node.type === "Select")?.props?.value === status,
        );
        for (const card of cards) {
          expect(card.props?.borderStyle).toBe("round");
          expect(card.props?.borderColor).toBe(header?.props?.color);
          expect(card.hover?.borderColor).toBe(colorOf("surface.focus"));
          const priority = nodesOf(card).find(
            (node) => leafText(node) && /^P[0-4]$/.test(textIn(node)),
          );
          expect(priority?.props?.bold).toBe(true);
          const level = Number(textIn(priority).slice(1)) as 0 | 1 | 2 | 3 | 4;
          expect(priority?.props?.color).toBe(colorOf(priorityToken(level)));
          checked++;
        }
      }
    }
    expect(checked).toBe(keyed(tree, "card:").length);
    expect(checked).toBeGreaterThan(20);
  });
});

describe("hover on pressable rows (T-2C.12)", () => {
  test("should fill a pressable row of the Tasks view, the Backlog and the Timeline under the pointer", async ($, on) => {
    const { ui } = await opened($, on, DATED, {}, "vscode");
    const fill = colorOf("surface.hover");

    await ui.press({ key: "tab:tasks" });
    const tasks = keyed(await ui.drawn(), "taskrow:");
    await ui.press({ key: "tab:backlog" });
    const backlog = keyed(await ui.drawn(), "row:");
    await ui.press({ key: "tab:timeline" });
    const timeline = keyed(await ui.drawn(), "timeline-row:");

    for (const [name, rows] of [
      ["tasks", tasks],
      ["backlog", backlog],
      ["timeline", timeline],
    ] as const) {
      expect(rows.length, name).toBeGreaterThan(0);
      for (const row of rows) expect(row.hover?.backgroundColor, name).toBe(fill);
    }
  });
});

describe("the spacing and weight scales (T-2C.12)", () => {
  test("should draw every gap, padding and margin of every view, the Detail and the overlays from the spacing scale", async ($, on) => {
    const { w, ui } = await opened($, on);
    const drawings: [string, unknown][] = [];

    for (const view of VIEWS) {
      await ui.press({ key: `tab:${view}` });
      drawings.push([view, await ui.drawn()]);
    }
    await ui.press({ key: "tab:backlog" });
    const open = keyed(await ui.drawn(), "open:")[0]?.props?.key;
    await ui.press({ key: String(open ?? "open:missing") });
    await w.clock.settle();
    drawings.push(["detail", await ui.drawn()]);
    await ui.press({ key: "tab:board" });
    for (const overlay of ["help", "band-settings", "menu"]) {
      await ui.press({ key: overlay });
      drawings.push([overlay, await ui.drawn()]);
      await ui.press({ key: overlay });
    }

    expect(
      drawings.flatMap(([name, tree]) => offScale(tree).map((hit) => `${name}: ${hit}`)),
    ).toEqual([]);
  });

  test("should find a gap off the spacing scale", () => {
    expect(offScale({ type: "Box", props: { key: "b", gap: 3, paddingX: 1 } })).toEqual([
      "b gap=3",
    ]);
  });

  test("should draw each view's title on the title weight and the Detail's parts on the heading weight", async ($, on) => {
    const { w, ui } = await opened($, on);
    await ui.press({ key: "tab:backlog" });
    const title = nodesOf(nodeOf(await ui.drawn(), "section:backlog:title")).find(
      (node) => node.type === "Text",
    );
    expect(title?.props?.bold).toBe(true);
    expect(title?.props?.color).toBe(colorOf("accent"));

    // BU-mg2.3: the issue the world's bd shows, with its dependencies, history and comments.
    await ui.press({ key: "tab:board" });
    await ui.press({ key: "open:BU-mg2.3" });
    await w.clock.settle();
    const tree = await ui.drawn();
    for (const key of ["dependencies-heading", "history-heading", "comments-heading"]) {
      const text = nodesOf(nodeOf(tree, key)).find(leafText);
      expect(text?.props?.bold, key).toBe(true);
      expect(nodeOf(tree, key)?.props?.marginTop, key).toBe(SPACE.tight);
    }
  });
});

/** The frame colour of the state keyed `key` in the open view, or undefined when not framed. */
const stateFrame = (tree: unknown, key: string) => {
  const node = nodeOf(tree, key);
  return node === undefined
    ? "absent"
    : node.props?.borderStyle === "round"
      ? String(node.props?.borderColor)
      : undefined;
};

describe("the empty states (T-2C.12)", () => {
  test("should draw a framed empty state saying what to do on the Tasks view, the Board, the Backlog, the Timeline, the Detail and Settings when there is nothing to show", async ($, on) => {
    const { ui } = await opened($, on, EMPTY);
    const dim = colorOf("text.dim");
    const states = {
      tasks: "tasks-empty",
      board: "board-empty",
      backlog: "backlog-empty",
      timeline: "timeline-empty",
      detail: "detail-empty",
      settings: "settings:empty",
    } as const;

    for (const [view, key] of Object.entries(states)) {
      await ui.press({ key: `tab:${view}` });
      const tree = await ui.drawn();
      expect(stateFrame(tree, key), view).toBe(dim);
      expect(textIn(nodeOf(tree, key)).length, view).toBeGreaterThan(10);
    }
    await ui.press({ key: "tab:board" });
    expect(textIn(nodeOf(await ui.drawn(), "board-empty"))).toBe(
      "No issue in this store yet.Type a title in New to add one.",
    );
  });

  test("should say no issue matches the filter on an empty Backlog with a filter set", async ($, on) => {
    const { w, ui } = await opened($, on);
    await ui.press({ key: "tab:backlog" });

    await ui.input({ key: "filter", text: "label:no-such-label" });
    await w.clock.settle();

    expect(textIn(nodeOf(await ui.drawn(), "backlog-empty"))).toBe(
      "No open issue matches the filter.Clear the Filter field to show every one.",
    );
  });

  test("should draw the Review view's unset state framed", async ($, on) => {
    const { ui } = await opened($, on);

    await ui.press({ key: "tab:review" });

    expect(stateFrame(await ui.drawn(), "review-view:unset")).toBe(colorOf("text.dim"));
  });
});

describe("the error states (T-2C.12)", () => {
  test("should draw each view fed by the board read as one framed error state in the error colour when the first read fails", async ($, on) => {
    const { ui } = await opened($, on, UNREAD);

    for (const view of FED_BY_THE_BOARD) {
      await ui.press({ key: `tab:${view}` });
      const tree = await ui.drawn();
      const section = nodeOf(tree, `section:${view}`);
      expect(keyed(section, "error-line"), view).toHaveLength(1);
      expect(keyed(tree, "error-line"), view).toHaveLength(1);
      expect(stateFrame(tree, "error-line"), view).toBe(colorOf("error"));
      expect(textIn(nodeOf(tree, "error-line")), view).toMatch(
        /^bd list failed \(exit 1\): Error: database is locked; retrying on the next refresh$/,
      );
    }
  });

  test("should draw the error over a board the pane kept, framed, when a refresh fails", async ($, on) => {
    let failing = false;
    const { w, ui } = await opened($, on, {
      script: (key) =>
        failing && key === STORE_LIST ? exit(1, "Error: database is locked") : undefined,
    });
    await ui.press({ key: "tab:board" });

    failing = true;
    await w.clock.advance(10_000);
    const tree = await ui.drawn();

    expect(stateFrame(tree, "error-line")).toBe(colorOf("error"));
    expect(keyed(nodeOf(tree, "section:board"), "error-line")).toHaveLength(0);
    expect(keyed(tree, "card:").length).toBeGreaterThan(0);
  });

  test("should draw the Detail's error state framed when its read fails", async ($, on) => {
    const { w, ui } = await opened($, on, {
      script: (key) =>
        key.startsWith("bd show ") ? exit(1, "Error: database is locked") : undefined,
    });
    await ui.press({ key: "tab:backlog" });
    const open = keyed(await ui.drawn(), "open:")[0]?.props?.key;

    await ui.press({ key: String(open ?? "open:missing") });
    await w.clock.settle();

    expect(stateFrame(await ui.drawn(), "detail-error")).toBe(colorOf("error"));
  });

  test("should draw Settings' file problems as one framed warning state", async ($, on) => {
    const { ui } = await opened($, on, { files: { [USER_CONFIG]: "[panel]\nshown = -3\n" } });

    await ui.press({ key: "tab:settings" });
    const tree = await ui.drawn();

    expect(stateFrame(tree, "settings:problems")).toBe(colorOf("warning"));
    expect(textIn(nodeOf(tree, "settings:problems"))).toMatch(/shown/);
    expect(nodeOf(tree, "settings:empty")).toBeUndefined();
  });

  test("should draw the Review view's refused filter as a framed warning state", async ($, on) => {
    const { w, ui } = await opened($, on);
    await ui.press({ key: "tab:review" });

    await ui.input({ key: REVIEW_FILTER_KEY, text: "bogus:x" });
    await w.clock.settle();

    expect(stateFrame(await ui.drawn(), "review-view:filter-error")).toBe(colorOf("warning"));
  });
});

describe("the restyled views within the width tests (T-2C.12)", () => {
  const STATES = [
    ["its rows", {}],
    ["its empty state", EMPTY],
    ["its error state", UNREAD],
  ] as const;
  for (const columns of WIDTHS) {
    for (const [state, options] of STATES) {
      test(`should draw no line past ${columns} columns on every view showing ${state}`, async ($, on) => {
        const { ui } = await opened($, on, options, { bodyColumns: columns });

        for (const view of [...VIEWS, "detail"]) {
          await ui.press({ key: `tab:${view}` });
          expect(overflows(await ui.drawn(), columns), view).toEqual([]);
        }
      });
    }
  }
});
