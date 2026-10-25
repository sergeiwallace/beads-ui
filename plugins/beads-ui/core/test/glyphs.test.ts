// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  asciiOf,
  GLYPHS,
  glyphOf,
  isTableGlyph,
  NAV_ENTRIES,
  resolveGlyphs,
  TASK_GLYPHS,
  truncate,
} from "../src/index.ts";
import { WIDE_OR_AMBIGUOUS } from "./fixtures/east-asian-width.ts";

// D-41, D-43 and T-2C.10: one glyph table, each glyph one cell wide on any terminal, each with
// an ASCII form `[indicators] ascii` draws.

const wideOrAmbiguous = (cp: number) =>
  WIDE_OR_AMBIGUOUS.some(([first, last]) => cp >= first && cp <= last);

/** Why `glyph` might not take exactly one cell; empty when it passes D-41's width rule. */
function widthProblems(glyph: string): string[] {
  const points = [...glyph];
  if (points.length !== 1) return [`${points.length} code points`];
  const cp = glyph.codePointAt(0) ?? 0;
  const found: string[] = [];
  if (cp < 0x80) found.push("ASCII, not a glyph");
  if (wideOrAmbiguous(cp)) found.push("East Asian wide or ambiguous");
  if (/\p{Emoji}|\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(glyph))
    found.push("emoji");
  if (/\p{M}|\p{C}/u.test(glyph)) found.push("a mark or control");
  return found;
}

describe("the glyph table (D-41, D-43, T-2C.10)", () => {
  test("should hold only glyphs of one code point outside the wide, ambiguous and emoji sets", () => {
    const failing = Object.entries(GLYPHS)
      .map(([id, entry]) => ({ id, glyph: entry.glyph, problems: widthProblems(entry.glyph) }))
      .filter((one) => one.problems.length > 0);

    expect(failing).toEqual([]);
  });

  test("should refuse the width rule's known failures: an ambiguous, a wide and an emoji glyph", () => {
    expect(widthProblems("●")).toEqual(["East Asian wide or ambiguous"]);
    expect(widthProblems("☰")).toEqual(["East Asian wide or ambiguous"]);
    expect(widthProblems("⚙")).toEqual(["emoji"]);
    expect(widthProblems("▸")).toEqual([]);
  });

  test("should give every entry a printable ASCII form and every shared glyph one ASCII form", () => {
    const asciiOfGlyph = new Map<string, string>();
    for (const [id, entry] of Object.entries(GLYPHS)) {
      expect(entry.ascii, id).toMatch(/^[\x21-\x7e]+$/);
      const seen = asciiOfGlyph.get(entry.glyph);
      if (seen !== undefined) expect(entry.ascii, id).toBe(seen);
      asciiOfGlyph.set(entry.glyph, entry.ascii);
    }
  });

  test("should draw each entry in both forms, the ASCII form holding no glyph of the table", () => {
    for (const id of Object.keys(GLYPHS) as (keyof typeof GLYPHS)[]) {
      expect(glyphOf(id)).toBe(GLYPHS[id].glyph);
      expect(glyphOf(id, true)).toBe(GLYPHS[id].ascii);
      expect(isTableGlyph(glyphOf(id))).toBe(true);
      expect([...glyphOf(id, true)].some(isTableGlyph)).toBe(false);
    }
  });

  test("should take every nav glyph, status glyph and the cut-short mark from the table", () => {
    for (const entry of NAV_ENTRIES) expect(isTableGlyph(entry.glyph), entry.view).toBe(true);
    for (const glyph of Object.values(TASK_GLYPHS)) expect(isTableGlyph(glyph)).toBe(true);
    expect(truncate("a title too long to fit", 8)).toBe(`a title${glyphOf("text.more")}`);
  });

  test("should replace every table glyph in a line with its ASCII form and keep other text", () => {
    const line = `${glyphOf("status.in_progress")} BU-1 ${glyphOf("row.menu")} ${glyphOf("text.more")}`;
    expect(asciiOf(line)).toBe("% BU-1 : .");
  });

  test("should read [indicators] ascii as the form drawn, glyphs unless it is true", () => {
    expect(resolveGlyphs(undefined)).toEqual({ ascii: false, problems: [] });
    expect(resolveGlyphs("[indicators]\nascii = true\n")).toEqual({ ascii: true, problems: [] });
    expect(resolveGlyphs("[indicators]\nagent = false\n")).toEqual({ ascii: false, problems: [] });
    expect(resolveGlyphs('[indicators]\nascii = "yes"\n').problems).toEqual([
      "indicators.ascii must be true or false; drawing the glyphs",
    ]);
  });
});
