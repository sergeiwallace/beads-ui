import type { RenderPropsOf } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import list from "../core/test/fixtures/bd-list-all-brief.json.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import {
  ok,
  onBoard,
  PANE_PROPS,
  SESSION,
  SHOW,
  STORE_LIST,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// BU-mg2.3.14: a field shows its whole text whenever the pane has the room for it, and only a
// value that cannot fit is cut, with an ellipsis. Frozen at fixed body widths, so a layout
// budget computed from a narrower column than the one a field is drawn in turns this red.

const TITLE =
  "beads-ui Claude Code mod: the task manager inside the Claude Code TUI, with mouse control";
const HEADING = `BU-beads-ui-claude-code-aeyb ${TITLE}`;
const METADATA = '{"display_id":"BU-beads-ui-claude-code-aeyb"}';
const DEPENDENCY =
  "BU-epic-beads-ui-beads-task-manager-mg2 in_progress parent-child EPIC beads-ui: Beads task manager for the Claude Code TUI, an MCP UI app and a web app, sharing one core";

async function detailAt($: Engine, on: Parameters<typeof world>[0], bodyColumns: number) {
  const { w, ui } = await mountAt($, on, bodyColumns);
  await ui.press({ key: "open:BU-mg2.3" });
  await w.clock.settle();
  return ui;
}

async function mountAt(
  $: Engine,
  on: Parameters<typeof world>[0],
  bodyColumns: number,
  options: WorldOptions = {},
) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const props: RenderPropsOf["Pane"] = { ...PANE_PROPS, bodyColumns };
  const ui = await $.ui
    .mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props,
      requestId: PANE_ID,
      viewport: { ...VIEWPORT, columns: Math.max(VIEWPORT.columns, bodyColumns * 2) },
    })
    .then(onBoard);
  return { w, ui };
}

const textOf = async (ui: Awaited<ReturnType<typeof mountAt>>["ui"], key: string) =>
  String((await ui.find({ key }))?.text ?? "");

// The view's width at each body width: the body less one column (register.ts), from 72 columns
// less the side nav's 15 and its gap (T-2B.1), and from 48 columns less the view's framed
// section's border and padding, 4 (T-2C.12): 144 draws 123, 48 draws 47.
describe("fields drawn whole when the pane has room (BU-mg2.3.14)", () => {
  test("should draw the Detail heading and a field whole at 144 columns, where each fits", async ($, on) => {
    const ui = await detailAt($, on, 144);

    expect(await textOf(ui, "detail-heading")).toBe(HEADING);
    expect(await textOf(ui, "field:metadata")).toBe(`Metadata: ${METADATA}`);
  });

  test("should cut only the dependency row too long for 144 columns, with an ellipsis at the view's edge", async ($, on) => {
    const ui = await detailAt($, on, 144);

    expect(await textOf(ui, "dep:BU-mg2")).toBe(
      "BU-epic-beads-ui-beads-task-manager-mg2 in_progress parent-child EPIC beads-ui: Beads task manager for the Claude Code TUI⋯",
    );
  });

  test("should draw a dependency's whole row at 200 columns, where it fits", async ($, on) => {
    const ui = await detailAt($, on, 200);

    expect(await textOf(ui, "dep:BU-mg2")).toBe(DEPENDENCY);
  });

  test("should cut the heading and a long field with an ellipsis at 48 columns, each within its row", async ($, on) => {
    const ui = await detailAt($, on, 48);

    const heading = await textOf(ui, "detail-heading");
    expect(heading.endsWith("⋯")).toBe(true);
    expect([...heading].length).toBe(47);
    expect(await textOf(ui, "field:metadata")).toBe(
      'Metadata: {"display_id":"BU-beads-ui-claude-co⋯',
    );
    // A short field still fits whole.
    expect(await textOf(ui, "field:id")).toBe("Id: BU-mg2.3");
  });

  test("should draw a Backlog row's type and assignee whole on a wide pane", async ($, on) => {
    const edited = (JSON.parse(list) as Record<string, unknown>[]).map((row) =>
      row.status === "open"
        ? { ...row, issue_type: "milestone", assignee: "ops-vm-firstmate-1" }
        : row,
    );
    const { ui } = await mountAt($, on, 200, {
      script: (key) => (key === STORE_LIST ? ok(JSON.stringify(edited)) : undefined),
    });
    await ui.press({ key: "tab:backlog" });

    const first = (await ui.findAll({ type: "Box" }))
      .map((element) => element.key ?? "")
      .find((key) => key.startsWith("row:"));
    expect(first).toBeDefined();
    const row = await textOf(ui, first ?? "row:missing");
    expect(row).toContain("milestone");
    expect(row).toContain("@ops-vm-firstmate-1");
  });
});
