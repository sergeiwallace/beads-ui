import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect, test } from "claude-code/testing";

import { asOf, clockStamp } from "../core/src/index.ts";
import { NARROW_TEXT } from "./pane.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { TALLY_REFRESH_MS } from "./tally.ts";
import {
  BAND_PROPS,
  type Counted,
  CWD,
  countScript,
  exit,
  INVENTORY_PATH,
  inventoryOf,
  SESSION,
  SHOW,
  START_MS,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

const LIST = "bd list --all --brief --limit 0";
const STAMP = asOf(clockStamp(START_MS, new Date(START_MS).getTimezoneOffset()));

const band = ($: Engine, columns = 120, hasSurvey = false) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: { ...BAND_PROPS, bodyColumns: columns, hasSurvey },
    viewport: { ...VIEWPORT, columns },
  });

const row = async (ui: Awaited<ReturnType<typeof band>>, key: string) =>
  (await ui.find({ key: `beads-band:${key}` }))?.text;

/** A session `ai c` named, so `CLAUDE_CODE_TASK_LIST_ID` holds its name. */
const named = (session: string, options: WorldOptions = {}): WorldOptions => ({
  ...options,
  env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: session },
});

const HARNESS = "/work/ai-harness";
/** Two stores holding issues of three sessions and one with no assignee. */
const STORES: Readonly<Record<string, readonly Counted[]>> = {
  [CWD]: [
    { status: "open", assignee: "aih-ec2-3" },
    { status: "in_progress", assignee: "aih-ec2-3" },
    { status: "closed", assignee: "aih-ec2-3" },
    { status: "open", assignee: "kg-ec2-1" },
    { status: "blocked", assignee: "kg-ec2-1" },
    { status: "open" },
  ],
  [HARNESS]: [
    { status: "open", assignee: "aih-ec2-3" },
    { status: "blocked", assignee: "aih-ec2-3" },
    { status: "in_progress", assignee: "aih-ec2-firstmate-1" },
    { status: "open", assignee: "kg-ec2-1" },
  ],
};
const INVENTORY = { [INVENTORY_PATH]: inventoryOf({ BU: { repo: CWD }, AIH: { repo: HARNESS } }) };

async function started($: Engine, on: On, options: WorldOptions = {}) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await w.clock.settle();
  return w;
}

