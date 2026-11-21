#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, id, ...rest] = process.argv.slice(2);
appendFileSync(join(dir, "unblock.jsonl"), `${JSON.stringify([id, ...rest])}\n`);
const why = rest[rest.indexOf("--why") + 1] ?? "";
if (/[\r\n]/.test(why)) {
  process.stderr.write("bd-unblock: --why must be one line\n");
  process.exit(2);
}
const exitFile = join(dir, "unblock.exit");
const exit = existsSync(exitFile) ? Number(readFileSync(exitFile, "utf8")) : 0;
if (exit !== 0) {
  process.stderr.write(`bd-unblock: REFUSED, nothing written: ${id} is not blocked\n`);
  process.exit(exit);
}
const to = rest[rest.indexOf("--to") + 1] ?? "in_progress";
execFileSync("bd", ["update", id, "--status", to], { stdio: "ignore" });
