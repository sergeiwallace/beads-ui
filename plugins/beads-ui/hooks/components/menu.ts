import type { RenderElement, RenderNode } from "claude-code";

import {
  type MenuView,
  menuItemText,
  PRESS_FRAME_COLUMNS,
  textWidth,
  truncate,
} from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";
import { weight } from "./look.ts";
import { lineWindow, textLine, windowed } from "./window.ts";

// The options menu (T-2B.4, D-35, T-2C.8): every action a view offers, drawn from core's
// MenuView on either surface.

const MENU_CLOSE_LABEL = "close the menu";

/** Rows the options menu takes: its frame, each section's title and items, and its close row. */
export const menuRows = (menu: MenuView): number =>
  3 + menu.sections.reduce((rows, section) => rows + 1 + section.items.length, 0);

/** Columns the options menu takes, at most `width`: its widest line, its frame and padding. */
export const menuColumns = (menu: MenuView, width: number): number =>
  Math.min(
    width,
    4 +
      Math.max(
        textWidth(MENU_CLOSE_LABEL) + PRESS_FRAME_COLUMNS,
        ...menu.sections.flatMap((section) => [
          textWidth(section.title),
          ...section.items.map((item) => textWidth(menuItemText(item)) + PRESS_FRAME_COLUMNS),
        ]),
      ),
  );

/**
 * The options menu: each section's actions as buttons that run them, each labelled with the key
 * that also runs it, cut to the width so a narrow pane still fits it. On a windowed surface (the
 * band) it is unframed, a line a title or item, in the surface's window.
 */
export function drawMenu(
  surface: Surface,
  menu: MenuView,
  width: number,
  run: (command: string) => void,
  close: () => void,
): RenderElement {
  const { Box, Text, Button } = surface.ui;
  const lined = windowed(surface);
  // The frame and its padding take four columns, and each item's clickable brackets two.
  const room = Math.max(4, width - (lined ? 0 : 4) - PRESS_FRAME_COLUMNS);
  const lines: RenderNode[] = [
    ...menu.sections.flatMap((section) => [
      lined
        ? textLine(surface, section.key, section.title, { role: "heading" })
        : Box({
            key: section.key,
            children: [
              Text({ ...weight("heading"), wrap: "truncate-end", children: section.title }),
            ],
          }),
      ...section.items.map((item) =>
        Button({
          key: item.key,
          label: truncate(menuItemText(item), room),
          plain: true,
          onPress: () => run(item.command),
        }),
      ),
    ]),
    Button({
      key: "menu:close",
      label: MENU_CLOSE_LABEL,
      plain: true,
      dimColor: true,
      onPress: close,
    }),
  ];
  if (lined) return lineWindow(surface, "options-menu", lines);
  return Box({
    key: "options-menu",
    flexDirection: "column",
    borderStyle: "round",
    paddingX: 1,
    children: lines,
  });
}
