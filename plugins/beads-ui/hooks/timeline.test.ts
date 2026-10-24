import type { On, RenderPropsOf } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { clockStamp, RASTER_COLORS, RASTER_DEFAULT_COLOR } from "../core/src/index.ts";
import list from "../core/test/fixtures/bd-list-all-brief.json.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { MINE } from "./tests/mine.ts";
import { overflows } from "./tests/width.ts";
import {
  ok,
  PANE_PROPS,
  SESSION,
  SHOW,
  START_MS,
  STORE_LIST,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// T-2B.9: the Timeline view, driven through the pane as Claude Code mounts it. The store is the
// fixture's, with due dates on three epics and one `Sprint 7` milestone (D-5); its six other
// epics have none. The world's clock reads 2026-10-21 01:12 UTC, before every due date.

/** The day of the pane's read in the host's own time zone, which starts the axis. */
const TODAY = clockStamp(START_MS, new Date(START_MS).getTimezoneOffset()).slice(0, 10);

type PaneProps = RenderPropsOf["Pane"];
type Surface = "terminal" | "desktop" | "vscode";

const rows = JSON.parse(list) as Record<string, unknown>[];
const DUE: Readonly<Record<string, string>> = {
  "BU-mg2": "2026-12-15T00:00:00Z",
  "BU-mg2.3": "2026-11-02T00:00:00Z",
  "BU-mg2.5": "2026-11-20T00:00:00Z",
};
const SPRINT = {
  ...(rows.find((row) => row.id === "BU-mg2.5") ?? {}),
  id: "BU-ms7",
  title: "Sprint 7",
  issue_type: "milestone",
  metadata: {},
  labels: [],
  due_at: "2026-11-09T00:00:00Z",
};
const DATED_STORE = [
  ...rows.map((row) => {
    const due = DUE[String(row.id)];
    return due === undefined ? row : { ...row, due_at: due };
  }),
  SPRINT,
];
/** By due date: BU-mg2.3, then Sprint 7, then BU-mg2.5, then BU-mg2. */
const DATED_ORDER = ["BU-mg2.3", "BU-ms7", "BU-mg2.5", "BU-mg2"];
const UNDATED = ["BU-mg2.4", "BU-mg2.8", "BU-mg2.9", "BU-mg2.10", "BU-mg2.11", "BU-mg2.12"];

const storeOf = (store: readonly unknown[]): WorldOptions => ({
  ...MINE,
  script: (key) => (key === STORE_LIST ? ok(JSON.stringify(store)) : undefined),
});

async function openTimeline(
  $: Engine,
  on: On,
  surface: Surface,
  options: WorldOptions = storeOf(DATED_STORE),
  props: Partial<PaneProps> = {},
) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const ui = await $.ui.mount({
    plugin: PLUGIN_NAME,
    surface,
    component: "Pane",
    props: { ...PANE_PROPS, ...props },
    requestId: PANE_ID,
    viewport: { ...VIEWPORT, columns: Math.max(VIEWPORT.columns, (props.bodyColumns ?? 0) * 2) },
  });
  await ui.press({ key: "tab:timeline" });
  return { w, ui };
}

type Mounted = Awaited<ReturnType<typeof openTimeline>>["ui"];

const keysOf = async (ui: Mounted, prefix: string, type?: string) =>
  (await ui.findAll(type === undefined ? {} : { type }))
    .map((element) => element.key ?? "")
    .filter((key) => key.startsWith(prefix));

const idsOf = (keys: readonly string[], prefix: string) =>
  keys.map((key) => key.slice(prefix.length));

/** A Raster's cells, three little-endian 32-bit numbers a cell. */
const decode = (cells: string): number[][] => {
  const bytes = Uint8Array.from(atob(cells), (char) => char.charCodeAt(0));
  const words = new DataView(bytes.buffer);
  return Array.from({ length: bytes.length / 12 }, (_, i) => [
    words.getUint32(i * 12, true),
    words.getUint32(i * 12 + 4, true),
    words.getUint32(i * 12 + 8, true),
  ]);
};

