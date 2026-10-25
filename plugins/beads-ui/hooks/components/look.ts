import { colorFor, type ThemeOverrides, type Token } from "../../core/src/index.ts";

// The look both surfaces draw with (D-43): the `[theme]` colours read at the last config read.
// One module holds them, so the band and the pane draw the same colours from the same redraw.

let theme: ThemeOverrides = {};

/** Takes the `[theme]` values just read; true when they differ from those drawn. */
export function setTheme(overrides: ThemeOverrides): boolean {
  const changed = JSON.stringify(overrides) !== JSON.stringify(theme);
  theme = { ...overrides };
  return changed;
}

/** The colour a `Text` draws for `token`: its `[theme]` hex value, else its theme key. */
export const colorOf = (token: Token): string => colorFor(token, theme);
