import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { isTableGlyph } from "../core/src/index.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import { MINE } from "./tests/mine.ts";
import { BAND_PROPS, PANE_PROPS, SESSION, SHOW, VIEWPORT, world } from "./tests/world.ts";

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

async function started($: Engine, on: On, files: Record<string, string> = {}) {
  const w = world(on, { ...MINE, files });
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  return w;
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

describe("the glyphs drawn (D-43, T-2C.10)", () => {
  for (const surface of ["terminal", "vscode"] as const) {
    test(`should draw only glyphs of the table on every ${surface} pane view and the band`, async ($, on) => {
      await started($, on);
      const drawings = [
        ["band", await (await band($)).drawn()] as [string, unknown],
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
        ["band", await (await band($)).drawn()] as [string, unknown],
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
