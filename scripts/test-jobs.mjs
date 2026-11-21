#!/usr/bin/env node
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