const filledOf = (cells: string) =>
  decode(cells).filter(([, , background]) => background !== RASTER_DEFAULT_COLOR).length;

describe("the Timeline view (T-2B.9)", () => {
  test("should place the store's epics and milestone issues by due date as Raster bars in the terminal", async ($, on) => {
    const { ui } = await openTimeline($, on, "terminal");

    const bars = await keysOf(ui, "timeline-bar:", "Raster");
    expect(idsOf(bars, "timeline-bar:")).toEqual(DATED_ORDER);
    const filled: number[] = [];
    for (const key of bars) {
      const bar = await ui.find({ key });
      const cells = String(bar?.props.cells);
      expect(bar?.props.rows).toBe(1);
      expect(decode(cells)).toHaveLength(Number(bar?.props.columns));
      filled.push(filledOf(cells));
    }
    // Each bar runs from the axis start to its due date, the latest the full width.
    expect([...filled].sort((a, b) => a - b)).toEqual(filled);
    expect(filled[filled.length - 1]).toBe(
      Number((await ui.find({ key: bars[0] ?? "" }))?.props.columns),
    );
    // BU-mg2.3 is in progress: its bar takes the wip colour; Sprint 7 is open.
    const wip = decode(String((await ui.find({ key: "timeline-bar:BU-mg2.3" }))?.props.cells));
    expect(wip[0]?.[2]).toBe(RASTER_COLORS.wip);
    const open = decode(String((await ui.find({ key: "timeline-bar:BU-ms7" }))?.props.cells));
    expect(open[0]?.[2]).toBe(RASTER_COLORS.active);
    expect((await ui.find({ key: "timeline-row:BU-ms7" }))?.text).toContain("Sprint 7");
    expect((await ui.find({ key: "timeline-row:BU-ms7" }))?.text).toContain("2026-11-09");
    expect((await ui.find({ key: "timeline-axis" }))?.text).toBe(`${TODAY} to 2026-12-15`);
  });

  for (const surface of ["desktop", "vscode"] as const) {
    test(`should draw a Text row of due date and label for each item in ${surface}, with no Raster`, async ($, on) => {
      const { ui } = await openTimeline($, on, surface);

      expect(await ui.findAll({ type: "Raster" })).toEqual([]);
      const rowsDrawn = await keysOf(ui, "timeline-row:");
      expect(idsOf(rowsDrawn, "timeline-row:")).toEqual(DATED_ORDER);
      expect((await ui.find({ key: "timeline:BU-ms7" }))?.props.label).toBe("2026-11-09 Sprint 7");
      expect((await ui.find({ key: "timeline:BU-mg2.3" }))?.props.label).toBe(
        "2026-11-02 BU-beads-ui-claude-code-aeyb",
      );
    });
  }

  for (const surface of ["terminal", "vscode"] as const) {
    test(`should list the epics with no due date apart, after the dated ones, in ${surface}`, async ($, on) => {
      const { ui } = await openTimeline($, on, surface);

      const buttons = idsOf(await keysOf(ui, "timeline:", "Button"), "timeline:");
      expect(buttons.slice(0, DATED_ORDER.length)).toEqual(DATED_ORDER);
      expect([...buttons.slice(DATED_ORDER.length)].sort()).toEqual([...UNDATED].sort());
      expect((await ui.find({ key: "timeline-undated" }))?.text).toMatch(/^No due date \(6\)/);
      for (const id of UNDATED) {
        expect(await ui.find({ key: `timeline-bar:${id}` })).toBeUndefined();
      }
      expect((await ui.find({ key: "timeline-count" }))?.text).toBe(
        "10 epics and milestones: 4 with a due date, 6 without",
      );
    });
  }

  test("should draw its empty state and the undated list when no epic or milestone has a due date", async ($, on) => {
    const { ui } = await openTimeline($, on, "terminal", storeOf(rows));

    expect((await ui.find({ key: "timeline-empty" }))?.text).toBe(
      "No epic or milestone has a due date: set one with its Due field.",
    );
    expect(await ui.findAll({ type: "Raster" })).toEqual([]);
    expect((await keysOf(ui, "timeline:", "Button")).length).toBe(9);
    expect((await ui.find({ key: "timeline-undated" }))?.text).toMatch(/^No due date \(9\)/);
  });

  test("should say the store holds no epic or milestone when it has none", async ($, on) => {
    const tasks = rows.filter((row) => row.issue_type !== "epic");
    const { ui } = await openTimeline($, on, "vscode", storeOf(tasks));

    expect((await ui.find({ key: "timeline-empty" }))?.text).toBe(
      "The store holds no epic or milestone.",
    );
    expect((await ui.find({ key: "timeline-undated" }))?.text).toMatch(/^No due date \(0\)/);
  });

  const WIDTHS = [40, 48, 64, 72, 80, 120];
  for (const surface of ["terminal", "vscode"] as const) {
    for (const columns of WIDTHS) {
      test(`should draw no line past ${columns} columns in ${surface}`, async ($, on) => {
        const long = [
          ...DATED_STORE,
          {
            ...SPRINT,
            id: "BU-ms8",
            title:
              "Sprint 8 with a title long enough to pass the widest pane this test draws at all",
            due_at: "2026-11-30T00:00:00Z",
          },
        ];
        const { ui } = await openTimeline($, on, surface, storeOf(long), { bodyColumns: columns });

        expect(await ui.find({ key: "timeline-row:BU-ms8" })).toBeDefined();
        expect(overflows(await ui.drawn(), columns)).toEqual([]);
      });
    }
  }

  test("should put each label beside its bar in a wide pane and above it in a narrow one", async ($, on) => {
    const wide = await openTimeline($, on, "terminal", storeOf(DATED_STORE), { bodyColumns: 120 });
    expect((await wide.ui.find({ key: "timeline-row:BU-ms7" }))?.props.flexDirection).toBe("row");

    await wide.ui.redraw({ ...PANE_PROPS, bodyColumns: 48 });
    expect((await wide.ui.find({ key: "timeline-row:BU-ms7" }))?.props.flexDirection).toBe(
      "column",
    );
    expect(await wide.ui.find({ key: "timeline-bar:BU-ms7" })).toBeDefined();
  });
});

