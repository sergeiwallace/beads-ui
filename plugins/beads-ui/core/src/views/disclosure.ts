// The band's disclosure levels (D-36, T-2C.2): the summary line, whose counts are buttons; a
// count's task rows under its line, band.rows at a time; and the overview of the views the band
// draws. Pure: a reducer over the person's presses, and the layouts the band draws from it.

import { glyphOf } from "../glyphs.ts";
import type { GutterCell } from "../indicators.ts";
import { buttonWidth, PRESS_FRAME_COLUMNS, textWidth } from "../layout.ts";
import type { Issue } from "../model.ts";
import { sortIssues } from "../sort.ts";
import { priorityToken, type Token } from "../tokens.ts";
import {
  type BandLevel,
  type BandLine,
  type BandPart,
  type BandSegment,
  isBandLevel,
  isBandPart,
} from "./band.ts";
import { truncate } from "./text.ts";

/** What the band shows (D-36), kept per session in `$.store`. */
export interface Disclosure {
  level: BandLevel;
  /** The band line (a BandRead key) whose count the rows are of. */
  line: string;
  /** The count whose rows are drawn; `total` is every status, as the expand control draws. */
  part: BandPart;
  /** How many rows are drawn: band.rows, and band.rows more for each "+M more". */
  shown: number;
  /** The overview's view. */
  view: string;
  /** The task the overview details, by id. */
  detail?: string;
  /** The first row the overview's view draws: its list's, or the open detail's. */
  start: number;
  /** While a detail is open, the first row of the list it was opened from, which back restores. */
  listStart?: number;
  /** The band.level the state was chosen under: a new band.level replaces it at the next redraw. */
  basis: BandLevel;
}

export type DisclosureEvent =
  | { type: "count"; line: string; part: BandPart }
  | { type: "expand"; line: string }
  | { type: "more" }
  | { type: "collapse" }
  | { type: "summary" }
  | { type: "overview" }
  | { type: "view"; view: string }
  | { type: "open"; id: string }
  | { type: "back" }
  | { type: "scroll"; start: number };

/** What the levels read from the band's settings. */
export interface DisclosureSettings {
  rows: number;
  level: BandLevel;
}

/** The view the overview opens on. */
export const OVERVIEW_DEFAULT_VIEW = "tasks";

/** The band at `settings.level`, about `line`; the rows level opens every status, as expand does. */
export function initialDisclosure(settings: DisclosureSettings, line: string): Disclosure {
  return {
    level: settings.level,
    line,
    part: "total",
    shown: settings.rows,
    view: OVERVIEW_DEFAULT_VIEW,
    start: 0,
    basis: settings.level,
  };
}

/**
 * The state the band draws: the session's kept one, unless there is none or band.level changed
 * since it was chosen, when the band opens at the new band.level. A smaller band.rows than the
 * rows drawn keeps them; a larger one draws at least band.rows.
 */
export function settleDisclosure(
  kept: Disclosure | undefined,
  settings: DisclosureSettings,
  line: string,
): Disclosure {
  if (kept === undefined || kept.basis !== settings.level) return initialDisclosure(settings, line);
  return kept.shown >= settings.rows ? kept : { ...kept, shown: settings.rows };
}

/**
 * A press on the band. A count opens its rows, or returns to the summary when its rows are the
 * ones open; expand opens every status; "+M more" adds band.rows rows; collapse returns to
 * band.rows; summary returns to the line alone; the overview control opens the overview, or
 * leaves it; a nav press picks the overview's view; a row press opens its task's detail in the
 * overview, and back leaves the detail.
 */
