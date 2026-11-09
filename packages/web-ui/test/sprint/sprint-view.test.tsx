import {
  backlogView,
  EMPTY_FILTER_STATE,
  type Issue,
  type Priority,
  RANK_KEY,
  type Status,
  sprintView,
} from "@beads-ui/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Backlog,
  type BacklogProps,
  listView,
  planListRank,
  SprintView,
  stepIndex,
} from "../../src/index.ts";

afterEach(cleanup);

const STATUSES: Status[] = [
  { name: "open", category: "active", builtin: true },
  { name: "in_progress", category: "wip", builtin: true },
  { name: "closed", category: "done", builtin: true },
];

function issue(id: string, fields: Partial<Issue> & { rank?: string } = {}): Issue {
  const { rank, ...rest } = fields;
  return {
    id,
    title: `Title of ${id}`,
    status: "open",
    priority: 2,
    type: "task",
    labels: [],
    dependencies: [],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    metadata: rank === undefined ? {} : { [RANK_KEY]: rank },
    ...rest,
  };
}

const ISSUES = [
  issue("t-1", { labels: ["sprint:s1"] }),
  issue("t-2", { labels: ["sprint:s1"], status: "closed" }),
  issue("t-3"),
  issue("m-1", {
    type: "milestone",
    title: "Sprint s1",
    dueAt: "2026-11-20T00:00:00Z",
    metadata: { "sprint.starts_at": "2026-11-06" },
  }),
  issue("m-2", { type: "milestone", title: "Sprint s0", status: "closed" }),
];

describe("SprintView", () => {
  it("should offer the backlog and every open sprint in its picker and list the selected sprint's issues", async () => {
    const view = sprintView(ISSUES, {
      statuses: STATUSES,
      selection: { kind: "sprint", name: "s1" },
    });
    const onSelect = vi.fn();
    render(
      <SprintView view={view} mode="list" onMode={vi.fn()} onSelect={onSelect} onDropTo={vi.fn()}>
        <ol>
          {view.list.map((one) => (
            <li key={one.id}>{one.id}</li>
          ))}
        </ol>
      </SprintView>,
    );

    const picker = screen.getByRole("navigation", { name: "Sprints" });
    const entries = within(picker).getAllByRole("button");
    expect(entries.map((entry) => entry.getAttribute("data-sprint"))).toEqual([
      "backlog",
      "sprint:s1",
    ]);
    expect(entries[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Sprint s1" })).toBeTruthy();
    expect(document.querySelector(".bu-sprint-head .bu-dim")?.textContent).toBe(
      "2026-11-06 to 2026-11-20",
    );
    expect(view.list.map((one) => one.id)).toEqual(["t-1", "t-2"]);

    await userEvent.click(entries[0] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith({ kind: "backlog" });
  });

  it("should switch between the board and the list", async () => {
    const view = sprintView(ISSUES, { statuses: STATUSES, selection: { kind: "backlog" } });
    const onMode = vi.fn();
    render(
      <SprintView view={view} mode="board" onMode={onMode} onSelect={vi.fn()} onDropTo={vi.fn()}>
        <p>drawn</p>
      </SprintView>,
    );

    await userEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(onMode).toHaveBeenCalledWith("list");
  });
});

describe("list reorder and sprint moves on a row", () => {
  const ROWS = [
    issue("r-1", { priority: 1, rank: "a0" }),
    issue("r-2", { priority: 1, rank: "a1" }),
    issue("r-3", { priority: 1, rank: "a2" }),
    issue("r-4", { priority: 2, rank: "a0" }),
  ];

  function renderList(overrides: Partial<BacklogProps> = {}) {
    const props: BacklogProps = {
      view: backlogView(ROWS, {
        statuses: STATUSES,
        filter: EMPTY_FILTER_STATE,
        titleWidth: 10_000,
        rank: true,
      }),
      issue: (id) => ROWS.find((one) => one.id === id),
      statuses: ["open", "in_progress", "closed"],
      pending: new Set(),
      issueHref: (id) => `/issues/${id}`,
      onOpen: vi.fn(),
      onStatus: vi.fn(),
      onPriority: vi.fn(),
      onStep: vi.fn(),
      sprintTargets: () => [
        { to: "sprint:s1", label: "Sprint s1" },
        { to: "backlog", label: "Backlog" },
      ],
      onSprint: vi.fn(),
      ...overrides,
    };
    render(<Backlog {...props} />);
    return props;
  }

  it("should move a row one place by its keyboard-reachable Up and Down buttons", async () => {
    const props = renderList();

    await userEvent.click(screen.getByRole("button", { name: "Move r-2 up one place" }));
    await userEvent.click(screen.getByRole("button", { name: "Move r-2 down one place" }));

    expect(props.onStep).toHaveBeenNthCalledWith(1, "r-2", -1);
    expect(props.onStep).toHaveBeenNthCalledWith(2, "r-2", 1);
  });

  it("should move a row to a sprint from its Move to menu, without a drag", async () => {
    const props = renderList();

    await userEvent.click(screen.getByRole("button", { name: "Move r-1 to" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Sprint s1" }));

    expect(props.onSprint).toHaveBeenCalledWith("r-1", "sprint:s1");
  });

  it("should plan a key between the new neighbours among the rows of the same priority", () => {
    const index = stepIndex(ROWS, "r-3", -1);
    expect(index).toBe(1);
    const plan = planListRank(ROWS, "r-3", index ?? 0, () => 0.5);

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value).toMatchObject({ above: "r-1", below: "r-2", shown: "open", priority: 1 });
    expect("a0" < plan.value.key && plan.value.key < "a1").toBe(true);
  });

  it("should refuse a step past the end of its priority's rows and a reorder to where it already is", () => {
    expect(stepIndex(ROWS, "r-3", 1)).toBeUndefined();
    expect(stepIndex(ROWS, "r-4", -1)).toBeUndefined();
    const same = planListRank(ROWS, "r-2", 1, () => 0.5);
    expect(same).toMatchObject({ ok: false, error: { kind: "same-place" } });
  });

  it("should draw a sprint's issues, closed ones included, as list rows", () => {
    const rows = listView([
      issue("x-1", { priority: 0 as Priority }),
      issue("x-2", { status: "closed" }),
    ]).rows;
    expect(rows.map((row) => [row.id, row.priority])).toEqual([
      ["x-1", "P0"],
      ["x-2", "P2"],
    ]);
  });
});
