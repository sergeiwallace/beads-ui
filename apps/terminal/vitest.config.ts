import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testJobs } from "../../scripts/test-jobs.mjs";

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
    include: ["test/**/*.test.ts"],
  },
});
