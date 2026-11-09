// @vitest-environment node
import { readFileSync } from "node:fs";
import { TOKENS } from "@beads-ui/core";
import { describe, expect, it } from "vitest";
import { tokenProperty } from "../src/index.ts";

const css = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const OKLCH = String.raw`oklch\([^)]*\)`;

describe("theme.css", () => {
  it("should give every core token an oklch value for light and one for dark", () => {
    const missing = TOKENS.filter((token) => {
      const declaration = new RegExp(
        `${tokenProperty(token)}:\\s*light-dark\\(\\s*${OKLCH}\\s*,\\s*${OKLCH}\\s*\\)`,
      );
      return !declaration.test(css);
    });

    expect(missing).toEqual([]);
  });

  it("should let the root pin light or dark, and raise contrast on request", () => {
    expect(css).toMatch(/:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light;/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{\s*color-scheme:\s*dark;/);
    expect(css).toMatch(/@media \(prefers-contrast: more\)/);
    expect(css).toMatch(/:root\[data-contrast="more"\]/);
  });
});
