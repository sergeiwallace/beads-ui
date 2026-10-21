// Runners: Vitest only. It spawns git and gitleaks, which the mod environment lacks.
// The public-repo hygiene of T-0.4: the pinned gitleaks pre-commit hook refuses a staged
// secret, and README.md names the shared layers.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");
const INSTALL = "https://github.com/gitleaks/gitleaks#installing";

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true });
});

// Inside the pre-commit hook git exports GIT_INDEX_FILE and friends for the outer repository;
// the scratch repository must not inherit them, or `git add` and gitleaks would read and write
// the outer index.
const scratchEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);

// The rev .pre-commit-config.yaml pins for the gitleaks hook, without its leading "v".
function pinnedGitleaks(): string {
  const config = readFileSync(join(repoRoot, ".pre-commit-config.yaml"), "utf8");
  const block =
    /repo: https:\/\/github\.com\/gitleaks\/gitleaks\n\s+rev: v(\S+)\n\s+hooks:\n\s+- id: gitleaks\n/.exec(
      config,
    );
  if (block?.[1] === undefined) {
    throw new Error(".pre-commit-config.yaml declares no pinned gitleaks hook (id: gitleaks)");
  }
  return block[1];
}

function gitleaks(args: string[], cwd: string) {
  const result = spawnSync("gitleaks", args, { cwd, env: scratchEnv, encoding: "utf8" });
  if (result.error) {
    throw new Error(
      `gitleaks is not on PATH (${result.error.message}); install gitleaks ${pinnedGitleaks()} from ${INSTALL}, as CONTRIBUTING.md's Setup lists`,
    );
  }
  return result;
}

function git(dir: string, args: string[]) {
  const result = spawnSync("git", args, { cwd: dir, env: scratchEnv, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
}

// A scratch git repository with `name` holding `content`, staged and not committed.
function stagedRepo(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "beads-ui-gitleaks-"));
  scratch.push(dir);
  git(dir, ["init", "-q"]);
  writeFileSync(join(dir, name), content);
  git(dir, ["add", "--", name]);
  return dir;
}

const scanStaged = (dir: string) =>
  gitleaks(["git", "--pre-commit", "--staged", "--no-banner", "--redact", "--verbose"], dir);

// A fabricated AWS access key id, assembled at run time so this file holds no secret pattern.
// The tail is random-looking on purpose: gitleaks ignores low-entropy and EXAMPLE keys.
const fakeAwsKeyId = (): string => ["AK", "IA", "QZ7XK2M4", "WB6NR3TJ"].join("");

describe("the gitleaks pre-commit hook", () => {
  it("should be pinned in .pre-commit-config.yaml and match the gitleaks on PATH", () => {
    const pinned = pinnedGitleaks();

    const result = gitleaks(["version"], repoRoot);

    expect(result.stdout.trim(), `install gitleaks ${pinned} from ${INSTALL}`).toBe(pinned);
  });

  it("should refuse the commit naming the rule when a staged file holds an AWS key", () => {
    const dir = stagedRepo("settings.ts", `export const keyId = "${fakeAwsKeyId()}";\n`);

    const result = scanStaged(dir);

    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("aws-access-token");
  });

  it("should let the commit through when the staged file holds no secret", () => {
    const dir = stagedRepo("settings.ts", 'export const region = "us-east-1";\n');

    const result = scanStaged(dir);

    expect(result.stdout + result.stderr).toContain("no leaks found");
    expect(result.status).toBe(0);
  });
});

describe("README.md", () => {
  const section = (): string => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const found = /^## Repository structure\n([\s\S]*?)(?=^## )/m.exec(readme);
    if (found?.[1] === undefined) throw new Error('README.md has no "## Repository structure"');
    return found[1];
  };

  it("should name the five shared layers in its Repository structure section", () => {
    const text = section().replace(/\s+/g, " ");

    for (const layer of [
      "data access",
      "domain logic",
      "view models",
      "commands",
      "design tokens",
    ]) {
      expect(text).toContain(layer);
    }
  });

  it("should not name layout in its Repository structure section", () => {
    expect(section()).not.toMatch(/layout/i);
  });
});
