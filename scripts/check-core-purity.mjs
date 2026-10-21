#!/usr/bin/env node
// Purity gate for the shared core (design D-2, task T-0.1).
// Usage: node scripts/check-core-purity.mjs <core-dir>
// Prints "<file>:<line>: <identifier>" for every banned reference and exits 1;
// exits 2 when the directory is missing or holds no source file to scan.
// The core's test/ directory is harness code run by Node and Vitest, so it is not scanned.
//
// Code generation and computed imports are refused too, because each one builds a reference
// from a string the lexer cannot read: `eval`, any `Function` reference (so `Function(...)` and
// `new Function(...)`), `self`, a `.constructor` or `["constructor"]` access (the route from any
// function to its Function constructor), and a dynamic `import(` whose argument is not a single
// string literal. `globalThis` is refused outright, so a computed key on it fails as well.
// Claude Code's mod environment refuses `eval` and `new Function` at run time; this matches it.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const BANNED_GLOBALS = [
  "eval",
  "Function",
  "self",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearTimeout",
  "clearInterval",
  "queueMicrotask",
  "requestAnimationFrame",
  "window",
  "document",
  "process",
  "globalThis",
  "console",
  "Buffer",
  "global",
  "require",
  "__dirname",
  "__filename",
];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const SKIPPED_DIRS = new Set(["test", "node_modules"]);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function listSources(dir, top) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === top && SKIPPED_DIRS.has(entry.name)) continue;
      if (entry.name === "node_modules") continue;
      files.push(...listSources(path, top));
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name)) && !entry.name.endsWith(".d.ts")) {
      files.push(path);
    }
  }
  return files.sort();
}

// Blanks comments and string contents (keeping newlines, so offsets and lines hold) and
// records every string literal, so identifiers are matched in code only and module
// specifiers can be read back.
function lex(text) {
  const out = text.split("");
  const strings = [];
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  const braceStack = [];
  let i = 0;
  const readQuoted = (quote) => {
    const start = i;
    i++;
    let value = "";
    while (i < text.length && text[i] !== quote && text[i] !== "\n") {
      if (text[i] === "\\") {
        value += text[i + 1] ?? "";
        i += 2;
      } else {
        value += text[i];
        i++;
      }
    }
    i++;
    strings.push({ start, end: i, value });
    blank(start + 1, Math.min(i - 1, text.length));
  };
  const readTemplate = () => {
    const segStart = i;
    while (i < text.length) {
      if (text[i] === "\\") {
        i += 2;
      } else if (text[i] === "`") {
        blank(segStart, i);
        i++;
        return;
      } else if (text[i] === "$" && text[i + 1] === "{") {
        blank(segStart, i);
        i += 2;
        braceStack.push("template");
        return;
      } else {
        i++;
      }
    }
    blank(segStart, i);
  };
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'") {
      readQuoted(c);
    } else if (c === "`") {
      i++;
      readTemplate();
    } else if (c === "{") {
      braceStack.push("code");
      i++;
    } else if (c === "}") {
      i++;
      if (braceStack.pop() === "template") readTemplate();
    } else {
      i++;
    }
  }
  return { code: out.join(""), strings };
}

function lineOf(text, offset) {
  let line = 1;
  for (let k = 0; k < offset; k++) if (text[k] === "\n") line++;
  return line;
}

function scanFile(file, coreRoot) {
  const text = readFileSync(file, "utf8");
  const { code, strings } = lex(text);
  const hits = [];
  const pattern = new RegExp(`(?<![\\w$.])(${BANNED_GLOBALS.join("|")})(?![\\w$])`, "g");
  for (const match of code.matchAll(pattern)) {
    hits.push({ line: lineOf(text, match.index), identifier: match[1] });
  }
  for (const match of code.matchAll(/\.\s*constructor(?![\w$])/g)) {
    hits.push({ line: lineOf(text, match.index), identifier: ".constructor" });
  }
  const stringAt = new Map(strings.map((s) => [s.start, s]));
  const skipSpace = (from) => {
    let k = from;
    while (k < code.length && /\s/.test(code[k])) k++;
    return k;
  };
  for (const match of code.matchAll(/(?<![\w$.])import\s*\(/g)) {
    const literal = stringAt.get(skipSpace(match.index + match[0].length));
    const next = literal === undefined ? "" : code[skipSpace(literal.end)];
    if (next !== ")" && next !== ",") {
      hits.push({
        line: lineOf(text, match.index),
        identifier: "import() of a computed specifier",
      });
    }
  }
  for (const { start, value } of strings) {
    if (value === "constructor" && /\[\s*$/.test(code.slice(Math.max(0, start - 40), start))) {
      hits.push({ line: lineOf(text, start), identifier: '["constructor"]' });
    }
    const before = code.slice(Math.max(0, start - 40), start);
    if (!/(\bfrom|\bimport|\bimport\s*\(|\brequire\s*\(|\bexport\s*\*)\s*$/.test(before)) continue;
    const relativePath = value.startsWith("./") || value.startsWith("../");
    const target = relativePath ? resolve(dirname(file), value) : "";
    const insideCore = relativePath && (target === coreRoot || target.startsWith(coreRoot + sep));
    if (!insideCore) hits.push({ line: lineOf(text, start), identifier: `import ${value}` });
  }
  return hits.sort((a, b) => a.line - b.line);
}

function display(file) {
  const rel = relative(REPO_ROOT, file);
  return rel.startsWith("..") || isAbsolute(rel) ? file : rel;
}

function main(args) {
  if (args.length !== 1) {
    console.error("usage: check-core-purity.mjs <core-dir>");
    return 2;
  }
  const coreRoot = resolve(args[0]);
  let isDir = false;
  try {
    isDir = statSync(coreRoot).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) {
    console.error(`check-core-purity: ${args[0]} is not a directory`);
    return 2;
  }
  const files = listSources(coreRoot, coreRoot);
  if (files.length === 0) {
    console.error(`check-core-purity: no source file under ${args[0]}, nothing was checked`);
    return 2;
  }
  let count = 0;
  for (const file of files) {
    for (const hit of scanFile(file, coreRoot)) {
      console.log(`${display(file)}:${hit.line}: ${hit.identifier}`);
      count++;
    }
  }
  if (count > 0) {
    console.error(`check-core-purity: ${count} banned reference(s) in ${args[0]}`);
    return 1;
  }
  console.log(`check-core-purity: ${files.length} file(s) clean`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
