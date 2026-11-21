# 0013. Terminal dimensions and rendering

## Status

Accepted.

## Context

The terminal lays out cells and rows. The band has its own paging
window, while the pane uses host scrolling. The Claude Code renderer
caps a draw at 100,000 characters.

## Decision

- `plugins/beads-ui/core/src/glyphs.ts` uses one code point per
  glyph and excludes emoji and East Asian Width A, W and F so each
  glyph takes one cell. The fixture derives the width ranges from
  Python's Unicode 16.0.0 data above ASCII and below U+30000.
  Color, glyph form and indicators use shared state for the band and
  pane so both surfaces render the same settings after a redraw.
- The shared components receive surface capabilities via adapters.
  When a surface lacks an element, `hooks/components/elements.ts`
  uses a button form. Compact layouts omit frames to save three rows
  and truncate text where wrapping would consume an extra row. Frame
  and padding consume four columns and clickable brackets take two.
  Compute the pane's usable width inside the nav and section chrome.
  Give the view's rows priority over its controls and notices at
  short height.
- A focus-following window renders the next Tasks or Timeline row
  before Down reaches it. This keeps large lists below the host draw
  cap. On changing a Board page, focus its detail button. A focused
  Select consumes letters for typeahead, so the next page key would
  otherwise select an option.
- `core/src/views/raster.ts` writes Claude Code's Raster wire format:
  base64 of little-endian triples of 32-bit code point, foreground
  and background. Only the terminal draws Raster bars. Picture
  output is terminal Image when supported, SVG on supported
  nonterminal surfaces and alt text otherwise. The terminal path
  uses a PNG the core emits without a compressor. Inside tmux,
  passthrough must be enabled and the outer terminal must support
  pictures. The band reserves its rows for its levels.

## Consequences

Width tests measure the inner drawing. Picture tests decode the PNG
through a real decoder. The long-list regressions walk every focus
step so a drawing that falls off the capped frame fails visibly.
