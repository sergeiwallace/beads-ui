import type { RenderElement, RenderNode } from "claude-code";

import { glyphOf, type Token, truncate } from "../../core/src/index.js";
import type { Surface } from "./adapters.js";
import { colorOf, weight } from "./look.js";

/** True where the surface draws each view as one-row lines in a window it scrolls itself. */
export const windowed = (surface: Surface): boolean => surface.scroll !== undefined;

/** One line of text, cut to the surface's columns so it takes one row. */
export function textLine(
  surface: Surface,
  key: string,
  text: string,
  style: { token?: Token; role?: "title" | "heading" | "meta" } = {},
): RenderElement {
  const { Box, Text } = surface.ui;
  return Box({
    key,
    children: [
      Text({
        ...(style.role === undefined ? {} : weight(style.role)),
        ...(style.token === undefined ? {} : { color: colorOf(style.token) }),
        wrap: "truncate-end",
        children: truncate(text, surface.columns),
      }),
    ],
  });
}

/**
 * `control` in the columns a line leaves it after `used` columns: an Input's value, which the
 * band cannot cut, takes no more than its line on a windowed surface. Elsewhere `control`.
 */
export function fitted(surface: Surface, used: number, control: RenderElement): RenderElement {
  if (!windowed(surface)) return control;
  return surface.ui.Box({ width: Math.max(1, surface.columns - used), children: [control] });
}

/** `text` as lines, each cut to the surface's columns: a Markdown block's band form. */
export const textLines = (surface: Surface, key: string, text: string): RenderElement[] =>
  text.split("\n").map((line, i) => textLine(surface, `${key}:${i}`, line === "" ? " " : line));

/**
 * `lines` in the rows the surface has: all of them where they fit, else a window from the
 * surface's scroll start with `key:above` and `key:below` buttons that move it a window at a
 * time. Two rows of the window are the buttons, so the window never passes `surface.rows`.
 */
export function lineWindow(
  surface: Surface,
  key: string,
  lines: readonly RenderNode[],
): RenderElement {
  const { Box, Button } = surface.ui;
  const rows = surface.rows;
  if (rows === undefined || lines.length <= rows) {
    return Box({ key, flexDirection: "column", children: [...lines] });
  }
  const room = Math.max(1, rows - 2);
  const first = surface.scroll?.start ?? 0;
  const start = Math.min(Math.max(0, first), lines.length - room);
  const above = start;
  const below = lines.length - start - room;
  const edge = (side: "above" | "below", count: number) =>
    Button({
      key: `${key}:${side}`,
      label: `${glyphOf(side === "above" ? "list.above" : "list.below")} ${count} ${side}`,
      plain: true,
      onPress: () =>
        surface.scroll?.to(Math.max(0, side === "above" ? start - room : start + room)),
    });
  return Box({
    key,
    flexDirection: "column",
    children: [
      ...(above > 0 ? [edge("above", above)] : []),
      ...lines.slice(start, start + room),
      ...(below > 0 ? [edge("below", below)] : []),
    ],
  });
}
