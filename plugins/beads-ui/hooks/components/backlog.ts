import type { RenderElement, RenderNode } from "claude-code";

import { type BacklogView, type GutterCell, SPACE } from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";
import { gutter } from "./indicators.ts";
import { colorOf, rowHover, weight } from "./look.ts";
import { lineWindow, windowed } from "./window.ts";

// The Backlog (T-1.2, T-2C.12, D-35, T-2C.8), drawn from core's BacklogView on either surface:
// its count, one row an issue, its pager. Every row is one line, so on a windowed surface (the
// band) the same lines draw in its window.

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

/** The Backlog's measured columns: the tier and each fixed column's width. */
export interface BacklogColumns {
  wide: boolean;
  idWidth: number;
  typeWidth: number;
}

export interface BacklogModel {
  view: BacklogView & BacklogColumns;
  /** The sort's label, for the count line. */
  sort: string;
  /** What the Backlog draws with no row: its empty state. */
  empty: RenderElement;
  gutterOf: (id: string) => GutterCell[];
  handlers: { open: (id: string) => void; step: (delta: number) => void };
}

/**
 * The Backlog (T-2C.12): its count on the meta weight, one row an issue with the row's fill
 * under the pointer, its pager; with no row the empty state.
 */
export function backlog(surface: Surface, model: BacklogModel): RenderElement {
  const { Box, Text, Button } = surface.ui;
  const { view, handlers } = model;
  const { page, wide, idWidth, typeWidth } = view;
  const lines = present<RenderNode>([
    Box({
      key: "backlog-count",
      children: [
        Text({
          ...weight("meta"),
          ...(windowed(surface) ? { wrap: "truncate-end" } : {}),
          children: `${page.total} of ${view.total} open issues, ${model.sort} order`,
        }),
      ],
    }),
    view.rows.length === 0 ? model.empty : undefined,
    ...view.rows.map((row) =>
      Box({
        key: `row:${row.id}`,
        flexDirection: "row",
        gap: SPACE.tight,
        ...rowHover(),
        children: present<RenderNode>([
          gutter(surface.ui, model.gutterOf(row.id)),
          Text({ bold: true, color: colorOf(row.priorityToken), children: row.priority }),
          Box({
            width: idWidth,
            children: [Text({ ...weight("meta"), wrap: "truncate-end", children: row.displayId })],
          }),
          ...(wide ? [Box({ width: typeWidth, children: [Text({ children: row.type })] })] : []),
          Box({
            flexGrow: 1,
            children: [Text({ wrap: "truncate-end", children: row.title })],
          }),
          ...(wide
            ? [Text({ children: row.assignee }), Text({ ...weight("meta"), children: row.created })]
            : []),
          Button({
            key: `open:${row.id}`,
            label: "detail",
            plain: true,
            dimColor: true,
            onPress: () => handlers.open(row.id),
          }),
        ]),
      }),
    ),
    page.pages === 1
      ? undefined
      : Box({
          key: "backlog-pager",
          flexDirection: "row",
          columnGap: SPACE.tight,
          children: [
            Button({
              key: "backlog-back",
              label: page.page === 0 ? "last page" : "back",
              plain: true,
              dimColor: true,
              onPress: () => handlers.step(-1),
            }),
            Text({
              ...weight("meta"),
              children: `rows ${page.from}-${page.to} of ${page.total}`,
            }),
            Button({
              key: "backlog-next",
              label: page.to < page.total ? `+${page.total - page.to} more` : "first page",
              plain: true,
              onPress: () => handlers.step(1),
            }),
          ],
        }),
  ]);
  if (windowed(surface)) return lineWindow(surface, "backlog", lines);
  return Box({ key: "backlog", flexDirection: "column", children: lines });
}
