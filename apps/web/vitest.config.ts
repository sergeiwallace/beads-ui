import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testJobs } from "../../scripts/test-jobs.mjs";

// The same `@beads-ui/core` alias tsconfig.base.json declares, for the Vitest resolver.
const coreSrc = fileURLToPath(new URL("../../plugins/beads-ui/core/src/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@beads-ui\/core$/, replacement: `${coreSrc}index.ts` },
      { find: /^@beads-ui\/core\/(.*)$/, replacement: `${coreSrc}$1` },
    ],
  },
  test: {
    // BEADS_UI_TEST_JOBS bounds the workers (docs/procedures/web-run.md, Test it).
    maxWorkers: testJobs(),
    // The server suites; the browser specs under e2e/ are Playwright's.
    include: ["test/**/*.test.ts"],
    // Each suite runs real bd processes against a temporary store.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
