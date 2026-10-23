import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect, test } from "claude-code/testing";

import cascadePreview from "../core/test/fixtures/bd-delete-cascade-dry-run.json.ts";
import leafText from "../core/test/fixtures/bd-delete-dry-run-leaf.txt.ts";
import listText from "../core/test/fixtures/bd-list-all-brief.json.ts";
import { CONFIRM_ID, PANE_ID, PLUGIN_NAME } from "./register.ts";
import {
  DEPENDENTS_STDERR,
  exit,
  ok,
  PANE_PROPS,
  SESSION,
  SHOW,
  SURFACES,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

const mount = ($: Engine, requestId: string, surface: "terminal" | "desktop" = "terminal") =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface,
    component: "Pane",
    props: PANE_PROPS,
    requestId,
    viewport: VIEWPORT,
  });

// The person's Tab onto an element, as the engine raises it: ui.focus with the element's key.
// The kit passes a test's call through as written, so the test spells the engine's input.
const tabTo = ($: Engine, element: string) =>
  $.ui.focus({
    component: "Pane",
    requestId: PANE_ID,
    plugin: PLUGIN_NAME,
    element,
    origin: { kind: "person" },
  } as never);

/** The pane open, the card for `id` focused, and x pressed: the delete confirmation open. */
async function deleting(
  $: Engine,
  on: On,
  id: string,
  options: WorldOptions = {},
  surface: "terminal" | "desktop" = "terminal",
) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const pane = await mount($, PANE_ID, surface);
  await tabTo($, `move:${id}`);
  const before = w.keys().length;
  await pane.press({ key: "delete" });
  await w.clock.settle();
  const confirm = await mount($, CONFIRM_ID, surface);
  return { w, pane, confirm, since: () => w.keys().slice(before) };
}

const forced = (keys: readonly string[]) => keys.filter((key) => key.includes("--force"));

// The list once bd close has run: BU-mg2.3 as bd lists it, with the status bd close writes.
const closedList = () =>
  ok(
    JSON.stringify(
      (JSON.parse(listText) as { id: string; status: string }[]).map((issue) =>
        issue.id === "BU-mg2.3" ? { ...issue, status: "closed" } : issue,
      ),
    ),
  );

