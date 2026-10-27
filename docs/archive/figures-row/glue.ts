// Archived 2026-10-27 from plugins/beads-ui/core, hooks and validate-allowlist.json at 45d7da1 (see README.md).

// core/src/index.ts
export type { BandFigures, FigureBar } from "./views/figures.ts";
export {
  bandFigures,
  FIGURE_PARTS,
  figureCells,
  MAX_BAR_COLUMNS,
  SPARK_CELLS,
  SPARK_GLYPHS,
  sparkBuckets,
  sparkLevel,
} from "./views/figures.ts";

// core/src/glyphs.ts, in the glyph table
  "spark.0": entry("⡀", ".", "text", "a sparkline part with nothing done in it"),
  "spark.1": entry("⣀", "_", "text", "a sparkline part, up to a quarter of the busiest"),
  "spark.2": entry("⣤", "-", "text", "a sparkline part, up to half of the busiest"),
  "spark.3": entry("⣶", "=", "text", "a sparkline part, up to three quarters of the busiest"),
  "spark.4": entry("⣿", "#", "text", "the busiest sparkline part"),

// hooks/components/look.ts (imports rasterColorFor from core)
/** The 24-bit colour a Raster cell draws for `token`: its `[theme]` hex value, else core's. */
export const rasterColorOf = (token: Token): number => rasterColorFor(token, theme);

/** True under `[indicators] ascii`: a Raster's glyph cells draw their ASCII forms too. */
export const isAscii = (): boolean => ascii;

// hooks/host.ts, in the Host interface
  /**
   * `$.ui.blit`: repaints the Raster keyed `key` that the site `requestId` drew, in place, with
   * `cells`. Resolves false when the engine refused it.
   */
  blit: (requestId: string, key: string, cells: string) => Promise<boolean>;

// hooks/register.ts, in the host the session start builds
      blit: (requestId, key, cells) =>
        $.ui
          .blit({ requestId, key, cells })
          .then((answer: unknown) => (answer as { deny?: unknown } | undefined)?.deny === undefined)
          .catch(() => false),

// hooks/register.ts, the band's ui.render: Raster resolved, and passed to drawBand last
  // The band draws on the two surfaces Claude Code 2.1.310 draws the site on, the terminal and
  // the desktop. Only the terminal draws a Raster (the desktop resolves one that draws nothing),
  // so the desktop draws the summary's figures as Text (T-2C.11).
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if ((e.surface !== "terminal" && e.surface !== "desktop") || e.props.hasSurvey) {
      return next(e);
    }
    const { Box, Text, Button, Input, Select, Markdown, Raster } = await $.ui.resolve(e);
    const band = drawBand(
      { Box, Text, Button, Input, Select, Markdown },
      levels,
      { columns: e.props.bodyColumns, maxRows: e.props.maxRows },
      {
        open: pane.isOpen,
        onOpen: () => void pane.openOrFocus(),
        onClose: () => void pane.close(),
      },
      e.surface === "terminal" ? { Raster, requestId: e.requestId } : undefined,
    );

// hooks/bands.ts
export function drawBand(
  ui: BandUi,
  levels: BandLevels,
  size: { columns: number; maxRows?: number },
  toggle: PaneToggle,
  raster?: BandRaster,
): RenderElement | undefined {
  return levels.draw(ui, size, toggle, raster);
}

// validate-allowlist.json, in "./register.ts" calls: "$.ui.blit"
