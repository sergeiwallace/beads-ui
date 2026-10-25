import { describe, expect } from "claude-code/testing";

import {
  type ActionContext,
  DEFAULT_BAND_SETTINGS,
  DEFAULT_PANEL_SETTINGS,
  INDICATORS,
  INITIAL_BOARD_STATE,
  labels,
  PRESS_CLOSE,
  PRESS_OPEN,
  panelActions,
  reduceBoard,
  SECTION_COLUMNS,
  SIDE_NAV_COLUMNS,
  settingsView,
  taskListView,
} from "../core/src/index.ts";
import { allIssues, storeStatuses } from "../core/test/helpers.ts";
import { actionBar } from "./components/actions.ts";
import { bandSurface, paneSurface, type Surface } from "./components/adapters.ts";
import { choice, field, markdown } from "./components/elements.ts";
import { colorOf, pressKey } from "./components/look.ts";
import { bandNav, navBar } from "./components/nav.ts";
import { taskList, taskRow } from "./components/tasks.ts";
import type { Host } from "./host.ts";
import { BandLevels } from "./levels.ts";
import { BeadsPane, type PaneUi } from "./pane.ts";
import { drawSettings } from "./panel.ts";
import { StoreResolver } from "./store.ts";
import type { BandTally } from "./tally.ts";
import { test } from "./tests/kit.ts";
import { CWD } from "./tests/world.ts";

// D-35 and T-2C.1: the component layer. A component draws a core model through a surface's
// adapter; these draw one model through the band's and the pane's and compare what each draws.
// The elements are the kit's shape, `{ type, props }`, from constructors of the test's own, as
// mouse.test.ts draws the pane; the hooks-entry tests of [surfaces] are surfaces.test.ts.

interface Node {
  type: string;
  props: Record<string, unknown>;
}

const element = (type: string) => (props: Record<string, unknown>) => ({ type, props });
const UI = Object.fromEntries(
  ["Box", "Text", "Button", "Input", "Select", "Markdown", "Code"].map((type) => [
    type,
    element(type),
  ]),
) as unknown as PaneUi;

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && "type" in value && "props" in value;

const nodes = (tree: unknown, out: Node[] = []): Node[] => {
  if (Array.isArray(tree)) {
    for (const child of tree) nodes(child, out);
    return out;
  }
  if (!isNode(tree)) return out;
  out.push(tree);
  nodes(tree.props.children, out);
  return out;
};

/** Every string a tree draws, in order: Text children and Button labels. */
const textOf = (tree: unknown): string[] => {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const child of value) walk(child);
    else if (isNode(value)) {
      if (value.type === "Button") out.push(String(value.props.label));
      // A button's clickable brackets (T-2C.14) are its frame, not text; bareButtons checks them.
      if (String(value.props.key ?? "").startsWith(pressKey(""))) {
        walk(
          (value.props.children as unknown[]).filter(
            (child) => isNode(child) && child.type === "Button",
          ),
        );
        return;
      }
      walk(value.props.children);
    }
  };
  walk(tree);
  return out;
};

/** Every action a tree offers: each Button's key, label and hotkey. */
const actionsOf = (tree: unknown) =>
  nodes(tree)
    .filter((node) => node.type === "Button")
    .map((node) => ({
      key: String(node.props.key),
      label: String(node.props.label),
      hotkey: node.props.hotkey,
    }));

/** Presses each Button in order and returns what the handlers heard. */
const pressAll = (tree: unknown, log: string[]): string[] => {
  log.length = 0;
  for (const node of nodes(tree).filter((one) => one.type === "Button")) {
    (node.props.onPress as () => void)();
  }
  return [...log];
};

const typesOf = (tree: unknown) => new Set(nodes(tree).map((node) => node.type));
const keysOf = (tree: unknown, prefix: string) =>
  nodes(tree)
    .map((node) => String(node.props.key ?? ""))
    .filter((key) => key.startsWith(prefix));

/**
 * The keys of the Buttons a tree draws outside the clickable affordance (T-2C.14): each must sit
 * in its `press:` frame between the two brackets in the control token, plain.
 */
