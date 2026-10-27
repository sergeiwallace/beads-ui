import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import list from "../core/test/fixtures/bd-list-all-brief.json.ts";
import { PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { ME, MINE } from "./tests/mine.ts";
import { render } from "./tests/render.ts";
import {
  BAND_PROPS,
  CWD,
  countScript,
  INVENTORY_PATH,
  inventoryOf,
  type Listed,
  listScript,
  ok,
  type Script,
  SESSION,
  START_MS,
  STORE_LIST,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// The band's figures row (T-2C.11) was removed on 2026-10-27 at Sergei's request; its code is in
// docs/archive/figures-row/. A session owning tasks in two stores, four of them done in the
// window, draws its summary line alone at every height and on both surfaces, and the band makes
// none of the row's own reads or repaints. The band reads its counts from each store itself here
// (no refresher runs), so each line ends with `*`.

const HOUR = 3_600_000;
const MINUTE = 60_000;
const HARNESS = "/work/ai-harness";

const STORES: Record<string, Listed[]> = {
  [CWD]: [
    { id: "BU-1", status: "in_progress", assignee: ME },
    { id: "BU-2", status: "in_progress", assignee: ME },
    { id: "BU-3", status: "in_progress", assignee: ME },
    { id: "BU-4", status: "blocked", assignee: ME },
    { id: "BU-5", status: "open", assignee: ME },
    { id: "BU-6", status: "open", assignee: ME },
    { id: "BU-7", status: "closed", assignee: ME, closedAt: START_MS - 1 * HOUR },
    { id: "BU-8", status: "closed", assignee: ME, closedAt: START_MS - 1.5 * HOUR },
    { id: "BU-9", status: "closed", assignee: ME, closedAt: START_MS - 23 * HOUR },
    { id: "BU-10", status: "closed", assignee: ME, closedAt: START_MS - 30 * HOUR },
  ],
  [HARNESS]: [
    { id: "AIH-1", status: "in_progress", assignee: ME },
    { id: "AIH-2", status: "open", assignee: ME },
    { id: "AIH-3", status: "closed", assignee: ME, closedAt: START_MS - 11 * HOUR },
  ],
};
const INVENTORY = inventoryOf({ BU: { repo: CWD }, AIH: { repo: HARNESS } });

const both =
  (...scripts: (Script | undefined)[]): Script =>
  (key, argv, cwd) => {
    for (const script of scripts) {
      const answer = script?.(key, argv, cwd);
      if (answer !== undefined) return answer;
    }
    return undefined;
  };

const as = (options: WorldOptions = {}): WorldOptions => ({
  ...options,
  env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: ME },
  files: { [INVENTORY_PATH]: INVENTORY, ...options.files },
  script: both(options.script, MINE.script, listScript(STORES), countScript(STORES)),
});

async function started($: Engine, on: On, options: WorldOptions = as()) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await w.clock.settle();
  return w;
}

const band = (
  $: Engine,
  surface: "terminal" | "desktop" = "terminal",
  columns = 120,
  maxRows = BAND_PROPS.maxRows,
) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface,
    component: "AbovePrompt",
    props: { ...BAND_PROPS, bodyColumns: columns, maxRows },
    viewport: { ...VIEWPORT, columns },
  });

/** `bd list --status=closed` reads: the figures row's done-time reads, by store. */
const doneReads = (w: { keys: () => string[] }) =>
  w.keys().filter((key) => key.startsWith("bd list ") && key.includes("--status=closed"));

const SUMMARY_120 =
  "[bd] [t: 12 tasks] (◒[p: 4 in progress], ◉[b: 1 blocked], ◦[o: 3 open], ✓[d: 4 done last 24h]) * [e: ▾] [v: ◫] [◨]";

describe("the band draws no figures row (removed 2026-10-27)", () => {
  for (const surface of ["terminal", "desktop"] as const) {
    test(`should draw the summary line alone with rows to spare on the ${surface}`, async ($, on) => {
      await started($, on);

      const ui = await band($, surface);
      expect(render(await ui.drawn(), 120)).toEqual([SUMMARY_120]);
      expect(await ui.findAll({ type: "Raster" })).toEqual([]);
      expect(await ui.find({ key: "beads-band:figures" })).toBeUndefined();
    });
  }

  test("should draw no figures row at the rows or overview level", async ($, on) => {
    const w = await started($, on);

    await (await band($)).press({ key: "band-count:own:in_progress" });
    await w.clock.settle();
    expect(await (await band($)).findAll({ type: "Raster" })).toEqual([]);
    expect(await (await band($)).find({ key: "beads-band:figures" })).toBeUndefined();
    await (await band($)).press({ key: "band:summary" });
    await (await band($)).press({ key: "band:overview" });
    await w.clock.settle();
    expect(await (await band($)).find({ key: "beads-band:figures" })).toBeUndefined();
  });

  test("should read no done times and send no blit when a done count moves at the summary", async ($, on) => {
    const w = await started($, on);
    const ui = await band($);
    expect(doneReads(w)).toEqual([]);

    STORES[HARNESS]?.push({ id: "AIH-9", status: "closed", assignee: ME, closedAt: START_MS });
    try {
      await w.clock.advance(MINUTE);
      await w.clock.settle();
    } finally {
      STORES[HARNESS]?.pop();
    }

    // The count moved, so the row would have read the store's close times and repainted.
    expect(render(await ui.drawn(), 120)[0]).toContain("✓[d: 5 done last 24h]");
    expect(doneReads(w)).toEqual([]);
    expect(w.blits).toEqual([]);
  });
});

describe("the band's overview draws no picture (T-2C.13)", () => {
  test("should draw the Timeline in the overview with no Image, Svg or alt line, its rows kept for the levels", async ($, on) => {
    // An epic with a due date, which the pane's Timeline draws a picture of.
    const dated = (JSON.parse(list) as Record<string, unknown>[]).map((row) =>
      row.id === "BU-mg2" ? { ...row, due_at: "2026-12-15T00:00:00Z" } : row,
    );
    const store: Script = (key) => (key === STORE_LIST ? ok(JSON.stringify(dated)) : undefined);
    const w = await started($, on, {
      ...as({ script: store }),
      env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: ME, TERM: "xterm-kitty" },
    });

    await (await band($)).press({ key: "band:overview" });
    await w.clock.settle();
    await (await band($)).press({ key: "tab:timeline" });
    await w.clock.settle();
    const ui = await band($);
    expect((await ui.find({ key: "timeline-count" }))?.text).toMatch(/1 with a due date/);
    expect(await ui.find({ key: "timeline-picture" })).toBeUndefined();
    expect(await ui.findAll({ type: "Image" })).toEqual([]);
  });
});
