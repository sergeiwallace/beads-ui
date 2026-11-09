import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import type { BoardView, CardView, ColumnHeaderView } from "@beads-ui/core";
import { useEffect, useRef, useState } from "react";
import { MoveToMenu } from "./MoveToMenu.tsx";
import { tokenVar } from "./tokens.ts";

export interface BoardProps {
  /** Core's board view model (boardView), drawn with no swimlanes and every card on one page. */
  view: BoardView;
  /** views.rank: dropping a card inside its own column reorders it. */
  rank: boolean;
  selectedId?: string | undefined;
  onSelect(id: string): void;
  /** The detail link for a card. */
  issueHref(id: string): string;
  onOpen(id: string): void;
  onMove(id: string, to: string): void;
  /** `index` counts slots in the card's column with the card taken out (core planRank). */
  onReorder(id: string, index: number): void;
  /** The repository a card's issue comes from, drawn on the card when given. */
  repositoryOf?: ((id: string) => string | undefined) | undefined;
}

type CardData = { kind: "card"; id: string; status: string };
type ColumnData = { kind: "column"; status: string };

const isCard = (
  data: Record<string | symbol, unknown>,
): data is CardData & Record<string, unknown> => data.kind === "card";
const isColumn = (
  data: Record<string | symbol, unknown>,
): data is ColumnData & Record<string, unknown> => data.kind === "column";

/** Where a drop lands: a status change across columns, a slot inside the card's own column. */
export function dropOutcome(
  source: CardData,
  column: string,
  target: { id: string; edge: Edge | null } | undefined,
  order: readonly string[],
): { kind: "move"; to: string } | { kind: "reorder"; index: number } | undefined {
  if (column !== source.status) return { kind: "move", to: column };
  if (target === undefined || target.id === source.id) return undefined;
  const rest = order.filter((id) => id !== source.id);
  const at = rest.indexOf(target.id);
  if (at === -1) return undefined;
  return { kind: "reorder", index: target.edge === "bottom" ? at + 1 : at };
}

interface CardProps {
  card: CardView;
  status: string;
  rank: boolean;
  selected: boolean;
  index: number;
  props: BoardProps;
}

function Card({ card, status, rank, selected, index, props }: CardProps) {
  const ref = useRef<HTMLLIElement>(null);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const data: CardData = { kind: "card", id: card.id, status };
    return combine(
      draggable({
        element,
        canDrag: () => !card.pending,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => isCard(source.data) && source.data.id !== card.id,
        getData: ({ input }) =>
          attachClosestEdge(data, { input, element, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self, source }) => {
          const same = isCard(source.data) && source.data.status === status;
          setEdge(rank && same ? extractClosestEdge(self.data) : null);
        },
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [card.id, card.pending, status, rank]);
  const repository = props.repositoryOf?.(card.id);

  return (
    <li
      ref={ref}
      className="bu-card"
      data-card-id={card.id}
      data-selected={selected || undefined}
      data-pending={card.pending || undefined}
      data-dragging={dragging || undefined}
      data-drop-edge={edge ?? undefined}
      aria-current={selected ? "true" : undefined}
      aria-label={`${card.displayId} ${card.title}`}
      // Selection follows the pointer and the focus of the card's link or button, so the
      // palette's Move to acts on the card last touched; the link itself opens the detail.
      onPointerDown={() => props.onSelect(card.id)}
      onFocus={() => props.onSelect(card.id)}
    >
      <div className="bu-card-head">
        <span className="bu-id">{card.displayId}</span>
        {repository !== undefined && <span className="bu-repo">{repository}</span>}
        <span className="bu-priority" style={{ color: tokenVar(card.priorityToken) }}>
          {card.priority}
        </span>
      </div>
      <a
        className="bu-card-title"
        href={props.issueHref(card.id)}
        // The card is the drag source; a link's own native drag would carry its URL instead.
        draggable={false}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          props.onOpen(card.id);
        }}
      >
        {card.title}
      </a>
      <div className="bu-card-foot">
        <span className="bu-assignee">{card.assignee}</span>
        <MoveToMenu
          cardLabel={card.displayId}
          targets={card.moveTargets}
          disabled={card.pending}
          onMove={(to) => props.onMove(card.id, to)}
          {...(rank
            ? { onStep: (delta: -1 | 1) => props.onReorder(card.id, Math.max(0, index + delta)) }
            : {})}
        />
      </div>
    </li>
  );
}

interface ColumnProps {
  header: ColumnHeaderView;
  cards: CardView[];
  props: BoardProps;
}

function Column({ header, cards, props }: ColumnProps) {
  const ref = useRef<HTMLElement>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const data: ColumnData = { kind: "column", status: header.status };
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => isCard(source.data),
      getData: () => data,
      onDragEnter: ({ source }) =>
        setOver(isCard(source.data) && source.data.status !== header.status),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false),
    });
  }, [header.status]);

  return (
    <section
      ref={ref}
      className="bu-column"
      data-status={header.status}
      data-over={over || undefined}
      aria-labelledby={`bu-column-${header.status}`}
    >
      <h2
        id={`bu-column-${header.status}`}
        className="bu-column-head"
        style={{ borderColor: tokenVar(header.token) }}
        data-over-limit={header.overLimit || undefined}
      >
        <span className="bu-column-name">{header.status}</span>
        <span className="bu-column-count">{header.count}</span>
      </h2>
      <ol className="bu-cards">
        {cards.map((card, index) => (
          <Card
            key={card.id}
            card={card}
            status={header.status}
            rank={props.rank}
            selected={props.selectedId === card.id}
            index={index}
            props={props}
          />
        ))}
      </ol>
    </section>
  );
}

/**
 * The Board: one column per bd status in core's order. A card dropped on another column is a
 * status move; under rank, a card dropped beside another in its own column is a reorder. Every
 * card also carries the Move to menu, so nothing needs a drag.
 */
export function Board(props: BoardProps) {
  const { view } = props;
  const cells = view.lanes[0]?.cells ?? [];
  const latest = useRef(props);
  latest.current = props;

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => isCard(source.data),
        onDrop: ({ source, location }) => {
          if (!isCard(source.data)) return;
          const targets = location.current.dropTargets;
          const columnTarget = targets.find((target) => isColumn(target.data));
          if (columnTarget === undefined || !isColumn(columnTarget.data)) return;
          const cardTarget = targets.find((target) => isCard(target.data));
          const status = columnTarget.data.status;
          const current = latest.current;
          const columnIndex = current.view.columns.findIndex((column) => column.status === status);
          const order = (current.view.lanes[0]?.cells[columnIndex] ?? []).map((card) => card.id);
          const outcome = dropOutcome(
            { kind: "card", id: source.data.id, status: source.data.status },
            status,
            cardTarget !== undefined && isCard(cardTarget.data)
              ? { id: cardTarget.data.id, edge: extractClosestEdge(cardTarget.data) }
              : undefined,
            order,
          );
          if (outcome?.kind === "move") current.onMove(source.data.id, outcome.to);
          if (outcome?.kind === "reorder" && current.rank) {
            current.onReorder(source.data.id, outcome.index);
          }
        },
      }),
    [],
  );

  return (
    <div className="bu-board" aria-busy={view.loading}>
      {view.columns.map((header, i) => (
        <Column key={header.status} header={header} cards={cells[i] ?? []} props={props} />
      ))}
    </div>
  );
}
