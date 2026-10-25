import type { RenderElement, RenderNode } from "claude-code";

import { SPACE, type Token } from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";
import { colorOf, weight } from "./look.ts";

// The pane's frames and states (D-43, T-2C.12): a framed section a view, the header bar, and the
// empty and error state every view draws. On a short surface (the band always, and the pane
// inline or under SHORT_ROWS) a frame's three rows are rows the view lacks, so each draws its
// compact form there: the same text in the same colour, unframed.

type Framing = Pick<Surface, "ui" | "short">;

/**
 * A view's framed section: a rounded border in `accent` (the card colour when not given), `tight`
 * padding, the title on the weight scale's title, then the view. SECTION_COLUMNS and SECTION_ROWS
 * are what it takes from the view. `framed: false` draws the title over the view with no border,
 * for a view whose own parts are framed (the Board's cards), so no frame sits inside another.
 */
export function section(
  surface: Framing,
  props: {
    key: string;
    title: string;
    accent?: Token;
    framed?: boolean;
    children: readonly RenderNode[];
  },
): RenderElement {
  const { Box, Text } = surface.ui;
  if (surface.short) {
    return Box({ key: props.key, flexDirection: "column", children: [...props.children] });
  }
  const title = Box({
    key: `${props.key}:title`,
    children: [Text({ ...weight("title"), wrap: "truncate-end", children: props.title })],
  });
  if (props.framed === false) {
    return Box({ key: props.key, flexDirection: "column", children: [title, ...props.children] });
  }
  return Box({
    key: props.key,
    flexDirection: "column",
    borderStyle: "round",
    borderColor: colorOf(props.accent ?? "surface.card"),
    paddingX: SPACE.tight,
    children: [title, ...props.children],
  });
}

/** The header bar: its parts in a row on the header's fill, `tight` padding each end. */
export function headerBar(ui: Surface["ui"], children: readonly RenderNode[]): RenderElement {
  return ui.Box({
    key: "header",
    flexDirection: "row",
    backgroundColor: colorOf("surface.header"),
    paddingX: SPACE.tight,
    children: [...children],
  });
}

/**
 * A state a view draws in place of its rows: `empty` (nothing to show, and what to do about it)
 * in the meta weight, or `error` (a read or a write failed) in the error colour, each framed in
 * its own colour so it reads as the view's whole content and not one more row.
 */
export function stateBox(
  surface: Framing,
  props: { key: string; kind: "empty" | "error" | "warning"; lines: readonly string[] },
): RenderElement {
  const { Box, Text } = surface.ui;
  const token: Token =
    props.kind === "error" ? "error" : props.kind === "warning" ? "warning" : "text.dim";
  const text = (line: string) =>
    props.kind === "empty"
      ? Text({ ...weight("meta"), children: line })
      : Text({ color: colorOf(token), children: line });
  if (surface.short) {
    return Box({ key: props.key, flexDirection: "column", children: props.lines.map(text) });
  }
  return Box({
    key: props.key,
    flexDirection: "column",
    borderStyle: "round",
    borderColor: colorOf(token),
    paddingX: SPACE.tight,
    children: props.lines.map(text),
  });
}

/** What a view draws while its read is under way: one line on the meta weight. */
export function readingState(surface: Framing, key: string, text: string): RenderElement {
  const { Box, Text } = surface.ui;
  return Box({ key, children: [Text({ ...weight("meta"), children: text })] });
}

/** The empty state: nothing to show, and what to do about it. */
export const emptyState = (surface: Framing, key: string, ...lines: string[]): RenderElement =>
  stateBox(surface, { key, kind: "empty", lines });

/** The error state: what failed, and what beads-ui does next. */
export const errorState = (surface: Framing, key: string, ...lines: string[]): RenderElement =>
  stateBox(surface, { key, kind: "error", lines });