export function reduceDisclosure(
  state: Disclosure,
  event: DisclosureEvent,
  settings: DisclosureSettings,
): Disclosure {
  const rows = settings.rows;
  switch (event.type) {
    case "count": {
      const open = state.level === "rows" && state.line === event.line && state.part === event.part;
      return open
        ? { ...state, level: "summary" }
        : { ...state, level: "rows", line: event.line, part: event.part, shown: rows };
    }
    case "expand":
      return { ...state, level: "rows", line: event.line, part: "total", shown: rows };
    case "more":
      return { ...state, shown: state.shown + rows };
    case "collapse":
      return { ...state, shown: rows };
    case "summary": {
      const { detail: _detail, listStart: _start, ...rest } = state;
      return { ...rest, level: "summary" };
    }
    case "overview": {
      const { detail: _detail, listStart: _start, ...rest } = state;
      return state.level === "overview"
        ? { ...rest, level: "summary" }
        : { ...rest, level: "overview" };
    }
    case "view": {
      const { detail: _detail, listStart: _start, ...rest } = state;
      return { ...rest, level: "overview", view: event.view, start: 0 };
    }
    case "open": {
      const listStart = state.detail === undefined ? state.start : (state.listStart ?? 0);
      return { ...state, level: "overview", detail: event.id, start: 0, listStart };
    }
    case "back": {
      const { detail: _detail, listStart, ...rest } = state;
      return { ...rest, start: listStart ?? 0 };
    }
    case "scroll":
      return { ...state, start: Math.max(0, event.start) };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A kept state read back from `$.store`; undefined when it is not one. */
export function disclosureOf(value: unknown): Disclosure | undefined {
  if (!isRecord(value)) return undefined;
  const { level, line, part, shown, view, detail, start, listStart, basis } = value;
  if (!isBandLevel(level) || !isBandLevel(basis)) return undefined;
  if (typeof part !== "string" || !isBandPart(part)) return undefined;
  if (typeof line !== "string" || typeof view !== "string") return undefined;
  if (typeof shown !== "number" || !Number.isInteger(shown) || shown < 1) return undefined;
  return {
    level,
    line,
    part,
    shown,
    view,
    start: typeof start === "number" && Number.isInteger(start) && start >= 0 ? start : 0,
    basis,
    ...(typeof detail === "string" && detail !== "" ? { detail } : {}),
    ...(typeof detail === "string" &&
    detail !== "" &&
    typeof listStart === "number" &&
    Number.isInteger(listStart) &&
    listStart >= 0
      ? { listStart }
      : {}),
  };
}

// ---- the summary line ---------------------------------------------------------------------

/** The statuses a count's rows are of, in the Tasks view's order, the done count last. */
export const ROW_GROUPS = ["in_progress", "blocked", "open", "done"] as const;
export type RowGroup = (typeof ROW_GROUPS)[number];
export const isRowGroup = (part: BandPart): part is RowGroup =>
  (ROW_GROUPS as readonly string[]).includes(part);

/** The glyph each status count draws before its button, in the count's colour (D-43). */
export const ROW_GLYPHS: Readonly<Record<RowGroup, string>> = {
  in_progress: glyphOf("status.in_progress"),
  blocked: glyphOf("status.blocked"),
  open: glyphOf("status.open"),
  done: glyphOf("status.done"),
};

/**
 * The count hotkeys, letters so that none fires from the prompt the way a band button's digit
 * does: the session's own line takes the count's initial, the firstmate's `[all]` line a key of
 * its own beside it.
 */
export const COUNT_HOTKEYS: Readonly<
  Record<"own" | "all", Readonly<Partial<Record<BandPart, string>>>>
> = {
  own: { total: "t", in_progress: "p", blocked: "b", open: "o", done: "d", unpublished: "w" },
  all: { total: "a", in_progress: "i", blocked: "k", open: "l", done: "j", drift: "u" },
};

/** The band's control hotkeys: expand, overview, "+M more", collapse and summary. */
export const CONTROL_HOTKEYS = {
  expand: "e",
  overview: "v",
  more: "m",
  collapse: "c",
  summary: "s",
} as const;

/** The hotkey a line's count draws with. */
export const countHotkey = (line: string, part: BandPart): string | undefined =>
  COUNT_HOTKEYS[line === "all" ? "all" : "own"][part];

/** One piece of a summary line as the band draws it: text, or a count's button. */
export type SummaryPiece =
  | { kind: "text"; segment: BandSegment }
  | { kind: "count"; segment: BandSegment & { part: BandPart }; glyph?: string; hotkey?: string };

/** The columns a summary piece takes. */
export function pieceWidth(piece: SummaryPiece): number {
  if (piece.kind === "text") return textWidth(piece.segment.text);
  return (piece.glyph === undefined ? 0 : 1) + buttonWidth(piece.segment.text, piece.hotkey);
}

/**
 * A band line laid out in `columns`: its text, every count a button, cut at the end so that it
 * fits. A count that does not fit whole is left out, the line then ending with the cut-short
 * mark, so a narrow band drops the tail as it did when the line was one Text.
 */
export function summaryPieces(line: BandLine, columns: number): SummaryPiece[] {
  const pieces: SummaryPiece[] = line.segments.map((segment) => {
    const part = segment.part;
    if (part === undefined) return { kind: "text", segment };
    const hotkey = countHotkey(line.key, part);
    const glyph = isRowGroup(part) ? ROW_GLYPHS[part] : undefined;
    return {
      kind: "count",
      segment: { ...segment, part },
      ...(glyph === undefined ? {} : { glyph }),
      ...(hotkey === undefined ? {} : { hotkey }),
    };
  });
  const total = pieces.reduce((sum, piece) => sum + pieceWidth(piece), 0);
  if (total <= columns) return pieces;
  const more = glyphOf("text.more");
  const room = columns - 1;
  const out: SummaryPiece[] = [];
  let used = 0;
  for (const piece of pieces) {
    const width = pieceWidth(piece);
    if (used + width <= room) {
      out.push(piece);
      used += width;
      continue;
    }
    if (piece.kind === "text" && room - used > 0) {
      const kept = [...piece.segment.text].slice(0, room - used).join("");
      out.push({ kind: "text", segment: { ...piece.segment, text: kept } });
    }
    break;
  }
  out.push({ kind: "text", segment: { text: more } });
  return out;
}

// ---- a count's rows -----------------------------------------------------------------------

/** A task the band read for a count's rows: the issue and the store it is in. */
export interface BandTask {
  issue: Issue;
  store: string;
}

/** One row under a count: a task, or, for the drift and unpublished counts, a store. */
export interface BandRowView {
  key: string;
  label: string;
  token: Token;
  /** The task a press opens; undefined for a store's row, which is not pressable. */
  id?: string;
  /** A task row's indicator gutter (D-41), drawn left of its label. */
  gutter?: GutterCell[];
}

export interface BandRowsView {
  rows: BandRowView[];
  /** Rows "+M more" has drawn that the band's height leaves out, above the ones drawn. */
  above: number;
  /** The rows not yet drawn: "+M more" draws band.rows more of them. */
  more: number;
  /** Rows past band.rows are drawn, so collapse has something to fold. */
  collapsible: boolean;
}

/** The tasks of a count, in the Tasks view's order: by status, then priority, then age. */
export function orderTasks(
  groups: Readonly<Partial<Record<RowGroup, readonly BandTask[]>>>,
): BandTask[] {
  return ROW_GROUPS.flatMap((group) => {
    const tasks = groups[group] ?? [];
    if (group === "done") {
      return [...tasks].sort((a, b) =>
        (b.issue.closedAt ?? "").localeCompare(a.issue.closedAt ?? ""),
      );
    }
    const order = sortIssues(tasks.map((task) => task.issue));
    return order.map((issue) => tasks.find((task) => task.issue === issue) as BandTask);
  });
}

const groupOf = (status: string): RowGroup =>
  status === "closed"
    ? "done"
    : status === "blocked"
      ? "blocked"
      : status === "open"
        ? "open"
        : "in_progress";

/** A task's row: its status glyph, priority, display id and title, cut to `width`. */
export function taskRowView(task: BandTask, width: number): BandRowView {
  const { issue } = task;
  return {
    key: `band-row:${issue.id}`,
    id: issue.id,
    token: priorityToken(issue.priority),
    label: truncate(
      `${ROW_GLYPHS[groupOf(issue.status)]} P${issue.priority} ${issue.displayId ?? issue.id} ${issue.title}`,
      width,
    ),
  };
}

/**
 * The rows under a count: the first `shown` of `items`, of which the last `budget` are drawn when
 * the band's height holds fewer, with "+M more" for the rest. A row's label is cut to `columns`
 * less its indent and its button's brackets.
 */
export function bandRowsView(
  items: readonly BandRowView[],
  options: { shown: number; rows: number; budget: number },
): BandRowsView {
  const drawn = items.slice(0, Math.max(0, options.shown));
  const budget = Math.max(0, options.budget);
  const above = Math.max(0, drawn.length - budget);
  return {
    rows: drawn.slice(above),
    above,
    more: items.length - drawn.length,
    collapsible: drawn.length > options.rows,
  };
}

/** The columns a row's label may take: the band's less the indent and the button's brackets. */
export const rowLabelColumns = (columns: number, indent: number): number =>
  Math.max(1, columns - indent - PRESS_FRAME_COLUMNS);
