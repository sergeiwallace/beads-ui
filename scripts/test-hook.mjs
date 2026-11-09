#!/usr/bin/env node
// `node scripts/test-hook.mjs <command> [args...]`: the pre-commit test hooks' path filter. When
// every staged path is documentation (under docs/ or a *.md file) the suite is skipped; the
// pre-push test gate still runs the Vitest suites, the ones that read docs included. When any
// other path is staged, a deletion or a rename's old path included, or nothing is staged at all
// (`pre-commit run --all-files`), the command runs.
import { spawnSync } from "node:child_process";

const isDocsPath = (path) => path.startsWith("docs/") || path.endsWith(".md");

function stagedPaths() {
  const diff = spawnSync("git", ["diff", "--cached", "--name-only", "--no-renames", "-z"], {
    encoding: "utf8",
  });
  if (diff.status !== 0) {
    throw new Error(`git diff --cached failed: ${diff.stderr.trim() || diff.error?.message}`);
  }
  return diff.stdout.split("\0").filter(Boolean);
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node scripts/test-hook.mjs <command> [args...]");
  process.exit(2);
}
const staged = stagedPaths();
if (staged.length > 0 && staged.every(isDocsPath)) {
  console.log(
    `test-hook: skipped ${command} ${args.join(" ")}: every staged path is docs/** or *.md`,
  );
  process.exit(0);
}
const result = spawnSync(command, args, { stdio: "inherit" });
if (result.error) {
  console.error(`${command}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