describe("the band above the prompt", () => {
  test("should count only the session's own issues across every store when a named session starts", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", { files: INVENTORY, script: countScript(STORES) }),
    );

    const ui = await band($);

    expect(w.registered).toEqual(["show-beads-ui", "bu"]);
    expect(await row(ui, "own")).toBe(
      `beads aih-ec2-3, all 2 stores  2 open  1 in progress  1 blocked  ${STAMP}`,
    );
    expect(await row(ui, "totals")).toBeUndefined();
  });

  test("should count the session's own issues in its directory's store when there is no store inventory", async ($, on) => {
    const w = await started($, on, named("aih-ec2-3", { script: countScript(STORES) }));

    const ui = await band($);

    expect(await row(ui, "own")).toBe(
      `beads aih-ec2-3 in beads-ui  1 open  1 in progress  0 blocked  ${STAMP}`,
    );
    expect(w.runs.filter((argv) => argv[1] === "count")).toEqual([
      ["bd", "count", "--assignee=aih-ec2-3", "--by-status", "--json"],
    ]);
  });

  test("should draw the host pair's totals above its own counts when a firstmate session starts", async ($, on) => {
    await started(
      $,
      on,
      named("aih-ec2-firstmate-1", { files: INVENTORY, script: countScript(STORES) }),
    );

    const ui = await band($);

    expect(await row(ui, "totals")).toBe(
      `beads host pair, all 2 stores  5 open  2 in progress  2 blocked  ${STAMP}`,
    );
    expect(await row(ui, "own")).toBe(
      `beads aih-ec2-firstmate-1, all 2 stores  0 open  1 in progress  0 blocked  ${STAMP}`,
    );
    const text = (await ui.find({ key: "beads-band" }))?.text ?? "";
    expect(text.indexOf("host pair")).toBeLessThan(text.indexOf("aih-ec2-firstmate-1,"));
  });

  test("should name the stores not in step with the pair in the totals label when the inventory says so", async ($, on) => {
    const files = {
      [INVENTORY_PATH]: inventoryOf({ BU: { repo: CWD }, AIH: { repo: HARNESS, synced: false } }),
    };
    await started($, on, named("aih-ec2-firstmate-1", { files, script: countScript(STORES) }));

    const ui = await band($);

    expect(await row(ui, "totals")).toBe(
      `beads host pair, all 2 stores, 1 not synced with the pair  5 open  2 in progress  2 blocked  ${STAMP}`,
    );
  });

  test("should label the store's counts as every owner's when the session has no name", async ($, on) => {
    const w = await started($, on, { files: INVENTORY });

    const ui = await band($);

    expect(await row(ui, "store")).toBe(
      `beads beads-ui, all owners (session name unknown)  14 open  6 in progress  1 blocked  ${STAMP}`,
    );
    expect(await row(ui, "own")).toBeUndefined();
    expect(await row(ui, "totals")).toBeUndefined();
    expect(w.runs.some((argv) => argv.some((arg) => arg.startsWith("--assignee")))).toBe(false);
  });

  test("should treat an empty session name as no name when the variable is set but blank", async ($, on) => {
    await started($, on, named("  ", { files: INVENTORY }));

    const ui = await band($);

    expect(await row(ui, "store")).toBe(
      `beads beads-ui, all owners (session name unknown)  14 open  6 in progress  1 blocked  ${STAMP}`,
    );
  });

  test("should name the failure on the totals row and still draw its own counts when the totals cannot be read", async ($, on) => {
    const counts = countScript(STORES);
    await started(
      $,
      on,
      named("aih-ec2-firstmate-1", {
        files: INVENTORY,
        script: (key, argv, cwd) =>
          key === "bd count --by-status"
            ? exit(1, "Error: database is locked\n")
            : counts(key, argv, cwd),
      }),
    );

    const ui = await band($);

    expect(await row(ui, "totals")).toBe(
      `beads host pair, all 2 stores  could not read any of the 2 stores  ${STAMP}`,
    );
    expect(await row(ui, "own")).toBe(
      `beads aih-ec2-firstmate-1, all 2 stores  0 open  1 in progress  0 blocked  ${STAMP}`,
    );
  });

  test("should total the stores that answered and name the one that did not when one store fails", async ($, on) => {
    const counts = countScript(STORES);
    await started(
      $,
      on,
      named("aih-ec2-firstmate-1", {
        files: INVENTORY,
        script: (key, argv, cwd) =>
          key === "bd count --by-status" && cwd === HARNESS
            ? exit(1, "Error: database is locked\n")
            : counts(key, argv, cwd),
      }),
    );

    const ui = await band($);

    expect(await row(ui, "totals")).toBe(
      `beads host pair, all 2 stores  3 open  1 in progress  1 blocked  1 of 2 stores unread (AIH)  ${STAMP}`,
    );
  });

  test("should say it cannot list the stores and still draw its own counts when a firstmate has no inventory", async ($, on) => {
    await started($, on, named("aih-ec2-firstmate-1", { script: countScript(STORES) }));

    const ui = await band($);

    expect(await row(ui, "totals")).toBe(
      `beads host pair  cannot list the stores: no store inventory at ${INVENTORY_PATH}  ${STAMP}`,
    );
    expect(await row(ui, "own")).toBe(
      `beads aih-ec2-firstmate-1 in beads-ui  0 open  0 in progress  0 blocked  ${STAMP}`,
    );
  });

  test("should read the counts again every 30 seconds and not sooner", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", { files: INVENTORY, script: countScript(STORES) }),
    );
    const counts = () => w.keys().filter((key) => key.startsWith("bd count ")).length;
    const first = counts();

    await w.clock.advance(TALLY_REFRESH_MS - 1);
    expect(counts()).toBe(first);

    await w.clock.advance(1);
    expect(counts()).toBe(first * 2);
  });

  test("should refresh at most every 10 seconds when the pane is closed", async ($, on) => {
    const w = await started($, on);
    const lists = () => w.keys().filter((key) => key === LIST).length;
    const first = lists();

    await w.clock.advance(9_999);
    expect(lists()).toBe(first);

    await w.clock.advance(1);
    expect(lists()).toBe(first + 1);
  });

  test("should keep the 10-second floor when beads-ui.toml asks for a faster refresh", async ($, on) => {
    const w = await started($, on, {
      files: { [`${CWD}/beads-ui.toml`]: "[stores.default]\nrefresh_seconds = 2\n" },
    });
    const lists = () => w.keys().filter((key) => key === LIST).length;
    const first = lists();

    await w.clock.advance(9_999);

    expect(lists()).toBe(first);
  });

  test("should draw nothing of its own when the store cannot be read", async ($, on) => {
    await started($, on, {
      script: (key) =>
        key === LIST || key.startsWith("bd count ")
          ? { exitCode: 1, stdout: "", stderr: "no beads database" }
          : undefined,
    });

    const ui = await band($);

    expect(await ui.find({ key: "beads-band" })).toBeUndefined();
  });

  test("should yield the band when a survey holds it", async ($, on) => {
    await started($, on);

    const ui = await band($, 120, true);

    expect(await ui.find({ key: "beads-band" })).toBeUndefined();
  });
});

describe("the pane's width rule", () => {
  const REOPEN = { stored: { view: { open: true } } };

  test("should toast the width needed and draw no pane when an open nobody asked for meets a narrow terminal", async ($, on) => {
    const w = await started($, on, REOPEN);

    await band($, 100);
    await w.clock.settle();

    expect(w.toasts).toEqual([NARROW_TEXT]);
    expect(NARROW_TEXT).toContain("110 columns");
    expect(w.opened).toEqual([]);
  });

  test("should reopen the pane left open last session without taking the keyboard when the terminal is wide", async ($, on) => {
    const w = await started($, on, REOPEN);

    await band($, 120);
    await w.clock.settle();

    expect(w.opened.map((open) => [open.id, open.focus])).toEqual([[PANE_ID, undefined]]);
    expect(w.toasts).toEqual([]);
  });

  test("should withdraw the pane and toast when the engine holds an unasked open unplaced", async ($, on) => {
    const w = await started($, on, {
      ...REOPEN,
      openAnswer: { isPlaced: false, reason: "unasked below 144 columns (120 now)" },
    });

    await band($, 120);
    await w.clock.settle();

    expect(w.closed).toEqual([PANE_ID]);
    expect(w.toasts).toEqual([NARROW_TEXT]);
  });

  test("should open the pane the person asked for whatever the width", async ($, on) => {
    const w = await started($, on);
    await band($, 80);

    await $.command.run(SHOW);

    expect(w.opened.map((open) => open.id)).toEqual([PANE_ID]);
    expect(w.toasts).toEqual([]);
  });
});
