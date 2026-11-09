import { defineConfig } from "vitest/config";
import { testJobs } from "./scripts/test-jobs.mjs";

export default defineConfig({
  test: {
    // BEADS_UI_TEST_JOBS bounds the workers (docs/procedures/web-run.md, Test it).
    maxWorkers: testJobs(),
    projects: ["plugins/*", "packages/*", "apps/*"],
  },
});
