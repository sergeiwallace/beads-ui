import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Each fixtures/<name>.json.ts or <name>.txt.ts module carries the text of fixtures/<name>, so
// the suites that run under claude plugin test (no fs there) read the same bytes as Node suites.
const dir = join(import.meta.dirname, "fixtures");
const modules = readdirSync(dir).filter((name) => /\.(json|txt)\.ts$/.test(name));

describe("the fixture modules", () => {
  it("should find a module for each fixture the dual-runner suites read", () => {
    expect(modules.sort()).toEqual([
      "bd-delete-cascade-dry-run.json.ts",
      "bd-delete-dry-run-dependents.json.ts",
      "bd-delete-dry-run-dependents.txt.ts",
      "bd-delete-dry-run-leaf.json.ts",
      "bd-delete-dry-run-leaf.txt.ts",
      "bd-history-BU-mg2.2.json.ts",
      "bd-history-BU-mg2.3.json.ts",
      "bd-history-BU-mg2.json.ts",
      "bd-list-all-brief.json.ts",
      "bd-list.json.ts",
      "bd-ready.json.ts",
      "bd-show-BU-mg2.3.5.json.ts",
      "bd-show-minted.json.ts",
      "bd-show.json.ts",
      "bd-statuses.json.ts",
    ]);
  });

  it.each(modules)(
    "should hold the exact text of its fixture file when %s is imported",
    async (name) => {
      const { default: text } = (await import(join(dir, name))) as { default: string };

      expect(text).toBe(readFileSync(join(dir, name.replace(/\.ts$/, "")), "utf8"));
    },
  );
});
