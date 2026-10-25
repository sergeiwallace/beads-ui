// Runners: Vitest only. It reads the mod's source files, which the mod environment cannot list.
// D-43, T-2C.9: every colour the band and the pane draw is a token from core's token map, so no
// raw colour (a hex value or a named colour) sits in hooks/ or client/.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pluginRoot = resolve(import.meta.dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "tests" ? [] : sources(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

/** A string literal holding a hex colour, or a colour prop set from a string literal. */
const RAW_COLOUR = [
  /["'`]#[0-9a-fA-F]{3,8}["'`]/,
  /\b(?:color|[a-z]+Color)\s*:\s*["'`]/,
  /\bhover\s*:\s*\{[^}]*\bcolor\s*:\s*["'`]/,
];

/** Each line of `text` that draws a raw colour, as `<line>: <text>`. */
function rawColours(text: string): string[] {
  return text
    .split("\n")
    .map((line, i) => ({ line, at: i + 1 }))
    .filter(({ line }) => !/^\s*(\/\/|\*)/.test(line))
    .filter(({ line }) => RAW_COLOUR.some((pattern) => pattern.test(line)))
    .map(({ line, at }) => `${at}: ${line.trim()}`);
}

describe("raw colours (D-43, T-2C.9)", () => {
  it("should find a hex value, a named colour prop and a hover colour, and pass a token's colour", () => {
    expect(rawColours('Text({ color: "#ff0000", children: "x" })')).toHaveLength(1);
    expect(rawColours('Text({ color: "red", children: "x" })')).toHaveLength(1);
    expect(rawColours('Button({ hover: { inverse: true, color: "blue" } })')).toHaveLength(1);
    expect(rawColours('selectedColor: "magenta",')).toHaveLength(1);
    expect(rawColours('Text({ color: colorOf("warning"), children: "x" })')).toEqual([]);
    expect(rawColours("// a comment naming #ff0000")).toEqual([]);
  });

  it("should draw no raw colour anywhere in hooks/ or client/ outside the token map", () => {
    const files = [...sources(join(pluginRoot, "hooks")), ...sources(join(pluginRoot, "client"))];
    expect(files.length).toBeGreaterThan(10);
    const found = files.flatMap((file) =>
      rawColours(readFileSync(file, "utf8")).map((hit) => `${relative(pluginRoot, file)}:${hit}`),
    );
    expect(found).toEqual([]);
  });
});
