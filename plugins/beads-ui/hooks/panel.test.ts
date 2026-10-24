import type { On, RenderPropsOf } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { COMMANDS, NAV_ENTRIES, wakeFileName } from "../core/src/index.ts";
import list from "../core/test/fixtures/bd-list-all-brief.json.ts";
import { SPRINT_PLANNED_TEXT } from "./pane.ts";
import { PANEL_SETTINGS_KEY } from "./panel.ts";
import { CONFIRM_ID, PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { ME, MINE, MINE_ORDER, ownStore } from "./tests/mine.ts";
import { overflows } from "./tests/width.ts";
import {
  CWD,
  ok,
  PANE_PROPS,
  SESSION,
  SHOW,
  STATE_DIR,
  STORE_LIST,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// Phase 2B's task panel, slice 1 (T-2B.1 to T-2B.4 and T-2B.8): the nav and its width tiers, the
// Tasks view's shown and collapsed tasks, opening and editing a task, the options menu, and the
// Settings view, each driven through the pane as Claude Code mounts it. They mount it in VS Code,
// which draws no Client, so the list is the element tree's: the path the terminal and the desktop
// fall back to (T-2B.5). mouse.test.ts drives the Client path.

type PaneProps = RenderPropsOf["Pane"];

const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";

async function openPanel(
  $: Engine,
  on: On,
  options: WorldOptions = MINE,
  props: Partial<PaneProps> = {},
) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const ui = await $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "vscode",
    component: "Pane",
    props: { ...PANE_PROPS, ...props },
    requestId: PANE_ID,
    viewport: { ...VIEWPORT, columns: Math.max(VIEWPORT.columns, (props.bodyColumns ?? 0) * 2) },
  });
  return { w, ui };
}

type Mounted = Awaited<ReturnType<typeof openPanel>>["ui"];

const keysOf = async (ui: Mounted, prefix: string, type?: string) =>
  (await ui.findAll(type === undefined ? {} : { type }))
    .map((element) => element.key ?? "")
    .filter((key) => key.startsWith(prefix));

const taskIds = async (ui: Mounted) =>
  (await keysOf(ui, "task:", "Button")).map((key) => key.slice("task:".length));

/** The person's Tab or arrow onto an element, as the engine raises it. */
const focusOn = ($: Engine, element: string) =>
  $.ui.focus({
    component: "Pane",
    requestId: PANE_ID,
    plugin: PLUGIN_NAME,
    element,
    origin: { kind: "person" },
  } as never);

/** Every hotkey a drawn Button carries, the options menu's own rows excluded. */
const drawnHotkeys = async (ui: Mounted) =>
  (await ui.findAll({ type: "Button" }))
    .filter((button) => !(button.key ?? "").startsWith("menu:"))
    .map((button) => button.props.hotkey)
    .filter((key): key is string => typeof key === "string")
    .sort();

/** The key each options-menu row names, read from the row as it is drawn. */
const menuHotkeys = async (ui: Mounted) =>
  (await keysOf(ui, "menu:item:", "Button")).map((key) => {
    const command = COMMANDS.find((one) => one.id === key.slice("menu:item:".length));
    return command?.binding.kind === "hotkey" ? command.binding.key : `(no key: ${key})`;
  });

