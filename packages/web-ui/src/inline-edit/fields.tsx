import { type Priority, priorityToken } from "@beads-ui/core";
import { tokenVar } from "../tokens.ts";

export const PRIORITIES: readonly Priority[] = [0, 1, 2, 3, 4];

export interface PriorityEditProps {
  /** How the issue reads to a screen reader, such as its display id. */
  issueLabel: string;
  value: Priority;
  disabled?: boolean;
  onChange(priority: Priority): void;
}

/** An issue's priority, written in place on a card, a list row or a detail. */
export function PriorityEdit({ issueLabel, value, disabled, onChange }: PriorityEditProps) {
  return (
    <select
      className="bu-select bu-priority-edit"
      aria-label={`Priority of ${issueLabel}`}
      style={{ color: tokenVar(priorityToken(value)) }}
      value={value}
      disabled={disabled === true}
      onChange={(event) => onChange(Number(event.target.value) as Priority)}
    >
      {PRIORITIES.map((priority) => (
        <option key={priority} value={priority}>
          P{priority}
        </option>
      ))}
    </select>
  );
}

export interface StatusEditProps {
  issueLabel: string;
  value: string;
  /** Every status, in column order. */
  statuses: readonly string[];
  disabled?: boolean;
  onChange(status: string): void;
}

/** An issue's status, written in place. */
export function StatusEdit({ issueLabel, value, statuses, disabled, onChange }: StatusEditProps) {
  return (
    <select
      className="bu-select bu-status-edit"
      aria-label={`Status of ${issueLabel}`}
      value={value}
      disabled={disabled === true}
      onChange={(event) => onChange(event.target.value)}
    >
      {statuses.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}
