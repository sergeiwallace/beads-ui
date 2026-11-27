#!/usr/bin/env node
import { register } from "node:module";

register("./resolve-core.mjs", import.meta.url);
const { main } = await import("../src/main.ts");
await main();