describe("the frame, nav bar and width tiers (T-2B.1)", () => {
  test("should open on the Tasks view, with a nav to Tasks, Board, Backlog, Sprint, Timeline and Settings", async ($, on) => {
    const { ui } = await openPanel($, on);

    expect(await ui.find({ key: "tasks-count" })).toBeDefined();
    const nav = await keysOf(ui, "tab:", "Button");
    for (const view of ["tasks", "board", "backlog", "sprint", "timeline", "settings"]) {
      expect(nav).toContain(`tab:${view}`);
    }
    expect((await ui.find({ key: "tab:sprint" }))?.props).toMatchObject({ dimColor: true });
  });

  test("should say Sprint is planned and stay on the Tasks view when it is pressed", async ($, on) => {
    const { ui } = await openPanel($, on);

    await ui.press({ key: "tab:sprint" });
    expect((await ui.find({ key: "notice" }))?.text).toBe(SPRINT_PLANNED_TEXT);
    expect(await ui.find({ key: "tasks-count" })).toBeDefined();
  });

  const TIERS: [number, "side" | "top" | "glyph"][] = [
    [40, "glyph"],
    [48, "top"],
    [64, "top"],
    [72, "side"],
    [80, "side"],
    [120, "side"],
  ];
  for (const [columns, kind] of TIERS) {
    test(`should draw a ${kind} nav and no line past ${columns} columns on the Tasks view, its expanded list, the menu and Settings`, async ($, on) => {
      const { ui } = await openPanel($, on, MINE, { bodyColumns: columns });
      const nav = await ui.find({ key: "nav" });
      const backlog = (await ui.find({ key: "tab:backlog" }))?.props.label;

      expect(nav?.props.borderStyle).toBe(kind === "side" ? "round" : undefined);
      expect(backlog).toBe(kind === "side" ? "Backlog" : kind === "top" ? "Bklg" : "☰");
      expect((await ui.find({ key: "tab:backlog" }))?.props.hotkey).toBe("2");
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
      await ui.press({ key: "tasks:more" });
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
      await focusOn($, "task:BU-mg2.3");
      await ui.press({ key: "menu" });
      expect(await ui.find({ key: "options-menu" })).toBeDefined();
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
      await ui.press({ key: "tab:settings" });
      expect(await ui.find({ key: "settings" })).toBeDefined();
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
    });
  }

  test("should redraw in the new tier on a resize and keep the open view and the focused task", async ($, on) => {
    const { w, ui } = await openPanel($, on);
    await focusOn($, "task:BU-mg2.3.9");

    await ui.redraw({ ...PANE_PROPS, bodyColumns: 40 });
    expect((await ui.find({ key: "tab:tasks" }))?.props.label).toBe("✓");
    expect(await ui.find({ key: "tasks-count" })).toBeDefined();
    expect(overflows(await ui.drawn(), 40)).toEqual([]);

    await ui.press({ key: "detail" });
    await w.clock.settle();
    expect(w.keys()).toContain("bd show BU-mg2.3.9");
  });

  const SHORT: Partial<PaneProps>[] = [
    { placement: "inline", scroll: { offset: 0, bodyRows: 10 } },
    { placement: "dock", scroll: { offset: 0, bodyRows: 11 } },
  ];
  for (const props of SHORT) {
    test(`should turn the side nav into the top bar and keep the focused task in view when ${props.placement} with ${props.scroll?.bodyRows} rows`, async ($, on) => {
      const { ui } = await openPanel($, on, MINE, { ...props, bodyColumns: 118 });
      await ui.press({ key: "tasks:more" });

      expect((await ui.find({ key: "nav" }))?.props.borderStyle).toBeUndefined();
      expect((await ui.find({ key: "tab:backlog" }))?.props.label).toBe("Bklg");
      // The window round the focus follows each step down the list to its last task.
      for (const id of MINE_ORDER) {
        await focusOn($, `task:${id}`);
        const drawn = await taskIds(ui);
        expect(drawn).toContain(id);
        expect(drawn.length).toBeLessThan(MINE_ORDER.length);
      }
      expect((await ui.find({ key: "tasks-above" }))?.text).toMatch(/^↑ \d+ above$/);
    });
  }
});

