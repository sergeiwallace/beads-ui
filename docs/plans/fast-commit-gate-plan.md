---
title: "Fast commit gate: the browser suites move to pre-push and share one server per worker"
category: plan
tags: [plan, testing, hooks, e2e]
status: active
template_version: "plan-1.0.0"
---

<!-- doc:region name="overview" kind="replaceable" -->

# Fast commit gate: the browser suites move to pre-push and share one server per worker

## Founding Ask Coverage

`canonical_root_json`: `{"blob_oid":"e922987f42a93b53d6a9b3e7a226ce68933c23fd","capture_commit":"0547464ad2be7378cfd6e97cbaa00a54dd17be89","content_sha256":"f6a24617e09c4b3c344b236524ff16b86a4576ac120077af19818a1bcfb34029","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-0vp.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-0vp"}`

`founding_ask_ref_sha256`: `daaf0664755476015a5d6a484d67f2ae78bc34322be029fc1683106e9bf6ad4d`

The founding ask record has one entry, A001, recorded verbatim in ai-harness at `docs/asks/BU-0vp.md`. This index is non-authoritative; the raw entry governs.

| Entry | Clause | Coverage and disposition |
|---|---|---|
| A001 | "why is the test job taking 2 hours? that's insane. way too long..." | [T-01](#t-01-the-commit-gate-runs-no-browser-suite) takes the browser suites out of the commit gate; [T-02](#t-02-one-server-per-playwright-worker) cuts the suite's own wall time; [Measurements](#measurements) records both before and after |

**Status:** BUILT

**Created:** 2026-11-22

## Table of Contents

- [Founding Ask Coverage](#founding-ask-coverage)
- [Summary for a wide audience](#summary-for-a-wide-audience)
- [Overview](#overview)
- [Task Breakdown](#task-breakdown)
  - [T-01: The commit gate runs no browser suite](#t-01-the-commit-gate-runs-no-browser-suite)
  - [T-02: One server per Playwright worker](#t-02-one-server-per-playwright-worker)
  - [T-03: `BEADS_UI_TEST_JOBS` reaches the package tasks under turbo](#t-03-beads_ui_test_jobs-reaches-the-package-tasks-under-turbo)
  - [T-04: The adapter spec captures a ready screen on a loaded host](#t-04-the-adapter-spec-captures-a-ready-screen-on-a-loaded-host)
- [Batch Plan](#batch-plan)
- [Measurements](#measurements)
  - [Before (origin/main at ff718cc)](#before-originmain-at-ff718cc)
  - [After](#after)
  - [What the Done-when asked, and what it got](#what-the-done-when-asked-and-what-it-got)
- [Implementation Audit](#implementation-audit)
  - [T-01: The commit gate runs no browser suite](#t-01-the-commit-gate-runs-no-browser-suite-1)
  - [T-02: One server per Playwright worker](#t-02-one-server-per-playwright-worker-1)
  - [T-03: `BEADS_UI_TEST_JOBS` reaches the package tasks under turbo](#t-03-beads_ui_test_jobs-reaches-the-package-tasks-under-turbo-1)
  - [T-04: The adapter spec captures a ready screen on a loaded host](#t-04-the-adapter-spec-captures-a-ready-screen-on-a-loaded-host-1)
- [Human Gates](#human-gates)
- [Decisions](#decisions)
  - [Decision Summary](#decision-summary)
  - [Decision Details](#decision-details)
  - [D-1: Where the browser suites run](#d-1)
  - [D-2: How a test gets a clean server](#d-2)
- [Open Questions](#open-questions)
- [Approval Log](#approval-log)

## Summary for a wide audience

A commit no longer waits for the web app's browser suites. `git commit` runs the lint, the Vitest
suites and the mod's tests: on a loaded 16-core host that took 15 to 17 minutes, down from over an
hour. The browser suites run when you push, so nothing reaches the remote without them. They also run faster, because each Playwright worker now starts
one server and resets its store between tests, instead of starting a server for every test. Run
`npm run test:e2e` yourself when you want the browser suites before a push.

## Overview

The pre-commit `npm-test` hook ran `npm test`, which ran every package's Vitest suite and then the
web app's full Playwright suite: 174 tests across the `desktop-1280` and `touch-390` projects (40
of them skip by viewport), each booting its own `beads-ui-web` server on a freshly made `bd` store.
On a loaded 16-core host a commit's hook took 1 h 16 min at `BEADS_UI_TEST_JOBS=2` on 2026-11-21,
and 1 h 6 min when measured again for this plan ([Measurements](#measurements)); one server start
alone took 37 s there. The harness's per-test checkpoint probes were measured at about 0.4 CPU s a
test (about 3 %), so they are not the cost.

The goal is a commit hook that finishes in minutes on such a host, a push gate that still runs
every browser test, and a browser suite that costs less wherever it runs. Out of scope: the two
timing-sensitive tests that fail on a loaded host (tracked on their own), and the harness's sweep
and budget tiers, which already run only on named hosts.

## Task Breakdown

### T-01: The commit gate runs no browser suite

**Size:** S
**Batch:** 1

`npm test` runs the Vitest suites and the repository's script tests, with no Playwright. A new
pre-push hook, `e2e`, runs `npm run test:e2e` (the install check, the spec type-check and the full
smoke tier of both projects). The root `package.json` gains `test:e2e` so the command is the same
from the root.

**Deliverables:**

- Files modified: `apps/web/package.json`, `package.json`, `.pre-commit-config.yaml`,
  `scripts/e2e-install-root.test.mjs`, `CONTRIBUTING.md`, `docs/procedures/web-run.md`,
  `docs/adr/0001-contributor-environment-and-gates.md`
- Tests added: `scripts/e2e-install-root.test.mjs` (the pre-push hook and the scripts)

**Acceptance criteria:**

- [x] When `npm test` runs, the system shall run no Playwright test (`apps/web`'s `test` script is
  `vitest run`).
- [x] When a push runs the pre-push hooks, the system shall run `npm run test:e2e`, the full
  browser suite (`.pre-commit-config.yaml` hook `e2e`, stage `pre-push`).
- [x] If the commit-stage hooks are listed, then no hook in them shall run `test:e2e`.
- [x] When the browser suite runs at push, its pass count shall match the count before this change,
  with any difference explained test by test.

**Dependencies:** None

### T-02: One server per Playwright worker

**Size:** M
**Batch:** 1

The `served`, `app` and `signedIn` fixtures take their server from a worker-scoped fixture. The
worker makes one store with `bd init`, copies it aside as its pristine image, starts
`beads-ui-web` in it and copies its config home (config, state, HOME) aside after the start. Before
each test it waits until the server's process group has run no child process for 300 ms, ends
every browser session through the admin API, and puts the store back to its pristine image and the
config file, the write log and HOME back to theirs. It then waits for quiet again and checks that
no file changed and no session appeared during the reset. If the server has exited, stays busy for
15 s, holds any other changed state (a dispatch, a draft, an owner handoff), or anything moved
during the reset, the worker stops it and starts a fresh one for the test. Specs that start their
own server with their own options (`serve()`) are unchanged.

**Deliverables:**

- Files created: `apps/web/e2e/harness-worker-server.spec.ts`
- Files modified: `apps/web/e2e/fixtures.ts`, `apps/web/e2e/harness/adapter.ts`,
  `apps/web/e2e/sessions.spec.ts`, `apps/web/e2e/detail.spec.ts`
- Tests added: `apps/web/e2e/harness-worker-server.spec.ts`

**Acceptance criteria:**

- [x] When two tests run one after the other in one worker, the second shall run on the same server
  process as the first.
- [x] When a test leaves an issue, a file in the store, an edit to the config file or a signed-in
  session behind, the next test in that worker shall see none of them.
- [x] If a test leaves the worker's server stopped, then the next test shall get a fresh, running
  server.
- [x] If the server holds changed state the reset cannot put back, then the next test shall get a
  fresh server rather than that state.
- [x] The log a test's record carries shall hold only the server output printed during that test.

**Dependencies:** None

### T-03: `BEADS_UI_TEST_JOBS` reaches the package tasks under turbo

**Size:** S
**Batch:** 1

Found while measuring: the baseline hook ran at `BEADS_UI_TEST_JOBS=2`, yet Playwright reported
`Running 174 tests using 1 worker`. Turbo 2 runs tasks in strict environment mode and drops every
variable `turbo.json` does not name, so inside `turbo run test` the bound was always unset and
each package's Vitest and Playwright ran one worker, against what web-run.md says. `turbo.json`
now passes the variable through.

**Deliverables:**

- Files modified: `turbo.json`, `scripts/test-gate-bound.test.mjs`
- Tests added: `scripts/test-gate-bound.test.mjs` (a package task under the repository's own
  `turbo.json` sees the bound)

**Acceptance criteria:**

- [x] When `npm test` runs with `BEADS_UI_TEST_JOBS=2`, each package task turbo starts shall see
  `BEADS_UI_TEST_JOBS=2`.
- [x] If `turbo.json` names no pass-through for the variable, then the test shall fail.

**Dependencies:** None

### T-04: The adapter spec captures a ready screen on a loaded host

**Size:** S
**Batch:** 1

Found while measuring: the baseline's Playwright run passed every test (134 passed, 40 skipped)
and still exited 1, because the harness failed the run with `no-capture: harness-adapter.spec.ts:
its tests reached screens and passed with no capture of any ready state`. The spec's sign-in test
ends as soon as the Sign out button shows; on a loaded host the Board's read lands after the
test's end, so the harness's checkpoint never sees a ready Board. A quiet host captures it, which
is why the failure only shows under load. The test now waits for the Board it lands on to finish
its read.

**Deliverables:**

- Files modified: `apps/web/e2e/harness-adapter.spec.ts`

**Acceptance criteria:**

- [x] When the sign-in test lands on the Board, it shall end only once the Board's read has landed,
  so the run holds a ready capture for the spec.

**Dependencies:** None

## Batch Plan

| Batch | Tasks | Focus | Exit gate |
|-------|-------|-------|-----------|
| 1 | T-01 to T-04 | Commit gate, per-worker server, and the two faults found while measuring | Every AC above checked; the commit hook, `npm run test:e2e` and the script tests green; [Measurements](#measurements) filled in |

## Measurements

Every run is on the same loaded 16-core host, with the host's contention reading taken at the start
and the end of the run. The host's load moved between 24 and 45 on 16 cores over the afternoon, so
each row carries its own reading.

### Before (origin/main at ff718cc)

The commit hook on a small change: one new two-byte file under `apps/web/` staged, every hook of
the pre-commit stage run with `pre-commit run`, `BEADS_UI_TEST_JOBS=2`.

| What | Result |
|---|---|
| Contention at start | LOOK: load 33.1 on 16 cores, 4.1 % idle |
| Contention at end | LOOK: load 33.4 on 16 cores, 0.4 % idle |
| Commit hook, wall time | 3,945 s (65.8 min), and it failed (see T-04) |
| `turbo run test` inside it | 1 h 1 min 11 s |
| `apps/web` Vitest | 1,197.8 s; 394 passed, 1 skipped |
| Playwright, the full suite | 41.1 min on 1 worker (see T-03); 174 tests: 134 passed, 40 skipped, 0 failed |
| Harness run verdict | failed: `no-capture` for `harness-adapter.spec.ts` (T-04) |

The script tests (`node --test scripts/*.test.mjs`) never ran in this hook, because `npm test`
stops at turbo's failure.

### After

The commit hook, timed around each `git commit` of this branch at `BEADS_UI_TEST_JOBS=2`. Every
one ran the full commit stage (a change that is not docs-only runs every suite whatever its size),
and every one passed.

| Commit | What the hook ran | Contention, start and end | Wall time |
|---|---|---|---|
| T-01 | no Playwright; the bound still dropped by turbo | LOOK, load 32.5 and 35.7 | 1,587 s (26.5 min) |
| T-03 | no Playwright; the bound reaches each package task | LOOK, load 31.7 and 24.4 | 918 s (15.3 min) |
| T-04 (a three-line change) | as T-03 | LOOK at start (24.4), HOLD at end (43.8) | 1,027 s (17.1 min) |
| T-02 | as T-03 | LOOK, load 34.9 and 45.4 | 982 s (16.4 min) |

The full browser suite, `npm run test:e2e` at `BEADS_UI_TEST_JOBS=1`, which is the one worker the
baseline's suite really ran on (T-03), after T-02 at 1e29a3f:

| What | Before | After |
|---|---|---|
| Contention | LOOK, load 33.1 to 33.4 | LOOK, load 40.7 to 37.7 |
| Wall time of the Playwright run | 41.1 min | 35.2 min (2,114 s for all of `npm run test:e2e`) |
| Tests | 174: 134 passed, 40 skipped | 186: 140 passed, 46 skipped |
| Harness run verdict | failed (no-capture, T-04) | passed; 151 captures written, 1 refused by the live-target policy |
| Summed time of the 90 tests on the shared fixtures | 1,491 s | 979 s |
| Summed time of the 50 tests that start their own server | 528 s | 654 s |

Every one of the 140 tests the two runs share kept its result: no test went from passed to skipped
or back. The 12 tests only the after run has are `harness-worker-server.spec.ts`: 6 pass at
1280 px and 6 skip at 390 px by design. The 8 the before run names alone are
`harness-adapter.spec.ts` tests whose line numbers moved by the T-04 edit; they ran and passed in
both runs.

The tests that start their own server ran 24 % slower in the after run, which is the heavier load;
the tests on the shared fixtures ran 34 % faster in spite of it. The wall time fell less than the
fixture tests did because those 50 tests and the harness's own specs are unchanged.

### What the Done-when asked, and what it got

The commit hook fell from 65.8 min, failing, to 15 to 17 min, passing, at LOOK. That is not the
"few minutes at LOOK" the task asked for. What is left is the Vitest suites themselves:
`apps/web`'s alone took 1,197.8 s in the baseline, because its server suites start real servers on
`bd init` stores. Speeding those up, or moving them to pre-push as well, is its own change; it is
recorded as a follow-up in the repository's issue tracker with these numbers.

## Implementation Audit

Checked against the branch at 1e29a3f; each item names the test or the measurement that shows it.

### T-01: The commit gate runs no browser suite

- [x] `npm test` runs no Playwright test: `scripts/e2e-install-root.test.mjs` pins `apps/web`'s
  `test` as `vitest run` and the root `test` naming no `test:e2e`; the four commit hooks above ran
  in 15 to 27 min with no Playwright output.
- [x] A push runs `npm run test:e2e`: the same file pins exactly one hook running it, `e2e`, at
  `pre-push`; it fails when the hook is moved to the commit stage (checked by hand).
- [x] No commit-stage hook runs `test:e2e`: the same test.
- [x] Pass count matches before and after, explained test by test: [After](#after).

### T-02: One server per Playwright worker

- [x] Same server for the next test in a worker: `harness-worker-server.spec.ts`, second test; it
  fails when the reuse is switched off.
- [x] No issue, store file, config edit or session from the test before: the same test; it fails
  when the store restore or the session revoke is removed.
- [x] A stopped server gives the next test a fresh one: third and fourth tests.
- [x] Unrestorable state gives the next test a fresh server: fifth and sixth tests.
- [x] A test's log starts at the test: the second test (no boot line) and the fourth (a fresh
  server's boot line).

### T-03: `BEADS_UI_TEST_JOBS` reaches the package tasks under turbo

- [x] A package task sees `BEADS_UI_TEST_JOBS=2`: `scripts/test-gate-bound.test.mjs`, under the
  repository's own `turbo.json`.
- [x] The test fails on the old `turbo.json`: it read `JOBS=undefined` there.

### T-04: The adapter spec captures a ready screen on a loaded host

- [x] With a `bd list` slowed by 6 s, the unfixed spec passed and the run failed with
  `no-capture`; with the fix the run passed with one capture. The after run's verdict passed.

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
| <a id="d-1"></a>D-1 | Where the browser suites run | (a) All of them at pre-push, (b) the specs a commit's changed files select, at commit | (a) | (a) | No | No sound selector exists: every spec drives the same server and client, so almost any change selects every spec | `Resolved` |
| <a id="d-2"></a>D-2 | How a test gets a clean server | (a) One server per worker with the store and config reset between tests, (b) one server per test, as before | (a) | (a) | No | The server start and `bd init` are the per-test cost; a reset that falls back to a fresh server keeps each test's isolation | `Resolved` |

### Decision Details

#### D-1: Where the browser suites run (✅ Resolved: (a) All of them at pre-push)

**Context.** The commit hook must finish in minutes, and the browser suites must still run before
anything reaches the remote.

##### (a) All of them at pre-push

**Pros:**

- Simple: one hook, one command, the same full suite every time.
- Nothing reaches the remote without the full suite.

**Cons:**

- A commit can be made with a browser test failing; the push catches it, later than before.
- A push of a docs-only change still runs the full suite.

##### (b) The specs a commit's changed files select, at commit

**Pros:**

- A failing browser test can show at commit time for the files it covers.

**Cons:**

- Every spec boots the same server and client, so a change to `server/`, `client/`,
  `packages/web-ui/` or the core selects every spec: the slow case stays slow.
- A selector that misses a dependency passes a broken commit silently.

##### Recommendation

> **Decision:** ✅ Resolved: (a) All of them at pre-push
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=us.anthropic.claude-opus-5-5; ai-effort=medium; ai-profile=engineer -->

(a) is the simpler sound option: a selector cannot be sound for specs that all drive the same app.
The later catch is mitigated by `npm run test:e2e`, which a contributor runs before a push when
they want the answer sooner, and by the per-worker server (D-2), which shortens the push.

#### D-2: How a test gets a clean server (✅ Resolved: (a) One server per worker with a reset)

**Context.** Each test booted its own server on a fresh store; under load one start took 37 s.
Each test must still see only its own data.

##### (a) One server per worker with the store and config reset between tests

**Pros:**

- One server start and one `bd init` per worker instead of per test.
- The reset covers the store, the config file, the write log and every browser session.

**Cons:**

- Server memory outlives a test. State the reset cannot put back (a dispatch, a draft, a handoff)
  would leak.
- A late `bd` write from one test could land in the next test's store.

##### (b) One server per test, as before

**Pros:**

- Full isolation by construction.

**Cons:**

- The start cost every test pays is the hour this plan removes.

##### Recommendation

> **Decision:** ✅ Resolved: (a) One server per worker with the store and config reset between tests
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=us.anthropic.claude-opus-5-5; ai-effort=medium; ai-profile=engineer -->

The two Cons are mitigated in the reset itself. It compares the config home with its image taken
after the server started and starts a fresh server when anything other than the config file, the
write log, HOME or the session file changed. It waits until the server's process group has run no
child for 300 ms before it touches the store, and starts a fresh server when that does not happen
within 15 s. After restoring it waits for quiet again and checks that no file changed and no
session appeared, so a request still in flight when the previous test ended (a sign-in exchange, a
write not yet at `bd`) sends the next test to a fresh server instead of into its store. What stays
is memory the server keeps outside files and sessions, such as an unused sign-in code or a cache
keyed by an issue id; no test can name another test's code or id, so none can read it. Clearing it
too would need a test-only reset route in the server, which this plan does not add.

Cross-family review (Codex, gpt-5.6-sol, high effort) raised the in-flight race and the `pgrep`
error case; both are fixed as above. It also asked for a server-owned reset of all memory; that is
the residue named above, left as it is.

## Open Questions

None.

## Approval Log

| Date | Decision | Actor | Notes |
|------|----------|-------|-------|
| 2026-11-22 | D-1, D-2 | AI (Claude Opus, engineer) | Resolved; built on, for the maintainer's review after it is live |

<!-- /doc:region name="overview" -->
