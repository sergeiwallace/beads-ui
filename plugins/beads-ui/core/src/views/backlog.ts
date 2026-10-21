import { applyFilter, describeFilterError, type FilterState } from "../filter.ts";
import type { Issue, Status } from "../model.ts";
import { DEFAULT_SORT, type SortSpec, sortIssues } from "../sort.ts";
import { priorityToken, type Token } from "../tokens.ts";
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
  rows: BacklogRow[];
  /** Open issues before the filter. */
  total: number;
  /** The filter's error, such as an unknown key with the accepted keys; the rows are unchanged. */
  filterLine?: string;
}

export interface BacklogOptions {
  statuses: readonly Status[];
  filter: FilterState;
  readyIds?: ReadonlySet<string>;
  sort?: SortSpec;
  /** Width of the title column; the display id is cut to `idWidth`. */
  titleWidth: number;
  idWidth?: number;
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
  const rows = sortIssues(shown, options.sort ?? DEFAULT_SORT).map(
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
  const view: BacklogView = { rows, total: open.length };
  if (filterLine !== undefined) view.filterLine = filterLine;
  return view;
}
