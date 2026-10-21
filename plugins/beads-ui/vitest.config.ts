import { defineConfig } from "vitest/config";

// Two runners share this folder. `claude plugin test` runs every *.test.ts under it in
// the mod environment (no Node, no Vitest), so the Vitest suites here are *.spec.ts and
// Vitest runs those alone: each file has exactly one runner.
export default defineConfig({
  test: {
    include: ["**/*.spec.ts"],
  },
});