describe("reaching the Timeline and its items (T-2B.9)", () => {
  test("should open the Timeline with 5 from the nav, drawn live and not planned", async ($, on) => {
    const { ui } = await openTimeline($, on, "vscode");

    const entry = await ui.find({ key: "tab:timeline" });
    expect(entry?.props.hotkey).toBe("5");
    expect(entry?.props.dimColor).toBeUndefined();
    expect(await ui.find({ key: "timeline" })).toBeDefined();
    expect(await ui.find({ key: "notice" })).toBeUndefined();
  });

  test("should open an item's detail when its row is pressed, as Enter on the Tasks view does", async ($, on) => {
    const { w, ui } = await openTimeline($, on, "terminal");

    await ui.press({ key: "timeline:BU-mg2.3" });
    await w.clock.settle();

    expect(w.keys()).toContain("bd show BU-mg2.3");
    expect((await ui.find({ key: "detail-heading" }))?.text).toMatch(
      /^BU-beads-ui-claude-code-aeyb /,
    );
  });

  test("should open the focused item's detail with d, and an undated one's too", async ($, on) => {
    const { w, ui } = await openTimeline($, on, "vscode");

    await $.ui.focus({
      component: "Pane",
      requestId: PANE_ID,
      plugin: PLUGIN_NAME,
      element: "timeline:BU-mg2.4",
      origin: { kind: "person" },
    } as never);
    await ui.press({ key: "detail" });
    await w.clock.settle();

    expect(w.keys()).toContain("bd show BU-mg2.4");
  });

  test("should keep the Timeline open across a pane reopen", async ($, on) => {
    const { w } = await openTimeline($, on, "vscode");
    await w.clock.settle();

    expect((w.store.get("view") as { view?: string } | undefined)?.view).toBe("timeline");
  });
});
