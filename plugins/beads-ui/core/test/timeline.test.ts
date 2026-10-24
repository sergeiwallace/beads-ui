// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  barCells,
  DUE_COLUMNS,
  type Issue,
  RASTER_COLORS,
  RASTER_DEFAULT_COLOR,
  timelineLayout,
  timelineView,
} from "../src/index.ts";
import { storeStatuses } from "./helpers.ts";

// T-2B.9: the Timeline's view model. The pane draws it as Raster bars in the terminal and Text
// rows elsewhere; hooks/timeline.test.ts drives that through the pane.

const issue = (id: string, fields: Partial<Issue> = {}): Issue => ({
  id,
  title: `title of ${id}`,
  status: "open",
  priority: 2,
  type: "epic",
  labels: [],
  dependencies: [],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  metadata: {},
  ...fields,
});

const STORE: Issue[] = [
  issue("BU-a", { displayId: "BU-alpha-epic", dueAt: "2026-12-01T00:00:00Z" }),
  issue("BU-b", { type: "milestone", title: "Sprint 7", dueAt: "2026-11-01T00:00:00Z" }),
  issue("BU-c", { status: "in_progress", dueAt: "2026-11-16T00:00:00Z" }),
  issue("BU-d", { type: "task", dueAt: "2026-11-05T00:00:00Z" }),
  issue("BU-e", { displayId: "BU-no-date-epic" }),
  issue("BU-f", { type: "milestone", dueAt: "not a date" }),
];

const decode = (cells: string): number[][] => {
  const bytes = Uint8Array.from(atob(cells), (char) => char.charCodeAt(0));
  const words = new DataView(bytes.buffer);
  return Array.from({ length: bytes.length / 12 }, (_, i) => [
    words.getUint32(i * 12, true),
    words.getUint32(i * 12 + 4, true),
    words.getUint32(i * 12 + 8, true),
  ]);
};

describe("the Timeline view model (T-2B.9)", () => {
  test("should place the store's epics and milestone issues by due date and leave other types out", () => {
    const view = timelineView(STORE, { statuses: storeStatuses() });

    expect(view.items.map((item) => [item.id, item.due])).toEqual([
      ["BU-b", "2026-11-01"],
      ["BU-c", "2026-11-16"],
      ["BU-a", "2026-12-01"],
    ]);
    expect(view.items.map((item) => item.label)).toEqual([
      "Sprint 7",
      "title of BU-c",
      "BU-alpha-epic",
    ]);
    expect(view.items.map((item) => item.token)).toEqual([
      "status.active",
      "status.wip",
      "status.active",
    ]);
  });

  test("should list an epic or milestone with no due date, or one bd cannot read as a date, apart", () => {
    const view = timelineView(STORE, { statuses: storeStatuses() });

    expect(view.undated.map((entry) => [entry.id, entry.label])).toEqual([
      ["BU-e", "BU-no-date-epic"],
      ["BU-f", "title of BU-f"],
    ]);
  });

  test("should run the axis from the earliest to the latest due date when today is past the earliest", () => {
    const view = timelineView(STORE, { statuses: storeStatuses(), today: "2026-11-10T09:00:00" });

    expect(view.axis).toEqual({ start: "2026-11-01", end: "2026-12-01" });
    expect(view.items.map((item) => item.position)).toEqual([0, 0.5, 1]);
  });

  test("should run the axis from today to the latest due date when every due date is later", () => {
    const view = timelineView(STORE, { statuses: storeStatuses(), today: "2026-10-02T09:00:00" });

    expect(view.axis).toEqual({ start: "2026-10-02", end: "2026-12-01" });
    expect(view.items[0]?.position).toBe(0.5);
  });

  test("should draw no axis and list every epic apart when none has a due date", () => {
    const undated = STORE.map(({ dueAt: _due, ...rest }) => rest);
    const view = timelineView(undated, { statuses: storeStatuses() });
    const layout = timelineLayout(view, 64);

    expect(view.items).toEqual([]);
    expect(view.axis).toBeUndefined();
    expect(view.undated).toHaveLength(5);
    expect(layout.axisLine).toBe("");
    expect(layout.emptyLine).toBe(
      "No epic or milestone has a due date: set one with its Due field.",
    );
    expect(layout.undatedHeading).toBe("No due date (5)");
  });

  test("should say the store holds no epic or milestone when it has none", () => {
    const layout = timelineLayout(timelineView([], { statuses: storeStatuses() }), 64);

    expect(layout.emptyLine).toBe("The store holds no epic or milestone.");
    expect(layout.summary).toBe("0 epics and milestones: 0 with a due date, 0 without");
  });
});

