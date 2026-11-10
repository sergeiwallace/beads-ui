import type { ItemOptions } from "@beads-ui/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HeldDetail, type HeldItemSummary } from "../../src/index.ts";

afterEach(cleanup);

const item = (kind: string): HeldItemSummary => ({
  path: `/repo/docs/held/${kind}.md`,
  kind,
  title: `A held ${kind}`,
  status: "open",
  session: "session-a@host-a",
  task: "t-1",
});

const BODY = "## Context\n\nThe **whole** body, with a [link](https://example.com).";

const OPTIONS: ItemOptions = {
  item: "/repo/docs/held/decision.md",
  kind: "decision",
  cards: [
    {
      id: "D-1",
      title: "Pick a store",
      anchor: "d-1",
      recommended: "b",
      options: [
        { key: "a", label: "Keep it", number: 1, recommended: false },
        { key: "b", label: "Move it", number: 2, recommended: true },
      ],
    },
  ],
};

describe("HeldDetail", () => {
  it.each(["decision", "open-question", "blocker", "note"])(
    "should render the full Markdown body of a held %s",
    (kind) => {
      render(<HeldDetail loading={false} item={item(kind)} store="repo-a" body={BODY} />);

      expect(screen.getByRole("heading", { name: `A held ${kind}` })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "Context" })).toBeTruthy();
      expect(screen.getByText("whole").tagName).toBe("STRONG");
      expect(screen.getByRole("link", { name: "link" }).getAttribute("href")).toBe(
        "https://example.com",
      );
    },
  );

  it("should draw the option card above the body when structured options exist", () => {
    const { container } = render(
      <HeldDetail loading={false} item={item("decision")} body={BODY} options={OPTIONS} />,
    );

    const card = screen.getByRole("region", { name: "D-1 Pick a store" });
    const body = screen.getByRole("heading", { name: "Body" });
    expect(card.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("[data-recommended]")?.textContent).toContain("Move it");
  });

  it("should draw no card and keep the body when the options command named a malformed field", () => {
    render(
      <HeldDetail
        loading={false}
        item={item("decision")}
        body={BODY}
        options={{
          ...OPTIONS,
          cards: [],
          error: { field: "recommended", problem: "names z, which is not an option" },
        }}
      />,
    );

    expect(screen.queryByRole("region", { name: /D-1/ })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("recommended names z");
    expect(screen.getByRole("heading", { name: "Context" })).toBeTruthy();
  });

  it("should show the body's read error with its source, store and exit code, never an empty detail", () => {
    render(
      <HeldDetail
        loading={false}
        item={item("decision")}
        store="repo-a"
        bodyError={{
          source: "held show",
          store: "repo-a",
          exitCode: 2,
          message: "the show command exited 2: no such item",
        }}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "held show failed in repo-a (exit 2): the show command exited 2: no such item",
    );
    expect(screen.queryByText("Reading the body")).toBeNull();
  });

  it("should show why the item itself could not be read and draw no fields", () => {
    render(
      <HeldDetail
        loading={false}
        error={{ source: "held review", exitCode: 1, message: "the review command exited 1" }}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe(
      "held review failed (exit 1): the review command exited 1",
    );
    expect(screen.queryByText("Kind")).toBeNull();
  });
});
