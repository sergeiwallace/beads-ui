import type { Elements, RenderElement } from "claude-code";

import { colorOf, styledUi } from "./components/look.ts";
import type { BandTally } from "./tally.ts";

export type BandUi = Pick<Elements["terminal"], "Box" | "Text" | "Button">;

/** The band's beads button (D-27): it opens the pane, or moves the focus into it. */
export const BEADS_BUTTON_KEY = "beads-band:open";
export const BEADS_BUTTON_LABEL = "beads";

/**
 * The band above the prompt (T-1B.10): `[bd] {T} tasks ({P} in progress, {B} blocked, {O} open,
 * {D} done last {W})` over the issues the session owns, and for a firstmate session the
 * `[bd][all]` totals over every owner above its own `[fm]` line, from the tally's last read. The
 * first line ends with the beads button, which `onBeads` handles (T-1B.6). Nothing is drawn until
 * some store has answered, so a session with no store shows no band.
 */
export function drawBand(
  ui: BandUi,
  tally: BandTally,
  onBeads: () => void,
): RenderElement | undefined {
  const lines = tally.lines;
  if (lines.length === 0) return undefined;
  const { Box, Text, Button } = styledUi(ui);
  return Box({
    key: "beads-band",
    flexDirection: "column",
    // One line each, cut at the band's edge: the counts never wrap under the label.
    children: lines.map((line, i) => {
      const text = Box({
        key: `beads-band:${line.key}`,
        flexGrow: 1,
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
        children: [
          text,
          Button({
            key: BEADS_BUTTON_KEY,
            label: BEADS_BUTTON_LABEL,
            plain: true,
            onPress: onBeads,
          }),
        ],
      });
    }),
  });
}