describe("the delete confirmation", () => {
  for (const surface of SURFACES) {
    test(`should open a focused pane with bd delete --dry-run output and Close instead before any write on ${surface}`, async ($, on) => {
      const { w, confirm, since } = await deleting($, on, "BU-2zw", {}, surface);

      expect(w.opened.find((open) => open.id === CONFIRM_ID)).toMatchObject({
        focus: true,
        closeOnEscape: true,
        holdToasts: true,
      });
      // The board steps aside first: an opening pane gets the keyboard only from the prompt.
      expect(w.closed).toEqual([PANE_ID]);
      expect(since()[0]).toBe("bd delete BU-2zw --dry-run");
      expect(forced(since())).toEqual([]);
      expect((await confirm.find({ type: "Code" }))?.props.source).toBe(leafText);
      expect((await confirm.find({ key: "close-instead" }))?.props.label).toBe("Close instead");
      expect((await confirm.find({ key: "close-instead" }))?.props.hotkey).toBe("c");
    });
  }

  test("should require the display id typed before enabling Delete with --cascade when the dry run lists dependents", async ($, on) => {
    const { confirm, since } = await deleting($, on, "BU-mg2.3");

    expect(since()).toEqual([
      "bd delete BU-mg2.3 --dry-run",
      "bd delete BU-mg2.3 --cascade --dry-run",
    ]);
    expect((await confirm.find({ key: "confirm-dependents" }))?.text).toMatch(
      /^10 dependents would be deleted with --cascade/,
    );
    expect(await confirm.find({ key: "delete" })).toBeUndefined();

    await confirm.input({ key: "typed-id", text: "BU-mg2.3", kind: "change" });
    expect(await confirm.find({ key: "delete" })).toBeUndefined();
    expect(forced(since())).toEqual([]);

    await confirm.input({ key: "typed-id", text: "BU-beads-ui-claude-code-aeyb", kind: "change" });
    expect((await confirm.find({ key: "delete" }))?.props.label).toBe("Delete with --cascade");

    await confirm.press({ key: "delete" });

    expect(since().slice(2, 4)).toEqual([
      "bd delete BU-mg2.3 --cascade --dry-run",
      "bd delete BU-mg2.3 --cascade --force",
    ]);
  });

  test("should run bd close and never bd delete when Close instead is chosen", async ($, on) => {
    const { w, pane, confirm, since } = await deleting($, on, "BU-mg2.3");

    await confirm.press({ key: "close-instead" });
    await w.clock.settle();

    expect(since()).toContain("bd close BU-mg2.3");
    expect(
      since().filter((key) => key.startsWith("bd delete") && !key.includes("--dry-run")),
    ).toEqual([]);
    expect(w.closed).toEqual([PANE_ID, CONFIRM_ID]);
    expect(w.opened.map((open) => [open.id, open.focus])).toEqual([
      [PANE_ID, true],
      [CONFIRM_ID, true],
      [PANE_ID, true],
    ]);
    expect((await pane.find({ key: "notice" }))?.text).toBe("BU-beads-ui-claude-code-aeyb closed");
  });

  test("should undo a Close instead through the guarded write back to the status it had", async ($, on) => {
    let closedYet = false;
    const { w, pane, confirm, since } = await deleting($, on, "BU-mg2.3", {
      script: (key) =>
        key === "bd list --all --brief --limit 0" && closedYet ? closedList() : undefined,
    });
    closedYet = true;
    await confirm.press({ key: "close-instead" });
    await w.clock.settle();

    expect((await pane.find({ key: "undo-line" }))?.text).toBe(
      "BU-beads-ui-claude-code-aeyb is closed; u puts it back to in_progress",
    );
    await pane.press({ key: "undo" });
    await w.clock.settle();

    const undo = since().find((key) => key.startsWith("bd update BU-mg2.3"));
    expect(undo).toBe("bd update BU-mg2.3 --status in_progress --if-status closed");
    expect(await pane.find({ key: "undo" })).toBeUndefined();
  });

  test("should re-run the dry run before a leaf delete and write only after it holds", async ($, on) => {
    const { w, pane, confirm, since } = await deleting($, on, "BU-2zw");

    await confirm.press({ key: "delete" });
    await w.clock.settle();

    expect(since().slice(0, 3)).toEqual([
      "bd delete BU-2zw --dry-run",
      "bd delete BU-2zw --dry-run",
      "bd delete BU-2zw --force",
    ]);
    expect(w.closed).toContain(CONFIRM_ID);
    expect((await pane.find({ key: "notice" }))?.text).toBe(
      "BU-npm-audit-10-dev-only-advisories-2zw deleted",
    );
  });

  test("should go to the typed-id cascade path and delete nothing when the re-check finds a new dependent", async ($, on) => {
    let previews = 0;
    const { w, confirm, since } = await deleting($, on, "BU-2zw", {
      script: (key) => {
        // BU-2zw's cascade preview: BU-mg2.3's captured one, naming BU-2zw.
        if (key === "bd delete BU-2zw --cascade --dry-run") {
          return ok(cascadePreview.replace('"BU-mg2.3"', '"BU-2zw"'));
        }
        if (key !== "bd delete BU-2zw --dry-run") return undefined;
        previews++;
        return previews === 1
          ? undefined
          : exit(1, DEPENDENTS_STDERR.replaceAll("BU-mg2.3", "BU-2zw"));
      },
    });

    await confirm.press({ key: "delete" });
    await w.clock.settle();

    expect(forced(since())).toEqual([]);
    expect(since()).toContain("bd delete BU-2zw --cascade --dry-run");
    expect((await confirm.find({ key: "confirm-status" }))?.text).toBe(
      "a dependent was added since the preview; nothing was deleted",
    );
    expect(await confirm.find({ key: "delete" })).toBeUndefined();
    expect(await confirm.find({ key: "typed-id" })).toBeDefined();
  });
});
