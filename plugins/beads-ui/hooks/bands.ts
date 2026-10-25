import type { Elements, RenderElement } from "claude-code";

import { glyphOf } from "../core/src/index.ts";
import { colorOf, styledUi } from "./components/look.ts";
import type { BandTally } from "./tally.ts";

export type BandUi = Pick<Elements["terminal"], "Box" | "Text" | "Button">;

/**
 * The band's pane toggle (D-27, D-43, T-2C.14): an icon, the glyph table's `pane.open`, that
 * opens the pane, or moves the focus into it when it is open; beside it while the pane is open,
 * `pane.close`, which closes it.
 */
export const BEADS_BUTTON_KEY = "beads-band:open";
export const PANE_CLOSE_KEY = "beads-band:close";

/** What the band's toggle knows of the pane and does to it. */
export interface PaneToggle {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * The band above the prompt (T-1B.10): `[bd] {T} tasks ({P} in progress, {B} blocked, {O} open,
 * {D} done last {W})` over the issues the session owns, and for a firstmate session the
 * `[bd][all]` totals over every owner above its own `[fm]` line, from the tally's last read. The
 * pane toggle follows the first line's text, at the left (D-36), never at the line's right end.
 * Nothing is drawn until some store has answered, so a session with no store shows no band.
 */
export function drawBand(
  ui: BandUi,
  tally: BandTally,
  toggle: PaneToggle,
): RenderElement | undefined {
  const lines = tally.lines;
  if (lines.length === 0) return undefined;
  const { Box, Text, Button } = styledUi(ui);
  const controls = [
    Button({ key: BEADS_BUTTON_KEY, label: glyphOf("pane.open"), onPress: toggle.onOpen }),
    ...(toggle.open
      ? [Button({ key: PANE_CLOSE_KEY, label: glyphOf("pane.close"), onPress: toggle.onClose })]
      : []),
  ];
  return Box({
    key: "beads-band",
    flexDirection: "column",
    // One line each, cut at the band's edge: the counts never wrap under the label.
    children: lines.map((line, i) => {
      const text = Box({
        key: `beads-band:${line.key}`,
        flexShrink: 1,
        children: [
          Text({
            wrap: "truncate-end",
            children: line.segments.map((segment) =>
              segment.token === undefined && segment.bold !== true && segment.dim !== true
                ? segment.text
                : Text({
                    ...(segment.token === undefined ? {} : { color: colorOf(segment.token) }),
                    ...(segment.bold === true ? { bold: true } : {}),
                    ...(segment.dim === true ? { dimColor: true } : {}),
                    children: segment.text,
                  }),
            ),
          }),
        ],
      });
      if (i > 0) return text;
      return Box({
        key: "beads-band:first",
        flexDirection: "row",
        columnGap: 1,
        children: [text, ...controls],
      });
    }),
  });
}
