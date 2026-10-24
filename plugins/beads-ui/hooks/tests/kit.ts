import { test as kitTest } from "claude-code/testing";

/**
 * The hooks tests' default per-test timeout. `claude plugin test` gives each test 5000 ms and
 * takes no suite-wide or describe-level setting (a bunfig.toml and `describe(name, options,
 * body)` were both tried on 2.1.310); on a loaded host the hooks suites passed that on trees
 * that pass when re-run.
 */
export const HOOKS_TIMEOUT_MS = 30_000;

/** The kit's `test`, with HOOKS_TIMEOUT_MS when the test names no options of its own. */
export const test = ((name: string, options: unknown, body?: unknown) =>
  body === undefined
    ? (kitTest as (...args: unknown[]) => unknown)(name, { timeoutMs: HOOKS_TIMEOUT_MS }, options)
    : (kitTest as (...args: unknown[]) => unknown)(name, options, body)) as typeof kitTest;
