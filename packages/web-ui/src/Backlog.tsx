import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { BacklogRow, BacklogView, Issue, Priority } from "@beads-ui/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { MoveToMenu, type SprintTarget } from "./MoveToMenu.tsx";
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
  /** The repository a row's issue comes from: with it, the table gains a Repository column. */
  repositoryOf?: ((id: string) => string | undefined) | undefined;
  /** Under views.rank: move a row one place among the rows of its priority (T-W1.0, D-21). */
  onStep?: ((id: string, delta: -1 | 1) => void) | undefined;
  /** Under views.rank: a row dropped onto another, after it when `below`. */
  onDropOnto?: ((id: string, target: string, below: boolean) => void) | undefined;
  /** The sprints and the backlog a row can move to from its Move to menu. */
  sprintTargets?: ((id: string) => readonly SprintTarget[]) | undefined;
  onSprint?: ((id: string, to: string) => void) | undefined;
  /** The row's owner picker, in place of its assignee. */
  renderOwner?: ((id: string) => ReactNode) | undefined;
}

type RowData = { kind: "row"; id: string };
const isRow = (data: Record<string | symbol, unknown>): data is RowData & Record<string, unknown> =>
  data.kind === "row" && typeof data.id === "string";

function Row({ row, props }: { row: BacklogRow; props: BacklogProps }) {
  const ref = useRef<HTMLTableRowElement>(null);
  const [edge, setEdge] = useState<Edge | null>(null);
  const issue = props.issue(row.id);
  const busy = props.pending.has(row.id);
  const latest = useRef(props);
  latest.current = props;
  const ranked = props.onStep !== undefined;

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const data: RowData = { kind: "row", id: row.id };
    return combine(
      draggable({ element, canDrag: () => !busy, getInitialData: () => data }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => ranked && isRow(source.data) && source.data.id !== row.id,
        getData: ({ input }) =>
          attachClosestEdge(data, { input, element, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: ({ self, source }) => {
          setEdge(null);
          if (!isRow(source.data)) return;
          latest.current.onDropOnto?.(
            source.data.id,
            row.id,
            extractClosestEdge(self.data) === "bottom",
          );
        },
      }),
    );
  }, [row.id, busy, ranked]);

  return (
    <tr
      ref={ref}
      data-row-id={row.id}
      data-pending={busy || undefined}
      data-drop-edge={edge ?? undefined}
    >
      <td className="bu-id">{row.displayId}</td>
      {props.repositoryOf !== undefined && (
        <td className="bu-repo">{props.repositoryOf(row.id)}</td>
      )}
      <td>
        <a
          href={props.issueHref(row.id)}
          draggable={false}
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
          onChange={(event) => props.onPriority(row.id, Number(event.target.value) as Priority)}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              P{priority}
            </option>
          ))}
        </select>
      </td>
      <td>{props.renderOwner === undefined ? row.assignee : props.renderOwner(row.id)}</td>
      <td>{row.created}</td>
      {(ranked || props.onSprint !== undefined) && (
        <td className="bu-row-actions">
          {props.onStep !== undefined && (
            <>
              <button
                type="button"
                className="bu-button bu-step"
                aria-label={`Move ${row.displayId} up one place`}
                disabled={busy}
                onClick={() => props.onStep?.(row.id, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="bu-button bu-step"
                aria-label={`Move ${row.displayId} down one place`}
                disabled={busy}
                onClick={() => props.onStep?.(row.id, 1)}
              >
                Down
              </button>
            </>
          )}
          {props.onSprint !== undefined && (
            <MoveToMenu
              cardLabel={row.displayId}
              targets={[]}
              onMove={() => undefined}
              sprintTargets={props.sprintTargets?.(row.id) ?? []}
              onSprint={(to) => props.onSprint?.(row.id, to)}
              disabled={busy}
            />
          )}
        </td>
      )}
    </tr>
  );
}

/**
 * The Backlog: one row an open issue, with its status, priority and owner written in place, and,
 * under views.rank, reordered by drag or by its Up and Down buttons.
 */
export function Backlog(props: BacklogProps) {
  const { view } = props;
  const actions = props.onStep !== undefined || props.onSprint !== undefined;
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
            {props.repositoryOf !== undefined && <th scope="col">Repository</th>}
            <th scope="col">Title</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Priority</th>
            <th scope="col">Assignee</th>
            <th scope="col">Created</th>
            {actions && <th scope="col">Order</th>}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <Row key={row.id} row={row} props={props} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
