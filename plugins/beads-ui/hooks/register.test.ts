import type { Args, RenderPropsOf } from "claude-code";
import { describe, expect, test } from "claude-code/testing";

import { STATUS_CATEGORIES } from "../core/src/index.ts";
import { OPEN_FAILED_TEXT, PANE_ID, PLUGIN_NAME } from "./register.ts";

const PANE: RenderPropsOf["Pane"] = {
  title: "Beads",
  isFocused: true,
  bodyColumns: 80,
  placement: "dock",
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
};

const BEADS = { command: "beads", args: "", origin: { kind: "composer" } } as const;

const SURFACES = ["terminal", "desktop"] as const;

describe("register", () => {
  test("should register /beads and open the beads pane when /beads runs", async ($, on) => {
    const opened: Args<"ui.open">[] = [];
    on("session.start", (_engine, e) => ({ cwd: e.cwd }));
    on("command.register", (_engine, e) => ({ value: { command: e.name } }));
    on("ui.open", (_engine, e) => {
      opened.push(e);
      return { value: undefined };
    });

    await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
    await $.command.run(BEADS);

    expect(opened.map((open) => open.id)).toEqual([PANE_ID]);
  });

  test("should answer with a line when the pane cannot open", async ($, on) => {
    on("session.start", (_engine, e) => ({ cwd: e.cwd }));
    on("command.register", (_engine, e) => ({ value: { command: e.name } }));
    on("ui.open", () => {
      throw new Error("no surface");
    });

    await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });

    expect(await $.command.run(BEADS)).toEqual({ text: OPEN_FAILED_TEXT });
  });

  for (const surface of SURFACES) {
    test(`should draw the plugin name and the core's columns when the pane renders on ${surface}`, async ($) => {
      const ui = await $.ui.mount({
        plugin: PLUGIN_NAME,
        surface,
        component: "Pane",
        props: PANE,
        requestId: PANE_ID,
        viewport: { columns: 160, rows: 40, isFullscreen: true },
      });

      expect((await ui.find({ key: "name" }))?.text).toBe(PLUGIN_NAME);
      expect((await ui.find({ key: "columns" }))?.text).toBe(
        `Columns: ${STATUS_CATEGORIES.join(", ")}`,
      );

      await ui.unmount();
    });
  }
});
