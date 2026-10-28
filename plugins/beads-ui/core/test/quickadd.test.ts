// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import { createArgv, parseQuickAdd } from "../src/index.ts";
import { unwrap } from "./helpers.ts";

describe("parseQuickAdd", () => {
  test("should parse every token and keep the rest as the title when given a full line", () => {
    const parsed = parseQuickAdd(
      "Fix  board p1 type:bug @ops-3 refresh +ui due:2026-11-02 sprint:s1 +ui on resize",
    );

    expect(parsed).toEqual({
      ok: true,
      value: {
        title: "Fix board refresh on resize",
        priority: 1,
        type: "bug",
        assignee: "ops-3",
        labels: ["ui", "sprint:s1"],
        due: "2026-11-02",
        sprint: "s1",
      },
    });
  });

  test("should treat p5 and a bare word as title words when they are not tokens", () => {
    expect(unwrap(parseQuickAdd("p5 rollout plan")).title).toBe("p5 rollout plan");
  });

  test("should return an empty-title error when the line holds only tokens", () => {
    expect(parseQuickAdd("p0 +ui @ops-3")).toEqual({
      ok: false,
      error: { kind: "empty-title", message: "a new issue needs a title" },
    });
  });

  test("should refuse a single-valued token given twice", () => {
    for (const line of ["task p1 p2", "task @a @b", "task type:bug type:task"]) {
      const result = parseQuickAdd(line);
      expect(!result.ok && result.error.kind).toBe("duplicate-token");
    }
  });

  test("should refuse a due date that is not a real YYYY-MM-DD date", () => {
    for (const line of ["task due:tomorrow", "task due:2026-02-30", "task due:2026-1-5"]) {
      const result = parseQuickAdd(line);
      expect(!result.ok && result.error.kind).toBe("invalid-value");
    }
  });

  test("should refuse a token with no value or a label with a comma", () => {
    for (const line of ["task +", "task @", "task type:", "task +a,b"]) {
      const result = parseQuickAdd(line);
      expect(!result.ok && result.error.kind).toBe("invalid-value");
    }
  });
});

describe("createArgv", () => {
  test("should map each parsed token to its bd create flag when building the create", () => {
    const parsed = unwrap(
      parseQuickAdd("Fix refresh p1 type:bug @ops-3 +ui due:2026-11-02 sprint:s1"),
    );

    expect(createArgv(parsed)).toEqual([
      "bd",
      "create",
      "--title=Fix refresh",
      "--priority=1",
      "--type=bug",
      "--assignee=ops-3",
      "--labels=ui,sprint:s1",
      "--due=2026-11-02",
      "--json",
    ]);
  });

  test("should pass only the title and --json when the line has no tokens", () => {
    expect(createArgv(unwrap(parseQuickAdd("-leading dash title")))).toEqual([
      "bd",
      "create",
      "--title=-leading dash title",
      "--json",
    ]);
  });

  test("should add the parent when creating inside an epic", () => {
    expect(createArgv(unwrap(parseQuickAdd("child")), { parent: "BU-mg2.3" })).toContain(
      "--parent=BU-mg2.3",
    );
  });

  test("should refuse a parent id that bd would read as a flag", () => {
    expect(() => createArgv(unwrap(parseQuickAdd("child")), { parent: "--all" })).toThrow(
      RangeError,
    );
  });
});
