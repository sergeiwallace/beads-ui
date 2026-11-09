import {
  matchesQueueFilters,
  priorityBadge,
  priorityToken,
  QUEUE_FILTER_KEYS,
  type QueueFilterKey,
  type QueueFilters,
  type ReviewQueueEntry,
} from "@beads-ui/core";
import { tokenVar } from "../tokens.ts";

/** One row of the Queue view, as the server's queue read returns it. */
export interface QueueRowView {
  key: string;
  id: string;
  displayId: string;
  repository: string;
  title: string;
  type: string;
  status: string;
  priority: number;
  assignee?: string | undefined;
  queueState?: string | undefined;
  blocked: boolean;
  blockers: readonly { id: string; title?: string | undefined }[];
  blockNote?: string | undefined;
  /** The filter fields (epic, goals, type, size, owner, repository). */
  entry: Omit<ReviewQueueEntry, "issue" | "item">;
}

/** Which order the rows are in, said above them. */
export interface QueueOrderView {
  kind: string;
  label: string;
  error?: { source: string; message: string } | undefined;
}

export interface QueueViewProps {
  rows: readonly QueueRowView[];
  order: QueueOrderView;
  /** Filters from the URL; a change goes back to the URL through onFilters. */
  filters: QueueFilters;
  onFilters(filters: QueueFilters): void;
  blocked: boolean;
  onBlocked(blocked: boolean): void;
  issueHref(row: QueueRowView): string;
  onOpen(row: QueueRowView): void;
}

export const QUEUE_FILTER_LABELS: Readonly<Record<QueueFilterKey, string>> = {
  epic: "Epic",
  goal: "Goal",
  type: "Type",
  size: "Size",
  owner: "Owner",
  repo: "Repository",
};

function valuesOf(entry: QueueRowView["entry"], key: QueueFilterKey): string[] {
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

const sorted = (values: Iterable<string>) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

/**
 * The Queue view (web app design T-W1.5): every open task in the order the server read, with a
 * blocked filter that shows each task's blocker, and filters by epic, goal, type, size, owner and
 * repository that the page keeps in its URL.
 */
export function QueueView(props: QueueViewProps) {
  const shown = props.rows.filter((row) =>
    matchesQueueFilters(row.entry as ReviewQueueEntry, props.filters),
  );
  const setFilter = (key: QueueFilterKey, value: string) => {
    const next: QueueFilters = { ...props.filters };
    if (value === "") delete next[key];
    else next[key] = [value];
    props.onFilters(next);
  };
  return (
    <div className="bu-queue">
      <p className="bu-queue-order" role="status">
        Ordered by {props.order.label}
        {props.order.error !== undefined && (
          <>
            {" "}
            ({props.order.error.source}: {props.order.error.message})
          </>
        )}
      </p>
      <div className="bu-queue-filters">
        <label className="bu-check">
          <input
            type="checkbox"
            checked={props.blocked}
            onChange={(event) => props.onBlocked(event.target.checked)}
          />{" "}
          Blocked only
        </label>
        {QUEUE_FILTER_KEYS.map((key) => {
          const options = sorted(props.rows.flatMap((row) => valuesOf(row.entry, key)));
          const value = props.filters[key]?.[0] ?? "";
          return (
            <label key={key} className="bu-queue-filter">
              {QUEUE_FILTER_LABELS[key]}{" "}
              <select
                className="bu-select"
                aria-label={`Filter by ${QUEUE_FILTER_LABELS[key].toLowerCase()}`}
                value={value}
                onChange={(event) => setFilter(key, event.target.value)}
              >
                <option value="">Any</option>
                {sorted([...options, ...(value === "" ? [] : [value])]).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <p className="bu-queue-count">
        {shown.length === props.rows.length
          ? `${shown.length} ${props.blocked ? "blocked" : "open"}`
          : `${shown.length} of ${props.rows.length} ${props.blocked ? "blocked" : "open"}`}
      </p>
      <ol className="bu-queue-rows">
        {shown.map((row) => (
          <li
            key={row.key}
            className="bu-queue-row"
            data-row-key={row.key}
            data-blocked={row.blocked || undefined}
          >
            <span className="bu-id">{row.displayId}</span>{" "}
            <span
              className="bu-priority"
              style={{ color: tokenVar(priorityToken(row.priority as 0)) }}
            >
              {priorityBadge(row.priority as 0)}
            </span>{" "}
            <a
              href={props.issueHref(row)}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                props.onOpen(row);
              }}
            >
              {row.title}
            </a>{" "}
            <span className="bu-dim">
              {row.type} {row.status}
              {row.queueState === undefined ? "" : `, queue ${row.queueState}`}
              {row.assignee === undefined ? "" : `, ${row.assignee}`} ({row.repository})
            </span>
            {row.blocked && (
              <p className="bu-blocker">
                Blocked by{" "}
                {row.blockers.length > 0
                  ? row.blockers
                      .map((blocker) =>
                        blocker.title === undefined ? blocker.id : `${blocker.id} ${blocker.title}`,
                      )
                      .join(", ")
                  : (row.blockNote ?? "no recorded reason")}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
