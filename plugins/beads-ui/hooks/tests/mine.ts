import list from "../../core/test/fixtures/bd-list-all-brief.json.ts";
import { ok, STORE_LIST, type WorldOptions } from "./world.ts";

// The task panel's session (Phase 2B): the fixture store with some of its tasks this session's.

export const ME = "ops-vm-3";

/**
 * The fixture store with fifteen tasks of this session's: BU-mg2 and BU-mg2.3 in progress,
 * BU-mg2.3.9 blocked, and twelve open; every other issue is someone else's or closed.
 */
export const MINE_OPEN = [
  "BU-mg2.3.1",
  "BU-mg2.3.2",
  "BU-mg2.3.3",
  "BU-mg2.3.4",
  "BU-mg2.3.5",
  "BU-mg2.3.6",
  "BU-mg2.3.7",
  "BU-mg2.3.8",
  "BU-mg2.3.10",
  "BU-mg2.6",
  "BU-mg2.7",
  "BU-2zw",
];
/** The order the Tasks view lists them: in progress, blocked, open; then priority, then age. */
export const MINE_ORDER = ["BU-mg2", "BU-mg2.3", "BU-mg2.3.9", ...MINE_OPEN];

export const ownStore = () =>
  (JSON.parse(list) as Record<string, unknown>[]).map((row) => {
    const id = String(row.id);
    if (id === "BU-mg2.3.9") return { ...row, status: "blocked", assignee: ME };
    if (id === "BU-mg2" || id === "BU-mg2.3" || MINE_OPEN.includes(id)) {
      return { ...row, assignee: ME };
    }
    return row;
  });

export const MINE: WorldOptions = {
  env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: ME },
  script: (key) => (key === STORE_LIST ? ok(JSON.stringify(ownStore())) : undefined),
};
