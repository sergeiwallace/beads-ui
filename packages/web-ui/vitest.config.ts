import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { testJobs } from "../../scripts/test-jobs.mjs";

// The same `@beads-ui/core` alias tsconfig.base.json declares, for the Vitest resolver.
const coreSrc = fileURLToPath(new URL("../../plugins/beads-ui/core/src/", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@beads-ui\/core$/, replacement: `${coreSrc}index.ts` },
      { find: /^@beads-ui\/core\/(.*)$/, replacement: `${coreSrc}$1` },
    ],
  },
  test: {
    // BEADS_UI_TEST_JOBS bounds the workers (docs/procedures/web-run.md, Test it).
    maxWorkers: testJobs(),
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "jsdom",
  },
});
