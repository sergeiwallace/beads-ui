import {
  type BacklogRow,
  type BacklogView,
  type Issue,
  keyBetween,
  priorityBadge,
  priorityToken,
  type RandomSource,
  rankNeighbours,
  readRank,
} from "@beads-ui/core";

/** A reorder of a backlog or sprint list row, planned against the rows as drawn. */
export interface ListRankPlan {
  /** The key drawn at once; the server writes its own between the same neighbours. */
  key: string;
  /** The row's drawn status and priority, which guard the write. */
  shown: string;
  priority: number;
  above?: string;
  below?: string;
}

export type ListRankError = {
  kind: "unknown-row" | "same-place" | "other-priority" | "rank";
  message: string;
};

/**
 * Where moving row `id` to slot `index` of its priority's rows puts it (web app design T-W1.0,
 * D-21). A list orders by priority, then rank, so a row moves among the rows of its own priority;
 * `index` counts those rows with the row taken out. The key lies between the slot's ranked
 * neighbours, so no other row is renumbered.
 */
export function planListRank(
  rows: readonly Issue[],
  id: string,
  index: number,
  random: RandomSource,
): { ok: true; value: ListRankPlan } | { ok: false; error: ListRankError } {
  const issue = rows.find((row) => row.id === id);
  if (issue === undefined) {
    return { ok: false, error: { kind: "unknown-row", message: `${id} is not in the list` } };
  }
  const group = rows.filter((row) => row.priority === issue.priority);
  const { above, below } = rankNeighbours(group, id, index);
  const keyOf = (row: Issue | undefined) => {
    const read = row === undefined ? undefined : readRank(row);
    return read?.kind === "ranked" ? read.key : undefined;
  };
  const low = keyOf(above);
  const high = keyOf(below);
  const current = readRank(issue);
  if (
    current.kind === "ranked" &&
    (low === undefined || low < current.key) &&
    (high === undefined || current.key < high)
  ) {
    return { ok: false, error: { kind: "same-place", message: `${id} is already there` } };
  }
  const key = keyBetween(low, high, random);
  if (!key.ok) return { ok: false, error: { kind: "rank", message: key.error.message } };
  const plan: ListRankPlan = { key: key.value, shown: issue.status, priority: issue.priority };
  if (above !== undefined) plan.above = above.id;
  if (below !== undefined) plan.below = below.id;
  return { ok: true, value: plan };
}

/** The slot a one-place step moves `id` to among the rows of its priority, or undefined at an end. */
export function stepIndex(rows: readonly Issue[], id: string, delta: -1 | 1): number | undefined {
  const issue = rows.find((row) => row.id === id);
  if (issue === undefined) return undefined;
  const group = rows.filter((row) => row.priority === issue.priority);
  const at = group.findIndex((row) => row.id === id);
  const next = at + delta;
  return next < 0 || next >= group.length ? undefined : next;
}

/**
 * The slot a drop onto row `target` gives `id`: its place among the rows of its priority with
 * `id` taken out, `below` putting it after the target. A target of another priority is refused,
 * since the list sorts by priority first.
 */
export function dropIndex(
  rows: readonly Issue[],
  id: string,
  target: string,
  below: boolean,
): { ok: true; index: number } | { ok: false; error: ListRankError } {
  const issue = rows.find((row) => row.id === id);
  const over = rows.find((row) => row.id === target);
  if (issue === undefined || over === undefined) {
    return { ok: false, error: { kind: "unknown-row", message: `${target} is not in the list` } };
  }
  if (over.priority !== issue.priority) {
    return {
      ok: false,
      error: {
        kind: "other-priority",
        message: `the list sorts by priority first: change ${id}'s priority to move it among P${over.priority} rows`,
      },
    };
  }
  const rest = rows.filter((row) => row.priority === issue.priority && row.id !== id);
  const at = rest.findIndex((row) => row.id === target);
  return { ok: true, index: below ? at + 1 : at };
}

/** A list of issues as the Backlog component draws them, every row on one page. */
export function listView(issues: readonly Issue[]): BacklogView {
  const rows = issues.map(
    (issue): BacklogRow => ({
      id: issue.id,
      displayId: issue.displayId ?? issue.id,
      priority: priorityBadge(issue.priority),
      priorityToken: priorityToken(issue.priority),
      type: issue.type,
      assignee: issue.assignee ?? "",
      title: issue.title,
      created: issue.createdAt.slice(0, 10),
    }),
  );
  return {
    rows,
    page: {
      key: "list",
      page: 0,
      pages: 1,
      from: rows.length === 0 ? 0 : 1,
      to: rows.length,
      total: rows.length,
    },
    total: rows.length,
  };
}
