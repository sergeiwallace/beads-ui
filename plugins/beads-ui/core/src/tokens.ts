import type { Priority, StatusCategory } from "./model.ts";

/** One semantic token set (D-19); each surface maps the names to its own colour system. */
export const TOKENS = [
  "status.active",
  "status.wip",
  "status.frozen",
  "status.done",
  "priority.p0",
  "priority.p1",
  "priority.p2",
  "priority.p3",
  "priority.p4",
  "surface.card",
  "surface.focus",
  "surface.header",
  "surface.hover",
  "text.default",
  "text.dim",
  "accent",
  "success",
  "warning",
  "error",
  "conflict",
  "control",
] as const;
export type Token = (typeof TOKENS)[number];

/** A mod `Text` colour: a Claude Code theme key, which follows the person's light or dark theme. */
export type TerminalColor = { kind: "theme"; key: string };

const theme = (key: string): TerminalColor => ({ kind: "theme", key });

/**
 * The terminal map (D-19, D-43). Theme keys are names in Claude Code's theme objects, read from
 * the 2.1.306 binary on 2026-10-21 (text, inactive, subtle, suggestion, success, error, warning,
 * claude, permission, promptBorder) and `merged` from the 2.1.310 binary on 2026-10-25; they
 * follow the user's light or dark theme. `control` colours the bracket every pressable element
 * draws (T-2C.14), on the accent's key. `surface.header` fills the pane's header bar and
 * `surface.hover` a pressable row under the pointer (T-2C.12), on the keys Claude Code fills its
 * own message rows and their hover with, read from the 2.1.310 binary on 2026-10-25. `[theme]`
 * sets any token to a hex value (resolveTheme).
 */
export const TERMINAL_THEME: Readonly<Record<Token, TerminalColor>> = {
  "status.active": theme("suggestion"),
  "status.wip": theme("claude"),
  "status.frozen": theme("inactive"),
  "status.done": theme("success"),
  "priority.p0": theme("error"),
  "priority.p1": theme("warning"),
  "priority.p2": theme("text"),
  "priority.p3": theme("inactive"),
  "priority.p4": theme("subtle"),
  "surface.card": theme("promptBorder"),
  "surface.focus": theme("permission"),
  "surface.header": theme("userMessageBackground"),
  "surface.hover": theme("userMessageBackgroundHover"),
  "text.default": theme("text"),
  "text.dim": theme("inactive"),
  accent: theme("claude"),
  success: theme("success"),
  warning: theme("warning"),
  error: theme("error"),
  conflict: theme("merged"),
  control: theme("claude"),
};

export function statusToken(category: StatusCategory): Token {
  return `status.${category}`;
}

export function priorityToken(priority: Priority): Token {
  return `priority.p${priority}`;
}

export const isToken = (name: string): name is Token =>
  (TOKENS as readonly string[]).includes(name);

/** Looks a token up by name, as read from a theme preset; undefined when the name is not a token. */
export function terminalColor(name: string): TerminalColor | undefined {
  return isToken(name) ? TERMINAL_THEME[name] : undefined;
}

/** Hex values `[theme]` sets, one per token it names. */
export type ThemeOverrides = Readonly<Partial<Record<Token, string>>>;

/** The colour a surface draws for `token`: its `[theme]` hex value when set, else its theme key. */
export const colorFor = (token: Token, overrides: ThemeOverrides = {}): string =>
  overrides[token] ?? TERMINAL_THEME[token].key;
