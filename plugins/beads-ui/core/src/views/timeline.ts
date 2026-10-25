// The Timeline view (T-2B.9, R-24): the store's epics and milestone issues placed by due date on
// one axis, and the ones with no due date listed apart. Pure: the terminal draws each item as a
// Raster bar, every other surface as a Text row, both from this model (D-31).

import { PRESS_FRAME_COLUMNS, tierOf } from "../layout.ts";
import type { Issue, Status, StatusCategory } from "../model.ts";
import { sortIssues } from "../sort.ts";
import { statusToken, type Token } from "../tokens.ts";
import { rowWindow } from "./panel.ts";
import {
  RASTER_DEFAULT_COLOR,
  RASTER_TRACK_COLOR,
  type RasterCell,
  rasterCells,
  rasterColorFor,
} from "./raster.ts";
import { truncate } from "./text.ts";

/** The issue types the Timeline places: epics, and milestones such as D-5's `Sprint <name>`. */
export const TIMELINE_TYPES: readonly string[] = ["epic", "milestone"];

export const isTimelineIssue = (issue: Issue): boolean => TIMELINE_TYPES.includes(issue.type);

const DAY_MS = 86_400_000;

/** The UTC day number of a stamp's `YYYY-MM-DD` start; undefined when it names no real day. */
export function dayOf(stamp: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(stamp);
  if (match === null) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = new Date(Date.UTC(year, month - 1, day));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) {
    return undefined;
  }
  return at.getTime() / DAY_MS;
}

/** A status's category as `bd statuses` lists it; bd 1.3's built-in one when it is not listed. */
function categoryOf(issue: Issue, statuses: readonly Status[]): StatusCategory {
  const listed = statuses.find((status) => status.name === issue.status)?.category;
  if (listed !== undefined) return listed;
  if (issue.status === "closed") return "done";
  if (["in_progress", "blocked", "hooked"].includes(issue.status)) return "wip";
  if (issue.status === "deferred" || issue.status === "pinned") return "frozen";
  return "active";
}

export interface TimelineEntry {
  id: string;
  /** The display id, or the title when the issue has none; cut to fit when drawn. */
  label: string;
  category: StatusCategory;
  token: Token;
}

export interface TimelineItem extends TimelineEntry {
  /** The due date, `YYYY-MM-DD`. */
  due: string;
  day: number;
  /** Where the due date sits on the axis: 0 at its start, 1 at its end. */
  position: number;
}

export interface TimelineAxis {
  start: string;
  end: string;
}

export interface TimelineView {
  /** The dated items, by due date, then priority, then age. */
  items: TimelineItem[];
  /** The epics and milestones with no due date, listed after the axis. */
  undated: TimelineEntry[];
  /** From the earliest due date, or today when every one is later, to the latest. */
  axis: TimelineAxis | undefined;
}

const dateOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

/**
 * The Timeline of `issues`: their epics and milestones, each placed by its due date. `today`, a
 * stamp, starts the axis when every due date is after it.
 */
export function timelineView(
  issues: readonly Issue[],
  options: { statuses: readonly Status[]; today?: string },
): TimelineView {
  const entryOf = (issue: Issue): TimelineEntry => {
    const category = categoryOf(issue, options.statuses);
    return {
      id: issue.id,
      label: issue.displayId ?? issue.title,
      category,
      token: statusToken(category),
    };
  };
  const dated: { issue: Issue; day: number }[] = [];
  const undated: Issue[] = [];
  for (const issue of sortIssues(issues.filter(isTimelineIssue))) {
    const day = issue.dueAt === undefined ? undefined : dayOf(issue.dueAt);
    if (day === undefined) undated.push(issue);
    else dated.push({ issue, day });
  }
  // sortIssues ordered by priority then age; a stable sort by day keeps that within a day.
  dated.sort((a, b) => a.day - b.day);
  const first = dated[0]?.day;
  const last = dated[dated.length - 1]?.day;
  const today = options.today === undefined ? undefined : dayOf(options.today);
  const start =
    first === undefined ? undefined : today !== undefined && today < first ? today : first;
  const span = start === undefined || last === undefined ? 0 : last - start;
  return {
    items: dated.map(({ issue, day }) => ({
      ...entryOf(issue),
      due: dateOf(day),
      day,
      position: span === 0 ? 1 : (day - (start ?? day)) / span,
    })),
    undated: undated.map(entryOf),
    axis:
      start === undefined || last === undefined
        ? undefined
        : { start: dateOf(start), end: dateOf(last) },
  };
}

/** `beside`: the label left of its bar, from the wide tier; `above`: the label on its own line. */
export type TimelinePlacement = "beside" | "above";

export const timelinePlacement = (width: number): TimelinePlacement =>
  tierOf(Math.max(1, Math.floor(width))) === "wide" ? "beside" : "above";

/** Columns the due date takes after a bar. */
export const DUE_COLUMNS = 10;
/** The widest a Raster may be (Claude Code 2.1.310). */
export const RASTER_MAX_COLUMNS = 512;

