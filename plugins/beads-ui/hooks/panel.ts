import type { RenderElement, RenderNode } from "claude-code";

import {
  barCells,
  DEFAULT_PANEL_SETTINGS,
  DUE_COLUMNS,
  glyphOf,
  type MenuView,
  menuItemText,
  type PanelOverrides,
  type PanelSettings,
  panelOverridesOf,
  RASTER_COLORS,
  resolvePanel,
  resolveSurfaces,
  type SettingsView,
  type SurfaceOverrides,
  type SurfaceSetting,
  surfaceOverridesOf,
  type TimelineLayout,
  type Token,
  textWidth,
  truncate,
  withPanelOverrides,
} from "../core/src/index.ts";
import type { RasterElement, Surface } from "./components/adapters.ts";
import { choice, field } from "./components/elements.ts";
import type { Host } from "./host.ts";
import type { PaneUi } from "./pane.ts";

// The task panel's settings state and the pane views not yet on the component layer (D-35):
// the options menu, the Timeline and the Settings view, each from core's view model. The nav,
// the task list and the action bar are components in ./components. The state behind them is the
// pane's.

export {
  ROW_MENU_LABEL,
  ROW_OPEN_LABEL,
  rowControlColumns,
  TASKS_CLIENT_KEY,
  type TaskListClient,
  type TaskListHandlers,
} from "./components/tasks.ts";

/** Where the pane keeps panel settings changed in it until Save to file writes them. */
export const PANEL_SETTINGS_KEY = "panel-settings";

/** Where the pane keeps the views' surfaces changed in Settings until Save to file (D-35). */
export const SURFACES_KEY = "view-surfaces";

/**
 * The task panel's settings (T-2B.2, T-2B.8): `beads-ui.toml`'s `[panel]` table, and the views'
 * surfaces from its `[surfaces]` table (D-35), read at call time, with the changes made in
 * Settings over them, kept in `$.store` until Save to file.
 */
export class PanelSettingsState {
  host: Host | undefined;
  overrides: PanelOverrides = {};
  surfaceOverrides: Record<string, SurfaceSetting> = {};
  problems: string[] = [];
  private file: PanelSettings = { ...DEFAULT_PANEL_SETTINGS };
  private fileSurfaces: Record<string, SurfaceSetting> = {};

  async bind(host: Host): Promise<void> {
    this.host = host;
    await this.reload();
  }

  /** The settings the panel draws with: the file's under the ones changed in Settings. */
  get settings(): PanelSettings {
    return withPanelOverrides(this.file, this.overrides);
  }

  /** Each view's surfaces: `[surfaces]` under the ones changed in Settings. */
  get surfaces(): SurfaceOverrides {
    return { ...this.fileSurfaces, ...this.surfaceOverrides };
  }

  /** Reads the file's `[panel]` and `[surfaces]` tables and the held changes, as each refresh does. */
  async read(text: string | undefined): Promise<void> {
    const resolved = resolvePanel(text);
    const surfaces = resolveSurfaces(text);
    this.file = resolved.settings;
    this.fileSurfaces = surfaces.settings;
    this.problems = [...resolved.problems, ...surfaces.problems];
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.overrides = panelOverridesOf(
      await this.host?.storeGet(PANEL_SETTINGS_KEY).catch(() => undefined),
    );
    this.surfaceOverrides = surfaceOverridesOf(
      await this.host?.storeGet(SURFACES_KEY).catch(() => undefined),
    );
  }

  async change(next: PanelOverrides): Promise<void> {
    this.overrides = { ...this.overrides, ...next };
    await this.host?.storeSet(PANEL_SETTINGS_KEY, this.overrides).catch(() => undefined);
    this.host?.invalidate();
  }

  /** Settings set a view's surfaces: drawn so from the next redraw. */
  async changeSurface(view: string, setting: SurfaceSetting): Promise<void> {
    this.surfaceOverrides = { ...this.surfaceOverrides, [view]: setting };
    await this.host?.storeSet(SURFACES_KEY, this.surfaceOverrides).catch(() => undefined);
    this.host?.invalidate();
  }

  /** Save to file wrote the settings: the file holds them now, so nothing is held. */
  async saved(): Promise<void> {
    const held = Object.keys(this.surfaceOverrides).length > 0;
    this.file = this.settings;
    this.fileSurfaces = { ...this.surfaces };
    this.overrides = {};
    this.surfaceOverrides = {};
    await this.host?.storeSet(PANEL_SETTINGS_KEY, {}).catch(() => undefined);
    if (held) await this.host?.storeSet(SURFACES_KEY, {}).catch(() => undefined);
  }
}

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

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
 * The options menu (T-2B.4): each section's actions as buttons that run them, each labelled with
 * the key that also runs it, cut to the width so a narrow pane still fits it.
 */
export function drawMenu(
  ui: Surface["ui"],
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
 * Text row of its due date and label; then the ones with no due date, listed apart. A layout with
 * a row window says how many items are above and below it.
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
      layout.above === 0
        ? undefined
        : Box({
            key: "timeline-above",
            children: [
              Text({ dimColor: true, children: `${glyphOf("list.above")} ${layout.above} above` }),
            ],
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
      layout.below === 0
        ? undefined
        : Box({
            key: "timeline-below",
            children: [
              Text({ dimColor: true, children: `${glyphOf("list.below")} ${layout.below} below` }),
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
 * The Settings view (T-2B.8): the panel's rows from core's settings view, each view's surfaces,
 * then the band's own settings, then one Save to file that writes every table. Its fields and
 * lists draw through the element functions, so a surface with no Input or Select draws buttons.
 */
export function drawSettings(
  surface: Surface,
  view: SettingsView,
  options: {
    color: (token: Token) => string;
    problems: readonly string[];
    notice?: { text: string; token: Token };
    band?: RenderElement;
    handlers: SettingsHandlers;
  },
): RenderElement {
  const { Box, Text, Button } = surface.ui;
  const rows = view.rows.map((row) => {
    const control =
      row.kind === "number"
        ? field(surface, {
            key: row.key,
            value: row.value,
            submitLabel: "set",
            onSubmit: (value) => options.handlers.shown(value),
          })
        : choice(surface, {
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
