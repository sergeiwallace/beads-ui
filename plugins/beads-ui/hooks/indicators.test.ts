import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { storeReads, storeSnapshotOf } from "../core/src/index.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { ME } from "./tests/mine.ts";
import { render } from "./tests/render.ts";
import {
  BAND_PROPS,
  CWD,
  countOf,
  countScript,
  type Listed,
  listRowsOf,
  listScript,
  ok,
  PANE_PROPS,
  REFRESHER_TOKEN,
  type Script,
  SESSION,
  SHOW,
  START_MS,
  STATE_DIR,
  STORE_LIST,
  VIEWPORT,
  world,
} from "./tests/world.ts";

// D-41, D-42 and T-2C.3: the row indicator gutter on every task row, band and pane, at the hooks
// entry point. A host refresher is played running, its snapshot naming the live sessions.

const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";
const SNAPSHOT = `${STATE_DIR}/counts-${REFRESHER_TOKEN}.json`;
const AGENT = "⟳";
const BLOCKED = "⊘";

/** One store: an issue with a live agent row, one whose agent's session is gone, two blocked. */
const TASKS: readonly Listed[] = [
  { id: "BU-1", status: "in_progress", assignee: ME, priority: 1, title: "live agent at work" },
  {
    id: "BU-1.1",
    status: "in_progress",
    assignee: "kg-ec2-1",
    parent: "BU-1",
    labels: ["agent"],
    title: "a labelled agent row",
  },
  { id: "BU-2", status: "open", assignee: ME, priority: 1, title: "agent of a gone session" },
  {
    id: "BU-2.1",
    status: "in_progress",
    assignee: "aih-gone",
    parent: "BU-2",
    title: "bu-old coordinator agent: review items",
  },
  { id: "BU-3", status: "blocked", assignee: ME, priority: 1, title: "blocked by its status" },
  {
    id: "BU-4",
    status: "open",
    assignee: ME,
    priority: 2,
    title: "blocked by BU-5",
    blockedBy: ["BU-5"],
  },
  { id: "BU-5", status: "in_progress", assignee: "kg-ec2-1", priority: 2, title: "the blocker" },
  { id: "BU-6", status: "open", assignee: ME, priority: 3, title: "nothing to show" },
];
const OWN = ["BU-1", "BU-2", "BU-3", "BU-4", "BU-6"];

const snapshot = (sessions: readonly string[]) => {
  const beatAt = START_MS - 10_000;
  const answers = storeReads(["24h"], beatAt).map((read) => ({
    key: read.key,
    ok: true as const,
    stdout: countOf(TASKS, read.argv).stdout,
  }));
  return JSON.stringify({
    schema: 1,
    token: REFRESHER_TOKEN,
    pid: 4242,
    beatAt,
    stores: [storeSnapshotOf({ path: CWD, name: "beads-ui" }, answers, beatAt)],
    sessions,
  });
};

const SCRIPT: Script = (key, argv, cwd) =>
  key === STORE_LIST
    ? ok(JSON.stringify(listRowsOf(TASKS)))
    : (listScript({ [CWD]: TASKS })(key, argv, cwd) ??
      countScript({ [CWD]: TASKS })(key, argv, cwd));

async function started(
  $: Engine,
  on: On,
  options: { config?: string; sessions?: readonly string[] } = {},
) {
  const w = world(on, {
    env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: ME },
    refresher: true,
    files: {
      [SNAPSHOT]: snapshot(options.sessions ?? [ME, "kg-ec2-1"]),
      ...(options.config === undefined ? {} : { [USER_CONFIG]: options.config }),
    },
    script: SCRIPT,
  });
  await $.session.start(SESSION);
  await w.clock.settle();
  return w;
}

const band = ($: Engine, columns = 120) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: { ...BAND_PROPS, bodyColumns: columns, maxRows: 10 },
    viewport: { ...VIEWPORT, columns },
  });

/** The band's rows of every status the session owns, as a terminal `columns` wide shows them. */
async function bandRows(
  $: Engine,
  w: { clock: { settle: () => Promise<unknown> } },
  columns = 120,
) {
  await (await band($, columns)).press({ key: "band:expand" });
  await w.clock.settle();
  return render(await (await band($, columns)).drawn(), columns).filter((line) =>
    /BU-\d/.test(line),
  );
}

/** The pane in VS Code, whose element tree draws the Tasks view's rows (the terminal's Client draws them). */
async function pane($: Engine, w: { clock: { settle: () => Promise<unknown> } }, columns = 118) {
  await $.command.run(SHOW);
  await w.clock.settle();
  return $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "vscode",
    component: "Pane",
    props: { ...PANE_PROPS, bodyColumns: columns },
    requestId: PANE_ID,
    viewport: { ...VIEWPORT, columns: Math.max(columns + 2, 40) },
  });
}

