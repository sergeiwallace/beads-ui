import type { Issue } from "@beads-ui/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IssueDetail } from "../src/index.ts";

afterEach(cleanup);

const ISSUE: Issue = {
  id: "t-1",
  title: "A detailed task",
  status: "in_progress",
  priority: 1,
  type: "bug",
  owner: "person-a",
  labels: ["web", "ui"],
  parent: "t-epic",
  dependencies: [],
  createdAt: "2026-11-01T09:30:00Z",
  updatedAt: "2026-11-02T10:00:00Z",
  description: "First line\nSecond line",
  metadata: {},
};

const field = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;

describe("IssueDetail", () => {
  it("should show each field, the description and the comments read from the store", () => {
    render(
      <IssueDetail
        loading={false}
        issue={ISSUE}
        comments={[
          {
            id: "c-1",
            issueId: "t-1",
            author: "host-a",
            text: "Noted",
            createdAt: "2026-11-02T11:00:00Z",
          },
        ]}
        issueHref={(id) => `/issues/${id}`}
      />,
    );

    expect(screen.getByRole("heading", { name: "A detailed task" })).toBeTruthy();
    expect([field("Type"), field("Status"), field("Priority"), field("Owner")]).toEqual([
      "bug",
      "in_progress",
      "P1",
      "person-a",
    ]);
    expect([field("Labels"), field("Parent"), field("Created")]).toEqual([
      "web, ui",
      "t-epic",
      "2026-11-01 09:30",
    ]);
    expect(screen.getByText(/First line/).textContent).toBe("First line\nSecond line");
    expect(screen.getByText("Noted")).toBeTruthy();
  });

  it("should name the failed read's source and draw no fields when the issue cannot be read", () => {
    render(
      <IssueDetail
        loading={false}
        issueError={{ source: "bd show", message: "bd show exited 1: database is locked" }}
        comments={null}
        issueHref={(id) => `/issues/${id}`}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "bd show failed: bd show exited 1: database is locked",
    );
    expect(screen.queryByText("Type")).toBeNull();
  });

  it("should say the comments could not be read, naming bd comments, instead of showing none", () => {
    render(
      <IssueDetail
        loading={false}
        issue={ISSUE}
        comments={null}
        commentsError={{
          source: "bd comments",
          message: "bd comments exited 1: database is locked",
        }}
        issueHref={(id) => `/issues/${id}`}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "bd comments failed: bd comments exited 1: database is locked",
    );
    expect(screen.queryByText("No comments")).toBeNull();
  });
});
