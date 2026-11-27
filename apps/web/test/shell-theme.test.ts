import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync(new URL("../client/shell.css", import.meta.url), "utf8");
const theme = readFileSync(
  new URL("../../../packages/web-ui/src/theme.css", import.meta.url),
  "utf8",
);

const SHADCN_VARIABLES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "radius",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
];

const rootBlock = /^:root\s*\{([^}]*)\}/m.exec(shell)?.[1] ?? "";
const mapped = new Map(
  [...rootBlock.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]]),
);
const defined = new Set([...theme.matchAll(/(--bu-[a-z0-9-]+):/g)].map((match) => match[1]));

describe("the shell's shadcn theme", () => {
  it("should set every shadcn variable to a D-19 token when theme.css defines that token", () => {
    const wrong = SHADCN_VARIABLES.filter((name) => {
      const value = mapped.get(name);
      const token = /^var\((--bu-[a-z0-9-]+)\)$/.exec(value ?? "")?.[1];
      return token === undefined || !defined.has(token);
    });

    expect(wrong).toEqual([]);
  });

  it("should load Tailwind's theme and utilities when it builds, and not its Preflight", () => {
    expect(shell).toMatch(/@import "tailwindcss\/theme\.css" layer\(theme\)/);
    expect(shell).toMatch(/@import "tailwindcss\/utilities\.css" layer\(utilities\)/);
    expect(shell).not.toMatch(/@import "tailwindcss(\/preflight\.css)?"/);
  });
});
