import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { hotkeyOf } from "../core/src/index.ts";
import { BAND_MENU_KEY } from "./components/band.ts";
import { OVERVIEW_KEY } from "./levels.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { MINE, ownStore } from "./tests/mine.ts";
import { render } from "./tests/render.ts";
import {
  BAND_PROPS,
  type Counted,
  CWD,
  countScript,
  PANE_PROPS,
  SESSION,
  SHOW,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// T-2C.8, D-35: every view the pane draws is drawn by both adapters, and every action a view
// offers in the pane is reachable in the band's overview, by a button or a menu. For each view
// this enumerates, from the drawn trees at the hooks entry point, the pane's actions (the view's
// own controls, its Filter and New fields, its toolbar and its options menu) and the band's
// (the same in the overview, whose menu stands for the toolbar), and fails on any action one
// surface offers and the other does not. The surfaces are tall enough to draw each view whole.

/** Every element a person presses or types into. */
const PRESSABLE = new Set(["Button", "Select", "Input"]);

interface DrawnNode {
  type?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
}

const asNode = (value: unknown): DrawnNode | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as DrawnNode)
    : undefined;

/** The subtree keyed `key`, or undefined. */
function subtree(tree: unknown, key: string): unknown {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = subtree(child, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const node = asNode(tree);
  if (node === undefined) return undefined;
  if (node.props?.key === key) return node;
  return subtree(node.children ?? [], key);
}

/** The keys of the pressable elements under `tree`, leaving out the subtrees `skip` names. */
function actions(tree: unknown, skip: (key: string) => boolean = () => false): string[] {
  const out = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    const node = asNode(value);
    if (node === undefined) return;
    const key = typeof node.props?.key === "string" ? node.props.key : "";
    if (key !== "" && skip(key)) return;
    if (node.type !== undefined && PRESSABLE.has(node.type) && key !== "") out.add(key);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return [...out].sort();
}

/** The hotkey each toolbar Button draws with. */
function hotkeys(tree: unknown): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    const node = asNode(value);
    if (node === undefined) return;
    if (node.type === "Button") {
      const hotkey = node.props?.hotkey;
      out.push(typeof hotkey === "string" && hotkey !== "" ? hotkey : undefined);
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return out;
}

const MENU_ITEM = "menu:item:";
const commandsOf = (keys: readonly string[]) =>
  keys.filter((key) => key.startsWith(MENU_ITEM)).map((key) => key.slice(MENU_ITEM.length));

/** The band's own chrome around a view: its nav, its controls row, its notes and its window edges. */
const bandChrome = (key: string) =>
  key === "nav" ||
  key === "band-overview:controls" ||
  key === "band-overview:note" ||
  key.endsWith(":above") ||
  key.endsWith(":below");

/** Rows that draw every view in the fixture whole, in the pane and in the band. */
const TALL = 400;
const TALL_PANE = { ...PANE_PROPS, scroll: { offset: 0, bodyRows: TALL } };
const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";

const counted = (): Counted[] =>
  ownStore().map((row) => ({
    status: String(row.status),
    ...(typeof row.assignee === "string" ? { assignee: row.assignee } : {}),
  }));

const options = (files: Record<string, string> = {}): WorldOptions => ({
  ...MINE,
  files,
  script: (key, argv, cwd) =>
    MINE.script?.(key, argv, cwd) ?? countScript({ [CWD]: counted() })(key, argv, cwd),
});

async function started($: Engine, on: On, files?: Record<string, string>) {
  const w = world(on, options(files));
  await $.session.start(SESSION);
  await w.clock.settle();
  await $.command.run(SHOW);
  await w.clock.settle();
  return w;
}

type Mounted = Awaited<ReturnType<Engine["ui"]["mount"]>>;
/** The pane mounts once a test: a second mount of the same request is refused. */
const panes = new WeakMap<Engine, Promise<Mounted>>();
const pane = ($: Engine): Promise<Mounted> => {
  const held = panes.get($);
  if (held !== undefined) return held;
  const mounted = $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "Pane",
    props: TALL_PANE,
    requestId: PANE_ID,
    viewport: VIEWPORT,
  });
  panes.set($, mounted);
  return mounted;
};

const band = ($: Engine, maxRows = TALL) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: { ...BAND_PROPS, maxRows },
    viewport: VIEWPORT,
  });

type Settle = { clock: { settle: () => Promise<unknown> } };

async function pressOn(
  mount: () => Promise<{ press: (target: { key: string }) => Promise<unknown> }>,
  w: Settle,
  key: string,
) {
  await (await mount()).press({ key });
  await w.clock.settle();
}

/** The task whose Detail both surfaces open: it is in progress, so the Tasks view lists it. */
const DETAIL_TASK = "BU-mg2.3";

/** Opens `view` in the pane: its nav entry, or for the Detail a task's row. */
async function openInPane($: Engine, w: Settle, view: string) {
  if (view === "detail") {
    await pressOn(() => pane($), w, "tab:tasks");
    await pressOn(() => pane($), w, `task:${DETAIL_TASK}`);
    return;
  }
  await pressOn(() => pane($), w, `tab:${view}`);
}

