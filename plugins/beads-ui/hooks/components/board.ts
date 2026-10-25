import type { RenderElement, RenderNode } from "claude-code";

import {
  type BoardView,
  CARD_FRAME_COLUMNS,
  type CardView,
  type GutterCell,
  glyphOf,
  type PageView,
  PRESS_FRAME_COLUMNS,
  SPACE,
  statusToken,
  type Token,
  textWidth,
  truncate,
} from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";
import { choice } from "./elements.ts";
import { gutter } from "./indicators.ts";
import { colorOf, rowHover, weight } from "./look.ts";
import { lineWindow, textLine, windowed } from "./window.ts";

// The Board (T-1.1, T-2C.12, D-35, T-2C.8), drawn from core's BoardView on either surface: on
// the pane its columns side by side and each card framed in its status's accent; on a windowed
// surface (the band) one line a lane, a column's header, a card or a pager, in its window.

const MOVE_LABEL = "Move to";
/** The columns a Select draws round its value: its open mark and the gap before it. */
export const SELECT_CHROME = 2;
const DETAIL_LABEL = "detail";
const MORE = glyphOf("text.more");

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

export interface BoardHandlers {
  move: (id: string, to: string) => void;
  open: (id: string) => void;
  stepCell: (key: string, delta: number) => void;
  stepLanes: (delta: number) => void;
}

export interface BoardModel {
  view: BoardView;
  /** With no card to draw, the Board's empty state, drawn in its place. */
  empty?: RenderElement;
  /** The status categories drawn, `perRow` of them to a row, each `groupWidth` wide (pane). */
  groups: readonly string[];
  perRow: number;
  groupWidth: number;
  /** The width the cards of statuses bd did not list draw at (pane). */
  unplacedWidth: number;
  /** A card's issue's status, the Move to's value. */
  statusOf: (id: string) => string;
  /** A card's indicator gutter (D-41). */
  gutterOf: (id: string) => GutterCell[];
  handlers: BoardHandlers;
}

/** The Move to's options: the status, then every other, each cut to `room`. */
const moveOptions = (status: string, card: CardView, room: number) =>
  [status, ...card.moveTargets].map((value) =>
    textWidth(value) <= room ? { value } : { value, label: truncate(value, room) },
  );

const detailButton = (surface: Surface, card: CardView, handlers: BoardHandlers) =>
  surface.ui.Button({
    key: `open:${card.id}`,
    label: DETAIL_LABEL,
    plain: true,
    dimColor: true,
    onPress: () => handlers.open(card.id),
  });

/**
 * One card in a column `width` wide (T-2C.12): framed in its status's accent, its priority bold
 * in the priority's colour, the frame in the focus colour under the pointer. Its Move to keeps
 * its label while the label and the longest status fit beside each other inside the frame; a
 * status too long for it is cut in its option label.
 */
export function boardCard(
  surface: Surface,
  model: BoardModel,
  card: CardView,
  width: number,
  accent: Token,
): RenderElement {
  const status = model.statusOf(card.id);
  const { Box, Text } = surface.ui;
  const inner = Math.max(1, width - CARD_FRAME_COLUMNS);
  const values = [status, ...card.moveTargets];
  const room = Math.max(1, inner - SELECT_CHROME);
  const longest = Math.max(0, ...values.map(textWidth));
  const labelled = inner >= textWidth(MOVE_LABEL) + 2 + Math.min(longest, room) + SELECT_CHROME;
  const cells = model.gutterOf(card.id);
  return Box({
    key: `card:${card.id}`,
    flexDirection: "column",
    borderStyle: "round",
    borderColor: colorOf(accent),
    hover: { borderColor: colorOf("surface.focus") },
    children: [
      cells.length === 0
        ? Text({ ...weight("meta"), children: card.displayId })
        : Box({
            flexDirection: "row",
            gap: SPACE.tight,
            children: present<RenderNode>([
              gutter(surface.ui, cells),
              Text({ ...weight("meta"), wrap: "truncate-end", children: card.displayId }),
            ]),
          }),
      Text({ children: card.title }),
      Text({
        children: [
          Text({ bold: true, color: colorOf(card.priorityToken), children: card.priority }),
          ...(card.assignee === ""
            ? []
            : [" ", Text({ ...weight("meta"), children: card.assignee })]),
          ...(card.pending ? [Text({ ...weight("meta"), children: ` moving${MORE}` })] : []),
        ],
      }),
      choice(surface, {
        key: `move:${card.id}`,
        ...(labelled ? { label: MOVE_LABEL } : {}),
        options: moveOptions(status, card, room),
        value: status,
        onSelect: (value) => model.handlers.move(card.id, value),
      }),
      detailButton(surface, card, model.handlers),
    ],
  });
}

