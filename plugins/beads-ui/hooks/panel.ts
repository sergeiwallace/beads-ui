import {
  DEFAULT_PANEL_SETTINGS,
  type PanelOverrides,
  type PanelSettings,
  panelOverridesOf,
  resolveGlyphs,
  resolvePanel,
  resolveSurfaces,
  type SurfaceOverrides,
  type SurfaceSetting,
  surfaceOverridesOf,
  withPanelOverrides,
} from "../core/src/index.ts";
import type { Host } from "./host.ts";

// The task panel's settings state (T-2B.2, T-2B.8, D-35). Every view the panel draws is a view
// registry entry drawn through the components in ./components on the band and the pane (T-2C.8);
// the names re-exported here are the task list's.

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

/** Where the pane keeps the indicator switches changed in Settings until Save to file (D-41). */
export const INDICATORS_KEY = "indicator-switches";

/** Reads the stored switch changes, dropping any value that is not true or false. */
function switchesOf(value: unknown): Record<string, boolean> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [id, on] of Object.entries(value as Record<string, unknown>)) {
    if (typeof on === "boolean") out[id] = on;
  }
  return out;
}

/**
 * The task panel's settings (T-2B.2, T-2B.8): `beads-ui.toml`'s `[panel]` table, and the views'
 * surfaces from its `[surfaces]` table (D-35), read at call time, with the changes made in
 * Settings over them, kept in `$.store` until Save to file.
 */
export class PanelSettingsState {
  host: Host | undefined;
  overrides: PanelOverrides = {};
  surfaceOverrides: Record<string, SurfaceSetting> = {};
  indicatorOverrides: Record<string, boolean> = {};
  problems: string[] = [];
  /** Whether the last read found a beads-ui.toml; Settings shows the defaults when not. */
  fromFile = false;
  private file: PanelSettings = { ...DEFAULT_PANEL_SETTINGS };
  private fileSurfaces: Record<string, SurfaceSetting> = {};
  private fileIndicators: Record<string, boolean> = {};
  /** `[indicators] ascii` as the file has it, kept when Save to file writes the table. */
  private fileAscii = false;

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

  /** Each indicator's switch: `[indicators]` under the ones changed in Settings (D-41). */
  get indicators(): Record<string, boolean> {
    return { ...this.fileIndicators, ...this.indicatorOverrides };
  }

  /** `[indicators] ascii` as the file has it. */
  get ascii(): boolean {
    return this.fileAscii;
  }

  /**
   * Reads the file's `[panel]`, `[surfaces]` and `[indicators]` tables and the held changes, as
   * each refresh does. `[indicators]`' problems are the look's, which the pane names once.
   */
  async read(text: string | undefined): Promise<void> {
    const resolved = resolvePanel(text);
    const surfaces = resolveSurfaces(text);
    const glyphs = resolveGlyphs(text);
    this.file = resolved.settings;
    this.fileSurfaces = surfaces.settings;
    this.fileIndicators = glyphs.switches;
    this.fileAscii = glyphs.ascii;
    this.problems = [...resolved.problems, ...surfaces.problems];
    this.fromFile = text !== undefined;
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.overrides = panelOverridesOf(
      await this.host?.storeGet(PANEL_SETTINGS_KEY).catch(() => undefined),
    );
    this.surfaceOverrides = surfaceOverridesOf(
      await this.host?.storeGet(SURFACES_KEY).catch(() => undefined),
    );
    this.indicatorOverrides = switchesOf(
      await this.host?.storeGet(INDICATORS_KEY).catch(() => undefined),
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

  /** Settings switched an indicator on or off (D-41): drawn so from the next redraw. */
  async changeIndicator(id: string, on: boolean): Promise<void> {
    this.indicatorOverrides = { ...this.indicatorOverrides, [id]: on };
    await this.host?.storeSet(INDICATORS_KEY, this.indicatorOverrides).catch(() => undefined);
    this.host?.invalidate();
  }

  /** Save to file wrote the settings: the file holds them now, so nothing is held. */
  async saved(): Promise<void> {
    const held = Object.keys(this.surfaceOverrides).length > 0;
    const switched = Object.keys(this.indicatorOverrides).length > 0;
    this.file = this.settings;
    this.fileSurfaces = { ...this.surfaces };
    this.fileIndicators = this.indicators;
    this.overrides = {};
    this.surfaceOverrides = {};
    this.indicatorOverrides = {};
    await this.host?.storeSet(PANEL_SETTINGS_KEY, {}).catch(() => undefined);
    if (held) await this.host?.storeSet(SURFACES_KEY, {}).catch(() => undefined);
    if (switched) await this.host?.storeSet(INDICATORS_KEY, {}).catch(() => undefined);
  }
}
