#!/usr/bin/env node
// A stand-in for one fleet tool the dispatch ladder and the owner handoff call, for the server
// suites: `fake-fleet-tool.mjs <dir> <tool> <args...>`. It checks the arguments against the real
// tool's own argument shape, as each CLI's --help prints it, and refuses any other with exit 64,
// so a test passes only when the server calls the tool the way the tool reads its arguments.
// It records each call as one JSON line in `<dir>/<tool>.jsonl`, a --text-file's content included
// (the server deletes that file once the call returns), prints `<dir>/<tool>.stdout` when present,
// and exits with `<dir>/<tool>.exit` (0 when absent) after printing `<dir>/<tool>.stderr`, first
// waiting `<dir>/<tool>.delay-ms` milliseconds after recording the call when that file is present;
// each file may be named per subcommand, `<tool>.<subcommand>.<suffix>`, which wins.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [dir, tool, ...args] = process.argv.slice(2);

const flag = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? undefined : args[at + 1];
};
const has = (name) => args.includes(name);

// The argument shape of each real tool, as its --help gives it.
const SHAPES = {
  // agent-mail-notifier send --to <session>@<host> --subject SUBJECT --body BODY
  "agent-mail": () =>
    args[0] === "send" && /^[^@\s]+@[^@\s]+$/.test(flag("--to") ?? "") && flag("--subject") && flag("--body") !== undefined,
  // buzz send --to <session>@<host> [--dm-only] [--json] text
  buzz: () => args[0] === "send" && /^[^@\s]+@[^@\s]+$/.test(flag("--to") ?? "") && args.length >= 4,
  // git-inbox send --to TO --re RE (--body-file | --body) [--action ID@REPO] [--json];
  // git-inbox status <id> --json; git-inbox confirm <id> --json
  "git-inbox": () =>
    (args[0] === "send" && /^[^@\s]+@[^@\s]+$/.test(flag("--to") ?? "") && flag("--re") && flag("--body") !== undefined) ||
    ((args[0] === "status" || args[0] === "confirm") && args.length >= 2),
  // python -m ai_harness.prompt_injection inject --use-case <u> --target session:<s> --key <k> --text-file <f> --json
  "prompt-injection": () => (flag("--target") ?? "").startsWith("session:") && flag("--key") && flag("--text-file"),
  // the mod's submit: --session <s> --text-file <f>
  "mod-submit": () => flag("--session") && flag("--text-file"),
  // fleet-liveness status --json --session <session>@<host>
  liveness: () => args[0] === "status" && has("--json") && /^[^@\s]+@[^@\s]+$/.test(flag("--session") ?? ""),
  // a host's wake policy printer: <host>
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
// `<tool>.<subcommand>.<suffix>` first, so `git-inbox send` and `git-inbox status` answer apart.
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