describe("the task list, shown and collapsed (T-2B.2)", () => {
  test("should list the session's own tasks in progress first, then blocked, then open, the first 10 and a +5 more control", async ($, on) => {
    const { ui } = await openPanel($, on);

    expect(await taskIds(ui)).toEqual(MINE_ORDER.slice(0, 10));
    expect((await ui.find({ key: "tasks:more" }))?.props).toMatchObject({
      label: "+5 more",
      hotkey: "r",
    });
    expect((await ui.find({ key: "tasks-count" }))?.text).toBe(
      "15 tasks: 2 in progress, 1 blocked, 12 open",
    );
    expect((await ui.find({ key: "task:BU-mg2.3.9" }))?.props.label).toMatch(/^● P1 /);
  });

  test("should expand the collapsed tasks in place when +5 more is pressed, and reach each one by key", async ($, on) => {
    const { w, ui } = await openPanel($, on);

    await ui.press({ key: "tasks:more" });

    expect(await taskIds(ui)).toEqual(MINE_ORDER);
    expect((await ui.find({ key: "tasks:more" }))?.props.label).toBe("show fewer");
    for (const id of MINE_ORDER) {
      await focusOn($, `task:${id}`);
      await ui.press({ key: "menu" });
      expect((await ui.find({ key: "menu:task" }))?.text).toMatch(/^Task BU-/);
      expect(await ui.find({ key: `taskrow:${id}` })).toBeDefined();
      await ui.press({ key: "menu" });
    }
    await focusOn($, "task:BU-2zw");
    await ui.press({ key: "detail" });
    await w.clock.settle();
    expect(w.keys()).toContain("bd show BU-2zw");
  });

  // 300 open tasks of the session's, each with a long title: expanded, the list draws a window of
  // rows that follows the focus, so the drawing stays under the 100,000 characters Claude Code
  // keeps and Down still reaches the last task.
  test(
    "should keep an expanded list of 300 tasks under the drawing limit and reach the last one by stepping down",
    { timeoutMs: 60_000 },
    async ($, on) => {
      const [first] = JSON.parse(list) as Record<string, unknown>[];
      const rows = Array.from({ length: 300 }, (_, i) => ({
        ...first,
        id: `BU-load${i}`,
        status: "open",
        assignee: ME,
        title: `task number ${i} with a title long enough to fill the whole of a wide row and more`,
        metadata: { display_id: `BU-task-number-${i}-with-a-long-display-id-load` },
        labels: [`id:BU-task-number-${i}-with-a-long-display-id-load`],
        created_at: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(),
      }));
      const { ui } = await openPanel($, on, {
        ...MINE,
        script: (key) => (key === STORE_LIST ? ok(JSON.stringify(rows)) : undefined),
      });
      await ui.press({ key: "tasks:more" });
      let largest = 0;
      const reached = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const drawn = await taskIds(ui);
        largest = Math.max(largest, JSON.stringify(await ui.drawn()).length);
        expect(drawn).toContain(`BU-load${i}`);
        reached.add(`BU-load${i}`);
        await focusOn($, `task:BU-load${i}`);
      }

      expect(reached.size).toBe(300);
      expect(largest).toBeLessThan(100_000);
      expect((await ui.find({ key: "tasks-above" }))?.text).toMatch(/^↑ \d+ above$/);
    },
  );

  test("should list every owner's tasks when a switches to All", async ($, on) => {
    const { ui } = await openPanel($, on);

    await ui.press({ key: "scope" });

    expect((await ui.find({ key: "tasks-count" }))?.text).toBe(
      "22 tasks: 2 in progress, 1 blocked, 19 open",
    );
  });

  test("should apply a new shown count from Settings at once, keep it in $.store and save it to beads-ui.toml", async ($, on) => {
    const { w, ui } = await openPanel($, on);

    await ui.press({ key: "tab:settings" });
    await ui.input({ key: "settings:shown", text: "3" });
    expect(w.store.get(PANEL_SETTINGS_KEY)).toEqual({ shown: 3 });
    await ui.press({ key: "tab:tasks" });
    expect(await taskIds(ui)).toEqual(MINE_ORDER.slice(0, 3));
    expect((await ui.find({ key: "tasks:more" }))?.props.label).toBe("+12 more");

    await ui.press({ key: "tab:settings" });
    await ui.press({ key: "settings:save" });
    await w.clock.settle();
    expect(w.files.get(USER_CONFIG)).toContain(
      '[panel]\nshown = 3\ncollapse = "rest"\nmode = "both"',
    );
    expect(w.store.get(PANEL_SETTINGS_KEY)).toEqual({});
  });

  test("should name a shown count it cannot use and change nothing", async ($, on) => {
    const { w, ui } = await openPanel($, on);

    await ui.press({ key: "tab:settings" });
    await ui.input({ key: "settings:shown", text: "lots" });

    expect((await ui.find({ key: "settings:notice" }))?.text).toBe(
      '"lots" is not a whole number from 1 to 200',
    );
    expect(w.store.get(PANEL_SETTINGS_KEY)).toBeUndefined();
  });

  test("should draw a beads-ui.toml shown count and collapse rule at the next redraw after the file changes", async ($, on) => {
    const { w, ui } = await openPanel($, on);
    expect(await taskIds(ui)).toHaveLength(10);

    w.files.set(USER_CONFIG, '[panel]\nshown = 1\ncollapse = "open"\n');
    await w.clock.advance(10_000);
    await w.clock.settle();

    // Open collapses; the in-progress and blocked tasks stay drawn.
    expect(await taskIds(ui)).toEqual(["BU-mg2", "BU-mg2.3", "BU-mg2.3.9"]);
    expect((await ui.find({ key: "tasks:more" }))?.props.label).toBe("+12 more");

    w.files.set(USER_CONFIG, '[panel]\ncollapse = "none"\n');
    await w.clock.advance(10_000);
    await w.clock.settle();
    expect(await taskIds(ui)).toEqual(MINE_ORDER);
    expect(await ui.find({ key: "tasks:more" })).toBeUndefined();
  });

  test("should name a [panel] setting it cannot use and keep its default", async ($, on) => {
    const { ui } = await openPanel($, on, {
      ...MINE,
      files: { [USER_CONFIG]: '[panel]\nshown = 0\ncollapse = "sometimes"\n' },
    });

    expect((await ui.find({ key: "config:0" }))?.text).toBe(
      "panel.shown must be a whole number from 1 to 200; using 10",
    );
    expect((await ui.find({ key: "config:1" }))?.text).toBe(
      'panel.collapse "sometimes" is not one of rest, open, none; using rest',
    );
    expect(await taskIds(ui)).toHaveLength(10);
  });
});