const bareButtons = (tree: unknown): string[] => {
  const out: string[] = [];
  const isBracket = (node: unknown, text: string) =>
    isNode(node) &&
    node.type === "Text" &&
    node.props.color === colorOf("control") &&
    node.props.children === text;
  const walk = (value: unknown, parent: Node | undefined) => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, parent);
      return;
    }
    if (!isNode(value)) return;
    if (value.type === "Button") {
      const key = String(value.props.key);
      const siblings = (parent?.props.children ?? []) as unknown[];
      const at = siblings.indexOf(value);
      const framed =
        parent?.props.key === pressKey(key) &&
        isBracket(siblings[at - 1], PRESS_OPEN) &&
        isBracket(siblings[at + 1], PRESS_CLOSE) &&
        value.props.plain === true;
      if (!framed) out.push(key);
    }
    walk(value.props.children, value);
  };
  walk(tree, undefined);
  return out;
};

const COLUMNS = 80;
const band = (columns = COLUMNS): Surface => bandSurface(UI, { columns, maxRows: 10 });
const pane = (columns = COLUMNS): Surface => paneSurface(UI, { columns, rows: 28, short: false });
/** A band handed Box, Text and Button alone, as drawBand's is: no Select, Input or Markdown. */
const bare = (columns = COLUMNS): Surface =>
  bandSurface({ Box: UI.Box, Text: UI.Text, Button: UI.Button }, { columns, maxRows: 10 });

const LIST = taskListView(allIssues(), {
  statuses: storeStatuses(),
  settings: DEFAULT_PANEL_SETTINGS,
  expanded: false,
  width: COLUMNS - 2,
});

const CTX: ActionContext = {
  view: "tasks",
  mine: false,
  swimlane: "none",
  sort: "priority",
  undo: true,
  paged: false,
  lanesPaged: false,
  bandSettings: true,
};

describe("one component, both adapters (D-35, T-2C.1)", () => {
  test("should draw one task list through the band and the pane with the same text and the same actions", () => {
    const log: string[] = [];
    const handlers = {
      open: (id: string) => log.push(`open ${id}`),
      menu: (id: string) => log.push(`menu ${id}`),
      more: () => log.push("more"),
    };
    const options = { color: () => "", empty: "none", handlers };
    const onBand = taskList(band(), LIST, options);
    const onPane = taskList(pane(), LIST, options);

    expect(LIST.rows.length).toBeGreaterThan(2);
    expect(LIST.collapsible).toBe(true);
    expect(textOf(onBand)).toEqual(textOf(onPane));
    expect(actionsOf(onBand)).toEqual(actionsOf(onPane));
    expect(pressAll(onBand, log)).toEqual(pressAll(onPane, log));
    expect(pressAll(onBand, log)).toContain(`open ${LIST.rows[0]?.id}`);
  });

  test("should draw one task row through both adapters with the same label and the same open and menu actions", () => {
    const log: string[] = [];
    const row = LIST.rows[0];
    if (row === undefined) throw new Error("the fixture has no task");
    const handlers = {
      open: (id: string) => log.push(`open ${id}`),
      menu: (id: string) => log.push(`menu ${id}`),
      more: () => log.push("more"),
    };
    const onBand = taskRow(band(), row, handlers);
    const onPane = taskRow(pane(), row, handlers);

    expect(textOf(onBand)).toEqual(textOf(onPane));
    expect(actionsOf(onBand)).toEqual(actionsOf(onPane));
    expect(pressAll(onBand, log)).toEqual([`open ${row.id}`, `menu ${row.id}`]);
    expect(pressAll(onPane, log)).toEqual([`open ${row.id}`, `menu ${row.id}`]);
  });

  test("should draw one action bar through both adapters with the same labels, hotkeys, rows and commands at each tier", () => {
    const log: string[] = [];
    const actions = panelActions(CTX).filter((action) => action.place === "toolbar");
    for (const columns of [40, 60, 80, 120]) {
      const onBand = actionBar(band(columns), actions, (command) => log.push(command));
      const onPane = actionBar(pane(columns), actions, (command) => log.push(command));

      expect(textOf(onBand)).toEqual(textOf(onPane));
      expect(actionsOf(onBand)).toEqual(actionsOf(onPane));
      expect(keysOf(onBand, "toolbar:")).toEqual(keysOf(onPane, "toolbar:"));
      expect(pressAll(onBand, log)).toEqual(actions.map((action) => action.command));
      expect(pressAll(onPane, log)).toEqual(actions.map((action) => action.command));
    }
  });
});

