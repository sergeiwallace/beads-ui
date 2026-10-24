import type { On, RenderElement, RenderPropsOf } from "claude-code";
import type { Engine, Mounted as KitMounted } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import {
  COMMANDS,
  INITIAL_BOARD_STATE,
  reduceBoard,
  type TaskClientProps,
} from "../core/src/index.ts";
import { allIssues, storeStatuses } from "../core/test/helpers.ts";
import type { Host } from "./host.ts";
import { BeadsPane, type PaneUi, type TasksRegion } from "./pane.ts";
import { ROW_OPEN_LABEL, TASKS_CLIENT_KEY } from "./panel.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { StoreResolver } from "./store.ts";
import { test } from "./tests/kit.ts";
import { MINE, MINE_ORDER } from "./tests/mine.ts";
import { overflows } from "./tests/width.ts";
import { CWD, PANE_PROPS, SESSION, SHOW, VIEWPORT, world } from "./tests/world.ts";

// Phase 2B's task panel, slice 2 (T-2B.5, D-31): the mouse. In the terminal and the desktop a
// Client draws the Tasks view's rows and posts what a click or a key did; the hooks run the
// pane's own actions for each post. In VS Code, and after a Client fault, the element tree draws
// the same list. Each test drives the pane as Claude Code mounts it, but for the fault, which the
// kit cannot raise.

type Surface = "terminal" | "desktop" | "vscode";

const IN = { in: TASKS_CLIENT_KEY } as const;
/** The fixture's BU-mg2.3.9, the third row, as its display id reads. */
const BLOCKED_NAME = "BU-t-1-5-delete-xmxe";

/**
 * The pane mounted on a surface. Typed as the terminal's drawing, whose acts include a Client's;
 * a test acts on a VS Code drawing only by press and find.
 */
const mountOn = (
  $: Engine,
  surface: Surface,
  props: Partial<RenderPropsOf["Pane"]> = {},
): Promise<KitMounted<"terminal", "Pane">> =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface,
    component: "Pane",
    props: { ...PANE_PROPS, ...props },
    requestId: PANE_ID,
    viewport: { ...VIEWPORT, columns: Math.max(VIEWPORT.columns, (props.bodyColumns ?? 0) * 2) },
  }) as Promise<KitMounted<"terminal", "Pane">>;

async function openOn(
  $: Engine,
  on: On,
  surface: Surface,
  props: Partial<RenderPropsOf["Pane"]> = {},
) {
  const w = world(on, MINE);
  // Beneath the plugin: each redraw the pane asks for. A Client post that reaches the pane's
  // state asks for one; nothing else in these tests does once the pane is drawn.
  let invalidated = 0;
  on("ui.invalidate", (_engine, e, next) => {
    invalidated++;
    return next(e);
  });
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const ui = await mountOn($, surface, props);
  return { w, ui, invalidated: () => invalidated };
}

type Mounted = Awaited<ReturnType<typeof mountOn>>;

const keysOf = async (ui: Mounted, prefix: string, query: Record<string, string> = {}) =>
  (await ui.findAll(query))
    .map((element) => element.key ?? "")
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));

/** The Client's props as the hooks handed them. */
const clientProps = async (ui: Mounted): Promise<TaskClientProps | undefined> =>
  (await ui.find({ key: TASKS_CLIENT_KEY }))?.props.props as TaskClientProps | undefined;

/** The rows the Client drew, by task id. */
const clientRows = async (ui: Mounted) => keysOf(ui, "trow:", { in: TASKS_CLIENT_KEY });

const click = (ui: Mounted, y: number, button: "left" | "right", x = 2) =>
  ui.pointer({ type: "down", x, y, button, ...IN });

/** The person's Tab or arrow onto an element, as the engine raises it. */
const focusOn = ($: Engine, element: string) =>
  $.ui.focus({
    component: "Pane",
    requestId: PANE_ID,
    plugin: PLUGIN_NAME,
    element,
    origin: { kind: "person" },
  } as never);

const hotkeyOf = (command: string) => {
  const binding = COMMANDS.find((one) => one.id === command)?.binding;
  return binding?.kind === "hotkey" ? binding.key : "";
};

