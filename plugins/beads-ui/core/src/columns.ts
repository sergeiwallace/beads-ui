import { type Issue, type Result, STATUS_CATEGORIES, type Status } from "./model.ts";
import { DEFAULT_SORT, type SortSpec, sortIssues } from "./sort.ts";

export interface Column {
  status: Status;
  issues: Issue[];
  count: number;
  /** The configured soft limit (D-22, `views.soft_wip_limit`), when one is set for this status. */
  limit?: number;
  /** True when `count` exceeds `limit`; the surface colours the header with the `warning` token. */
  overLimit: boolean;
}

export interface ColumnsResult {
  columns: Column[];
  /** Issues whose status is not among the store's statuses; never dropped silently. */
  unplaced: Issue[];
}

export interface ColumnOptions {
  softWipLimit?: Readonly<Record<string, number>>;
  sort?: SortSpec;
}

/**
 * One column per status from `bd statuses`, ordered by category active, wip, frozen, done and
 * then by bd's own order. Which column is "done" comes from the category, never the position.
 */
export function buildColumns(
  statuses: readonly Status[],
  issues: readonly Issue[],
  options: ColumnOptions = {},
): ColumnsResult {
  const seen = new Set<string>();
  const ordered = STATUS_CATEGORIES.flatMap((category) =>
    statuses.filter((status) => status.category === category),
  ).filter((status) => {
    if (seen.has(status.name)) return false;
    seen.add(status.name);
    return true;
  });

  const sorted = sortIssues(issues, options.sort ?? DEFAULT_SORT);
  const columns = ordered.map((status): Column => {
    const members = sorted.filter((issue) => issue.status === status.name);
    const column: Column = {
      status,
      issues: members,
      count: members.length,
      overLimit: false,
    };
    const limit = options.softWipLimit?.[status.name];
    if (limit !== undefined) {
      column.limit = limit;
      column.overLimit = members.length > limit;
    }
    return column;
  });
  return { columns, unplaced: sorted.filter((issue) => !seen.has(issue.status)) };
}

export const SWIMLANE_MODES = ["none", "assignee", "epic"] as const;
export type SwimlaneMode = (typeof SWIMLANE_MODES)[number];

export interface Swimlane {
  /** The assignee or parent id this lane holds; "" for the unassigned or no-epic lane. */
  key: string;
  label: string;
  issues: Issue[];
}

export const UNASSIGNED_LANE_LABEL = "unassigned";
export const NO_EPIC_LANE_LABEL = "no epic";

function laneLabel(parent: Issue | undefined, id: string): string {
  if (parent === undefined) return id;
  return `${parent.displayId ?? parent.id} ${parent.title}`;
}

/**
 * Rows of the board. `assignee` gives one lane per distinct assignee, sorted by name, plus an
 * unassigned lane that is always present; `epic` groups by `parent`, labelled from `lookup`.
 */
export function buildSwimlanes(
  issues: readonly Issue[],
  mode: SwimlaneMode,
  lookup: readonly Issue[] = issues,
): Swimlane[] {
  if (mode === "none") return [{ key: "", label: "", issues: [...issues] }];

  const keyOf = (issue: Issue): string =>
    (mode === "assignee" ? issue.assignee : issue.parent) ?? "";
  const keys = [...new Set(issues.map(keyOf).filter((key) => key !== ""))].sort();
  const lanes = keys.map((key): Swimlane => {
    const label =
      mode === "assignee"
        ? key
        : laneLabel(
            lookup.find((issue) => issue.id === key),
            key,
          );
    return { key, label, issues: issues.filter((issue) => keyOf(issue) === key) };
  });
  lanes.push({
    key: "",
    label: mode === "assignee" ? UNASSIGNED_LANE_LABEL : NO_EPIC_LANE_LABEL,
    issues: issues.filter((issue) => keyOf(issue) === ""),
  });
  return lanes;
}

export interface SwimlaneModeError {
  kind: "unknown-swimlane";
  text: string;
  acceptedModes: readonly SwimlaneMode[];
}

/** Reads a persisted swimlane preference. */
export function parseSwimlaneMode(text: string): Result<SwimlaneMode, SwimlaneModeError> {
  const match = SWIMLANE_MODES.find((mode) => mode === text.trim());
  if (match === undefined) {
    return { ok: false, error: { kind: "unknown-swimlane", text, acceptedModes: SWIMLANE_MODES } };
  }
  return { ok: true, value: match };
}

/** The next mode for the `s` hotkey: none, assignee, epic, then none again. */
export function nextSwimlaneMode(mode: SwimlaneMode): SwimlaneMode {
  const index = SWIMLANE_MODES.indexOf(mode);
  return SWIMLANE_MODES[(index + 1) % SWIMLANE_MODES.length] ?? "none";
}
