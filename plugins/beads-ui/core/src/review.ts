import type { BdArgv, Result } from "./model.ts";

// Review items (D-37, T-2C.5): the held store's items of this host's pair, read once a beat by the
// host refresher through the user's `[review] command` and written, joined to their issues, into
// `review-<token>.json`. The refresher process imports this file through Node's type stripping, so
// it keeps to erasable syntax, as snapshot.ts does.

/** The review snapshot each refresher writes under its own lease token. */
export const reviewFileName = (token: string): string => `review-${token}.json`;
export const REVIEW_SNAPSHOT_SCHEMA = 1;
/** The held store's review payload schema this reads (`held_cli.py review`'s REVIEW_SCHEMA). */
export const HELD_REVIEW_SCHEMA = 1;
/**
 * The wake marker a session drops in the refresher's `wake/` after it answers an item, so the
 * review verb runs again within a second or two rather than at the next beat (D-37). No store's
 * marker takes this name: theirs are named from an absolute path.
 */
export const REVIEW_WAKE_FILE = "review.json";
/** The verb was measured at 2.6 s for 300 items on host-c; a beat gives it this long. */
export const REVIEW_TIMEOUT_MS = 20_000;

/**
 * The held tool's own invocation from `[review] command`. The ai-harness install writes the whole
 * review call (`held_cli.py review --scope pair --json`), so a `review` argument and every argument
 * after it are dropped: what is left is the program every verb is run with.
 */
export function heldBase(command: readonly string[]): string[] {
  const at = command.indexOf("review", 1);
  return at < 0 ? [...command] : command.slice(0, at);
}

/** The beat's read: every pair item, or only `unchanged` while `fingerprint` is still current. */
export function reviewArgv(command: readonly string[], fingerprint?: string): BdArgv {
  return [
    ...heldBase(command),
    "review",
    "--scope",
    "pair",
    "--json",
    ...(fingerprint === undefined ? [] : ["--if-changed", fingerprint]),
  ];
}

/** One item's body, for the reader. */
export function showItemArgv(command: readonly string[], path: string): BdArgv {
  return [...heldBase(command), "show", path, "--json"];
}

/** Records `file`'s text as the item's answer. */
export function answerArgv(command: readonly string[], path: string, file: string): BdArgv {
  return [...heldBase(command), "answer", path, "--text-file", file, "--json"];
}

/** The fields of a held item's issue a review row and the Review view draw (T-2C.5). */
export interface ReviewIssue {
  id: string;
  displayId?: string;
  title: string;
  status: string;
  priority: number;
  labels: string[];
  parent?: string;
  assignee?: string;
  updatedAt: string;
  /** The store directory it was read from. */
  store: string;
}

/** One held item as the review verb prints it: its frontmatter keys, never its body. */
export interface ReviewItem {
  path: string;
  store: string;
  relpath: string;
  kind: string;
  status: string;
  session: string;
  machine: string;
  task: string;
  title: string;
  ask: string;
  createdAt: string;
  answeredAt?: string;
  answerRecordedIn?: string;
  decider?: string;
  /** current, superseded, escalated or ai-resolved, as the held store's compile chooses it. */
  selection: string;
  supersededBy?: string;
  /** The issue `task` names, joined through the store inventory; absent when none was found. */
  issue?: ReviewIssue;
}

