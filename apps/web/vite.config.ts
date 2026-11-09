import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The same `@beads-ui/core` alias tsconfig.base.json declares: the core inside the plugin (D-2).
const coreSrc = fileURLToPath(new URL("../../plugins/beads-ui/core/src/", import.meta.url));
// Frappe Gantt exports its stylesheet only under the `style` condition, listed after `import`,
// so a CSS @import of the package resolves to its script; this names the stylesheet itself.
const ganttCss = fileURLToPath(new URL("frappe-gantt.css", import.meta.resolve("frappe-gantt")));

export default defineConfig({
  root: fileURLToPath(new URL("./client", import.meta.url)),
  base: "/",
  // React Compiler 1.0 for the dense board (web app design, Stack and look).
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    alias: [
      { find: /^@beads-ui\/core$/, replacement: `${coreSrc}index.ts` },
      { find: /^@beads-ui\/core\/(.*)$/, replacement: `${coreSrc}$1` },
      { find: /^frappe-gantt\/frappe-gantt\.css$/, replacement: ganttCss },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/client", import.meta.url)),
    emptyOutDir: true,
  },
});
