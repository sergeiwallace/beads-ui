import { buildColumns, type ColumnsResult } from "./columns.ts";
import type { Issue, Sprint, Status } from "./model.ts";
import { DEFAULT_SORT, sortIssues } from "./sort.ts";

// The Sprint view (web app design T-W1.0, over D-5 of the beads-ui design): a sprint's members are
// the issues labelled `sprint:<name>`, and its dates come from the `milestone` issue titled
// `Sprint <name>` (`due_at`, and `sprint.starts_at` in metadata). The label is the membership
// record and the milestone derived display data, so a sprint with no milestone still lists its
// members and only lacks dates. The backlog is every unfinished issue in no sprint.

export const SPRINT_LABEL_PREFIX = "sprint:";
export const BACKLOG_LABEL = "Backlog";

export type SprintSelection = { kind: "backlog" } | { kind: "sprint"; name: string };

export interface SprintInfo extends Sprint {
  /** False once its milestone is in a done-category status; a sprint with no milestone is open. */
  open: boolean;
  /** Issues carrying its label. */
  members: number;
}

export interface SprintPickerEntry {
  selection: SprintSelection;
  label: string;
  /** Issues the entry lists. */
  count: number;
  startsAt?: string;
  dueAt?: string;
  selected: boolean;
}

export interface SprintView {
  selection: SprintSelection;
  /** The selected sprint, when one is selected and known by its label or its milestone. */
  sprint?: SprintInfo;
  /** The backlog first, then every open sprint by start date, due date and name. */
  picker: SprintPickerEntry[];
  /** The selected issues as a board: one column per status (buildColumns). */
  board: ColumnsResult;
  /** The same issues as a list, in the view's order. */
  list: Issue[];
}

export interface SprintViewOptions {
  statuses: readonly Status[];
  selection: SprintSelection;
  /** The list's and each column's order; priority then created when absent. */
  order?: (issues: readonly Issue[]) => Issue[];
}

const MILESTONE_TITLE = /^Sprint (.+)$/;

/** The sprint names `issue` is labelled with. */
export const sprintLabelsOf = (issue: Issue): string[] =>
  issue.labels
    .filter((label) => label.startsWith(SPRINT_LABEL_PREFIX))
    .map((label) => label.slice(SPRINT_LABEL_PREFIX.length))
    .filter((name) => name !== "");

/** The sprint `issue` records the dates of, when it is a `milestone` titled `Sprint <name>`. */
export function milestoneSprintOf(issue: Issue): string | undefined {
  if (issue.type !== "milestone") return undefined;
  const name = MILESTONE_TITLE.exec(issue.title)?.[1]?.trim();
  return name === undefined || name === "" ? undefined : name;
}

/** A sprint milestone's start, `sprint.starts_at` in its metadata, flat or nested. */
export function startsAtOf(issue: Issue): string | undefined {
  const flat = issue.metadata["sprint.starts_at"];
  if (typeof flat === "string" && flat !== "") return flat;
  const nested = issue.metadata.sprint;
  if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
    const value = (nested as Record<string, unknown>).starts_at;
    if (typeof value === "string" && value !== "") return value;
  }
  return undefined;
}

function doneStatuses(statuses: readonly Status[]): Set<string> {
  const done = new Set(statuses.filter((s) => s.category === "done").map((s) => s.name));
  if (done.size === 0) done.add("closed");
  return done;
}