/** Opens `view` in the band's overview: its nav entry, or for the Detail a task's row. */
async function openInBand($: Engine, w: Settle, view: string) {
  await pressOn(() => band($), w, OVERVIEW_KEY);
  if (view === "detail") {
    await pressOn(() => band($), w, "tab:tasks");
    await pressOn(() => band($), w, `task:${DETAIL_TASK}`);
    return;
  }
  await pressOn(() => band($), w, `tab:${view}`);
}

/** The pane's actions on its open view: the view's section and fields, the toolbar, the menu. */
async function paneActions($: Engine, w: Settle, view: string) {
  const drawn = await (await pane($)).drawn();
  const body = [
    ...actions(subtree(drawn, `section:${view}`)),
    ...actions(subtree(drawn, "inputs")),
  ];
  const toolbar = hotkeys(subtree(drawn, "toolbar"));
  await pressOn(() => pane($), w, "menu");
  const menu = commandsOf(actions(subtree(await (await pane($)).drawn(), "options-menu")));
  await pressOn(() => pane($), w, "menu:close");
  return { body: body.filter((key) => !key.startsWith(MENU_ITEM)).sort(), toolbar, menu };
}

/** The band's actions on the overview's view: everything in it but its chrome, and its menu. */
async function bandActions($: Engine, w: Settle) {
  const overview = subtree(await (await band($)).drawn(), "beads-band:overview");
  const body = actions(overview, bandChrome);
  await pressOn(() => band($), w, BAND_MENU_KEY);
  const menu = commandsOf(
    actions(subtree(await (await band($)).drawn(), "beads-band:overview"), bandChrome),
  );
  await pressOn(() => band($), w, BAND_MENU_KEY);
  return { body, menu };
}

const VIEWS = ["tasks", "board", "backlog", "detail", "timeline", "settings", "review"] as const;

describe("every view's actions on both surfaces (T-2C.8, D-35)", () => {
  for (const view of VIEWS) {
    test(`should offer every action of the ${view} view in the band's overview that it offers in the pane, and no other`, async ($, on) => {
      const w = await started($, on);

      await openInPane($, w, view);
      const inPane = await paneActions($, w, view);
      await openInBand($, w, view);
      const inBand = await bandActions($, w);

      // Each surface draws the view, with something to press.
      expect(inPane.body.length + inPane.menu.length, `${view} in the pane`).toBeGreaterThan(0);
      expect(inBand.body).toEqual(inPane.body);
      expect(inBand.menu).toEqual(inPane.menu);
      // The pane's toolbar is its menu's actions by key, so the band's menu reaches each of them.
      const menuKeys = new Set(inPane.menu.map(hotkeyOf));
      for (const hotkey of inPane.toolbar) {
        expect(hotkey, `a toolbar button on ${view} with no key`).toBeDefined();
        expect(menuKeys.has(hotkey ?? ""), `toolbar key ${hotkey} on ${view}`).toBe(true);
      }
    });
  }

  test("should leave a view [surfaces] keeps to the pane out of the band, and the parity check with it", async ($, on) => {
    const w = await started($, on, { [USER_CONFIG]: '[surfaces]\nboard = "pane"\n' });
    await pressOn(() => band($), w, OVERVIEW_KEY);

    const keys = actions(subtree(await (await band($)).drawn(), "nav"));
    expect(keys).not.toContain("tab:board");
    expect(keys).toContain("tab:backlog");
    await openInPane($, w, "board");
    expect((await paneActions($, w, "board")).body.length).toBeGreaterThan(0);
  });

  test("should draw the Board, the Backlog and the Detail in the band's overview at 120 columns within maxRows and the drawing limit", async ($, on) => {
    const w = await started($, on);
    const rows = 14;
    const seen: Record<string, string[]> = {};
    for (const view of ["board", "backlog", "detail"] as const) {
      await openInBand($, w, view);
      const drawn = await (await band($, rows)).drawn();
      seen[view] = render(drawn, 120);
      expect(seen[view]?.length, `${view}: ${seen[view]?.join("\n")}`).toBeLessThanOrEqual(rows);
      expect(JSON.stringify(drawn).length).toBeLessThan(100_000);
      await pressOn(() => band($), w, "band:summary");
    }
    expect(seen.board?.some((line) => line.includes("BU-"))).toBe(true);
    expect(seen.backlog?.some((line) => line.includes("open issues"))).toBe(true);
    expect(seen.detail?.some((line) => line.includes(DETAIL_TASK))).toBe(true);
  });

  test("should run a band press of a view's menu item on the band's view, leaving the pane's view as it was", async ($, on) => {
    const w = await started($, on);
    await openInPane($, w, "tasks");
    await openInBand($, w, "backlog");

    const count = async () => (await (await band($)).find({ key: "backlog-count" }))?.text ?? "";
    const before = await count();
    await pressOn(() => band($), w, BAND_MENU_KEY);
    await pressOn(() => band($), w, `${MENU_ITEM}view.sort`);

    expect(await count()).not.toBe(before);
    expect(await (await pane($)).find({ key: "section:tasks" })).toBeDefined();
  });
});
