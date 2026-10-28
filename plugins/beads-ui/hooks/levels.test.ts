import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { BAND_LEVEL_KEY, BEADS_BUTTON_KEY, EXPAND_KEY, OVERVIEW_KEY } from "./levels.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
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
  listRowsOf,
  listScript,
  ok,
  PANE_PROPS,
  type Script,
  SESSION,
  SHOW,
  START_MS,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// D-36, T-2C.2: the band's three disclosure levels, at the hooks entry point. The band reads its
// counts from each store itself here (no refresher runs), so each line ends with `*`.

const HOUR = 3_600_000;
const HARNESS = "/work/ai-harness";
const FM = "ops-vm-firstmate-1";
const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";

/** Seven of the session's tasks in progress across two stores, and others of every status. */
const STORES: Readonly<Record<string, readonly Listed[]>> = {
  [CWD]: [
    { id: "BU-1", status: "in_progress", assignee: ME, priority: 1, title: "first in progress" },
    { id: "BU-2", status: "in_progress", assignee: ME, priority: 2 },
    { id: "BU-3", status: "in_progress", assignee: ME, priority: 3 },
    { id: "BU-4", status: "in_progress", assignee: ME, priority: 3 },
    { id: "BU-5", status: "blocked", assignee: ME, priority: 1 },
    { id: "BU-6", status: "open", assignee: ME, priority: 0 },
    { id: "BU-7", status: "closed", assignee: ME, closedAt: START_MS - HOUR },
    { id: "BU-8", status: "in_progress", assignee: "qa-vm-1" },
    { id: "BU-9", status: "open", assignee: FM },
  ],
  [HARNESS]: [
    { id: "OPS-1", status: "in_progress", assignee: ME, priority: 0, title: "harness work" },
    { id: "OPS-2", status: "in_progress", assignee: ME, priority: 2 },
    { id: "OPS-3", status: "in_progress", assignee: ME, priority: 4 },
    { id: "OPS-4", status: "closed", assignee: ME, closedAt: START_MS - 72 * HOUR },
    { id: "OPS-5", status: "in_progress", assignee: FM },
  ],
};
const INVENTORY = inventoryOf({ BU: { repo: CWD }, OPS: { repo: HARNESS } });

const both =
  (...scripts: (Script | undefined)[]): Script =>
  (key, argv, cwd) => {
    for (const script of scripts) {
      const answer = script?.(key, argv, cwd);
      if (answer !== undefined) return answer;
    }
    return undefined;
  };

const SCRIPT = both(MINE.script, listScript(STORES), countScript(STORES));

const as = (session: string, options: WorldOptions = {}): WorldOptions => ({
  ...options,
  env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: session },
  files: { [INVENTORY_PATH]: INVENTORY, ...options.files },
  script: both(options.script, SCRIPT),
});

async function started($: Engine, on: On, options: WorldOptions = as(ME)) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await w.clock.settle();
  return w;
}

const band = ($: Engine, columns = 120, maxRows = BAND_PROPS.maxRows) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: { ...BAND_PROPS, bodyColumns: columns, maxRows },
    viewport: { ...VIEWPORT, columns },
  });

/** The band as a terminal `columns` wide shows it. */
const lines = async ($: Engine, columns = 120, maxRows = BAND_PROPS.maxRows) =>
  render(await (await band($, columns, maxRows)).drawn(), columns);

/** Presses `key` on the band and lets the reads it starts land. */
async function press($: Engine, w: { clock: { settle: () => Promise<unknown> } }, key: string) {
  await (await band($)).press({ key });
  await w.clock.settle();
}

/** The task ids the band's rows draw, in order. */
const rowIds = async ($: Engine, maxRows = BAND_PROPS.maxRows) =>
  (await (await band($, 120, maxRows)).findAll({}))
    .map((element) => element.key ?? "")
    .filter((key) => key.startsWith("band-open:"))
    .map((key) => key.slice("band-open:".length));

const keysOf = async ($: Engine, prefix: string, columns = 120) =>
  (await (await band($, columns)).findAll({}))
    .map((element) => element.key ?? "")
    .filter((key) => key.startsWith(prefix));

