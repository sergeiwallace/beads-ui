// Runners: Vitest only. It spawns Node and tsc, which the mod environment lacks, so it is a
// *.spec.ts that `claude plugin test` never collects. See CONTRIBUTING.md, Tests.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const coreDir = resolve(import.meta.dirname, "..");
const pluginDir = resolve(coreDir, "..");
const repoRoot = resolve(pluginDir, "../..");
const gate = join(repoRoot, "scripts/check-core-purity.mjs");
const tsc = join(repoRoot, "node_modules/typescript/bin/tsc");
const impure = join(coreDir, "test/fixtures/impure");

const run = (command: string, args: string[]) =>
  spawnSync(command, args, { cwd: repoRoot, encoding: "utf8" });

const scratch: string[] = [];
const scratchDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "beads-ui-purity-"));
  scratch.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true });
});

describe("the core purity gate", () => {
  it("should pass when run on the real core", () => {
    const result = run("node", [gate, coreDir]);

    expect(result.stdout).toMatch(/check-core-purity: \d+ file\(s\) clean/);
    expect(result.status).toBe(0);
  });

  it("should fail naming each file and line when the core references a banned global or import", () => {
    const result = run("node", [gate, impure]);

    expect(result.status).toBe(1);
    const prefix = "plugins/beads-ui/core/test/fixtures/impure/src";
    expect(result.stdout.trim().split("\n")).toEqual([
      `${prefix}/imports.ts:1: import node:fs`,
      `${prefix}/imports.ts:2: import path`,
      `${prefix}/imports.ts:3: import ../../../../src/parsers.ts`,
      `${prefix}/leaky.ts:5: setTimeout`,
      `${prefix}/leaky.ts:6: setInterval`,
      `${prefix}/leaky.ts:7: queueMicrotask`,
      `${prefix}/leaky.ts:8: requestAnimationFrame`,
      `${prefix}/leaky.ts:10: window`,
      `${prefix}/leaky.ts:11: document`,
      `${prefix}/leaky.ts:12: process`,
      `${prefix}/leaky.ts:13: globalThis`,
      `${prefix}/leaky.ts:14: console`,
    ]);
  });

  it("should fail when a core file is added that uses a timer", () => {
    const dir = scratchDir();
    writeFileSync(join(dir, "clock.ts"), "export const tick = () => 1;\n\nsetTimeout(tick, 5);\n");

    const result = run("node", [gate, dir]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("clock.ts:3: setTimeout");
  });

  it("should refuse to pass when the directory holds no source file", () => {
    const result = run("node", [gate, scratchDir()]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("nothing was checked");
  });
});

describe("the core tsconfig", () => {
  it("should compile the core under lib es2023 and no ambient types", () => {
    const config = JSON.parse(readFileSync(join(coreDir, "tsconfig.json"), "utf8"));

    expect(config.compilerOptions.lib).toEqual(["es2023"]);
    expect(config.compilerOptions.types).toEqual([]);
    const result = run("node", [tsc, "-p", coreDir]);
    expect(result.stdout + result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("should emit an error when a core file reaches for a DOM or Node API", () => {
    const dir = scratchDir();
    const config = join(dir, "tsconfig.json");
    writeFileSync(
      config,
      JSON.stringify({
        extends: join(coreDir, "tsconfig.json"),
        include: [join(impure, "src/leaky.ts")],
      }),
    );

    const result = run("node", [tsc, "-p", config]);

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("leaky.ts");
  });
});

describe("the plugin package", () => {
  it("should declare no runtime dependencies", () => {
    const manifest = JSON.parse(readFileSync(join(pluginDir, "package.json"), "utf8"));

    for (const key of [
      "dependencies",
      "peerDependencies",
      "optionalDependencies",
      "bundleDependencies",
      "bundledDependencies",
    ]) {
      expect(manifest, key).not.toHaveProperty(key);
    }
  });
});
