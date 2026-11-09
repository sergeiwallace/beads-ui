// The Queue view's read (web app design T-W1.5): every open task the host's allowlist permits,
// across every open store, in the work queue's order where `[queue] url` is set and otherwise by
// priority, then rank, then age; with `blocked=1`, only blocked tasks, each with its blocker.

import {
  type Issue,
  orderByPriorityRank,
  type ReviewQueueEntry,
  readRank,
  type Status,
  taskEntry,
} from "@beads-ui/core";
import { filterAllowed } from "./allowlist.ts";
import { QueueClient } from "./queue.ts";
import type { OpenStore } from "./registry.ts";
import {
  type ApiContext,
  type ApiError,
  type ApiReply,
  type ApiRequest,
  bdFailure,
} from "./routes.ts";
import { queueRepo } from "./views.ts";

/** The queue states the work queue serves first, in its own order: leased, then ready. */
export const QUEUE_SERVING_STATES = ["active", "assigned", "ready"] as const;
/** How many blocked tasks' comments are read at once for their block reason. */
const COMMENT_CONCURRENCY = 4;

export type QueueOrder =
  | { kind: "queue"; label: string }
  | { kind: "priority-rank-age"; label: string }
  | { kind: "priority"; label: string; error: { source: string; message: string } };

export const QUEUE_ORDER_LABEL =
  "the work queue's order: leased tasks, then ready tasks as the queue serves them (priority, then id), then every other open task by priority, rank and age";
export const LOCAL_ORDER_LABEL = "priority, then rank, then age";

export interface QueueRow {
  /** `<repository>:<id>`, unique across stores. */
  key: string;
  id: string;
  displayId: string;
  repository: string;
  title: string;
  type: string;
  status: string;
  priority: number;
  assignee?: string;
  /** The queue state the work queue holds the task in, where the queue was read. */
  queueState?: string;
  blocked: boolean;
  /** The open issues blocking it, by `blocks` dependency. */
  blockers: { id: string; title?: string }[];
  /** For a task in the blocked status with no open blocker: its newest comment, the block reason. */
  blockNote?: string;
  /** The Review queue's filter fields, read by matchesQueueFilters on the page. */
  entry: Omit<ReviewQueueEntry, "issue" | "item">;
}

const doneOf = (statuses: readonly Status[]): Set<string> => {
  const done = new Set(statuses.filter((s) => s.category === "done").map((s) => s.name));
  if (done.size === 0) done.add("closed");
  return done;
};

type StoreRead =
  | { repository: string; ok: true; issues: Issue[]; done: Set<string> }
  | { repository: string; ok: false; error: ApiError };

const errorOf = (reply: ApiReply): ApiError => (reply.body as { error: ApiError }).error;

async function readStore(store: OpenStore): Promise<StoreRead> {
  const statuses = await store.bd.statuses();
  if (statuses.kind !== "ok") {
    return {
      repository: store.repository,
      ok: false,
      error: errorOf(bdFailure("bd statuses", statuses)),
    };
  }
  const issues = await store.bd.board();
  if (issues.kind !== "ok") {
    return {
      repository: store.repository,
      ok: false,
      error: errorOf(bdFailure("bd list", issues)),
    };
  }
  return {
    repository: store.repository,
    ok: true,
    issues: issues.value,
    done: doneOf(statuses.value),
  };
}

/** The open issues blocking `issue`: its `blocks` dependencies that are in this read and not done. */
function openBlockers(issue: Issue, byId: ReadonlyMap<string, Issue>, done: ReadonlySet<string>) {
  return issue.dependencies
    .filter((dependency) => dependency.type === "blocks")
    .flatMap((dependency) => {
      const blocker = byId.get(dependency.id);
      // The board read holds every issue not closed: a blocker missing from it is closed.
      if (blocker === undefined || done.has(blocker.status)) return [];
      return [{ id: blocker.displayId ?? blocker.id, title: blocker.title }];
    });
}

async function inTurn<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]?.();
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

/** The serving position the work queue gives each task, by `<queue repo>/<task id>`. */
async function queuePositions(
  context: ApiContext,
  url: string,
): Promise<
  { ok: true; states: Map<string, string> } | { ok: false; source: string; message: string }
> {
  const queue = new QueueClient(url);
  const states = new Map<string, string>();
  const allowlist = await context.allowlist();
  for (const state of QUEUE_SERVING_STATES) {
    const read = await queue.tasks(state);
    if (!read.ok) return { ok: false, source: read.failure.source, message: read.failure.message };
    const shown = filterAllowed(
      read.value,
      (task) => task.repo,
      allowlist,
      context.health,
      "the work queue tasks",
    );
    for (const task of shown) states.set(`${task.repo}/${task.taskId}`, task.queueState);
  }
  return { ok: true, states };
}

const compareId = (a: QueueRow, b: QueueRow) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * `GET /api/queue-view[?blocked=1]`: the Queue view's rows. Filters by epic, goal, type, size,
 * owner and repository are applied on the page, from the URL, over these rows.
 */