/** Every sprint the store names, by label or by milestone, in no particular order. */
export function sprintsOf(issues: readonly Issue[], statuses: readonly Status[]): SprintInfo[] {
  const done = doneStatuses(statuses);
  const byName = new Map<string, SprintInfo>();
  const entry = (name: string): SprintInfo => {
    let found = byName.get(name);
    if (found === undefined) {
      found = { name, open: true, members: 0 };
      byName.set(name, found);
    }
    return found;
  };
  for (const issue of issues) {
    const milestone = milestoneSprintOf(issue);
    if (milestone !== undefined) {
      const sprint = entry(milestone);
      // A second milestone for one name only fills what the first left out.
      if (sprint.milestoneId === undefined) {
        sprint.milestoneId = issue.id;
        sprint.open = !done.has(issue.status);
        const startsAt = startsAtOf(issue);
        if (startsAt !== undefined) sprint.startsAt = startsAt;
        if (issue.dueAt !== undefined) sprint.dueAt = issue.dueAt;
      }
      continue;
    }
    for (const name of new Set(sprintLabelsOf(issue))) entry(name).members++;
  }
  return [...byName.values()];
}

const time = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
};

function earlier(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

const bySchedule = (a: SprintInfo, b: SprintInfo): number =>
  earlier(time(a.startsAt), time(b.startsAt)) ||
  earlier(time(a.dueAt), time(b.dueAt)) ||
  (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** The issues a selection lists: a sprint's labelled members, or the unfinished issues in none. */
export function selectedIssues(
  issues: readonly Issue[],
  statuses: readonly Status[],
  selection: SprintSelection,
): Issue[] {
  const work = issues.filter((issue) => milestoneSprintOf(issue) === undefined);
  if (selection.kind === "sprint") {
    return work.filter((issue) => sprintLabelsOf(issue).includes(selection.name));
  }
  const done = doneStatuses(statuses);
  return work.filter((issue) => !done.has(issue.status) && sprintLabelsOf(issue).length === 0);
}

const sameSelection = (a: SprintSelection, b: SprintSelection): boolean =>
  a.kind === "backlog" ? b.kind === "backlog" : b.kind === "sprint" && a.name === b.name;

export function sprintView(issues: readonly Issue[], options: SprintViewOptions): SprintView {
  const order = options.order ?? ((list: readonly Issue[]) => sortIssues(list, DEFAULT_SORT));
  const sprints = sprintsOf(issues, options.statuses);
  const backlog = selectedIssues(issues, options.statuses, { kind: "backlog" });
  const picker: SprintPickerEntry[] = [
    {
      selection: { kind: "backlog" },
      label: BACKLOG_LABEL,
      count: backlog.length,
      selected: options.selection.kind === "backlog",
    },
    ...sprints
      .filter((sprint) => sprint.open)
      .sort(bySchedule)
      .map((sprint): SprintPickerEntry => {
        const selection: SprintSelection = { kind: "sprint", name: sprint.name };
        const row: SprintPickerEntry = {
          selection,
          label: sprint.name,
          count: sprint.members,
          selected: sameSelection(selection, options.selection),
        };
        if (sprint.startsAt !== undefined) row.startsAt = sprint.startsAt;
        if (sprint.dueAt !== undefined) row.dueAt = sprint.dueAt;
        return row;
      }),
  ];
  const list = order(selectedIssues(issues, options.statuses, options.selection));
  const columns = buildColumns(options.statuses, list);
  const board: ColumnsResult = {
    columns: columns.columns.map((column) => ({ ...column, issues: order(column.issues) })),
    unplaced: order(columns.unplaced),
  };
  const view: SprintView = { selection: options.selection, picker, board, list };
  const { selection } = options;
  if (selection.kind === "sprint") {
    const sprint = sprints.find((one) => one.name === selection.name);
    if (sprint !== undefined) view.sprint = sprint;
  }
  return view;
}

/** A selection as a URL or preference value: `backlog`, or `sprint:<name>`. */
export const sprintSelectionText = (selection: SprintSelection): string =>
  selection.kind === "backlog" ? "backlog" : `${SPRINT_LABEL_PREFIX}${selection.name}`;

/** The selection a stored value names; anything else is the backlog. */
export function parseSprintSelection(text: string): SprintSelection {
  if (text.startsWith(SPRINT_LABEL_PREFIX)) {
    const name = text.slice(SPRINT_LABEL_PREFIX.length);
    if (name !== "") return { kind: "sprint", name };
  }
  return { kind: "backlog" };
}
