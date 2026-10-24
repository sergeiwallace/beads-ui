import type { RenderElement, RenderNode } from "claude-code";

import {
  barCells,
  DEFAULT_PANEL_SETTINGS,
  DUE_COLUMNS,
  hotkeyOf,
  type MenuView,
  menuItemText,
  type NavLayout,
  type PanelOverrides,
  type PanelSettings,
  panelOverridesOf,
  RASTER_COLORS,
  resolvePanel,
  type SettingsView,
  SIDE_NAV_COLUMNS,
  SIDE_NAV_GAP,
  type TaskListView,
  type TimelineLayout,
  type Token,
  textWidth,
  truncate,
  withPanelOverrides,
} from "../core/src/index.ts";
import type { Host } from "./host.ts";
import type { PaneUi, RasterElement } from "./pane.ts";

// The task panel drawn with the element tree (D-31): the nav, the Tasks view, the options menu,
// the Timeline and the Settings view, each from core's view model. The state behind them is the
// pane's.

/** Where the pane keeps panel settings changed in it until Save to file writes them. */
export const PANEL_SETTINGS_KEY = "panel-settings";

/** The menu button each task row carries, so a left click reaches the options menu (T-2B.4). */
export const ROW_MENU_LABEL = "⋮";

/** Beside a row the Client draws (T-2B.5): the button Enter on the focused task presses. */
export const ROW_OPEN_LABEL = "▸";

/** Columns the buttons beside a task's label take, each after a gap: ⋮, or ▸ and ⋮ by a Client. */
export const rowControlColumns = (client: boolean): number => (client ? 4 : 2);

/**
 * The task panel's settings (T-2B.2, T-2B.8): `beads-ui.toml`'s `[panel]` table, read at call
 * time, with the changes made in Settings over it, kept in `$.store` until Save to file.
 */
export class PanelSettingsState {
  host: Host | undefined;
  overrides: PanelOverrides = {};
  problems: string[] = [];
  private file: PanelSettings = { ...DEFAULT_PANEL_SETTINGS };

  async bind(host: Host): Promise<void> {
    this.host = host;
    await this.reload();
  }

  /** The settings the panel draws with: the file's under the ones changed in Settings. */
  get settings(): PanelSettings {
    return withPanelOverrides(this.file, this.overrides);
  }

  /** Reads the file's `[panel]` table and the held changes, as each refresh does. */
  async read(text: string | undefined): Promise<void> {
    const resolved = resolvePanel(text);
    this.file = resolved.settings;
    this.problems = resolved.problems;
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.overrides = panelOverridesOf(
      await this.host?.storeGet(PANEL_SETTINGS_KEY).catch(() => undefined),
    );
  }

  async change(next: PanelOverrides): Promise<void> {
    this.overrides = { ...this.overrides, ...next };
    await this.host?.storeSet(PANEL_SETTINGS_KEY, this.overrides).catch(() => undefined);
    this.host?.invalidate();
  }

  /** Save to file wrote the settings: the file holds them now, so nothing is held. */
  async saved(): Promise<void> {
    this.file = this.settings;
    this.overrides = {};
    await this.host?.storeSet(PANEL_SETTINGS_KEY, {}).catch(() => undefined);
  }
}

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

/**
 * The nav and the view beside or below it (T-2B.1): a framed side nav one entry a row, or a bar
 * of buttons packed into rows that each fit the body.
 */
export function drawFrame(
  ui: PaneUi,
  nav: NavLayout,
  press: (view: NavLayout["items"][number]) => void,
  content: readonly RenderNode[],
): RenderElement {
  const { Box, Button } = ui;
  const button = (item: NavLayout["items"][number]) =>
    Button({
      key: item.key,
      label: item.label,
      hotkey: item.hotkey,
      plain: true,
      ...(item.planned || !item.active ? { dimColor: true } : {}),
      onPress: () => press(item),
    });
  if (nav.kind === "side") {
    return Box({
      flexDirection: "row",
      gap: SIDE_NAV_GAP,
      children: [
        Box({
          key: "nav",
          flexDirection: "column",
          borderStyle: "round",
          width: SIDE_NAV_COLUMNS,
          flexShrink: 0,
          children: nav.items.map(button),
        }),
        Box({
          key: "view",
          flexDirection: "column",
          width: nav.viewColumns,
          children: [...content],
        }),
      ],
    });
  }
  return Box({
    flexDirection: "column",
    children: [
      Box({
        key: "nav",
        flexDirection: "column",
        children: nav.rows.map((row, i) =>
          Box({
            key: `nav:${i}`,
            flexDirection: "row",
            columnGap: nav.gap,
            children: row.map(button),
          }),
        ),
      }),
      Box({ key: "view", flexDirection: "column", children: [...content] }),
    ],
  });
}

