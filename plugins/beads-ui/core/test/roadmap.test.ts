// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import { type Issue, roadmapView } from "../src/index.ts";
import { storeStatuses } from "./helpers.ts";

// T-3.2: "When the Roadmap renders, the system shall place epics and milestones by due date and
// shall draw blocks and parent-child dependencies as lines." The web app draws this model with
// Frappe Gantt; apps/web/e2e/roadmap.spec.ts drives it through the page.

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

const statuses = storeStatuses();

describe("the Roadmap view model (T-3.2)", () => {
  test("should place epics and milestones by due date as bars and leave other types out", () => {
    const view = roadmapView(
      [
        issue("BU-a", { displayId: "BU-alpha", dueAt: "2026-12-01T00:00:00Z" }),
        issue("BU-b", { type: "milestone", title: "Launch", dueAt: "2026-11-01T00:00:00Z" }),
        issue("BU-c", { type: "task", dueAt: "2026-11-05T00:00:00Z" }),
        issue("BU-d", { title: "No date" }),
      ],
      { statuses },
    );

    expect(view.bars.map((bar) => [bar.id, bar.label, bar.start, bar.due])).toEqual([
      ["BU-b", "BU-b", "2026-10-01", "2026-11-01"],
      ["BU-a", "BU-alpha", "2026-10-01", "2026-12-01"],
    ]);
    expect(view.undated.map((item) => item.id)).toEqual(["BU-d"]);
    expect(view.axis).toEqual({ start: "2026-11-01", end: "2026-12-01" });
  });

  test("should draw a line for each blocks and parent-child dependency between two bars", () => {
    const view = roadmapView(
      [
        issue("BU-a", { dueAt: "2026-11-10T00:00:00Z" }),
        issue("BU-b", {
          dueAt: "2026-11-20T00:00:00Z",
          dependencies: [{ type: "blocks", id: "BU-a" }],
        }),
        // A sub-epic: bd list records the parent both as a dependency and as `parent`; one line.
        issue("BU-c", {
          dueAt: "2026-11-30T00:00:00Z",
          parent: "BU-b",
          dependencies: [
            { type: "parent-child", id: "BU-b" },
            { type: "related", id: "BU-a" },
          ],
        }),
        // The parent as a dependency alone, and as `parent` alone: one line each.
        issue("BU-e", {
          dueAt: "2026-12-01T00:00:00Z",
          dependencies: [{ type: "parent-child", id: "BU-a" }],
        }),
        issue("BU-f", { dueAt: "2026-12-02T00:00:00Z", parent: "BU-a" }),
        // A task blocking an epic is not on the Roadmap, so it draws no line.
        issue("BU-t", { type: "task" }),
        issue("BU-d", {
          type: "milestone",
          dueAt: "2026-12-05T00:00:00Z",
          dependencies: [{ type: "blocks", id: "BU-t" }],
        }),
      ],
      { statuses },
    );

    expect(view.links).toEqual([
      { from: "BU-a", to: "BU-b", kind: "blocks" },
      { from: "BU-b", to: "BU-c", kind: "parent-child" },
      { from: "BU-a", to: "BU-e", kind: "parent-child" },
      { from: "BU-a", to: "BU-f", kind: "parent-child" },
    ]);
    const into = Object.fromEntries(view.bars.map((bar) => [bar.id, bar.dependsOn]));
    expect(into).toEqual({
      "BU-a": [],
      "BU-b": ["BU-a"],
      "BU-c": ["BU-b"],
      "BU-e": ["BU-a"],
      "BU-f": ["BU-a"],
      "BU-d": [],
    });
    expect(view.unplacedLinks).toBe(0);
  });

  test("should count a dependency on an epic with no due date as unplaced and draw no line for it", () => {
    const view = roadmapView(
      [
        issue("BU-a"),
        issue("BU-b", {
          dueAt: "2026-11-20T00:00:00Z",
          dependencies: [{ type: "blocks", id: "BU-a" }],
        }),
      ],
      { statuses },
    );

    expect(view.links).toEqual([]);
    expect(view.unplacedLinks).toBe(1);
    expect(view.bars[0]?.dependsOn).toEqual([]);
  });

  test("should start a sprint milestone's bar on its sprint start and fill it by its members done", () => {
    const view = roadmapView(
      [
        issue("BU-s", {
          type: "milestone",
          title: "Sprint 7",
          dueAt: "2026-11-14T00:00:00Z",
          metadata: { "sprint.starts_at": "2026-11-03" },
        }),
        issue("BU-1", { type: "task", labels: ["sprint:7"], status: "closed" }),
        issue("BU-2", { type: "task", labels: ["sprint:7"] }),
        issue("BU-3", { type: "task", labels: ["sprint:7"], status: "in_progress" }),
        issue("BU-4", { type: "task", labels: ["sprint:7"], status: "closed" }),
        issue("BU-e", { dueAt: "2026-12-01T00:00:00Z", startedAt: "2026-10-20T08:00:00Z" }),
        issue("BU-e1", { type: "task", parent: "BU-e", status: "closed" }),
        issue("BU-e2", { type: "task", parent: "BU-e" }),
        issue("BU-e3", { type: "task", parent: "BU-e" }),
      ],
      { statuses },
    );

    expect(view.bars.map((bar) => [bar.id, bar.start, bar.progress])).toEqual([
      ["BU-s", "2026-11-03", 50],
      ["BU-e", "2026-10-20", 33],
    ]);
  });

  test("should end a bar on its due date when it started after it, and fill a done epic", () => {
    const view = roadmapView(
      [
        issue("BU-a", {
          status: "closed",
          dueAt: "2026-10-15T00:00:00Z",
          startedAt: "2026-10-20T00:00:00Z",
        }),
      ],
      { statuses },
    );

    expect(view.bars.map((bar) => [bar.start, bar.due, bar.category, bar.progress])).toEqual([
      ["2026-10-15", "2026-10-15", "done", 100],
    ]);
  });
});
