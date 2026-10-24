// The pane's layout tiers (T-1B.9, the first step of R-24): what a drawn row costs in terminal
// columns, and how controls are labelled and packed so no row passes the pane's width.

/** `wide` from 72 columns, `medium` from 48 to 71, `narrow` below 48 (the tiers T-2B.1 names). */
export type Tier = "wide" | "medium" | "narrow";

export const WIDE_COLUMNS = 72;
export const MEDIUM_COLUMNS = 48;

export function tierOf(columns: number): Tier {
  if (columns >= WIDE_COLUMNS) return "wide";
  if (columns >= MEDIUM_COLUMNS) return "medium";
  return "narrow";
}

/** A control's label in each tier: the full words, a short word, and the shortest form. */
export interface Labels {
  wide: string;
  medium: string;
  narrow: string;
}

/** The same label in every tier. */
export const labels = (wide: string, medium = wide, narrow = medium): Labels => ({
  wide,
  medium,
  narrow,
});

/** Terminal columns a string takes: one a code point, as every label here is. */
export const textWidth = (text: string): number => [...text].length;

/**
 * The columns a plain `Button` takes: Claude Code draws it `{hotkey}: {label}` (or the label
 * alone without a hotkey) and never shrinks it, so a row of them is as wide as its sum.
 */
export const buttonWidth = (label: string, hotkey?: string): number =>
  textWidth(label) + (hotkey === undefined ? 0 : textWidth(hotkey) + 2);

/** Splits `items` into rows, in order, each no wider than `width` with `gap` between items. */
export function packRows<T extends { width: number }>(
  items: readonly T[],
  width: number,
  gap: number,
): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  let used = 0;
  for (const item of items) {
    const need = row.length === 0 ? item.width : used + gap + item.width;
    if (row.length > 0 && need > width) {
      rows.push(row);
      row = [item];
      used = item.width;
    } else {
      row.push(item);
      used = need;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/**
 * Short height (T-1B.9): above the prompt, or under 12 rows, the pane drops its help and hint
 * lines first, so the tabs, the board's header and a card stay in view.
 */
export const SHORT_ROWS = 12;
export const isShort = (placement: string, bodyRows: number | undefined): boolean =>
  placement === "inline" || (bodyRows !== undefined && bodyRows < SHORT_ROWS);

/** The narrowest a board column group is drawn: a card's Move to and its status fit in it. */
export const MIN_GROUP_COLUMNS = 16;

/**
 * How the board's column groups sit at a width: as many to a row as keep each at least
 * MIN_GROUP_COLUMNS wide, one column of space between them, the rest below.
 */
export function groupLayout(width: number, groups: number): { perRow: number; groupWidth: number } {
  let perRow = Math.max(1, groups);
  const widthOf = (n: number) => Math.floor((width - (n - 1)) / n);
  while (perRow > 1 && widthOf(perRow) < MIN_GROUP_COLUMNS) perRow--;
  return { perRow, groupWidth: Math.max(1, widthOf(perRow)) };
}
