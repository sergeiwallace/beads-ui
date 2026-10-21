import { moveArgv } from "../argv.ts";
import { buildColumns, buildSwimlanes, type SwimlaneMode } from "../columns.ts";
import { applyFilter, type Filter } from "../filter.ts";
import type { BdArgv, Issue, Result, Status, StatusCategory } from "../model.ts";
import type { SortSpec } from "../sort.ts";
import { priorityToken, statusToken, type Token } from "../tokens.ts";
import { asOf, priorityBadge, truncate } from "./text.ts";

/** bd's exit status for a refused `--if-status` guard: the shown status was stale. */
export const STALE_WRITE_EXIT = 13;

export interface LoadError {
  /** null when the read timed out and has no exit status. */
  exitCode: number | null;
  message: string;
}

export interface PendingMove {
  from: string;
  to: string;
}

export interface BoardState {
  loaded: boolean;
  issues: Issue[];
  statuses: Status[];
  /** The surface clock's stamp for the last good load. */
  loadedAt?: string;
  /** The last failed load; the board keeps showing the last good one meanwhile. */
  loadError?: LoadError;
  /** Moves shown optimistically and not yet confirmed, by issue id. */
  pending: Readonly<Record<string, PendingMove>>;
  /** The last move another actor won (bd exit 13). */
  conflict?: { id: string; shown: string; attempted: string };
  /** The last move that failed for another reason. */
  moveError?: { id: string; exitCode: number; message: string };
  /** Issue ids to re-read with `bd show` (showArgv) and feed back as `issue-refreshed`. */
  refresh: string[];
}

export type BoardEvent =
  | { type: "load-succeeded"; issues: Issue[]; statuses: Status[]; at: string }
  | { type: "load-failed"; exitCode: number | null; message: string }
  | { type: "move-requested"; id: string; to: string }
  | { type: "move-succeeded"; id: string }
  | { type: "move-failed"; id: string; exitCode: number; message: string }
  | { type: "issue-refreshed"; issue: Issue };

export const INITIAL_BOARD_STATE: BoardState = {
  loaded: false,
  issues: [],
  statuses: [],
  pending: {},
  refresh: [],
};

