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
    // Each package keeps its own module cache: turbo runs two packages' Vitest at once under
    // BEADS_UI_TEST_JOBS=2, and on the shared workspace-root default one run's cleanup removed
    // the directory the other was writing (ENOTEMPTY on node_modules/.vitest-cache).
    fsModuleCachePath: fileURLToPath(new URL("node_modules/.vitest-cache/", import.meta.url)),
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "jsdom",
  },
});
