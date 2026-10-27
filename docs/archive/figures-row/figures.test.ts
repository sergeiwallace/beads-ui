// Archived 2026-10-27 from plugins/beads-ui/hooks/figures.test.ts at 45d7da1 (see README.md). Its
// last suite, the band overview drawing no picture (T-2C.13), moved to
// plugins/beads-ui/hooks/band-figures-removed.test.ts.

import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { decodeRasterCells, RASTER_DEFAULT_COLOR } from "../core/src/index.ts";
import list from "../core/test/fixtures/bd-list-all-brief.json.ts";
import { PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { ME, MINE } from "./tests/mine.ts";
import { render } from "./tests/render.ts";
import { overflows } from "./tests/width.ts";
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

// T-2C.11 (D-43): the band's figures row at the hooks entry point. The band reads its counts
// from each store itself here (no refresher runs), so each line ends with `*`. The done window
// is 24 hours, cut into 12 parts of 2 hours; a done task's part is where its close falls.

const HOUR = 3_600_000;
const MINUTE = 60_000;
const HARNESS = "/work/ai-harness";
const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";

/** The session's tasks: 4 in progress, 1 blocked, 3 open, and 4 done in the window, in two stores. */
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
    { id: "BU-11", status: "closed", assignee: "kg-ec2-1", closedAt: START_MS - HOUR },
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

/** The band site's id, as Claude Code 2.1.310 names it to a remote surface. */
const BAND_SITE = "above-prompt";

/** The band mounted once under BAND_SITE, the id its blits must name. */
const bandAtSite = ($: Engine) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    requestId: BAND_SITE,
    props: BAND_PROPS,
    viewport: VIEWPORT,
  });

/** The band's done-time reads: `bd list --status=closed` with `--closed-after`, by store. */
const doneReads = (w: { keys: () => string[] }) =>
  w.keys().filter((key) => key.startsWith("bd list ") && key.includes("--status=closed"));

/** The figures Raster's cells as text: its glyphs, and `#` for a bar's filled cell. */
const cellText = (cells: string) =>
  decodeRasterCells(cells)
    .map((cell) =>
      cell.background !== RASTER_DEFAULT_COLOR ? "#" : String.fromCodePoint(cell.codePoint),
    )
    .join("")
    .trimEnd();

/**
 * The parts hold 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2 done (BU-9 at 23 hours, AIH-3 at 11, BU-7
 * and BU-8 within the last 2): half the busiest is ⣤, the busiest ⣿. 4 + 1 + 3 + 4 = 12
 * counted, so bars of 16 cells hold 5, 1, 4 and 5 (rounded shares).
 */
const SPARK = "⣤⡀⡀⡀⡀⡀⣤⡀⡀⡀⡀⣿";
const FIGURES_120 = `✓${SPARK} ◒#####........... ◉#............... ◦####............ ✓#####...........`;

describe("the band's figures row (T-2C.11)", () => {
  test("should draw one Raster row under the summary line with the done sparkline and a bar per count, within maxRows", async ($, on) => {
    const w = await started($, on);

    const ui = await band($);
    const rasters = await ui.findAll({ type: "Raster" });
    expect(rasters.map((one) => one.key)).toEqual(["band-figures"]);
    expect(rasters[0]?.props.rows).toBe(1);
    expect(Number(rasters[0]?.props.columns)).toBeLessThanOrEqual(120);
    expect(render(await ui.drawn(), 120)).toEqual([
      "[bd] [t: 12 tasks] (◒[p: 4 in progress], ◉[b: 1 blocked], ◦[o: 3 open], ✓[d: 4 done last 24h]) * [e: ▾] [v: ◫] [◨]",
      FIGURES_120,
    ]);
    // BU-7 and BU-8 in the newest part, AIH-3 at 11 hours, BU-9 at 23 hours; BU-10 is outside
    // the window and BU-11 another session's. Each store with a done count was read once.
    expect(doneReads(w)).toHaveLength(2);
    expect(overflows(await ui.drawn(), 120)).toEqual([]);
  });

  test("should draw no figures row when maxRows leaves no row under the summary line", async ($, on) => {
    await started($, on);

    const ui = await band($, "terminal", 120, 1);
    expect(await ui.findAll({ type: "Raster" })).toEqual([]);
    expect(render(await ui.drawn(), 120)).toHaveLength(1);
    expect(await (await band($, "terminal", 120, 2)).findAll({ type: "Raster" })).toHaveLength(1);
  });

  test("should draw the figures row at the summary level only, not with a count's rows or the overview", async ($, on) => {
    const w = await started($, on);

    await (await band($)).press({ key: "band-count:own:in_progress" });
    await w.clock.settle();
    expect(await (await band($)).findAll({ type: "Raster" })).toEqual([]);
    await (await band($)).press({ key: "band:summary" });
    await (await band($)).press({ key: "band:overview" });
    await w.clock.settle();
    expect(await (await band($)).findAll({ type: "Raster" })).toEqual([]);
  });

  test("should draw the same figures as Text on the desktop, where the band has no Raster", async ($, on) => {
    await started($, on);

    const ui = await band($, "desktop");
    expect(await ui.findAll({ type: "Raster" })).toEqual([]);
    expect((await ui.find({ key: "beads-band:figures" }))?.text).toBe(
      `✓ ${SPARK} 24h ⋅ ◒ 33% ⋅ ◉ 8% ⋅ ◦ 25% ⋅ ✓ 33%`,
    );
    expect(overflows(await ui.drawn(), 120)).toEqual([]);
  });

  test("should draw a bar only for each count the line draws, in its order, on both surfaces", async ($, on) => {
    const config = '[band]\nparts = ["total", "blocked", "in_progress"]\n';
    await started($, on, as({ files: { [USER_CONFIG]: config } }));

    const raster = await (await band($)).find({ type: "Raster" });
    expect(cellText(String(raster?.props.cells))).toBe(
      `✓${SPARK} ◉###............. ◒#############...`,
    );
    expect((await (await band($, "desktop")).find({ key: "beads-band:figures" }))?.text).toBe(
      `✓ ${SPARK} 24h ⋅ ◉ 20% ⋅ ◒ 80%`,
    );
  });

  test("should draw the figures' glyphs in their ASCII forms under [indicators] ascii", async ($, on) => {
    await started($, on, as({ files: { [USER_CONFIG]: "[indicators]\nascii = true\n" } }));

    const raster = await (await band($)).find({ type: "Raster" });
    expect(cellText(String(raster?.props.cells))).toBe(
      "v-.....-....# %#####........... x#............... o####............ v#####...........",
    );
  });

  for (const columns of [40, 48, 64, 72, 80, 364]) {
    test(`should keep the figures row within ${columns} columns`, async ($, on) => {
      await started($, on);

      const ui = await band($, "terminal", columns);
      expect(overflows(await ui.drawn(), columns)).toEqual([]);
      expect(await ui.findAll({ type: "Raster" })).toHaveLength(1);
      expect(overflows(await (await band($, "desktop", columns)).drawn(), columns)).toEqual([]);
    });
  }
});

