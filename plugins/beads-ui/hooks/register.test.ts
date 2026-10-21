import { describe, expect, test } from "claude-code/testing";

import { OPEN_FAILED_TEXT, PANE_ID, PLUGIN_NAME } from "./register.ts";
import { BEADS, BU, PANE_PROPS, SESSION, VIEWPORT, world } from "./tests/world.ts";

describe("register", () => {
  test("should register /beads and /bu and open the beads pane when /beads runs", async ($, on) => {
    const w = world(on);

    await $.session.start(SESSION);
    await $.command.run(BEADS);

    expect(w.registered).toEqual(["beads", "bu"]);
    expect(w.opened.map((open) => [open.id, open.focus, open.closeOnEscape])).toEqual([
      [PANE_ID, true, true],
    ]);
  });

  test("should toggle the pane closed and open again when /beads and /bu run in turn", async ($, on) => {
    const w = world(on);
    await $.session.start(SESSION);

    await $.command.run(BEADS);
    await $.command.run(BU);
    await $.command.run(BU);

    expect(w.opened.map((open) => open.id)).toEqual([PANE_ID, PANE_ID]);
    expect(w.closed).toEqual([PANE_ID]);
  });

  test("should answer with a line when the pane cannot open", async ($, on) => {
    world(on, { openAnswer: new Error("no surface") });

    await $.session.start(SESSION);

    expect(await $.command.run(BEADS)).toEqual({ text: OPEN_FAILED_TEXT });
  });

  test("should restore the tab, filter, swimlane and sort it stored when the pane opens", async ($, on) => {
    const w = world(on, {
      stored: {
        view: { tab: "backlog", filter: "type:epic", swimlane: "assignee", sort: "created:desc" },
      },
    });
    await $.session.start(SESSION);
    await $.command.run(BEADS);
    await w.clock.settle();

    const ui = await $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    });

    expect((await ui.find({ key: "backlog-count" }))?.text).toMatch(/open issues, created:desc/);
    expect((await ui.find({ key: "filter" }))?.props.value).toBe("type:epic");
    expect((await ui.find({ key: "swimlane" }))?.props.label).toBe("Swimlane: assignee");
  });

  test("should keep the stored preferences and read nothing else when the store holds junk", async ($, on) => {
    const w = world(on, { stored: { view: { tab: "kanban", swimlane: 7, sort: "rank" } } });
    await $.session.start(SESSION);
    await $.command.run(BEADS);
    await w.clock.settle();

    const ui = await $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    });

    expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
    expect((await ui.find({ key: "sort" }))?.props.label).toBe("Sort: priority");
  });
});