type Mounted = Awaited<ReturnType<typeof pane>>;

const rowLine = async (ui: Mounted, key: string, columns = 118) => {
  const found = await ui.find({ key });
  return found === undefined ? undefined : render(found, columns).join("\n");
};

interface Drawn {
  type?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
}

/** The nested Texts drawing `glyph` under the node keyed `key`, as drawn. */
function glyphTexts(tree: unknown, key: string, glyph: string): Drawn[] {
  const found: Drawn[] = [];
  const walk = (value: unknown, inside: boolean) => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, inside);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const node = value as Drawn;
    const here = inside || node.props?.key === key;
    if (here && node.type === "Text" && node.props?.children === glyph) found.push(node);
    if (here && node.type === "Text" && (node.children ?? []).includes(glyph)) found.push(node);
    for (const child of node.children ?? []) walk(child, here);
    if (Array.isArray(node.props?.children)) walk(node.props.children, here);
  };
  walk(tree, false);
  return found;
}

const dimmed = (node: Drawn | undefined) => node?.props?.dimColor === true;

describe("the blocked indicator (D-41, T-2C.3)", () => {
  test("should show on the band's rows of an issue blocked by its status or by an open blocks dependency", async ($, on) => {
    const w = await started($, on);

    const rows = await bandRows($, w);

    expect(rows.find((line) => line.includes("BU-3"))).toContain(BLOCKED);
    expect(rows.find((line) => line.includes("BU-4"))).toContain(BLOCKED);
    expect(rows.find((line) => line.includes("BU-6"))).not.toContain(BLOCKED);
    expect(rows.find((line) => line.includes("BU-1 "))).not.toContain(BLOCKED);
  });

  test("should show on the Tasks view's rows, the Backlog's rows and the Board's cards of a blocked issue", async ($, on) => {
    const w = await started($, on);
    const ui = await pane($, w);

    expect(await rowLine(ui, "taskrow:BU-3")).toContain(BLOCKED);
    expect(await rowLine(ui, "taskrow:BU-4")).toContain(BLOCKED);
    expect(await rowLine(ui, "taskrow:BU-6")).not.toContain(BLOCKED);
    await ui.press({ key: "tab:backlog" });
    expect(await rowLine(ui, "row:BU-4")).toContain(BLOCKED);
    expect(await rowLine(ui, "row:BU-6")).not.toContain(BLOCKED);
    await ui.press({ key: "tab:board" });
    expect(await rowLine(ui, "card:BU-3", 40)).toContain(BLOCKED);
    expect(await rowLine(ui, "card:BU-6", 40)).not.toContain(BLOCKED);
  });
});

describe("the agent indicator (D-42, T-2C.3)", () => {
  test("should show for an in-progress agent row child, dimmed when its session is not live on the host", async ($, on) => {
    const w = await started($, on);

    const rows = await bandRows($, w);
    const drawn = await (await band($)).drawn();

    expect(rows.find((line) => line.includes("BU-1 "))).toContain(AGENT);
    expect(rows.find((line) => line.includes("BU-2 "))).toContain(AGENT);
    expect(rows.find((line) => line.includes("BU-6"))).not.toContain(AGENT);
    expect(dimmed(glyphTexts(drawn, "band-row:BU-1", AGENT)[0])).toBe(false);
    expect(dimmed(glyphTexts(drawn, "band-row:BU-2", AGENT)[0])).toBe(true);
  });

  test("should dim every agent glyph whose session the refresher's registry does not name live", async ($, on) => {
    const w = await started($, on, { sessions: [ME] });
    const ui = await pane($, w);

    const drawn = await ui.drawn();
    expect(dimmed(glyphTexts(drawn, "taskrow:BU-1", AGENT)[0])).toBe(true);
    expect(dimmed(glyphTexts(drawn, "taskrow:BU-2", AGENT)[0])).toBe(true);
  });

  test("should draw the agent glyph undimmed on the Tasks view while the agent row's session is live", async ($, on) => {
    const w = await started($, on);
    const ui = await pane($, w);

    const drawn = await ui.drawn();
    expect(dimmed(glyphTexts(drawn, "taskrow:BU-1", AGENT)[0])).toBe(false);
    expect(glyphTexts(drawn, "taskrow:BU-6", AGENT)).toEqual([]);
  });
});

