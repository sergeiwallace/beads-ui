import { describe, expect, test } from "claude-code/testing";

import { OPEN_FAILED_TEXT, PANE_ID, PLUGIN_NAME } from "./register.ts";
import { BU, PANE_PROPS, SESSION, SHOW, VIEWPORT, world } from "./tests/world.ts";

describe("register", () => {
  test("should register /show-beads-ui and /bu and open the beads pane when /show-beads-ui runs", async ($, on) => {
    const w = world(on);

    await $.session.start(SESSION);
    await $.command.run(SHOW);

    expect(w.registered).toEqual(["show-beads-ui", "bu"]);
    expect(w.opened.map((open) => [open.id, open.focus, open.closeOnEscape])).toEqual([
      [PANE_ID, true, true],
    ]);
  });

  test("should toggle the pane closed and open again when /show-beads-ui and /bu run in turn", async ($, on) => {
    const w = world(on);
    await $.session.start(SESSION);

    await $.command.run(SHOW);
    await $.command.run(BU);
    await $.command.run(BU);

    expect(w.opened.map((open) => open.id)).toEqual([PANE_ID, PANE_ID]);
    expect(w.closed).toEqual([PANE_ID]);
  });

  test("should leave the old /beads name alone when it runs, so it no longer opens the pane", async ($, on) => {
    const w = world(on);
    // Beneath the plugin: Claude Code's own answer to a command no plugin matched.
    on("command.run", (_engine, e) => ({ text: `unknown command /${e.command}` }));
    await $.session.start(SESSION);

    const answer = await $.command.run({ ...SHOW, command: "beads" });

    expect(answer).toEqual({ text: "unknown command /beads" });
    expect(w.registered).not.toContain("beads");
    expect(w.opened).toEqual([]);
  });

  test("should close the pane when /show-beads-ui runs while it is open", async ($, on) => {
    const w = world(on);
    await $.session.start(SESSION);

    await $.command.run(SHOW);
    await $.command.run(SHOW);

    expect(w.opened.map((open) => open.id)).toEqual([PANE_ID]);
    expect(w.closed).toEqual([PANE_ID]);
  });

  test("should answer with a line when the pane cannot open", async ($, on) => {
    world(on, { openAnswer: new Error("no surface") });

    await $.session.start(SESSION);

    expect(await $.command.run(SHOW)).toEqual({ text: OPEN_FAILED_TEXT });
  });

  test("should restore the view, filter, swimlane and sort it stored when the pane opens", async ($, on) => {
    const w = world(on, {
      stored: {
        view: { view: "backlog", filter: "type:epic", swimlane: "assignee", sort: "created:desc" },
      },
    });
    await $.session.start(SESSION);
    await $.command.run(SHOW);
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
    const w = world(on, { stored: { view: { view: "kanban", swimlane: 7, sort: "rank" } } });
    await $.session.start(SESSION);
    await $.command.run(SHOW);
    await w.clock.settle();

    const ui = await $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    });

    expect(await ui.find({ key: "tasks-count" })).toBeDefined();
    await ui.press({ key: "tab:board" });
    expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
    expect((await ui.find({ key: "sort" }))?.props.label).toBe("Sort: priority");
  });
});