/** What one run of the review verb printed. */
export type ReviewOutput =
  | { unchanged: true; fingerprint: string }
  | {
      unchanged: false;
      fingerprint: string;
      host: string;
      pair: string[];
      scope: string;
      pairNote?: string;
      readAt: string;
      items: ReviewItem[];
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** One item of the verb's `items`; undefined when a key every item carries is missing. */
function itemOf(row: unknown): ReviewItem | undefined {
  if (!isRecord(row)) return undefined;
  const path = text(row.path);
  const kind = text(row.kind);
  const status = text(row.status);
  const session = text(row.session);
  if (path === undefined || kind === undefined || status === undefined || session === undefined) {
    return undefined;
  }
  const item: ReviewItem = {
    path,
    store: text(row.store) ?? "",
    relpath: text(row.relpath) ?? "",
    kind,
    status,
    session,
    machine: text(row.machine) ?? "",
    task: text(row.task) ?? "none",
    title: typeof row.title === "string" ? row.title : "",
    ask: typeof row.ask === "string" ? row.ask : "",
    createdAt: text(row.created_at) ?? text(row.createdAt) ?? "",
    selection: text(row.selection) ?? "current",
  };
  const answeredAt = text(row.answered_at) ?? text(row.answeredAt);
  if (answeredAt !== undefined) item.answeredAt = answeredAt;
  const recorded = text(row.answer_recorded_in) ?? text(row.answerRecordedIn);
  if (recorded !== undefined) item.answerRecordedIn = recorded;
  const decider = text(row.decider);
  if (decider !== undefined) item.decider = decider;
  const superseded = text(row.superseded_by) ?? text(row.supersededBy);
  if (superseded !== undefined) item.supersededBy = superseded;
  const issue = reviewIssueOf(row.issue);
  if (issue !== undefined) item.issue = issue;
  return item;
}

/** `held_cli.py review --json`'s output: the item payload, or `unchanged` and its fingerprint. */
export function parseReviewOutput(stdout: string): Result<ReviewOutput, string> {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return { ok: false, error: "the review command did not print JSON" };
  }
  if (!isRecord(json)) return { ok: false, error: "the review command printed no object" };
  const fingerprint = text(json.fingerprint);
  if (fingerprint === undefined) {
    const detail = text(json.detail);
    return {
      ok: false,
      error:
        detail === undefined
          ? "the review command printed no fingerprint"
          : `the review command refused: ${detail}`,
    };
  }
  if (json.unchanged === true) return { ok: true, value: { unchanged: true, fingerprint } };
  if (json.schema !== HELD_REVIEW_SCHEMA) {
    return { ok: false, error: `the review command printed schema ${String(json.schema)}` };
  }
  if (!Array.isArray(json.items))
    return { ok: false, error: "the review command printed no items" };
  const items: ReviewItem[] = [];
  for (const row of json.items) {
    const item = itemOf(row);
    if (item !== undefined) items.push(item);
  }
  const output: ReviewOutput = {
    unchanged: false,
    fingerprint,
    host: text(json.host) ?? "",
    pair: Array.isArray(json.pair) ? json.pair.filter((one) => typeof one === "string") : [],
    scope: text(json.scope) ?? "pair",
    readAt: text(json.read_at) ?? "",
    items,
  };
  const note = text(json.pair_note);
  if (note !== undefined) output.pairNote = note;
  return { ok: true, value: output };
}

/** A store the join can read: its directory, and the id prefix its issues carry. */
export interface JoinStore {
  path: string;
  name: string;
  prefix?: string;
}

/**
 * The store whose issues `task` names: the one whose prefix, with `_` read as `-` as the fleet's
 * ids write it (`AI_CLI` holds `AI-CLI-...`), starts the id; the longest such prefix wins.
 */
export function storeForTask<S extends JoinStore>(
  task: string,
  stores: readonly S[],
): S | undefined {
  let best: S | undefined;
  let bestLength = 0;
  for (const store of stores) {
    const prefix = store.prefix;
    if (prefix === undefined || prefix === "") continue;
    for (const form of new Set([prefix, prefix.replace(/_/g, "-")])) {
      if (task.startsWith(`${form}-`) && form.length > bestLength) {
        best = store;
        bestLength = form.length;
      }
    }
  }
  return best;
}

/** An id the join may pass to bd: no space, no comma, never read as a flag. */
const joinable = (task: string): boolean =>
  task !== "" && task !== "none" && !task.startsWith("-") && !/[\s,]/.test(task);

/**
 * The two reads that find `tasks` in one store, closed issues included: by bd id, and by the
 * `id:<display id>` label every fleet display id carries. A task is either form, so both are read.
 */
export function joinArgvs(tasks: readonly string[]): BdArgv[] {
  const ids = [...new Set(tasks.filter(joinable))].sort();
  if (ids.length === 0) return [];
  const base = ["bd", "list", "--json", "--brief", "--all", "--limit", "0"];
  return [
    [...base, `--id=${ids.join(",")}`],
    [...base, `--label-any=${ids.map((id) => `id:${id}`).join(",")}`],
  ];
}

/** The tasks of `items` a join reads in each store, by store directory. */
export function joinPlan<S extends JoinStore>(
  items: readonly ReviewItem[],
  stores: readonly S[],
): Map<string, { store: S; tasks: string[] }> {
  const plan = new Map<string, { store: S; tasks: string[] }>();
  for (const item of items) {
    if (!joinable(item.task)) continue;
    const store = storeForTask(item.task, stores);
    if (store === undefined) continue;
    const entry = plan.get(store.path) ?? { store, tasks: [] };
    if (!entry.tasks.includes(item.task)) entry.tasks.push(item.task);
    plan.set(store.path, entry);
  }
  for (const entry of plan.values()) entry.tasks.sort();
  return plan;
}

function reviewIssueOf(value: unknown): ReviewIssue | undefined {
  if (!isRecord(value)) return undefined;
  const id = text(value.id);
  const title = typeof value.title === "string" ? value.title : undefined;
  const status = text(value.status);
  const store = text(value.store);
  if (id === undefined || title === undefined || status === undefined || store === undefined) {
    return undefined;
  }
  const issue: ReviewIssue = {
    id,
    title,
    status,
    priority: typeof value.priority === "number" ? value.priority : 2,
    labels: Array.isArray(value.labels)
      ? value.labels.filter((one): one is string => typeof one === "string")
      : [],
    updatedAt: text(value.updatedAt) ?? "",
    store,
  };
  for (const key of ["displayId", "parent", "assignee"] as const) {
    const one = text(value[key]);
    if (one !== undefined) issue[key] = one;
  }
  return issue;
}

