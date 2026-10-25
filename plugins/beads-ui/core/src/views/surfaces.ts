// Which surface draws each view (D-35, T-2C.1): every view is registered once and drawn on the
// band and the pane unless its entry, `[surfaces]` in beads-ui.toml or Settings limits it to one.

import type { NavEntry } from "./nav.ts";

/** The two terminal surfaces a view draws on: the band above the prompt and the pane. */
export const SURFACE_IDS = ["band", "pane"] as const;
export type SurfaceId = (typeof SURFACE_IDS)[number];

/** A view's surfaces: both (the default), or one of them alone. */
export const SURFACE_SETTINGS = ["both", "band", "pane"] as const;
export type SurfaceSetting = (typeof SURFACE_SETTINGS)[number];

export const SURFACE_LABELS: Readonly<Record<SurfaceSetting, string>> = {
  both: "the band and the pane",
  band: "the band only",
  pane: "the pane only",
};

/** `[surfaces]` and the Settings changes over it: one setting per view id. */
export type SurfaceOverrides = Readonly<Record<string, SurfaceSetting>>;

export const isSurfaceSetting = (value: unknown): value is SurfaceSetting =>
  typeof value === "string" && (SURFACE_SETTINGS as readonly string[]).includes(value);

/** A view's setting: the override for its id, else its entry's own, else both. */
export const surfaceOf = (entry: NavEntry, overrides: SurfaceOverrides): SurfaceSetting =>
  overrides[entry.view] ?? entry.surfaces ?? "both";

export const drawsOn = (setting: SurfaceSetting, surface: SurfaceId): boolean =>
  setting === "both" || setting === surface;

/** The entries `surface` draws, in their order. */
export const entriesOn = <E extends NavEntry>(
  entries: readonly E[],
  surface: SurfaceId,
  overrides: SurfaceOverrides,
): E[] => entries.filter((entry) => drawsOn(surfaceOf(entry, overrides), surface));

/** Reads the stored Settings changes, dropping any value that is not a surface setting. */
export function surfaceOverridesOf(value: unknown): Record<string, SurfaceSetting> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, SurfaceSetting> = {};
  for (const [view, setting] of Object.entries(value as Record<string, unknown>)) {
    if (isSurfaceSetting(setting)) out[view] = setting;
  }
  return out;
}
