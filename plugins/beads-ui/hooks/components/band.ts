import type { RenderElement, RenderNode } from "claude-code";

import {
  type BandLine,
  type BandPart,
  type BandRowsView,
  CONTROL_HOTKEYS,
  glyphOf,
  type SummaryPiece,
  type Token,
} from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";
import { gutter } from "./indicators.ts";

// The band's disclosure levels (D-36, T-2C.2) as components: the summary line with its counts as
// buttons, a count's rows with their controls, and the controls row every level ends with.

/** The columns a row under a line is indented by, under the line's label. */
export const ROW_INDENT = 2;

/** The overview's menu control (T-2C.8). */
export const BAND_MENU_KEY = "band:menu";

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

/**
 * A summary line (T-1B.10, D-36): its text in its tokens, and each count a button drawn after
 * its status glyph in the count's colour, since a Button draws no colour of its own (D-43).
 */
export function summaryLine(
  surface: Surface,
  line: BandLine,
  pieces: readonly SummaryPiece[],
  options: { color: (token: Token) => string; press: (part: BandPart) => void },
): RenderElement {
  const { Box, Text, Button } = surface.ui;
  const children = pieces.flatMap((piece): RenderNode[] => {
    const { segment } = piece;
    if (piece.kind === "text") {
      return [
        Text({
          wrap: "truncate-end",
          ...(segment.token === undefined ? {} : { color: options.color(segment.token) }),
          ...(segment.bold === true ? { bold: true } : {}),
          ...(segment.dim === true ? { dimColor: true } : {}),
          children: segment.text,
        }),
      ];
    }
    return present<RenderNode>([
      piece.glyph === undefined
        ? undefined
        : Text({
            ...(segment.token === undefined ? {} : { color: options.color(segment.token) }),
            children: piece.glyph,
          }),
      Button({
        key: `band-count:${line.key}:${segment.part}`,
        label: segment.text,
        ...(piece.hotkey === undefined ? {} : { hotkey: piece.hotkey }),
        plain: true,
        onPress: () => options.press(segment.part),
      }),
    ]);
  });
  return Box({ key: `beads-band:${line.key}`, flexDirection: "row", flexShrink: 1, children });
}

/** What the controls after a level's rows do. */
export interface LevelControls {
  more?: { label: string; press: () => void };
  collapse?: () => void;
  /** Leaves a task's detail for the view it was opened from. */
  back?: () => void;
  /** The overview's options menu (T-2C.8): every action the view offers, open or closed. */
  menu?: { open: boolean; press: () => void };
  summary: () => void;
  /** A note after the controls, such as how many rows the band's height leaves out above. */
  note?: string;
}

/** The controls row: "+M more", collapse and summary, each a button, then the note. */
export function controlsRow(surface: Surface, key: string, controls: LevelControls): RenderElement {
  const { Box, Text, Button } = surface.ui;
  return indented(surface, key, [
    Box({
      flexDirection: "row",
      columnGap: 1,
      children: present<RenderNode>([
        controls.more === undefined
          ? undefined
          : Button({
              key: "band:more",
              label: controls.more.label,
              hotkey: CONTROL_HOTKEYS.more,
              plain: true,
              onPress: controls.more.press,
            }),
        controls.collapse === undefined
          ? undefined
          : Button({
              key: "band:collapse",
              label: "collapse",
              hotkey: CONTROL_HOTKEYS.collapse,
              plain: true,
              onPress: controls.collapse,
            }),
        controls.back === undefined
          ? undefined
          : Button({
              key: "band:back",
              label: "back",
              plain: true,
              onPress: controls.back,
            }),
        controls.menu === undefined
          ? undefined
          : Button({
              key: BAND_MENU_KEY,
              label: controls.menu.open ? "close the menu" : `${glyphOf("row.menu")} menu`,
              plain: true,
              onPress: controls.menu.press,
            }),
        Button({
          key: "band:summary",
          label: "summary",
          hotkey: CONTROL_HOTKEYS.summary,
          plain: true,
          onPress: controls.summary,
        }),
        controls.note === undefined
          ? undefined
          : Text({ dimColor: true, wrap: "truncate-end", children: controls.note }),
      ]),
    }),
  ]);
}

/** `children` in a row after the indent rows under a line take. */
export function indented(surface: Surface, key: string, children: RenderNode[]): RenderElement {
  const { Box, Text } = surface.ui;
  return Box({
    key,
    flexDirection: "row",
    children: [Text({ children: " ".repeat(ROW_INDENT) }), ...children],
  });
}

/**
 * A count's rows under its line (D-36): one button a task, which opens its detail in the
 * overview, after its indicator gutter (D-41), a store's row as text, and the controls row
 * under them.
 */
export function countRows(
  surface: Surface,
  view: BandRowsView,
  options: {
    color: (token: Token) => string;
    open: (id: string) => void;
    /** A line in place of the rows: the read under way, or why it failed. */
    status?: string;
    controls: LevelControls;
  },
): RenderElement {
  const { Box, Text, Button } = surface.ui;
  const rows = view.rows.map((row) =>
    indented(surface, row.key, [
      ...present<RenderNode>([gutter(surface.ui, row.gutter ?? [], true)]),
      row.id === undefined
        ? Text({ wrap: "truncate-end", color: options.color(row.token), children: row.label })
        : Button({
            key: `band-open:${row.id}`,
            label: row.label,
            plain: true,
            onPress: () => options.open(row.id ?? ""),
          }),
    ]),
  );
  return Box({
    key: "beads-band:rows",
    flexDirection: "column",
    children: present<RenderNode>([
      options.status === undefined
        ? undefined
        : indented(surface, "band-rows:status", [
            Text({ dimColor: true, wrap: "truncate-end", children: options.status }),
          ]),
      ...rows,
      controlsRow(surface, "band-rows:controls", options.controls),
    ]),
  });
}

/** The label of "+M more": how many rows are still collapsed. */
export const moreLabel = (more: number): string => `+${more} more`;

/** The line drawn above a window whose first rows the band's height leaves out. */
export const aboveNote = (above: number): string => `${glyphOf("list.above")} ${above} above`;
