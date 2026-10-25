import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { isTableGlyph, PRESS_CLOSE, PRESS_OPEN } from "../core/src/index.ts";
import { colorOf, pressKey } from "./components/look.ts";
import { CONFIRM_ID, PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { ME, MINE } from "./tests/mine.ts";
import {
  BAND_PROPS,
  CWD,
  countScript,
  PANE_PROPS,
  SESSION,
  SHOW,
  VIEWPORT,
  world,
} from "./tests/world.ts";

// D-43: the look of every drawing, walked over the drawn tree as Claude Code mounts it, on the
// band and on the pane in the terminal and in VS Code, each view and each overlay in turn.
// T-2C.10: every glyph drawn comes from the glyph table, in the form [indicators] ascii names.

const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";
const ASCII = { [USER_CONFIG]: "[indicators]\nascii = true\n" };

type PaneSurface = "terminal" | "vscode";

interface Drawn {
  type?: string;
  props?: Record<string, unknown>;
  children?: unknown[];
  hover?: Record<string, unknown>;
}

const asDrawn = (value: unknown): Drawn | undefined =>
  typeof value === "object" && value !== null ? (value as Drawn) : undefined;

/** Every string a drawn tree shows: Text children, Button labels and Select options. */
export function stringsOf(tree: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    const node = asDrawn(value);
    if (node === undefined) return;
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (node.type === "Button" && typeof node.props?.label === "string") out.push(node.props.label);
    if (node.type === "Select" && Array.isArray(node.props?.options)) {
      for (const option of node.props.options as { value: string; label?: string }[]) {
        out.push(option.label ?? option.value);
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return out;
}

/** The characters outside ASCII a drawing shows, each once. */
const glyphsIn = (tree: unknown): string[] => [
  ...new Set(stringsOf(tree).flatMap((text) => [...text].filter((char) => char > "\x7f"))),
];

const band = ($: Engine) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: BAND_PROPS,
    viewport: VIEWPORT,
  });

const paneOn = ($: Engine, surface: PaneSurface) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface,
    component: "Pane",
    props: PANE_PROPS,
    requestId: PANE_ID,
    viewport: VIEWPORT,
  });

type Mounted = Awaited<ReturnType<typeof paneOn>>;

/** The session's own counts, so the band draws its line and its toggle. */
const COUNTS = countScript({
  [CWD]: [
    { status: "in_progress", assignee: ME },
    { status: "blocked", assignee: ME },
    { status: "open", assignee: ME },
  ],
});

async function started($: Engine, on: On, files: Record<string, string> = {}) {
  const w = world(on, {
    ...MINE,
    files,
    script: (key, argv, cwd) => MINE.script?.(key, argv, cwd) ?? COUNTS(key, argv, cwd),
  });
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  return w;
}

/**
 * The band at each of its levels (D-36): the summary, a count's rows, the overview and a task's
 * detail in it, each as Claude Code mounts it.
 */
async function eachBandLevel($: Engine): Promise<[string, unknown][]> {
  const drawings: [string, unknown][] = [["band", await (await band($)).drawn()]];
  for (const [name, key] of [
    ["band rows", "band-count:own:in_progress"],
    ["band overview", "band:overview"],
  ] as const) {
    await (await band($)).press({ key });
    drawings.push([name, await (await band($)).drawn()]);
  }
  const row = (await (await band($)).findAll({}))
    .map((element) => element.key ?? "")
    .find((key) => key.startsWith("task:"));
  await (await band($)).press({ key: row ?? "task:missing" });
  drawings.push(["band detail", await (await band($)).drawn()]);
  await (await band($)).press({ key: "band:summary" });
  return drawings;
}

const keysIn = async (ui: Mounted) =>
  (await ui.findAll({})).map((element) => element.key ?? "").filter((key) => key !== "");

/**
 * Each drawing the pane makes, by name: every view of its nav, a task's Detail, the help, the
 * band settings and the options menu, in the order a person reaches them.
 */
export async function eachPaneDrawing(ui: Mounted): Promise<[string, unknown][]> {
  const drawings: [string, unknown][] = [];
  const keep = async (name: string) => drawings.push([name, await ui.drawn()]);
  for (const view of ["tasks", "board", "backlog", "timeline", "settings", "sprint"]) {
    await ui.press({ key: `tab:${view}` });
    await keep(view);
  }
  await ui.press({ key: "tab:backlog" });
  const row = (await keysIn(ui)).find((key) => key.startsWith("open:"));
  await ui.press({ key: row ?? "open:missing" });
  await keep("detail");
  await ui.press({ key: "tab:board" });
  for (const overlay of ["help", "band-settings", "menu"]) {
    await ui.press({ key: overlay });
    await keep(overlay);
    await ui.press({ key: overlay });
  }
  return drawings;
}

/**
 * Every pressable element of a drawn tree drawn without the clickable affordance, named by its
 * key and what it lacks: a `Button` is the only element the engine lets carry an onPress (the
 * mod's tree validator refuses `onPress` on a Box or a Text), and the affordance is its keyed
 * frame holding the `[` and `]` brackets in the control token around it, the button plain, and
 * on a surface with hover a hover style.
 */