describe("the Client path, chosen by surface (T-2B.5)", () => {
  for (const surface of ["terminal", "desktop"] as const) {
    test(`should draw the task list as a Client in the ${surface}, with each row's open and menu buttons beside it`, async ($, on) => {
      const { ui } = await openOn($, on, surface);

      expect(await ui.find({ key: TASKS_CLIENT_KEY })).toMatchObject({ type: "Client" });
      expect(await clientRows(ui)).toEqual(MINE_ORDER.slice(0, 10));
      expect(await keysOf(ui, "task:", { type: "Button" })).toEqual(MINE_ORDER.slice(0, 10));
      expect((await ui.find({ key: "task:BU-mg2" }))?.props.label).toBe(ROW_OPEN_LABEL);
      expect(await keysOf(ui, "taskmenu:", { type: "Button" })).toEqual(MINE_ORDER.slice(0, 10));
    });
  }

  test("should open a task with Enter on its row from the keyboard alone, the Client never clicked", async ($, on) => {
    const { w, ui } = await openOn($, on, "terminal");

    await focusOn($, "task:BU-mg2.3");
    expect((await clientProps(ui))?.selected).toBe("BU-mg2.3");
    // Enter on the focused element presses it.
    await ui.press({ key: "task:BU-mg2.3" });
    await w.clock.settle();

    expect(w.keys()).toContain("bd show BU-mg2.3");
    expect(await ui.find({ key: "edit:status" })).toBeDefined();
  });

  test("should draw the task list with the element tree in VS Code, which draws no Client", async ($, on) => {
    const { ui } = await openOn($, on, "vscode");

    expect(await ui.find({ key: TASKS_CLIENT_KEY })).toBeUndefined();
    expect(await keysOf(ui, "task:", { type: "Button" })).toEqual(MINE_ORDER.slice(0, 10));
    expect(await keysOf(ui, "taskmenu:", { type: "Button" })).toEqual(MINE_ORDER.slice(0, 10));
  });

  for (const columns of [40, 64, 120]) {
    test(`should draw no Client row and no line past ${columns} columns, the menu open over the rows`, async ($, on) => {
      const { ui } = await openOn($, on, "terminal", { bodyColumns: columns });

      await click(ui, 2, "right", columns);
      expect(await ui.find({ key: "options-menu" })).toBeDefined();
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
      expect(overflows(await ui.drawn(IN), columns)).toEqual([]);
    });
  }
});

describe("the mouse on the Client (T-2B.5)", () => {
  test("should select a task on a left click and open it on a second left click", async ($, on) => {
    const { w, ui } = await openOn($, on, "terminal");

    await click(ui, 1, "left");
    expect((await clientProps(ui))?.selected).toBe("BU-mg2.3");
    expect(w.keys()).not.toContain("bd show BU-mg2.3");
    await click(ui, 1, "left");
    await w.clock.settle();

    expect(w.keys()).toContain("bd show BU-mg2.3");
    expect(await ui.find({ key: "edit:status" })).toBeDefined();
    expect(await ui.find({ key: TASKS_CLIENT_KEY })).toBeUndefined();
  });

  test("should open the selected task on Enter once a click has given the Client the keys", async ($, on) => {
    const { w, ui } = await openOn($, on, "terminal");

    await click(ui, 2, "left");
    await ui.key({ key: "return", ...IN });
    await w.clock.settle();

    expect(w.keys()).toContain("bd show BU-mg2.3.9");
  });

  test("should open the options menu about a task at the pointer on a right click, listing its actions with their keys", async ($, on) => {
    const { w, ui } = await openOn($, on, "terminal");

    await click(ui, 2, "right", 9);
    expect((await ui.find({ key: "menu:task" }))?.text).toBe(`Task ${BLOCKED_NAME}`);
    expect((await ui.find({ key: "menu:item:card.detail" }))?.props.label).toBe("d: Detail");
    const anchor = await ui.find({ key: "menu-anchor" });
    expect(anchor?.props).toMatchObject({ position: "absolute", top: 3, left: 9 });
    // The Client leaves the menu's rows empty under that task, and the rows below move down.
    const props = await clientProps(ui);
    expect(props?.gapAfter).toBe("BU-mg2.3.9");
    expect((await ui.find({ key: "menu-room", ...IN }))?.props.height).toBe(props?.gapRows);
    expect(await ui.find({ key: "taskmenus-room" })).toBeDefined();

    await ui.press({ key: "menu:item:card.detail" });
    await w.clock.settle();
    expect(w.keys()).toContain("bd show BU-mg2.3.9");
  });

  test("should keep a right-clicked menu inside the view when the pointer is near its right edge", async ($, on) => {
    const { ui } = await openOn($, on, "terminal", { bodyColumns: 64 });

    await click(ui, 0, "right", 60);
    const anchor = await ui.find({ key: "menu-anchor" });
    const left = Number(anchor?.props.left);
    const width = Number(anchor?.props.width);
    expect(left).toBeLessThan(60);
    expect(left + width).toBeLessThanOrEqual(64);
  });

  test("should light the row under the pointer by a hover style alone, posting nothing for a hover or a move", async ($, on) => {
    const { w, ui, invalidated } = await openOn($, on, "terminal");
    const before = { redraws: invalidated(), runs: w.keys().length, props: await clientProps(ui) };

    for (const id of MINE_ORDER.slice(0, 10)) {
      const row = await ui.find({ key: `trow:${id}`, ...IN });
      expect(JSON.stringify(row)).toContain('"hover":{"inverse":true}');
    }
    await ui.pointer({ type: "enter", x: 0, y: 0, ...IN });
    for (let y = 0; y < 10; y++) await ui.pointer({ type: "move", x: 3, y, ...IN });
    await ui.pointer({ type: "leave", x: 3, y: 9, ...IN });
    await w.clock.settle();
    expect({ redraws: invalidated(), runs: w.keys().length, props: await clientProps(ui) }).toEqual(
      before,
    );

    // The control: a click on the same rows reaches the pane, which asks for a redraw.
    await click(ui, 0, "left");
    expect(invalidated()).toBeGreaterThan(before.redraws);
    expect((await clientProps(ui))?.selected).toBe("BU-mg2");
  });
});

