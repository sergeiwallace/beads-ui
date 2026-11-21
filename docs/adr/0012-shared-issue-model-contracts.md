# 0012. Shared issue model contracts

## Status

Accepted.

## Context

The core serves several surfaces from the same input records. Beads,
OpenTelemetry, the work queue and bd-new each own an input format or
interpretation.

## Decision

- `plugins/beads-ui/core/src/analytics.ts` derives analytics from
  `bd history --events`. Bd 1.3.4 reports newest first and a status
  move's old value reflects the issue snapshot. Import retains
  `created_at` and stamps the created event at import time.
- `core/src/cost.ts` joins Claude Code's cost and token metrics to
  `closed_by_session`, written by `bd close --session`, using
  `session.id`. Read the collector file export as OTLP JSON Lines.
  OTLP encodes an int64 as a string and a double as a number. A
  cumulative metric keeps its latest point per series.
- `core/src/mint.ts` ports bd-new's slugification and display ID
  minting. The surface passes the two environment overrides,
  `AIH_SLUG_BODY_MAX_CHARS` and `AIH_SLUG_BODY_MAX_CHARS_CHILD`, as
  strings. Match Python's ASCII whitespace for splitting and trimming,
  then apply NFKD and drop non-ASCII for the slug. Parse the numeric
  override using Python's sign, decimal digit, underscore and
  whitespace rules. Python 3.14 whitespace includes U+0085 and
  excludes U+FEFF, unlike the JavaScript `\s` class.
- `core/src/sessions.ts` uses the work queue session registry as
  the liveness source and falls back to store assignees with liveness
  unavailable. `core/src/sprint-view.ts` reads membership from
  `sprint:<name>` labels and dates from the matching milestone's
  `due_at` and `sprint.starts_at`. Missing milestones leave dates
  absent and membership intact.
- The Roadmap deduplicates parent edges because bd can expose one
  parent as both a dependency and the `parent` field. The core's Board
  reducer permits one in-flight write per card so move and reorder
  cannot race.

## Consequences

Fixture parity checks pin the external representations. Surface adapters
supply time, configuration, I/O and randomness where a model needs them.