/** One `bd list --json --brief` row as a review item's issue. */
export function joinedIssueOf(row: unknown, store: string): ReviewIssue | undefined {
  if (!isRecord(row)) return undefined;
  let metadata: unknown = row.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = undefined;
    }
  }
  const displayId = isRecord(metadata) ? text(metadata.display_id) : undefined;
  return reviewIssueOf({
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    labels: row.labels,
    parent: row.parent,
    assignee: row.assignee,
    updatedAt: row.updated_at,
    displayId,
    store,
  });
}

/** Each issue of `rows` under its bd id and its display id. */
export function issuesByTask(rows: readonly unknown[], store: string): Map<string, ReviewIssue> {
  const found = new Map<string, ReviewIssue>();
  for (const row of rows) {
    const issue = joinedIssueOf(row, store);
    if (issue === undefined) continue;
    found.set(issue.id, issue);
    if (issue.displayId !== undefined) found.set(issue.displayId, issue);
  }
  return found;
}

/** One store's join as last read: the Dolt head it was read at, the tasks asked, what was found. */
export interface ReviewJoin {
  path: string;
  head: string;
  tasks: string[];
  issues: ReviewIssue[];
}

/** `items`, each with the issue its task names in `joins`, or none. */
export function joinItems(
  items: readonly ReviewItem[],
  joins: readonly ReviewJoin[],
): ReviewItem[] {
  const byTask = new Map<string, ReviewIssue>();
  for (const join of joins) {
    for (const issue of join.issues) {
      byTask.set(issue.id, issue);
      if (issue.displayId !== undefined) byTask.set(issue.displayId, issue);
    }
  }
  return items.map((item) => {
    const { issue: _old, ...rest } = item;
    const issue = byTask.get(item.task);
    return issue === undefined ? rest : { ...rest, issue };
  });
}

/** The review snapshot a refresher writes: the verb's last payload, joined, and when it was checked. */
export interface ReviewSnapshot {
  schema: number;
  token: string;
  /** When the verb last printed items. */
  readAt: number;
  /** When the verb last answered, changed or not. */
  checkedAt: number;
  fingerprint: string;
  host: string;
  pair: string[];
  scope: string;
  pairNote?: string;
  /** Why the last run did not answer; the items are the last ones it did. */
  error?: string;
  items: ReviewItem[];
  joins: ReviewJoin[];
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function joinOf(value: unknown): ReviewJoin | undefined {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.head !== "string") {
    return undefined;
  }
  return {
    path: value.path,
    head: value.head,
    tasks: Array.isArray(value.tasks)
      ? value.tasks.filter((one): one is string => typeof one === "string")
      : [],
    issues: Array.isArray(value.issues)
      ? value.issues.flatMap((one) => {
          const issue = reviewIssueOf(one);
          return issue === undefined ? [] : [issue];
        })
      : [],
  };
}

export function parseReviewSnapshot(raw: string): Result<ReviewSnapshot, string> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "the review snapshot is not JSON" };
  }
  if (!isRecord(json) || json.schema !== REVIEW_SNAPSHOT_SCHEMA) {
    return { ok: false, error: "the review snapshot has another schema" };
  }
  const { token, readAt, checkedAt, fingerprint } = json;
  if (typeof token !== "string" || !finite(readAt) || !finite(checkedAt)) {
    return { ok: false, error: "the review snapshot has no token or read time" };
  }
  if (typeof fingerprint !== "string" || !Array.isArray(json.items)) {
    return { ok: false, error: "the review snapshot has no fingerprint or items" };
  }
  const snapshot: ReviewSnapshot = {
    schema: REVIEW_SNAPSHOT_SCHEMA,
    token,
    readAt,
    checkedAt,
    fingerprint,
    host: text(json.host) ?? "",
    pair: Array.isArray(json.pair)
      ? json.pair.filter((one): one is string => typeof one === "string")
      : [],
    scope: text(json.scope) ?? "pair",
    items: json.items.flatMap((row) => {
      const item = itemOf(row);
      return item === undefined ? [] : [item];
    }),
    joins: Array.isArray(json.joins)
      ? json.joins.flatMap((one) => {
          const join = joinOf(one);
          return join === undefined ? [] : [join];
        })
      : [],
  };
  const note = text(json.pairNote);
  if (note !== undefined) snapshot.pairNote = note;
  const error = text(json.error);
  if (error !== undefined) snapshot.error = error;
  return { ok: true, value: snapshot };
}
