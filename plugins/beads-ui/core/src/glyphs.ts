// The one glyph table (D-41, D-43, T-2C.10): every status, control, view, indicator and text
// glyph the band and the pane draw, each with the ASCII form `[indicators] ascii` draws instead.
// The indicator registry (D-41, T-2C.3, core/src/indicators.ts) draws its `indicator.*`
// entries from here. Every glyph is one code point
// that is neither East Asian wide nor ambiguous nor emoji, so it takes one cell on any
// terminal; the table's test checks each one.

export type GlyphKind = "status" | "priority" | "type" | "control" | "view" | "indicator" | "text";

export interface Glyph {
  readonly glyph: string;
  /** Printable ASCII, drawn in place of `glyph` under `[indicators] ascii = true`. */
  readonly ascii: string;
  readonly kind: GlyphKind;
  readonly meaning: string;
}

const entry = (glyph: string, ascii: string, kind: GlyphKind, meaning: string): Glyph => ({
  glyph,
  ascii,
  kind,
  meaning,
});

export const GLYPHS = {
  "pane.open": entry("◨", "+", "control", "open the pane, or move into it when it is open"),
  "pane.close": entry("⊠", "x", "control", "close the pane"),
  "row.open": entry("▸", ">", "control", "open the task's detail"),
  "row.menu": entry("⋮", ":", "control", "the task's options menu"),
  "move.earlier": entry("◂", "<", "control", "move the part one place left"),
  "move.later": entry("▸", ">", "control", "move the part one place right"),
  "list.above": entry("⇡", "^", "indicator", "rows above the ones drawn"),
  "list.below": entry("⇣", "v", "indicator", "rows below the ones drawn"),
  "status.in_progress": entry("◒", "%", "status", "in progress"),
  "status.blocked": entry("◉", "x", "status", "blocked"),
  "status.open": entry("◦", "o", "status", "open"),
  "status.done": entry("✓", "v", "status", "done in the band's window"),
  "band.expand": entry("▾", "v", "control", "the band's rows of every status the session owns"),
  "band.overview": entry("◫", "=", "control", "the band's overview: the views, drawn in the band"),
  "view.tasks": entry("✓", "v", "view", "the Tasks view"),
  "view.board": entry("⊞", "#", "view", "the Board view"),
  "view.backlog": entry("≣", "=", "view", "the Backlog view"),
  "view.sprint": entry("»", ">", "view", "the Sprint view"),
  "view.detail": entry("⊡", "i", "view", "the Detail view"),
  "view.timeline": entry("⇢", "-", "view", "the Timeline view"),
  "view.settings": entry("⊛", "*", "view", "the Settings view"),
  "indicator.agent": entry("⟳", "*", "indicator", "an agent is working on it"),
  "indicator.blocked": entry("⊘", "!", "indicator", "blocked"),
  "indicator.review": entry("✎", "?", "indicator", "it has review items"),
  "text.more": entry("⋯", ".", "text", "text cut short, or a read still running"),
  "text.separator": entry("⋅", "|", "text", "between two hints"),
  "text.becomes": entry("⇾", ">", "text", "a field's new value"),
} as const satisfies Record<string, Glyph>;

export type GlyphId = keyof typeof GLYPHS;

/** `id`'s glyph, or its ASCII form when `ascii`. */
export const glyphOf = (id: GlyphId, ascii = false): string =>
  ascii ? GLYPHS[id].ascii : GLYPHS[id].glyph;

const ASCII_OF: ReadonlyMap<string, string> = new Map(
  Object.values(GLYPHS).map((one: Glyph) => [one.glyph, one.ascii]),
);

/** True when `char` is a glyph of the table. */
export const isTableGlyph = (char: string): boolean => ASCII_OF.has(char);

/**
 * `text` with every table glyph replaced by its ASCII form: what a surface draws under
 * `[indicators] ascii`, so a glyph a core view model wrote reaches the screen in either form.
 */
export function asciiOf(text: string): string {
  let out = "";
  for (const char of text) out += ASCII_OF.get(char) ?? char;
  return out;
}
