import type { Elements, RenderElement } from "claude-code";

import { bandView, storeName } from "../core/src/index.ts";
import type { BeadsPane } from "./pane.ts";
import { colorOf } from "./pane.ts";

export type BandUi = Pick<Elements["terminal"], "Box" | "Text">;

/**
 * The band above the prompt (T-1.6): open, in-progress and blocked counts for the session's
 * store, from the pane's last good read, which refreshes at most every 10 seconds. Nothing is
 * drawn until the store has been read once, so a session outside a Beads repository shows no
 * band.
 */
export function drawBand(ui: BandUi, pane: BeadsPane, width: number): RenderElement | undefined {
  const { board, host } = pane;
  if (!board.loaded || host === undefined) return undefined;
  const view = bandView(board.issues, {
    store: storeName(host.cwd),
    ...(board.loadedAt === undefined ? {} : { loadedAt: board.loadedAt }),
    width,
  });
  const { Box, Text } = ui;
  return Box({
    key: "beads-band",
    flexDirection: "row",
    gap: 2,
    children: [
      Text({ bold: true, children: view.title }),
      ...view.counts.map((count) =>
        Box({
          key: `band:${count.status}`,
          children: [
            Text({ color: colorOf(count.token), children: `${count.count} ${count.label}` }),
          ],
        }),
      ),
      ...(view.asOf === undefined ? [] : [Text({ dimColor: true, children: view.asOf })]),
    ],
  });
}
