import type { RenderPropsOf } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { SHORT_HELP_TEXT } from "./pane.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { overflows } from "./tests/width.ts";
import {
  BAND_PROPS,
  onBoard,
  PANE_PROPS,
  SESSION,
  SHOW,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// T-1B.9: the pane reflows to its body's width and height. The kit hands back the element
// tree, so tests/width.ts measures it as Claude Code lays it out.

const WIDTHS = [40, 48, 64, 72, 80, 120];
const LIVE_BAND = {
  env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: "ops-vm-firstmate-1" },
} satisfies WorldOptions;

type PaneProps = RenderPropsOf["Pane"];

async function paneAt(
  $: Engine,
  on: Parameters<typeof world>[0],
  props: Partial<PaneProps>,
  options: WorldOptions = {},
) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const ui = await $.ui
    .mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: { ...PANE_PROPS, ...props },
      requestId: PANE_ID,
      viewport: { ...VIEWPORT, columns: Math.max(VIEWPORT.columns, (props.bodyColumns ?? 0) * 2) },
    })
    .then(onBoard);
  return { w, ui };
}

const keysIn = async (ui: Awaited<ReturnType<typeof paneAt>>["ui"]) =>
  (await ui.findAll({})).map((element) => element.key ?? "").filter((key) => key !== "");

describe("reflow without overflow (T-1B.9)", () => {
  for (const columns of WIDTHS) {
    test(`should draw no line past ${columns} columns on the Board, the Backlog, the Detail tab, the help and the band settings`, async ($, on) => {
      const { ui } = await paneAt($, on, { bodyColumns: columns });

      expect(overflows(await ui.drawn(), columns)).toEqual([]);
      await ui.press({ key: "help" });
      await ui.press({ key: "band-settings" });
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
      await ui.press({ key: "help" });
      await ui.press({ key: "band-settings" });
      await ui.press({ key: "swimlane" });
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
      await ui.press({ key: "tab:backlog" });
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
      const row = (await keysIn(ui)).find((key) => key.startsWith("open:"));
      await ui.press({ key: row ?? "open:missing" });
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
    });
  }

  test("should label the toolbar and tabs with full words from 72 columns, a short word from 48 and the shortest form below", async ($, on) => {
    const labelsAt = async (columns: number) => {
      const { ui } = await paneAt($, on, { bodyColumns: columns });
      return {
        swimlane: (await ui.find({ key: "swimlane" }))?.props.label,
        move: (await ui.find({ key: "move" }))?.props.label,
        backlog: (await ui.find({ key: "tab:backlog" }))?.props.label,
        hotkey: (await ui.find({ key: "swimlane" }))?.props.hotkey,
      };
    };

    expect(await labelsAt(120)).toEqual({
      swimlane: "Swimlane: none",
      move: "Move to",
      backlog: "Backlog",
      hotkey: "s",
    });
  });

  test("should shorten the labels at 64 columns, keeping each key", async ($, on) => {
    const { ui } = await paneAt($, on, { bodyColumns: 64 });

    expect((await ui.find({ key: "swimlane" }))?.props.label).toBe("Lanes: none");
    expect((await ui.find({ key: "move" }))?.props.label).toBe("Move");
    expect((await ui.find({ key: "swimlane" }))?.props.hotkey).toBe("s");
  });

  test("should draw the key and a short word at 40 columns, the nav's key and glyph, and stack the board's column groups", async ($, on) => {
    const { ui } = await paneAt($, on, { bodyColumns: 40 });

    expect((await ui.find({ key: "swimlane" }))?.props.label).toBe("Lanes");
    // T-2B.1: below 48 columns the nav is a bar of keys and glyphs.
    expect((await ui.find({ key: "tab:backlog" }))?.props.label).toBe("≣");
    expect((await ui.find({ key: "delete" }))?.props.label).toBe("Del");
    expect((await ui.find({ key: "tab:backlog" }))?.props.hotkey).toBe("2");
    expect((await ui.find({ key: "group::active" }))?.props.width).toBeGreaterThanOrEqual(16);
  });

  test("should redraw in the new tier when the pane is resized", async ($, on) => {
    const { ui } = await paneAt($, on, { bodyColumns: 120 });
    expect((await ui.find({ key: "swimlane" }))?.props.label).toBe("Swimlane: none");

    await ui.redraw({ ...PANE_PROPS, bodyColumns: 40 });

    expect((await ui.find({ key: "swimlane" }))?.props.label).toBe("Lanes");
    expect(overflows(await ui.drawn(), 40)).toEqual([]);
  });

  test("should draw the band's lines and its beads button within 40 columns", async ($, on) => {
    const w = world(on, LIVE_BAND);
    await $.session.start(SESSION);
    await w.clock.settle();
    const band = await $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "AbovePrompt",
      props: { ...BAND_PROPS, bodyColumns: 40 },
      viewport: { ...VIEWPORT, columns: 40 },
    });

    expect(overflows(await band.drawn(), 40)).toEqual([]);
  });
});

describe("the short-height rule (T-1B.9)", () => {
  const SHORT: Partial<PaneProps>[] = [
    { placement: "inline", scroll: { offset: 0, bodyRows: 28 } },
    { placement: "dock", scroll: { offset: 0, bodyRows: 11 } },
  ];

  for (const props of SHORT) {
    test(`should drop the help and hint lines and keep the tabs, the board's header and a card first when ${props.placement} with ${props.scroll?.bodyRows} rows`, async ($, on) => {
      const { ui } = await paneAt($, on, props);

      await ui.press({ key: "help" });
      const keys = await keysIn(ui);

      // The Help button stays; the help box it opens does not draw.
      expect(await ui.find({ key: "help", type: "Box" })).toBeUndefined();
      expect(keys).not.toContain("footer");
      expect((await ui.find({ key: "help-short" }))?.text).toBe(SHORT_HELP_TEXT);
      expect(keys).toContain("tab:board");
      const header = keys.indexOf("column::open");
      const card = keys.findIndex((key) => key.startsWith("card:"));
      expect(header).toBeGreaterThan(-1);
      expect(card).toBeGreaterThan(header);
      // The inputs follow the board, so they never push its first card down.
      expect(keys.indexOf("inputs")).toBeGreaterThan(card);
    });
  }

  test("should draw the help, the footer and the inputs above the board when docked with 12 rows", async ($, on) => {
    const { ui } = await paneAt($, on, {
      placement: "dock",
      scroll: { offset: 0, bodyRows: 12 },
    });

    await ui.press({ key: "help" });
    const keys = await keysIn(ui);

    expect(await ui.find({ key: "help", type: "Box" })).toBeDefined();
    expect(keys).toContain("footer");
    expect(keys.indexOf("inputs")).toBeLessThan(keys.indexOf("board"));
  });
});
