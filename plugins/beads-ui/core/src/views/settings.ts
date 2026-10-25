// The Settings view (T-2B.8): the panel's shown count, its collapse rule, panel.mode, open at start, debug
// mode, each view's surfaces (D-35), and the band's parts, order and done window, as rows a
// surface draws as controls.

import type { BandSettings } from "./band.ts";
import {
  COLLAPSE_LABELS,
  COLLAPSE_RULES,
  MAX_SHOWN,
  PANEL_MODE_LABELS,
  PANEL_MODES,
  type PanelSettings,
} from "./panel.ts";
import { SURFACE_LABELS, SURFACE_SETTINGS, type SurfaceSetting } from "./surfaces.ts";
import { truncate } from "./text.ts";

export interface SettingOption {
  value: string;
  label: string;
}

export type SettingRow =
  | { key: string; label: string; kind: "number"; value: string; hint: string }
  | {
      key: string;
      label: string;
      kind: "choice";
      value: string;
      options: SettingOption[];
      hint: string;
    };

export interface SettingsView {
  rows: SettingRow[];
}

/** A view whose surfaces Settings sets (D-35): its id, its name and its setting now. */
export interface SurfaceRow {
  view: string;
  label: string;
  setting: SurfaceSetting;
}

/** The key of a view's surfaces row; the view's id follows it. */
export const SURFACE_ROW_PREFIX = "settings:surfaces:";

/** A row indicator Settings switches (D-41): its legend line and whether it is on. */
export interface IndicatorRow {
  id: string;
  glyph: string;
  ascii: string;
  label: string;
  on: boolean;
}

/** The key of an indicator's switch row; the indicator's id follows it. */
export const INDICATOR_ROW_PREFIX = "settings:indicator:";

/** Each option's label within `width` columns, its value first so a cut keeps it readable. */
const options = (
  values: readonly string[],
  names: Readonly<Record<string, string>>,
  width: number,
): SettingOption[] =>
  values.map((value) => ({ value, label: truncate(`${value}: ${names[value] ?? value}`, width) }));

/**
 * The rows at a width: `width` bounds every option label, so a `Select` and its label fit the
 * view. The band's parts and order are drawn by the band settings' own rows beside these.
 */
export function settingsView(
  panel: PanelSettings,
  band: BandSettings,
  width: number,
  surfaces: readonly SurfaceRow[] = [],
  indicators: readonly IndicatorRow[] = [],
): SettingsView {
  const room = Math.max(8, width);
  return {
    rows: [
      {
        key: "settings:shown",
        label: "Shown tasks",
        kind: "number",
        value: String(panel.shown),
        hint: `1 to ${MAX_SHOWN}; the rest collapse behind +N more`,
      },
      {
        key: "settings:collapse",
        label: "Collapse",
        kind: "choice",
        value: panel.collapse,
        options: options(COLLAPSE_RULES, COLLAPSE_LABELS, room),
        hint: "which tasks the shown count holds back",
      },
      {
        key: "settings:mode",
        label: "Panel mode",
        kind: "choice",
        value: panel.mode,
        options: options(PANEL_MODES, PANEL_MODE_LABELS, room),
        hint: "both and beads draw the Tasks view; native hides it",
      },
      {
        key: "settings:open-at-start",
        label: "Open at start",
        kind: "choice",
        value: panel.openAtStart ? "on" : "off",
        options: options(
          ["off", "on"],
          { off: "the pane opens only when asked", on: "the pane opens at session start" },
          room,
        ),
        hint: "on opens the pane by itself at session start and at each plugin reload",
      },
      {
        key: "settings:debug",
        label: "Debug mode",
        kind: "choice",
        value: band.debug ? "on" : "off",
        options: options(
          ["off", "on"],
          { off: "no read times", on: "the band shows when its counts were read" },
          room,
        ),
        hint: "the band's read time, to the second",
      },
      ...surfaces.map(
        (row): SettingRow => ({
          key: `${SURFACE_ROW_PREFIX}${row.view}`,
          label: `${row.label} view`,
          kind: "choice",
          value: row.setting,
          options: options(SURFACE_SETTINGS, SURFACE_LABELS, room),
          hint: "the surfaces this view draws on; [surfaces] in beads-ui.toml",
        }),
      ),
      ...indicators.map(
        (row): SettingRow => ({
          key: `${INDICATOR_ROW_PREFIX}${row.id}`,
          label: `${row.glyph} ${row.id}`,
          kind: "choice",
          value: row.on ? "on" : "off",
          options: options(
            ["on", "off"],
            { on: "drawn on every task row", off: "not drawn" },
            room,
          ),
          hint: `${row.label} (ASCII ${row.ascii}); [indicators] ${row.id} in beads-ui.toml`,
        }),
      ),
    ],
  };
}