function withStatus(issues: readonly Issue[], id: string, status: string): Issue[] {
  return issues.map((issue) => (issue.id === id ? { ...issue, status } : issue));
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

export function reduceBoard(state: BoardState, event: BoardEvent): BoardState {
  switch (event.type) {
    case "load-succeeded": {
      let issues = event.issues;
      for (const [id, move] of Object.entries(state.pending))
        issues = withStatus(issues, id, move.to);
      const { loadError: _cleared, ...rest } = state;
      return { ...rest, loaded: true, issues, statuses: event.statuses, loadedAt: event.at };
    }
    case "load-failed":
      return { ...state, loadError: { exitCode: event.exitCode, message: event.message } };
    case "move-requested": {
      const issue = state.issues.find((candidate) => candidate.id === event.id);
      if (issue === undefined || state.pending[event.id] !== undefined) return state;
      const { conflict: _c, moveError: _m, ...rest } = state;
      return {
        ...rest,
        issues: withStatus(state.issues, event.id, event.to),
        pending: { ...state.pending, [event.id]: { from: issue.status, to: event.to } },
      };
    }
    case "move-succeeded": {
      if (state.pending[event.id] === undefined) return state;
      return { ...state, pending: withoutKey(state.pending, event.id) };
    }
    case "move-failed": {
      const move = state.pending[event.id];
      if (move === undefined) return state;
      const restored = {
        ...state,
        issues: withStatus(state.issues, event.id, move.from),
        pending: withoutKey(state.pending, event.id),
      };
      if (event.exitCode === STALE_WRITE_EXIT) {
        return {
          ...restored,
          conflict: { id: event.id, shown: move.from, attempted: move.to },
          refresh: restored.refresh.includes(event.id)
            ? restored.refresh
            : [...restored.refresh, event.id],
        };
      }
      return {
        ...restored,
        moveError: { id: event.id, exitCode: event.exitCode, message: event.message },
      };
    }
    case "issue-refreshed": {
      const { issue } = event;
      const known = state.issues.some((candidate) => candidate.id === issue.id);
      return {
        ...state,
        issues: known
          ? state.issues.map((candidate) => (candidate.id === issue.id ? issue : candidate))
          : [...state.issues, issue],
        refresh: state.refresh.filter((id) => id !== issue.id),
      };
    }
  }
}

export type MoveError =
  | { kind: "unknown-issue"; message: string }
  | { kind: "unknown-status"; message: string }
  | { kind: "same-status"; message: string }
  | { kind: "move-pending"; message: string };

/**
 * What picking `to` in a card's Move to control does: the guarded `bd update`, and the event that
 * shows the move at once. The surface dispatches the event, runs the argv, then dispatches
 * `move-succeeded` or `move-failed` with bd's exit status.
 */
export function planMove(
  state: BoardState,
  id: string,
  to: string,
): Result<{ argv: BdArgv; event: BoardEvent }, MoveError> {
  const issue = state.issues.find((candidate) => candidate.id === id);
  if (issue === undefined) {
    return { ok: false, error: { kind: "unknown-issue", message: `${id} is not on the board` } };
  }
  if (state.pending[id] !== undefined) {
    return { ok: false, error: { kind: "move-pending", message: `${id} is still moving` } };
  }
  if (!state.statuses.some((status) => status.name === to)) {
    return { ok: false, error: { kind: "unknown-status", message: `${to} is not a bd status` } };
  }
  if (issue.status === to) {
    return { ok: false, error: { kind: "same-status", message: `${id} is already ${to}` } };
  }
  return {
    ok: true,
    value: { argv: moveArgv(id, to, issue.status), event: { type: "move-requested", id, to } },
  };
}

export interface CardView {
  id: string;
  displayId: string;
  title: string;
  priority: string;
  priorityToken: Token;
  assignee: string;
  /** The Move to options: every other status, in column order. */
  moveTargets: string[];
  pending: boolean;
}

export interface ColumnHeaderView {
  status: string;
  /** The status category, which the surface groups columns by (Mockups: one Box per group). */
  category: StatusCategory;
  label: string;
  count: number;
  token: Token;
  overLimit: boolean;
}

export interface LaneView {
  key: string;
  label: string;
  /** One card list per column, aligned with `columns`. */
  cells: CardView[][];
  /** How many cards each cell left out under `cardLimit`, aligned with `cells`. */
  hidden: number[];
}

export interface BoardView {
  loading: boolean;
  asOf?: string;
  columns: ColumnHeaderView[];
  lanes: LaneView[];
  /** Issues whose status bd did not list. */
  unplaced: CardView[];
  errorLine?: string;
  conflictLine?: string;
  filterLine?: string;
}

export interface BoardViewOptions {
  /** Width of one column in terminal columns; every string is cut to fit it. */
  columnWidth: number;
  swimlane?: SwimlaneMode;
  softWipLimit?: Readonly<Record<string, number>>;
  filter?: Filter;
  readyIds?: ReadonlySet<string>;
  sort?: SortSpec;
  /**
   * The most cards one cell draws, and the most the whole board draws: a mod tree is cut off past
   * 100,000 serialized characters, so a large store shows the first cards of each cell and a
   * count of the rest instead of no board at all.
   */
  cardLimit?: { perCell: number; total: number };
}

/**
 * The mod's card budget. A drawn card measured about 850 serialized characters with this store's
 * nine statuses in its Move to (hooks/pane.test.ts), so 80 cards stay near 70,000 of the 100,000.
 */
export const BOARD_CARD_LIMIT = { perCell: 25, total: 80 } as const;

function errorLine(state: BoardState): string | undefined {
  const error = state.loadError;
  if (error === undefined) return undefined;
  const what =
    error.exitCode === null ? "bd list timed out" : `bd list failed (exit ${error.exitCode})`;
  const detail = error.message === "" ? "" : `: ${error.message}`;
  const kept = state.loadedAt === undefined ? "" : `; showing the board ${asOf(state.loadedAt)}`;
  return `${what}${detail}${kept}; retrying on the next refresh`;
}

function conflictLine(state: BoardState): string | undefined {
  if (state.conflict !== undefined) {
    const { id, shown, attempted } = state.conflict;
    return `${id} changed elsewhere before the move to ${attempted}; restored to ${shown} and refreshed`;
  }
  if (state.moveError !== undefined) {
    const { id, exitCode, message } = state.moveError;
    return `moving ${id} failed (exit ${exitCode}): ${message}`;
  }
  return undefined;
}

export function boardView(state: BoardState, options: BoardViewOptions): BoardView {
  const width = options.columnWidth;
  let issues = state.issues;
  let filterLine: string | undefined;
  if (options.filter !== undefined) {
    const context = options.readyIds === undefined ? {} : { readyIds: options.readyIds };
    const filtered = applyFilter(issues, options.filter, context);
    if (filtered.ok) issues = filtered.value;
    else filterLine = filtered.error.message;
  }

  const columnOptions = {
    ...(options.softWipLimit === undefined ? {} : { softWipLimit: options.softWipLimit }),
    ...(options.sort === undefined ? {} : { sort: options.sort }),
  };
  const { columns, unplaced } = buildColumns(state.statuses, issues, columnOptions);
  const total = buildColumns(state.statuses, state.issues, columnOptions).columns;
  const order = columns.map((column) => column.status.name);

  const card = (issue: Issue): CardView => ({
    id: issue.id,
    displayId: truncate(issue.displayId ?? issue.id, width),
    title: truncate(issue.title, width),
    priority: priorityBadge(issue.priority),
    priorityToken: priorityToken(issue.priority),
    assignee: issue.assignee === undefined ? "" : truncate(`@${issue.assignee}`, width),
    moveTargets: order.filter((name) => name !== issue.status),
    pending: state.pending[issue.id] !== undefined,
  });

  const lanes = buildSwimlanes(
    columns.flatMap((column) => column.issues),
    options.swimlane ?? "none",
    state.issues,
  );
  let budget = options.cardLimit?.total ?? Number.POSITIVE_INFINITY;
  const perCell = options.cardLimit?.perCell ?? Number.POSITIVE_INFINITY;
  const laneViews = lanes.map((lane): LaneView => {
    const cells: CardView[][] = [];
    const hidden: number[] = [];
    for (const column of columns) {
      const members = lane.issues.filter((issue) => issue.status === column.status.name);
      const shown = Math.max(0, Math.min(members.length, perCell, budget));
      budget -= shown;
      cells.push(members.slice(0, shown).map(card));
      hidden.push(members.length - shown);
    }
    return {
      key: lane.key,
      label: truncate(lane.label, width * Math.max(1, columns.length)),
      cells,
      hidden,
    };
  });

  const view: BoardView = {
    loading: !state.loaded,
    columns: columns.map((column, i): ColumnHeaderView => {
      const overLimit = total[i]?.overLimit ?? false;
      return {
        status: column.status.name,
        category: column.status.category,
        label: truncate(`${column.status.name} ${column.count}`, width),
        count: column.count,
        token: overLimit ? "warning" : statusToken(column.status.category),
        overLimit,
      };
    }),
    lanes: laneViews,
    unplaced: unplaced.map(card),
  };
  if (state.loadedAt !== undefined) view.asOf = asOf(state.loadedAt);
  const error = errorLine(state);
  if (error !== undefined) view.errorLine = error;
  const conflict = conflictLine(state);
  if (conflict !== undefined) view.conflictLine = conflict;
  if (filterLine !== undefined) view.filterLine = filterLine;
  return view;
}
