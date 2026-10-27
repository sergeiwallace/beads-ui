// Archived 2026-10-27 from plugins/beads-ui/core/src/views/figures.ts at 45d7da1 (see README.md).

// The band's figures row (D-43, T-2C.11): under the summary line, a sparkline of the tasks done
// in the done window and one bar per status count the line draws. The terminal draws it as one
// Raster row; a surface without Raster draws the same figures as Text. Pure: built from the
// line's counts and the done tasks' close times.

import { type GlyphId, glyphOf } from "../glyphs.ts";
import type { Token } from "../tokens.ts";
import type { BandCounts, BandPart } from "./band.ts";
import {
  RASTER_DEFAULT_COLOR,
  RASTER_TRACK_COLOR,
  type RasterCell,
  rasterCells,
} from "./raster.ts";
import { truncate } from "./text.ts";
import { barRun } from "./timeline.ts";

/** How many parts the done window is cut into, one sparkline cell each. */
export const SPARK_CELLS = 12;

/** The sparkline's heights, none to full, from the glyph table. */
export const SPARK_GLYPHS: readonly GlyphId[] = [
  "spark.0",
  "spark.1",
  "spark.2",
  "spark.3",
  "spark.4",
];

/** The status counts a bar is drawn for, in the line's own tokens (core's bandLine). */
export const FIGURE_PARTS: readonly { part: keyof BandCounts; token: Token; glyph: GlyphId }[] = [
  { part: "in_progress", token: "status.wip", glyph: "status.in_progress" },
  { part: "blocked", token: "warning", glyph: "status.blocked" },
  { part: "open", token: "status.active", glyph: "status.open" },
  { part: "done", token: "status.done", glyph: "status.done" },
];

/** The widest a figure bar is drawn, in cells. */
export const MAX_BAR_COLUMNS = 16;

/**
 * How many of `closedAt` (milliseconds) fall in each of `cells` equal parts of the window that
 * ends at `nowMs`, oldest first. A close after `nowMs` (a clock a little ahead) counts in the
 * newest part; one before the window counts nowhere.
 */
export function sparkBuckets(
  closedAt: readonly number[],
  nowMs: number,
  windowMs: number,
  cells = SPARK_CELLS,
): number[] {
  const buckets = Array.from({ length: cells }, () => 0);
  if (windowMs <= 0 || cells <= 0) return buckets;
  const start = nowMs - windowMs;
  for (const at of closedAt) {
    if (!Number.isFinite(at) || at <= start) continue;
    const i = Math.min(cells - 1, Math.floor(((at - start) / windowMs) * cells));
    buckets[i] = (buckets[i] ?? 0) + 1;
  }
  return buckets;
}

/** A part's height, 0 (none) to 4 (the busiest part), in quarters of the busiest. */
export const sparkLevel = (count: number, max: number): number =>
  count <= 0 || max <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((count / max) * 4)));

export interface FigureBar {
  part: keyof BandCounts;
  token: Token;
  glyph: GlyphId;
  count: number;
  /** Rounded percent of the counts' sum. */
  percent: number;
  /** Of `columns`, the cells filled. */
  filled: number;
  columns: number;
}

export interface BandFigures {
  /** The sparkline's heights, oldest part first, 0 to 4 each. */
  levels: number[];
  bars: FigureBar[];
  /** The Raster row's width in cells, within the band's columns. */
  columns: number;
  /** The same figures as one line of text, for a surface with no Raster. */
  text: string;
}

/** Cells the sparkline takes: the done glyph, its parts, and a space. */
const SPARK_SPAN = SPARK_CELLS + 2;
/** Cells a bar takes besides its own: its glyph before it and a space after it. */
const BAR_CHROME = 2;

/**
 * The figures of a line's `counts` in `columns`: the sparkline of `buckets`, and a bar for each
 * status count `parts` draws, in its order, each filled by the count's share of their sum.
 * Undefined when the columns cannot hold the sparkline and a one-cell bar for each count.
 */
export function bandFigures(
  counts: BandCounts,
  parts: readonly BandPart[],
  buckets: readonly number[],
  options: { columns: number; doneWindow: string },
): BandFigures | undefined {
  const drawn = FIGURE_PARTS.filter(({ part }) => parts.includes(part)).sort(
    (a, b) => parts.indexOf(a.part) - parts.indexOf(b.part),
  );
  const room = Math.min(512, Math.floor(options.columns)) - SPARK_SPAN;
  const each = drawn.length === 0 ? 0 : Math.floor(room / drawn.length) - BAR_CHROME;
  if (room < 0 || (drawn.length > 0 && each < 1)) return undefined;
  const barColumns = Math.min(MAX_BAR_COLUMNS, each);
  const sum = drawn.reduce((total, { part }) => total + counts[part], 0);
  const max = Math.max(0, ...buckets);
  const levels = buckets.map((count) => sparkLevel(count, max));
  const bars = drawn.map(({ part, token, glyph }) => {
    const count = counts[part];
    const share = sum === 0 ? 0 : count / sum;
    return {
      part,
      token,
      glyph,
      count,
      percent: Math.round(share * 100),
      filled: count === 0 ? 0 : Math.max(1, Math.round(share * barColumns)),
      columns: barColumns,
    };
  });
  const spark = levels.map((level) => glyphOf(SPARK_GLYPHS[level] ?? "spark.0")).join("");
  const text = [
    `${glyphOf("status.done")} ${spark} ${options.doneWindow}`,
    ...bars.map((bar) => `${glyphOf(bar.glyph)} ${bar.percent}%`),
  ].join(` ${glyphOf("text.separator")} `);
  return {
    levels,
    bars,
    columns: SPARK_SPAN + bars.length * (barColumns + BAR_CHROME),
    text: truncate(text, Math.floor(options.columns)),
  };
}

/**
 * The figures as one Raster row's cells: the done glyph and the sparkline in `colorOf` the done
 * token (a part with nothing done in the track's colour), then each bar's glyph in its token and
 * its cells filled in that token. `ascii` draws each glyph as its ASCII form.
 */
export function figureCells(
  figures: BandFigures,
  colorOf: (token: Token) => number,
  ascii = false,
): string {
  const cell = (id: GlyphId, color: number): RasterCell => ({
    codePoint: glyphOf(id, ascii).codePointAt(0) ?? 0x20,
    color,
    background: RASTER_DEFAULT_COLOR,
  });
  const blank: RasterCell = {
    codePoint: 0x20,
    color: RASTER_DEFAULT_COLOR,
    background: RASTER_DEFAULT_COLOR,
  };
  const done = colorOf("status.done");
  const cells: RasterCell[] = [
    cell("status.done", done),
    ...figures.levels.map((level) =>
      cell(SPARK_GLYPHS[level] ?? "spark.0", level === 0 ? RASTER_TRACK_COLOR : done),
    ),
    blank,
  ];
  for (const bar of figures.bars) {
    const color = colorOf(bar.token);
    cells.push(cell(bar.glyph, color), ...barRun(bar.columns, bar.filled, color), blank);
  }
  return rasterCells(cells.slice(0, figures.columns));
}
