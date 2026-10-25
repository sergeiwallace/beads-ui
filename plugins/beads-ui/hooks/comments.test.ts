import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { parseBdComments } from "../core/src/index.ts";
import comments from "../core/test/fixtures/bd-comments-BU-mg2.3.json.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { ME, MINE } from "./tests/mine.ts";
import {
  CWD,
  exit,
  ok,
  PANE_PROPS,
  type Script,
  SESSION,
  SHOW,
  VIEWPORT,
  world,
} from "./tests/world.ts";

// BU-mg2.3.15: an issue's comments in the Detail view, which the task panel opens a task into,
// and a comment added from the pane with bd comments add as the session's actor, published by
// the panel's sync.command (D-33).

const PROGRAM = "/opt/fleet/bin/publish-store";
const CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";
const SYNC_CONFIG = `[sync]\ncommand = ["${PROGRAM}", "--repo", "{store}", "--json"]\n`;
const ADD = `bd comments add BU-mg2.3 --actor=${ME} --`;

const fixture = () => {
  const parsed = parseBdComments(comments);
  if (!parsed.ok) throw new Error("the comments fixture does not parse");
  return parsed.value;
};

/** The task panel with this session's tasks, the Tasks view open; `script` answers first. */
async function panel($: Engine, on: On, script?: Script) {
  const w = world(on, {
    ...MINE,
    files: { [CONFIG]: SYNC_CONFIG },
    script: (key, argv, cwd) =>
      script?.(key, argv, cwd) ??
      (argv[0] === PROGRAM ? ok('{"published":true}\n') : undefined) ??
      MINE.script?.(key, argv, cwd),
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
  await ui.press({ key: "task:BU-mg2.3" });
  await w.clock.settle();
  return { w, ui };
}

type Mounted = Awaited<ReturnType<typeof panel>>["ui"];

const commentKeys = async (ui: Mounted) =>
  (await ui.findAll({ type: "Box" }))
    .map((element) => element.key ?? "")
    .filter((key) => key.startsWith("comment:"));

describe("an issue's comments (BU-mg2.3.15)", () => {
  test("should list every comment bd comments returned, newest last, with its author, time and body, when a task opens from the task panel", async ($, on) => {
    const { w, ui } = await panel($, on);

    const expected = fixture();
    expect(w.keys()).toContain("bd comments BU-mg2.3");
    expect((await ui.find({ key: "comments-heading" }))?.text).toBe(
      `Comments (${expected.length})`,
    );
    expect(await commentKeys(ui)).toEqual(expected.map((comment) => `comment:${comment.id}`));
    const newest = expected[expected.length - 1];
    if (newest === undefined) throw new Error("the comments fixture is empty");
    const drawn = await ui.find({ key: `comment:${newest.id}` });
    expect(drawn?.text).toContain(`${newest.author} 2026-10-24 21:49`);
    expect((await ui.find({ key: `comment-md:${newest.id}` }))?.props.text).toBe(newest.text);
  });

  test("should write a typed comment with bd comments add as the session's actor, show it after the re-read and publish it with sync.command", async ($, on) => {
    const posted = {
      id: "c-new",
      issue_id: "BU-mg2.3",
      author: ME,
      text: "Reviewed: ready to merge.\nTwo lines.",
      created_at: "2026-10-25T02:00:00Z",
    };
    let added = false;
    const { w, ui } = await panel($, on, (key) => {
      if (key.startsWith(ADD)) {
        added = true;
        return ok(JSON.stringify(posted));
      }
      if (key === "bd comments BU-mg2.3" && added) {
        return ok(JSON.stringify([...(JSON.parse(comments) as unknown[]), posted]));
      }
      return undefined;
    });
    const before = w.runs.length;

    await ui.input({ key: "comment-add", text: "Reviewed: ready to merge.\\nTwo lines." });
    await w.clock.settle();

    const runs = w.runs.slice(before);
    const write = runs.findIndex((argv) => argv[1] === "comments" && argv[2] === "add");
    expect(runs[write]).toEqual([
      "bd",
      "comments",
      "add",
      "BU-mg2.3",
      `--actor=${ME}`,
      "--json",
      "--",
      "Reviewed: ready to merge.\nTwo lines.",
    ]);
    expect(w.cwds[before + write]).toBe(CWD);
    expect(runs.slice(write + 1).map((argv) => argv.slice(0, 3).join(" "))).toContain(
      "bd comments BU-mg2.3",
    );
    expect((await ui.find({ key: "comment:c-new" }))?.text).toContain(`${ME} 2026-10-25 02:00`);
    expect((await ui.find({ key: "comment-add" }))?.props.value).toBe("");

    await w.clock.advance(10_000);
    await w.clock.settle();
    expect(w.runs.filter((argv) => argv[0] === PROGRAM)).toEqual([
      [PROGRAM, "--repo", CWD, "--json"],
    ]);
  });

  test("should keep the typed text and say why when bd comments add fails", async ($, on) => {
    const { w, ui } = await panel($, on, (key) =>
      key.startsWith(ADD) ? exit(1, "Error: database is locked\n") : undefined,
    );

    await ui.input({ key: "comment-add", text: "Do not lose this." });
    await w.clock.settle();

    expect((await ui.find({ key: "comment-error" }))?.text).toBe(
      "adding the comment failed (exit 1): Error: database is locked",
    );
    expect((await ui.find({ key: "comment-add" }))?.props.value).toBe("Do not lose this.");
    expect(await commentKeys(ui)).toHaveLength(fixture().length);
    await w.clock.advance(10_000);
    await w.clock.settle();
    expect(w.runs.some((argv) => argv[0] === PROGRAM)).toBe(false);
  });

  test("should refuse an empty comment and write nothing", async ($, on) => {
    const { w, ui } = await panel($, on);
    const before = w.runs.length;

    await ui.input({ key: "comment-add", text: "   " });
    await w.clock.settle();

    expect((await ui.find({ key: "comment-error" }))?.text).toBe("a comment cannot be empty");
    expect(w.runs.slice(before).some((argv) => argv[1] === "comments" && argv[2] === "add")).toBe(
      false,
    );
  });

  test("should name the failed comments read and still draw the issue when bd comments fails", async ($, on) => {
    const { ui } = await panel($, on, (key) =>
      key === "bd comments BU-mg2.3" ? exit(1, "Error: no such issue\n") : undefined,
    );

    expect((await ui.find({ key: "comments-error" }))?.text).toBe(
      "bd comments BU-mg2.3 failed (exit 1): Error: no such issue",
    );
    expect((await ui.find({ key: "comments-heading" }))?.text).toBe("Comments (0)");
    expect((await ui.find({ key: "edit:title" }))?.props.value).toBeDefined();
    expect(await ui.find({ key: "comment-add" })).toBeDefined();
  });
});
