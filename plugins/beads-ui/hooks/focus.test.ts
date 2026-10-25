import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { COMMANDS, glyphOf } from "../core/src/index.ts";
import { BEADS_BUTTON_KEY, PANE_CLOSE_KEY } from "./bands.ts";
import { KEYBINDINGS_BLOCK, USAGE_LINES } from "./pane.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { render } from "./tests/render.ts";
import { overflows } from "./tests/width.ts";
import {
  BAND_PROPS,
  BU,
  CWD,
  countScript,
  onBoard,
  PANE_PROPS,
  SESSION,
  SHOW,
  VIEWPORT,
  world,
} from "./tests/world.ts";

// T-1B.6 and D-27: how focus enters and leaves the pane, how it is shown and hidden, and the
// help that says so.

/** A store whose band draws, so its pane button is there to press. */
const COUNTED = { script: countScript({ [CWD]: [{ status: "open" }] }) };

const band = ($: Engine) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: BAND_PROPS,
    viewport: VIEWPORT,
  });

const pane = ($: Engine) =>
  $.ui
    .mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    })
    .then(onBoard);

describe("the band's pane toggle (D-43, T-2C.14)", () => {
  const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";
  const firstLine = async ($: Engine, columns = 120) =>
    render(
      await (
        await $.ui.mount({
          plugin: PLUGIN_NAME,
          surface: "terminal",
          component: "AbovePrompt",
          props: { ...BAND_PROPS, bodyColumns: columns },
          viewport: { ...VIEWPORT, columns },
        })
      ).drawn(),
      columns,
    )[0] ?? "";

  test("should draw the open glyph in its brackets right after the band's text, and no beads label, while the pane is closed", async ($, on) => {
    const w = world(on, COUNTED);
    await $.session.start(SESSION);
    await w.clock.settle();
    const ui = await band($);

    expect((await ui.find({ key: BEADS_BUTTON_KEY }))?.props.label).toBe(glyphOf("pane.open"));
    expect(await ui.find({ key: PANE_CLOSE_KEY })).toBeUndefined();
    expect((await ui.findAll({ type: "Button" })).map((one) => one.props.label)).not.toContain(
      "beads",
    );
    // D-36: the counts are buttons, and the expand and overview controls come before the toggle.
    expect(await firstLine($)).toBe(
      `[bd] [t: 1 task] (◒[p: 0 in progress], ◉[b: 0 blocked], ◦[o: 1 open], ✓[d: 0 done last 24h]) * [e: ▾] [v: ◫] [${glyphOf("pane.open")}]`,
    );
  });

  test("should draw the close glyph beside the open one while the pane is open, and close the pane when it is pressed", async ($, on) => {
    const w = world(on, COUNTED);
    await $.session.start(SESSION);
    await $.command.run(SHOW);
    await w.clock.settle();

    expect(await firstLine($)).toMatch(
      new RegExp(
        `24h\\]\\) \\* \\[e: ▾\\] \\[v: ◫\\] \\[${glyphOf("pane.open")}\\] \\[${glyphOf("pane.close")}\\]$`,
      ),
    );
    await (await band($)).press({ key: PANE_CLOSE_KEY });
    await w.clock.settle();

    expect(w.closed).toEqual([PANE_ID]);
    expect(await (await band($)).find({ key: PANE_CLOSE_KEY })).toBeUndefined();
    expect(await (await band($)).find({ key: BEADS_BUTTON_KEY })).toBeDefined();
  });

  test("should draw the toggle's ASCII forms under [indicators] ascii", async ($, on) => {
    const w = world(on, { ...COUNTED, files: { [USER_CONFIG]: "[indicators]\nascii = true\n" } });
    await $.session.start(SESSION);
    await $.command.run(SHOW);
    await w.clock.settle();

    expect(await firstLine($)).toMatch(/24h\]\) \* \[e: v\] \[v: =\] \[\+\] \[x\]$/);
  });

  for (const columns of [40, 48, 64, 72, 80, 120]) {
    test(`should draw the band and its open toggle within ${columns} columns`, async ($, on) => {
      const w = world(on, COUNTED);
      await $.session.start(SESSION);
      await $.command.run(SHOW);
      await w.clock.settle();
      const drawn = await (
        await $.ui.mount({
          plugin: PLUGIN_NAME,
          surface: "terminal",
          component: "AbovePrompt",
          props: { ...BAND_PROPS, bodyColumns: columns },
          viewport: { ...VIEWPORT, columns },
        })
      ).drawn();

      expect(overflows(drawn, columns)).toEqual([]);
    });
  }
});