describe("open, read and edit a task (T-2B.3)", () => {
  const openTask = async ($: Engine, on: On) => {
    const opened = await openPanel($, on);
    await opened.ui.press({ key: "task:BU-mg2.3" });
    await opened.w.clock.settle();
    return opened;
  };

  test("should open the task's detail with every field bd show returned and an edit control for each editable one when its row is pressed", async ($, on) => {
    const { ui } = await openTask($, on);

    expect((await ui.find({ key: "detail-heading" }))?.text).toMatch(
      /^BU-beads-ui-claude-code-aeyb /,
    );
    for (const key of ["field:id", "field:displayId", "field:createdAt", "field:updatedAt"]) {
      expect(await ui.find({ key })).toBeDefined();
    }
    const controls = {
      title: "Input",
      status: "Select",
      priority: "Select",
      type: "Select",
      labels: "Input",
      assignee: "Input",
      due: "Input",
      description: "Input",
    };
    for (const [field, type] of Object.entries(controls)) {
      expect((await ui.find({ key: `edit:${field}` }))?.type).toBe(type);
    }
  });

  const EDITS: [string, "input" | "select", string, string][] = [
    ["title", "input", "beads-ui mod", "bd update BU-mg2.3 --title=beads-ui mod"],
    ["status", "select", "review", "bd update BU-mg2.3 --status review --if-status in_progress"],
    ["priority", "select", "0", "bd update BU-mg2.3 --priority=0"],
    ["type", "select", "feature", "bd update BU-mg2.3 --type=feature"],
    ["labels", "input", "id:BU-beads-ui-claude-code-aeyb, ui", "bd update BU-mg2.3 --add-label=ui"],
    ["assignee", "input", "aih-ec2-4", "bd update BU-mg2.3 --assignee=aih-ec2-4 --if-assignee="],
    ["due", "input", "2026-11-02", "bd update BU-mg2.3 --due=2026-11-02"],
    ["description", "input", "one\\ntwo", "bd update BU-mg2.3 --description=one\ntwo"],
  ];
  for (const [field, kind, value, argv] of EDITS) {
    test(`should write the ${field} edit with bd update, re-read the task and drop the wake marker`, async ($, on) => {
      const { w, ui } = await openTask($, on);
      const before = w.keys().length;

      if (kind === "input") await ui.input({ key: `edit:${field}`, text: value });
      else await ui.select({ key: `edit:${field}`, value });
      await w.clock.settle();

      const after = w.keys().slice(before);
      expect(after).toContain(argv);
      expect(after.slice(after.indexOf(argv))).toContain("bd show BU-mg2.3");
      expect(w.files.has(`${STATE_DIR}/wake/${wakeFileName(CWD)}`)).toBe(true);
    });
  }

  test("should open the focused task's detail on its status with m and on its title with e", async ($, on) => {
    const { w, ui } = await openPanel($, on);
    await focusOn($, "task:BU-mg2.3");

    await ui.press({ key: "edit" });
    await w.clock.settle();
    expect(await ui.find({ key: "edit:title" })).toBeDefined();
    expect(w.keys()).toContain("bd show BU-mg2.3");

    await ui.press({ key: "tab:tasks" });
    await focusOn($, "task:BU-mg2.3.5");
    await ui.press({ key: "move" });
    await w.clock.settle();
    expect(w.keys()).toContain("bd show BU-mg2.3.5");
    expect(await ui.find({ key: "edit:status" })).toBeDefined();
  });

  test("should say to focus a task first when d is pressed with none focused", async ($, on) => {
    const { ui } = await openPanel($, on);

    await ui.press({ key: "detail" });

    expect((await ui.find({ key: "notice" }))?.text).toBe(
      "focus a task first: Tab or the arrows move between tasks",
    );
  });
});

