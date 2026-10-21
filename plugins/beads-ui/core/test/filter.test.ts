// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  applyFilter,
  describeFilterError,
  EMPTY_FILTER_STATE,
  type Filter,
  parseBdReady,
  parseFilter,
  submitFilter,
} from "../src/index.ts";
import ready from "./fixtures/bd-ready.json.ts";
import { allIssues, ids, unwrap } from "./helpers.ts";

const readyIds = new Set(ids(unwrap(parseBdReady(ready))));
const filterOf = (text: string): Filter => unwrap(parseFilter(text));
const keep = (text: string) => ids(unwrap(applyFilter(allIssues(), filterOf(text), { readyIds })));

describe("parseFilter", () => {
  test("should read whitespace-separated key:value terms when given a filter expression", () => {
    expect(parseFilter("  type:task   label:ui assignee:aih-3 sprint:s1 ready:true ")).toEqual({
      ok: true,
      value: {
        terms: [
          { key: "type", value: "task" },
          { key: "label", value: "ui" },
          { key: "assignee", value: "aih-3" },
          { key: "sprint", value: "s1" },
          { key: "ready", value: "true" },
        ],
      },
    });
  });

  test("should keep everything after the first colon as the value when the value has a colon", () => {
    expect(filterOf("label:id:BU-2zw").terms).toEqual([{ key: "label", value: "id:BU-2zw" }]);
  });

  test("should return the accepted keys when a term uses an unknown key", () => {
    expect(parseFilter("type:task status:open")).toEqual({
      ok: false,
      error: {
        kind: "unknown-key",
        key: "status",
        acceptedKeys: ["type", "label", "assignee", "sprint", "ready"],
      },
    });
  });

  test("should return a malformed-term error when a term has no key", () => {
    const result = parseFilter("urgent");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe("malformed-term");
  });

  test("should refuse an empty value or a ready value other than true or false", () => {
    for (const text of ["type:", "ready:yes"]) {
      const result = parseFilter(text);
      expect(!result.ok && result.error.kind).toBe("invalid-value");
    }
  });
});

describe("applyFilter", () => {
  test("should AND type and assignee terms when both are given", () => {
    expect(keep("type:task assignee:aih-3")).toEqual([
      "BU-mg2.13",
      "BU-mg2.1.3",
      "BU-mg2.1.2",
      "BU-mg2.1.1",
      "BU-mg2.1",
    ]);
  });

  test("should match a label exactly when filtering by label", () => {
    expect(keep("label:id:BU-npm-audit-10-dev-only-advisories-2zw")).toEqual(["BU-2zw"]);
    expect(keep("label:id:BU")).toEqual([]);
  });

  test("should match the sprint:<name> label when filtering by sprint", () => {
    const issues = allIssues().map((issue) =>
      issue.id === "BU-mg2.3.5" ? { ...issue, labels: [...issue.labels, "sprint:s1"] } : issue,
    );

    expect(ids(unwrap(applyFilter(issues, filterOf("sprint:s1"))))).toEqual(["BU-mg2.3.5"]);
  });

  test("should keep only issues bd ready returned when filtering ready:true", () => {
    const kept = keep("ready:true");

    expect(kept).toHaveLength(20);
    expect(kept).toContain("BU-2zw");
    expect(kept).not.toContain("BU-mg2.3");
  });

  test("should keep only issues bd ready did not return when filtering ready:false", () => {
    expect(keep("ready:false")).toHaveLength(10);
  });

  test("should refuse a ready term when the surface supplied no ready set", () => {
    const result = applyFilter(allIssues(), filterOf("ready:true"));

    expect(!result.ok && result.error.kind).toBe("ready-set-missing");
  });
});

describe("submitFilter", () => {
  test("should apply the new filter when the text parses", () => {
    const state = submitFilter(EMPTY_FILTER_STATE, "type:bug");

    expect(state).toEqual({ text: "type:bug", filter: { terms: [{ key: "type", value: "bug" }] } });
  });

  test("should keep the previous filter and show the accepted keys when a key is unknown", () => {
    const before = submitFilter(EMPTY_FILTER_STATE, "type:bug");

    const after = submitFilter(before, "type:task priority:1");

    expect(after.filter).toEqual(before.filter);
    expect(after.text).toBe("type:task priority:1");
    expect(after.error && describeFilterError(after.error)).toBe(
      'unknown filter key "priority"; accepted keys: type, label, assignee, sprint, ready',
    );
  });
});
