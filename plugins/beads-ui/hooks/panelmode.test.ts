import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { RETIRED_PANEL_TOOL } from "../core/src/index.ts";
import { BEADS_BUTTON_KEY } from "./bands.ts";
import { NARROW_TEXT, NO_PANEL_TEXT, UNASKED_COLUMNS } from "./pane.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import {
  BAND_PROPS,
  BU,
  CWD,
  countScript,
  PANE_PROPS,
  SESSION,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// T-2B.7 (D-32): the task panel beside Claude Code's, then in its place. At session start,
// panel.mode both (the default) or beads opens the pane on the Tasks view, unasked and so
// unfocused; Claude Code places it from UNASKED_COLUMNS, and below that the band stays with a
// toast. native opens nothing and draws no Tasks view. Claude Code's task panel is retired when
// the settings deny TaskCreate by name, as ai-harness's per-profile switch (T-5.2) renders them.

const WIDE = UNASKED_COLUMNS + 16;
const RETIRED = {
  permissions: { deny: [RETIRED_PANEL_TOOL, "TaskGet", "TaskList", "TaskUpdate", "TodoWrite"] },
};
const modeFile = (mode: string) => ({ [`${CWD}/beads-ui.toml`]: `[panel]\nmode = "${mode}"\n` });
/** The session's store holds one open issue, so the band has a count to draw. */
const COUNTED = { script: countScript({ [CWD]: [{ status: "open" }] }) };

async function started($: Engine, on: Parameters<typeof world>[0], options: WorldOptions = {}) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await w.clock.settle();
  return w;
}

const pane = ($: Engine) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "Pane",
    props: PANE_PROPS,
    requestId: PANE_ID,
    viewport: { ...VIEWPORT, columns: WIDE },
  });

const band = ($: Engine) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: BAND_PROPS,
    viewport: VIEWPORT,
  });

const unasked = (w: ReturnType<typeof world>) =>
  w.opened.map((open) => [open.id, open.focus ?? "unfocused"]);

describe("the task panel at session start (T-2B.7)", () => {
  test("should open the pane once, unfocused, on the Tasks view when panel.mode is the default both", async ($, on) => {
    const w = await started($, on, { columns: WIDE, stored: { view: { view: "backlog" } } });
    await band($);
    await w.clock.settle();

    expect(unasked(w)).toEqual([[PANE_ID, "unfocused"]]);
    expect(w.toasts).toEqual([]);
    expect(await (await pane($)).find({ key: "tasks-count" })).toBeDefined();
  });

  test("should open the pane once, unfocused, on the Tasks view when beads-ui.toml sets panel.mode beads", async ($, on) => {
    const w = await started($, on, { columns: WIDE, files: modeFile("beads") });

    expect(unasked(w)).toEqual([[PANE_ID, "unfocused"]]);
    expect(await (await pane($)).find({ key: "tasks-count" })).toBeDefined();
  });

  test("should not open the pane a second time when the session starts again", async ($, on) => {
    const w = await started($, on, { columns: WIDE });

    await $.session.start(SESSION);
    await w.clock.settle();

    expect(unasked(w)).toEqual([[PANE_ID, "unfocused"]]);
  });

  test("should withdraw the open, keep the band and toast the width when Claude Code holds the pane unplaced", async ($, on) => {
    const w = await started($, on, { ...COUNTED, stored: { view: { view: "backlog" } } });

    expect(unasked(w)).toEqual([[PANE_ID, "unfocused"]]);
    expect(w.closed).toEqual([PANE_ID]);
    expect(w.toasts).toEqual([NARROW_TEXT]);
    expect(NARROW_TEXT).toContain(`${UNASKED_COLUMNS} terminal columns`);
    expect(await (await band($)).find({ key: BEADS_BUTTON_KEY })).toBeDefined();

    // The person's own open then lands on the view they kept, focused.
    await $.command.run(BU);
    await w.clock.settle();
    expect(w.opened.map((open) => open.focus)).toEqual([undefined, true]);
    expect(await (await pane($)).find({ key: "backlog-count" })).toBeDefined();
  });

  test("should open nothing unasked, draw no Tasks view and keep the band and /bu when panel.mode is native", async ($, on) => {
    const w = await started($, on, { ...COUNTED, columns: WIDE, files: modeFile("native") });

    expect(w.opened).toEqual([]);
    expect(w.toasts).toEqual([]);
    expect(await (await band($)).find({ key: BEADS_BUTTON_KEY })).toBeDefined();

    await $.command.run(BU);
    await w.clock.settle();
    const ui = await pane($);
    expect(w.opened.map((open) => [open.id, open.focus])).toEqual([[PANE_ID, true]]);
    expect(await ui.find({ key: "tab:tasks" })).toBeUndefined();
    expect(await ui.find({ key: "tasks-count" })).toBeUndefined();
    expect(await ui.find({ key: "tab:board" })).toBeDefined();
    await ui.press({ key: "menu" });
    expect(await ui.find({ key: "menu:item:tab.tasks" })).toBeUndefined();
    expect(await ui.find({ key: "menu:item:tab.board" })).toBeDefined();
  });

  test("should leave the Tasks view for the Board at once when Settings changes panel.mode to native", async ($, on) => {
    const w = await started($, on, { columns: WIDE });
    const ui = await pane($);
    await ui.press({ key: "tab:settings" });

    await ui.select({ key: "settings:mode", value: "native" });
    await ui.press({ key: "tab:board" });
    await w.clock.settle();

    expect(await ui.find({ key: "tab:tasks" })).toBeUndefined();
    expect(await ui.find({ key: "tasks-count" })).toBeUndefined();
  });

  test("should open nothing in a session that is not interactive", async ($, on) => {
    const w = world(on, { columns: WIDE });
    await $.session.start({ ...SESSION, isInteractive: false });
    await w.clock.settle();

    expect(w.opened).toEqual([]);
  });
});

describe("the task panel once Claude Code's is retired (T-2B.7, D-21)", () => {
  test("should open the beads-ui pane on the Tasks view when retired and panel.mode is beads", async ($, on) => {
    const w = await started($, on, { columns: WIDE, settings: RETIRED, files: modeFile("beads") });

    expect(unasked(w)).toEqual([[PANE_ID, "unfocused"]]);
    expect(w.toasts).toEqual([]);
    expect(await (await pane($)).find({ key: "tasks-count" })).toBeDefined();
  });

  test("should open the beads-ui pane as for beads when retired and panel.mode is both", async ($, on) => {
    const w = await started($, on, { columns: WIDE, settings: RETIRED });

    expect(unasked(w)).toEqual([[PANE_ID, "unfocused"]]);
    expect(w.toasts).toEqual([]);
  });

  test("should open nothing and toast once that no task panel is enabled when retired and panel.mode is native", async ($, on) => {
    const w = await started($, on, {
      columns: WIDE,
      settings: RETIRED,
      files: modeFile("native"),
    });
    await $.session.start(SESSION);
    await band($);
    await w.clock.settle();

    expect(w.opened).toEqual([]);
    expect(w.toasts).toEqual([NO_PANEL_TEXT]);
    expect(NO_PANEL_TEXT).toContain("Panel mode");
  });

  test("should read only a bare TaskCreate deny as retired, so other deny rules open nothing differently", async ($, on) => {
    const w = await started($, on, {
      columns: WIDE,
      settings: { permissions: { deny: ["TaskCreate(*)", "Bash(rm:*)"] } },
      files: modeFile("native"),
    });

    expect(w.opened).toEqual([]);
    expect(w.toasts).toEqual([]);
  });
});
