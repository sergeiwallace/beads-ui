#!/usr/bin/env node
// A stand-in for the held store's tool in the server suites: `fake-held.mjs <dir> <verb> ...`
// prints what `<dir>` holds for the verb, as the real tool's `review --json`, `options` and
// `show --json` print it. A `<verb>.exit` file sets the exit code, and a `<verb>.stderr` file
// what goes to stderr. `calls.jsonl` records every call.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const [dir, verb, ...rest] = process.argv.slice(2);
appendFileSync(join(dir, "calls.jsonl"), `${JSON.stringify([verb, ...rest])}\n`);
const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : undefined);
const exit = Number(read(`${verb}.exit`) ?? "0");
const stderr = read(`${verb}.stderr`);
if (stderr !== undefined) process.stderr.write(stderr);

if (verb === "review") {
  process.stdout.write(read("review.json") ?? "");
} else if (verb === "options") {
  const named = rest.filter((arg, i) => !arg.startsWith("--") && rest[i - 1] !== "--scope");
  const text = read("options.json") || undefined;
  if (text !== undefined && named.length > 0) {
    const payload = JSON.parse(text);
    const missing = named.filter((path) => !payload.items.some((row) => row.item === path));
    if (missing.length > 0) {
      process.stderr.write(`held: item: no review item in scope pair: ${missing.join(", ")}\n`);
      process.exit(2);
    }
    payload.items = payload.items.filter((row) => named.includes(row.item));
    process.stdout.write(JSON.stringify(payload));
  } else if (text !== undefined) process.stdout.write(text);
} else if (verb === "show") {
  const path = rest[0] ?? "";
  const body = read(join("bodies", basename(path)));
  if (body === undefined) {
    process.stderr.write(`held: path: no such item ${path}\n`);
    process.exit(3);
  }
  process.stdout.write(JSON.stringify({ path, body, frontmatter: {} }));
}
process.exit(exit);