export async function queueViewRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const config = await context.config();
  const blockedOnly = request.query.get("blocked") === "1";
  const stores = await context.stores.open();
  const reads: StoreRead[] = [];
  for (const store of stores) reads.push(await readStore(store));

  const goalIds = new Set<string>();
  for (const read of reads) {
    if (!read.ok) continue;
    for (const issue of read.issues) if (issue.type === "goal") goalIds.add(issue.id);
  }

  let rows: { row: QueueRow; issue: Issue; store: OpenStore }[] = [];
  for (const [index, read] of reads.entries()) {
    const store = stores[index];
    if (!read.ok || store === undefined) continue;
    const byId = new Map(read.issues.map((issue) => [issue.id, issue]));
    for (const issue of orderByPriorityRank(read.issues)) {
      if (read.done.has(issue.status) || issue.type === "goal") continue;
      const blockers = openBlockers(issue, byId, read.done);
      const blocked = issue.status === "blocked" || blockers.length > 0;
      const {
        issue: _issue,
        item: _item,
        ...entry
      } = taskEntry({ issue, repo: read.repository }, goalIds);
      const row: QueueRow = {
        key: `${read.repository}:${issue.id}`,
        id: issue.id,
        displayId: issue.displayId ?? issue.id,
        repository: read.repository,
        title: issue.title,
        type: issue.type,
        status: issue.status,
        priority: issue.priority,
        blocked,
        blockers,
        entry,
      };
      if (issue.assignee !== undefined && issue.assignee !== "") row.assignee = issue.assignee;
      rows.push({ row, issue, store });
    }
  }
  if (blockedOnly) rows = rows.filter(({ row }) => row.blocked);

  // A task in the blocked status with no open blocker says why through its newest comment, the
  // reason bd-block stamps.
  await inTurn(
    rows
      .filter(({ row }) => row.blockers.length === 0 && row.status === "blocked")
      .map(({ row, store }) => async () => {
        const comments = await store.bd.comments(row.id);
        if (comments.kind !== "ok") {
          row.blockNote = `its block reason could not be read: ${errorOf(bdFailure("bd comments", comments)).message}`;
          return;
        }
        const newest = comments.value.at(-1);
        if (newest !== undefined) row.blockNote = newest.text;
      }),
    COMMENT_CONCURRENCY,
  );

  // Every store's rows arrive in priority, rank, age order; merging keeps that order across stores.
  const rankOf = (issue: Issue) => {
    const read = readRank(issue);
    return read.kind === "ranked" ? read.key : undefined;
  };
  const local = (
    a: { row: QueueRow; issue: Issue },
    b: { row: QueueRow; issue: Issue },
  ): number => {
    if (a.row.priority !== b.row.priority) return a.row.priority - b.row.priority;
    const ra = rankOf(a.issue);
    const rb = rankOf(b.issue);
    if (ra !== rb) {
      if (ra === undefined) return 1;
      if (rb === undefined) return -1;
      return ra < rb ? -1 : 1;
    }
    const age = Date.parse(a.issue.createdAt) - Date.parse(b.issue.createdAt);
    return Number.isNaN(age) || age === 0 ? compareId(a.row, b.row) : age;
  };

  let order: QueueOrder = { kind: "priority-rank-age", label: LOCAL_ORDER_LABEL };
  let sorted = [...rows].sort(local);
  if (config.queueUrl !== undefined) {
    const positions = await queuePositions(context, config.queueUrl);
    if (positions.ok) {
      const stateOf = (row: QueueRow) =>
        positions.states.get(`${queueRepo(config, row.repository)}/${row.id}`);
      for (const { row } of rows) {
        const state = stateOf(row);
        if (state !== undefined) row.queueState = state;
      }
      const position = (row: QueueRow) => {
        const at = (QUEUE_SERVING_STATES as readonly string[]).indexOf(row.queueState ?? "");
        return at < 0 ? QUEUE_SERVING_STATES.length : at;
      };
      sorted = [...rows].sort((a, b) => {
        const pa = position(a.row);
        const pb = position(b.row);
        if (pa !== pb) return pa - pb;
        if (pa < QUEUE_SERVING_STATES.length) {
          return a.row.priority - b.row.priority || compareId(a.row, b.row);
        }
        return local(a, b);
      });
      order = { kind: "queue", label: QUEUE_ORDER_LABEL };
    } else {
      sorted = [...rows].sort((a, b) => a.row.priority - b.row.priority || local(a, b));
      order = {
        kind: "priority",
        label: "priority: the work queue's order could not be read",
        error: { source: positions.source, message: positions.message },
      };
    }
  }

  return {
    status: 200,
    body: {
      asOf: context.now(),
      blocked: blockedOnly,
      order,
      reads: reads.map((read) =>
        read.ok
          ? { repository: read.repository, ok: true, count: read.issues.length }
          : { repository: read.repository, ok: false, error: read.error },
      ),
      rows: sorted.map(({ row }) => row),
    },
  };
}