describe("each post runs what its key or button runs (T-2B.5)", () => {
  /** What the pane asked of bd and of the focus ring, and what it drew, after one act. */
  const after = async (w: ReturnType<typeof world>, ui: Mounted, act: () => Promise<unknown>) => {
    const runs = w.keys().length;
    const focused = w.focused.length;
    await act();
    await w.clock.settle();
    return {
      ran: w.keys().slice(runs),
      // Where the pane moved the ring; the person's own Tab is the act, not its effect.
      focused: w.focused
        .slice(focused)
        .filter((one) => (one.origin as { kind?: string } | undefined)?.kind !== "person")
        .map((one) => one.element),
      menu: await keysOf(ui, "menu:item:", { type: "Button" }),
      title: (await ui.find({ key: "menu:task" }))?.text,
      detail: (await ui.find({ key: "edit:status" })) !== undefined,
    };
  };

  /** Back to the Tasks view, the menu shut and the focus on a task no case acts on. */
  const reset = async ($: Engine, ui: Mounted) => {
    if ((await ui.find({ key: "menu:close" })) !== undefined) await ui.press({ key: "menu:close" });
    await ui.press({ key: "tab:tasks" });
    await focusOn($, "task:BU-2zw");
  };

  const CASES: {
    name: string;
    element: ($: Engine, ui: Mounted) => Promise<unknown>;
    client: ($: Engine, ui: Mounted) => Promise<unknown>;
  }[] = [
    {
      name: "open, as the row's own button",
      element: (_$, ui) => ui.press({ key: "task:BU-mg2.3" }),
      client: (_$, ui) => ui.post({ kind: "open", id: "BU-mg2.3" }, IN),
    },
    {
      name: "menu, as the row's menu button",
      element: (_$, ui) => ui.press({ key: "taskmenu:BU-mg2.3.9" }),
      client: (_$, ui) => ui.post({ kind: "menu", id: "BU-mg2.3.9", x: 0 }, IN),
    },
    {
      name: "select then d, as the focus ring then d",
      element: async ($, ui) => {
        await focusOn($, "task:BU-mg2.3.5");
        await ui.press({ key: "detail" });
      },
      client: async (_$, ui) => {
        await ui.post({ kind: "select", id: "BU-mg2.3.5" }, IN);
        await ui.press({ key: "detail" });
      },
    },
    {
      name: "the m key on the selected task, as m on the focused one",
      element: async ($, ui) => {
        await focusOn($, "task:BU-mg2.3");
        await ui.press({ key: "move" });
      },
      client: async (_$, ui) => {
        await click(ui, 1, "left");
        await ui.key({ key: hotkeyOf("card.move"), ...IN });
      },
    },
    {
      name: "the menu key on the selected task, as k on the focused one",
      element: async ($, ui) => {
        await focusOn($, "task:BU-mg2.3");
        await ui.press({ key: "menu" });
      },
      client: async (_$, ui) => {
        await click(ui, 1, "left");
        await ui.key({ key: hotkeyOf("panel.menu"), ...IN });
      },
    },
  ];

  for (const one of CASES) {
    test(`should run ${one.name}`, async ($, on) => {
      // One pane drawn twice: in VS Code by the element tree, in the terminal with the Client.
      const { w, ui: terminal } = await openOn($, on, "terminal");
      const vscode = await mountOn($, "vscode");
      await reset($, vscode);

      const element = await after(w, vscode, () => one.element($, vscode));
      await reset($, vscode);
      const client = await after(w, terminal, () => one.client($, terminal));

      // The act did something to compare: bd ran, the ring moved or the menu opened.
      expect(element.ran.length + element.focused.length + element.menu.length).toBeGreaterThan(0);
      expect(client).toEqual(element);
    });
  }

  test("should drop a post about a task the Client was not handed, or of a kind it does not send", async ($, on) => {
    const { w, ui } = await openOn($, on, "terminal");
    const before = w.keys().length;

    await ui.post({ kind: "open", id: "BU-not-listed" }, IN);
    await ui.post({ kind: "run", id: "BU-mg2", command: "not.a.command" }, IN);
    await ui.post({ kind: "delete", id: "BU-mg2" }, IN);
    await w.clock.settle();

    expect(w.keys().slice(before)).toEqual([]);
    expect(await ui.find({ key: "options-menu" })).toBeUndefined();
  });
});

