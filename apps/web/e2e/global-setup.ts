import { fileURLToPath } from "node:url";
import { build } from "vite";

/** Builds the client once, so every spec's server starts on a fresh bundle without rebuilding. */
export default async function globalSetup(): Promise<void> {
  await build({
    configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    logLevel: "warn",
  });
}
