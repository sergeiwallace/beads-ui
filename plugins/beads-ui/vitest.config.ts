import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testJobs } from "../../scripts/test-jobs.mjs";

// Two runners share this folder, split by name (CONTRIBUTING.md, Tests).
// `claude plugin test` runs every *.test.ts under it in the mod environment. Vitest runs
// every *.spec.ts (Node suites) and the core's *.test.ts, the pure suites that run under
// both, with claude-code/testing mapped to vitest. The mod's own hooks tests drive the
// engine through $ and run under `claude plugin test` alone.
export default defineConfig({
  resolve: {
    alias: { "claude-code/testing": "vitest" },
  },
  test: {
    // BEADS_UI_TEST_JOBS bounds the workers (docs/procedures/web-run.md, Test it).
    maxWorkers: testJobs(),
    // Each package keeps its own module cache: turbo runs two packages' Vitest at once under
    // BEADS_UI_TEST_JOBS=2, and on the shared workspace-root default one run's cleanup removed
    // the directory the other was writing (ENOTEMPTY on node_modules/.vitest-cache).
    fsModuleCachePath: fileURLToPath(new URL("node_modules/.vitest-cache/", import.meta.url)),
    include: ["**/*.spec.ts", "core/test/**/*.test.ts"],
    // The Node suites spawn claude, git, gitleaks and node; under a loaded host's pre-commit run
    // (Vitest beside claude plugin test) one spawn can pass the 5000 ms default on its own.
    testTimeout: 30_000,
  },
});
