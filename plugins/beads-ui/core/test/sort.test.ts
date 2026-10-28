// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import { DEFAULT_SORT, parseSort, sortIssues } from "../src/index.ts";
import { allIssues, byId } from "./helpers.ts";

const ids = (issues: { id: string }[]) => issues.map((issue) => issue.id);

describe("sortIssues", () => {
  test("should order by priority then created date when given the default sort", () => {
    const sorted = sortIssues(allIssues(), DEFAULT_SORT);

    const keys = sorted.map((issue) => [issue.priority, Date.parse(issue.createdAt)] as const);
    for (let i = 1; i < keys.length; i++) {
      const [prevP, prevC] = keys[i - 1] as readonly [number, number];
      const [p, c] = keys[i] as readonly [number, number];
      expect(prevP < p || (prevP === p && prevC <= c)).toBe(true);
    }
    expect(sorted[0]?.id).toBe("BU-mg2");
    expect(ids(sorted.slice(-2))).toEqual(["BU-mg2.12", "BU-2zw"]);
  });

  test("should keep priority descending but break ties by oldest first when the direction is desc", () => {
    const sorted = sortIssues(allIssues(), { key: "priority", direction: "desc" });

    expect(ids(sorted.slice(0, 2))).toEqual(["BU-mg2.8", "BU-mg2.9"]);
    expect(sorted.at(-1)?.id).toBe("BU-mg2.3.10");
  });

  test("should order by updated date newest first when sorting updated descending", () => {
    const sorted = sortIssues(allIssues(), { key: "updated", direction: "desc" });

    expect(ids(sorted.slice(0, 3))).toEqual(["BU-2zw", "BU-mg2.3", "BU-mg2.3.10"]);
  });

  test("should keep input order for equal keys when sorting by assignee", () => {
    const input = allIssues();
    const sorted = sortIssues(input, { key: "assignee", direction: "asc" });

    const aih3 = input.filter((issue) => issue.assignee === "ops-3").map((issue) => issue.id);
    expect(ids(sorted.filter((issue) => issue.assignee === "ops-3"))).toEqual(aih3);
    expect(sorted[0]?.assignee).toBe("ops-3");
    expect(sorted.at(-1)?.assignee).toBeUndefined();
  });

  test("should put issues without a due date last in both directions when sorting by due", () => {
    const issues = allIssues();
    const dated = { ...byId(issues, "BU-mg2.9"), dueAt: "2026-11-01T00:00:00Z" };
    const later = { ...byId(issues, "BU-mg2.8"), dueAt: "2026-12-01T00:00:00Z" };
    const input = [byId(issues, "BU-mg2"), later, dated];

    expect(ids(sortIssues(input, { key: "due", direction: "asc" }))).toEqual([
      "BU-mg2.9",
      "BU-mg2.8",
      "BU-mg2",
    ]);
    expect(ids(sortIssues(input, { key: "due", direction: "desc" }))).toEqual([
      "BU-mg2.8",
      "BU-mg2.9",
      "BU-mg2",
    ]);
  });

  test("should sort an unparseable created date last when sorting by created", () => {
    const issues = allIssues();
    const broken = { ...byId(issues, "BU-mg2"), createdAt: "not a date" };

    const sorted = sortIssues([broken, byId(issues, "BU-mg2.3.1")], {
      key: "created",
      direction: "asc",
    });

    expect(ids(sorted)).toEqual(["BU-mg2.3.1", "BU-mg2"]);
  });

  test("should not reorder the caller's array when sorting", () => {
    const input = allIssues();
    const before = ids(input);

    sortIssues(input, { key: "created", direction: "desc" });

    expect(ids(input)).toEqual(before);
  });
});

describe("parseSort", () => {
  test("should read a key with an optional direction when given a persisted preference", () => {
    expect(parseSort("due")).toEqual({ ok: true, value: { key: "due", direction: "asc" } });
    expect(parseSort("created:desc")).toEqual({
      ok: true,
      value: { key: "created", direction: "desc" },
    });
  });

  test("should return the accepted keys when the key or direction is unknown", () => {
    for (const text of ["rank", "due:sideways", "due:asc:x"]) {
      expect(parseSort(text)).toEqual({
        ok: false,
        error: {
          kind: "unknown-sort",
          text,
          acceptedKeys: ["priority", "created", "updated", "due", "assignee"],
        },
      });
    }
  });
});
