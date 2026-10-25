import type { Result } from "./model.ts";
import type { ReviewItem, ReviewSnapshot } from "./review.ts";

// The Review view's rules (D-38, D-40, T-2C.6): the pair boundary, whose items a session lists,
// the filter grammar, the sorts and the groups. Pure: both surfaces draw the same list from them.

/**
 * The machines whose items any session may draw: the snapshot's pair, or this host alone when the
 * verb named no pair. With neither, none: an item is drawn only inside a pair the verb named.
 */
export function pairMembers(snapshot: Pick<ReviewSnapshot, "pair" | "host">): string[] {
  if (snapshot.pair.length > 0) return [...snapshot.pair];
  return snapshot.host === "" ? [] : [snapshot.host];
}

/** `items` inside the snapshot's pair (D-38): no session draws an item from outside it. */
export function inPair(
  items: readonly ReviewItem[],
  snapshot: Pick<ReviewSnapshot, "pair" | "host">,
): ReviewItem[] {
  const members = new Set(pairMembers(snapshot));
  return items.filter((item) => members.has(item.machine));
}

/**
 * True when `session` on `host` holds the item: its `session` is `<session>@<host>`, or names no
 * host and is `session`.
 */
export function holdsItem(
  item: Pick<ReviewItem, "session">,
  session: string,
  host: string,
): boolean {
  const at = item.session.indexOf("@");
  if (at < 0) return item.session === session;
  return (
    item.session.slice(0, at) === session && (host === "" || item.session.slice(at + 1) === host)
  );
}

/** True when the item's task is an issue `session` owns: its assignee is the session's name. */
export const ownsItem = (item: Pick<ReviewItem, "issue">, session: string): boolean =>
  item.issue?.assignee === session;

/** `pair`: every item of the snapshot, the firstmate's view; `mine`: what the session holds or owns. */
export type ReviewScope = "pair" | "mine";

/**
 * The items a session's Review view lists (D-38): on `pair` every item, on `mine` the items the
 * session holds and those whose issue it owns. A session with no name holds and owns nothing.
 */
export function scopedItems(
  items: readonly ReviewItem[],
  options: { session: string | undefined; host: string; scope: ReviewScope },
): ReviewItem[] {
  if (options.scope === "pair") return [...items];
  const session = options.session;
  if (session === undefined) return [];
  return items.filter((item) => holdsItem(item, session, options.host) || ownsItem(item, session));
}

export const REVIEW_FILTER_KEYS = [
  "kind",
  "status",
  "selection",
  "session",
  "machine",
  "task",
  "epic",
  "label",
  "priority",
] as const;
export type ReviewFilterKey = (typeof REVIEW_FILTER_KEYS)[number];

export const REVIEW_SELECTIONS = [
  "current",
  "superseded",
  "escalated",
  "ai-resolved",
  "all",
] as const;

/** The filter a Review view opens with. */
export const DEFAULT_REVIEW_FILTER = "status:open selection:current";

export interface ReviewFilterTerm {
  key: ReviewFilterKey;
  value: string;
}

/** Whitespace-separated `key:value` terms and free words, all ANDed. */
export interface ReviewFilter {
  terms: ReviewFilterTerm[];
  /** Free text, lower-cased: each word must be in the item's title or ask. */
  words: string[];
}

export type ReviewFilterError =
  | { kind: "unknown-key"; key: string }
  | { kind: "invalid-value"; key: ReviewFilterKey; value: string; message: string };

const priorityOf = (value: string): number | undefined => {
  const match = /^[pP]?([0-4])$/.exec(value);
  return match === null ? undefined : Number(match[1]);
};

const invalid = (
  key: ReviewFilterKey,
  value: string,
  message: string,
): Result<ReviewFilter, ReviewFilterError> => ({
  ok: false,
  error: { kind: "invalid-value", key, value, message },
});

/**
 * The filter line's text as terms and words. A word with a colon is a term, whose key must be one
 * of REVIEW_FILTER_KEYS; any other word is free text.
 */
