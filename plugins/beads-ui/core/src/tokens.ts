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
  "text.default",
  "text.dim",
  "accent",
  "success",
  "warning",
  "error",
  "conflict",
] as const;
export type Token = (typeof TOKENS)[number];

/** A mod `Text` colour: a Claude Code theme key, or a named colour such as "red". */
export type TerminalColor = { kind: "theme"; key: string } | { kind: "named"; name: string };

const theme = (key: string): TerminalColor => ({ kind: "theme", key });

/**
 * The terminal map. Theme keys are names in Claude Code's theme objects, read from the 2.1.306
 * binary on 2026-10-21 (text, inactive, subtle, suggestion, success, error, warning, claude,
 * permission, promptBorder); they follow the user's light or dark theme.
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
  "text.default": theme("text"),
  "text.dim": theme("inactive"),
  accent: theme("claude"),
  success: theme("success"),
  warning: theme("warning"),
  error: theme("error"),
  conflict: { kind: "named", name: "magenta" },
};

export function statusToken(category: StatusCategory): Token {
  return `status.${category}`;
}

export function priorityToken(priority: Priority): Token {
  return `priority.p${priority}`;
}

/** Looks a token up by name, as read from a theme preset; undefined when the name is not a token. */
export function terminalColor(name: string): TerminalColor | undefined {
  const token = TOKENS.find((candidate) => candidate === name);
  return token === undefined ? undefined : TERMINAL_THEME[token];
}
