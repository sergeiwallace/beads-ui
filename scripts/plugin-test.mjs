#!/usr/bin/env node
// `node scripts/plugin-test.mjs <mod folder>`: the mod's tests, at most BEADS_UI_TEST_JOBS files at
// a time (one by one by default). `claude plugin test <dir>` starts one child per test file all at
// once and has no option to bound that, so this runs the same children itself: each
// `claude plugin test --file <file> <dir>` runs one file in the mod environment and prints one
// `claude-plugin-test-report` line. The run fails, naming the file, when a test fails, when a child
// exits non-zero, or when a child prints no report.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { testJobs } from "./test-jobs.mjs";

const REPORT_PREFIX = "claude-plugin-test-report ";
const TEST_FILE = /\.test\.tsx?$/;

function testFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...testFiles(path));
    else if (TEST_FILE.test(entry.name)) found.push(path);
  }
  return found.sort();
}

function runFile(file, modDir) {
  return new Promise((done) => {
    const child = spawn("claude", ["plugin", "test", "--file", file, modDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => done({ status: null, stdout, stderr: error.message }));
    child.on("close", (status, signal) => done({ status, signal, stdout, stderr }));
  });
}

function reportOf(stdout) {
  const line = stdout.split("\n").find((l) => l.startsWith(REPORT_PREFIX));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(REPORT_PREFIX.length));
  } catch {
    return null;
  }
}

async function main() {
  const [dirArg] = process.argv.slice(2);
  if (!dirArg) {
    console.error("usage: node scripts/plugin-test.mjs <mod folder>");
    return 2;
  }
  let jobs;
  try {
    jobs = testJobs();
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const modDir = resolve(dirArg);
  const files = testFiles(modDir);
  if (files.length === 0) {
    console.error(`plugin-test: no *.test.ts or *.test.tsx under ${modDir}`);
    return 1;
  }

  let pass = 0;
  let fail = 0;
  const failedFiles = [];
  const queue = [...files];
  const started = Date.now();

  async function worker() {
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      const name = relative(modDir, file);
      console.log(`run ${name}`);
      const run = await runFile(file, modDir);
      const report = reportOf(run.stdout);
      const lines = [`${name}:`];
      let fileFailed = false;
      for (const result of report?.results ?? []) {
        const ms = `[${Number(result.ms).toFixed(2)}ms]`;
        if (result.failure) {
          fail += 1;
          fileFailed = true;
          lines.push(`(fail) ${result.title} ${ms}`);
          lines.push(
            ...String(result.failure)
              .split("\n")
              .map((l) => `  ${l}`),
          );
        } else {
          pass += 1;
          lines.push(`(pass) ${result.title} ${ms}`);
        }
      }
      if (!report) {
        fileFailed = true;
        lines.push(`(fail) no test report from claude plugin test --file`);
      }
      if (run.status !== 0) {
        fileFailed = true;
        lines.push(`(fail) claude plugin test --file exited ${run.status ?? run.signal}`);
      }
      if (fileFailed) {
        failedFiles.push(name);
        if (run.stderr.trim())
          lines.push(
            ...run.stderr
              .trimEnd()
              .split("\n")
              .map((l) => `  ${l}`),
          );
      }
      console.log(lines.join("\n"));
    }
  }

  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));

  const seconds = ((Date.now() - started) / 1000).toFixed(2);
  console.log(`\n ${pass} pass\n ${fail} fail`);
  console.log(
    `Ran ${pass + fail} tests across ${files.length} files, ${jobs} at a time. [${seconds}s]`,
  );
  if (failedFiles.length > 0) {
    console.log(`Failed files:\n${failedFiles.map((f) => `  ${f}`).join("\n")}`);
    return 1;
  }
  return 0;
}

process.exitCode = await main();
