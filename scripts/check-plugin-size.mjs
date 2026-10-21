#!/usr/bin/env node
// File-size gate for the mod (design D-2 and D-15, task T-0.3).
// Usage: node scripts/check-plugin-size.mjs <plugin-dir>
// Fails naming every file under <plugin-dir> larger than 1 MB, counted as 1,000,000
// bytes, the stricter reading of "1 MB", so a file the engine reads as over 1 MiB is
// always caught. node_modules and .turbo hold tool state, never the plugin, and are
// skipped. Exits 1 naming each file, 2 when the directory is missing.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const LIMIT_BYTES = 1_000_000;
const SKIPPED_DIRS = new Set(["node_modules", ".turbo"]);

function filesUnder(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files.push(...filesUnder(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function main() {
  const [dirArg] = process.argv.slice(2);
  if (!dirArg || !existsSync(dirArg)) {
    console.log(`check-plugin-size: no such directory: ${dirArg ?? "(none given)"}`);
    process.exit(2);
  }
  const dir = resolve(dirArg);
  const files = filesUnder(dir);
  const over = files
    .map((path) => ({ path, size: statSync(path).size }))
    .filter((file) => file.size > LIMIT_BYTES);

  for (const file of over) {
    console.log(
      `check-plugin-size: ${join(dirArg, relative(dir, file.path))}: ${file.size} bytes, over the 1 MB limit (${LIMIT_BYTES} bytes)`,
    );
  }
  if (over.length > 0) process.exit(1);
  console.log(`check-plugin-size: ${files.length} file(s) under ${dirArg}, none over 1 MB`);
}

main();
