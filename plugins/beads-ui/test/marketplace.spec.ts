import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const pluginDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(pluginDir, "../..");
const gate = join(repoRoot, "scripts/check-marketplace.mjs");
const SOURCE = "./plugins/beads-ui";

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true });
});

// A repository root holding the real marketplace and plugin manifest, the marketplace edited.
function rootWith(edit: (marketplace: { plugins: { source: string }[] }) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "beads-ui-marketplace-"));
  scratch.push(dir);
  mkdirSync(join(dir, ".claude-plugin"));
  mkdirSync(join(dir, "plugins/beads-ui/.claude-plugin"), { recursive: true });
  cpSync(
    join(pluginDir, ".claude-plugin/plugin.json"),
    join(dir, "plugins/beads-ui/.claude-plugin/plugin.json"),
  );
  const marketplace = JSON.parse(
    readFileSync(join(repoRoot, ".claude-plugin/marketplace.json"), "utf8"),
  );
  edit(marketplace);
  writeFileSync(join(dir, ".claude-plugin/marketplace.json"), JSON.stringify(marketplace));
  return dir;
}

const runGate = (root: string) =>
  spawnSync("node", [gate, root, SOURCE], { cwd: repoRoot, encoding: "utf8" });

describe("the marketplace gate", () => {
  it("should pass when the repository root's marketplace lists the plugin", () => {
    const result = runGate(repoRoot);

    expect(result.stdout).toContain(
      "check-marketplace: the marketplace validates and lists ./plugins/beads-ui as beads-ui",
    );
    expect(result.status).toBe(0);
  });

  it("should fail naming the source when the marketplace does not list the plugin", () => {
    const root = rootWith((marketplace) => {
      for (const plugin of marketplace.plugins) plugin.source = "./plugins/other";
    });

    const result = runGate(root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "check-marketplace: .claude-plugin/marketplace.json does not list ./plugins/beads-ui",
    );
  });

  it("should fail when claude plugin validate refuses the marketplace", () => {
    const root = rootWith((marketplace) => {
      Object.assign(marketplace, { plugins: "not a list" });
    });

    const result = runGate(root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("check-marketplace: claude plugin validate");
  });
});
