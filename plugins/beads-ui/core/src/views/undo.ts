import { moveArgv } from "../argv.ts";
import type { BdArgv, Status } from "../model.ts";
import { truncate } from "./text.ts";

/** The status `bd close` writes. */
export const CLOSED_STATUS = "closed";

/**
 * The first rung of the D-13 ladder: a close is undone by writing back the status the issue had,
 * through the same guarded write a move uses, so an issue someone changed meanwhile is left alone
 * (bd exits 13).
 */
export interface UndoClose {
  id: string;
  /** The display id, else the hash id. */
  label: string;
  previous: string;
  closed: string;
}

/** The undo for a close, or undefined when the issue was already in that status. */
export function undoClose(input: UndoClose): UndoClose | undefined {
  return input.previous === input.closed ? undefined : { ...input };
}

/**
 * The undo a Move to leaves: present when the move took the issue from a status outside the
 * `done` category into one inside it.
 */
export function undoForMove(
  statuses: readonly Status[],
  move: { id: string; label: string; from: string; to: string },
): UndoClose | undefined {
  const category = (name: string) => statuses.find((status) => status.name === name)?.category;
  if (category(move.to) !== "done" || category(move.from) === "done") return undefined;
  return undoClose({ id: move.id, label: move.label, previous: move.from, closed: move.to });
}

/** `bd update <id> --status <previous> --if-status <closed>`. */
export function undoArgv(undo: UndoClose): BdArgv {
  return moveArgv(undo.id, undo.previous, undo.closed);
}

export interface UndoView {
  line: string;
  label: string;
  hotkey: string;
}

export function undoView(undo: UndoClose, width: number): UndoView {
  return {
    line: truncate(`${undo.label} is ${undo.closed}; u puts it back to ${undo.previous}`, width),
    label: "Undo close",
    hotkey: "u",
  };
}
