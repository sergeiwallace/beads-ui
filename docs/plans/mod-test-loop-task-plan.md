---
title: "Fast commit gate, part three: the mod's test loop as its own turbo task"
category: plan
tags: [plan, testing, hooks, turbo]
status: active
template_version: "plan-1.0.0"
---

<!-- doc:region name="overview" kind="replaceable" -->

# Fast commit gate, part three: the mod's test loop as its own turbo task

## Founding Ask Coverage

`canonical_root_json`: `{"blob_oid":"e922987f42a93b53d6a9b3e7a226ce68933c23fd","capture_commit":"0547464ad2be7378cfd6e97cbaa00a54dd17be89","content_sha256":"f6a24617e09c4b3c344b236524ff16b86a4576ac120077af19818a1bcfb34029","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-0vp.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-0vp"}`

`founding_ask_ref_sha256`: `daaf0664755476015a5d6a484d67f2ae78bc34322be029fc1683106e9bf6ad4d`

The founding ask record has one entry, A001, recorded verbatim in ai-harness at `docs/asks/BU-0vp.md`. This index is non-authoritative; the raw entry governs.

| Entry | Clause | Coverage and disposition |
|---|---|---|
| A001 | "why is the test job taking 2 hours? that's insane. way too long..." | [T-01](#t-01-the-mods-loop-runs-as-its-own-turbo-task-from-the-start) takes the mod's loop off the end of the mod's Vitest suite and starts it first; [T-02](#t-02-the-engine-start-measured-against-the-test-time) measures the engine start and records why the loop is not batched; [T-04](#t-04-the-pre-push-stage-runs-the-mods-loop-and-the-script-tests) makes the pre-push stage run the loop and the script tests; [T-03](#t-03-the-loop-leaves-the-commit-gate-only-if-still-needed) then moves the loop out of the commit gate, declared in [D-2](#d-2) with the measurement that forced it; [Measurements](#measurements) records each step |

**Status:** BUILT

**Created:** 2026-11-22

## Table of Contents

- [Founding Ask Coverage](#founding-ask-coverage)
- [Summary for a wide audience](#summary-for-a-wide-audience)
- [Overview](#overview)
- [Task Breakdown](#task-breakdown)
  - [T-01: The mod's loop runs as its own turbo task, from the start](#t-01-the-mods-loop-runs-as-its-own-turbo-task-from-the-start)
  - [T-02: The engine start, measured against the test time](#t-02-the-engine-start-measured-against-the-test-time)
  - [T-03: The loop leaves the commit gate, only if still needed](#t-03-the-loop-leaves-the-commit-gate-only-if-still-needed)
  - [T-04: The pre-push stage runs the mod's loop and the script tests](#t-04-the-pre-push-stage-runs-the-mods-loop-and-the-script-tests)
  - [T-05: No test store sees a git hook's repository](#t-05-no-test-store-sees-a-git-hooks-repository)
- [Batch Plan](#batch-plan)
- [Measurements](#measurements)
- [Implementation Audit](#implementation-audit)
- [Human Gates](#human-gates)
- [Decisions](#decisions)
- [Open Questions](#open-questions)
- [Approval Log](#approval-log)

## Summary for a wide audience

The [second part](vitest-server-suites-plan.md) brought a commit's hook on a loaded 16-core host
to about 6 minutes. What was left was one turbo task: the mod's Vitest suite and then, in the same
task, its `claude plugin test` loop, which nothing else overlapped once the other packages were
done. This part runs that loop as its own turbo task. Started first, beside everything else, it
took the hook from 6.2 minutes to between 4.5 and 5.5 on that host, and was then most of what was
left. So
the loop now runs before every push instead of at every commit, as the web app's server suites
already do, and a commit's hook runs the rest of its suites: every package's Vitest suite (the web
app's server suites aside, as before) and the repository's script tests. The pre-push stage did not
run the loop or the repository's script tests before; now it runs both. On that host a commit's hook
now takes 145 to 236 s (2.5 to 4 minutes) at LOOK, under 3 minutes in four of those five runs, and
took 328 s once when the host went from LOOK to HOLD during it.

## Overview

At the base, `npm test` runs `turbo run test` at `--concurrency=BEADS_UI_TEST_JOBS`, then the
repository's script tests (`node --test scripts/*.test.mjs`). The mod's `test` script is
`vitest run && node ../../scripts/plugin-test.mjs .`, so its Vitest suite and its loop (978 tests in
63 files, each file in its own `claude plugin test --file` process, `BEADS_UI_TEST_JOBS` at a time)
run back to back in one turbo slot. At this plan's head the three are separate turbo tasks, and
which of them each gate runs is set out in [T-03](#t-03-the-loop-leaves-the-commit-gate-only-if-still-needed).

The decision taken before this plan, in order: (1) run the loop as its own turbo task, keeping the
`BEADS_UI_TEST_JOBS` squared bound and every test in the commit gate, and measure; (2) measure what
one file's engine start costs against its test time, and batch files into one process only if
`claude plugin test` can do that with each file's isolation proved; (3) only if the hook is still
above a few minutes at LOOK, move the loop to pre-push, declared here with its measurement.

Two things found before building shaped (1) ([D-1](#d-1)):

- Turbo starts tasks that are ready at the same time in an order that changes from run to run. In
  a fixture with the repository's packages, five runs of `turbo run test test:mod --concurrency=1`
  started the loop task 1st, 5th, 3rd, 6th and 5th of 7. A loop task that merely exists would often
  start after most of the others, and save little.
- The script tests ran after turbo, alone, for 36 s. As a root turbo task that every package's
  `test` task depends on, they and the loop are the only tasks ready when turbo starts, so the loop
  always starts at once, and the script tests overlap it instead of following everything.

## Task Breakdown

### T-01: The mod's loop runs as its own turbo task, from the start

**Size:** S
**Batch:** 1

The mod's `test` script runs `vitest run`; a new `test:mod` script runs
`node ../../scripts/plugin-test.mjs .`. The root `test` script runs
`turbo run test test:mod --concurrency={jobs}`, and a root `test:scripts` script runs the script
tests. `turbo.json` declares `test:mod` and the root task `//#test:scripts`, and makes `test` depend
on `//#test:scripts`. Turbo's concurrency still counts every task, the loop's included, and each
task still runs at most `BEADS_UI_TEST_JOBS` workers, so a run starts at most `BEADS_UI_TEST_JOBS`
squared test processes, as before.

**Deliverables:**

- Files modified: `package.json`, `turbo.json`, `plugins/beads-ui/package.json`,
  `scripts/test-gate-bound.test.mjs`, `CONTRIBUTING.md`, `docs/procedures/web-run.md`,
  `docs/adr/0001-contributor-environment-and-gates.md`

**Acceptance criteria:**

- [x] When `npm test` runs, turbo shall run the mod's loop once, as the `test:mod` task, and the
  mod's `test` task shall not run it.
- [x] When `npm test` runs at `BEADS_UI_TEST_JOBS=2`, the loop task and the script tests shall be
  the first two tasks started, no package's `test` task shall start before the script tests end,
  and no more than 2 tasks shall run at once. Built and measured; then removed by T-03, which
  takes the loop out of the commit run, where the dependency would leave a slot idle
  ([D-2](#d-2)).
- [x] When the loop task runs, it shall get `BEADS_UI_TEST_JOBS`, and its pass count shall match
  the baseline's 978.
- [x] If the commit hook stops running the loop, then the script tests shall fail. Superseded by
  T-03: the script tests now fail if the commit hook runs it.

**Dependencies:** None

### T-02: The engine start, measured against the test time

**Size:** S
**Batch:** 1

Measure, per file, the wall time of `claude plugin test --file` against the sum of its tests' own
times, and probe whether the CLI can run several files in one process.

**Acceptance criteria:**

- [x] The measurement and the batching outcome are recorded in [Measurements](#measurements), with
  the evidence for the outcome.

**Dependencies:** None

### T-03: The loop leaves the commit gate, only if still needed

**Size:** S
**Batch:** 2

Applied only if the commit hook is still above a few minutes at LOOK after T-01 and T-02, and
only once T-04 is in. It was: 271 to 332 s ([D-2](#d-2)).

The commit hook runs `npm run test:commit`, a root script that runs
`turbo run test //#test:scripts --concurrency={jobs}`: every package's Vitest suite and the script
tests, not `test:mod`. `npm test` runs all three tasks, `test:mod` included, and `npm run test:push`
runs `test:mod` and `//#test:scripts`. The `test` task no longer depends on `//#test:scripts`:
without the loop in the commit run, that dependency would hold every package's suite until the
script tests end, with one slot idle.

**Deliverables:**

- Files modified: `package.json`, `turbo.json`, `.pre-commit-config.yaml`,
  `scripts/test-gate-bound.test.mjs`, `CONTRIBUTING.md`, `docs/procedures/web-run.md`,
  `docs/adr/0001-contributor-environment-and-gates.md`

**Acceptance criteria:**

- [x] When the commit hook runs, it shall run every task `npm test` runs except the mod's loop.
- [x] When `npm test`, `npm run test:commit` or `npm run test:push` runs, no more than
  `BEADS_UI_TEST_JOBS` tasks shall run at once, and each shall get `BEADS_UI_TEST_JOBS`.
- [x] If the commit hook runs `npm test` again, or `test:commit` runs `test:mod`, then the script
  tests shall fail.

**Dependencies:** T-01, T-02, T-04 and the measurement after them

### T-04: The pre-push stage runs the mod's loop and the script tests

**Size:** S
**Batch:** 2

Found while building T-01: the pre-push stage ran `test-gate` (every Vitest project, through
`npx vitest run`) and `e2e`, but neither the mod's loop nor the script tests, which ran only inside
the commit hook's `npm test`. A new pre-push hook, `mod-and-script-tests`, runs
`npm run test:push` with `BEADS_UI_TEST_SCOPE` cleared, as `test-gate` does. It does not run the
Vitest suites again. This is the precondition for T-03.

**Deliverables:**

- Files modified: `.pre-commit-config.yaml`, `package.json`, `scripts/test-gate-bound.test.mjs`,
  `CONTRIBUTING.md`, `docs/procedures/web-run.md`,
  `docs/adr/0001-contributor-environment-and-gates.md`

**Acceptance criteria:**

- [x] When a push runs its hooks, the `mod-and-script-tests` hook shall run exactly the mod's loop
  and the script tests, with `BEADS_UI_TEST_SCOPE` cleared.
- [x] If a mod test or a script test fails, then the push shall fail.
- [x] If the hook is removed or moved to another stage, then the script tests shall fail.

**Dependencies:** T-01

### T-05: No test store sees a git hook's repository

**Size:** S
**Batch:** 3

Found when this stack was first pushed: the pre-push `e2e` hook failed 136 of 143 specs, 133 at
`bd init`, which refused because it found the pushed repository's own server-mode store. git
exports `GIT_DIR` to its hooks, and a test's `bd init` in a fresh temporary directory resolved it.
With an embedded store in the host repository `bd init` does not refuse: it commits the new store's
files into that repository. `apps/web/test/exec.ts` runs a command with the repository variables
git exports to hooks removed (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`,
`GIT_OBJECT_DIRECTORY`, `GIT_PREFIX`), and every store factory, the command-line suites' host
environment, the e2e adapter's served host and its seed templates, and every suite that runs `bd`
or `git` itself use it. With the stores fixed, `apps/web`'s Vitest suite under `GIT_DIR` still
failed 176 of 400 tests with 503s: the in-process server found the hook's repository through
`GIT_DIR`, a fault the store failure had hidden (at the base the same run fails earlier, at
`bd init`). The Vitest global setup now deletes the same variables before any worker starts.

**Deliverables:**

- Files created: `apps/web/test/exec.ts`, `apps/web/test/store-git-env.test.ts`
- Files modified, for the run-wide clear: `apps/web/test/global-setup.ts`
- Files modified: `apps/web/test/store.ts`, `apps/web/test/host-stores.ts`,
  `apps/web/test/auth-env.ts`, `apps/web/test/heads-feed.test.ts`, `apps/web/e2e/harness/adapter.ts`,
  `apps/web/e2e/harness-adapter.spec.ts`, `docs/procedures/web-run.md`

**Acceptance criteria:**

- [x] When `GIT_DIR` and `GIT_INDEX_FILE` name a repository with its own Beads store,
  `createStore` (through `bd init`) and `repoStore` shall each make a store of their own, and the
  host repository's HEAD, status and store metadata shall not change.
- [x] When the e2e suite runs with `GIT_DIR` set to the worktree's git directory, as the pre-push
  hook runs it, no spec shall fail at `bd init`.
- [x] When `apps/web`'s Vitest suite runs with `GIT_DIR` set, it shall pass as it does without.

**Dependencies:** None

## Batch Plan

| Batch | Tasks | Focus | Exit gate |
|-------|-------|-------|-----------|
| 1 | T-01, T-02 | The loop as its own task; the engine start measured | ACs checked; the commit hook measured |
| 2 | T-04, then T-03 | The loop and the script tests at pre-push; then, only if the hook is still above a few minutes, the loop out of the commit gate | ACs checked; the commit hook and the new pre-push hook measured |
| 3 | T-05 | Test stores kept from a hook's repository | ACs checked; the e2e suite run as the pre-push hook runs it |

## Measurements

Every run is on the same loaded 16-core host at `BEADS_UI_TEST_JOBS=2`, with the host's contention
reading and load average taken at the start and the end of the run. The commit hook is timed on a
small change: one new two-byte file under `apps/web/` staged, every hook of the pre-commit stage
run with `pre-commit run --verbose`.

### Before (the second part's head, 7506ba1)

| What | Result |
|---|---|
| Contention, start and end | LOOK, load 16.7 and 20.2 on 16 cores |
| Commit hook, wall time | 303 s (5.1 min), passed |
| `npm-test` hook | 293 s: turbo 257 s, then the script tests 36 s (73 passed) |
| The mod's turbo task | Vitest 61 s (47 files, 584 passed), then its loop 175 s (978 passed, 63 files, 2 at a time) |
| Other packages, Vitest's own duration | `mcp-server` 42 s (16), `web-ui` 19 s (149), `apps/web` 12 s (92), `terminal` 12 s (21), `bd-node` 5 s (47) |

### The engine start against the test time (T-02)

Each of the 63 files run with `claude plugin test --file <file> plugins/beads-ui`, 2 at a time, at
LOOK (load 21.9 to 28.7), timing each process and reading its tests' own times from its report:

| What | Result |
|---|---|
| Files, tests | 63 files; 978 tests, 978 passed |
| Wall time, 2 at a time | 201 s |
| Summed process wall time | 383 s |
| Summed test time | 327 s (85%) |
| Outside the tests (engine start and the file's own imports) | 56 s (15%); per file 0.26 s at least, 0.79 s median, 1.66 s at most |
| Longest files | `hooks/pane` 38.6 s, `hooks/panel` 38.4 s, `hooks/bands` 33.9 s, `hooks/sync` 26.2 s, `hooks/timeline` 26.0 s |

A one-test file in a fixture mod takes 0.22 to 0.26 s end to end. The test time is the larger
share by far, so batching would save at most the 56 s spread over two workers, about 28 s of wall
time, and the CLI offers no sound way to do it: `claude plugin test` takes one `--file` (a second
`--file`, or a second file path, is read as the mod's folder and refused: `no such plugin folder`),
and its folder mode, per its own help, runs "each file in a child of this binary", so it shares no
process across files either, and has no bound on how many children it starts at once. The loop is
not batched.

### After T-01 and T-04

The commit hook on the branch after T-04 (f9dc5b2) against the base (7506ba1), measured in turn on
the same host: before, after, after, before. The first two pairs:

| Run | Contention, start and end | Commit hook | Turbo | The mod's loop | The mod's Vitest | Script tests |
|---|---|---|---|---|---|---|
| Base, first | LOOK, load 26.2 and 26.1 | 372 s | 324 s, then the script tests | 232 s, after its Vitest | 89 s | 33 s, 73 passed, after turbo |
| After, first | LOOK, load 26.1 and 25.6 | 271 s | 258 s, the script tests inside | 244 s, from the start | 91 s | 56 s, 80 passed |
| After, second | LOOK, load 25.6 and 39.5 | 332 s | 320 s | 313 s | 129 s | 43 s, 80 passed |
| After, at the T-04 commit | LOOK, load 24.3 and 35.0 | 281 s | 269 s | 256 s | 90 s | 61 s, 80 passed |

Every run passed. The loop's 978 tests, the mod's Vitest suite's 584 and every other package's
counts (`web-ui` 149, `apps/web` 92 under the commit scope, `bd-node` 47, `terminal` 21,
`mcp-server` 16) match the base. The script tests went from 73 to 80: the seven are the new tests
of the turbo wiring and of the pre-push hook.

Running the loop beside everything else took the hook from 372 to 271 s at the same load, and
turbo now ends a few seconds after the loop does: the loop is the hook's floor. At this host's
LOOK the loop alone takes 244 to 313 s, so no commit hook that runs it can finish in a few minutes.
T-03 applies ([D-2](#d-2)).

### After T-03

The commit hook on the final branch, the same small change, `pre-commit run --verbose`:

| What | Base, first run | After T-03 |
|---|---|---|
| Contention, start and end | LOOK, load 26.2 and 26.1 | LOOK, load 29.3 and 29.9 |
| Commit hook, wall time | 372 s (6.2 min) | 148 s (2.5 min) |
| `npm-test` hook | 357 s | 138 s, turbo 137 s |
| The mod's Vitest, then its loop | 89 s, then 232 s | 98 s; the loop runs at pre-push |
| Script tests | 33 s, 73 passed, after turbo | 63 s, 83 passed, inside turbo |
| Other packages' tests | `web-ui` 149, `apps/web` 92, `bd-node` 47, `terminal` 21, `mcp-server` 16 passed | the same |

Each commit on the branch after T-03, timed around `git commit` with `BEADS_UI_TEST_JOBS=2`, every
one passed: 236 s at LOOK, load 33.0 to 35.6, for T-03 itself; 165 s, load 34.6 to 30.2, for the
test fix after it; 178 s, load 30.1 to 32.8, for T-05; 328 s for the T-05 follow-up, during which
the host went from LOOK to HOLD (load 49.2 to 51.9, then about 400k swap-outs a minute); 145 s,
load 30.8 to 30.4, for the run-wide clear.

The pre-push `mod-and-script-tests` hook alone (`npm run test:push`, `BEADS_UI_TEST_SCOPE`
cleared), at LOOK, load 29.9 to 34.0: 294 s, the loop 978 passed in 294 s and the script tests 83
passed beside it. It adds that to a push, which before ran neither.

The script tests went from 73 to 83: the ten are the wiring's tests in
`scripts/test-gate-bound.test.mjs` (two dry-run checks of which tasks `npm test` and the commit
hook run, four fixture runs of the commit hook and `npm run test:push` at each bound, and the four
pre-push hook tests).

### T-05: the e2e suite as the pre-push hook runs it

`npm run test:e2e` at `BEADS_UI_TEST_JOBS=2` with `GIT_DIR` set to the worktree's git directory,
as git sets it for the pre-push hook, every time at LOOK:

| Run | Load start to end | Passed | Failed | Skipped | Wall time |
|---|---|---|---|---|---|
| The push that found it (the stack's base, as reported; not run here) | not recorded | 7 | 136, 133 at `bd init` | not recorded | not recorded |
| After the store factories' fix (7f2b64c) | 30.1 to 40.3 | 123 | 17, every one at `bd init` in the adapter's seed template or a spec's own `bd init` | 46 | 1,244 s |
| Those two spec files after the follow-up (926991b) | 43.4 at the start | 23 | 0 | 23 | 5.3 min |
| After the follow-up (926991b) | 39.3 to 38.5 | 140 | 0 | 46 | 1,514 s |

The 46 skipped are the specs that run at one viewport only, as on every run. After each run the
branch head and the working tree were unchanged.

`apps/web`'s whole Vitest suite (`npx vitest run` in `apps/web`) under the same `GIT_DIR`, at LOOK:
after the store fixes, 223 passed, 1 skipped and 176 failed, almost all with 503 from an in-process server that
read the hook's repository; after the run-wide clear, load 34.3 to 33.9, 585 s, 28 files, 399
passed, 1 skipped, 0 failed.

The pre-push `mod-and-script-tests` hook under the same `GIT_DIR` (`npm run test:push`, the
scope cleared), at LOOK, load 38.5 to 33.6: 299 s; the loop 978 passed, the script tests 83 passed.

## Implementation Audit

Checked against the branch head; each item names the test or the measurement that shows it. Every
new test was run once with the behaviour it names removed, and failed.

### T-01: The mod's loop runs as its own turbo task, from the start

- [x] The loop runs once, as `test:mod`, in `npm test`: "should run every package's suite, the
  mod's loop once and the script tests when npm test runs"; it fails when `npm test` drops
  `test:mod` or the mod's `test` script runs the loop again.
- [x] The loop and the script tests started first: built and measured ([After T-01 and
  T-04](#after-t-01-and-t-04)); the dependency and its tests were then removed with T-03.
- [x] The loop gets `BEADS_UI_TEST_JOBS` and passes 978: the fixture runs check the bound each task
  sees, and every measured run passed 978.

### T-02: The engine start, measured against the test time

- [x] Recorded in [The engine start against the test time](#the-engine-start-against-the-test-time-t-02).

### T-03: The loop leaves the commit gate

- [x] The commit hook runs every task `npm test` runs but `test:mod`: "should run what npm test
  runs but the mod's loop when the commit's test hook runs" and the commit hook fixture runs, which
  drive the hook's own entry through `scripts/test-hook.mjs` and npm. They fail when the commit
  runs `test:mod`, drops the script tests, or the hook runs `npm test` again.
- [x] The bound holds for each gate: the fixture runs at `BEADS_UI_TEST_JOBS` unset and 2; they
  fail when the commit's concurrency ignores the bound or the variable no longer reaches the tasks.

### T-04: The pre-push stage runs the mod's loop and the script tests

- [x] "should run the mod's loop and the script tests, and nothing else, at pre-push", "should pass
  the push when the loop and the script tests pass, with the scope cleared" and the two "should
  fail the push" tests; they fail when the hook is missing, moves to pre-commit, swallows a failure,
  keeps the scope, or drops either task.

### T-05: No test store sees a git hook's repository

- [x] `store-git-env.test.ts`, both cases; both fail with the variables left in place (the host
  repository gained a commit of the new store's metadata).
- [x] The e2e runs and the `apps/web` Vitest runs above.

### Review

Two cross-family review rounds (Codex). The first, on T-01 and T-04, found the start-order
guarantee holding only at `BEADS_UI_TEST_JOBS=2`, the squared bound not counting what a script test
starts, the script tests never run inside an outer turbo task by a test, timer-based overlap in the
start-order fixture, and the docs contradicting the new wiring. T-03 removed the dependency the
first and fourth were about; the docs now say the bound counts test workers and describe the
wiring at the head; the script tests run inside turbo in every commit hook and pre-push run
measured above, which is the check the third asked for. The second, on T-03, found timer-based
overlap in the new fixture, the plan's overview describing the base as if current, and the commit
cases calling the root script instead of the hook. The fixture now waits on a barrier at
`BEADS_UI_TEST_JOBS=2`, the overview says which state it describes, and the commit cases run the
hook's own entry. The older `turbo's concurrency` fixture keeps its 800 ms timer, as it was.

**Audit completed:** 2026-11-22.

## Human Gates

| Gate | After | Decision needed |
|------|-------|-----------------|
| Plan approval | Before coding | None: every decision below is settled and none needs the maintainer first |
| Built review | After it is merged | The maintainer reviews D-1 and D-2 once the change is live |

## Decisions

### Decision Summary

| # | Decision | Options Considered | Recommended (AI) | Chosen | Diverged? | Rationale | Status |
|---|----------|-------------------|------------------|--------|-----------|-----------|--------|
| <a id="d-1"></a>D-1 | How the loop task gets to start first | (a) A `test:mod` task alone, (b) `test:mod` plus the script tests as a root task every `test` task depends on, (c) the loop beside turbo, outside it | (b) | (b) | No | Turbo's start order changes per run; (b) leaves the loop and the script tests the only tasks ready at the start, inside one concurrency bound | `Superseded by D-2` |
| <a id="d-2"></a>D-2 | Whether the mod's loop leaves the commit gate | Decided before this plan: only if the hook is above a few minutes at LOOK after T-01 and T-02 | Move it | Move it | No | The hook took 271 to 332 s at LOOK after T-01, and the loop alone 244 to 313 s of it | `Resolved` |

### Decision Details

#### D-1: How the loop task gets to start first (✅ Resolved: (b) the script tests as the root task every `test` task depends on)

**Context.** The decision taken before this plan is a loop task that starts beside the mod's
Vitest suite and the other packages, keeping the `BEADS_UI_TEST_JOBS` squared bound. Turbo has no
task priority, and starts ready tasks in an order that changes from run to run.

##### (a) A `test:mod` task alone

**Pros:**

- The smallest change: two scripts and one `turbo.json` entry.

**Cons:**

- The loop starts wherever turbo's order puts it: 1st, 5th, 3rd, 6th and 5th of 7 in five fixture
  runs. Started after most of the others it saves little, and the hook's time varies by run.

##### (b) `test:mod` plus the script tests as a root task every `test` task depends on

**Pros:**

- At the start only the loop and the script tests are ready, so at `BEADS_UI_TEST_JOBS=2` both
  start at once, every time; the other packages follow in the slot the script tests free.
- The script tests, which ran alone after turbo, now overlap the loop.
- One turbo concurrency bound still counts every task, so the squared bound holds unchanged.

**Cons:**

- A script test failure stops turbo before the packages' Vitest suites start, so that commit
  reports fewer failures at once.

##### (c) The loop beside turbo, outside it

**Pros:**

- The loop starts first by construction.

**Cons:**

- Two runners would share one bound: turbo at one less than `BEADS_UI_TEST_JOBS` beside the loop,
  which leaves nothing for turbo at 1. A new scheduler for what turbo already does.

##### Recommendation

> **Decision:** ✅ Resolved: (b) the script tests as the root task every `test` task depends on
<!-- decision-record: chosen-option=(b); ai-family=claude; ai-model=us.anthropic.claude-opus-5-5; ai-effort=medium; ai-profile=engineer -->

(b) makes the loop start first with turbo's own graph and keeps one bound. Its Con is mitigated:
before this change a failing package test stopped the run before the script tests started, so a
commit already reported one side's failures first, and this change only swaps the side; the
pre-push `test-gate` hook still runs every Vitest suite whatever the script tests do.

#### D-2: Whether the mod's loop leaves the commit gate (✅ Resolved: move it to pre-push)

Decided before this plan: T-03 applies only if the commit hook is still above a few minutes at
LOOK after T-01 and T-02, and only with a pre-push hook that runs the loop (T-04). After T-01 the
hook took 271, 281 and 332 s at LOOK (load 24 to 40), and the loop alone 244, 256 and 313 s of
those, with turbo ending within 15 s of the loop. T-02 found no saving inside the loop worth its
risk. So T-03 applies.

This narrows the commit gate, and is declared here: a commit no longer runs the mod's
`claude plugin test` loop (978 tests in 63 files). It still runs every package's Vitest suite, the
mod's 584 Vitest tests among them, which cover the shared core and the parts of the mod Vitest can
load, and the script tests. Nothing reaches the remote without the loop: the pre-push
`mod-and-script-tests` hook runs it and the script tests, and `npm test` run by hand runs it too.
The cost is that a failure only `claude plugin test` sees (a hook's `$` call, the engine's own
environment) shows at push, not at commit, as the web app's server suites already do.

It also retires D-1's dependency: with the loop gone from the commit run, holding every package's
suite until the script tests end would leave one slot idle, so `test` no longer depends on
`//#test:scripts`. The pre-push run has only the loop and the script tests, which start together
at `BEADS_UI_TEST_JOBS=2`.

## Open Questions

None.

## Approval Log

| Date | Decision | Actor | Notes |
|------|----------|-------|-------|
| 2026-11-22 | D-1 | AI (Claude Opus, engineer) | Resolved from the turbo start-order probe; built on, for the maintainer's review after it is live |
| 2026-11-22 | D-2 | AI (Claude Opus, engineer) | Resolved from the measurement after T-01; the narrowed commit gate is for the maintainer's review after it is live; superseded D-1 |

<!-- /doc:region name="overview" -->
