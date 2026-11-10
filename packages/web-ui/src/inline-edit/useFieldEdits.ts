import { useCallback, useRef, useState } from "react";
import { type ToastKind, useNotify } from "../Toasts.tsx";

/** The fields an inline edit writes. */
export type EditField = "priority" | "status" | "owner";

export const FIELD_LABELS: Readonly<Record<EditField, string>> = {
  priority: "Priority",
  status: "Status",
  owner: "Owner",
};

/** What a refused write says: a conflict (the stored value changed), or another refusal. */
export interface Refusal {
  conflict: boolean;
  message: string;
  /** A refusal that is not a failure, such as an owner change that needs a handoff. */
  kind?: ToastKind;
}

export interface FieldEdits {
  /** The value to draw: the one being written while its write runs, else the stored one. */
  shown<T>(id: string, field: EditField, stored: T): T;
  /** Whether any of the issue's fields has a write in flight. */
  busy(id: string): boolean;
  /**
   * Draws `value` at once and runs `write`. On success the value stays until `reload` has read
   * the store again; on any refusal it rolls back to the stored value, and a conflict says which
   * field it was.
   */
  edit(
    id: string,
    label: string,
    field: EditField,
    value: unknown,
    write: () => Promise<unknown>,
  ): void;
}

const keyOf = (id: string, field: EditField) => `${id}\u0000${field}`;

/**
 * Inline edits of priority, status and owner (web app design T-W1.0): the new value shows while
 * the guarded write runs, and a conflict rolls back to the stored value with a notice naming the
 * field.
 */
export function useFieldEdits(
  describe: (error: unknown) => Refusal,
  reload: () => Promise<unknown>,
): FieldEdits {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, unknown>>(new Map());
  const notify = useNotify();
  const latest = useRef({ describe, reload });
  latest.current = { describe, reload };

  const drop = useCallback((key: string) => {
    setOverrides((current) => {
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  }, []);

  const shown = useCallback(
    <T>(id: string, field: EditField, stored: T): T => {
      const key = keyOf(id, field);
      return overrides.has(key) ? (overrides.get(key) as T) : stored;
    },
    [overrides],
  );

  const busy = useCallback(
    (id: string) => [...overrides.keys()].some((key) => key.startsWith(`${id}\u0000`)),
    [overrides],
  );

  const edit = useCallback(
    (
      id: string,
      label: string,
      field: EditField,
      value: unknown,
      write: () => Promise<unknown>,
    ) => {
      const key = keyOf(id, field);
      setOverrides((current) => new Map(current).set(key, value));
      const name = FIELD_LABELS[field];
      write().then(
        async () => {
          await latest.current.reload().catch(() => undefined);
          drop(key);
        },
        (error: unknown) => {
          drop(key);
          const refusal = latest.current.describe(error);
          if (refusal.conflict) {
            notify(
              "conflict",
              `${name} not written: changed elsewhere`,
              `${label}'s ${name.toLowerCase()} changed before this edit was written; showing the stored value. ${refusal.message}`,
            );
          } else {
            notify(refusal.kind ?? "error", `${name} not written`, refusal.message);
          }
          void latest.current.reload().catch(() => undefined);
        },
      );
    },
    [drop, notify],
  );

  return { shown, busy, edit };
}
