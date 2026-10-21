import type { Issue, Status } from "../src/index.ts";
import { parseBdList, parseBdStatuses } from "../src/index.ts";
import listAllBrief from "./fixtures/bd/list-all-brief.ts";
import statuses from "./fixtures/bd/statuses.ts";

export function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
}

/** `bd list --json --all --brief --limit 0`, the board's own read (listArgv). */
export const allIssues = (): Issue[] => unwrap(parseBdList(listAllBrief));
export const storeStatuses = (): Status[] => unwrap(parseBdStatuses(statuses));

export const byId = (issues: readonly Issue[], id: string): Issue => {
  const issue = issues.find((candidate) => candidate.id === id);
  if (issue === undefined) throw new Error(`fixture has no ${id}`);
  return issue;
};

export const ids = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);
