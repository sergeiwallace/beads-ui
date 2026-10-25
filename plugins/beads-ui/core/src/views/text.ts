import { glyphOf } from "../glyphs.ts";
import type { Priority } from "../model.ts";

/**
 * Fits text to `width` columns on one line: whitespace runs become one space, and an overlong
 * string ends in the glyph table's `text.more`. Counts code points, so a wide glyph still counts as one column.
 */
export function truncate(text: string, width: number): string {
  if (!(width >= 1)) return "";
  const chars = [...text.replace(/\s+/g, " ").trim()];
  if (chars.length <= width) return chars.join("");
  return `${chars
    .slice(0, Math.floor(width) - 1)
    .join("")
    .trimEnd()}${glyphOf("text.more")}`;
}

export function priorityBadge(priority: Priority): string {
  return `P${priority}`;
}

/** "as of 01:12:04" from the surface clock's ISO stamp; the stamp itself when it has no time. */
export function asOf(stamp: string): string {
  const time = /T(\d{2}:\d{2}:\d{2})/.exec(stamp)?.[1];
  return `as of ${time ?? stamp}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * An ISO-shaped local stamp, `YYYY-MM-DDTHH:MM:SS`, from the surface clock's milliseconds and the
 * surface's offset from UTC in minutes (a JavaScript `Date`'s `getTimezoneOffset()`).
 */
export function clockStamp(ms: number, offsetMinutes: number): string {
  const local = new Date(ms - offsetMinutes * 60_000);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`
  );
}

/** The store's name as the header shows it: the last segment of its directory. */
export function storeName(path: string): string {
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

/** The most a mod `Markdown` or `Code` block holds. */
export const BLOCK_MAX_CHARS = 10_000;

/** Fits a multi-line block to `max` characters, ending a cut one with a line that says so. */
export function fitBlock(text: string, max: number = BLOCK_MAX_CHARS): string {
  if (text.length <= max) return text;
  const note = `\n\n[cut at ${max} characters]`;
  return `${text.slice(0, Math.max(0, max - note.length))}${note}`;
}