describe("the band's summary level (D-36, T-2C.2)", () => {
  test("should draw every count as a button inside the summary text and the expand, overview and pane controls right after it", async ($, on) => {
    await started($, on);

    expect(await lines($)).toEqual([
      "[bd] [t: 10 tasks] (◒[p: 7 in progress], ◉[b: 1 blocked], ◦[o: 1 open], ✓[d: 1 done last 24h]) * [e: ▾] [v: ◫] [◨]",
    ]);
    expect(await keysOf($, "band-count:")).toEqual([
      "band-count:own:total",
      "band-count:own:in_progress",
      "band-count:own:blocked",
      "band-count:own:open",
      "band-count:own:done",
    ]);
    const drawn = JSON.stringify(await (await band($)).drawn());
    const at = (key: string) => drawn.indexOf(`"key":"${key}"`);
    expect(at("beads-band:own")).toBeGreaterThan(at("beads-band:first"));
    expect(at(`press:${EXPAND_KEY}`)).toBeGreaterThan(at("band-count:own:done"));
    expect(at(`press:${OVERVIEW_KEY}`)).toBeGreaterThan(at(`press:${EXPAND_KEY}`));
    expect(at(`press:${BEADS_BUTTON_KEY}`)).toBeGreaterThan(at(`press:${OVERVIEW_KEY}`));
    expect(drawn).not.toContain('"flexGrow"');
  });

  test("should draw count buttons on the firstmate's [bd][all] line and its [fm] line, the drift marker among them", async ($, on) => {
    const files = {
      [INVENTORY_PATH]: inventoryOf({ BU: { repo: CWD }, OPS: { repo: HARNESS, synced: false } }),
    };
    await started($, on, as(FM, { files }));

    expect(await lines($, 200)).toEqual([
      "[bd][all] [a: 13 tasks] (◒[i: 9 in progress], ◉[k: 1 blocked], ◦[l: 2 open], ✓[j: 1 done last 24h]) [u: 1 unsynced] * [e: ▾] [v: ◫] [◨]",
      "     [fm] [t: 2 tasks] (◒[p: 1 in progress], ◉[b: 0 blocked], ◦[o: 1 open], ✓[d: 0 done last 24h]) *",
    ]);
    // At 120 columns the first line's tail is cut short and its controls stay right after it.
    expect((await lines($, 120))[0]).toMatch(/24h\]\) ⋯ \[e: ▾\] \[v: ◫\] \[◨\]$/);
    expect(await keysOf($, "band-count:all:", 200)).toEqual([
      "band-count:all:total",
      "band-count:all:in_progress",
      "band-count:all:blocked",
      "band-count:all:open",
      "band-count:all:done",
      "band-count:all:drift",
    ]);
    expect(await keysOf($, "band-count:own:")).toHaveLength(5);
  });
});

describe("the band's rows level (D-36, T-2C.2)", () => {
  test("should draw band.rows of a pressed count's tasks from every store its line sums, then +M more, collapse and summary", async ($, on) => {
    const w = await started($, on);

    await press($, w, "band-count:own:in_progress");
    expect(await rowIds($)).toEqual(["OPS-1", "BU-1", "BU-2", "OPS-2", "BU-3"]);
    expect((await (await band($)).find({ key: "band:more" }))?.props.label).toBe("+2 more");
    expect(await (await band($)).find({ key: "band:collapse" })).toBeUndefined();

    await press($, w, "band:more");
    expect(await rowIds($)).toEqual(["OPS-1", "BU-1", "BU-2", "OPS-2", "BU-3", "BU-4", "OPS-3"]);
    expect(await (await band($)).find({ key: "band:more" })).toBeUndefined();

    await press($, w, "band:collapse");
    expect(await rowIds($)).toHaveLength(5);

    await press($, w, "band:summary");
    expect(await rowIds($)).toEqual([]);
    expect(await lines($)).toHaveLength(1);
  });

  test("should give every count and control a letter hotkey, and close a count's rows on a second press of it", async ($, on) => {
    const w = await started($, on, as(FM));
    const ui = await band($, 200);
    const hotkey = async (key: string) => (await ui.find({ key }))?.props.hotkey;

    const keys = await Promise.all(
      [
        "band-count:own:total",
        "band-count:own:in_progress",
        "band-count:own:blocked",
        "band-count:own:open",
        "band-count:own:done",
        "band-count:all:total",
        "band-count:all:in_progress",
        "band-count:all:blocked",
        "band-count:all:open",
        "band-count:all:done",
        EXPAND_KEY,
        OVERVIEW_KEY,
      ].map(hotkey),
    );
    expect(keys).toEqual(["t", "p", "b", "o", "d", "a", "i", "k", "l", "j", "e", "v"]);
    expect(await hotkey(BEADS_BUTTON_KEY)).toBeUndefined();

    await press($, w, "band-count:own:open");
    expect(await rowIds($)).toEqual(["BU-9"]);
    await press($, w, "band-count:own:open");
    expect(await rowIds($)).toEqual([]);
  });

  test("should draw every status the session owns in the Tasks view's order when the expand control is pressed", async ($, on) => {
    const w = await started($, on, as(ME, { files: { [USER_CONFIG]: "[band]\nrows = 20\n" } }));

    await press($, w, EXPAND_KEY);

    expect(await rowIds($, 15)).toEqual([
      "OPS-1",
      "BU-1",
      "BU-2",
      "OPS-2",
      "BU-3",
      "BU-4",
      "OPS-3",
      "BU-5",
      "BU-6",
      "BU-7",
    ]);
  });

  test("should list every owner's tasks under the firstmate's [all] count and its own under the [fm] count", async ($, on) => {
    const w = await started($, on, as(FM));

    await press($, w, "band-count:own:in_progress");
    expect(await rowIds($)).toEqual(["OPS-5"]);

    await press($, w, "band-count:all:open");
    expect((await rowIds($)).sort()).toEqual(["BU-6", "BU-9"]);
    const drawn = await lines($);
    expect(drawn[0]).toContain("[bd][all]");
    expect(drawn[1]).toContain("BU-");
    expect(drawn.at(-1)).toContain("[fm]");
  });

  test("should name a store whose rows could not be read and draw the rest", async ($, on) => {
    const broken: Script = (key, _argv, cwd) =>
      key.startsWith("bd list ") && key.includes("--status=") && cwd === HARNESS
        ? { exitCode: 1, stdout: "", stderr: "Error: database is locked\n" }
        : undefined;
    const w = await started($, on, as(ME, { script: broken }));

    await press($, w, "band-count:own:in_progress");

    expect(await rowIds($)).toEqual(["BU-1", "BU-2", "BU-3", "BU-4"]);
    expect((await (await band($)).find({ key: "band-rows:status" }))?.text).toBe(
      "  not read from OPS",
    );
  });
});

