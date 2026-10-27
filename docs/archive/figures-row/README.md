# The band's figures row (archived)

Archived on 2026-10-27. Nothing in the repository imports these files, and no build, typecheck,
lint or test run reads them: `tsc -p core` compiles `plugins/beads-ui/core/src` only, Vitest and
`claude plugin test` collect tests under `plugins/` and `packages/`, and Biome checks `plugins/**`,
`packages/**`, `scripts/**/*.mjs` and the root's own files.

## What it was

T-2C.11 under D-43 in [the design doc](../../designs/beads-ui-design.md). At the summary level,
when Claude Code gave the band a row more than its lines, the band drew one row under them
(`beads-band:figures`): `✓` and a sparkline of the done window cut into 12 parts, then a bar for
each status count the first line draws. The terminal drew it as one Raster row (`band-figures`),
repainted in place through `$.ui.blit` when a read landed between redraws; the desktop drew the
same figures as one line of Text. To draw the sparkline the band read its done tasks' close times
with `bd list --json --brief --limit 0 --status=closed --closed-after=<window start>` in each store
whose done count was above zero. It shipped in beads-ui 0.19.0 (#75).

## Why it was removed

Sergei, 2026-10-27: "i just don't even understand it. and i don't like it. drop it. i didn't ask
for that. i want to see the task manager view primarily and the in progress beads tasks panel and
all the rest that we discussed. for specific visuals in the bands or pane, i'll let you know."
and "just add an in progress /beads-task (child task) and cc task to remove that graph
visualization bar in the band. just archive it for now or something. we can explore other visuals
later on."

Any later visual in the band or the pane waits for Sergei to name it.

## What is here

The files as they stood at beads-ui `45d7da1`, the commit before the removal. Excerpts are cut
from files that stay in the plugin, so they do not compile on their own.

| File | Was | What it held |
|---|---|---|
| `figures.ts` | `plugins/beads-ui/core/src/views/figures.ts`, whole | the sparkline buckets and heights, the bars, the Text form and the Raster cells |
| `figures-row.ts` | excerpt of `plugins/beads-ui/hooks/components/band.ts` | `FIGURES_KEY`, `FIGURES_RASTER_KEY` and the `figuresRow` renderer |
| `levels-figures.ts` | excerpt of `plugins/beads-ui/hooks/levels.ts` | `BandRaster`, the done-time reads, the blit repaint and `drawFigures` |
| `tally-figures.ts` | excerpt of `plugins/beads-ui/hooks/tally.ts` | `totalOf`, `doneByStore` and `readDoneTimes` |
| `glue.ts` | excerpts of `core/src/index.ts`, `core/src/glyphs.ts`, `hooks/components/look.ts`, `hooks/host.ts`, `hooks/register.ts`, `hooks/bands.ts` and `validate-allowlist.json` | the exports, the five `spark.*` glyphs, `rasterColorOf`, `isAscii`, `host.blit` and the band's Raster plumbing |
| `figures.test.ts` | `plugins/beads-ui/hooks/figures.test.ts`, its figures tests | the Raster row, the desktop Text, the widths and the repaint |

`barRun`, `barCells` and the rest of `core/src/views/timeline.ts` and `core/src/views/raster.ts`
stay in the plugin: the Timeline view draws its bars with them. The test world still records every
`$.ui.blit`, so a test can show the band sends none.

To bring the row back, restore each file and excerpt to the path it names, add `$.ui.blit` back to
`validate-allowlist.json`, and restore what the removal changed in the tests: the expectations in
`hooks/levels.test.ts` and `hooks/components.test.ts`, and the `blitAnswer` option of
`hooks/tests/world.ts`, which the archived repaint tests use.
