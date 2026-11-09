import { decodeQueueFilters, encodeQueueFilters } from "@beads-ui/core";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installClipboardStubs } from "../composer/harness.ts";
import { actions, heldOf, issue, item, loaded, renderReview, status, taskOf } from "./fixtures.tsx";

// T-W1.1 and T-W1.6 through the rendered Review view: every item grouped by next action in core's
// order, the filters handed to the app for its URL and a filtered state drawn from one, a failed
// held read named with its exit code and never read as an empty queue, and an unblock with its
// resolution and next-step prompt.

const sectionRows = (name: string) =>
  within(screen.getByRole("region", { name }))
    .getAllByRole("button")
    .map((row) => row.getAttribute("data-entry"));

beforeEach(() => installClipboardStubs());
afterEach(cleanup);

describe("the Review queue", () => {
  it("should list held items, blocked tasks and tasks to prompt, grouped by next action in priority then impact order", () => {
    const entries = [
      heldOf(item("late")),
      taskOf(issue("w-low", { status: "blocked", priority: 3 })),
      taskOf(issue("w-high", { status: "blocked", priority: 1, metadata: { value: 3 } })),
      taskOf(issue("w-high-impact", { status: "blocked", priority: 1, metadata: { value: 13 } })),
      taskOf(issue("w-run", { status: "in_progress", priority: 0 })),
    ];
    renderReview({ state: loaded(entries) });
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .slice(0, 3)
        .map((h) => h.textContent),
    ).toEqual(["Answer (1)", "Unblock (3)", "Prompt (1)"]);
    expect(sectionRows("Unblock")).toEqual([
      "task:work-repo:w-high-impact",
      "task:work-repo:w-high",
      "task:work-repo:w-low",
    ]);
    expect(sectionRows("Answer")).toEqual([`held:${item("late").path}`]);
  });

  it("should hand the app the chosen filters for its URL and draw only the matching items", () => {
    const onFilters = vi.fn();
    renderReview({
      state: loaded([
        taskOf(issue("w-1", { status: "blocked", type: "bug" })),
        taskOf(issue("w-2", { status: "blocked", type: "task" })),
      ]),
      onFilters,
    });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "bug" } });
    expect(onFilters).toHaveBeenLastCalledWith({ type: ["bug"] });
    expect(encodeQueueFilters(onFilters.mock.calls.at(-1)?.[0])).toBe("type=bug");
    expect(sectionRows("Unblock")).toEqual(["task:work-repo:w-1"]);
  });

  it("should draw the same filtered list from a Review URL's filters", () => {
    const state = {
      ...loaded([
        taskOf(issue("w-1", { status: "blocked", assignee: "session-a" })),
        taskOf(issue("w-2", { status: "blocked", assignee: "session-b" })),
      ]),
      filters: decodeQueueFilters("?owner=session-b"),
    };
    renderReview({ state });
    expect(sectionRows("Unblock")).toEqual(["task:work-repo:w-2"]);
    expect((screen.getByLabelText("Owner") as HTMLSelectElement).value).toBe("session-b");
  });

  it("should show the task items, name the failed held read and its exit code, and not say nothing to review", () => {
    renderReview({
      state: loaded(
        [taskOf(issue("w-1", { status: "blocked" }))],
        [{ source: "held review", exitCode: 3, detail: "store ai: unreadable" }],
      ),
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "held review could not be read (exit 3): store ai: unreadable",
    );
    expect(sectionRows("Unblock")).toEqual(["task:work-repo:w-1"]);
    expect(screen.queryByText("nothing to review")).toBeNull();
  });

  it("should say the reads failed rather than nothing to review when nothing could be read", () => {
    renderReview({
      state: loaded([], [{ source: "held review", exitCode: null, detail: "did not finish" }]),
    });
    expect(screen.getByText("nothing shown: 1 read(s) failed")).toBeTruthy();
    expect(screen.queryByText("nothing to review")).toBeNull();
  });
});

describe("unblocking from the Review queue", () => {
  it("should send the resolution and the next-step prompt for the task's owning session", async () => {
    const done = actions({
      status: vi.fn(() =>
        Promise.resolve(status({ kind: "unblock", followUp: { state: "pending" } })),
      ),
    });
    renderReview({ state: loaded([taskOf(issue("w-1", { status: "blocked" }))]), actions: done });
    fireEvent.change(screen.getByLabelText("Resolution"), {
      target: { value: "the space is approved" },
    });
    fireEvent.change(screen.getByLabelText(/Next-step prompt/), {
      target: { value: "publish the drafts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(done.unblock).toHaveBeenCalledOnce());
    expect(done.unblock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "task:work-repo:w-1" }),
      "the space is approved",
      "publish the drafts",
    );
    expect(await screen.findByText(/waits for the unblock to be acted on/)).toBeTruthy();
  });

  it("should show why when the unblock fails and keep the item", async () => {
    const done = actions({
      unblock: vi.fn(() => Promise.reject(new Error("w-1 is open, not blocked"))),
    });
    renderReview({ state: loaded([taskOf(issue("w-1", { status: "blocked" }))]), actions: done });
    fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "done" } });
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Not unblocked: w-1 is open, not blocked",
    );
    expect(sectionRows("Unblock")).toEqual(["task:work-repo:w-1"]);
  });

  it("should show the receiver's failure on the unblock dispatch and keep the item", async () => {
    const done = actions({
      status: vi.fn(() =>
        Promise.resolve(
          status({
            kind: "unblock",
            state: "failed",
            final: true,
            delivery: {
              text: "failed: bd-unblock refused: not blocked",
              source: "receipt",
              tone: "error",
            },
            followUp: {
              state: "dropped",
              reason: "the unblock failed: bd-unblock refused: not blocked",
            },
          }),
        ),
      ),
    });
    renderReview({ state: loaded([taskOf(issue("w-1", { status: "blocked" }))]), actions: done });
    fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "done" } });
    fireEvent.change(screen.getByLabelText(/Next-step prompt/), { target: { value: "next" } });
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect(await screen.findByText("failed: bd-unblock refused: not blocked")).toBeTruthy();
    expect(screen.getByText(/not sent: the unblock failed/)).toBeTruthy();
    expect(sectionRows("Unblock")).toEqual(["task:work-repo:w-1"]);
  });

  it("should say what the server did when it unblocked a task no session owns", async () => {
    const done = actions({
      unblock: vi.fn(() =>
        Promise.resolve({
          via: "server" as const,
          message: "w-1 had no owning session, so this server unblocked it",
        }),
      ),
    });
    renderReview({ state: loaded([taskOf(issue("w-1", { status: "blocked" }))]), actions: done });
    fireEvent.change(screen.getByLabelText("Resolution"), { target: { value: "done" } });
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect(
      await screen.findByText("w-1 had no owning session, so this server unblocked it"),
    ).toBeTruthy();
  });
});
