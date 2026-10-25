// An issue's review items in its Detail (D-40, T-2C.5): the held items the review snapshot names
// about it and its bd blockers, the reader's pages of one item's body, and the turn an answer
// hands the session (D-39). Pure: the band's overview and the pane draw the same model.

import type { Comment, Issue } from "../model.ts";
import type { ReviewItem } from "../review.ts";
import {
  describeReviewFilterError,
  groupReviewItems,
  matchesReview,
  REVIEW_SORT_LABELS,
  type ReviewFilterState,
  type ReviewGroup,
  type ReviewScope,
  type ReviewSort,
  sortReviewItems,
} from "../reviewList.ts";
import { fenceFor, inlineText } from "../sync.ts";

/** The heading of the Detail's Review section. */
export const REVIEW_HEADING = "Review";
/** How many held items the section draws at a time; the rest are a page away. */
export const REVIEW_PAGE_ROWS = 12;
/**
 * The most body characters one reader page draws: a mod tree is cut off past 100,000 serialized
 * characters, and a body's escapes, the reader's own controls and the pane's chrome come beside it.
 */
export const READER_PAGE_CHARS = 24_000;

/** The `[review]` line the Detail draws while the command is unset. */
export const REVIEW_UNSET_TEXT =
  'Held items are not read: set [review] command in your own beads-ui.toml, such as command = ["held_cli.py"].';

/** `2026-10-25T02:00:00Z` as `2026-10-25 02:00`; any other text as it is. */
export const stampText = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) ? iso.slice(0, 16).replace("T", " ") : iso;

/** One `[blocked ...]` transition comment (ai-harness `scripts/bd_block.py`), its fields read. */
export interface BlockedTransition {
  stamp: string;
  from: string;
  why?: string;
  waitsOn?: string;
  toDone?: string;
  toInProgress?: string;
  by?: string;
}

const HEADER = /^\[(blocked|unblocked) ([^\]]*)\] (from|to): (.*)$/;

/**
 * The issue's latest transition comment when it is a `[blocked ...]` one: a later `[unblocked ...]`
 * means the issue no longer waits on what the earlier one named. Comments are read oldest first.
 */
export function latestBlocked(comments: readonly Comment[]): BlockedTransition | undefined {
  let latest: BlockedTransition | undefined;
  for (const comment of comments) {
    const lines = comment.text.replace(/^\n+/, "").split("\n");
    const header = HEADER.exec(lines[0] ?? "");
    if (header === null) continue;
    if (header[1] === "unblocked") {
      latest = undefined;
      continue;
    }
    const transition: BlockedTransition = {
      stamp: header[2] ?? "",
      from: (header[4] ?? "").trim(),
    };
    for (const line of lines.slice(1)) {
      const cut = line.indexOf(": ");
      if (cut < 0) continue;
      const key = line.slice(0, cut);
      const value = line.slice(cut + 2).trim();
      if (key === "why") transition.why ??= value;
      else if (key === "waits on") transition.waitsOn ??= value;
      else if (key === "to done") transition.toDone ??= value;
      else if (key === "to in_progress") transition.toInProgress ??= value;
      else if (key === "by") transition.by ??= value;
    }
    latest = transition;
  }
  return latest;
}

/**
 * The held item a `waits on` value names, as its `docs/held/<dir>/<file>.md` part: the value is
 * `owner:<held path>` or `decision:<held path>`, projects-relative or absolute. Undefined for any
 * other wait (a party, a date, a rider, a doc's decision anchor).
 */
export function heldPathOf(waitsOn: string | undefined): string | undefined {
  if (waitsOn === undefined) return undefined;
  const match = /^(?:owner|decision):\s*(.+)$/.exec(waitsOn.trim());
  const path = match?.[1]?.trim();
  if (path === undefined) return undefined;
  const at = path.lastIndexOf("docs/held/");
  if (at < 0 || !path.endsWith(".md")) return undefined;
  const rel = path.slice(at);
  return /^docs\/held\/[^/]+--[^/]+\/[^/]+\.md$/.test(rel) ? rel : undefined;
}

/** An item's `docs/held/...` part: its relpath, else read from its path. */
const heldPartOf = (item: ReviewItem): string => {
  if (item.relpath !== "") return item.relpath;
  const at = item.path.lastIndexOf("docs/held/");
  return at < 0 ? item.path : item.path.slice(at);
};

/** A short key for an item's row and its reader: its session directory and file name. */
export const itemKey = (item: ReviewItem): string =>
  heldPartOf(item).split("/").slice(-2).join("/");