describe("every action by menu and by key (T-2B.4)", () => {
  // The parity test: in each view, the keys the drawn controls carry and the keys the options
  // menu lists are the same set, so no action is reachable only by key or only by menu.
  const VIEWS: {
    name: string;
    reach: (ui: Mounted, $: Engine, w: { clock: { settle(): Promise<unknown> } }) => Promise<void>;
  }[] = [
    { name: "Tasks", reach: async () => undefined },
    { name: "Tasks, expanded", reach: async (ui) => void (await ui.press({ key: "tasks:more" })) },
    { name: "Board", reach: async (ui) => void (await ui.press({ key: "tab:board" })) },
    { name: "Backlog", reach: async (ui) => void (await ui.press({ key: "tab:backlog" })) },
    {
      name: "Detail",
      reach: async (ui, _$, w) => {
        await ui.press({ key: "task:BU-mg2.3" });
        await w.clock.settle();
      },
    },
    { name: "Settings", reach: async (ui) => void (await ui.press({ key: "tab:settings" })) },
    { name: "Timeline", reach: async (ui) => void (await ui.press({ key: "tab:timeline" })) },
  ];
  for (const view of VIEWS) {
    test(`should list in the options menu every key the ${view.name} view draws, and draw a key for every action the menu lists`, async ($, on) => {
      const { w, ui } = await openPanel($, on);
      await view.reach(ui, $, w);
      const drawn = await drawnHotkeys(ui);

      await ui.press({ key: "menu" });
      const listed = await menuHotkeys(ui);

      expect([...new Set(listed)].sort()).toEqual([...new Set(drawn)].sort());
      expect(listed).toContain("k");
      for (const entry of NAV_ENTRIES) expect(listed).toContain(drawnKey(entry.command));
    });
  }

  test("should offer u to undo a Close instead made from the Tasks view, by key and in the menu", async ($, on) => {
    let closedYet = false;
    const { w, ui } = await openPanel($, on, {
      ...MINE,
      script: (key) =>
        key === STORE_LIST
          ? ok(
              JSON.stringify(
                ownStore().map((row) =>
                  row.id === "BU-mg2.3" && closedYet ? { ...row, status: "closed" } : row,
                ),
              ),
            )
          : undefined,
    });
    await focusOn($, "task:BU-mg2.3");
    await ui.press({ key: "delete" });
    await w.clock.settle();
    const confirm = await $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: CONFIRM_ID,
      viewport: VIEWPORT,
    });
    closedYet = true;
    await confirm.press({ key: "close-instead" });
    await w.clock.settle();

    expect((await ui.find({ key: "undo" }))?.props.hotkey).toBe("u");
    await ui.press({ key: "menu" });
    expect(await menuHotkeys(ui)).toContain("u");
    await ui.press({ key: "menu:item:close.undo" });
    await w.clock.settle();
    expect(w.keys()).toContain("bd update BU-mg2.3 --status in_progress --if-status closed");
  });

  const drawnKey = (command: string) => {
    const binding = COMMANDS.find((one) => one.id === command)?.binding;
    return binding?.kind === "hotkey" ? binding.key : "";
  };

  test("should open the menu about a task from its row's menu button, under that row, and run the item pressed", async ($, on) => {
    const { w, ui } = await openPanel($, on);

    await ui.press({ key: "taskmenu:BU-mg2.3.9" });
    const keys = (await ui.findAll({})).map((element) => element.key ?? "");
    expect(keys.indexOf("options-menu")).toBe(keys.indexOf("taskrow:BU-mg2.3.9") + 1 + 2);
    expect((await ui.find({ key: "menu:task" }))?.text).toBe("Task BU-t-1-5-delete-xmxe");
    expect((await ui.find({ key: "menu:item:card.detail" }))?.props.label).toBe("d: Detail");

    await ui.press({ key: "menu:item:card.detail" });
    await w.clock.settle();
    expect(await ui.find({ key: "options-menu" })).toBeUndefined();
    expect(w.keys()).toContain("bd show BU-mg2.3.9");
  });

  test("should run a nav item from the menu and close the menu with k", async ($, on) => {
    const { ui } = await openPanel($, on);

    await ui.press({ key: "menu" });
    await ui.press({ key: "menu:item:tab.board" });
    expect(await ui.find({ key: "column::open" })).toBeDefined();

    await ui.press({ key: "menu" });
    expect(await ui.find({ key: "options-menu" })).toBeDefined();
    await ui.press({ key: "menu" });
    expect(await ui.find({ key: "options-menu" })).toBeUndefined();
  });

  test("should name the menu key and every new key in the help", async ($, on) => {
    const { ui } = await openPanel($, on);

    await ui.press({ key: "help" });
    const help = (await ui.find({ key: "help", type: "Box" }))?.text ?? "";

    for (const line of [
      "t: Tasks",
      "5: Timeline",
      "6: Settings",
      "k: Options menu",
      "r: More or fewer tasks",
      "e: Edit",
    ]) {
      expect(help).toContain(line);
    }
  });
});

