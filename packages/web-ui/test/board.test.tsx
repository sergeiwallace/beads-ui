import {
  boardView,
  INITIAL_BOARD_STATE,
  type Issue,
  RANK_KEY,
  reduceBoard,
  type Status,
} from "@beads-ui/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Board, type BoardProps, dropOutcome } from "../src/index.ts";

afterEach(cleanup);

const STATUSES: Status[] = [
  { name: "open", category: "active", builtin: true },
  { name: "in_progress", category: "wip", builtin: true },
  { name: "blocked", category: "wip", builtin: true },
  { name: "deferred", category: "frozen", builtin: true },
  { name: "closed", category: "done", builtin: true },
];

function issue(id: string, status: string, rank?: string): Issue {
  return {
    id,
    title: `Title of ${id}`,
    status,
    priority: 2,
    type: "task",
    labels: [],
    dependencies: [],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    metadata: rank === undefined ? {} : { [RANK_KEY]: rank },
  };
}

function renderBoard(issues: Issue[], overrides: Partial<BoardProps> = {}) {
  const state = reduceBoard(INITIAL_BOARD_STATE, {
    type: "load-succeeded",
    issues,
    statuses: STATUSES,
    at: "2026-11-09T05:00:00",
  });
  const props: BoardProps = {
    view: boardView(state, { columnWidth: 10_000, rank: true }),
    rank: true,
    onSelect: vi.fn(),
    issueHref: (id) => `/issues/${id}`,
    onOpen: vi.fn(),
    onMove: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  };
  render(<Board {...props} />);
  return props;
}

describe("Board", () => {
  it("should draw one column per bd status in core's order, each holding its cards", () => {
    renderBoard([issue("t-1", "open"), issue("t-2", "blocked"), issue("t-3", "closed")]);

    const columns = screen.getAllByRole("region");
    expect(columns.map((column) => column.getAttribute("data-status"))).toEqual([
      "open",
      "in_progress",
      "blocked",
      "deferred",
      "closed",
    ]);
    expect(within(columns[2] as HTMLElement).getByText("Title of t-2")).toBeTruthy();
  });

  it("should move a card to the status picked from its Move to menu", async () => {
    const props = renderBoard([issue("t-1", "open")]);

    await userEvent.click(screen.getByRole("button", { name: "Move t-1 to" }));
    const items = (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
    expect(items).toEqual([
      "in_progress",
      "blocked",
      "deferred",
      "closed",
      "Up one place",
      "Down one place",
    ]);
    await userEvent.click(screen.getByRole("menuitem", { name: "blocked" }));

    expect(props.onMove).toHaveBeenCalledWith("t-1", "blocked");
  });

  it("should reorder a card one place down from its menu when rank is on", async () => {
    const props = renderBoard([issue("t-a", "open", "a0"), issue("t-b", "open", "a1")]);

    await userEvent.click(screen.getByRole("button", { name: "Move t-a to" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Down one place" }));

    expect(props.onReorder).toHaveBeenCalledWith("t-a", 1);
  });

  it("should offer no reorder in the menu when rank is off", async () => {
    renderBoard([issue("t-1", "open")], { rank: false });

    await userEvent.click(screen.getByRole("button", { name: "Move t-1 to" }));

    expect(await screen.findAllByRole("menuitem")).toHaveLength(4);
    expect(screen.queryByRole("menuitem", { name: "Up one place" })).toBeNull();
  });
});

describe("dropOutcome", () => {
  const order = ["t-a", "t-b", "t-c"];
  const source = { kind: "card" as const, id: "t-c", status: "open" };

  it("should make a drop on another column a status move", () => {
    expect(dropOutcome(source, "in_progress", undefined, order)).toEqual({
      kind: "move",
      to: "in_progress",
    });
  });

  it("should make a drop on a card's top edge in its own column the slot before that card", () => {
    expect(dropOutcome(source, "open", { id: "t-b", edge: "top" }, order)).toEqual({
      kind: "reorder",
      index: 1,
    });
    expect(dropOutcome(source, "open", { id: "t-a", edge: "bottom" }, order)).toEqual({
      kind: "reorder",
      index: 1,
    });
  });

  it("should do nothing for a drop on its own column's background or on itself", () => {
    expect(dropOutcome(source, "open", undefined, order)).toBeUndefined();
    expect(dropOutcome(source, "open", { id: "t-c", edge: "top" }, order)).toBeUndefined();
  });
});
