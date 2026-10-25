import type { RenderElement, RenderNode } from "claude-code";

import {
  glyphOf,
  hotkeyOf,
  PRESS_FRAME_COLUMNS,
  type TaskListView,
  type TaskRowView,
  type Token,
  truncate,
} from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";

// The task row and the task list (T-2B.2, D-35): drawn from core's TaskListView on any surface.

/** The menu button each task row carries, so a left click reaches the options menu (T-2B.4). */
export const ROW_MENU_LABEL = glyphOf("row.menu");

/** Beside a row the Client draws (T-2B.5): the button Enter on the focused task presses. */
export const ROW_OPEN_LABEL = glyphOf("row.open");

/**
 * Columns a task row takes beside its label's text: the label button's brackets and the menu
 * button after a gap, or, beside a Client's row, the open and menu buttons each after a gap,
 * every button in the clickable brackets (T-2C.14).
 */
export const rowControlColumns = (client: boolean): number =>
  client ? 2 * (1 + 1 + PRESS_FRAME_COLUMNS) : PRESS_FRAME_COLUMNS + 1 + 1 + PRESS_FRAME_COLUMNS;

/** The task list's Client (T-2B.5): its key, the instance the hooks hear posts and faults from. */
export const TASKS_CLIENT_KEY = "tasks-list";

export interface TaskListHandlers {
  open: (id: string) => void;
  menu: (id: string) => void;
  more: () => void;
}

/**
 * The Client path (T-2B.5, D-31): the region drawing the rows, the rows it leaves for the menu
 * under `menuFor`, and the column and width the menu opens at.
 */
export interface TaskListClient {
  region: RenderElement;
  gapRows: number;
  menuLeft: number;
  menuWidth: number;
}

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

const menuButton = (surface: Surface, id: string, handlers: TaskListHandlers) =>
  surface.ui.Button({
    key: `taskmenu:${id}`,
    label: ROW_MENU_LABEL,
    plain: true,
    dimColor: true,
    onPress: () => handlers.menu(id),
  });

/** One task: its label a button that opens it, and its menu button beside it. */
export function taskRow(
  surface: Surface,
  row: TaskRowView,
  handlers: TaskListHandlers,
): RenderElement {
  const { Box, Button } = surface.ui;
  return Box({
    key: `taskrow:${row.id}`,
    flexDirection: "row",
    gap: 1,
    children: [
      Button({
        key: `task:${row.id}`,
        label: row.label,
        plain: true,
        onPress: () => handlers.open(row.id),
      }),
      menuButton(surface, row.id, handlers),
    ],
  });
}

/**
 * The task list (T-2B.2): one task row a task, the "+M more" control under the rows, and `menu`
 * drawn right under the row it is about. With `client`, a Client draws the rows, and beside each
 * one an open button and its menu button stay in the element tree, so Tab, the arrows and Enter
 * reach and open every task with no click, and a click the Client never hears still reaches the
 * menu; the menu is drawn over the room the Client leaves under its row.
 */
export function taskList(
  surface: Surface,
  list: TaskListView,
  options: {
    color: (token: Token) => string;
    empty: string;
    handlers: TaskListHandlers;
    menuFor?: string;
    menu?: RenderElement;
    client?: TaskListClient;
  },
): RenderElement {
  const { Box, Text, Button } = surface.ui;
  const { counts } = list;
  const summary = `${list.total} ${list.total === 1 ? "task" : "tasks"}: ${counts.in_progress} in progress, ${counts.blocked} blocked, ${counts.open} open`;
  const client = options.client;
  const menuAt = list.rows.findIndex((row) => row.id === options.menuFor);
  const rows: RenderNode[] =
    client === undefined
      ? list.rows.flatMap((row) =>
          present<RenderNode>([
            taskRow(surface, row, options.handlers),
            options.menuFor === row.id ? options.menu : undefined,
          ]),
        )
      : list.rows.length === 0
        ? []
        : [
            Box({
              key: "tasks-rows",
              flexDirection: "column",
              children: present<RenderNode>([
                Box({
                  flexDirection: "row",
                  gap: 1,
                  children: [
                    client.region,
                    Box({
                      key: "taskmenus",
                      flexDirection: "column",
                      flexShrink: 0,
                      children: list.rows.flatMap((row) =>
                        present<RenderNode>([
                          Box({
                            key: `taskcontrols:${row.id}`,
                            flexDirection: "row",
                            gap: 1,
                            children: [
                              Button({
                                key: `task:${row.id}`,
                                label: ROW_OPEN_LABEL,
                                plain: true,
                                dimColor: true,
                                onPress: () => options.handlers.open(row.id),
                              }),
                              menuButton(surface, row.id, options.handlers),
                            ],
                          }),
                          row.id === options.menuFor && client.gapRows > 0
                            ? Box({ key: "taskmenus-room", height: client.gapRows })
                            : undefined,
                        ]),
                      ),
                    }),
                  ],
                }),
                options.menu !== undefined && menuAt >= 0
                  ? Box({
                      key: "menu-anchor",
                      position: "absolute",
                      top: menuAt + 1,
                      left: client.menuLeft,
                      width: client.menuWidth,
                      children: [options.menu],
                    })
                  : undefined,
              ]),
            }),
          ];
  // At short height (the band always) a line that wrapped would take a row the list does not
  // have, so the count and the empty line are cut to the surface's columns instead.
  const line = (text: string) => (surface.short ? truncate(text, surface.columns) : text);
  const menuElsewhere =
    options.menu !== undefined && !list.rows.some((row) => row.id === options.menuFor);
  const scroll = surface.scroll;
  const page = Math.max(1, list.rows.length);
  // Where the surface scrolls the list itself, the rows above and below are buttons that move it.
  const edge = (key: "above" | "below", count: number) => {
    const text = `${glyphOf(key === "above" ? "list.above" : "list.below")} ${count} ${key}`;
    if (scroll === undefined) {
      return Box({ key: `tasks-${key}`, children: [Text({ dimColor: true, children: text })] });
    }
    const start = key === "above" ? scroll.start - page : scroll.start + page;
    return Button({
      key: `tasks:${key}`,
      label: text,
      plain: true,
      onPress: () => scroll.to(Math.max(0, start)),
    });
  };
  return Box({
    key: "tasks",
    flexDirection: "column",
    children: present<RenderNode>([
      Box({ key: "tasks-count", children: [Text({ dimColor: true, children: line(summary) })] }),
      menuElsewhere ? options.menu : undefined,
      list.total === 0
        ? Box({
            key: "tasks-empty",
            children: [Text({ dimColor: true, children: line(options.empty) })],
          })
        : undefined,
      list.above === 0 ? undefined : edge("above", list.above),
      ...rows,
      list.below === 0 ? undefined : edge("below", list.below),
      list.collapsible
        ? Button({
            key: "tasks:more",
            label: list.moreLabel,
            hotkey: hotkeyOf("tasks.more"),
            plain: true,
            onPress: () => options.handlers.more(),
          })
        : undefined,
    ]),
  });
}
