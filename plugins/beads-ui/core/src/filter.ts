import type { Issue, Result } from "./model.ts";

export const FILTER_KEYS = ["type", "label", "assignee", "sprint", "ready"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export interface FilterTerm {
  key: FilterKey;
  value: string;
}

/** Whitespace-separated `key:value` terms, ANDed. */
export interface Filter {
  terms: FilterTerm[];
}

export const EMPTY_FILTER: Filter = { terms: [] };

export type FilterError =
  | { kind: "unknown-key"; key: string; acceptedKeys: readonly FilterKey[] }
  | { kind: "malformed-term"; term: string; acceptedKeys: readonly FilterKey[] }
  | { kind: "invalid-value"; key: FilterKey; value: string; message: string };

export interface ReadySetMissing {
  kind: "ready-set-missing";
  message: string;
}

export function parseFilter(text: string): Result<Filter, FilterError> {
  const terms: FilterTerm[] = [];
  for (const term of text.split(/\s+/).filter((part) => part !== "")) {
    const colon = term.indexOf(":");
    if (colon <= 0) {
      return { ok: false, error: { kind: "malformed-term", term, acceptedKeys: FILTER_KEYS } };
    }
    const name = term.slice(0, colon);
    const value = term.slice(colon + 1);
    const key = FILTER_KEYS.find((candidate) => candidate === name);
    if (key === undefined) {
      return { ok: false, error: { kind: "unknown-key", key: name, acceptedKeys: FILTER_KEYS } };
    }
    if (value === "") {
      return {
        ok: false,
        error: { kind: "invalid-value", key, value, message: `${key}: needs a value` },
      };
    }
    if (key === "ready" && value !== "true" && value !== "false") {
      return {
        ok: false,
        error: { kind: "invalid-value", key, value, message: "ready: takes true or false" },
      };
    }
    terms.push({ key, value });
  }
  return { ok: true, value: { terms } };
}

function matches(issue: Issue, term: FilterTerm, readyIds: ReadonlySet<string>): boolean {
  switch (term.key) {
    case "type":
      return issue.type === term.value;
    case "label":
      return issue.labels.includes(term.value);
    case "assignee":
      return issue.assignee === term.value;
    case "sprint":
      return issue.labels.includes(`sprint:${term.value}`);
    case "ready":
      return readyIds.has(issue.id) === (term.value === "true");
  }
}

/**
 * Keeps the issues every term matches. `ready:` reads the set of ids `bd ready --json` returned
 * (open, with no open blocking dependency), which the surface supplies.
 */
export function applyFilter(
  issues: readonly Issue[],
  filter: Filter,
  context: { readyIds?: ReadonlySet<string> } = {},
): Result<Issue[], ReadySetMissing> {
  const { readyIds } = context;
  const needsReady = filter.terms.some((term) => term.key === "ready");
  if (needsReady && readyIds === undefined) {
    return {
      ok: false,
      error: { kind: "ready-set-missing", message: "ready: needs the bd ready result" },
    };
  }
  const ready = readyIds ?? new Set<string>();
  return {
    ok: true,
    value: issues.filter((issue) => filter.terms.every((term) => matches(issue, term, ready))),
  };
}

/** What the filter Input holds: the last text, the last filter that parsed, and any error. */
export interface FilterState {
  text: string;
  filter: Filter;
  error?: FilterError;
}

export const EMPTY_FILTER_STATE: FilterState = { text: "", filter: EMPTY_FILTER };

/** Submits new filter text. A text that does not parse keeps the previous filter, so the list does not change. */
export function submitFilter(state: FilterState, text: string): FilterState {
  const parsed = parseFilter(text);
  if (!parsed.ok) return { text, filter: state.filter, error: parsed.error };
  return { text, filter: parsed.value };
}

export function describeFilterError(error: FilterError): string {
  const accepted = `accepted keys: ${FILTER_KEYS.join(", ")}`;
  switch (error.kind) {
    case "unknown-key":
      return `unknown filter key "${error.key}"; ${accepted}`;
    case "malformed-term":
      return `"${error.term}" is not key:value; ${accepted}`;
    case "invalid-value":
      return error.message;
  }
}