export function parseReviewFilter(text: string): Result<ReviewFilter, ReviewFilterError> {
  const terms: ReviewFilterTerm[] = [];
  const words: string[] = [];
  for (const part of text.split(/\s+/).filter((one) => one !== "")) {
    const colon = part.indexOf(":");
    if (colon < 0) {
      words.push(part.toLowerCase());
      continue;
    }
    const name = part.slice(0, colon);
    const value = part.slice(colon + 1);
    const key = REVIEW_FILTER_KEYS.find((one) => one === name);
    if (key === undefined) return { ok: false, error: { kind: "unknown-key", key: name } };
    if (value === "") return invalid(key, value, `${key}: needs a value`);
    if (key === "selection" && !REVIEW_SELECTIONS.some((one) => one === value)) {
      return invalid(key, value, `selection: takes ${REVIEW_SELECTIONS.join(", ")}`);
    }
    if (key === "priority" && priorityOf(value) === undefined) {
      return invalid(key, value, "priority: takes 0 to 4, or P0 to P4");
    }
    terms.push({ key, value });
  }
  return { ok: true, value: { terms, words } };
}

function matchesTerm(item: ReviewItem, term: ReviewFilterTerm): boolean {
  const { value } = term;
  const issue = item.issue;
  switch (term.key) {
    case "kind":
      return item.kind === value;
    case "status":
      return item.status === value;
    case "selection":
      return value === "all" || item.selection === value;
    case "session":
      return item.session === value || item.session.split("@")[0] === value;
    case "machine":
      return item.machine === value;
    case "task":
      return item.task === value || issue?.id === value || issue?.displayId === value;
    case "epic":
      return issue?.parent !== undefined && issue.parent === value;
    case "label":
      return issue?.labels.includes(value) === true;
    case "priority":
      return issue !== undefined && issue.priority === priorityOf(value);
  }
}

/** True when the item matches every term and holds every word in its title or ask. */
export function matchesReview(item: ReviewItem, filter: ReviewFilter): boolean {
  if (!filter.terms.every((term) => matchesTerm(item, term))) return false;
  if (filter.words.length === 0) return true;
  const text = `${item.title}\n${item.ask}`.toLowerCase();
  return filter.words.every((word) => text.includes(word));
}

/** What the Review view's filter line holds: the text, the filter last parsed, any error. */
export interface ReviewFilterState {
  text: string;
  filter: ReviewFilter;
  error?: ReviewFilterError;
}

export function initialReviewFilter(): ReviewFilterState {
  const parsed = parseReviewFilter(DEFAULT_REVIEW_FILTER);
  return {
    text: DEFAULT_REVIEW_FILTER,
    filter: parsed.ok ? parsed.value : { terms: [], words: [] },
  };
}

/** New filter text. Text that does not parse keeps the previous filter, as the Backlog's does. */
export function submitReviewFilter(state: ReviewFilterState, text: string): ReviewFilterState {
  const parsed = parseReviewFilter(text);
  if (!parsed.ok) return { text, filter: state.filter, error: parsed.error };
  return { text, filter: parsed.value };
}

export function describeReviewFilterError(error: ReviewFilterError): string {
  if (error.kind === "unknown-key") {
    return `unknown filter key "${error.key}", so the previous filter is kept; accepted keys: ${REVIEW_FILTER_KEYS.join(", ")}, and free text`;
  }
  return `${error.message}, so the previous filter is kept`;
}

export const REVIEW_SORTS = [
  "updated",
  "created",
  "priority",
  "task",
  "epic",
  "kind",
  "session",
] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

/** Each sort as its control names it: updated and created say which time they order by. */
export const REVIEW_SORT_LABELS: Readonly<Record<ReviewSort, string>> = {
  updated: "updated (answered, else held)",
  created: "created (held)",
  priority: "priority",
  task: "task",
  epic: "epic",
  kind: "kind",
  session: "session",
};

export const REVIEW_GROUPS = ["none", "task", "epic", "kind", "session"] as const;
export type ReviewGroup = (typeof REVIEW_GROUPS)[number];

export const isReviewSort = (value: unknown): value is ReviewSort =>
  REVIEW_SORTS.some((one) => one === value);
export const isReviewGroup = (value: unknown): value is ReviewGroup =>
  REVIEW_GROUPS.some((one) => one === value);

/** The item's own updated time: its answer's, else when it was held; the store keeps no other. */
export const reviewUpdatedAt = (item: Pick<ReviewItem, "answeredAt" | "createdAt">): string =>
  item.answeredAt !== undefined && item.answeredAt !== "" ? item.answeredAt : item.createdAt;

const timeOf = (iso: string): number | undefined => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
};

