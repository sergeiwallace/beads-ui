import type { RenderElement, RenderNode } from "claude-code";

import {
  barCells,
  DUE_COLUMNS,
  glyphOf,
  RASTER_COLORS,
  SPACE,
  type TimelineLayout,
} from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";
import { emptyState } from "./frame.ts";
import { rowHover, weight } from "./look.ts";
import { lineWindow, textLine, windowed } from "./window.ts";

// The Timeline view (T-2B.9, D-35, T-2C.8), drawn from core's TimelineLayout on either surface.

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

/**
 * The Timeline: each dated epic or milestone as a button that opens it, with, where the surface
 * has a Raster, a one-row bar from the axis start to its due date coloured by its status
 * category (the label beside the bar in the wide tier, above it below that), and elsewhere a
 * Text row of its due date and label; then the ones with no due date, listed apart. A layout
 * with a row window says how many items are above and below it. On a windowed surface (the
 * band) every item is one line, the window the surface's own.
 */
export function timeline(
  surface: Surface,
  layout: TimelineLayout,
  options: { open: (id: string) => void },
): RenderElement {
  const { Box, Text, Button } = surface.ui;
  const raster = windowed(surface) ? undefined : surface.raster;
  const label = (id: string, text: string) =>
    Button({
      key: `timeline:${id}`,
      label: text,
      plain: true,
      onPress: () => options.open(id),
    });
  if (windowed(surface)) {
    return lineWindow(surface, "timeline", [
      textLine(surface, "timeline-count", layout.summary, { role: "meta" }),
      layout.rows.length === 0
        ? textLine(surface, "timeline-empty", layout.emptyLine, { role: "meta" })
        : textLine(surface, "timeline-axis", layout.axisLine, { role: "meta" }),
      ...layout.rows.map((row) =>
        Box({ key: `timeline-row:${row.id}`, ...rowHover(), children: [label(row.id, row.line)] }),
      ),
      textLine(surface, "timeline-undated", layout.undatedHeading, { role: "heading" }),
      ...layout.undated.map((entry) =>
        Box({ key: `timeline-undated:${entry.id}`, children: [label(entry.id, entry.label)] }),
      ),
    ]);
  }
  const bar = (row: TimelineLayout["rows"][number]): RenderNode[] =>
    raster === undefined
      ? []
      : [
          raster({
            key: `timeline-bar:${row.id}`,
            columns: row.columns,
            rows: 1,
            cells: barCells(row.columns, row.filled, RASTER_COLORS[row.category]),
          }),
          Box({ width: DUE_COLUMNS, flexShrink: 0, children: [Text({ children: row.due })] }),
        ];
  const rows = layout.rows.map((row) => {
    if (raster === undefined) {
      return Box({
        key: `timeline-row:${row.id}`,
        ...rowHover(),
        children: [label(row.id, row.line)],
      });
    }
    if (layout.placement === "beside") {
      return Box({
        key: `timeline-row:${row.id}`,
        flexDirection: "row",
        gap: SPACE.tight,
        ...rowHover(),
        children: [
          Box({ width: layout.labelColumns, flexShrink: 0, children: [label(row.id, row.label)] }),
          ...bar(row),
        ],
      });
    }
    return Box({
      key: `timeline-row:${row.id}`,
      flexDirection: "column",
      ...rowHover(),
      children: [
        label(row.id, row.label),
        Box({ flexDirection: "row", gap: SPACE.tight, children: bar(row) }),
      ],
    });
  });
  return Box({
    key: "timeline",
    flexDirection: "column",
    children: present<RenderNode>([
      Box({
        key: "timeline-count",
        children: [Text({ ...weight("meta"), children: layout.summary })],
      }),
      layout.rows.length === 0
        ? emptyState(surface, "timeline-empty", layout.emptyLine)
        : Box({
            key: "timeline-axis",
            children: [Text({ ...weight("meta"), children: layout.axisLine })],
          }),
      layout.above === 0
        ? undefined
        : Box({
            key: "timeline-above",
            children: [
              Text({
                ...weight("meta"),
                children: `${glyphOf("list.above")} ${layout.above} above`,
              }),
            ],
          }),
      ...rows,
      Box({
        key: "timeline-undated",
        flexDirection: "column",
        children: [
          Text({ ...weight("heading"), children: layout.undatedHeading }),
          ...layout.undated.map((entry) => label(entry.id, entry.label)),
        ],
      }),
      layout.below === 0
        ? undefined
        : Box({
            key: "timeline-below",
            children: [
              Text({
                ...weight("meta"),
                children: `${glyphOf("list.below")} ${layout.below} below`,
              }),
            ],
          }),
    ]),
  });
}
