import type { SessionRow, SessionsView } from "@beads-ui/core";
import type { ReadFailure } from "./IssueDetail.tsx";

export interface SessionsProps {
  /** Core's Sessions view: the work queue's registry, or the store's assignees without it. */
  view: SessionsView;
  /** The queue read that failed, when the view fell back to the store's assignees. */
  queueError?: ReadFailure | undefined;
  /** The page of a task in this store; undefined for a task in another repository. */
  issueHref(row: SessionRow): string | undefined;
}

const stamp = (value: string) => value.slice(0, 16).replace("T", " ");

function Task({ row, href }: { row: SessionRow; href: string | undefined }) {
  const task = row.currentTask;
  if (task === undefined) return <span className="bu-dim">none</span>;
  const label = (
    <>
      <span className="bu-id">{task.label}</span> {task.title ?? ""}
    </>
  );
  return (
    <>
      {href === undefined ? label : <a href={href}>{label}</a>}
      {task.repo !== undefined && <span className="bu-dim"> in {task.repo}</span>}
    </>
  );
}

/** Every session with its state, current task, last heartbeat and claim age (T-3.4). */
export function Sessions(props: SessionsProps) {
  const { view } = props;
  const live = view.liveness === "available";
  return (
    <section className="bu-sessions" aria-labelledby="bu-sessions-title">
      <h1 id="bu-sessions-title" className="bu-view-title">
        Sessions
      </h1>
      {props.queueError !== undefined && (
        <p className="bu-read-error" role="alert">
          <strong>{props.queueError.source}</strong> failed: {props.queueError.message}. Showing the
          store's assignees instead.
        </p>
      )}
      <p className="bu-sessions-note" role="status" data-liveness={view.liveness}>
        {view.note}
      </p>
      {view.rows.length === 0 ? (
        <p className="bu-dim">
          {live ? "The work queue has no session registered." : "No open task has an assignee."}
        </p>
      ) : (
        <table className="bu-table bu-stack">
          <thead>
            <tr>
              <th scope="col">Session</th>
              <th scope="col">Machine</th>
              {live && <th scope="col">State</th>}
              <th scope="col">Current task</th>
              {live && <th scope="col">Last heartbeat</th>}
              <th scope="col">Claim age</th>
              <th scope="col">Assigned here</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.id} data-session-id={row.id} data-state={row.state}>
                <th scope="row" data-label="Session">
                  {row.name}
                </th>
                <td data-label="Machine">{row.machine === "" ? "none" : row.machine}</td>
                {live && (
                  <td data-label="State">
                    <span className="bu-session-state" data-state={row.state}>
                      {row.state}
                    </span>
                  </td>
                )}
                <td data-label="Current task">
                  <Task row={row} href={props.issueHref(row)} />
                </td>
                {live && (
                  <td data-label="Last heartbeat">
                    {row.lastHeartbeatAt === undefined ? (
                      <span className="bu-dim">none</span>
                    ) : (
                      <time dateTime={row.lastHeartbeatAt} title={stamp(row.lastHeartbeatAt)}>
                        {row.heartbeatAge} ago
                      </time>
                    )}
                  </td>
                )}
                <td data-label="Claim age">
                  {row.claimedAt === undefined ? (
                    <span className="bu-dim">
                      {row.currentTask === undefined ? "none" : "unknown"}
                    </span>
                  ) : (
                    <time
                      dateTime={row.claimedAt}
                      title={`${stamp(row.claimedAt)}, from ${row.claimSource === "queue" ? "the queue's claim" : "the issue's start"}`}
                    >
                      {row.claimAge}
                    </time>
                  )}
                </td>
                <td data-label="Assigned here">{row.assigned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
