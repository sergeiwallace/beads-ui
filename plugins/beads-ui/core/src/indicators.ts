// The row indicator registry (D-41, D-42, T-2C.3): an ordered list of indicators, each a
// detection over the issue and the read it came from, a glyph of the glyph table and a meaning.
// Every task row draws a left gutter of one cell per enabled indicator, in registry order; the
// help and Settings draw their legend and switches from the same list, so a new indicator is one
// entry here and one glyph in glyphs.ts.

import { type GlyphId, glyphOf } from "./glyphs.ts";
import type { Issue } from "./model.ts";
import type { ReviewItem } from "./review.ts";
import { openItemsOf } from "./reviewList.ts";
import type { Token } from "./tokens.ts";

/** The issues of the read a row comes from, by id and by parent. */
export interface IndicatorRead {
  readonly byId: ReadonlyMap<string, Issue>;
  readonly children: ReadonlyMap<string, readonly Issue[]>;
}

export function indicatorRead(issues: readonly Issue[]): IndicatorRead {
  const byId = new Map<string, Issue>();
  const children = new Map<string, Issue[]>();
  for (const issue of issues) {
    byId.set(issue.id, issue);
    if (issue.parent === undefined) continue;
    const siblings = children.get(issue.parent);
    if (siblings === undefined) children.set(issue.parent, [issue]);
    else siblings.push(issue);
  }
  return { byId, children };
}

export const EMPTY_READ: IndicatorRead = indicatorRead([]);

/**
 * What an indicator is shown: the issue, the read it came from, the sessions the host's session
 * registry holds live (D-26), undefined when no registry was read, and the open, current review
 * items of the pair by task (T-2C.7, `openReviewIndex`), undefined when none were read.
 */
export interface IndicatorContext {
  issue: Issue;
  read: IndicatorRead;
  live: ReadonlySet<string> | undefined;
  review?: ReadonlyMap<string, readonly ReviewItem[]>;
}

/** `on`: the glyph drawn; `dim`: drawn dimmed. Undefined: a blank cell. */
export type IndicatorState = "on" | "dim";

export interface Indicator {
  /** Its key in `[indicators]` and Settings. */
  readonly id: string;
  readonly glyph: GlyphId;
  readonly token: Token;
  /** Its meaning, as the legend writes it. */
  readonly label: string;
  /**
   * Reserved for a later task: kept in the registry's order and the glyph table, but drawn in
   * no gutter, legend or Settings until it detects something.
   */
  readonly planned?: boolean;
  readonly detect: (context: IndicatorContext) => IndicatorState | undefined;
}

/** D-42: an agent row's title, `<name> agent: ` or `<name> coordinator agent: `. */
export const AGENT_TITLE = /^\S+( coordinator)? agent: /;
/** D-42: the label the launch path sets on an agent row (ai-harness AIH-7m40p6). */
export const AGENT_LABEL = "agent";

export const isAgentRow = (issue: Issue): boolean =>
  issue.labels.includes(AGENT_LABEL) || AGENT_TITLE.test(issue.title);

/**
 * D-42: the issue's in-progress agent rows, itself included when it is one. Shown when any is;
 * dimmed when the registry was read and holds none of their assignees live.
 */
export function detectAgent(context: IndicatorContext): IndicatorState | undefined {
  const { issue, read, live } = context;
  const rows = [issue, ...(read.children.get(issue.id) ?? [])].filter(
    (one) => one.status === "in_progress" && isAgentRow(one),
  );
  if (rows.length === 0) return undefined;
  if (live === undefined) return "on";
  return rows.some((row) => row.assignee !== undefined && live.has(row.assignee)) ? "on" : "dim";
}

/**
 * Blocked: status `blocked`, or a `blocks` dependency on an issue not closed, as the read has it
 * (or as `bd show` embedded it). A blocker the read does not hold is taken as closed: the board's
 * read holds every issue of its store that is not.
 */
export function detectBlocked(context: IndicatorContext): IndicatorState | undefined {
  const { issue, read } = context;
  if (issue.status === "blocked") return "on";
  const blocking = issue.dependencies.some((dep) => {
    if (dep.type !== "blocks") return false;
    const status = read.byId.get(dep.id)?.status ?? dep.status;
    return status !== undefined && status !== "closed";
  });
  return blocking ? "on" : undefined;
}

/**
 * Review (T-2C.7): at least one open, current held item of the pair is about the issue, by its bd
 * id or its display id, as its Detail lists them (D-38).
 */
export function detectReview(context: IndicatorContext): IndicatorState | undefined {
  const { issue, review } = context;
  if (review === undefined) return undefined;
  return openItemsOf(review, issue).length > 0 ? "on" : undefined;
}

