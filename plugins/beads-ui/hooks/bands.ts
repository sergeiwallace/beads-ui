import type { RenderElement } from "claude-code";

import type { SurfaceUi } from "./components/adapters.ts";
import type { BandLevels, BandRaster } from "./levels.ts";

export { BEADS_BUTTON_KEY, EXPAND_KEY, OVERVIEW_KEY, PANE_CLOSE_KEY } from "./levels.ts";

/** The elements the band draws with: every one the `AbovePrompt` site resolves (D-35). */
export type BandUi = SurfaceUi;

/** What the band's toggle knows of the pane and does to it (D-27, D-43, T-2C.14). */
export interface PaneToggle {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * The band above the prompt (T-1B.10, D-36): `[bd] {T} tasks ({P} in progress, {B} blocked, {O}
 * open, {D} done last {W})` over the issues the session owns, and for a firstmate session the
 * `[bd][all]` totals over every owner above its own `[fm]` line, every count a button; the
 * expand, overview and pane controls right after the first line's text, at the left, never at
 * the line's right end; under the lines, the level the session chose (summary, a count's rows,
 * or the overview), within `size.columns` and `size.maxRows`. Nothing is drawn until some store
 * has answered, so a session with no store shows no band.
 */
export function drawBand(
  ui: BandUi,
  levels: BandLevels,
  size: { columns: number; maxRows?: number },
  toggle: PaneToggle,
  raster?: BandRaster,
): RenderElement | undefined {
  return levels.draw(ui, size, toggle, raster);
}
