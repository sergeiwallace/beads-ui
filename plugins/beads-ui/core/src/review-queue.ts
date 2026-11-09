import type { Issue } from "./model.ts";
import type { ReviewItem } from "./review.ts";

// The web app's Review queue (web app design § The Review queue, D-1, T-W1.1): every held item and
// every task that needs Sergei, grouped by next action, sorted by priority, impact, age and id, and
// filtered by epic, goal, type, size, owner and repository, with the filters carried in the URL.

/** The next action each section holds, in the order the view draws them. */
export const REVIEW_ACTIONS = ["answer", "unblock", "prompt"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/**
 * The scale ai-harness's curation scorer writes `metadata.value` and `metadata.effort` on
 * (`bd_curation_metadata.py`, FIBONACCI_ENUM). A value off it is not a curation value.
 */
export const CURATION_SCALE: readonly number[] = [1, 2, 3, 5, 8, 13, 20];

/** An issue as the queue reads it, with the repository of the store it came from. */
export interface QueueIssue {
  issue: Issue;
  repo: string;
}

export interface ReviewQueueEntry {
  /** Unique across the queue: `held:<path>` or `task:<repo>:<id>`. */
  key: string;
  /** The last sort key: a held item's path, a task's display id or bd id. */
  id: string;
  action: ReviewAction;
  source: "held" | "task";
  /** A held item's kind as the held store writes it, or a task's issue type. */
  kind: string;
  title: string;
  /** The issue's priority (a held item's joined issue); absent sorts after every priority. */
  priority?: number;
  /** The curation `value`; absent sorts after every item that has one. */
  impact?: number;
  /** The curation `effort`. */
  size?: number;
  createdAt?: string;
  /** The parent epic's id. */
  epic?: string;
  /** The goals the issue serves through a `relates-to` edge. */
  goals: string[];
  /** The issue type. */
  type?: string;
  /** The owning session's name, without its host. */
  owner?: string;
  repo?: string;
  /** The task's bd id. */
  task?: string;
  item?: ReviewItem;
  issue?: Issue;
}

/** `metadata[key]` as the curation scorer writes it, a number or its decimal spelling. */
export function curationOf(issue: Issue | undefined, key: "value" | "effort"): number | undefined {
  const raw = issue?.metadata?.[key];
  let value: number | undefined;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && /^\d+$/.test(raw.trim())) value = Number(raw.trim());
  return value !== undefined && CURATION_SCALE.includes(value) ? value : undefined;
}

/** The goals `issue` serves: its `relates-to` edges to an issue in `goalIds` (goals design D-2). */
export function goalsOf(issue: Issue | undefined, goalIds: ReadonlySet<string>): string[] {
  if (issue === undefined) return [];
  const found = issue.dependencies
    .filter((dependency) => dependency.type === "relates-to" && goalIds.has(dependency.id))
    .map((dependency) => dependency.id);
  return [...new Set(found)].sort();
}

const finitePriority = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

type IssueFields = Pick<ReviewQueueEntry, "goals"> &
  Partial<
    Pick<
      ReviewQueueEntry,
      "priority" | "impact" | "size" | "epic" | "type" | "repo" | "task" | "issue"
    >
  >;

function issueFields(joined: QueueIssue | undefined, goalIds: ReadonlySet<string>): IssueFields {
  const issue = joined?.issue;
  const fields: IssueFields = {
    goals: goalsOf(issue, goalIds),
  };
  if (issue === undefined || joined === undefined) return fields;
  const priority = finitePriority(issue.priority);
  if (priority !== undefined) fields.priority = priority;
  const impact = curationOf(issue, "value");
  if (impact !== undefined) fields.impact = impact;
  const size = curationOf(issue, "effort");
  if (size !== undefined) fields.size = size;
  if (issue.parent !== undefined) fields.epic = issue.parent;
  if (issue.type !== "") fields.type = issue.type;
  fields.repo = joined.repo;
  fields.task = issue.id;
  fields.issue = issue;
  return fields;
}

const sessionName = (session: string): string => {
  const at = session.indexOf("@");
  return at < 0 ? session : session.slice(0, at);
};

/**
 * A held item as a queue entry in the answer section. Priority, impact and size come from its
 * joined issue; with none it has no priority and no impact, and sorts after those that do.
 */
export function heldEntry(
  item: ReviewItem,
  joined?: QueueIssue,
  goalIds: ReadonlySet<string> = new Set(),
): ReviewQueueEntry {
  const entry: ReviewQueueEntry = {
    key: `held:${item.path}`,
    id: item.path,
    action: "answer",
    source: "held",
    kind: item.kind,
    title: item.title,
    item,
    ...issueFields(joined, goalIds),
  };
  if (item.createdAt !== "") entry.createdAt = item.createdAt;
  const owner = sessionName(item.session);
  if (owner !== "") entry.owner = owner;
  if (entry.repo === undefined && item.store !== "") entry.repo = item.store;
  return entry;
}

