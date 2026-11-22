import { defineConfig } from "vitest/config";
import { testJobs } from "./scripts/test-jobs.mjs";

export default defineConfig({
  test: {
    maxWorkers: testJobs(),
    projects: ["plugins/*", "packages/*", "apps/*"],
  },
});