describe("the element tree in VS Code (T-2B.5)", () => {
  test("should reach every action by key and by menu, and open each row's menu with its button", async ($, on) => {
    const { ui } = await openOn($, on, "vscode");

    const drawn = (await ui.findAll({ type: "Button" }))
      .filter((button) => !(button.key ?? "").startsWith("menu:"))
      .map((button) => button.props.hotkey)
      .filter((key): key is string => typeof key === "string" && key !== "");
    await ui.press({ key: "taskmenu:BU-mg2.3.9" });
    expect((await ui.find({ key: "menu:task" }))?.text).toBe(`Task ${BLOCKED_NAME}`);
    const listed = (await keysOf(ui, "menu:item:", { type: "Button" })).map(hotkeyOf);
    expect([...new Set(drawn)].sort()).toEqual([...new Set(listed)].filter((k) => k !== "").sort());
  });
});

// The kit raises no `ui.fault` of a test's making, and the task list's Client has no input it
// fails on, so these drive the pane as register.ts's `ui.fault` hook does: `clientFault` with the
// faulted instance's key, then the next draw.
describe("the element tree in place of the Client after a fault (T-2B.5)", () => {
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
  const REGION: TasksRegion = (props) =>
    ({ type: "Client", props: { key: TASKS_CLIENT_KEY, props } }) as unknown as RenderElement;
  const FRAME = { width: 117, bodyColumns: 118, placement: "dock", bodyRows: 28 };

  const nodes = (node: unknown, out: Node[] = []): Node[] => {
    if (typeof node !== "object" || node === null) return out;
    const one = node as Node;
    out.push(one);
    const children = one.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) nodes(child, out);
    return out;
  };
  const keysIn = (tree: unknown, prefix: string) =>
    nodes(tree)
      .map((node) => String(node.props?.key ?? ""))
      .filter((key) => key.startsWith(prefix));

  async function drawnPane() {
    const pane = new BeadsPane(new StoreResolver());
    let redraws = 0;
    const host = {
      invalidate: () => {
        redraws++;
      },
      storeGet: async () => undefined,
      storeSet: async () => undefined,
      focus: async () => ({}),
    } as unknown as Host;
    // Bound without the first refresh bind starts: the board and the store are the fixture's.
    pane.host = host;
    await pane.panel.bind(host);
    pane.store = { ok: true, path: CWD, via: "directory" };
    pane.board = reduceBoard(INITIAL_BOARD_STATE, {
      type: "load-succeeded",
      issues: allIssues(),
      statuses: storeStatuses(),
      at: "2026-10-21T01:12:04Z",
    });
    return { pane, draw: () => pane.draw(UI, FRAME, undefined, REGION), redraws: () => redraws };
  }

  test("should draw the list with the element tree once the Client faults, and keep it for the session", async () => {
    const { pane, draw, redraws } = await drawnPane();
    /** Each row's own button label: the open glyph beside a Client's row, the row's text alone. */
    const labels = () =>
      nodes(draw())
        .filter((node) => String(node.props.key ?? "").startsWith("task:"))
        .map((node) => String(node.props.label));
    expect(keysIn(draw(), TASKS_CLIENT_KEY)).toEqual([TASKS_CLIENT_KEY]);
    const shown = keysIn(draw(), "taskmenu:");
    expect(labels()).toEqual(shown.map(() => ROW_OPEN_LABEL));

    pane.clientFault(TASKS_CLIENT_KEY);
    expect(redraws()).toBe(1);
    expect(keysIn(draw(), TASKS_CLIENT_KEY)).toEqual([]);
    expect(keysIn(draw(), "task:").map((key) => key.slice("task:".length))).toEqual(
      shown.map((key) => key.slice("taskmenu:".length)),
    );
    expect(labels().every((label) => label !== ROW_OPEN_LABEL && label.length > 2)).toBe(true);

    pane.setTab("board");
    pane.setTab("tasks");
    pane.clientFault(TASKS_CLIENT_KEY);
    expect(redraws()).toBeGreaterThan(1);
    expect(keysIn(draw(), TASKS_CLIENT_KEY)).toEqual([]);
    expect(keysIn(draw(), "task:").length).toBe(shown.length);
  });

  test("should keep the Client when another Client of the pane faults", async () => {
    const { pane, draw } = await drawnPane();

    pane.clientFault("hello");
    expect(keysIn(draw(), TASKS_CLIENT_KEY)).toEqual([TASKS_CLIENT_KEY]);
  });

  test("should open a row's menu under it when its menu button is pressed after a fault", async () => {
    const { pane, draw } = await drawnPane();
    pane.clientFault(TASKS_CLIENT_KEY);
    const [first] = keysIn(draw(), "taskmenu:");
    const press = nodes(draw()).find((node) => node.props.key === first)?.props.onPress;

    expect(typeof press).toBe("function");
    (press as () => void)();
    await Promise.resolve();
    const keys = nodes(draw()).map((node) => String(node.props.key ?? ""));
    const id = String(first).slice("taskmenu:".length);
    expect(keys.indexOf("options-menu")).toBeGreaterThan(keys.indexOf(`taskrow:${id}`));
    expect(keys.filter((key) => key.startsWith("menu:item:")).length).toBeGreaterThan(0);
  });
});

