import { beadsSessionsView, type Issue, queueSessionsView } from "@beads-ui/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Sessions } from "../src/index.ts";

afterEach(cleanup);

const NOW = Date.parse("2026-11-09T12:00:00Z");
const STATUSES = [
  { name: "open", category: "active", builtin: true },
  { name: "in_progress", category: "wip", builtin: true },
  { name: "closed", category: "done", builtin: true },
] as const;

const issue = (id: string, fields: Partial<Issue>): Issue => ({
  id,
  title: `title of ${id}`,
  status: "open",
  priority: 2,
  type: "task",
  labels: [],
  dependencies: [],
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  metadata: {},
  ...fields,
});

describe("Sessions (T-3.4)", () => {
  it("should show the queue's state, current task, heartbeat and claim age for every session", () => {
    const view = queueSessionsView({
      sessions: [
        {
          id: "host-a/session-1",
          machine: "host-a",
          name: "session-1",
          state: "busy",
          lastHeartbeatAt: "2026-11-09T11:59:00Z",
        },
        { id: "host-a/session-2", machine: "host-a", name: "session-2", state: "gone" },
      ],
      tasks: [
        {
          repo: "elsewhere",
          taskId: "x-1",
          title: "Remote task",
          queueState: "active",
          ownerSession: "host-a/session-1",
        },
      ],
      claims: { "elsewhere/x-1": "2026-11-09T11:00:00Z" },
      issues: [],
      store: "demo",
      statuses: [...STATUSES],
      now: NOW,
    });

    render(<Sessions view={view} issueHref={() => undefined} />);

    expect(screen.getByRole("status").textContent).toBe(
      "1 of 2 sessions in the work queue's registry are live.",
    );
    const busy = screen.getByRole("row", { name: /session-1/ });
    const cells = within(busy)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells).toEqual(["host-a", "busy", "x-1 Remote task in elsewhere", "1m ago", "1h", "0"]);
    expect(screen.getByRole("row", { name: /session-2/ }).getAttribute("data-state")).toBe("gone");
  });

  it("should leave out state and heartbeat and say liveness is unavailable without the queue", () => {
    const view = beadsSessionsView(
      [issue("demo-1", { status: "in_progress", assignee: "host-a/session-1" })],
      { statuses: [...STATUSES], now: NOW },
    );

    render(
      <Sessions
        view={view}
        queueError={{
          source: "GET /api/queue/sessions",
          message: "could not reach the work queue",
        }}
        issueHref={(row) => `/issues/${row.currentTask?.id}`}
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(/^Liveness is unavailable/);
    expect(screen.queryByRole("columnheader", { name: "State" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Last heartbeat" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("GET /api/queue/sessions");
    expect(screen.getByRole("link").getAttribute("href")).toBe("/issues/demo-1");
  });
});