describe("the Timeline's layout at each width (T-2B.9, R-24)", () => {
  const long = [
    ...STORE,
    issue("BU-g", {
      displayId: "BU-a-display-id-long-enough-to-pass-every-width-the-pane-draws-at-all",
      dueAt: "2026-11-20T00:00:00Z",
    }),
  ];
  const view = timelineView(long, { statuses: storeStatuses(), today: "2026-11-01" });

  for (const width of [40, 48, 64, 72, 80, 120]) {
    test(`should fit every line, label and bar within ${width} columns`, () => {
      const layout = timelineLayout(view, width);
      const len = (text: string) => [...text].length;

      for (const row of layout.rows) {
        const used =
          layout.placement === "beside"
            ? layout.labelColumns + 1 + row.columns + 1 + DUE_COLUMNS
            : Math.max(len(row.label), row.columns + 1 + DUE_COLUMNS);
        expect(used).toBeLessThanOrEqual(width);
        expect(len(row.label)).toBeLessThanOrEqual(layout.labelColumns);
        expect(len(row.line)).toBeLessThanOrEqual(width);
        expect(row.filled).toBeGreaterThanOrEqual(1);
        expect(row.filled).toBeLessThanOrEqual(row.columns);
      }
      for (const text of [layout.summary, layout.axisLine, layout.undatedHeading]) {
        expect(len(text)).toBeLessThanOrEqual(width);
      }
      for (const entry of layout.undated) expect(len(entry.label)).toBeLessThanOrEqual(width);
    });
  }

  test("should put each label beside its bar from 72 columns and above it below that", () => {
    expect(timelineLayout(view, 72).placement).toBe("beside");
    expect(timelineLayout(view, 71).placement).toBe("above");
    expect(timelineLayout(view, 40).placement).toBe("above");
  });

  test("should run the bar from the axis start to the due date", () => {
    const layout = timelineLayout(view, 64);
    const first = layout.rows[0];
    const last = layout.rows[layout.rows.length - 1];

    expect(first?.filled).toBe(1);
    expect(last?.filled).toBe(last?.columns);
  });
});

describe("a bar's Raster cells (T-2B.9)", () => {
  test("should colour the filled cells by status category and draw the rest as the track", () => {
    const cells = decode(barCells(5, 2, RASTER_COLORS.wip));

    expect(cells).toEqual([
      [0x20, RASTER_DEFAULT_COLOR, RASTER_COLORS.wip],
      [0x20, RASTER_DEFAULT_COLOR, RASTER_COLORS.wip],
      [0x2e, 0x585858, RASTER_DEFAULT_COLOR],
      [0x2e, 0x585858, RASTER_DEFAULT_COLOR],
      [0x2e, 0x585858, RASTER_DEFAULT_COLOR],
    ]);
  });

  test("should encode columns times 12 bytes as padded standard base64", () => {
    for (const columns of [1, 2, 3, 47]) {
      const cells = barCells(columns, 1, RASTER_COLORS.done);
      expect(cells.length).toBe(Math.ceil((columns * 12) / 3) * 4);
      expect(atob(cells).length).toBe(columns * 12);
    }
  });
});