export interface TaskListHandlers {
  open: (id: string) => void;
  menu: (id: string) => void;
  more: () => void;
}

/** The task list's Client (T-2B.5): its key, the instance the hooks hear posts and faults from. */
export const TASKS_CLIENT_KEY = "tasks-list";

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
        textWidth(MENU_CLOSE_LABEL),
        ...menu.sections.flatMap((section) => [
          textWidth(section.title),
          ...section.items.map((item) => textWidth(menuItemText(item))),
        ]),
      ),
  );

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

/**
 * The Tasks view's list (T-2B.2): one row a task, its label a button Enter or a click opens and
 * a menu button beside it, the "+M more" control under the rows, and `menu` drawn right under
 * the row it is about. With `client`, a Client draws the rows, and beside each one an open button
 * and its menu button stay in the element tree, so Tab, the arrows and Enter reach and open every
 * task with no click, and a click the Client never hears still reaches the menu; the menu is
 * drawn over the room the Client leaves under its row.
 */
export function drawTaskList(
  ui: PaneUi,
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
  const { Box, Text, Button } = ui;
  const { counts } = list;
  const summary = `${list.total} ${list.total === 1 ? "task" : "tasks"}: ${counts.in_progress} in progress, ${counts.blocked} blocked, ${counts.open} open`;
  const menuButton = (id: string) =>
    Button({
      key: `taskmenu:${id}`,
      label: ROW_MENU_LABEL,
      plain: true,
      dimColor: true,
      onPress: () => options.handlers.menu(id),
    });
  const client = options.client;
  const menuAt = list.rows.findIndex((row) => row.id === options.menuFor);
  const rows: RenderNode[] =
    client === undefined
      ? list.rows.flatMap((row) =>
          present<RenderNode>([
            Box({
              key: `taskrow:${row.id}`,
              flexDirection: "row",
              gap: 1,
              children: [
                Button({
                  key: `task:${row.id}`,
                  label: row.label,
                  plain: true,
                  onPress: () => options.handlers.open(row.id),
                }),
                menuButton(row.id),
              ],
            }),
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
                              menuButton(row.id),
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
  const menuElsewhere =
    options.menu !== undefined && !list.rows.some((row) => row.id === options.menuFor);
  return Box({
    key: "tasks",
    flexDirection: "column",
    children: present<RenderNode>([
      Box({ key: "tasks-count", children: [Text({ dimColor: true, children: summary })] }),
      menuElsewhere ? options.menu : undefined,
      list.total === 0
        ? Box({ key: "tasks-empty", children: [Text({ dimColor: true, children: options.empty })] })
        : undefined,
      list.above === 0
        ? undefined
        : Box({
            key: "tasks-above",
            children: [Text({ dimColor: true, children: `↑ ${list.above} above` })],
          }),
      ...rows,
      list.below === 0
        ? undefined
        : Box({
            key: "tasks-below",
            children: [Text({ dimColor: true, children: `↓ ${list.below} below` })],
          }),
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

/**
 * The options menu (T-2B.4): each section's actions as buttons that run them, each labelled with
 * the key that also runs it, cut to the width so a narrow pane still fits it.
 */
export function drawMenu(
  ui: PaneUi,
  menu: MenuView,
  width: number,
  run: (command: string) => void,
  close: () => void,
): RenderElement {
  const { Box, Text, Button } = ui;
  // The frame and its padding take four columns.
  const room = Math.max(4, width - 4);
  return Box({
    key: "options-menu",
    flexDirection: "column",
    borderStyle: "round",
    paddingX: 1,
    children: [
      ...menu.sections.flatMap((section) => [
        Box({
          key: section.key,
          children: [Text({ bold: true, wrap: "truncate-end", children: section.title })],
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
    ],
  });
}

/**
 * The Timeline view (T-2B.9): each dated epic or milestone as a button that opens it, with, in
 * the terminal, a one-row Raster bar from the axis start to its due date coloured by its status
 * category (the label beside the bar in the wide tier, above it below that), and elsewhere a
 * Text row of its due date and label; then the ones with no due date, listed apart.
 */
export function drawTimeline(
  ui: PaneUi,
  layout: TimelineLayout,
  options: { raster?: RasterElement; open: (id: string) => void },
): RenderElement {
  const { Box, Text, Button } = ui;
  const { raster } = options;
  const label = (id: string, text: string) =>
    Button({
      key: `timeline:${id}`,
      label: text,
      plain: true,
      onPress: () => options.open(id),
    });
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
      return Box({ key: `timeline-row:${row.id}`, children: [label(row.id, row.line)] });
    }
    if (layout.placement === "beside") {
      return Box({
        key: `timeline-row:${row.id}`,
        flexDirection: "row",
        gap: 1,
        children: [
          Box({ width: layout.labelColumns, flexShrink: 0, children: [label(row.id, row.label)] }),
          ...bar(row),
        ],
      });
    }
    return Box({
      key: `timeline-row:${row.id}`,
      flexDirection: "column",
      children: [
        label(row.id, row.label),
        Box({ flexDirection: "row", gap: 1, children: bar(row) }),
      ],
    });
  });
  return Box({
    key: "timeline",
    flexDirection: "column",
    children: present<RenderNode>([
      Box({
        key: "timeline-count",
        children: [Text({ dimColor: true, children: layout.summary })],
      }),
      layout.rows.length === 0
        ? Box({
            key: "timeline-empty",
            children: [Text({ dimColor: true, children: layout.emptyLine })],
          })
        : Box({
            key: "timeline-axis",
            children: [Text({ dimColor: true, children: layout.axisLine })],
          }),
      ...rows,
      Box({
        key: "timeline-undated",
        flexDirection: "column",
        children: [
          Text({ bold: true, children: layout.undatedHeading }),
          ...layout.undated.map((entry) => label(entry.id, entry.label)),
        ],
      }),
    ]),
  });
}

export interface SettingsHandlers {
  shown: (text: string) => void;
  choose: (key: string, value: string) => void;
  save: () => void;
}

/** The widest label a Settings row draws beside its control, and the gap after it. */
const SETTINGS_LABEL_COLUMNS = Math.max(
  ...["Shown tasks:", "Collapse:", "Panel mode:", "Debug mode:"].map(textWidth),
);
/** Columns a Settings `Select`'s option label may take at a view width. */
export const settingsOptionRoom = (width: number): number =>
  Math.max(8, width - SETTINGS_LABEL_COLUMNS - 1 - 2);

/**
 * The Settings view (T-2B.8): the panel's rows from core's settings view, then the band's own
 * settings, then one Save to file that writes both tables.
 */
export function drawSettings(
  ui: PaneUi,
  view: SettingsView,
  options: {
    color: (token: Token) => string;
    problems: readonly string[];
    notice?: { text: string; token: Token };
    band?: RenderElement;
    handlers: SettingsHandlers;
  },
): RenderElement {
  const { Box, Text, Button, Input, Select } = ui;
  const rows = view.rows.map((row) => {
    const control =
      row.kind === "number"
        ? Input({
            key: row.key,
            value: row.value,
            submitLabel: "set",
            onSubmit: (value) => options.handlers.shown(value),
          })
        : Select({
            key: row.key,
            options: row.options,
            value: row.value,
            onSelect: (value) => options.handlers.choose(row.key, value),
          });
    return Box({
      key: `${row.key}:row`,
      flexDirection: "column",
      children: [
        Box({
          flexDirection: "row",
          gap: 1,
          children: [
            Box({ flexShrink: 0, children: [Text({ children: `${row.label}:` })] }),
            control,
          ],
        }),
        Text({ dimColor: true, children: row.hint }),
      ],
    });
  });
  return Box({
    key: "settings",
    flexDirection: "column",
    children: present<RenderNode>([
      Text({ bold: true, children: "Task panel (every session on this machine)" }),
      ...options.problems.map((problem, i) =>
        Box({
          key: `settings:problem:${i}`,
          children: [Text({ color: options.color("warning"), children: problem })],
        }),
      ),
      options.notice === undefined
        ? undefined
        : Box({
            key: "settings:notice",
            children: [
              Text({ color: options.color(options.notice.token), children: options.notice.text }),
            ],
          }),
      ...rows,
      options.band,
      Button({
        key: "settings:save",
        label: "Save to file",
        plain: true,
        onPress: () => options.handlers.save(),
      }),
    ]),
  });
}
