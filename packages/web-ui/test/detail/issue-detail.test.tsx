import type { Issue } from "@beads-ui/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IssueDetail } from "../../src/index.ts";

afterEach(cleanup);

const ISSUE: Issue = {
  id: "t-1",
  title: "A linked task",
  status: "open",
  priority: 2,
  type: "task",
  assignee: "session-a",
  labels: [],
  dependencies: [
    { type: "blocks", id: "t-2", title: "The blocker", status: "open" },
    { type: "relates-to", id: "g-1" },
  ],
  createdAt: "2026-11-01T09:30:00Z",
  updatedAt: "2026-11-02T10:00:00Z",
  startedAt: "2026-11-03T08:00:00Z",
  dueAt: "2026-11-20T00:00:00Z",
  description:
    "Plan with **bold** and <script>window.__detail = 1</script> and [bad](javascript:alert(1)).",
  metadata: {},
};

const field = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

describe("IssueDetail's T-W1.7 additions", () => {
  it("should show the issue's links and dates as read from its store", () => {
    render(
      <IssueDetail
        loading={false}
        issue={ISSUE}
        comments={[]}
        issueHref={(id) => `/issues/${id}`}
      />,
    );

    const links = [...document.querySelectorAll(".bu-link")].map((node) => node.textContent);
    expect(links).toEqual(["blocks t-2 The blocker (open)", "relates-to g-1"]);
    expect(screen.getByRole("link", { name: "t-2" }).getAttribute("href")).toBe("/issues/t-2");
    expect([field("Started"), field("Due")]).toEqual(["2026-11-03 08:00", "2026-11-20 00:00"]);
  });

  it("should render the description as Markdown with no raw HTML and an inert javascript: link", () => {
    const { container } = render(
      <IssueDetail
        loading={false}
        issue={ISSUE}
        comments={[]}
        issueHref={(id) => `/issues/${id}`}
      />,
    );

    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect((window as { __detail?: number }).__detail).toBeUndefined();
  });

  it("should draw the owner picker in the assignee's place when given one", () => {
    render(
      <IssueDetail
        loading={false}
        issue={ISSUE}
        comments={[]}
        issueHref={(id) => `/issues/${id}`}
        ownerPicker={<button type="button">Owner picker</button>}
      />,
    );

    expect(field("Assignee")).toBe("Owner picker");
  });

  it("should name the store a failed read came from", () => {
    render(
      <IssueDetail
        loading={false}
        issue={ISSUE}
        repository="repo-a"
        comments={null}
        commentsError={{ source: "bd comments", message: "bd comments exited 1: locked" }}
        issueHref={(id) => `/issues/${id}`}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "bd comments failed in repo-a: bd comments exited 1: locked",
    );
    expect(screen.queryByText("No comments")).toBeNull();
  });
});
