# 0003. Terminal companion ownership

## Status

Accepted.

## Context

The terminal launcher splits tmux panes and a companion process may
outlive its launcher. Pane IDs can survive process replacement. The
board also reads and writes issue status on overlapping schedules.

## Decision

- `apps/terminal/bin/companion-lifecycle.mjs` serializes creation with
  Linux's file lock. A persistent tmux semaphore can outlive its owner.
  Keep lock files in place, since unlinking allows another lock on a
  different inode. The supervisor and mutation worker retain the file
  descriptor so an interrupted supervisor cannot release a live mutation.
  Node's subprocess defaults keep it out of tmux and a timeout bounds an
  orphaned worker.
- `apps/terminal/bin/launch.mjs` passes a direct argument vector to the
  detached split. It leaves the user's selected pane and input alone.
  Process diagnostics may contain machine-local command strings or
  values, so surface only sanitized errors. `server/cli.ts` treats issue
  text as terminal data and strips prompt controls and line breaks.
- `apps/terminal/server/companion-lifecycle.ts` verifies pane ownership
  against the process's startup identity. Caller or environment values
  alone cannot establish ownership. Failed tmux or procfs reads leave
  identity unknown and the pane intact until a later check.
- `apps/terminal/server/session-board.ts` serializes a preexisting read
  before a new move. An older snapshot could otherwise land after
  the core clears its pending overlay. A failed read is still visible
  to its caller. A refused compare-and-set refreshes current state once
  without retrying the write against a newer claim.

## Consequences

Terminal integration tests use an isolated tmux socket, real panes and
owned processes to catch duplicates and ownership changes. The
[verification decision](0008-integration-test-boundaries.md) records how
the tests expose those boundaries.
