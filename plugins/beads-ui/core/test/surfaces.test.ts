// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  type ActionContext,
  DEFAULT_BAND_SETTINGS,
  DEFAULT_PANEL_SETTINGS,
  entriesOn,
  labels,
  menuView,
  NAV_ENTRIES,
  type NavEntry,
  navLayout,
  panelActions,
  resolveSurfaces,
  settingsView,
  surfaceOf,
  surfaceOverridesOf,
  withSurfacesTable,
} from "../src/index.ts";

// D-35 and T-2C.1: which surface draws each view, from the entry, `[surfaces]` and Settings.

const PROBE: NavEntry = {
  view: "probe",
  command: "tab.probe",
  labels: labels("Probe"),
  glyph: "*",
  planned: false,
};
const views = (entries: readonly NavEntry[]) => entries.map((entry) => entry.view);

describe("a view's surfaces", () => {
  test("should draw every view on both surfaces when nothing names its surfaces", () => {
    const all = [...NAV_ENTRIES, PROBE];

    expect(views(entriesOn(all, "band", {}))).toEqual(views(all));
    expect(views(entriesOn(all, "pane", {}))).toEqual(views(all));
    expect(surfaceOf(PROBE, {})).toBe("both");
  });

  test("should draw a view on one surface when its entry or an override names it, the override first", () => {
    const paneOnly = { ...PROBE, surfaces: "pane" as const };

    expect(views(entriesOn([paneOnly], "band", {}))).toEqual([]);
    expect(views(entriesOn([paneOnly], "pane", {}))).toEqual(["probe"]);
    expect(views(entriesOn([paneOnly], "band", { probe: "both" }))).toEqual(["probe"]);
    expect(views(entriesOn(NAV_ENTRIES, "pane", { timeline: "band" }))).not.toContain("timeline");
    expect(views(entriesOn(NAV_ENTRIES, "band", { timeline: "band" }))).toContain("timeline");
  });

  test("should keep only surface settings from what Settings stored", () => {
    expect(surfaceOverridesOf({ timeline: "band", board: "sideways", tasks: 3 })).toEqual({
      timeline: "band",
    });
    expect(surfaceOverridesOf(["band"])).toEqual({});
    expect(surfaceOverridesOf(undefined)).toEqual({});
  });
});

describe("[surfaces] in beads-ui.toml", () => {
  test("should read one setting per view and name a value it cannot use", () => {
    const resolved = resolveSurfaces(
      '[surfaces]\ntimeline = "band"\nboard = "pane"\ntasks = "both"\nbacklog = "nowhere"\n',
    );

    expect(resolved.settings).toEqual({ timeline: "band", board: "pane", tasks: "both" });
    expect(resolved.problems).toEqual([
      'surfaces.backlog "nowhere" is not one of both, band, pane; using both',
    ]);
  });

  test("should read nothing with no file, no table, or a table that is a value", () => {
    expect(resolveSurfaces(undefined)).toEqual({ settings: {}, problems: [] });
    expect(resolveSurfaces("[panel]\nshown = 5\n")).toEqual({ settings: {}, problems: [] });
    expect(resolveSurfaces('surfaces = "band"\n').problems).toEqual([
      "surfaces must be a table; every view draws on both surfaces",
    ]);
  });

  test("should write the table with every other line kept, and leave a file with no settings and no table as it was", () => {
    const text = "[panel]\nshown = 5\n\n[band]\ndebug = true\n";

    expect(withSurfacesTable(text, {})).toBe(text);
    const written = withSurfacesTable(text, { timeline: "band", board: "pane" });
    expect(written).toBe(
      '[panel]\nshown = 5\n\n[band]\ndebug = true\n\n[surfaces]\ntimeline = "band"\nboard = "pane"\n',
    );
    expect(resolveSurfaces(written).settings).toEqual({ timeline: "band", board: "pane" });
    expect(withSurfacesTable(written, { timeline: "both" })).toBe(
      '[panel]\nshown = 5\n\n[band]\ndebug = true\n\n[surfaces]\ntimeline = "both"\n',
    );
  });
});

describe("a registered view in the nav, the menu and Settings", () => {
  const CTX: ActionContext = {
    view: "probe",
    mine: false,
    swimlane: "none",
    sort: "priority",
    undo: false,
    paged: false,
    lanesPaged: false,
    bandSettings: true,
    nav: [...NAV_ENTRIES, PROBE],
  };

  test("should lay out the nav from the entries it is handed", () => {
    const nav = navLayout(120, "dock", 28, "probe", 120, [...NAV_ENTRIES, PROBE]);

    expect(nav.items.map((item) => item.key)).toContain("tab:probe");
    expect(nav.items.find((item) => item.view === "probe")?.active).toBe(true);
    expect(navLayout(120, "dock", 28, "tasks").items.map((item) => item.view)).toEqual(
      views(NAV_ENTRIES),
    );
  });

  test("should list the nav's views in the menu's Go to, and offer a registered view the menu and help", () => {
    const goTo = menuView(CTX).sections.find((section) => section.key === "menu:nav");

    expect(goTo?.items.map((item) => item.command)).toContain("tab.probe");
    expect(panelActions(CTX).map((action) => action.command)).toEqual(["panel.menu", "help"]);
  });

  test("should draw a surfaces row for each view it is handed, after the panel's rows", () => {
    const view = settingsView(DEFAULT_PANEL_SETTINGS, DEFAULT_BAND_SETTINGS, 60, [
      { view: "timeline", label: "Timeline", setting: "band" },
    ]);
    const row = view.rows.at(-1);

    expect(row).toMatchObject({
      key: "settings:surfaces:timeline",
      label: "Timeline view",
      kind: "choice",
      value: "band",
    });
    expect(row?.kind === "choice" ? row.options.map((option) => option.value) : []).toEqual([
      "both",
      "band",
      "pane",
    ]);
    expect(settingsView(DEFAULT_PANEL_SETTINGS, DEFAULT_BAND_SETTINGS, 60).rows.length).toBe(
      view.rows.length - 1,
    );
  });
});
