#!/usr/bin/env node
// Runs the MCP server from its TypeScript sources under Node's type stripping, over stdio. The
// hook maps the `@beads-ui/core` alias (tsconfig.base.json) to the core inside the plugin (D-2).
import { register } from "node:module";

register("./resolve-core.mjs", import.meta.url);
const { main } = await import("../src/main.ts");
await main();