/**
 * A card as the band draws it: its gutter, priority, display id, title and assignee on one line
 * with its Move to and detail button, or, where they leave the title under 12 columns, the
 * controls on a second line under it.
 */
function cardLines(surface: Surface, model: BoardModel, card: CardView): RenderElement[] {
  const { Box, Text } = surface.ui;
  const status = model.statusOf(card.id);
  const cells = model.gutterOf(card.id);
  const columns = surface.columns;
  const values = [status, ...card.moveTargets];
  const room = Math.max(1, Math.min(Math.max(0, ...values.map(textWidth)), columns - 4));
  const controlColumns =
    room + SELECT_CHROME + SPACE.tight + textWidth(DETAIL_LABEL) + PRESS_FRAME_COLUMNS;
  const lead =
    (cells.length === 0 ? 0 : cells.length + SPACE.tight) +
    textWidth(card.priority) +
    SPACE.tight +
    textWidth(card.displayId) +
    SPACE.tight;
  const text = `${card.title}${card.assignee === "" ? "" : ` ${card.assignee}`}${card.pending ? ` moving${MORE}` : ""}`;
  const oneLine = columns - lead - controlColumns - SPACE.tight >= 12;
  const titleRoom = Math.max(1, columns - lead - (oneLine ? controlColumns + SPACE.tight : 0));
  const head = [
    gutter(surface.ui, cells),
    Text({ bold: true, color: colorOf(card.priorityToken), children: card.priority }),
    Text({ ...weight("meta"), children: card.displayId }),
    Text({ wrap: "truncate-end", children: truncate(text, titleRoom) }),
  ];
  const controls = [
    choice(surface, {
      key: `move:${card.id}`,
      options: moveOptions(status, card, room),
      value: status,
      onSelect: (value) => model.handlers.move(card.id, value),
    }),
    detailButton(surface, card, model.handlers),
  ];
  if (oneLine) {
    return [
      Box({
        key: `card:${card.id}`,
        flexDirection: "row",
        gap: SPACE.tight,
        ...rowHover(),
        children: present<RenderNode>([...head, ...controls]),
      }),
    ];
  }
  return [
    Box({
      key: `card:${card.id}`,
      flexDirection: "row",
      gap: SPACE.tight,
      ...rowHover(),
      children: present<RenderNode>(head),
    }),
    Box({
      key: `card-controls:${card.id}`,
      flexDirection: "row",
      gap: SPACE.tight,
      paddingLeft: 2,
      children: controls,
    }),
  ];
}

/**
 * A paged cell's controls: back, the range drawn, and more. Both wrap round, so both stay drawn
 * and a press keeps the focus ring on the control it pressed.
 */
export function boardPager(
  surface: Surface,
  page: PageView,
  handlers: BoardHandlers,
): RenderElement | undefined {
  if (page.pages === 1) return undefined;
  const { Box, Text, Button } = surface.ui;
  return Box({
    key: `pager:${page.key}`,
    flexDirection: "row",
    ...(windowed(surface) ? {} : { flexWrap: "wrap" }),
    columnGap: SPACE.tight,
    children: [
      Button({
        key: `prev:${page.key}`,
        label: page.page === 0 ? "last page" : "back",
        plain: true,
        dimColor: true,
        onPress: () => handlers.stepCell(page.key, -1),
      }),
      Text({ ...weight("meta"), children: `${page.from}-${page.to} of ${page.total}` }),
      Button({
        key: `next:${page.key}`,
        label: page.to < page.total ? `+${page.total - page.to} more` : "first page",
        plain: true,
        onPress: () => handlers.stepCell(page.key, 1),
      }),
    ],
  });
}