describe("show and hide (T-1B.6)", () => {
  test("should open the pane focused when /bu runs while it is closed, and close it when /bu runs again", async ($, on) => {
    const w = world(on);
    await $.session.start(SESSION);

    await $.command.run(BU);
    await $.command.run(BU);

    expect(w.opened.map((open) => [open.id, open.focus, open.closeOnEscape])).toEqual([
      [PANE_ID, true, true],
    ]);
    expect(w.closed).toEqual([PANE_ID]);
  });

  test("should open the pane focused when the band's pane button is pressed while it is closed", async ($, on) => {
    const w = world(on, COUNTED);
    await $.session.start(SESSION);
    await w.clock.settle();
    const ui = await band($);

    await ui.press({ key: BEADS_BUTTON_KEY });
    await w.clock.settle();

    // The session start opened nothing (BU-ylx.10): the button's open is the only one.
    expect(w.opened.map((open) => [open.id, open.focus])).toEqual([[PANE_ID, true]]);
    expect(w.focused).toEqual([]);
  });

  test("should move the focus into the open pane, onto its tab, when the band's pane button is pressed", async ($, on) => {
    const w = world(on, COUNTED);
    await $.session.start(SESSION);
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await band($);

    await ui.press({ key: BEADS_BUTTON_KEY });
    await w.clock.settle();

    expect(w.opened).toHaveLength(1);
    expect(w.closed).toEqual([]);
    // The kit answers the mod's own $.ui.focus without raising it to the test's hooks (see
    // pane.test.ts), so the call itself is checked in test/focus.spec.ts.
  });
});

describe("the help (T-1B.6)", () => {
  test("should list how focus enters and leaves, how to close and reopen, and a ready keybindings.json block when h is pressed", async ($, on) => {
    const w = world(on);
    await $.session.start(SESSION);
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await pane($);

    await ui.press({ key: "help" });
    const help = (await ui.find({ key: "help", type: "Box" }))?.text ?? "";

    for (const text of [
      "Ctrl+X then Tab",
      "a click on it",
      "the band's pane button, [◨] right after the band's text",
      "Esc returns it to the prompt",
      "Close: Esc, Ctrl+X then X, the band's [⊠] button",
      "Reopen: /bu",
      "command:bu",
    ]) {
      expect(help).toContain(text);
    }
    const code = await ui.find({ type: "Code" });
    expect(JSON.parse(String(code?.props.source))).toEqual({
      bindings: [{ context: "Chat", bindings: { "meta+b": "command:bu" } }],
    });
  });

  test("should name every key the pane answers to", async ($, on) => {
    const w = world(on);
    await $.session.start(SESSION);
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await pane($);

    await ui.press({ key: "help" });
    const help = (await ui.find({ key: "help", type: "Box" }))?.text ?? "";

    for (const command of COMMANDS) {
      const { binding } = command;
      const key =
        binding.kind === "hotkey" ? binding.key : binding.kind === "input" ? binding.hint : "Esc";
      expect(help).toContain(`${key}: ${command.label}`);
    }
    expect(help).toContain("a: Mine or All");
    // The help draws the same lines README.md and mod-install.md carry (test/mod-install-doc).
    for (const line of USAGE_LINES) expect(help).toContain(line);
    expect(KEYBINDINGS_BLOCK).toContain('"meta+b": "command:bu"');
  });
});