/** One held item's row in the Review section. */
export interface ReviewRow {
  key: string;
  path: string;
  /** `<kind>: <title>`, the row's pressable label. */
  label: string;
  ask: string;
  /** The status, the selection when not current, the session, and the held and answered times. */
  meta: string;
  /** The issue's latest blocked transition waits on this item. */
  waitedOn: boolean;
}

/** One bd blocker: an open issue this one is blocked by, or its blocked transition's fields. */
export interface BlockerRow {
  key: string;
  line: string;
}

export interface ReviewSection {
  heading: string;
  rows: ReviewRow[];
  /** The page of rows drawn, of `pages`. */
  page: number;
  pages: number;
  blockers: BlockerRow[];
  /** The line saying how to set `[review] command`, while it is unset. */
  unset?: string;
  /** Why the review snapshot could not be read, or what its last run reported. */
  note?: string;
}

/**
 * Every held item about `issue`: those whose task is its bd id or its display id, and the one its
 * latest blocked transition waits on, whoever holds them (D-38). Current items first, each group
 * oldest first, as the held store lists them.
 */
export function itemsForIssue(
  issue: Pick<Issue, "id" | "displayId">,
  items: readonly ReviewItem[],
  transition: BlockedTransition | undefined,
): { item: ReviewItem; waitedOn: boolean }[] {
  const waited = heldPathOf(transition?.waitsOn);
  const ids = new Set([issue.id, ...(issue.displayId === undefined ? [] : [issue.displayId])]);
  const found = items.flatMap((item) => {
    const waitedOn = waited !== undefined && heldPartOf(item) === waited;
    return ids.has(item.task) || waitedOn ? [{ item, waitedOn }] : [];
  });
  const rank = (item: ReviewItem) => (item.selection === "current" ? 0 : 1);
  return found
    .map((one, at) => ({ ...one, at }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.at - b.at)
    .map(({ item, waitedOn }) => ({ item, waitedOn }));
}

const metaOf = (item: ReviewItem): string =>
  [
    item.status,
    item.selection === "current"
      ? undefined
      : item.selection === "superseded" && item.supersededBy !== undefined
        ? `superseded by ${item.supersededBy.split("/").pop() ?? item.supersededBy}`
        : item.selection,
    item.session,
    `held ${stampText(item.createdAt)}`,
    item.answeredAt === undefined ? undefined : `answered ${stampText(item.answeredAt)}`,
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(", ");

const reviewRowOf = (item: ReviewItem, meta: string, waitedOn: boolean): ReviewRow => ({
  key: itemKey(item),
  path: item.path,
  label: `${item.kind}: ${item.title === "" ? itemKey(item) : item.title}`,
  ask: item.ask,
  meta,
  waitedOn,
});

/** The issue's bd blockers: each open blocked-by link, then its blocked transition's fields. */
export function blockerRows(
  issue: Pick<Issue, "dependencies">,
  transition: BlockedTransition | undefined,
  known: (id: string) => { title?: string; status?: string } | undefined = () => undefined,
): BlockerRow[] {
  const rows: BlockerRow[] = [];
  for (const dep of issue.dependencies) {
    if (dep.type !== "blocks") continue;
    const other = known(dep.id);
    const status = dep.status ?? other?.status;
    if (status === "closed") continue;
    const title = dep.title ?? other?.title;
    rows.push({
      key: `blocked-by:${dep.id}`,
      line: `blocked by ${dep.id}${title === undefined ? "" : `: ${title}`}${status === undefined ? "" : ` (${status})`}`,
    });
  }
  if (transition !== undefined) {
    rows.push({
      key: "blocked:since",
      line: `blocked ${stampText(transition.stamp)} from ${transition.from}${transition.by === undefined ? "" : ` by ${transition.by}`}`,
    });
    const fields: [string, string | undefined][] = [
      ["why", transition.why],
      ["waits on", transition.waitsOn],
      ["to done", transition.toDone],
      ["to in_progress", transition.toInProgress],
    ];
    for (const [label, value] of fields) {
      if (value !== undefined) rows.push({ key: `blocked:${label}`, line: `${label}: ${value}` });
    }
  }
  return rows;
}

/**
 * The Review section of an issue's Detail: its held items, REVIEW_PAGE_ROWS at a time from `page`,
 * and its bd blockers. Undefined when it has neither, so the Detail draws no section. With
 * `command` unset no held item is drawn, only the blockers and the line saying how to set it.
 */
export function reviewSection(input: {
  issue: Pick<Issue, "id" | "displayId" | "dependencies">;
  items: readonly ReviewItem[];
  comments: readonly Comment[];
  configured: boolean;
  page?: number;
  note?: string;
  known?: (id: string) => { title?: string; status?: string } | undefined;
}): ReviewSection | undefined {
  const transition = latestBlocked(input.comments);
  const held = input.configured ? itemsForIssue(input.issue, input.items, transition) : [];
  const blockers = blockerRows(input.issue, transition, input.known);
  if (held.length === 0 && blockers.length === 0) return undefined;
  const pages = Math.max(1, Math.ceil(held.length / REVIEW_PAGE_ROWS));
  const page = Math.min(Math.max(0, input.page ?? 0), pages - 1);
  const rows = held
    .slice(page * REVIEW_PAGE_ROWS, (page + 1) * REVIEW_PAGE_ROWS)
    .map(({ item, waitedOn }) => reviewRowOf(item, metaOf(item), waitedOn));
  const count = held.length + blockers.length;
  const section: ReviewSection = {
    heading: `${REVIEW_HEADING} (${count})`,
    rows,
    page,
    pages,
    blockers,
  };
  if (!input.configured) section.unset = REVIEW_UNSET_TEXT;
  if (input.note !== undefined && input.configured) section.note = input.note;
  return section;
}

/**
 * A body cut into pages of at most `max` characters, each ending at a line break where one falls
 * in the page, so a long body is read a page at a time and no drawing passes the tree limit.
 */
export function readerPages(body: string, max: number = READER_PAGE_CHARS): string[] {
  if (body.length <= max) return [body];
  const pages: string[] = [];
  let rest = body;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut <= 0) cut = max;
    else cut += 1;
    pages.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest !== "") pages.push(rest);
  return pages;
}