/** A task as a queue entry: a blocked task in the unblock section, any other in prompt. */
export function taskEntry(
  task: QueueIssue,
  goalIds: ReadonlySet<string> = new Set(),
): ReviewQueueEntry {
  const { issue } = task;
  const entry: ReviewQueueEntry = {
    key: `task:${task.repo}:${issue.id}`,
    id: issue.displayId ?? issue.id,
    action: issue.status === "blocked" ? "unblock" : "prompt",
    source: "task",
    kind: issue.type,
    title: issue.title,
    ...issueFields(task, goalIds),
  };
  if (issue.createdAt !== "") entry.createdAt = issue.createdAt;
  if (issue.assignee !== undefined && issue.assignee !== "") entry.owner = issue.assignee;
  return entry;
}

const ageOf = (entry: ReviewQueueEntry): number | undefined => {
  if (typeof entry.createdAt !== "string") return undefined;
  const ms = Date.parse(entry.createdAt);
  return Number.isNaN(ms) ? undefined : ms;
};

// A missing value sorts after every present one; `sign` 1 is ascending, -1 descending.
function present(a: number | undefined, b: number | undefined, sign: number): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a === b ? 0 : a < b ? -sign : sign;
}

const impactOf = (entry: ReviewQueueEntry): number | undefined =>
  typeof entry.impact === "number" && Number.isFinite(entry.impact) ? entry.impact : undefined;

/** Priority first (P0 first), then impact (highest first), then age (oldest first), then id. */
export function compareQueueEntries(a: ReviewQueueEntry, b: ReviewQueueEntry): number {
  const ida = String(a.id ?? "");
  const idb = String(b.id ?? "");
  return (
    present(finitePriority(a.priority), finitePriority(b.priority), 1) ||
    present(impactOf(a), impactOf(b), -1) ||
    present(ageOf(a), ageOf(b), 1) ||
    (ida < idb ? -1 : ida > idb ? 1 : 0)
  );
}

export const sortQueueEntries = (entries: readonly ReviewQueueEntry[]): ReviewQueueEntry[] =>
  [...entries].sort(compareQueueEntries);

/** The filters the Review URL carries, under these query keys, in this order. */
export const QUEUE_FILTER_KEYS = ["epic", "goal", "type", "size", "owner", "repo"] as const;
export type QueueFilterKey = (typeof QUEUE_FILTER_KEYS)[number];
/** Each key's accepted values; an entry matches one of a key's values, and every key given. */
export type QueueFilters = Partial<Record<QueueFilterKey, string[]>>;

const isFilterKey = (key: string): key is QueueFilterKey =>
  (QUEUE_FILTER_KEYS as readonly string[]).includes(key);

function valuesOf(entry: ReviewQueueEntry, key: QueueFilterKey): string[] {
  switch (key) {
    case "epic":
      return entry.epic === undefined ? [] : [entry.epic];
    case "goal":
      return entry.goals;
    case "type":
      return entry.type === undefined ? [] : [entry.type];
    case "size":
      return entry.size === undefined ? [] : [String(entry.size)];
    case "owner":
      return entry.owner === undefined ? [] : [entry.owner];
    case "repo":
      return entry.repo === undefined ? [] : [entry.repo];
  }
}

export function matchesQueueFilters(entry: ReviewQueueEntry, filters: QueueFilters): boolean {
  return QUEUE_FILTER_KEYS.every((key) => {
    const wanted = filters[key];
    if (wanted === undefined || wanted.length === 0) return true;
    const have = valuesOf(entry, key);
    return wanted.some((value) => have.includes(value));
  });
}

/** Each key's values deduplicated and sorted, empty keys dropped, so equal filters compare equal. */
export function normalizeQueueFilters(filters: QueueFilters): QueueFilters {
  const out: QueueFilters = {};
  for (const key of QUEUE_FILTER_KEYS) {
    const values = [...new Set((filters[key] ?? []).filter((value) => value !== ""))].sort();
    if (values.length > 0) out[key] = values;
  }
  return out;
}

/**
 * The filters as a query string without its `?`: `type=bug,task&size=3`. Values are
 * percent-encoded, so a comma inside one is `%2C` and the bare comma only separates values.
 */
export function encodeQueueFilters(filters: QueueFilters): string {
  const normal = normalizeQueueFilters(filters);
  return QUEUE_FILTER_KEYS.flatMap((key) => {
    const values = normal[key];
    return values === undefined ? [] : [`${key}=${values.map(encodeURIComponent).join(",")}`];
  }).join("&");
}

const decodePart = (text: string): string | undefined => {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return undefined;
  }
};

