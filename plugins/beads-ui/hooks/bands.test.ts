import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect, test } from "claude-code/testing";

import { asOf, clockStamp } from "../core/src/index.ts";
import { NARROW_TEXT } from "./pane.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import {
  BAND_PROPS,
  CWD,
  SESSION,
  SHOW,
  START_MS,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

const LIST = "bd list --all --brief --limit 0";
const STAMP = asOf(clockStamp(START_MS, new Date(START_MS).getTimezoneOffset()));

const band = ($: Engine, columns = 120, hasSurvey = false) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: { ...BAND_PROPS, bodyColumns: columns, hasSurvey },
    viewport: { ...VIEWPORT, columns },
  });

async function started($: Engine, on: On, options: WorldOptions = {}) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await w.clock.settle();
  return w;
}

describe("the band above the prompt", () => {
  test("should register /show-beads-ui and draw open, in-progress and blocked counts when the session starts", async ($, on) => {
    const w = await started($, on);

    const ui = await band($);

    expect(w.registered).toEqual(["show-beads-ui", "bu"]);
    expect((await ui.find({ key: "beads-band" }))?.text).toBe(
      `beads beads-ui  20 open  2 in progress  0 blocked  ${STAMP}`,
    );
  });

  test("should refresh at most every 10 seconds when the pane is closed", async ($, on) => {
    const w = await started($, on);
    const lists = () => w.keys().filter((key) => key === LIST).length;
    const first = lists();

    await w.clock.advance(9_999);
    expect(lists()).toBe(first);

    await w.clock.advance(1);
    expect(lists()).toBe(first + 1);
  });

  test("should keep the 10-second floor when beads-ui.toml asks for a faster refresh", async ($, on) => {
    const w = await started($, on, {
      files: { [`${CWD}/beads-ui.toml`]: "[stores.default]\nrefresh_seconds = 2\n" },
    });
    const lists = () => w.keys().filter((key) => key === LIST).length;
    const first = lists();

    await w.clock.advance(9_999);

    expect(lists()).toBe(first);
  });

  test("should draw nothing of its own when the store cannot be read", async ($, on) => {
    await started($, on, {
      script: (key) =>
        key === LIST ? { exitCode: 1, stdout: "", stderr: "no beads database" } : undefined,
    });

    const ui = await band($);

    expect(await ui.find({ key: "beads-band" })).toBeUndefined();
  });

  test("should yield the band when a survey holds it", async ($, on) => {
    await started($, on);

    const ui = await band($, 120, true);

    expect(await ui.find({ key: "beads-band" })).toBeUndefined();
  });
});

describe("the pane's width rule", () => {
  const REOPEN = { stored: { view: { open: true } } };

  test("should toast the width needed and draw no pane when an open nobody asked for meets a narrow terminal", async ($, on) => {
    const w = await started($, on, REOPEN);

    await band($, 100);
    await w.clock.settle();

    expect(w.toasts).toEqual([NARROW_TEXT]);
    expect(NARROW_TEXT).toContain("110 columns");
    expect(w.opened).toEqual([]);
  });

  test("should reopen the pane left open last session without taking the keyboard when the terminal is wide", async ($, on) => {
    const w = await started($, on, REOPEN);

    await band($, 120);
    await w.clock.settle();

    expect(w.opened.map((open) => [open.id, open.focus])).toEqual([[PANE_ID, undefined]]);
    expect(w.toasts).toEqual([]);
  });

  test("should withdraw the pane and toast when the engine holds an unasked open unplaced", async ($, on) => {
    const w = await started($, on, {
      ...REOPEN,
      openAnswer: { isPlaced: false, reason: "unasked below 144 columns (120 now)" },
    });

    await band($, 120);
    await w.clock.settle();

    expect(w.closed).toEqual([PANE_ID]);
    expect(w.toasts).toEqual([NARROW_TEXT]);
  });

  test("should open the pane the person asked for whatever the width", async ($, on) => {
    const w = await started($, on);
    await band($, 80);

    await $.command.run(SHOW);

    expect(w.opened.map((open) => open.id)).toEqual([PANE_ID]);
    expect(w.toasts).toEqual([]);
  });
});
