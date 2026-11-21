# 0008. Integration test boundaries

## Status

Accepted.

## Context

The test targets span Claude Code's mod sandbox, Node, a browser, tmux
and real Beads stores. Each exposes a different boundary.

## Decision

- `plugins/beads-ui/vitest.config.ts` splits collections by runtime.
  The plugin runner collects `*.test.ts`. Vitest collects Node
  `*.spec.ts` and the pure core `*.test.ts` suites, mapping
  `claude-code/testing` to Vitest. Dual-runner suites use the common
  describe, test, expect and matcher subset. The mod runner lacks
  filesystem and subprocess access. The hooks suites use its engine,
  while Node probes cover source checks, purity, hygiene, docs and
  cases the engine test kit cannot raise. The import probe leaves
  plugin loading to the engine so a refused import names its file.
- `plugins/beads-ui/core/test/fixture-modules.spec.ts` verifies that
  each `.json.ts` or `.txt.ts` fixture module carries its raw fixture's
  exact bytes. The mod environment loads only code. Most bd fixtures
  were captured read-only from this repo with bd 1.3.1 using the
  `count`, `delete --dry-run`, `history --events`, `list`, `ready`,
  `show` and `statuses` commands. The comments fixture was captured
  with bd 1.3.2 on 2026-10-25. Deletion fixtures retain the leaf,
  dependent-only and cascade cases with their original exit paths.
  The mint parity cases also use captured bd-new IDs and Python 3.14
  output with the budget override.
- `apps/terminal/test/` uses an isolated tmux socket with real panes,
  process replacement and input confined to a test-owned companion.
  A stand-in delays the real split reply to expose publication races.
  SIGSTOP of the mutator would introduce an unrelated job-control
  SIGHUP. The lock case runs a bounded sleep with `--no-fork` so
  terminating the owned process releases the lock. Require child
  readiness to distinguish deduplication from early child failure.
  Guard tests observe calls as well as rendered text.
- `apps/web/playwright.config.ts` budgets page and server work after
  setup. The specs run at desktop and touch widths. Each uses its own
  stores and private home. Bd can keep writing an event log after its
  process exits, so fixture teardown retries removal. Starting on Review
  avoids an initial Board read in the same one-process store queue.
  Wait for the analytics response containing the exported issue or for
  the board read after reload. Shared-tab tests allow for an initial poll
  and a poll after a write.
- Server suites use real HTTP and fixture files, with stand-ins for
  held, queue and carrier tools. The subprocess fixtures document
  invocation through their code and preserve the actual result shapes.
  Asynchronous carrier status is polled after the call appears. The
  optional `BEADS_UI_LIVE_QUEUE_URL` adds a loopback queue check.
  In jsdom the composer harness uses Lexical's input API because the
  host has no native composition or clipboard. Its parity suite
  covers the original ai-core composer behaviors.
- The large pane tests budget for the engine's 100,000-character draw
  limit and the kit's default five-second timeout. The 300-step panel
  and Timeline walks have a 120-second budget because each step
  redraws, and the panel walk exceeded 60 seconds under contention.
  Refresher fixtures use real detached Node process groups and a stub
  bd. Extend simulated lease and idle deadlines where load could
  invalidate the fixture before its assertion.

## Consequences

Run tests in the designated runtime. The kit returns trees and mocks.
Use the width and render helpers for
geometry, and the live or targeted host probes for behavior the kit
does not emit. See [test setup](../procedures/web-run.md#test-it).
