#!/usr/bin/env node
import { register } from "node:module";

register("./resolve-core.mjs", import.meta.url);
const { main } = await import("../server/cli.ts");
const code = await main(process.argv.slice(2));
if (code >= 0) process.exitCode = code;
