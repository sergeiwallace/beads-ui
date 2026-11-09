#!/usr/bin/env node
// A stand-in for bd-unblock in the server suites: `fake-unblock.mjs <dir> <id> --to <status>
// --why <text>`. It records its arguments in `<dir>/unblock.jsonl`; with `<dir>/unblock.exit`
// holding a non-zero code it refuses with that code, and otherwise moves the issue with bd.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, id, ...rest] = process.argv.slice(2);
appendFileSync(join(dir, "unblock.jsonl"), `${JSON.stringify([id, ...rest])}\n`);
const exitFile = join(dir, "unblock.exit");
const exit = existsSync(exitFile) ? Number(readFileSync(exitFile, "utf8")) : 0;
if (exit !== 0) {
  process.stderr.write(`bd-unblock: REFUSED, nothing written: ${id} is not blocked\n`);
  process.exit(exit);
}
const to = rest[rest.indexOf("--to") + 1] ?? "in_progress";
execFileSync("bd", ["update", id, "--status", to], { stdio: "ignore" });