/** Ascending, with a missing value after every present one. */
function ascending<T extends string | number>(a: T | undefined, b: T | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Newest first, with a missing or unreadable time last. */
function newestFirst(a: string, b: string): number {
  const x = timeOf(a);
  const y = timeOf(b);
  return ascending(x === undefined ? undefined : -x, y === undefined ? undefined : -y);
}

const taskOf = (item: ReviewItem): string | undefined =>
  item.task === "" || item.task === "none" ? undefined : item.task;

function sortValue(item: ReviewItem, sort: ReviewSort): string | number | undefined {
  switch (sort) {
    case "priority":
      return item.issue?.priority;
    case "task":
      return taskOf(item);
    case "epic":
      return item.issue?.parent;
    case "kind":
      return item.kind;
    case "session":
      return item.session;
    default:
      return undefined;
  }
}

/**
 * `items` ordered by `sort`: updated and created newest first, the others ascending with the items
 * that have no value last; ties by updated, newest first, then by path.
 */
export function sortReviewItems(items: readonly ReviewItem[], sort: ReviewSort): ReviewItem[] {
  return [...items].sort((a, b) => {
    const first =
      sort === "updated"
        ? 0
        : sort === "created"
          ? newestFirst(a.createdAt, b.createdAt)
          : ascending(sortValue(a, sort), sortValue(b, sort));
    return (
      first || newestFirst(reviewUpdatedAt(a), reviewUpdatedAt(b)) || ascending(a.path, b.path)
    );
  });
}

export interface ReviewItemGroup {
  /** The value grouped on; "" for the items with none. */
  key: string;
  label: string;
  items: ReviewItem[];
}

function groupOf(
  item: ReviewItem,
  group: Exclude<ReviewGroup, "none">,
  titleOf: (id: string) => string | undefined,
): { key: string; label: string } {
  switch (group) {
    case "task": {
      const task = taskOf(item);
      if (task === undefined) return { key: "", label: "no task" };
      const title = item.issue?.title;
      return { key: task, label: title === undefined || title === "" ? task : `${task}: ${title}` };
    }
    case "epic": {
      const parent = item.issue?.parent;
      if (parent === undefined) return { key: "", label: "no epic" };
      const title = titleOf(parent);
      return { key: parent, label: title === undefined ? parent : `${parent}: ${title}` };
    }
    case "kind":
      return { key: item.kind, label: item.kind };
    case "session":
      return { key: item.session, label: item.session };
  }
}

/**
 * Sorted `items` cut into groups, each placed where its first item falls, so the sort orders the
 * groups as well; under `none`, one group of every item. `titleOf` names an epic by its id.
 */
export function groupReviewItems(
  items: readonly ReviewItem[],
  group: ReviewGroup,
  titleOf: (id: string) => string | undefined = () => undefined,
): ReviewItemGroup[] {
  if (group === "none") return [{ key: "", label: "", items: [...items] }];
  const groups = new Map<string, ReviewItemGroup>();
  for (const item of items) {
    const { key, label } = groupOf(item, group, titleOf);
    const found = groups.get(key);
    if (found === undefined) groups.set(key, { key, label, items: [item] });
    else found.items.push(item);
  }
  return [...groups.values()];
}

/** The value after `value` in `values`, wrapping. */
export function nextOf<T>(values: readonly T[], value: T): T {
  const at = values.indexOf(value);
  return values[(at + 1) % values.length] as T;
}

/**
 * The open, current items about an issue (T-2C.7), by its bd id and its display id: what the
 * review indicator counts. Every item of the pair is counted, as the issue's Detail lists them.
 */
export function openReviewIndex(
  items: readonly ReviewItem[],
): ReadonlyMap<string, readonly ReviewItem[]> {
  const index = new Map<string, ReviewItem[]>();
  const add = (task: string, item: ReviewItem) => {
    const found = index.get(task);
    if (found === undefined) index.set(task, [item]);
    else if (!found.includes(item)) found.push(item);
  };
  for (const item of items) {
    if (item.status !== "open" || item.selection !== "current") continue;
    const task = taskOf(item);
    if (task !== undefined) add(task, item);
    if (item.issue !== undefined) {
      add(item.issue.id, item);
      if (item.issue.displayId !== undefined) add(item.issue.displayId, item);
    }
  }
  return index;
}

/** The open, current items about `issue`, oldest first; none when it has none. */
export function openItemsOf(
  index: ReadonlyMap<string, readonly ReviewItem[]>,
  issue: { id: string; displayId?: string },
): ReviewItem[] {
  const found = new Set(index.get(issue.id) ?? []);
  for (const item of issue.displayId === undefined ? [] : (index.get(issue.displayId) ?? [])) {
    found.add(item);
  }
  return sortReviewItems([...found], "created").reverse();
}
