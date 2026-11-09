#!/usr/bin/env node
// One bound for every test runner in this repository: BEADS_UI_TEST_JOBS (default 1, at most 2).
// turbo's --concurrency, each Vitest config's maxWorkers, Playwright's workers and the plugin-test
// loop all read it, so the bounds multiply: turbo runs up to N package tasks and each task runs up
// to N workers, N * N in all. The maximum of 2 keeps one commit's test run at 4 at most
// (docs/procedures/web-run.md, Test it).
//
// As a command, `node scripts/test-jobs.mjs <command> [args...]` runs the command with every
// `{jobs}` in its arguments replaced by the bound, and exits with the command's status.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const TEST_JOBS_VAR = "BEADS_UI_TEST_JOBS";
export const DEFAULT_TEST_JOBS = 1;
export const MAX_TEST_JOBS = 2;

export function testJobs(env = process.env) {
  const raw = env[TEST_JOBS_VAR];
  if (raw === undefined || raw === "") return DEFAULT_TEST_JOBS;
  const jobs = Number(raw);
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > MAX_TEST_JOBS) {
    throw new Error(
      `${TEST_JOBS_VAR}=${raw}: expected a whole number from 1 to ${MAX_TEST_JOBS} ` +
        `(turbo's concurrency times each package's workers stays at ${MAX_TEST_JOBS * MAX_TEST_JOBS} or under)`,
    );
  }
  return jobs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error("usage: node scripts/test-jobs.mjs <command> [args...]");
    process.exit(2);
  }
  let jobs;
  try {
    jobs = testJobs();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const result = spawnSync(
    command,
    args.map((arg) => arg.replaceAll("{jobs}", String(jobs))),
    { stdio: "inherit" },
  );
  if (result.error) {
    console.error(`${command}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
