import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testJobs } from "../../scripts/test-jobs.mjs";

const TEST_MS = 300_000;
const STORE_SETUP_MS = 300_000;

const coreSrc = fileURLToPath(new URL("../../plugins/beads-ui/core/src/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@beads-ui\/core$/, replacement: `${coreSrc}index.ts` },
      { find: /^@beads-ui\/core\/(.*)$/, replacement: `${coreSrc}$1` },
    ],
  },
  test: {
    maxWorkers: testJobs(),
    fsModuleCachePath: fileURLToPath(new URL("node_modules/.vitest-cache/", import.meta.url)),
    include: ["test/**/*.test.ts"],
    testTimeout: TEST_MS,
    hookTimeout: STORE_SETUP_MS,
  },
});
