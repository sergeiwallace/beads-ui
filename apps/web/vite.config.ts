import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The same `@beads-ui/core` alias tsconfig.base.json declares: the core inside the plugin (D-2).
const coreSrc = fileURLToPath(new URL("../../plugins/beads-ui/core/src/", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./client", import.meta.url)),
  base: "/",
  // React Compiler 1.0 for the dense board (web app design, Stack and look).
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    alias: [
      { find: /^@beads-ui\/core$/, replacement: `${coreSrc}index.ts` },
      { find: /^@beads-ui\/core\/(.*)$/, replacement: `${coreSrc}$1` },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/client", import.meta.url)),
    emptyOutDir: true,
  },
});
