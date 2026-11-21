#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, tool, ...args] = process.argv.slice(2);

const flag = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const has = (name) => args.includes(name);

const SHAPES = {
  "agent-mail": () =>
    args[0] === "send" && /^[^@\s]+@[^@\s]+$/.test(flag("--to") ?? "") && flag("--subject") && flag("--body") !== undefined,
  buzz: () => args[0] === "send" && /^[^@\s]+@[^@\s]+$/.test(flag("--to") ?? "") && args.length >= 4,
  "git-inbox": () =>
    (args[0] === "send" && /^[^@\s]+@[^@\s]+$/.test(flag("--to") ?? "") && flag("--re") && flag("--body") !== undefined) ||
    ((args[0] === "status" || args[0] === "confirm") && args.length >= 2),
  "prompt-injection": () => (flag("--target") ?? "").startsWith("session:") && flag("--key") && flag("--text-file"),
  "mod-submit": () => flag("--session") && flag("--text-file"),
  liveness: () => args[0] === "status" && has("--json") && /^[^@\s]+@[^@\s]+$/.test(flag("--session") ?? ""),
  wake: () => args.length === 1,
};

const shape = SHAPES[tool];
if (shape === undefined || !shape()) {
  process.stderr.write(`${tool}: usage: arguments do not match the tool's interface: ${JSON.stringify(args)}\n`);
  process.exit(64);
}
const textFile = flag("--text-file");
const record = { args, ...(textFile === undefined ? {} : { text: readFileSync(textFile, "utf8") }) };
appendFileSync(join(dir, `${tool}.jsonl`), `${JSON.stringify(record)}\n`);
const read = (suffix) => {
  for (const name of [`${tool}.${args[0]}.${suffix}`, `${tool}.${suffix}`]) {
    const path = join(dir, name);
    if (existsSync(path)) return readFileSync(path, "utf8");
  }
  return undefined;
};
const delay = Number(read("delay-ms") ?? "0");
if (delay > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
const stdout = read("stdout");
if (stdout !== undefined) process.stdout.write(stdout);
const stderr = read("stderr");
if (stderr !== undefined) process.stderr.write(stderr);
process.exit(Number(read("exit") ?? "0"));