export interface TimelineRow {
  id: string;
  /** The label cut to the room it is drawn in. */
  label: string;
  due: string;
  token: Token;
  category: StatusCategory;
  /** The bar's cells: `filled` of `columns` coloured, from the axis start to the due date. */
  columns: number;
  filled: number;
  /** A Text row's line, for a surface with no Raster: the due date then the label. */
  line: string;
}

export interface TimelineLayout {
  placement: TimelinePlacement;
  /** In the `beside` placement, the columns the label takes. */
  labelColumns: number;
  rows: TimelineRow[];
  undated: { id: string; label: string }[];
  /** The summary line above the items, cut to the width. */
  summary: string;
  /** The axis line, `start to end`, cut to the width; empty with no dated item. */
  axisLine: string;
  /** The undated list's heading. */
  undatedHeading: string;
  /** The line drawn in place of the axis when no item has a due date. */
  emptyLine: string;
  /** With a row window: the items, dated then undated, before and after it, not drawn. */
  above: number;
  below: number;
}

export interface TimelineWindow {
  /** The item the focus ring is on, kept inside the window. */
  focusedId?: string;
  /** The most items drawn, dated and undated together. */
  rows?: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The Timeline at a view `width`: in the wide tier each label beside its bar, below it the label
 * above; every line, bar and label within `width`. With `shownRows.rows`, at most that many items,
 * the dated then the undated as one list, in a window that follows the focus as the Tasks view's
 * does (T-2B.1).
 */
export function timelineLayout(
  view: TimelineView,
  width: number,
  shownRows: TimelineWindow = {},
): TimelineLayout {
  const columns = Math.max(1, Math.floor(width));
  const placement = timelinePlacement(columns);
  const labelColumns =
    placement === "beside" ? Math.min(28, Math.max(10, Math.floor(columns * 0.3))) : columns;
  // Beside: label, a space, the bar, a space, the due date. Above: the bar, a space, the date.
  // Each label is a button, cut to leave room for its clickable brackets (T-2C.14).
  const room = columns - DUE_COLUMNS - 1 - (placement === "beside" ? labelColumns + 1 : 0);
  const barColumns = Math.min(RASTER_MAX_COLUMNS, Math.max(1, room));
  const total = view.items.length + view.undated.length;
  const dated = view.items.length;
  const { start, end } = rowWindow(
    [...view.items, ...view.undated].map((entry) => entry.id),
    shownRows.focusedId,
    shownRows.rows,
  );
  return {
    placement,
    labelColumns,
    above: start,
    below: total - end,
    rows: view.items.slice(start, Math.min(end, dated)).map((item) => ({
      id: item.id,
      label: truncate(item.label, labelColumns - PRESS_FRAME_COLUMNS),
      due: item.due,
      token: item.token,
      category: item.category,
      columns: barColumns,
      filled: 1 + Math.round(item.position * (barColumns - 1)),
      line: truncate(`${item.due} ${item.label}`, columns - PRESS_FRAME_COLUMNS),
    })),
    undated: view.undated
      .slice(Math.max(0, start - dated), Math.max(0, end - dated))
      .map((entry) => ({
        id: entry.id,
        label: truncate(entry.label, columns - PRESS_FRAME_COLUMNS),
      })),
    summary: truncate(
      `${plural(total, "epic or milestone", "epics and milestones")}: ${view.items.length} with a due date, ${view.undated.length} without`,
      columns,
    ),
    axisLine:
      view.axis === undefined ? "" : truncate(`${view.axis.start} to ${view.axis.end}`, columns),
    undatedHeading: truncate(`No due date (${view.undated.length})`, columns),
    emptyLine: truncate(
      total === 0
        ? "The store holds no epic or milestone."
        : "No epic or milestone has a due date: set one with its Due field.",
      columns,
    ),
  };
}

/** A bar's colour by its status category, as 0xRRGGBB: D-19's status tokens for a Raster. */
export const RASTER_COLORS: Readonly<Record<StatusCategory, number>> = {
  active: rasterColorFor("status.active"),
  wip: rasterColorFor("status.wip"),
  frozen: rasterColorFor("status.frozen"),
  done: rasterColorFor("status.done"),
};

/** A bar's cells: `filled` spaces on `color`, then the track, a dim dot a cell. */
export function barRun(columns: number, filled: number, color: number): RasterCell[] {
  return Array.from({ length: Math.max(0, columns) }, (_, i) =>
    i < filled
      ? { codePoint: 0x20, color: RASTER_DEFAULT_COLOR, background: color }
      : { codePoint: 0x2e, color: RASTER_TRACK_COLOR, background: RASTER_DEFAULT_COLOR },
  );
}

/** A one-row Raster's `cells` for a bar (barRun), as Claude Code's Raster reads them. */
export function barCells(columns: number, filled: number, color: number): string {
  return rasterCells(barRun(columns, filled, color));
}
