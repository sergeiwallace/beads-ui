import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const pluginDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(pluginDir, "../..");
const gate = join(repoRoot, "scripts/check-plugin-size.mjs");

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true });
});

function folderWith(files: Record<string, number>): string {
  const dir = mkdtempSync(join(tmpdir(), "beads-ui-size-"));
  scratch.push(dir);
  for (const [name, bytes] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, Buffer.alloc(bytes, "a"));
  }
  return dir;
}

const runGate = (dir: string) =>
  spawnSync("node", [gate, dir], { cwd: repoRoot, encoding: "utf8" });

describe("the plugin size gate", () => {
  it("should pass when run on the real plugin", () => {
    const result = runGate("plugins/beads-ui");

    expect(result.stdout).toMatch(
      /check-plugin-size: \d+ file\(s\) under plugins\/beads-ui, none over 1 MB/,
    );
    expect(result.status).toBe(0);
  });

  it("should fail naming the file when a file under the plugin exceeds 1 MB", () => {
    const dir = folderWith({ "hooks/register.ts": 10, "core/src/big.ts": 1_000_001 });

    const result = runGate(dir);

    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe(
      `check-plugin-size: ${join(dir, "core/src/big.ts")}: 1000001 bytes, over the 1 MB limit (1000000 bytes)`,
    );
  });

  it("should pass when a file is exactly 1 MB", () => {
    const dir = folderWith({ "core/src/edge.ts": 1_000_000 });

    expect(runGate(dir).status).toBe(0);
  });
});
