import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const coreSrc = fileURLToPath(new URL("../../plugins/beads-ui/core/src/", import.meta.url));
const clientSrc = fileURLToPath(new URL("./client/", import.meta.url));
const ganttCss = fileURLToPath(new URL("frappe-gantt.css", import.meta.resolve("frappe-gantt")));

export default defineConfig({
  root: fileURLToPath(new URL("./client", import.meta.url)),
  base: "./",
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@beads-ui\/core$/, replacement: `${coreSrc}index.ts` },
      { find: /^@beads-ui\/core\/(.*)$/, replacement: `${coreSrc}$1` },
      { find: /^frappe-gantt\/frappe-gantt\.css$/, replacement: ganttCss },
      { find: /^@\/(.*)$/, replacement: `${clientSrc}$1` },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/client", import.meta.url)),
    emptyOutDir: true,
  },
});
