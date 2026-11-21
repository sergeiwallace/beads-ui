# 0009. Archive the band figures row

## Status

Accepted on 2026-10-27.

## Context

The figures row shipped as a sparkline and status bars. It added per-store
reads for task close times and one extra row to the band.

## Decision

Remove the figures row and keep its source at
[the archive](../archive/figures-row/README.md). Commit `45d7da1` is the
pre-removal snapshot. It preserves the original imports and placement
of the excerpts in `hooks/components/band.ts`, `hooks/levels.ts`,
`hooks/tally.ts` and the core and host glue. Restore them from that
snapshot if intentionally reviving the feature.

The archived renderer used terminal Raster and repaint via `$.ui.blit`.
The desktop's Raster drew nothing, so it used Text for the same figures.
The archive records the original row and the read window separately from
`band-figures-removed.test.ts`, which checks the current summary-only
behavior.

## Consequences

The archive is reference source outside the build and test graph.
Follow its README for the allowlist and fixture changes required for a
restoration. The Timeline retains its separate Raster and picture
support.