/** The session a held item's `session` names: `<slug>@<host>`, read as its slug. */
export const slugOf = (session: string): string => session.split("@")[0] ?? session;

/**
 * The turn an answer hands the session (D-39, D-33's fixed form). With `commit`, `held_cli.py
 * answer` recorded the text; without it (Send to session) nothing was recorded. The item's fields
 * are cut to one line each, and Sergei's text sits verbatim in a fence no text inside can close.
 */
export function answerTurn(input: {
  item: Pick<ReviewItem, "path" | "kind" | "title" | "session">;
  text: string;
  commit?: string;
  /** The session the turn starts in; it holds the item when its name is the item's slug. */
  session: string | undefined;
}): string {
  const { item, text, commit } = input;
  const owner = inlineText(item.session);
  const path = inlineText(item.path);
  const holds = input.session !== undefined && slugOf(item.session) === input.session;
  const fence = fenceFor(text);
  const recorded = commit !== undefined;
  const lines = [
    recorded
      ? "beads-ui recorded Sergei's answer to a held item, typed in the pane's reader."
      : "beads-ui did not record Sergei's answer to a held item; the pane's Send to session hands it to you.",
    "",
    `- Item: ${path}`,
    `- Kind: ${inlineText(item.kind)}`,
    `- Title: ${inlineText(item.title)}`,
    `- Owner session: ${owner}`,
    `- Answer commit: ${recorded ? inlineText(commit) : "none"}`,
    "",
    recorded
      ? "The text below is Sergei's answer, verbatim. held_cli.py answer wrote it under the item's ## Answer."
      : "The text below is Sergei's answer, verbatim. It is not yet written under the item's ## Answer.",
    "",
    `${fence}text sergei-answer`,
    text,
    fence,
    "",
  ];
  if (holds && recorded) {
    lines.push(
      "This session holds the item. Record the answer in its durable home (a bd comment on its task, or the decision in its design or plan doc), ship that, act on the answer, then retire the item with held_cli.py retire naming that home.",
    );
  } else if (holds) {
    lines.push(
      "This session holds the item. Record the text with held_cli.py answer from a file holding it byte for byte, then record the answer in its durable home, ship that and act on it.",
    );
  } else {
    lines.push(
      `${owner} holds the item, not this session. Tell ${owner} through the fleet's messaging ladder that Sergei answered it, with the item's path${recorded ? " and the answer commit" : " and the text above"}, so that it records the answer${recorded ? "" : " with held_cli.py answer"}, records its durable home and ships it. Do not record or retire the item from this session.`,
    );
  }
  return lines.join("\n");
}

// The Review view (D-38, D-40, T-2C.6): every item in the session's scope through the filter,
// sorted and grouped, a page at a time. The pane and the band's overview draw the same model.

