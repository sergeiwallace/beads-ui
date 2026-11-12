import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftList, type PromptDraft } from "../../src/review/DraftList.tsx";

// Web app design Phase W4 through the rendered Drafts list: a prompt a model drafted through the
// MCP server is shown with its text, and nothing is sent until the user presses Confirm.

const DRAFT: PromptDraft = {
  id: "draft-0000000000000001",
  repo: "work",
  task: "work-7",
  text: "Rebase onto main and rerun the suite",
  created_at: "2026-11-10T12:00:00.000Z",
};

const SENT = {
  dispatch: {
    id: "01JDISPATCH",
    kind: "prompt",
    target: { session: "worker", host: "host-b" },
    state: "queued" as const,
  },
};

afterEach(cleanup);

describe("the Drafts list (W4)", () => {
  it("should show a drafted prompt's text and send nothing until Confirm is pressed", async () => {
    const confirm = vi.fn(() => Promise.resolve(SENT));
    render(<DraftList drafts={[DRAFT]} confirm={confirm} />);
    expect(screen.getByText(DRAFT.text ?? "")).toBeTruthy();
    expect(screen.getByText(/Prompt for work-7 in work/)).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect(confirm).toHaveBeenCalledWith(DRAFT.id);
    expect((await screen.findByRole("status")).textContent).toBe(
      "Sent as dispatch 01JDISPATCH to worker@host-b: queued",
    );
    expect(screen.getByRole("button", { name: "Confirm and send" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("should name the server's refusal and leave the draft confirmable again", async () => {
    const confirm = vi.fn(() => Promise.reject(new Error("draft was already confirmed")));
    render(<DraftList drafts={[DRAFT]} confirm={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm and send" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Not sent: draft was already confirmed",
    );
    expect(screen.getByRole("button", { name: "Confirm and send" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("should draw nothing when no draft waits", () => {
    const { container } = render(<DraftList drafts={[]} confirm={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});