describe("the band's overview level (D-36, T-2C.2)", () => {
  test("should draw a nav generated from the view registry and the Tasks view through the framework when the overview control is pressed", async ($, on) => {
    const w = await started($, on);
    await $.command.run(SHOW);
    await w.clock.settle();
    const shown = await $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    });
    const paneNav = (await shown.findAll({}))
      .map((element) => element.key ?? "")
      .filter((key) => key.startsWith("tab:"));

    await press($, w, OVERVIEW_KEY);

    expect(await keysOf($, "tab:")).toEqual(paneNav);
    expect(await (await band($)).find({ key: "tasks" })).toBeDefined();
    expect((await keysOf($, "task:")).length).toBeGreaterThan(0);
    const drawn = await lines($);
    expect(drawn.length).toBeLessThanOrEqual(BAND_PROPS.maxRows);
    expect(drawn[1]).toMatch(/^\[Tasks\] {2}\[Board\]/);
  });

  test("should open a pressed row's Detail view in the overview, read from the task's own store, from the rows level and from the overview's own list", async ($, on) => {
    const harness = STORES[HARNESS] ?? [];
    const shows: Script = (key, _argv, cwd) => {
      if (cwd !== HARNESS) return undefined;
      if (key === "bd show OPS-1") {
        return ok(JSON.stringify(listRowsOf(harness.filter((one) => one.id === "OPS-1"))));
      }
      return key === "bd history OPS-1 --events" || key === "bd comments OPS-1"
        ? ok("[]")
        : undefined;
    };
    const w = await started($, on, as(ME, { script: shows }));

    await press($, w, "band-count:own:in_progress");
    await press($, w, "band-open:OPS-1");
    const shown = await band($, 120, 24);
    expect((await shown.find({ key: "detail-heading" }))?.text).toBe("OPS-1 harness work");
    expect((await shown.find({ key: "edit:status" }))?.props.value).toBe("in_progress");
    expect((await shown.find({ key: "edit:assignee" }))?.props.value).toBe(ME);
    expect(await shown.find({ key: "detail-error" })).toBeUndefined();
    expect(w.cwds[w.keys().indexOf("bd show OPS-1")]).toBe(HARNESS);
    expect(await shown.find({ key: "band:back" })).toBeDefined();

    await press($, w, "band:back");
    expect(await (await band($)).find({ key: "detail" })).toBeUndefined();
    const [row] = await keysOf($, "task:");
    await press($, w, row ?? "task:missing");
    expect(await (await band($, 120, 24)).find({ key: "detail-heading" })).toBeDefined();
  });

  test("should scroll the overview's list with its above and below buttons, within maxRows", async ($, on) => {
    const w = await started($, on);
    await press($, w, OVERVIEW_KEY);

    const before = await keysOf($, "task:");
    await press($, w, "tasks:below");
    const after = await keysOf($, "task:");
    expect(after).not.toEqual(before);
    expect(await (await band($)).find({ key: "tasks:above" })).toBeDefined();
    expect((await lines($)).length).toBeLessThanOrEqual(BAND_PROPS.maxRows);

    await press($, w, "tasks:above");
    expect(await keysOf($, "task:")).toEqual(before);
  });

  for (const [view, key] of [
    ["board", "board"],
    ["backlog", "backlog"],
    ["timeline", "timeline"],
    ["settings", "settings"],
  ] as const) {
    test(`should draw the ${view} view in the overview through its registry entry, within maxRows, and open no pane`, async ($, on) => {
      const w = await started($, on);
      await press($, w, OVERVIEW_KEY);

      await press($, w, `tab:${view}`);

      const shown = await band($);
      expect(await shown.find({ key }), view).toBeDefined();
      expect(await shown.find({ key: "band-overview:note" })).toBeUndefined();
      expect((await lines($)).length).toBeLessThanOrEqual(BAND_PROPS.maxRows);
      expect(w.opened).toEqual([]);
    });
  }
});

