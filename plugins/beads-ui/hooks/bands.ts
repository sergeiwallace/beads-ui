import type { Elements, RenderElement } from "claude-code";

import { bandRow } from "../core/src/index.ts";
import { colorOf } from "./pane.ts";
import type { BandTally } from "./tally.ts";

export type BandUi = Pick<Elements["terminal"], "Box" | "Text">;

/**
 * The band above the prompt (T-1.6, T-1.8): open, in-progress and blocked counts of the issues
 * the session owns, and for a firstmate session the host pair's totals above them, from the
 * tally's last read. Nothing is drawn until some store has answered, so a session with no store
 * to read shows no band.
 */
export function drawBand(ui: BandUi, tally: BandTally, width: number): RenderElement | undefined {
  const last = tally.last;
  if (last === undefined || !last.answers.flat().some((answer) => answer.ok)) return undefined;
  const { Box, Text } = ui;
  const rows = last.reads.map((read, i) =>
    bandRow(read, last.answers[i] ?? [], { loadedAt: last.loadedAt, width }),
  );
  return Box({
    key: "beads-band",
    flexDirection: "column",
    // One line a row, cut at the band's edge: the counts never wrap under the label.
    children: rows.map((row) =>
      Box({
        key: `beads-band:${row.key}`,
        children: [
          Text({
            wrap: "truncate-end",
            children: [
              Text({ bold: true, children: row.title }),
              ...(row.counts ?? []).flatMap((count) => [
                "  ",
                Text({ color: colorOf(count.token), children: `${count.count} ${count.label}` }),
              ]),
              ...(row.note === undefined
                ? []
                : ["  ", Text({ color: colorOf("warning"), children: row.note })]),
              ...(row.asOf === undefined
                ? []
                : ["  ", Text({ dimColor: true, children: row.asOf })]),
            ],
          }),
        ],
      }),
    ),
  });
}
