import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  type SprintPickerEntry,
  type SprintSelection,
  type SprintView as SprintViewModel,
  sprintSelectionText,
} from "@beads-ui/core";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type SprintMode = "board" | "list";

export interface SprintViewProps {
  /** Core's Sprint view model (sprintView): the picker and the selected sprint. */
  view: SprintViewModel;
  mode: SprintMode;
  onMode(mode: SprintMode): void;
  onSelect(selection: SprintSelection): void;
  /**
   * A card or row dropped on a picker entry: move issue `id` (as the page keys it) to that
   * sprint or the backlog, `backlog` or `sprint:<name>`.
   */
  onDropTo(id: string, to: string): void;
  /** The selected issues, drawn as the Board or as the list. */
  children: ReactNode;
}

/** The drag payloads a picker entry takes: a Board card or a list row. */
const draggedId = (data: Record<string | symbol, unknown>): string | undefined =>
  (data.kind === "card" || data.kind === "row") && typeof data.id === "string"
    ? data.id
    : undefined;

function PickerEntry({
  entry,
  onSelect,
  onDropTo,
}: {
  entry: SprintPickerEntry;
  onSelect(selection: SprintSelection): void;
  onDropTo(id: string, to: string): void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [over, setOver] = useState(false);
  const to = sprintSelectionText(entry.selection);
  const latest = useRef(onDropTo);
  latest.current = onDropTo;
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => draggedId(source.data) !== undefined,
      getData: () => ({ kind: "sprint-target", to }),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: ({ source }) => {
        setOver(false);
        const id = draggedId(source.data);
        if (id !== undefined) latest.current(id, to);
      },
    });
  }, [to]);
  const dates = [entry.startsAt?.slice(0, 10), entry.dueAt?.slice(0, 10)].filter(Boolean);
  return (
    <button
      ref={ref}
      type="button"
      className="bu-button bu-sprint-entry"
      data-sprint={to}
      data-over={over || undefined}
      aria-pressed={entry.selected}
      onClick={() => onSelect(entry.selection)}
    >
      <span className="bu-sprint-name">{entry.label}</span>{" "}
      <span className="bu-sprint-count">{entry.count}</span>
      {dates.length > 0 && <span className="bu-dim"> {dates.join(" to ")}</span>}
    </button>
  );
}

/**
 * The Sprint view (web app design T-W1.0): a picker of the backlog and every open sprint, and
 * the selected one's issues as a board or as a list. Dropping a card or a row on a picker entry
 * moves it there; the Move to menu and the command palette do the same without a drag.
 */
export function SprintView(props: SprintViewProps) {
  const { view } = props;
  const heading = view.selection.kind === "backlog" ? "Backlog" : `Sprint ${view.selection.name}`;
  return (
    <div className="bu-sprint-view">
      <nav className="bu-sprint-picker" aria-label="Sprints">
        {view.picker.map((entry) => (
          <PickerEntry
            key={sprintSelectionText(entry.selection)}
            entry={entry}
            onSelect={props.onSelect}
            onDropTo={props.onDropTo}
          />
        ))}
      </nav>
      <div className="bu-sprint-head">
        <h1 className="bu-sprint-title">{heading}</h1>
        {view.sprint !== undefined && (view.sprint.startsAt ?? view.sprint.dueAt) !== undefined && (
          <p className="bu-dim">
            {view.sprint.startsAt?.slice(0, 10) ?? "no start"} to{" "}
            {view.sprint.dueAt?.slice(0, 10) ?? "no due date"}
          </p>
        )}
        <fieldset className="bu-sprint-mode">
          <legend className="bu-visually-hidden">Show as</legend>
          {(["board", "list"] as const).map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name="bu-sprint-mode"
                value={mode}
                checked={props.mode === mode}
                onChange={() => props.onMode(mode)}
              />{" "}
              {mode === "board" ? "Board" : "List"}
            </label>
          ))}
        </fieldset>
      </div>
      {props.children}
    </div>
  );
}