export function withoutAffordance(tree: unknown, hover: boolean): string[] {
  const found: string[] = [];
  const control = colorOf("control");
  const isBracket = (node: unknown, text: string) => {
    const drawn = asDrawn(node);
    return (
      drawn?.type === "Text" &&
      drawn.props?.color === control &&
      JSON.stringify(drawn.children) === JSON.stringify([text])
    );
  };
  const walk = (value: unknown, parent: Drawn | undefined) => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, parent);
      return;
    }
    const node = asDrawn(value);
    if (node === undefined) return;
    if (node.type === "Button") {
      const key = String(node.props?.key ?? node.props?.label);
      const siblings = parent?.children ?? [];
      const at = siblings.indexOf(value);
      const lacks = [
        parent?.type === "Box" && parent.props?.key === pressKey(key) ? "" : "its frame",
        isBracket(siblings[at - 1], PRESS_OPEN) && isBracket(siblings[at + 1], PRESS_CLOSE)
          ? ""
          : "its brackets",
        node.props?.plain === true ? "" : "plain",
        !hover || node.hover?.inverse === true ? "" : "its hover style",
      ].filter((one) => one !== "");
      if (lacks.length > 0) found.push(`${key}: no ${lacks.join(", ")}`);
    }
    for (const child of node.children ?? []) walk(child, node);
  };
  walk(tree, undefined);
  return found;
}

const buttonsIn = (tree: unknown): number =>
  (JSON.stringify(tree).match(/"type":"Button"/g) ?? []).length;

describe("the clickable affordance (D-43, T-2C.14)", () => {
  for (const surface of ["terminal", "vscode"] as const) {
    test(`should draw every pressable element of every ${surface} pane view and overlay, and the band, in the affordance`, async ($, on) => {
      await started($, on);
      const drawings = [
        ...(await eachBandLevel($)),
        ...(await eachPaneDrawing(await paneOn($, surface))),
      ];

      const bare = drawings.flatMap(([name, tree]) =>
        withoutAffordance(tree, surface === "terminal").map((one) => `${name}: ${one}`),
      );
      expect(bare).toEqual([]);
      for (const [name, tree] of drawings) expect(buttonsIn(tree), name).toBeGreaterThan(0);
    });
  }

  test("should draw the delete confirmation's buttons in the affordance", async ($, on) => {
    const w = world(on);
    await $.session.start(SESSION);
    await $.command.run(SHOW);
    await w.clock.settle();
    const board = await paneOn($, "terminal");
    await board.press({ key: "tab:board" });
    await $.ui.focus({
      component: "Pane",
      requestId: PANE_ID,
      plugin: PLUGIN_NAME,
      element: "move:BU-2zw",
      origin: { kind: "person" },
    } as never);
    await board.press({ key: "delete" });
    await w.clock.settle();
    const confirm = await $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: CONFIRM_ID,
      viewport: VIEWPORT,
    });
    const drawn = await confirm.drawn();

    expect(buttonsIn(drawn)).toBeGreaterThan(0);
    expect(withoutAffordance(drawn, true)).toEqual([]);
  });

  test("should find a button drawn without its frame, its brackets or its hover style", () => {
    const button = { type: "Button", props: { key: "b", label: "go", plain: true } };
    const bracket = (text: string) => ({
      type: "Text",
      props: { color: colorOf("control") },
      children: [text],
    });

    expect(withoutAffordance({ type: "Box", props: {}, children: [button] }, true)).toEqual([
      "b: no its frame, its brackets, its hover style",
    ]);
    const framed = {
      type: "Box",
      props: { key: pressKey("b") },
      children: [
        bracket(PRESS_OPEN),
        { ...button, hover: { inverse: true } },
        bracket(PRESS_CLOSE),
      ],
    };
    expect(withoutAffordance(framed, true)).toEqual([]);
  });
});

describe("the glyphs drawn (D-43, T-2C.10)", () => {
  for (const surface of ["terminal", "vscode"] as const) {
    test(`should draw only glyphs of the table on every ${surface} pane view and the band`, async ($, on) => {
      await started($, on);
      const drawings = [
        ...(await eachBandLevel($)),
        ...(await eachPaneDrawing(await paneOn($, surface))),
      ];

      const outside = drawings.flatMap(([name, tree]) =>
        glyphsIn(tree)
          .filter((char) => !isTableGlyph(char))
          .map((char) => `${name}: ${char}`),
      );
      expect(outside).toEqual([]);
      expect(drawings.some(([, tree]) => glyphsIn(tree).length > 0)).toBe(true);
    });

    test(`should draw every table glyph in its ASCII form on every ${surface} pane view and the band under [indicators] ascii`, async ($, on) => {
      await started($, on, ASCII);
      const drawings = [
        ...(await eachBandLevel($)),
        ...(await eachPaneDrawing(await paneOn($, surface))),
      ];

      const glyphs = drawings.flatMap(([name, tree]) =>
        glyphsIn(tree)
          .filter(isTableGlyph)
          .map((char) => `${name}: ${char}`),
      );
      expect(glyphs).toEqual([]);
    });
  }
});