export const DEFAULT_INDICATORS: readonly Indicator[] = [
  {
    id: "agent",
    glyph: "indicator.agent",
    token: "accent",
    label: "an agent is working on it; dimmed when its session is not live on this host",
    detect: detectAgent,
  },
  {
    id: "blocked",
    glyph: "indicator.blocked",
    token: "error",
    label: "blocked, or an open issue blocks it",
    detect: detectBlocked,
  },
  {
    id: "review",
    glyph: "indicator.review",
    token: "warning",
    label: "an open, current review item is about it: a held decision, blocker or question",
    detect: detectReview,
  },
];

/** The ordered registry: every surface reads the one instance, INDICATORS. */
export class IndicatorRegistry {
  private readonly entries: Indicator[];

  constructor(entries: readonly Indicator[]) {
    this.entries = [...entries];
  }

  /** Adds `entry` at the end, or before `before`; returns what removes it again. */
  register(entry: Indicator, before?: string): () => void {
    if (this.entries.some((one) => one.id === entry.id)) {
      throw new RangeError(`indicator ${entry.id} is already registered`);
    }
    const at = before === undefined ? -1 : this.entries.findIndex((one) => one.id === before);
    if (at < 0) this.entries.push(entry);
    else this.entries.splice(at, 0, entry);
    return () => {
      const now = this.entries.indexOf(entry);
      if (now >= 0) this.entries.splice(now, 1);
    };
  }

  /** Every entry, planned ones included, in order. */
  all(): readonly Indicator[] {
    return [...this.entries];
  }

  /** The entries a gutter, the legend and Settings draw: every one not planned. */
  built(): Indicator[] {
    return this.entries.filter((entry) => entry.planned !== true);
  }

  /** The built entries `switches` leaves on: every one the table does not set to false. */
  enabled(switches: Readonly<Record<string, boolean>>): Indicator[] {
    return this.built().filter((entry) => switches[entry.id] !== false);
  }
}

export const INDICATORS = new IndicatorRegistry(DEFAULT_INDICATORS);

/** Below this many columns the gutter is one cell: the first indicator that fires (D-41). */
export const NARROW_GUTTER_COLUMNS = 48;

/** One cell of a row's gutter: an indicator's glyph, or a blank. */
export interface GutterCell {
  /** The indicator drawn, undefined for a blank. */
  id?: string;
  /** The glyph, or one space. */
  text: string;
  token?: Token;
  dim?: boolean;
}

export const BLANK_CELL: GutterCell = { text: " " };

/** The cells a gutter of `enabled` takes at `columns`: none with none enabled. */
export const gutterCells = (enabled: readonly Indicator[], columns: number): number =>
  enabled.length === 0 ? 0 : columns < NARROW_GUTTER_COLUMNS ? 1 : enabled.length;

/**
 * What a gutter adds to a drawn tree's 100,000 characters, at most: its row Box, its Text and a
 * nested Text per glyph lit, each with a colour. Measured on a Board card under Claude Code
 * 2.1.310's test kit (2026-10-25): 124 with every cell blank, 183 with one glyph lit and 199
 * with it dimmed; 280 leaves room for both of today's glyphs lit. A card prices it
 * (BOARD_PAGE_LIMIT).
 */
export const GUTTER_TREE_CHARS = 280;

/** The columns a row gives its gutter: its cells and the gap after them. */
export const gutterColumns = (enabled: readonly Indicator[], columns: number): number => {
  const cells = gutterCells(enabled, columns);
  return cells === 0 ? 0 : cells + 1;
};

/**
 * A row's gutter: one cell per enabled indicator, in registry order, each its glyph or a blank,
 * so rows stay aligned; below NARROW_GUTTER_COLUMNS, one cell, the first that fires.
 */
export function gutterOf(
  context: IndicatorContext,
  enabled: readonly Indicator[],
  columns: number,
): GutterCell[] {
  const cells = enabled.map((entry): GutterCell => {
    const state = entry.detect(context);
    if (state === undefined) return BLANK_CELL;
    return {
      id: entry.id,
      text: glyphOf(entry.glyph),
      token: entry.token,
      ...(state === "dim" ? { dim: true } : {}),
    };
  });
  if (cells.length === 0 || columns >= NARROW_GUTTER_COLUMNS) return cells;
  return [cells.find((cell) => cell.id !== undefined) ?? BLANK_CELL];
}

/** A gutter as one line of text, blanks as spaces: what a row's label starts with in a capture. */
export const gutterText = (cells: readonly GutterCell[]): string =>
  cells.map((cell) => cell.text).join("");

/** One legend line: an indicator's glyph, its ASCII form and its meaning. */
export interface LegendLine {
  id: string;
  glyph: string;
  ascii: string;
  label: string;
}

export const legendOf = (entries: readonly Indicator[]): LegendLine[] =>
  entries.map((entry) => ({
    id: entry.id,
    glyph: glyphOf(entry.glyph),
    ascii: glyphOf(entry.glyph, true),
    label: entry.label,
  }));

/** One legend line as text: `⟳ (*) agent: an agent is working on it`. */
export const legendText = (line: LegendLine): string =>
  `${line.glyph} (${line.ascii}) ${line.id}: ${line.label}`;
