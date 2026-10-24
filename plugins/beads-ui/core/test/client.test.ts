// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  type ActionContext,
  clientKeys,
  DEFAULT_PANEL_SETTINGS,
  menuView,
  parseTaskMessage,
  taskClientProps,
  taskListView,
} from "../src/index.ts";
import { allIssues, storeStatuses } from "./helpers.ts";

// The task list's Client props and posts (T-2B.5, D-31): the same rows and keys the element tree
// draws, and every post read as untrusted input.

const CTX: ActionContext = {
  view: "tasks",
  mine: false,
  swimlane: "none",
  sort: "priority",
  undo: false,
  paged: false,
  lanesPaged: false,
  bandSettings: true,
};

const list = () =>
  taskListView(allIssues(), {
    statuses: storeStatuses(),
    settings: DEFAULT_PANEL_SETTINGS,
    expanded: false,
    width: 40,
  });

describe("the task list's Client props", () => {
  test("should hand the Client the element tree's rows and every key the options menu lists", () => {
    const view = list();
    const props = taskClientProps(view, CTX, { selectedColor: "permission" });

    expect(props.rows).toEqual(view.rows.map((row) => ({ id: row.id, label: row.label })));
    const menuKeys = menuView(CTX)
      .sections.flatMap((section) => section.items)
      .map((item) => item.hotkey)
      .filter((key) => key !== "");
    expect(props.keys.map((key) => key.key).sort()).toEqual([...new Set(menuKeys)].sort());
    expect(clientKeys(CTX)).toEqual(props.keys);
  });

  test("should leave room under the menu's row only when that row is drawn", () => {
    const view = list();
    const first = view.rows[0]?.id ?? "";

    expect(
      taskClientProps(view, CTX, { gapAfter: first, gapRows: 9, selectedColor: "x" }),
    ).toMatchObject({
      gapAfter: first,
      gapRows: 9,
    });
    const absent = taskClientProps(view, CTX, { gapAfter: "nope", gapRows: 9, selectedColor: "x" });
    expect(absent.gapAfter).toBeUndefined();
    expect(absent.gapRows).toBe(0);
  });
});

describe("a Client's post", () => {
  const props = () => taskClientProps(list(), CTX, { selectedColor: "x" });

  test("should read select, open, menu and run about a row the Client was handed", () => {
    const p = props();
    const id = p.rows[0]?.id ?? "";

    expect(parseTaskMessage({ kind: "select", id }, p)).toEqual({ kind: "select", id });
    expect(parseTaskMessage({ kind: "open", id }, p)).toEqual({ kind: "open", id });
    expect(parseTaskMessage({ kind: "menu", id, x: 7 }, p)).toEqual({ kind: "menu", id, x: 7 });
    expect(parseTaskMessage({ kind: "run", id, command: "card.move" }, p)).toEqual({
      kind: "run",
      id,
      command: "card.move",
    });
    expect(parseTaskMessage({ kind: "run", command: "tab.board" }, p)).toEqual({
      kind: "run",
      command: "tab.board",
    });
  });

  test("should drop a post about another row, an unknown kind or command, or not an object", () => {
    const p = props();
    const id = p.rows[0]?.id ?? "";

    expect(parseTaskMessage({ kind: "open", id: "BU-not-drawn" }, p)).toBeUndefined();
    expect(parseTaskMessage({ kind: "close", id }, p)).toBeUndefined();
    expect(parseTaskMessage({ kind: "run", id, command: "rm -rf" }, p)).toBeUndefined();
    expect(
      parseTaskMessage({ kind: "run", id: "BU-not-drawn", command: "card.move" }, p),
    ).toBeUndefined();
    expect(parseTaskMessage("open", p)).toBeUndefined();
    expect(parseTaskMessage([id], p)).toBeUndefined();
    expect(parseTaskMessage({ kind: "menu", id, x: -3 }, p)).toEqual({ kind: "menu", id, x: 0 });
  });
});
