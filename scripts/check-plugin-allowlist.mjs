#!/usr/bin/env node
// Allow-list gate for the mod's hooks and calls (design D-15, task T-0.3).
// Usage: node scripts/check-plugin-allowlist.mjs <plugin-dir> <allowlist.json>
// Runs `claude plugin validate --strict --json <plugin-dir>` and compares every
// "<module> <kind>: <values>" note it reports (hooks, calls, env reads, env writes,
// surface modules, gating hooks) with the allow-list, printing one line per difference.
// Then it fails naming the file and line of any `$.` outside the hooks modules that
// hooks/hooks.json names: validate files every call under the module that reached it,
// even one made in a helper the module handed `on` or `$` to, so the report alone cannot
// show where a call sits. Test files (*.test.*, *.spec.*, test/ and tests/) are skipped.
// Exits 1 on any difference or validation error, 2 when validate cannot run.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const NOTE =
  /^(\.\/\S+) (hooks|calls|env reads|env writes|surface modules|gating hook with \.catch|gating hook without \.catch): (.*)$/;
const VIA = / \(via [\w$.]+\)$/;
const ENGINE_CALL = /(?<![\w$])\$\.[A-Za-z_]/;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const SKIPPED_DIRS = new Set(["node_modules", ".turbo", "test", "tests"]);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function splitTopLevel(values) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < values.length; i++) {
    const char = values[i];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0 && values.startsWith(", ", i)) {
      parts.push(current);
      current = "";
      i++;
      continue;
    }
    current += char;
  }
  if (current !== "") parts.push(current);
  return parts;
}

function validate(pluginDir) {
  const result = spawnSync("claude", ["plugin", "validate", "--strict", "--json", pluginDir], {
    encoding: "utf8",
  });
  if (result.error) {
    console.log(
      `check-plugin-allowlist: cannot run claude plugin validate: ${result.error.message}`,
    );
    process.exit(2);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    console.log("check-plugin-allowlist: claude plugin validate printed no JSON report");
    console.log(result.stdout + result.stderr);
    process.exit(2);
  }
}

function reportedOf(report, problems) {
  const modules = {};
  for (const content of report.contents ?? []) {
    if (content.type !== "hooks") continue;
    for (const note of content.notes ?? []) {
      const match = NOTE.exec(note);
      if (!match) {
        problems.push(`unrecognised validate note: ${note}`);
        continue;
      }
      const [, module, kind, values] = match;
      modules[module] ??= {};
      modules[module][kind] ??= [];
      if (values === "nothing") continue;
      const listed = splitTopLevel(values);
      modules[module][kind].push(
        ...(kind === "calls" ? listed.map((call) => call.replace(VIA, "")) : listed),
      );
    }
  }
  return modules;
}

// The source with every comment and string literal blanked, newlines kept so line numbers
// hold; a template literal's `${...}` stays, as it is code.
function codeOnly(source) {
  let out = "";
  let mode = "code";
  let braces = 0;
  const interpolations = [];
  const blank = (char) => (char === "\n" ? "\n" : " ");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1] ?? "";
    if (mode === "code") {
      if (char === "/" && (next === "/" || next === "*")) {
        mode = next === "/" ? "line" : "block";
        out += "  ";
        i++;
      } else if (char === '"' || char === "'" || char === "`") {
        mode = char;
        out += " ";
      } else if (char === "}" && interpolations.at(-1) === braces) {
        interpolations.pop();
        mode = "`";
        out += " ";
      } else {
        if (char === "{") braces++;
        if (char === "}") braces--;
        out += char;
      }
    } else if (mode === "line") {
      if (char === "\n") mode = "code";
      out += blank(char);
    } else if (mode === "block") {
      if (char === "*" && next === "/") {
        mode = "code";
        out += "  ";
        i++;
      } else {
        out += blank(char);
      }
    } else if (char === "\\") {
      out += blank(char) + blank(next);
      i++;
    } else if (mode === "`" && char === "$" && next === "{") {
      interpolations.push(braces);
      mode = "code";
      out += "  ";
      i++;
    } else {
      if (char === mode || (char === "\n" && mode !== "`")) mode = "code";
      out += blank(char);
    }
  }
  return out;
}

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) files.push(...sourceFiles(path));
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name)) && !TEST_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function callsOutsideModules(pluginDir) {
  const hooksDir = join(pluginDir, "hooks");
  const declared = JSON.parse(readFileSync(join(hooksDir, "hooks.json"), "utf8")).modules ?? [];
  const modules = new Set(declared.map((module) => resolve(hooksDir, module)));
  const problems = [];
  for (const file of sourceFiles(pluginDir)) {
    if (modules.has(file)) continue;
    const lines = codeOnly(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      if (ENGINE_CALL.test(line)) {
        problems.push(
          `${relative(pluginDir, file)}:${index + 1}: a $ call outside the hooks module (${declared.join(", ")})`,
        );
      }
    });
  }
  return problems;
}

function compare(reported, allowed, problems) {
  for (const module of new Set([...Object.keys(reported), ...Object.keys(allowed)])) {
    const got = reported[module] ?? {};
    const want = allowed[module];
    if (!want) {
      problems.push(`${module}: module not in the allow-list`);
      continue;
    }
    for (const kind of new Set([...Object.keys(got), ...Object.keys(want)])) {
      const gotSet = new Set(got[kind] ?? []);
      const wantSet = new Set(want[kind] ?? []);
      for (const value of gotSet) {
        if (!wantSet.has(value)) {
          problems.push(`${module} ${kind}: ${value} is not in the allow-list`);
        }
      }
      for (const value of wantSet) {
        if (!gotSet.has(value)) {
          problems.push(`${module} ${kind}: ${value} is allow-listed but not reported`);
        }
      }
    }
  }
}

function shown(path) {
  const inside = relative(process.cwd(), path);
  return inside === "" ? "." : inside.startsWith("..") ? path : inside;
}

function fail(problems, pluginDir, allowlistPath) {
  for (const problem of problems) console.log(`check-plugin-allowlist: ${problem}`);
  console.log(`check-plugin-allowlist: ${shown(pluginDir)} differs from ${shown(allowlistPath)}`);
  process.exit(1);
}

function main() {
  const [pluginArg, allowlistArg] = process.argv.slice(2);
  if (!pluginArg || !allowlistArg) {
    console.log("usage: check-plugin-allowlist.mjs <plugin-dir> <allowlist.json>");
    process.exit(2);
  }
  const pluginDir = resolve(pluginArg);
  const allowlistPath = resolve(allowlistArg);
  const allowed = JSON.parse(readFileSync(allowlistPath, "utf8")).modules ?? {};
  const report = validate(pluginDir);
  const problems = [];

  if (report.success !== true) {
    for (const part of [report.manifest, ...(report.contents ?? [])]) {
      for (const error of part?.errors ?? []) problems.push(`validate error: ${error.message}`);
      for (const warning of part?.warnings ?? []) {
        problems.push(`validate warning: ${warning.message}`);
      }
    }
    if (problems.length === 0) problems.push("claude plugin validate reported failure");
    fail(problems, pluginDir, allowlistPath);
  }

  compare(reportedOf(report, problems), allowed, problems);
  problems.push(...callsOutsideModules(pluginDir));

  if (problems.length > 0) fail(problems, pluginDir, allowlistPath);
  console.log(`check-plugin-allowlist: ${shown(pluginDir)} matches ${shown(allowlistPath)}`);
}

main();
