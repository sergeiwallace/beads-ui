import type { Engine } from "claude-code/testing";
import { describe, expect, test } from "claude-code/testing";

import { COMMANDS } from "../core/src/index.ts";
import { BEADS_BUTTON_KEY } from "./bands.ts";
import { KEYBINDINGS_BLOCK, USAGE_LINES } from "./pane.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
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

/** A store whose band draws, so its beads button is there to press. */
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

  test("should open the pane focused when the band's beads button is pressed while it is closed", async ($, on) => {
    const w = world(on, COUNTED);
    await $.session.start(SESSION);
    await w.clock.settle();
    const ui = await band($);

    await ui.press({ key: BEADS_BUTTON_KEY });
    await w.clock.settle();

    expect(w.opened.map((open) => [open.id, open.focus])).toEqual([[PANE_ID, true]]);
    expect(w.focused).toEqual([]);
  });

  test("should move the focus into the open pane, onto its tab, when the beads button is pressed", async ($, on) => {
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
      "the band's beads button",
      "Esc returns it to the prompt",
      "Close: Esc, Ctrl+X then X, or /bu",
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
