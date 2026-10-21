import { defineConfig } from "vitest/config";

// Core suites import their kit from claude-code/testing so `claude plugin test` runs them too
// (design D-2); under Vitest that name resolves to Vitest itself.
export default defineConfig({
  resolve: {
    alias: { "claude-code/testing": "vitest" },
  },
});