describe("the element a surface lacks (D-35, T-2C.1)", () => {
  const OPTIONS = [
    { value: "both", label: "both: the band and the pane" },
    { value: "band", label: "band: the band only" },
  ];

  test("should draw Select, Input and Markdown on a band handed them, as the measured AbovePrompt site is", () => {
    const props = { key: "pick", options: OPTIONS, value: "both", onSelect: () => undefined };

    expect(choice(band(), props).type).toBe("Select");
    expect(field(band(), { key: "f", value: "1", onSubmit: () => undefined }).type).toBe("Input");
    expect(markdown(band(), { key: "m", text: "**x**" }).type).toBe("Markdown");
  });

  test("should draw a Select on the pane and a button per option on a band without one, each pressing onSelect", () => {
    const chosen: string[] = [];
    const props = {
      key: "pick",
      options: OPTIONS,
      value: "both",
      onSelect: (v: string) => chosen.push(v),
    };

    const onPane = choice(pane(), props);
    expect(onPane.type).toBe("Select");
    const onBand = choice(bare(), props);
    expect(typesOf(onBand).has("Select")).toBe(false);
    expect(actionsOf(onBand).map((one) => [one.key, one.label])).toEqual([
      ["pick:both", "both: the band and the pane"],
      ["pick:band", "band: the band only"],
    ]);
    const buttons = nodes(onBand).filter((node) => node.type === "Button");
    expect(buttons.map((node) => node.props.dimColor)).toEqual([undefined, true]);
    pressAll(onBand, []);
    expect(chosen).toEqual(["both", "band"]);
  });

  test("should draw an Input on the pane and, on the band, the value with a button per preset and one that types it in the pane", () => {
    const submitted: string[] = [];
    let typed = 0;
    const props = {
      key: "shown",
      value: "10",
      submitLabel: "set",
      onSubmit: (v: string) => submitted.push(v),
      presets: ["5", "10", "20"],
      elsewhere: { label: "type in the pane", press: () => typed++ },
    };

    expect(field(pane(), props).type).toBe("Input");
    const onBand = field(bare(), props);
    expect(typesOf(onBand).has("Input")).toBe(false);
    expect(textOf(onBand)).toEqual(["10", "5", "10", "20", "type in the pane"]);
    pressAll(onBand, []);
    expect(submitted).toEqual(["5", "10", "20"]);
    expect(typed).toBe(1);
  });

  test("should draw Markdown on the pane and, on the band, its text with a button that reads it in the pane", () => {
    let opened = 0;
    const props = {
      key: "notes",
      text: "**Done when** the band draws it",
      elsewhere: { label: "read in the pane", press: () => opened++ },
    };

    expect(markdown(pane(), props).type).toBe("Markdown");
    const onBand = markdown(bare(), props);
    expect(typesOf(onBand).has("Markdown")).toBe(false);
    expect(textOf(onBand)).toEqual(["**Done when** the band draws it", "read in the pane"]);
    pressAll(onBand, []);
    expect(opened).toBe(1);
  });

  test("should draw the Settings view's lists and fields as buttons on the band and as Select and Input on the pane", () => {
    const chosen: string[] = [];
    const view = settingsView(DEFAULT_PANEL_SETTINGS, DEFAULT_BAND_SETTINGS, 60, [
      { view: "timeline", label: "Timeline", setting: "both" },
    ]);
    const options = {
      color: () => "",
      problems: [],
      handlers: {
        shown: () => undefined,
        choose: (key: string, value: string) => chosen.push(`${key}=${value}`),
        save: () => undefined,
      },
    };

    const onPane = drawSettings(pane(60), view, options);
    expect(keysOf(onPane, "settings:surfaces:timeline")).toEqual([
      "settings:surfaces:timeline:row",
      "settings:surfaces:timeline",
    ]);
    expect(typesOf(onPane).has("Select")).toBe(true);
    expect(typesOf(onPane).has("Input")).toBe(true);
    const onBand = drawSettings(bare(60), view, options);
    expect(typesOf(onBand).has("Select")).toBe(false);
    expect(typesOf(onBand).has("Input")).toBe(false);
    const press = nodes(onBand).find((node) => node.props.key === "settings:surfaces:timeline:band")
      ?.props.onPress as () => void;
    press();
    expect(chosen).toEqual(["settings:surfaces:timeline=band"]);
  });
});