describe("the figures row's repaint (T-2C.11)", () => {
  test("should repaint the drawn Raster through one $.ui.blit when a done read lands after the redraw, naming the site and the Raster", async ($, on) => {
    const w = await started($, on);
    const ui = await bandAtSite($);
    const drawnCells = String((await ui.find({ type: "Raster" }))?.props.cells);
    expect(w.blits).toEqual([]);

    // A task closes in the store: the next minute's count moves and the store's times are read.
    STORES[HARNESS]?.push({ id: "AIH-9", status: "closed", assignee: ME, closedAt: START_MS });
    try {
      await w.clock.advance(MINUTE);
      await w.clock.settle();
    } finally {
      STORES[HARNESS]?.pop();
    }

    expect(w.blits).toHaveLength(1);
    expect(w.blits[0]?.key).toBe("band-figures");
    expect(w.blits[0]?.requestId).toBe(BAND_SITE);
    expect(w.blits[0]?.cells).not.toBe(drawnCells);
  });

  test("should blit at most once until the band redraws, when two stores' reads land in one interval", async ($, on) => {
    const w = await started($, on);
    const ui = await band($);

    STORES[CWD]?.push({ id: "BU-90", status: "closed", assignee: ME, closedAt: START_MS });
    STORES[HARNESS]?.push({ id: "AIH-90", status: "closed", assignee: ME, closedAt: START_MS });
    try {
      await w.clock.advance(MINUTE);
      await w.clock.settle();
    } finally {
      STORES[CWD]?.pop();
      STORES[HARNESS]?.pop();
    }

    expect(doneReads(w)).toHaveLength(4);
    expect(w.blits).toHaveLength(1);
    // The redraw draws both stores' closes, which the one blit could not have held.
    const redrawn = String((await ui.find({ type: "Raster" }))?.props.cells);
    expect(redrawn).not.toBe(w.blits[0]?.cells);
  });

  test("should read no done times and send no blit on a minute where no done count moved", async ($, on) => {
    const w = await started($, on);
    await band($);
    const reads = doneReads(w).length;

    await w.clock.advance(MINUTE);
    await w.clock.settle();

    expect(doneReads(w)).toHaveLength(reads);
    expect(w.blits).toEqual([]);
  });

  test("should draw the new figures at the next redraw when the engine refuses the blit", async ($, on) => {
    const w = await started($, on, as({ blitAnswer: "no such Raster on screen" }));
    const ui = await band($);

    STORES[HARNESS]?.push({ id: "AIH-9", status: "closed", assignee: ME, closedAt: START_MS });
    try {
      await w.clock.advance(MINUTE);
      await w.clock.settle();
    } finally {
      STORES[HARNESS]?.pop();
    }

    expect(w.blits).toHaveLength(1);
    expect(String((await ui.find({ type: "Raster" }))?.props.cells)).toBe(w.blits[0]?.cells);
  });
});