describe("both paths from one view model (T-2B.5, D-31)", () => {
  test("should list the same tasks and expose the same actions on a task in the Client and the element tree", async ($, on) => {
    // One pane, so one view model, drawn by both paths: the terminal's Client, VS Code's tree.
    const { ui: terminal } = await openOn($, on, "terminal");
    const vscode = await mountOn($, "vscode");
    const toolbar = async (ui: Mounted) =>
      (await ui.findAll({ type: "Button" }))
        .filter((button) => !/^(menu|task|taskmenu|tab):/.test(button.key ?? ""))
        .map((button) => `${button.key}=${String(button.props.hotkey)}`)
        .sort();
    const menuOf = async (ui: Mounted) => ({
      title: (await ui.find({ key: "menu:task" }))?.text,
      items: await keysOf(ui, "menu:item:", { type: "Button" }),
    });

    const client = {
      rows: await clientRows(terminal),
      menus: await keysOf(terminal, "taskmenu:", { type: "Button" }),
      toolbar: await toolbar(terminal),
    };
    const element = {
      rows: await keysOf(vscode, "task:", { type: "Button" }),
      menus: await keysOf(vscode, "taskmenu:", { type: "Button" }),
      toolbar: await toolbar(vscode),
    };
    expect(client).toEqual(element);

    await click(terminal, 2, "right");
    const clientMenu = await menuOf(terminal);
    // The keys a focused Client hands back: every key its menu lists.
    const clientKeys = ((await clientProps(terminal))?.keys ?? []).map((key) => key.key).sort();
    await terminal.press({ key: "menu:close" });
    await vscode.press({ key: "taskmenu:BU-mg2.3.9" });
    const elementMenu = await menuOf(vscode);
    const elementKeys = [...new Set(elementMenu.items.map(hotkeyOf).filter((key) => key !== ""))];

    expect(clientMenu.title).toBe(`Task ${BLOCKED_NAME}`);
    expect(clientMenu).toEqual(elementMenu);
    expect(clientKeys).toEqual(elementKeys.sort());
  });
});
