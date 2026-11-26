import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { PANE_ID, PLUGIN_NAME } from "./register.js";
import { test } from "./tests/kit.js";
import {
  BAND_PROPS,
  BU,
  type Counted,
  CWD,
  countScript,
  SESSION,
  VIEWPORT,
  world,
} from "./tests/world.js";

const ISSUES: Readonly<Record<string, readonly Counted[]>> = {
  [CWD]: [{ status: "open" }, { status: "in_progress" }],
};

const band = ($: Engine) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: BAND_PROPS,
    viewport: VIEWPORT,
  });

const where = (keys: readonly string[]) => keys.filter((key) => key === "bd where");

describe("a module loaded into a running session (BU-j0g)", () => {
  test("should draw the band when no session.start reaches the module", async ($, on) => {
    const w = world(on, { script: countScript(ISSUES) });

    await band($);
    await w.clock.settle();

    expect(await (await band($)).find({ key: "beads-band" })).toBeDefined();
  });

  test("should register /show-beads-ui and /bu and open the pane on /bu when no session.start reaches the module", async ($, on) => {
    const w = world(on, { script: countScript(ISSUES) });

    await $.command.run(BU);

    expect(w.registered).toEqual(["show-beads-ui", "bu"]);
    expect(w.opened.map((open) => open.id)).toEqual([PANE_ID]);
  });

  test("should bind once when session.start arrives after the module already bound itself", async ($, on) => {
    const w = world(on, { script: countScript(ISSUES) });

    await $.command.run(BU);
    await $.session.start(SESSION);
    await w.clock.settle();

    expect(w.registered).toEqual(["show-beads-ui", "bu"]);
    expect(where(w.keys())).toEqual(["bd where"]);
    expect(await (await band($)).find({ key: "beads-band" })).toBeDefined();
  });

  test("should bind once when session.start runs twice", async ($, on) => {
    const w = world(on, { script: countScript(ISSUES) });

    await $.session.start(SESSION);
    await $.session.start(SESSION);
    await w.clock.settle();

    expect(w.registered).toEqual(["show-beads-ui", "bu"]);
    expect(where(w.keys())).toEqual(["bd where"]);
  });
});
