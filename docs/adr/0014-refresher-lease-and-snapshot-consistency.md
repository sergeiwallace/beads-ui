# 0014. Refresher lease and snapshot consistency

## Status

Accepted.

## Context

Reading every store from each Claude Code session made bd work grow
with session count. A detached refresher can be suspended, started
concurrently or replaced during an upgrade. Claude Code process
output can also be capped at 4 MiB, less than a large whole-store read.

## Decision

- Use `node refresher.mjs start --state-dir <dir> --home <home> --token <token>`
  from the mod. `start` returns the PID while `run` detaches into its
  own process group and session so it can outlive the launching mod.
  `plugins/beads-ui/refresher/refresher.mjs` holds a hard-link lease and
  checks its inode before store work and publication. If a competing
  taker linked a different inode, put that lease back. A newer build
  may replace a live older build. Before 0.9.2 there were only shared
  counts, and before 0.9.4 leases did not carry a build.
- Write counts, reviews and boards to token-specific paths before
  publication. If an ousted writer resumes after its last lease
  check, it still writes to its own token. Sessions use the active
  lease's token and use `counts.json` only when no lease names one.
  Seed counts before takeover so first paint can use a warm snapshot,
  then reseed if the old holder removed the seed in the race. Inherit
  unchanged boards by link and keep the last review fingerprint on
  takeover. A failed opportunistic read keeps the prior drawing valid.
- Refresh boards by Dolt head only for stores live panes have open.
  Limit the pane's own read to open issues and a recent closed page.
  A read in progress keeps its cards visible but invalidates their
  refresh key after a write. Without a fresh head, the next open
  retries. The refresher's wake and beat may overlap; prefer the
  read started later. Poll wake files so edits refresh before the
  next minute. Record the store that an edit used because the pane
  can remap to a different store before the wake or publish.
  A worktree's board uses its own path and its counts use the
  shared store's database identity.
- Read the held command from the user's config and pass the file via
  `--config`. Serialize wake and periodic review reads, using
  the fingerprint for no-change results. A held answer wakes the
  review read. Mark stores that miss a cycle's shared deadline unread.
  Mark a deliberate shutdown so sessions retry on the next check
  instead of waiting three minutes.

## Consequences

Token-specific snapshots keep new readers separate from superseded
writers. The `pause-ms` test knob models a stall between lease check
and write. Simulated engine failures keep previous band lines while
readiness and takeover recover.
