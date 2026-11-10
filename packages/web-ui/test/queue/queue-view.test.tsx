import type { QueueFilters } from "@beads-ui/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type QueueRowView, QueueView, type QueueViewProps } from "../../src/index.ts";

afterEach(cleanup);

function row(
  id: string,
  fields: Partial<QueueRowView> & { epic?: string; size?: number },
): QueueRowView {
  const { epic, size, ...rest } = fields;
  return {
    key: `repo-a:${id}`,
    id,
    displayId: id,
    repository: "repo-a",
    title: `Title of ${id}`,
    type: "task",
    status: "open",
    priority: 2,
    blocked: false,
    blockers: [],
    entry: {
      key: `task:repo-a:${id}`,
      id,
      action: "prompt",
      source: "task",
      kind: "task",
      title: `Title of ${id}`,
      goals: [],
      type: rest.type ?? "task",
      repo: "repo-a",
      ...(epic === undefined ? {} : { epic }),
      ...(size === undefined ? {} : { size }),
    },
    ...rest,
  };
}

const ROWS = [
  row("t-1", { priority: 0, epic: "e-1" }),
  row("t-2", {
    priority: 1,
    status: "blocked",
    blocked: true,
    blockNote: "waiting on the vendor",
    epic: "e-2",
  }),
  row("t-3", {
    priority: 2,
    blocked: true,
    blockers: [{ id: "t-1", title: "Title of t-1" }],
    size: 3,
  }),
];

function renderQueue(overrides: Partial<QueueViewProps> = {}) {
  const props: QueueViewProps = {
    rows: ROWS,
    order: { kind: "queue", label: "the work queue's order" },
    filters: {},
    onFilters: vi.fn(),
    blocked: false,
    onBlocked: vi.fn(),
    issueHref: (one) => `/issues/${one.id}`,
    onOpen: vi.fn(),
    ...overrides,
  };
  render(<QueueView {...props} />);
  return props;
}

const shownIds = () =>
  [...document.querySelectorAll(".bu-queue-row")].map((node) => node.getAttribute("data-row-key"));

describe("QueueView", () => {
  it("should list every row in the order it was read and say which order that is", () => {
    renderQueue();

    expect(shownIds()).toEqual(["repo-a:t-1", "repo-a:t-2", "repo-a:t-3"]);
    expect(screen.getByRole("status").textContent).toBe("Ordered by the work queue's order");
  });

  it("should say the order is by priority and name the failed queue read when it could not be read", () => {
    renderQueue({
      order: {
        kind: "priority",
        label: "priority: the work queue's order could not be read",
        error: { source: "GET /api/queue/tasks", message: "the work queue answered 500" },
      },
    });

    expect(screen.getByRole("status").textContent).toBe(
      "Ordered by priority: the work queue's order could not be read (GET /api/queue/tasks: the work queue answered 500)",
    );
  });

  it("should show each blocked task's blocker", () => {
    renderQueue({ rows: ROWS.filter((one) => one.blocked), blocked: true });

    const blockers = [...document.querySelectorAll(".bu-blocker")].map((node) => node.textContent);
    expect(blockers).toEqual(["Blocked by waiting on the vendor", "Blocked by t-1 Title of t-1"]);
  });

  it("should ask for the blocked filter when the box is ticked", async () => {
    const props = renderQueue();

    await userEvent.click(screen.getByRole("checkbox", { name: "Blocked only" }));

    expect(props.onBlocked).toHaveBeenCalledWith(true);
  });

  it("should apply the filters it is given and hand a change back to be encoded in the URL", async () => {
    const filters: QueueFilters = { epic: ["e-2"] };
    const props = renderQueue({ filters });

    expect(shownIds()).toEqual(["repo-a:t-2"]);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by size" }), "3");

    expect(props.onFilters).toHaveBeenCalledWith({ epic: ["e-2"], size: ["3"] });
  });
});
