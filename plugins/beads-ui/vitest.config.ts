import { defineConfig } from "vitest/config";

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
    include: ["**/*.spec.ts", "core/test/**/*.test.ts"],
  },
});