describe("band.rows and band.level (D-36, T-2C.2)", () => {
  test("should draw band.rows rows and open at band.level from beads-ui.toml, a change applying at the next redraw", async ($, on) => {
    const files = { [USER_CONFIG]: '[band]\nrows = 2\nlevel = "rows"\n' };
    const w = await started($, on, as(ME, { files }));
    await (await band($)).drawn();
    await w.clock.settle();

    expect(await rowIds($)).toEqual(["OPS-1", "BU-1"]);
    expect((await (await band($)).find({ key: "band:more" }))?.props.label).toBe("+8 more");

    w.files.set(USER_CONFIG, '[band]\nrows = 2\nlevel = "overview"\n');
    await w.clock.advance(60_000);
    await w.clock.settle();
    expect(await (await band($)).find({ key: "beads-band:overview" })).toBeDefined();
  });

  test("should apply rows and the opening level set in Settings at once", async ($, on) => {
    const w = await started($, on);
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
    await ui.press({ key: "band-settings" });

    await ui.input({ key: "band:rows", text: "3" });
    await ui.press({ key: "band:level:rows" });
    await w.clock.settle();

    expect(await rowIds($)).toEqual(["OPS-1", "BU-1", "BU-2"]);
    await ui.input({ key: "band:rows", text: "0" });
    expect((await ui.find({ key: "band:notice" }))?.text).toBe(
      '"0" is not a whole number from 1 to 50',
    );
  });

  test("should keep the level the session chose in $.store under its name, beside another session's", async ($, on) => {
    const other = {
      level: "overview",
      line: "own",
      part: "total",
      shown: 5,
      view: "tasks",
      start: 0,
      basis: "summary",
    };
    const w = await started($, on, as(ME, { stored: { [BAND_LEVEL_KEY]: { "qa-vm-1": other } } }));
    await press($, w, "band-count:own:open");

    const kept = w.store.get(BAND_LEVEL_KEY) as Record<string, unknown>;
    expect(kept[ME]).toMatchObject({ level: "rows", line: "own", part: "open", basis: "summary" });
    expect(kept["qa-vm-1"]).toEqual(other);
  });

  test("should draw the level a session kept when it starts again", async ($, on) => {
    const mine = {
      level: "rows",
      line: "own",
      part: "open",
      shown: 5,
      view: "tasks",
      start: 0,
      basis: "summary",
    };
    const w = await started($, on, as(ME, { stored: { [BAND_LEVEL_KEY]: { [ME]: mine } } }));
    await (await band($)).drawn();
    await w.clock.settle();

    expect(await rowIds($)).toEqual(["BU-6"]);
  });
});

describe("the band's size (D-36, T-2C.2)", () => {
  for (const [columns, session] of [40, 80, 120, 364].flatMap((one) =>
    [ME, FM].map((who) => [one, who] as const),
  )) {
    test(`should draw no line wider than ${columns} columns and no level taller than maxRows for ${session}`, async ($, on) => {
      {
        const w = await started($, on, as(session));
        const seen: [number, string[]][] = [];
        // Laid out with no edge to cut at, so a line wider than the band shows its whole width;
        // 6 rows leave the overview too few for the Tasks view, 12 draw it.
        const look = async () => {
          for (const rows of [6, 12]) {
            seen.push([rows, render(await (await band($, columns, rows)).drawn(), 100_000)]);
          }
        };
        await look();
        await press($, w, EXPAND_KEY);
        await look();
        if (await (await band($)).find({ key: "band:more" })) await press($, w, "band:more");
        await look();
        await press($, w, OVERVIEW_KEY);
        await look();
        const [row] = await keysOf($, "task:");
        await press($, w, row ?? "task:missing");
        await look();

        for (const [rows, drawn] of seen) {
          const what = `${session} at ${columns} by ${rows}: ${drawn.join("\n")}`;
          expect(drawn.length, what).toBeLessThanOrEqual(rows);
          for (const text of drawn) {
            expect([...text].length, `${session} at ${columns}: ${text}`).toBeLessThanOrEqual(
              columns,
            );
          }
        }
      }
    });
  }
});