/** The swimlanes' pager, and the columns the drawn lane page shows. */
function lanePager(surface: Surface, view: BoardView, handlers: BoardHandlers) {
  const { lanePage, columnWindow } = view;
  if (lanePage.pages === 1) return undefined;
  const { Box, Text, Button } = surface.ui;
  const columnsText =
    columnWindow === undefined
      ? ""
      : `, columns ${columnWindow.from}-${columnWindow.to} of ${columnWindow.total}`;
  return Box({
    key: "lane-pager",
    flexDirection: "row",
    columnGap: SPACE.tight,
    children: [
      Button({
        key: "lanes-back",
        label: "back",
        plain: true,
        onPress: () => handlers.stepLanes(-1),
      }),
      Text({
        ...weight("meta"),
        ...(windowed(surface) ? { wrap: "truncate-end" } : {}),
        children: `lanes ${lanePage.from}-${lanePage.to} of ${lanePage.total}${columnsText}`,
      }),
      Button({
        key: "lanes-next",
        label: "more lanes",
        hotkey: "l",
        plain: true,
        onPress: () => handlers.stepLanes(1),
      }),
    ],
  });
}

/** The Board's lanes, cells and pagers: framed cards in columns on the pane, lines on the band. */
export function board(surface: Surface, model: BoardModel): RenderElement {
  const { Box, Text } = surface.ui;
  const { view, handlers } = model;
  if (model.empty !== undefined) {
    return Box({ key: "board", flexDirection: "column", children: [model.empty] });
  }
  if (windowed(surface)) {
    const lines: RenderNode[] = present<RenderNode>([lanePager(surface, view, handlers)]);
    for (const lane of view.lanes) {
      if (lane.label !== "") {
        lines.push(
          textLine(surface, `lane:${lane.key === "" ? "-" : lane.key}`, lane.label, {
            role: "heading",
          }),
        );
      }
      view.columns.forEach((column, i) => {
        lines.push(
          textLine(surface, `column:${lane.key}:${column.status}`, column.label, {
            token: column.token,
            role: "heading",
          }),
        );
        for (const card of lane.cells[i] ?? []) lines.push(...cardLines(surface, model, card));
        const page = lane.pages[i];
        const pager = page === undefined ? undefined : boardPager(surface, page, handlers);
        if (pager !== undefined) lines.push(pager);
      });
    }
    if (view.unplaced.length > 0) {
      lines.push(
        textLine(surface, "unplaced", "Statuses bd statuses did not list", { role: "heading" }),
      );
      for (const card of view.unplaced) lines.push(...cardLines(surface, model, card));
      const pager = boardPager(surface, view.unplacedPage, handlers);
      if (pager !== undefined) lines.push(pager);
    }
    return lineWindow(surface, "board", lines);
  }
  const { groups, perRow, groupWidth } = model;
  const lanes = view.lanes.map((lane) =>
    Box({
      key: `lane:${lane.key === "" ? "-" : lane.key}`,
      flexDirection: "column",
      children: present<RenderNode>([
        lane.label === ""
          ? undefined
          : Text({ ...weight("heading"), underline: true, children: lane.label }),
        // perRow groups to a row; a narrow pane stacks the rest below (T-1B.9).
        ...Array.from({ length: Math.ceil(groups.length / perRow) }, (_, row) =>
          Box({
            flexDirection: "row",
            gap: SPACE.tight,
            children: groups.slice(row * perRow, (row + 1) * perRow).map((category) =>
              Box({
                key: `group:${lane.key}:${category}`,
                flexDirection: "column",
                width: groupWidth,
                children: view.columns.flatMap((column, i) => {
                  if (column.category !== category) return [];
                  const cards = lane.cells[i] ?? [];
                  const page = lane.pages[i];
                  return present<RenderNode>([
                    Box({
                      key: `column:${lane.key}:${column.status}`,
                      children: [
                        Text({
                          bold: true,
                          color: colorOf(column.token),
                          children: column.label,
                        }),
                      ],
                    }),
                    ...cards.map((card) =>
                      boardCard(surface, model, card, groupWidth, statusToken(column.category)),
                    ),
                    page === undefined ? undefined : boardPager(surface, page, handlers),
                  ]);
                }),
              }),
            ),
          }),
        ),
      ]),
    }),
  );
  const unplaced =
    view.unplaced.length === 0
      ? undefined
      : Box({
          key: "unplaced",
          flexDirection: "column",
          children: present<RenderNode>([
            Text({ ...weight("heading"), children: "Statuses bd statuses did not list" }),
            ...view.unplaced.map((card) =>
              boardCard(surface, model, card, model.unplacedWidth, "surface.card"),
            ),
            boardPager(surface, view.unplacedPage, handlers),
          ]),
        });
  return Box({
    key: "board",
    flexDirection: "column",
    children: present([lanePager(surface, view, handlers), ...lanes, unplaced]),
  });
}
