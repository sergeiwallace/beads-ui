// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import { colorFor, resolveTheme, TERMINAL_THEME, TOKENS } from "../src/index.ts";

// D-43 and T-2C.9: every token on a Claude Code theme key, and `[theme]` hex values over them.

describe("theme tokens (D-43, T-2C.9)", () => {
  test("should resolve every token to a Claude Code theme key when [theme] sets nothing", () => {
    for (const token of TOKENS) {
      expect(TERMINAL_THEME[token].kind).toBe("theme");
      expect(colorFor(token)).toBe(TERMINAL_THEME[token].key);
      expect(colorFor(token)).not.toMatch(/^#/);
    }
  });

  test("should draw the clickable bracket on the accent's theme key", () => {
    expect(colorFor("control")).toBe(colorFor("accent"));
  });

  test("should draw a [theme] hex value for the token it names and the theme key for the rest", () => {
    const { overrides, problems } = resolveTheme(
      '[theme]\n"priority.p0" = "#ff0000"\ncontrol = "#0af"\n',
    );

    expect(problems).toEqual([]);
    expect(colorFor("priority.p0", overrides)).toBe("#ff0000");
    expect(colorFor("control", overrides)).toBe("#0af");
    expect(colorFor("warning", overrides)).toBe(TERMINAL_THEME.warning.key);
  });

  test("should ignore an invalid [theme] value with one line naming its key, and keep the theme key", () => {
    const { overrides, problems } = resolveTheme(
      '[theme]\nwarning = "orange"\n"priority.p1" = "#12345"\nbogus = "#ffffff"\n',
    );

    expect(overrides).toEqual({});
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/^theme\.warning "orange" is not a hex colour/);
    expect(problems[1]).toMatch(/^theme\.priority\.p1 "#12345" is not a hex colour/);
    expect(problems[2]).toMatch(/^theme\.bogus names no token/);
  });

  test("should read no [theme] table, or no file, as no overrides and no problem", () => {
    expect(resolveTheme(undefined)).toEqual({ overrides: {}, problems: [] });
    expect(resolveTheme("[panel]\nshown = 3\n")).toEqual({ overrides: {}, problems: [] });
    expect(resolveTheme("theme = 3\n").problems).toEqual([
      "theme must be a table; using the theme's colours",
    ]);
  });
});
