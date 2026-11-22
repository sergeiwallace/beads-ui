import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testJobs } from "../../scripts/test-jobs.mjs";

export default defineConfig({
  resolve: {
    alias: { "claude-code/testing": "vitest" },
  },
  test: {
    maxWorkers: testJobs(),
    fsModuleCachePath: fileURLToPath(new URL("node_modules/.vitest-cache/", import.meta.url)),
    include: ["**/*.spec.ts", "core/test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
