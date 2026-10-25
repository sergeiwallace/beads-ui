import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { SURFACES_KEY } from "./panel.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { MINE } from "./tests/mine.ts";
import { PANE_PROPS, SESSION, SHOW, VIEWPORT, type WorldOptions, world } from "./tests/world.ts";

// D-35 and T-2C.1, criterion 3: `[surfaces]` in beads-ui.toml, or Settings, limits a view to the
// band or the pane from the next redraw; both, or no setting, draws it on both. Driven through
// the pane as Claude Code mounts it.

const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";

async function openPanel($: Engine, on: On, options: WorldOptions = MINE) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const ui = await $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "vscode",
    component: "Pane",
    props: PANE_PROPS,
    requestId: PANE_ID,
    viewport: VIEWPORT,
  });
  return { w, ui };
}

type Mounted = Awaited<ReturnType<typeof openPanel>>["ui"];

const navViews = async (ui: Mounted) =>
  (await ui.findAll({ type: "Button" }))
    .map((button) => button.key ?? "")
    .filter((key) => key.startsWith("tab:"))
    .map((key) => key.slice("tab:".length));

const ALL_VIEWS = ["tasks", "board", "backlog", "sprint", "detail", "timeline", "settings"];

describe("a view's surfaces (D-35, T-2C.1)", () => {
  test("should draw every view in the pane's nav when beads-ui.toml has no [surfaces]", async ($, on) => {
    const { ui } = await openPanel($, on);

    expect(await navViews(ui)).toEqual(ALL_VIEWS);
  });

  test("should keep a view [surfaces] sets to band out of the pane's nav and its menu, and keep one set to pane or both", async ($, on) => {
    const { ui } = await openPanel($, on, {
      ...MINE,
      files: {
        [USER_CONFIG]: '[surfaces]\ntimeline = "band"\nboard = "pane"\nbacklog = "both"\n',
      },
    });

    expect(await navViews(ui)).toEqual(ALL_VIEWS.filter((view) => view !== "timeline"));
    await ui.press({ key: "menu" });
    const goTo = (await ui.findAll({ type: "Button" }))
      .map((button) => button.key ?? "")
      .filter((key) => key.startsWith("menu:item:tab."));
    expect(goTo).not.toContain("menu:item:tab.timeline");
    expect(goTo).toContain("menu:item:tab.board");
  });

  test("should name a [surfaces] value it cannot use and draw that view on both", async ($, on) => {
    const { ui } = await openPanel($, on, {
      ...MINE,
      files: { [USER_CONFIG]: '[surfaces]\ntimeline = "nowhere"\n' },
    });

    expect((await ui.find({ key: "config:0" }))?.text).toBe(
      'surfaces.timeline "nowhere" is not one of both, band, pane; using both',
    );
    expect(await navViews(ui)).toEqual(ALL_VIEWS);
  });

  test("should move off a view at the next redraw once Settings sets it to band, bring it back on both, and save [surfaces]", async ($, on) => {
    const { w, ui } = await openPanel($, on);
    await ui.press({ key: "tab:settings" });
    expect((await ui.find({ key: "settings:surfaces:timeline" }))?.props.value).toBe("both");
    expect(await ui.find({ key: "settings:surfaces:settings" })).toBeUndefined();

    await ui.select({ key: "settings:surfaces:timeline", value: "band" });
    await w.clock.settle();
    expect(w.store.get(SURFACES_KEY)).toEqual({ timeline: "band" });
    expect(await navViews(ui)).toEqual(ALL_VIEWS.filter((view) => view !== "timeline"));

    await ui.select({ key: "settings:surfaces:timeline", value: "both" });
    await w.clock.settle();
    expect(await navViews(ui)).toEqual(ALL_VIEWS);

    await ui.select({ key: "settings:surfaces:board", value: "pane" });
    await ui.press({ key: "settings:save" });
    await w.clock.settle();
    expect(w.files.get(USER_CONFIG) ?? "").toContain(
      '[surfaces]\ntimeline = "both"\nboard = "pane"',
    );
    expect(w.store.get(SURFACES_KEY)).toEqual({});
    expect(await navViews(ui)).toEqual(ALL_VIEWS);
  });

  test("should open on the first view the pane draws when the kept view is set to band", async ($, on) => {
    const { ui } = await openPanel($, on, {
      ...MINE,
      files: { [USER_CONFIG]: '[surfaces]\ntasks = "band"\n' },
    });

    expect(await navViews(ui)).toEqual(ALL_VIEWS.filter((view) => view !== "tasks"));
    expect(await ui.find({ key: "tasks" })).toBeUndefined();
    expect((await ui.find({ key: "tab:board" }))?.props.dimColor).toBeUndefined();
  });
});
