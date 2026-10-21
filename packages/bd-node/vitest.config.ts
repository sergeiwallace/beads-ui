import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The same `@beads-ui/core` alias tsconfig.base.json declares, for the Vitest resolver.
const coreSrc = fileURLToPath(new URL("../../plugins/beads-ui/core/src/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@beads-ui\/core$/, replacement: `${coreSrc}index.ts` },
      { find: /^@beads-ui\/core\/(.*)$/, replacement: `${coreSrc}$1` },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
