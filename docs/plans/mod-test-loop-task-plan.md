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
| A001 | "why is the test job taking 2 hours? that's insane. way too long..." | [T-01](#t-01-the-mods-loop-runs-as-its-own-turbo-task-from-the-start) takes the mod's loop off the end of the mod's Vitest suite and starts it first; [T-02](#t-02-the-engine-start-measured-against-the-test-time) measures the engine start and records why the loop is not batched; [Measurements](#measurements) records each step; no test leaves the commit gate |

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
done. This part runs that loop as its own turbo task, started first, so it runs beside everything
else. Every test stays in the commit gate.

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

- [ ] When `npm test` runs, turbo shall run the mod's loop once, as the `test:mod` task, and the
  mod's `test` task shall not run it.
- [ ] When `npm test` runs at `BEADS_UI_TEST_JOBS=2`, the loop task and the script tests shall be
  the first two tasks started, no package's `test` task shall start before the script tests end,
  and no more than 2 tasks shall run at once.
- [ ] When the loop task runs, it shall get `BEADS_UI_TEST_JOBS`, and its pass count shall match
  the baseline's 978.
- [ ] If the commit hook stops running the loop, then the script tests shall fail.

**Dependencies:** None

### T-02: The engine start, measured against the test time

**Size:** S
**Batch:** 1

Measure, per file, the wall time of `claude plugin test --file` against the sum of its tests' own
times, and probe whether the CLI can run several files in one process.

**Acceptance criteria:**

- [ ] The measurement and the batching outcome are recorded in [Measurements](#measurements), with
  the evidence for the outcome.

**Dependencies:** None

### T-03: The loop leaves the commit gate, only if still needed

**Size:** S
**Batch:** 2

Applied only if the commit hook is still above a few minutes at LOOK after T-01 and T-02.

**Dependencies:** T-01, T-02 and the measurement after them

## Batch Plan

| Batch | Tasks | Focus | Exit gate |
|-------|-------|-------|-----------|
| 1 | T-01, T-02 | The loop as its own task; the engine start measured | ACs checked; the commit hook measured |
| 2 | T-03 | Only if the hook is still above a few minutes | The commit hook measured |

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

### After T-01

Recorded once T-01 is built.

## Implementation Audit

Recorded once T-01 is built.

## Human Gates

| Gate | After | Decision needed |
|------|-------|-----------------|
| Plan approval | Before coding | None: every decision below is settled and none needs the maintainer first |
| Built review | After it is merged | The maintainer reviews D-1 once the change is live |

## Decisions

### Decision Summary

| # | Decision | Options Considered | Recommended (AI) | Chosen | Diverged? | Rationale | Status |
|---|----------|-------------------|------------------|--------|-----------|-----------|--------|
| <a id="d-1"></a>D-1 | How the loop task gets to start first | (a) A `test:mod` task alone, (b) `test:mod` plus the script tests as a root task every `test` task depends on, (c) the loop beside turbo, outside it | (b) | (b) | No | Turbo's start order changes per run; (b) leaves the loop and the script tests the only tasks ready at the start, inside one concurrency bound | `Resolved` |

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

## Open Questions

None.

## Approval Log

| Date | Decision | Actor | Notes |
|------|----------|-------|-------|
| 2026-11-22 | D-1 | AI (Claude Opus, engineer) | Resolved from the turbo start-order probe; built on, for the maintainer's review after it is live |

<!-- /doc:region name="overview" -->
