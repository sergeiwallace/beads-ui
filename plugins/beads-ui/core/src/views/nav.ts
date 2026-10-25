// The task panel's nav (T-2B.1, D-31): which views it leads to, and how it is drawn at a width
// and height. A side nav from 72 columns, a top bar of short labels from 48, a bar of keys and
// glyphs below that; above the prompt or under 12 rows the side nav becomes the top bar.

import { commandById } from "../commands.ts";
import { glyphOf } from "../glyphs.ts";
import {
  buttonWidth,
  isShort,
  type Labels,
  labels,
  packRows,
  type Tier,
  tierOf,
} from "../layout.ts";
import type { SurfaceSetting } from "./surfaces.ts";

export const PANEL_VIEWS = [
  "tasks",
  "board",
  "backlog",
  "sprint",
  "detail",
  "timeline",
  "settings",
] as const;
export type PanelView = (typeof PANEL_VIEWS)[number];

/** A view the nav leads to that is not built yet: pressing it says so and stays put. */
export type PlannedView = "sprint";

export interface NavEntry {
  /** A PanelView for the built-in views; any id for a view registered later (D-35). */
  view: string;
  /** The COMMANDS id whose hotkey presses it. */
  command: string;
  labels: Labels;
  /** One column wide, drawn after its key when the pane is narrow. */
  glyph: string;
  planned: boolean;
  /** The surfaces the view draws on (D-35); both when not named. */
  surfaces?: SurfaceSetting;
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  {
    view: "tasks",
    command: "tab.tasks",
    labels: labels("Tasks"),
    glyph: glyphOf("view.tasks"),
    planned: false,
  },
  {
    view: "board",
    command: "tab.board",
    labels: labels("Board"),
    glyph: glyphOf("view.board"),
    planned: false,
  },
  {
    view: "backlog",
    command: "tab.backlog",
    labels: labels("Backlog", "Bklg"),
    glyph: glyphOf("view.backlog"),
    planned: false,
  },
  {
    view: "sprint",
    command: "tab.sprint",
    labels: labels("Sprint", "Spr"),
    glyph: glyphOf("view.sprint"),
    planned: true,
  },
  {
    view: "detail",
    command: "tab.detail",
    labels: labels("Detail", "Dtl"),
    glyph: glyphOf("view.detail"),
    planned: false,
  },
  {
    view: "timeline",
    command: "tab.timeline",
    labels: labels("Timeline", "Time"),
    glyph: glyphOf("view.timeline"),
    planned: false,
  },
  {
    view: "settings",
    command: "tab.settings",
    labels: labels("Settings", "Set"),
    glyph: glyphOf("view.settings"),
    planned: false,
  },
];

/** The nav's entries; `hideTasks` leaves out Tasks, as `panel.mode = native` does (T-2B.7). */
export const navEntries = (hideTasks = false): readonly NavEntry[] =>
  hideTasks ? NAV_ENTRIES.filter((entry) => entry.view !== "tasks") : NAV_ENTRIES;

export const isPanelView = (value: unknown): value is PanelView =>
  typeof value === "string" && (PANEL_VIEWS as readonly string[]).includes(value);

const NAMES: Readonly<Record<PlannedView, string>> = { sprint: "Sprint" };

/** D-28 and T-2B.1: what a press on a planned view says; the view does not change. */
export function plannedText(view: PlannedView): string {
  const key = hotkeyOf(NAV_ENTRIES.find((entry) => entry.view === view)?.command ?? "");
  return `${key} ${NAMES[view]}: the ${NAMES[view]} view is planned and not built yet; staying on this view`;
}

export function hotkeyOf(command: string): string {
  const binding = commandById(command)?.binding;
  return binding?.kind === "hotkey" ? binding.key : "";
}

/** `side` beside the view, `top` a bar of short labels above it, `glyph` a bar of keys and glyphs. */
export type NavKind = "side" | "top" | "glyph";

/** The side nav's width, its border included: the widest entry, `6: Settings`, and the frame. */
export const SIDE_NAV_COLUMNS = 13;
/** Columns between the side nav and the view beside it. */
export const SIDE_NAV_GAP = 1;

export function navKind(columns: number, placement: string, bodyRows?: number): NavKind {
  const tier = tierOf(columns);
  if (tier === "narrow") return "glyph";
  if (tier === "medium" || isShort(placement, bodyRows)) return "top";
  return "side";
}

export interface NavItem {
  view: string;
  key: string;
  label: string;
  hotkey: string;
  width: number;
  planned: boolean;
  active: boolean;
}

export interface NavLayout {
  kind: NavKind;
  /** The tier the view beside or below the nav is drawn in. */
  tier: Tier;
  /** The columns the view gets: the body less the side nav, or the whole body. */
  viewColumns: number;
  items: NavItem[];
  /** The bar's rows, each within the body's width; one entry a row for the side nav. */
  rows: NavItem[][];
  gap: number;
}

/**
 * The nav in a body `columns` wide, with `active` the view now drawn. `bodyColumns`, the pane's
 * own width when the surface draws a column narrower than it, picks the tier T-2B.1 names.
 * `entries` are the views the surface draws, from the view registry (D-35).
 */
export function navLayout(
  columns: number,
  placement: string,
  bodyRows: number | undefined,
  active: string,
  bodyColumns: number = columns,
  entries: readonly NavEntry[] = NAV_ENTRIES,
): NavLayout {
  const kind = navKind(bodyColumns, placement, bodyRows);
  const items = entries.map((entry): NavItem => {
    const label =
      kind === "side" ? entry.labels.wide : kind === "top" ? entry.labels.medium : entry.glyph;
    const hotkey = hotkeyOf(entry.command);
    return {
      view: entry.view,
      key: `tab:${entry.view}`,
      label,
      hotkey,
      width: buttonWidth(label, hotkey),
      planned: entry.planned,
      active: entry.view === active,
    };
  });
  if (kind === "side") {
    const viewColumns = Math.max(1, columns - SIDE_NAV_COLUMNS - SIDE_NAV_GAP);
    return {
      kind,
      tier: tierOf(viewColumns),
      viewColumns,
      items,
      rows: items.map((item) => [item]),
      gap: 0,
    };
  }
  const gap = kind === "glyph" ? 1 : 2;
  return {
    kind,
    tier: tierOf(columns),
    viewColumns: columns,
    items,
    rows: packRows(items, columns, gap),
    gap,
  };
}