/** The view's heading, and its nav label. */
export const REVIEW_VIEW_TITLE = "Review";
/**
 * Items a pane page draws. A row is three lines and about 900 characters of tree, so a page of
 * 25 stays far under the 100,000-character limit beside the pane's chrome.
 */
export const REVIEW_LIST_PAGE_ITEMS = 25;

export type ReviewListEntry =
  | { kind: "group"; key: string; label: string; count: number }
  | { kind: "item"; row: ReviewRow };

export interface ReviewListView {
  /** `Review: 3 of 12 items, the pair's (acn-mac, sem-kg-ec2)`. */
  heading: string;
  /** What the scope control says, and what its key switches to; undefined without a toggle. */
  scope?: { label: string; next: string };
  sort: string;
  group: string;
  /** When the refresher last read the held store, and its last run's failure. */
  read?: string;
  filterError?: string;
  entries: ReviewListEntry[];
  page: number;
  pages: number;
  /** Items the filter kept, of `total` in scope. */
  shown: number;
  total: number;
  /** Said in place of the rows when the filter kept none. */
  empty?: string;
  /** The line saying how to set `[review] command`, while it is unset. */
  unset?: string;
  note?: string;
}

const listMeta = (item: ReviewItem): string =>
  [
    metaOf(item),
    item.task === "none" || item.task === ""
      ? "no task"
      : `task ${item.issue?.displayId ?? item.task}`,
    item.issue === undefined ? undefined : `P${item.issue.priority}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join(", ");

const isoOf = (ms: number): string => {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

/**
 * The Review view's model. `items` are the snapshot's, inside its pair; `scoped` the ones the
 * session's scope keeps (D-38). `firstmate` draws the scope control: `pair` lists every item,
 * `mine` the session's own.
 */
export function reviewListView(input: {
  scoped: readonly ReviewItem[];
  scope: ReviewScope;
  firstmate: boolean;
  pair: readonly string[];
  filter: ReviewFilterState;
  sort: ReviewSort;
  group: ReviewGroup;
  page?: number;
  pageItems?: number;
  configured: boolean;
  readAt?: number;
  note?: string;
  titleOf?: (id: string) => string | undefined;
}): ReviewListView {
  const per = Math.max(1, input.pageItems ?? REVIEW_LIST_PAGE_ITEMS);
  const kept = input.configured
    ? sortReviewItems(
        input.scoped.filter((item) => matchesReview(item, input.filter.filter)),
        input.sort,
      )
    : [];
  const groups = groupReviewItems(kept, input.group, input.titleOf);
  const pages = Math.max(1, Math.ceil(kept.length / per));
  const page = Math.min(Math.max(0, input.page ?? 0), pages - 1);
  const first = page * per;
  const entries: ReviewListEntry[] = [];
  let at = 0;
  for (const group of groups) {
    const start = Math.max(first, at);
    const end = Math.min(first + per, at + group.items.length);
    if (start < end) {
      if (input.group !== "none") {
        entries.push({
          kind: "group",
          key: group.key === "" ? "-" : group.key,
          label: group.label,
          count: group.items.length,
        });
      }
      for (const item of group.items.slice(start - at, end - at)) {
        entries.push({ kind: "item", row: reviewRowOf(item, listMeta(item), false) });
      }
    }
    at += group.items.length;
  }
  const whose =
    input.scope === "pair"
      ? `the pair's${input.pair.length === 0 ? "" : ` (${input.pair.join(", ")})`}`
      : "this session's own";
  const view: ReviewListView = {
    heading: `${REVIEW_VIEW_TITLE}: ${kept.length} of ${input.scoped.length} items, ${whose}`,
    sort: REVIEW_SORT_LABELS[input.sort],
    group: input.group,
    entries,
    page,
    pages,
    shown: kept.length,
    total: input.scoped.length,
  };
  if (input.firstmate) {
    view.scope =
      input.scope === "pair"
        ? { label: "Showing: the pair's", next: "mine" }
        : { label: "Showing: mine", next: "the pair's" };
  }
  if (input.filter.error !== undefined) {
    view.filterError = describeReviewFilterError(input.filter.error);
  }
  if (!input.configured) {
    view.unset = REVIEW_UNSET_TEXT;
    return view;
  }
  if (input.readAt !== undefined) view.read = `held items read ${stampText(isoOf(input.readAt))}`;
  if (input.note !== undefined) view.note = input.note;
  if (kept.length === 0) {
    view.empty =
      input.scoped.length === 0
        ? input.scope === "pair"
          ? "No held item in the pair."
          : "No held item is this session's: none it holds, and none about an issue it owns."
        : "No item matches the filter.";
  }
  return view;
}