describe("the Settings view (T-2B.8)", () => {
  test("should offer the shown count, the collapse rule, panel.mode, debug mode, the band's parts and order and its done window", async ($, on) => {
    const { ui } = await openPanel($, on);

    await ui.press({ key: "tab:settings" });

    expect((await ui.find({ key: "settings:shown" }))?.props.value).toBe("10");
    expect((await ui.find({ key: "settings:collapse" }))?.props.value).toBe("rest");
    expect((await ui.find({ key: "settings:mode" }))?.props.value).toBe("both");
    expect((await ui.find({ key: "settings:debug" }))?.props.value).toBe("off");
    expect(await ui.find({ key: "band:window" })).toBeDefined();
    expect(await ui.find({ key: "band:toggle:total" })).toBeDefined();
    expect(await ui.find({ key: "band:left:open" })).toBeDefined();
    expect(await ui.find({ key: "band:save" })).toBeUndefined();
  });

  test("should apply panel.mode, the collapse rule, debug mode and a band change at once and save them all to beads-ui.toml", async ($, on) => {
    const { w, ui } = await openPanel($, on);
    await ui.press({ key: "tab:settings" });

    await ui.select({ key: "settings:mode", value: "beads" });
    await ui.select({ key: "settings:collapse", value: "none" });
    await ui.select({ key: "settings:debug", value: "on" });
    await ui.input({ key: "band:window", text: "7d" });
    await w.clock.settle();

    expect(w.store.get(PANEL_SETTINGS_KEY)).toEqual({ mode: "beads", collapse: "none" });
    expect(w.store.get("band-settings")).toEqual({ debug: true, doneWindow: "7d" });
    expect((await ui.find({ key: "settings:mode" }))?.props.value).toBe("beads");
    expect((await ui.find({ key: "settings:debug" }))?.props.value).toBe("on");
    await ui.press({ key: "tab:tasks" });
    expect(await taskIds(ui)).toEqual(MINE_ORDER);

    await ui.press({ key: "tab:settings" });
    await ui.press({ key: "settings:save" });
    await w.clock.settle();
    const saved = w.files.get(USER_CONFIG) ?? "";
    expect(saved).toContain('[panel]\nshown = 10\ncollapse = "none"\nmode = "beads"');
    expect(saved).toContain('[band]\ndone_window = "7d"');
    expect(saved).toContain("debug = true");
    expect(w.store.get(PANEL_SETTINGS_KEY)).toEqual({});
    expect(w.store.get("band-settings")).toEqual({});
    expect((await ui.find({ key: "settings:notice" }))?.text).toBe(
      `saved the panel and band settings to ${USER_CONFIG}`,
    );
    expect((await ui.find({ key: "settings:mode" }))?.props.value).toBe("beads");
  });
});
