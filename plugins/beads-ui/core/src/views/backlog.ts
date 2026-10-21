import { applyFilter, describeFilterError, type FilterState } from "../filter.ts";
import type { Issue, Status } from "../model.ts";
import { DEFAULT_SORT, type SortSpec, sortIssues } from "../sort.ts";
import { priorityToken, type Token } from "../tokens.ts";
import { type PageView, pageOf } from "./board.ts";
import { priorityBadge, truncate } from "./text.ts";

export interface BacklogRow {
  id: string;
  displayId: string;
  priority: string;
  priorityToken: Token;
  type: string;
  assignee: string;
  title: string;
  /** The created date, YYYY-MM-DD. */
  created: string;
}

export interface BacklogView {
  /** The rows on the drawn page. */
  rows: BacklogRow[];
  /** Which rows are drawn of every row the filter kept; `pages` is 1 when they all fit. */
  page: PageView;
  /** Open issues before the filter. */
  total: number;
  /** The filter's error, such as an unknown key with the accepted keys; the rows are unchanged. */
  filterLine?: string;
}

/**
 * The rows one Backlog page draws in the mod, which keeps a large store's drawing under the mods
 * API's 100,000-character tree limit; the other rows are a page step away.
 */
export const BACKLOG_PAGE_SIZE = 60;

export interface BacklogOptions {
  statuses: readonly Status[];
  filter: FilterState;
  readyIds?: ReadonlySet<string>;
  sort?: SortSpec;
  /** Width of the title column; the display id is cut to `idWidth`. */
  titleWidth: number;
  idWidth?: number;
  /** Rows per page; every row on one page when absent. */
  pageSize?: number;
  /** The page drawn, clamped to the last; the first when absent. */
  page?: number;
}

/**
 * The open issues (status category `active`; just `open` when bd returned no statuses), sorted by
 * priority then created unless another sort is given, through the filter that last parsed.
 */
export function backlogView(issues: readonly Issue[], options: BacklogOptions): BacklogView {
  const active = new Set(
    options.statuses.filter((status) => status.category === "active").map((status) => status.name),
  );
  if (active.size === 0) active.add("open");
  const open = issues.filter((issue) => active.has(issue.status));

  let shown: Issue[] = open;
  let filterLine: string | undefined;
  if (options.filter.error !== undefined) filterLine = describeFilterError(options.filter.error);
  const context = options.readyIds === undefined ? {} : { readyIds: options.readyIds };
  const filtered = applyFilter(open, options.filter.filter, context);
  if (filtered.ok) shown = filtered.value;
  else filterLine = filtered.error.message;

  const idWidth = options.idWidth ?? 32;
  const sorted = sortIssues(shown, options.sort ?? DEFAULT_SORT);
  const page = pageOf(
    "backlog",
    sorted.length,
    options.pageSize ?? Math.max(1, sorted.length),
    options.page,
  );
  const rows = sorted.slice(page.from === 0 ? 0 : page.from - 1, page.to).map(
    (issue): BacklogRow => ({
      id: issue.id,
      displayId: truncate(issue.displayId ?? issue.id, idWidth),
      priority: priorityBadge(issue.priority),
      priorityToken: priorityToken(issue.priority),
      type: issue.type,
      assignee: issue.assignee ?? "",
      title: truncate(issue.title, options.titleWidth),
      created: issue.createdAt.slice(0, 10),
    }),
  );
  const view: BacklogView = { rows, page, total: open.length };
  if (filterLine !== undefined) view.filterLine = filterLine;
  return view;
}