/**
 * The filters a Review URL's query carries (with or without its `?`). Keys other than the filter
 * keys are ignored, a value that is not valid percent-encoding is dropped, and a key given twice
 * keeps the values of both.
 */
export function decodeQueueFilters(query: string): QueueFilters {
  const filters: QueueFilters = {};
  const body = query.startsWith("?") ? query.slice(1) : query;
  for (const pair of body.split("&")) {
    const at = pair.indexOf("=");
    if (at < 0) continue;
    const key = decodePart(pair.slice(0, at));
    if (key === undefined || !isFilterKey(key)) continue;
    const values = pair
      .slice(at + 1)
      .split(",")
      .flatMap((part) => {
        const value = decodePart(part);
        return value === undefined || value === "" ? [] : [value];
      });
    filters[key] = [...(filters[key] ?? []), ...values];
  }
  return normalizeQueueFilters(filters);
}

/** `query` with its filter keys replaced by `filters`; every other parameter is kept, in place. */
export function withQueueFilters(query: string, filters: QueueFilters): string {
  const body = query.startsWith("?") ? query.slice(1) : query;
  const kept = body.split("&").filter((pair) => {
    if (pair === "") return false;
    const at = pair.indexOf("=");
    const key = decodePart(at < 0 ? pair : pair.slice(0, at));
    return key === undefined || !isFilterKey(key);
  });
  const encoded = encodeQueueFilters(filters);
  return [...kept, ...(encoded === "" ? [] : [encoded])].join("&");
}

/** A read the queue was built without, such as the held store's review command. */
export interface QueueReadFailure {
  /** What was read, as the view names it: `held review`, a store's name. */
  source: string;
  /** The exit code, or null when the read ended without one (a timeout, a signal). */
  exitCode: number | null;
  detail?: string;
}

export interface ReviewQueueState {
  entries: ReviewQueueEntry[];
  filters: QueueFilters;
  failures: QueueReadFailure[];
}

export const INITIAL_REVIEW_QUEUE: ReviewQueueState = { entries: [], filters: {}, failures: [] };

export type ReviewQueueEvent =
  | { type: "loaded"; entries: readonly ReviewQueueEntry[]; failures?: readonly QueueReadFailure[] }
  | { type: "set-filter"; key: QueueFilterKey; values: readonly string[] }
  | { type: "clear-filters" }
  | { type: "open-url"; query: string };

export function reduceReviewQueue(
  state: ReviewQueueState,
  event: ReviewQueueEvent,
): ReviewQueueState {
  switch (event.type) {
    case "loaded":
      return { ...state, entries: [...event.entries], failures: [...(event.failures ?? [])] };
    case "set-filter":
      return {
        ...state,
        filters: normalizeQueueFilters({ ...state.filters, [event.key]: [...event.values] }),
      };
    case "clear-filters":
      return { ...state, filters: {} };
    case "open-url":
      return { ...state, filters: decodeQueueFilters(event.query) };
  }
}

export interface ReviewQueueSection {
  action: ReviewAction;
  entries: ReviewQueueEntry[];
}

export interface ReviewQueueView {
  /** One per action, in REVIEW_ACTIONS order, each sorted; a section with no entry is kept. */
  sections: ReviewQueueSection[];
  /** Entries the filters kept. */
  shown: number;
  /** Entries before the filters. */
  total: number;
  /** The filters as the URL's query, without its `?`. */
  query: string;
  /** One line per failed read, naming it and its exit code. */
  failureLines: string[];
  /**
   * What an empty list says. "nothing to review" only when every read answered and none had an
   * item; a list emptied by the filters, or by a failed read, says so instead.
   */
  emptyText?: string;
}

export const NOTHING_TO_REVIEW = "nothing to review";

const failureLine = (failure: QueueReadFailure): string =>
  `${failure.source} could not be read (${
    failure.exitCode === null ? "no exit code" : `exit ${failure.exitCode}`
  })${failure.detail === undefined || failure.detail === "" ? "" : `: ${failure.detail}`}`;

export function reviewQueueView(state: ReviewQueueState): ReviewQueueView {
  const kept = state.entries.filter((entry) => matchesQueueFilters(entry, state.filters));
  const sorted = sortQueueEntries(kept);
  const view: ReviewQueueView = {
    sections: REVIEW_ACTIONS.map((action) => ({
      action,
      entries: sorted.filter((entry) => entry.action === action),
    })),
    shown: kept.length,
    total: state.entries.length,
    query: encodeQueueFilters(state.filters),
    failureLines: state.failures.map(failureLine),
  };
  if (kept.length === 0) {
    if (state.failures.length > 0) {
      view.emptyText = `nothing shown: ${state.failures.length} read(s) failed`;
    } else if (state.entries.length > 0) {
      view.emptyText = "no item matches the filters";
    } else {
      view.emptyText = NOTHING_TO_REVIEW;
    }
  }
  return view;
}
