// The Settings view (T-2B.8): the panel's shown count, its collapse rule and panel.mode, debug
// mode, and the band's parts, order and done window, as rows a surface draws as controls.

import type { BandSettings } from "./band.ts";
import {
  COLLAPSE_LABELS,
  COLLAPSE_RULES,
  MAX_SHOWN,
  PANEL_MODE_LABELS,
  PANEL_MODES,
  type PanelSettings,
} from "./panel.ts";
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
        hint: "kept now; a later release opens the panel by it",
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
    ],
  };
}
