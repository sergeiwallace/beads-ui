import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Each fixtures/<name>.json.ts module carries the text of fixtures/<name>.json, so the
// suites that run under claude plugin test (no fs there) read the same bytes as Node suites.
const dir = join(import.meta.dirname, "fixtures");
const modules = readdirSync(dir).filter((name) => name.endsWith(".json.ts"));

describe("the fixture modules", () => {
  it("should find a module for each fixture the dual-runner suites read", () => {
    expect(modules.sort()).toEqual(["bd-list.json.ts", "bd-show.json.ts", "bd-statuses.json.ts"]);
  });

  it.each(modules)(
    "should hold the exact text of its .json file when %s is imported",
    async (name) => {
      const { default: text } = (await import(join(dir, name))) as { default: string };

      expect(text).toBe(readFileSync(join(dir, name.replace(/\.ts$/, "")), "utf8"));
    },
  );
});
