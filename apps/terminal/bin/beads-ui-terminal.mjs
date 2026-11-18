#!/usr/bin/env node
import { register } from "node:module";

register("./resolve-core.mjs", import.meta.url);
const { main } = await import("../server/cli.ts");
process.exitCode = await main(process.argv.slice(2));