describe("the view registry (D-35, T-2C.1)", () => {
  const FRAME = { width: 117, bodyColumns: 118, placement: "dock", bodyRows: 28 };
  /**
   * The pane's view width at FRAME: the body less the side nav and its gap, and inside it the
   * view's framed section (T-2C.12).
   */
  const VIEW_COLUMNS = 117 - SIDE_NAV_COLUMNS - 1 - SECTION_COLUMNS;

  async function drawnPane() {
    const pane = new BeadsPane(new StoreResolver());
    const host = {
      invalidate: () => undefined,
      storeGet: async () => undefined,
      storeSet: async () => undefined,
      focus: async () => ({}),
    } as unknown as Host;
    pane.host = host;
    await pane.panel.bind(host);
    pane.store = { ok: true, path: CWD, via: "directory" };
    pane.board = reduceBoard(INITIAL_BOARD_STATE, {
      type: "load-succeeded",
      issues: allIssues(),
      statuses: storeStatuses(),
      at: "2026-10-21T01:12:04Z",
    });
    return pane;
  }

  const bandNavOf = (pane: BeadsPane) =>
    navBar(band(), bandNav(COLUMNS, pane.viewsOn("band"), pane.tab), (item) =>
      pane.pressNav(item.view),
    );
  const navIn = (tree: unknown) => keysOf(tree, "tab:").map((key) => key.slice("tab:".length));

  const PROBE = {
    view: "probe",
    command: "tab.probe",
    labels: labels("Probe"),
    glyph: "*",
    planned: false,
    draw: (surface: Surface) =>
      surface.ui.Box({
        key: "probe-view",
        children: [surface.ui.Text({ children: `probe on the ${surface.id}` })],
      }),
  };

  test("should draw every pressable element of every view the framework draws in the clickable affordance, on the band and on the pane", async () => {
    const beads = await drawnPane();
    const drawn = beads.views.all().filter((entry) => entry.draw !== undefined);
    expect(drawn.length).toBeGreaterThan(0);

    for (const entry of drawn) {
      for (const surface of [band(VIEW_COLUMNS), pane(VIEW_COLUMNS), bare(VIEW_COLUMNS)]) {
        const tree = entry.draw?.(surface);
        expect(
          nodes(tree).some((node) => node.type === "Button"),
          entry.view,
        ).toBe(true);
        expect(bareButtons(tree), `${entry.view} on the ${surface.id}`).toEqual([]);
      }
    }
    expect(bareButtons(beads.draw(UI, FRAME))).toEqual([]);
  });

  test("should draw the Tasks view, registered once, on the pane and the band from the pane's state, a band press running the pane's action", async () => {
    const pane = await drawnPane();
    const tasks = pane.views.get("tasks")?.draw;
    if (tasks === undefined) throw new Error("the Tasks view has no drawing");

    const onPane = pane.draw(UI, FRAME);
    const onBand = tasks(bandSurface(UI, { columns: VIEW_COLUMNS, maxRows: 40 }));
    const rows = (tree: unknown) => actionsOf(tree).filter((one) => /^task(menu)?:/.test(one.key));
    expect(rows(onBand).length).toBeGreaterThan(2);
    expect(rows(onBand)).toEqual(rows(onPane));
    expect(textOf(onBand)[0]).toBe(textOf(onPane).find((text) => /^\d+ tasks?: /.test(text)));

    const [menuKey] = keysOf(onBand, "taskmenu:");
    const press = nodes(onBand).find((node) => node.props.key === menuKey)?.props.onPress;
    (press as () => void)();
    await Promise.resolve();
    expect(pane.menuOpen).toBe(true);
    expect(pane.menuFor).toBe(String(menuKey).slice("taskmenu:".length));
    expect(keysOf(pane.draw(UI, FRAME), "options-menu")).toEqual(["options-menu"]);
  });

  test("should find a view registered with no surfaces in the pane's nav and the band's nav, and draw it on both", async () => {
    const pane = await drawnPane();
    pane.views.register(PROBE);

    expect(navIn(pane.draw(UI, FRAME))).toContain("probe");
    expect(navIn(bandNavOf(pane))).toContain("probe");

    const press = nodes(bandNavOf(pane)).find((node) => node.props.key === "tab:probe")?.props
      .onPress as () => void;
    press();
    expect(pane.tab).toBe("probe");
    expect(textOf(pane.draw(UI, FRAME))).toContain("probe on the pane");
    expect(textOf(pane.views.get("probe")?.draw?.(band()))).toEqual(["probe on the band"]);
  });

  test("should draw a view registered once in the band's overview, under the band's nav, with no other change", async () => {
    const pane = await drawnPane();
    pane.views.register(PROBE);
    const tally = {
      lines: [{ key: "own", segments: [{ text: "[bd]", bold: true }], line: "[bd]" }],
      drawnSettings: DEFAULT_BAND_SETTINGS,
      countOf: () => 0,
      readOf: () => undefined,
      readTasks: async () => undefined,
    } as unknown as BandTally;
    const levels = new BandLevels(tally, pane, () => undefined);
    levels.host = pane.host;
    const drawBand = () =>
      levels.draw(
        UI,
        { columns: COLUMNS, maxRows: 12 },
        {
          open: false,
          onOpen: () => undefined,
          onClose: () => undefined,
        },
      );

    const overview = nodes(drawBand()).find((node) => node.props.key === "press:band:overview");
    const press = nodes(overview).find((node) => node.type === "Button")?.props.onPress;
    (press as () => void)();
    expect(navIn(drawBand())).toContain("probe");

    const nav = nodes(drawBand()).find((node) => node.props.key === "tab:probe")?.props.onPress;
    (nav as () => void)();
    expect(textOf(drawBand())).toContain("probe on the band");
    expect(pane.tab).not.toBe("probe");
  });

  test("should draw an indicator registry entry added with no other change on a task row, in the help's legend and as a Settings switch", async () => {
    const remove = INDICATORS.register({
      id: "urgent",
      glyph: "view.board",
      token: "priority.p0",
      label: "priority 1 or higher",
      detect: ({ issue }) => (issue.priority <= 1 ? "on" : undefined),
    });
    try {
      const pane = await drawnPane();
      const tree = pane.draw(UI, FRAME);
      const rows = nodes(tree).filter((node) => String(node.props.key).startsWith("taskrow:"));
      expect(rows.length).toBeGreaterThan(0);
      const lit = rows.filter((row) => textOf(row).some((text) => text.includes("⊞")));
      const urgent = pane.board.issues
        .filter((issue) => issue.priority <= 1)
        .map((issue) => issue.id);
      expect(lit.length).toBeGreaterThan(0);
      for (const row of lit) {
        expect(urgent).toContain(String(row.props.key).slice("taskrow:".length));
      }

      pane.toggleHelp();
      expect(textOf(pane.draw(UI, FRAME))).toContain("⊞ (#) urgent: priority 1 or higher");
      pane.toggleHelp();
      pane.setTab("settings");
      expect(keysOf(pane.draw(UI, FRAME), "settings:indicator:urgent")).toContain(
        "settings:indicator:urgent",
      );
    } finally {
      remove();
    }
  });

  test("should draw a view on one surface only when Settings sets it to band or pane, and on both again for both", async () => {
    const pane = await drawnPane();
    pane.views.register(PROBE);

    await pane.panel.changeSurface("probe", "pane");
    expect(navIn(pane.draw(UI, FRAME))).toContain("probe");
    expect(navIn(bandNavOf(pane))).not.toContain("probe");

    pane.setTab("probe");
    expect(pane.tab).toBe("probe");
    await pane.panel.changeSurface("probe", "band");
    const drawn = pane.draw(UI, FRAME);
    expect(navIn(drawn)).not.toContain("probe");
    expect(navIn(bandNavOf(pane))).toContain("probe");
    // The open view moved off the pane at this redraw.
    expect(pane.tab).toBe("tasks");
    expect(keysOf(drawn, "probe-view")).toEqual([]);

    await pane.panel.changeSurface("probe", "both");
    expect(navIn(pane.draw(UI, FRAME))).toContain("probe");
    expect(navIn(bandNavOf(pane))).toContain("probe");
  });
});
