#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const NOTE =
  /^(\.\/\S+) (hooks|calls|env reads|env writes|surface modules|gating hook with \.catch|gating hook without \.catch): (.*)$/;
const VIA = / \(via [\w$.]+\)$/;
const DEFAULT_MATCHER = / \(default matcher key: [\w$]+(?:, [\w$]+)*\)$/;
const ENGINE_CALL = /(?<![\w$])\$\.[A-Za-z_]/;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const SKIPPED_DIRS = new Set(["node_modules", ".turbo", ".claude-plugin", "test", "tests"]);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const ENGINE_TYPES = new Set([
  "AnyEventHook",
  "CatchHandler",
  "CoreEngineInterface",
  "EngineCreateResult",
  "EngineInterface",
  "EngineInterfaceBuilt",
  "Events",
  "GlobHook",
  "Hook",
  "HookFor",
  "HookOf",
  "HooksModule",
  "MatchedHook",
  "MatchedStreamHook",
  "On",
  "Register",
  "Registration",
  "StreamHook",
]);
const FROM_CLAUDE_CODE =
  /\b(?:import|export)\s+(?:type\s+)?([^;'"`]*?)\s*from\s*(["'])claude-code\2/g;
const INLINE_IMPORT = /\bimport\s*\(\s*(["'])claude-code\1\s*\)\s*\.\s*([\w$]+)/g;
const BARE_ENGINE = /(?<![\w$.])\$(?![\w$])/g;
const PARAMETER_LIST_OPENER = /(?:\bfunction\s*[\w$]*|\basync)\s*$/;

function splitTopLevel(values) {
  const parts = [];
  let depth = 0;
  let parentheses = 0;
  let current = "";
  for (let i = 0; i < values.length; i++) {
    const char = values[i];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0 && char === "(") parentheses++;
    if (depth === 0 && char === ")") parentheses--;
    if (depth === 0 && parentheses === 0 && values.startsWith(", ", i)) {
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

const NO_ANSWER = "not type-checked: the check ended without an answer";
const VALIDATE_ATTEMPTS = 3;
const RETRY_PAUSES_MS = [10_000, 20_000];

function pause(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function unanswered(report) {
  return [report.manifest, ...(report.contents ?? [])].some((part) =>
    (part?.warnings ?? []).some((warning) => warning.message === NO_ANSWER),
  );
}

function validateOnce(pluginDir) {
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

function validate(pluginDir) {
  for (let attempt = 1; attempt <= VALIDATE_ATTEMPTS; attempt++) {
    if (attempt > 1) pause(RETRY_PAUSES_MS[attempt - 2]);
    const report = validateOnce(pluginDir);
    if (!unanswered(report)) return report;
  }
  console.log(
    `check-plugin-allowlist: claude plugin validate's type check ended without an answer on all ${VALIDATE_ATTEMPTS} attempts; nothing was checked`,
  );
  process.exit(2);
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
        ...listed.map((value) => {
          if (kind === "calls") return value.replace(VIA, "");
          if (kind === "hooks") return value.replace(DEFAULT_MATCHER, "");
          return value;
        }),
      );
    }
  }
  return modules;
}

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

const lineAt = (text, offset) => text.slice(0, offset).split("\n").length;

function engineTypeReferences(source, code) {
  const found = [];
  const inCode = (offset) => code[offset] !== " ";
  for (const match of source.matchAll(FROM_CLAUDE_CODE)) {
    if (!inCode(match.index)) continue;
    const clause = match[1];
    const clauseAt = match.index + match[0].indexOf(clause);
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) {
      let cursor = clauseAt + braces.index + 1;
      for (const item of braces[1].split(",")) {
        const name = item
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0];
        if (ENGINE_TYPES.has(name)) found.push([source.indexOf(name, cursor), name]);
        cursor += item.length + 1;
      }
    }
    const namespace = /\*\s*as\s+([\w$]+)/.exec(clause);
    if (namespace) {
      const escaped = namespace[1].replace(/\$/g, "\\$");
      const member = new RegExp(`(?<![\\w$.])${escaped}\\s*\\.\\s*([\\w$]+)`, "g");
      for (const use of code.matchAll(member)) {
        if (ENGINE_TYPES.has(use[1])) found.push([use.index, use[1]]);
      }
    }
  }
  for (const match of source.matchAll(INLINE_IMPORT)) {
    if (inCode(match.index) && ENGINE_TYPES.has(match[2])) found.push([match.index, match[2]]);
  }
  return found;
}

function isParameter(code, offset) {
  let depth = 0;
  let open = -1;
  for (let k = offset - 1; k >= 0 && open === -1; k--) {
    const char = code[k];
    if (char === ")" || char === "]" || char === "}") depth++;
    else if (char === "(" || char === "[" || char === "{") {
      if (depth === 0) {
        if (char !== "(") return false;
        open = k;
      } else depth--;
    }
  }
  if (open === -1) return false;
  if (PARAMETER_LIST_OPENER.test(code.slice(Math.max(0, open - 60), open))) return true;
  depth = 0;
  for (let k = open; k < code.length; k++) {
    if (code[k] === "(") depth++;
    else if (code[k] === ")" && --depth === 0) {
      return /^\s*(=>|\{)/.test(code.slice(k + 1, k + 40));
    }
  }
  return false;
}

function calleeOf(code, offset) {
  let depth = 0;
  for (let k = offset - 1; k >= 0; k--) {
    const char = code[k];
    if (char === ")" || char === "]" || char === "}") depth++;
    else if (char === "(" || char === "[" || char === "{") {
      if (depth > 0) {
        depth--;
        continue;
      }
      if (char !== "(") return undefined;
      return /([\w$]+)\s*$/.exec(code.slice(Math.max(0, k - 60), k))?.[1];
    }
  }
  return undefined;
}

function declaredAtTop(code, name) {
  const escaped = name.replace(/\$/g, "\\$");
  return new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${escaped}\\s*[<(]`, "m").test(code);
}

function engineHandedOut(code) {
  const found = [];
  for (const match of code.matchAll(BARE_ENGINE)) {
    const after = code.slice(match.index + 1).trimStart();
    if (after.startsWith(".") || after.startsWith("?.") || after.startsWith("[")) continue;
    if (isParameter(code, match.index)) continue;
    const callee = calleeOf(code, match.index);
    if (callee !== undefined && declaredAtTop(code, callee)) continue;
    found.push(match.index);
  }
  return found;
}

function engineEscapes(pluginDir) {
  const hooksDir = join(pluginDir, "hooks");
  const declared = JSON.parse(readFileSync(join(hooksDir, "hooks.json"), "utf8")).modules ?? [];
  const modules = new Set(declared.map((module) => resolve(hooksDir, module)));
  const named = declared.join(", ");
  const problems = [];
  for (const file of sourceFiles(pluginDir)) {
    const source = readFileSync(file, "utf8");
    const code = codeOnly(source);
    const at = (offset) => `${relative(pluginDir, file)}:${lineAt(source, offset)}`;
    if (modules.has(file)) {
      for (const offset of engineHandedOut(code)) {
        problems.push(`${at(offset)}: $ handed on rather than called, in the hooks module`);
      }
      continue;
    }
    code.split("\n").forEach((line, index) => {
      if (ENGINE_CALL.test(line)) {
        problems.push(
          `${relative(pluginDir, file)}:${index + 1}: a $ call outside the hooks module (${named})`,
        );
      }
    });
    for (const [offset, name] of engineTypeReferences(source, code)) {
      problems.push(`${at(offset)}: the engine type ${name} outside the hooks module (${named})`);
    }
  }
  return problems.sort();
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
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  const allowed = allowlist.modules ?? {};
  const allowedWarnings = new Set(
    (allowlist.warnings ?? [])
      .filter(({ reason }) => typeof reason === "string" && reason.trim() !== "")
      .map(({ message }) => message),
  );
  const report = validate(pluginDir);
  const problems = [];

  if (report.success !== true) {
    let acceptedWarnings = 0;
    for (const part of [report.manifest, ...(report.contents ?? [])]) {
      for (const error of part?.errors ?? []) problems.push(`validate error: ${error.message}`);
      for (const warning of part?.warnings ?? []) {
        if (allowedWarnings.has(warning.message)) acceptedWarnings++;
        else problems.push(`validate warning: ${warning.message}`);
      }
    }
    if (problems.length === 0 && acceptedWarnings === 0) {
      problems.push("claude plugin validate reported failure");
    }
    if (problems.length > 0) fail(problems, pluginDir, allowlistPath);
  }

  compare(reportedOf(report, problems), allowed, problems);
  problems.push(...engineEscapes(pluginDir));

  if (problems.length > 0) fail(problems, pluginDir, allowlistPath);
  console.log(`check-plugin-allowlist: ${shown(pluginDir)} matches ${shown(allowlistPath)}`);
}

main();
