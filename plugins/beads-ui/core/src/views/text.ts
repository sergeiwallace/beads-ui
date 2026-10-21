import type { Priority } from "../model.ts";

/**
 * Fits text to `width` columns on one line: whitespace runs become one space, and an overlong
 * string ends in "…". Counts code points, so a wide glyph still counts as one column.
 */
export function truncate(text: string, width: number): string {
  if (!(width >= 1)) return "";
  const chars = [...text.replace(/\s+/g, " ").trim()];
  if (chars.length <= width) return chars.join("");
  return `${chars
    .slice(0, Math.floor(width) - 1)
    .join("")
    .trimEnd()}…`;
}

export function priorityBadge(priority: Priority): string {
  return `P${priority}`;
}

/** "as of 01:12:04" from the surface clock's ISO stamp; the stamp itself when it has no time. */
export function asOf(stamp: string): string {
  const time = /T(\d{2}:\d{2}:\d{2})/.exec(stamp)?.[1];
  return `as of ${time ?? stamp}`;
}