describe("the gutter (D-41, T-2C.3)", () => {
  test("should keep every band row and Tasks row aligned, one cell per indicator, glyph or blank, in registry order", async ($, on) => {
    const w = await started($, on);

    const rows = await bandRows($, w);
    const starts = rows.map((line) => line.indexOf("["));
    expect(new Set(starts).size).toBe(1);
    expect(rows.find((line) => line.includes("BU-1 "))?.slice(0, 5)).toBe(`  ${AGENT}  `);
    expect(rows.find((line) => line.includes("BU-3"))?.slice(0, 5)).toBe(`   ${BLOCKED} `);
    expect(rows.find((line) => line.includes("BU-6"))?.slice(0, 5)).toBe("     ");

    const ui = await pane($, w);
    const lines = await Promise.all(OWN.map((id) => rowLine(ui, `taskrow:${id}`)));
    expect(new Set(lines.map((line) => line?.indexOf("["))).size).toBe(1);
    expect(lines[0]?.slice(0, 3)).toBe(`${AGENT}  `);
    expect(lines[2]?.slice(0, 3)).toBe(` ${BLOCKED} `);
  });

  test("should draw a one-cell gutter below 48 columns, the first indicator that fires", async ($, on) => {
    const w = await started($, on);

    const rows = await bandRows($, w, 40);
    expect(rows.find((line) => line.includes("BU-1"))?.slice(0, 4)).toBe(`  ${AGENT} `);
    expect(rows.find((line) => line.includes("BU-3"))?.slice(0, 4)).toBe(`  ${BLOCKED} `);
    expect(rows.find((line) => line.includes("BU-6"))?.slice(0, 4)).toBe("    ");
    for (const line of rows) expect([...line].length).toBeLessThanOrEqual(40);

    const ui = await pane($, w, 40);
    expect((await rowLine(ui, "taskrow:BU-3", 40))?.slice(0, 2)).toBe(`${BLOCKED} `);
    expect((await rowLine(ui, "taskrow:BU-6", 40))?.slice(0, 2)).toBe("  ");
  });

  test("should drop an indicator's cell from every row when [indicators] switches it off", async ($, on) => {
    const w = await started($, on, { config: "[indicators]\nagent = false\n" });

    const rows = await bandRows($, w);
    expect(rows.some((line) => line.includes(AGENT))).toBe(false);
    expect(rows.find((line) => line.includes("BU-3"))?.slice(0, 4)).toBe(`  ${BLOCKED} `);
  });

  test("should draw each indicator's ASCII form when [indicators] ascii is true", async ($, on) => {
    const w = await started($, on, { config: "[indicators]\nascii = true\n" });

    const rows = await bandRows($, w);
    expect(rows.find((line) => line.includes("BU-1 "))?.slice(0, 5)).toBe("  *  ");
    expect(rows.find((line) => line.includes("BU-3"))?.slice(0, 5)).toBe("   ! ");
    expect(rows.some((line) => line.includes(AGENT) || line.includes(BLOCKED))).toBe(false);
  });
});

describe("the legend and the switches (D-41, T-2C.3)", () => {
  test("should list each indicator's glyph, ASCII form and meaning in the help and in Settings", async ($, on) => {
    const w = await started($, on);
    const ui = await pane($, w);

    await ui.press({ key: "help" });
    const help = (await ui.find({ key: "help", type: "Box" }))?.text ?? "";
    expect(help).toContain("Row indicators");
    expect(help).toContain(`${AGENT} (*) agent: an agent is working on it`);
    expect(help).toContain(`${BLOCKED} (!) blocked: blocked, or an open issue blocks it`);
    await ui.press({ key: "help" });
    await ui.press({ key: "tab:settings" });
    expect((await ui.find({ key: "settings:indicator:agent:row" }))?.text).toContain(
      "an agent is working on it",
    );
    expect((await ui.find({ key: "settings:indicator:blocked:row" }))?.text).toContain("ASCII !");
    expect((await ui.find({ key: "settings:indicator:review:row" }))?.text).toContain("ASCII ?");
  });

  test("should switch an indicator off from Settings at once and save the switch to [indicators]", async ($, on) => {
    const w = await started($, on);
    const ui = await pane($, w);
    await ui.press({ key: "tab:settings" });

    await ui.select({ key: "settings:indicator:blocked", value: "off" });
    await w.clock.settle();
    await ui.press({ key: "tab:tasks" });
    expect(await rowLine(ui, "taskrow:BU-3")).not.toContain(BLOCKED);
    expect((await rowLine(ui, "taskrow:BU-1"))?.slice(0, 2)).toBe(`${AGENT} `);

    await ui.press({ key: "tab:settings" });
    await ui.press({ key: "settings:save" });
    await w.clock.settle();
    expect(w.files.get(USER_CONFIG) ?? "").toContain(
      "[indicators]\nascii = false\nblocked = false",
    );
  });
});
