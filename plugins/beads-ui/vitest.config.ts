import { defineConfig } from "vitest/config";
import { testJobs } from "../../scripts/test-jobs.mjs";

export default defineConfig({
  resolve: {
    alias: { "claude-code/testing": "vitest" },
  },
  test: {
    maxWorkers: testJobs(),
    include: ["**/*.spec.ts", "core/test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
