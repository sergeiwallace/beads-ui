import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installClipboardStubs } from "../composer/harness.ts";
import { actions, heldOf, item, loaded, renderReview } from "./fixtures.tsx";

// T-W1.2 and T-W1.7 through the rendered Review view: a held item's body is drawn by the same
// sanitizing Markdown renderer as its detail, so its headings and safe links work, an option
// card's `#` anchor lands on its decision, and raw HTML never reaches the page.

const held = item("d-3");

const BODY = [
  "# Decide the answer path",
  "",
  '<a id="decision-d-3"></a>',
  "## Decision D-3: How an answer is recorded",
  "",
  "See [the decision](#decision-d-3) and [the design](https://example.com/design).",
  "",
  '<script>window.__pwned = "script"</script>',
  '<img src="x" onerror="window.__pwned = \'img\'">',
  "[bad](javascript:alert(1))",
].join("\n");

beforeEach(() => {
  installClipboardStubs();
  delete (window as { __pwned?: unknown }).__pwned;
});
afterEach(() => cleanup());

describe("a held item's body in the Review view", () => {
  it("should draw its headings and safe links, with the decision's anchor on its heading", async () => {
    renderReview({
      state: loaded([heldOf(held)]),
      optionsRead: { state: "failed", problem: "held options could not be read (exit 2)" },
      actions: actions({ body: vi.fn(() => Promise.resolve(BODY)) }),
    });
    const body = await screen.findByTestId("held-body");
    const decision = within(body).getByRole("heading", {
      level: 2,
      name: "Decision D-3: How an answer is recorded",
    });
    expect(decision.id).toBe("decision-d-3");
    expect(
      within(body).getByRole("heading", { level: 1, name: "Decide the answer path" }),
    ).toBeTruthy();
    expect(within(body).getByRole("link", { name: "the decision" }).getAttribute("href")).toBe(
      "#decision-d-3",
    );
    expect(within(body).getByRole("link", { name: "the design" }).getAttribute("href")).toBe(
      "https://example.com/design",
    );
  });

  it("should give a heading its slug, never an anchor id that could name a DOM global or break its attribute, and number repeats", async () => {
    const hostile = [
      '<a id="__proto__"></a>',
      "## First heading",
      "",
      '<a id="x" onmouseover="window.__pwned = 1"></a>',
      "## Second heading",
      "",
      "## Second heading",
    ].join("\n");
    renderReview({
      state: loaded([heldOf(held)]),
      optionsRead: { state: "failed", problem: "held options could not be read (exit 2)" },
      actions: actions({ body: vi.fn(() => Promise.resolve(hostile)) }),
    });
    const body = await screen.findByTestId("held-body");
    const headings = within(body).getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.id)).toEqual([
      "first-heading",
      "second-heading",
      "second-heading-1",
    ]);
    expect(body.innerHTML).not.toContain("__proto__");
    expect(body.innerHTML).not.toContain("onmouseover");
  });

  it("should never put a script, an event handler or an unsafe link on the page", async () => {
    renderReview({
      state: loaded([heldOf(held)]),
      optionsRead: { state: "failed", problem: "held options could not be read (exit 2)" },
      actions: actions({ body: vi.fn(() => Promise.resolve(BODY)) }),
    });
    const body = await screen.findByTestId("held-body");
    expect(body.querySelector("script")).toBeNull();
    expect(body.querySelector("img")).toBeNull();
    expect(body.innerHTML).not.toContain("onerror");
    expect(body.innerHTML).not.toContain("javascript:");
    expect((window as { __pwned?: unknown }).__pwned).toBeUndefined();
    expect(within(body).queryByRole("link", { name: "bad" })).toBeNull();
  });
});
