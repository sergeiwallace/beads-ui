import { test as kitTest } from "claude-code/testing";

/**
 * The hooks tests' default per-test timeout, measured on host-c (16 cores) on 2026-10-24.
 *
 * Every test pays one load of the hooks module: the kit loads register.ts and everything it
 * imports afresh in each test's `$.session.start`. That load is most of an ordinary test: about
 * 390 ms of 520 ms (medians) with one test file running at load 14 to 18, and a median 1.6 s,
 * up to 4.2 s, with every hooks file running at once at load 18 to 50, while the mount, the
 * first render and the stubbed `$.process` and `$.fs` calls stayed in the tens to hundreds of ms.
 * A module of the same name that imports nothing loads in 12 to 30 ms, and the same graph
 * bundled into one file loads no faster, so the cost is the kit's per-test load of this much
 * code, which this repository cannot move. It is not a first-test cost: under load a file's
 * later tests ran as long as its first, and the slowest test with no options of its own took
 * 10.5 s at load 50 (11.0 s at load 37 to 43 in BU-slr), past `claude plugin test`'s 5000 ms.
 *
 * 20 s is about twice that worst measured test. `claude plugin test` takes no suite-wide or
 * describe-level setting (a bunfig.toml and `describe(name, options, body)` were both tried on
 * 2.1.310), so the default is applied here.
 */
export const HOOKS_TIMEOUT_MS = 20_000;

/** The kit's `test`, with HOOKS_TIMEOUT_MS when the test names no options of its own. */
export const test = ((name: string, options: unknown, body?: unknown) =>
  body === undefined
    ? (kitTest as (...args: unknown[]) => unknown)(name, { timeoutMs: HOOKS_TIMEOUT_MS }, options)
    : (kitTest as (...args: unknown[]) => unknown)(name, options, body)) as typeof kitTest;
