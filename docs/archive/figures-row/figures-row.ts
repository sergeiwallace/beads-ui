// Archived 2026-10-27 from plugins/beads-ui/hooks/components/band.ts at 45d7da1 (see README.md).
// The imports it used there:
//   import type { RenderElement } from "claude-code";
//   import { type BandFigures, glyphOf, SPARK_GLYPHS, type Token } from "../../core/src/index.ts";
//   import type { RasterElement, Surface } from "./adapters.ts";

/** The figures row's key, and its Raster's: what `$.ui.blit` names to repaint it (T-2C.11). */
export const FIGURES_KEY = "beads-band:figures";
export const FIGURES_RASTER_KEY = "band-figures";

/**
 * The figures row under the summary (D-43, T-2C.11): one Raster row of `cells` where the band
 * draws Raster, else the same figures as Text, the sparkline in the done token and each bar's
 * glyph and share in its count's token.
 */
export function figuresRow(
  surface: Surface,
  figures: BandFigures,
  options: {
    color: (token: Token) => string;
    doneWindow: string;
    raster?: { Raster: RasterElement; cells: string };
  },
): RenderElement {
  const { Box, Text } = surface.ui;
  if (options.raster !== undefined) {
    return Box({
      key: FIGURES_KEY,
      children: [
        options.raster.Raster({
          key: FIGURES_RASTER_KEY,
          columns: figures.columns,
          rows: 1,
          cells: options.raster.cells,
        }),
      ],
    });
  }
  const separator = ` ${glyphOf("text.separator")} `;
  const spark = figures.levels.map((level) => glyphOf(SPARK_GLYPHS[level] ?? "spark.0")).join("");
  const pieces = [
    Text({
      color: options.color("status.done"),
      children: `${glyphOf("status.done")} ${spark}`,
    }),
    Text({ dimColor: true, children: ` ${options.doneWindow}` }),
    ...figures.bars.flatMap((bar) => [
      Text({ dimColor: true, children: separator }),
      Text({ color: options.color(bar.token), children: `${glyphOf(bar.glyph)} ${bar.percent}%` }),
    ]),
  ];
  return Box({
    key: FIGURES_KEY,
    flexDirection: "row",
    children: [
      Box({ flexShrink: 1, children: [Text({ wrap: "truncate-end", children: pieces })] }),
    ],
  });
}
