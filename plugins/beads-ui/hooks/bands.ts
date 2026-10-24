import type { Elements, RenderElement } from "claude-code";

import { colorOf } from "./pane.ts";
import type { BandTally } from "./tally.ts";

export type BandUi = Pick<Elements["terminal"], "Box" | "Text">;

/**
 * The band above the prompt (T-1B.10): `[bd] {T} tasks ({P} in progress, {B} blocked, {O} open,
 * {D} done last {W})` over the issues the session owns, and for a firstmate session the
 * `[bd][all]` totals over every owner above its own `[fm]` line, from the tally's last read.
 * Nothing is drawn until some store has answered, so a session with no store shows no band.
 */
export function drawBand(ui: BandUi, tally: BandTally): RenderElement | undefined {
  const lines = tally.lines;
  if (lines.length === 0) return undefined;
  const { Box, Text } = ui;
  return Box({
    key: "beads-band",
    flexDirection: "column",
    // One line each, cut at the band's edge: the counts never wrap under the label.
    children: lines.map((line) =>
      Box({
        key: `beads-band:${line.key}`,
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
      }),
    ),
  });
}
