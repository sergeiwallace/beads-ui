---
title: "Fast commit gate, part two: the web server suites and the mod's test loop"
category: plan
tags: [plan, testing, hooks, vitest]
status: active
template_version: "plan-1.0.0"
---

<!-- doc:region name="overview" kind="replaceable" -->

# Fast commit gate, part two: the web server suites and the mod's test loop

## Founding Ask Coverage

`canonical_root_json`: `{"blob_oid":"e922987f42a93b53d6a9b3e7a226ce68933c23fd","capture_commit":"0547464ad2be7378cfd6e97cbaa00a54dd17be89","content_sha256":"f6a24617e09c4b3c344b236524ff16b86a4576ac120077af19818a1bcfb34029","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-0vp.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-0vp"}`

`founding_ask_ref_sha256`: `daaf0664755476015a5d6a484d67f2ae78bc34322be029fc1683106e9bf6ad4d`

The founding ask record has one entry, A001, recorded verbatim in ai-harness at `docs/asks/BU-0vp.md`. This index is non-authoritative; the raw entry governs.

| Entry | Clause | Coverage and disposition |
|---|---|---|
| A001 | "why is the test job taking 2 hours? that's insane. way too long..." | [T-01](#t-01-every-web-store-starts-as-a-copy-of-one-pristine-image) cuts the cost of each web suite's store; [T-02](#t-02-the-commit-gate-leaves-the-web-server-suites-to-pre-push) moves the web server suites to pre-push, declared in [D-2](#d-2) with the measurement that forced it; [T-03](#t-03-the-mods-test-loop-runs-once-per-commit) runs the mod's test loop once per commit instead of twice; [Measurements](#measurements) records each step |

**Status:** IN PROGRESS

**Created:** 2026-11-22

## Table of Contents

- [Founding Ask Coverage](#founding-ask-coverage)
- [Summary for a wide audience](#summary-for-a-wide-audience)
- [Overview](#overview)
- [Task Breakdown](#task-breakdown)
  - [T-01: Every web store starts as a copy of one pristine image](#t-01-every-web-store-starts-as-a-copy-of-one-pristine-image)
  - [T-02: The commit gate leaves the web server suites to pre-push](#t-02-the-commit-gate-leaves-the-web-server-suites-to-pre-push)
  - [T-03: The mod's test loop runs once per commit](#t-03-the-mods-test-loop-runs-once-per-commit)
- [Batch Plan](#batch-plan)
- [Measurements](#measurements)
- [Human Gates](#human-gates)
- [Decisions](#decisions)
- [Open Questions](#open-questions)
- [Approval Log](#approval-log)

## Summary for a wide audience

The first part of this work took the browser suites out of `git commit`, which brought a commit's
hook on a loaded 16-core host from over an hour to 15 to 17 minutes. This part goes after what was
left: the web app's server suites, which call a real `bd` store on every test, and the mod's
`claude plugin test` loop, which a commit ran twice.

## Overview

With the browser suites at pre-push, the commit hook still runs `npm test` (every package's Vitest
suite through turbo, the mod's `claude plugin test` loop among them, then the repository's script
tests) and, as its own hook, the mod's loop a second time. On a loaded 16-core host that took 918 to 1,027 s at `BEADS_UI_TEST_JOBS=2`.
`apps/web`'s Vitest suite is the long pole, and the mod's test loop the next one.

The decision taken before this plan was: first give the web server suites the per-worker server and
reset the browser suites got, keeping every suite in the commit gate; measure; and only if the hook
is still above a few minutes, move the remaining web server suites to pre-push, declared here with
the measurement that forced it. Then take the simplest sound saving in the mod's test loop.

Reading the suites before building changed where (a) can land ([D-1](#d-1)):

- The web server suites do not start a `beads-ui-web` process. They call `startServer` in the test
  process. A file that serves one store makes the store and the server once, in `beforeAll`, and
  every test in it shares them; a file that starts a server per test does so because the test is
  about what a start does, or hands that server its own `bd` wrapper. A start without a store took
  0.2 s in the baseline (`session-persistence.test.ts`: 11 tests, 11 starts, 2.4 s).
- Vitest runs each file in its own process with its own module graph, so no server outlives a
  file, and each file starts its server with its own config home, routes, clock, sweep interval and
  `bd` wrapper. One server shared across files would have to be one configuration for all of them.
- What a file pays before its first test is mostly `bd init`: 8 to 10 s on that host, against 25 ms
  to copy the store it makes. In the baseline 325 s of the files' summed 1,268 s ran outside any
  test, and a file whose five tests took 0.1 s together took 12.3 s (`csp.test.ts`).
- What a file pays after that is its tests' own `bd` calls, through the server and from the test:
  `dispatch-ladder.test.ts` spent 212 s inside its 28 tests. No server reuse removes those.

So (a) lands as a pristine store image per run, the part of the browser suites' reset that saves
time here. The measurement after it decides T-02, and T-03 then stops the mod's loop running twice.

## Task Breakdown

### T-01: Every web store starts as a copy of one pristine image

**Size:** S
**Batch:** 1

`apps/web`'s Vitest global setup makes an empty directory for the run and names it in
`BEADS_UI_TEST_STORE_IMAGE`. The first `createStore` in the run makes the image there with
`bd init` and records its tree (every path, size and modification time). Every later `createStore`
compares the image with that record: when it matches, it copies the image (`cp -a`), checks the
copy against the same record, and renames its prefix to the one asked for (`bd rename-prefix`);
when the image or the copy differs, it makes a fresh store with `bd init` and leaves the image
alone. Outside a Vitest run (the Playwright fixtures share
`test/store.ts`) no image is named and every store is made with `bd init`, as before.
`repoStore` (`test/host-stores.ts`), whose stores must carry their own database names side by side,
is unchanged.

**Deliverables:**

- Files created: `apps/web/test/global-setup.ts`, `apps/web/test/store-image.test.ts`
- Files modified: `apps/web/test/store.ts`, `apps/web/vitest.config.ts`

**Acceptance criteria:**

- [x] When two stores are made in one run, the second shall be a copy of the run's image (its
  project id is the image's) and shall hold none of the first one's issues.
- [x] When a store asks for a prefix other than the image's, the issues it creates shall carry
  that prefix.
- [x] If the image differs from what it held when it was made, then the next store shall be made
  with `bd init`, not copied, and shall not hold what changed in the image.
- [x] When `apps/web`'s Vitest suite runs, its pass count shall match the baseline's, with any
  difference explained test by test.

**Dependencies:** None

### T-02: The commit gate leaves the web server suites to pre-push

**Size:** S
**Batch:** 2

Applied only if the commit hook is still above a few minutes after T-01
([D-2](#d-2)). The commit hook runs `npm test` with `BEADS_UI_TEST_SCOPE=commit`, which turbo
passes through, and `scripts/test-jobs.mjs` checks before turbo starts. The pre-push `test-gate`
hook runs with the variable cleared (`env -u`), so a push that inherits it still runs every suite.
Under that scope `apps/web`'s Vitest config leaves out every suite that imports the
server (`../server/server.ts`) or a store factory (`./store.ts`, `./host-stores.ts`); the others
(the dispatch store's contract and ladder, the envelope, the favicon, the service installer) still run. Without
the scope, `npm test` and the pre-push `test-gate` hook's `npx vitest run` run every suite.

**Deliverables:**

- Files modified: `scripts/test-hook.mjs`, `turbo.json`, `apps/web/vitest.config.ts`,
  `scripts/test-gate-bound.test.mjs`, `CONTRIBUTING.md`, `docs/procedures/web-run.md`,
  `docs/adr/0001-contributor-environment-and-gates.md`

**Acceptance criteria:**

- [x] When the commit hook runs `npm test`, `apps/web`'s Vitest shall run no suite that imports
  the server or a store factory, and shall run every other suite.
- [x] When `npx vitest run` or `npm test` runs without the scope, `apps/web`'s Vitest shall run
  every suite.
- [x] If `BEADS_UI_TEST_SCOPE` holds a value other than `commit` or empty, then the run shall fail
  before any test starts.

**Dependencies:** T-01 and the measurement after it

### T-03: The mod's test loop runs once per commit

**Size:** S
**Batch:** 3

`npm test` runs turbo's `test` task in every package, and the mod's `test` script is
`vitest run && node ../../scripts/plugin-test.mjs .`, so the commit hook's `npm-test` already runs
the whole `claude plugin test` loop. The separate `plugin-test` hook ran it a second time, after
`npm test` had finished. The hook goes; `npm test` keeps the loop.

**Deliverables:**

- Files modified: `.pre-commit-config.yaml`, `scripts/test-gate-bound.test.mjs`, `CONTRIBUTING.md`,
  `docs/adr/0001-contributor-environment-and-gates.md`

**Acceptance criteria:**

- [ ] When the commit-stage hooks run, the mod's `claude plugin test` loop shall run once, inside
  `npm test`.
- [ ] If a hook other than `npm-test` runs `scripts/plugin-test.mjs`, then the script tests shall
  fail.

**Dependencies:** None

## Batch Plan

| Batch | Tasks | Focus | Exit gate |
|-------|-------|-------|-----------|
| 1 | T-01 | The store image | ACs checked; `apps/web`'s Vitest and the commit hook measured |
| 2 | T-02 | Only if the hook is still above a few minutes after batch 1 | ACs checked; the commit hook measured |
| 3 | T-03 | The mod's loop once | ACs checked; the commit hook measured |

## Measurements

Every run is on the same loaded 16-core host at `BEADS_UI_TEST_JOBS=2`, with the host's contention
reading taken at the start and the end of the run.

### Before (the first part's head, b237adc)

`apps/web`'s Vitest suite alone, `BEADS_UI_TEST_JOBS=2 npx vitest run` in `apps/web`:

| What | Result |
|---|---|
| Contention, start and end | LOOK, load 26.2 and 30.5 on 16 cores |
| Wall time | 659 s |
| Tests | 26 files; 394 passed, 1 skipped, 0 failed |
| Summed file time | 1,268 s, of which 325 s outside any test |
| Longest files | `dispatch-ladder` 235 s, `owner-handoff` 152 s, `views` 118 s, `heads-feed` 94 s, `w1-views` 84 s |

The commit hook on a small change: one new two-byte file under `apps/web/` staged, every hook of
the pre-commit stage run with `pre-commit run`.

| What | Result |
|---|---|
| Contention, start and end | LOOK, load 28.5 and 30.8 on 16 cores |
| Commit hook, wall time | 1,077 s (17.9 min) |
| `npm-test` hook | 822 s |
| `plugin-test` hook, the mod's loop a second time | 238 s |
| Inside `npm test`, per package (turbo runs 2 at once) | `apps/web` Vitest 676 s; the mod's Vitest 116 s, then its `claude plugin test` loop 370 s (978 tests, 63 files, 2 at a time); `mcp-server` 52 s; `web-ui` 48 s; `terminal` 24 s; `bd-node` 8 s; then the script tests 31 s |

The hook exited 1: three script tests failed because this fresh worktree had no `apps/web/e2e`
install yet, which those tests read (`CONTRIBUTING.md`, Setup). Each failed within 1.5 s; the
install was added before every later run.

### After T-01 (the store image)

`apps/web`'s Vitest suite alone, as before:

| What | Before | After |
|---|---|---|
| Contention, start and end | LOOK, load 26.2 and 30.5 | LOOK, load 33.4 and 36.4, 125k to 146k swap-outs a minute |
| Wall time | 659 s | 525 s |
| Tests | 26 files; 394 passed, 1 skipped | 27 files; 397 passed, 1 skipped |
| Summed file time outside any test | 325 s | 172 s |
| `csp.test.ts` (five tests, 0.1 s together) | 12.3 s | 1.2 s |

The commit hook, timed around the T-01 commit (`git commit` with `BEADS_UI_TEST_JOBS=2`), passed:

| What | Before | After T-01 |
|---|---|---|
| Contention, start and end | LOOK, load 28.5 and 30.8 | LOOK, load 37.1 and 47.5 |
| Commit hook, wall time | 1,077 s | 1,006 s (16.8 min) |

That is still far above a few minutes, so T-02 applies ([D-2](#d-2)).

Every one of the 395 tests the two runs share kept its result. The three tests only the after run
has are `store-image.test.ts`'s. What is left outside the tests is the seeding the suites do
themselves (`dispatch.test.ts` makes six issues and two receiver tokens), the `repoStore` stores
(`registry`, `receiver-api`, `heads-feed`) and `heads-feed`'s Dolt sql-server.

## Human Gates

| Gate | After | Decision needed |
|------|-------|-----------------|
| Plan approval | Before coding | None: every decision below is settled and none needs the maintainer first |
| Built review | After it is merged | The maintainer reviews D-1 and D-2 once the change is live |

## Decisions

### Decision Summary

| # | Decision | Options Considered | Recommended (AI) | Chosen | Diverged? | Rationale | Status |
|---|----------|-------------------|------------------|--------|-----------|-----------|--------|
| <a id="d-1"></a>D-1 | How the per-worker server and reset land in Vitest | (a) A pristine store image per run, servers per file as they are, (b) one in-process server per file with a reset between tests, (c) one served process per worker across files | (a) | (a) | No | Server starts cost 0.2 s and are already per file; `bd init` is the per-file cost; a server across files would need one configuration for every file | `Resolved` |
| <a id="d-2"></a>D-2 | Whether the web server suites leave the commit gate | Decided before this plan: only if the hook is above a few minutes after (a) | Move them | Move them | No | The hook took 1,006 s at LOOK after T-01 | `Resolved` |

### Decision Details

#### D-1: How the per-worker server and reset land in Vitest (✅ Resolved: (a) A pristine store image per run)

**Context.** The decision taken before this plan named one `beads-ui-web` server per Vitest worker,
or per file where a worker-level server cannot be isolated soundly, with the store, config, write
log and HOME put back between tests, as the browser suites do.

##### (a) A pristine store image per run, servers per file as they are

**Pros:**

- Removes the cost a file pays before its first test, `bd init`, for every suite that uses
  `createStore`.
- Changes no suite: each keeps its own server, options and data.

**Cons:**

- Saves nothing inside a test; the tests' own `bd` calls stay.
- Stores copied from one image share its database name and project id.

##### (b) One in-process server per file with a reset between tests

**Pros:**

- Each test would see a clean store.

**Cons:**

- 19 of the 21 store-serving files already share one server per file, so nothing is started less.
- The reset adds a tree walk and a copy to every test, and the tests pass on a shared store today.

##### (c) One served process per worker across files

**Pros:**

- One server start per worker.

**Cons:**

- Each file needs its own config home, routes, clock, sweep interval or `bd` wrapper, and reads the
  server's in-process state (`server.ladder.idle()`, `server.auth.mintCode()`); a shared process
  would mean rewriting every suite against one configuration.
- Saves 0.2 s a file.

##### Recommendation

> **Decision:** ✅ Resolved: (a) A pristine store image per run, servers per file as they are
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=us.anthropic.claude-opus-5-5; ai-effort=medium; ai-profile=engineer -->

(a) takes the only per-file cost a reuse can remove. Its Cons are mitigated: the image is used only
by `createStore`, whose stores are each served alone or beside a `repoStore` store with its own
database name, and `repoStore`, whose stores sit side by side in one registry, still runs `bd init`.
A store is copied only while the image holds exactly what it held when it was made, else it gets
`bd init`, so a test that writes into the image cannot reach another test's store.

#### D-2: Whether the web server suites leave the commit gate (✅ Resolved: move them to pre-push)

Decided before this plan: (b) applies only if the commit hook is still above a few minutes at
`LOOK` after (a). After T-01 the hook took 1,006 s at LOOK (load 37.1 to 47.5), and `apps/web`'s
suite alone 525 s, so (b) applies.

This narrows the commit gate, and is declared here: a commit no longer runs the 22 `apps/web`
suites that import the server or a store factory (306 of its 398 tests). It still runs that
package's other 5 suites (92 tests, 27.7 s at LOOK), every other package's suites and the script
tests. Nothing reaches the remote without the 22: the pre-push `test-gate` hook runs
`npx vitest run` from the root with no scope, which runs every project's suites in full, and
`npm test` run by hand runs them too. The cost is that a server suite failure shows at push, not
at commit, as the browser suites already do.

## Open Questions

None.

## Approval Log

| Date | Decision | Actor | Notes |
|------|----------|-------|-------|
| 2026-11-22 | D-1 | AI (Claude Opus, engineer) | Resolved from the baseline's timings; built on, for the maintainer's review after it is live |
| 2026-11-22 | D-2 | AI (Claude Opus, engineer) | Resolved from the measurement after T-01; the narrowed commit gate is for the maintainer's review after it is live |

<!-- /doc:region name="overview" -->
