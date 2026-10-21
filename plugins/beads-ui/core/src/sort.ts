import type { Issue, Result } from "./model.ts";

export const SORT_KEYS = ["priority", "created", "updated", "due", "assignee"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

export interface SortSpec {
  key: SortKey;
  direction: SortDirection;
}

/** D-6: no manual rank in the MVP; priority then created is the default order. */
export const DEFAULT_SORT: SortSpec = { key: "priority", direction: "asc" };

export interface SortError {
  kind: "unknown-sort";
  text: string;
  acceptedKeys: readonly SortKey[];
}

function time(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

// Missing values sort last in both directions, so a descending sort never floats blanks to the top.
function compareOptional<T extends string | number>(
  a: T | undefined,
  b: T | undefined,
  sign: number,
): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (a < b) return -sign;
  if (a > b) return sign;
  return 0;
}

function byCreated(a: Issue, b: Issue): number {
  return compareOptional(time(a.createdAt), time(b.createdAt), 1);
}

/** Returns a new, stably sorted array; ties keep their input order. */
export function sortIssues(issues: readonly Issue[], spec: SortSpec = DEFAULT_SORT): Issue[] {
  const sign = spec.direction === "asc" ? 1 : -1;
  const compare = (a: Issue, b: Issue): number => {
    switch (spec.key) {
      case "priority":
        return compareOptional(a.priority, b.priority, sign) || byCreated(a, b);
      case "created":
        return compareOptional(time(a.createdAt), time(b.createdAt), sign);
      case "updated":
        return compareOptional(time(a.updatedAt), time(b.updatedAt), sign);
      case "due":
        return compareOptional(time(a.dueAt), time(b.dueAt), sign);
      case "assignee":
        return compareOptional(a.assignee, b.assignee, sign);
    }
  };
  return [...issues].sort(compare);
}

/** Reads a persisted sort preference such as `due` or `created:desc`. */
export function parseSort(text: string): Result<SortSpec, SortError> {
  const [key, direction = "asc", ...rest] = text.trim().split(":");
  const match = SORT_KEYS.find((candidate) => candidate === key);
  if (match === undefined || (direction !== "asc" && direction !== "desc") || rest.length > 0) {
    return { ok: false, error: { kind: "unknown-sort", text, acceptedKeys: SORT_KEYS } };
  }
  return { ok: true, value: { key: match, direction } };
}
