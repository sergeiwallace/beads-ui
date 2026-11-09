import type { BacklogView, Issue, Priority } from "@beads-ui/core";
import { tokenVar } from "./tokens.ts";

const PRIORITIES: readonly Priority[] = [0, 1, 2, 3, 4];

export interface BacklogProps {
  /** Core's Backlog view model (backlogView): open issues by priority, then rank, then age. */
  view: BacklogView;
  issue(id: string): Issue | undefined;
  /** Every status, in column order. */
  statuses: readonly string[];
  /** Issues with a write in flight; their controls wait. */
  pending: ReadonlySet<string>;
  issueHref(id: string): string;
  onOpen(id: string): void;
  onStatus(id: string, to: string): void;
  onPriority(id: string, priority: Priority): void;
}

/** The Backlog: one row an open issue, with its status and priority written in place. */
export function Backlog(props: BacklogProps) {
  const { view } = props;
  return (
    <div className="bu-backlog">
      <p className="bu-backlog-count">
        {view.rows.length === view.total
          ? `${view.total} open`
          : `${view.rows.length} of ${view.total} open`}
      </p>
      {view.filterLine !== undefined && <p role="alert">{view.filterLine}</p>}
      <table className="bu-table">
        <thead>
          <tr>
            <th scope="col">Id</th>
            <th scope="col">Title</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Assignee</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => {
            const issue = props.issue(row.id);
            const busy = props.pending.has(row.id);
            return (
              <tr key={row.id} data-row-id={row.id} data-pending={busy || undefined}>
                <td className="bu-id">{row.displayId}</td>
                <td>
                  <a
                    href={props.issueHref(row.id)}
                    onClick={(event) => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
                        return;
                      }
                      event.preventDefault();
                      props.onOpen(row.id);
                    }}
                  >
                    {row.title}
                  </a>
                </td>
                <td>{row.type}</td>
                <td>
                  <select
                    className="bu-select"
                    aria-label={`Status of ${row.displayId}`}
                    value={issue?.status ?? ""}
                    disabled={busy || issue === undefined}
                    onChange={(event) => props.onStatus(row.id, event.target.value)}
                  >
                    {props.statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="bu-select"
                    aria-label={`Priority of ${row.displayId}`}
                    style={{ color: tokenVar(row.priorityToken) }}
                    value={issue?.priority ?? ""}
                    disabled={busy || issue === undefined}
                    onChange={(event) =>
                      props.onPriority(row.id, Number(event.target.value) as Priority)
                    }
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        P{priority}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{row.assignee}</td>
                <td>{row.created}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
