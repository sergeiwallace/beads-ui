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

**Status:** ACTIVE

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
took the hook from 6.2 to 4.5 to 5.5 minutes on that host, and was then most of what was left. So
the loop now runs before every push instead of at every commit, as the web app's server suites
already do, and a commit's hook runs every other suite. The pre-push stage did not run the loop or
the repository's script tests before; now it runs both.

## Overview

`npm test` runs `turbo run test` at `--concurrency=BEADS_UI_TEST_JOBS`, then the repository's
script tests (`node --test scripts/*.test.mjs`). The mod's `test` script is
`vitest run && node ../../scripts/plugin-test.mjs .`, so its Vitest suite and its loop (978 tests in
63 files, each file in its own `claude plugin test --file` process, `BEADS_UI_TEST_JOBS` at a time)
run back to back in one turbo slot.

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

- [ ] When the commit hook runs, it shall run every task `npm test` runs except the mod's loop.
- [ ] When `npm test`, `npm run test:commit` or `npm run test:push` runs, no more than
  `BEADS_UI_TEST_JOBS` tasks shall run at once, and each shall get `BEADS_UI_TEST_JOBS`.
- [ ] If the commit hook runs `npm test` again, or `test:commit` runs `test:mod`, then the script
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

## Batch Plan

| Batch | Tasks | Focus | Exit gate |
|-------|-------|-------|-----------|
| 1 | T-01, T-02 | The loop as its own task; the engine start measured | ACs checked; the commit hook measured |
| 2 | T-04, then T-03 | The loop and the script tests at pre-push; then, only if the hook is still above a few minutes, the loop out of the commit gate | ACs checked; the commit hook and the new pre-push hook measured |

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

## Implementation Audit

Recorded once T-01 is built.

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
