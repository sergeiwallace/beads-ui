# 0006. Beads CLI and store contracts

## Status

Accepted.

## Context

Beads embeds Dolt, exposes guarded updates through its CLI and owns the
JSON schemas that the core parsers consume.

## Decision

- `apps/web/server/bd-queue.ts` queues calls per store before starting bd.
  An embedded store serializes calls internally. Parallel starts used
  to spend their own ten-second timeout waiting on the store's lock.
  `registry.ts` treats the main checkout and linked worktree as aliases
  when they address the same repository store.
- `packages/bd-node/src/run.ts` uses a buffer larger than execFile's
  1 MiB default to accommodate whole-store reads. Check the cwd first
  because spawn otherwise reports a missing cwd as ENOENT on the binary.
  Validate timeouts before execution. Node treats zero as unbounded,
  rejects negative, fractional and non-finite values, and clamps a value
  above 2^31 minus 1 to 1 ms.
- `packages/bd-node/src/client.ts` recognizes the bd 1.3.1 missing-ID
  exit-1 stderr and JSON error. Bd 1.3.4 prints JSON null for absent
  history, including on an unknown ID. `core/src/snapshot.ts` allows bd
  to omit groups when nothing matched. A board read with a null exit
  code did not finish. Exit zero with an unreadable payload is a
  separate diagnostic.
- `plugins/beads-ui/core/src/argv.ts` passes free text as `--flag=value`
  so a leading hyphen stays data. Validate status names and positional
  IDs separately. Held-item paths also follow `--`.
  `packages/bd-node/src/update.ts` rejects commas in one label because
  bd splits comma-separated flag values. Bd infers metadata number types
  from their spelling. The human owner is `metadata.owner`. The
  top-level owner is the repository owner's email.
- `apps/web/server/edits.ts` pairs a label write's status guard with a
  status update to the guarded value. Bd accepts the guard only beside a
  field update and labels do not qualify. A reorder reads each neighbor
  again at write time and uses its own store in the all-stores view.
  Roadmap progress includes closed children. Queue blockers missing
  from the open board count as closed. A blocked issue without an open
  blocker takes its reason from bd-block's newest comment.
- `plugins/beads-ui/core/src/parsers.ts` rejects a missing or non-boolean
  cascade field. Treating it as false could bypass typed-ID confirmation.
  The dependent-only bd 1.3.1 dry-run exits 1 and prints its refusal on
  stdout and stderr. A successful JSON cascade preview has its own
  distinct field contract.
- `plugins/beads-ui/hooks/pane.ts` keeps the first copy of an issue seen
  both before and after it closes between the open and closed reads.

## Consequences

Test fixtures pin real CLI spellings and output. See the
[integration test decision](0008-integration-test-boundaries.md) for the
fixture provenance and runner split.
