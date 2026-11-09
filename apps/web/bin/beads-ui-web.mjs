#!/usr/bin/env node
// Runs the server from its TypeScript sources under Node's type stripping. The hook maps the
// `@beads-ui/core` alias (tsconfig.base.json) to the core inside the plugin (D-2).
import { register } from "node:module";

register("./resolve-core.mjs", import.meta.url);
const { main } = await import("../server/cli.ts");
const code = await main(process.argv.slice(2));
if (code >= 0) process.exitCode = code;
