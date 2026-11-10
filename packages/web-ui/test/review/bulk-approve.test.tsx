import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installClipboardStubs } from "../composer/harness.ts";
import {
  actions,
  DECISION,
  heldOf,
  item,
  loaded,
  optionsStdout,
  renderReview,
} from "./fixtures.tsx";

// T-W1.2's last criterion: selecting several decisions and choosing "approve recommendations"
// lists each decision and its recommended option for confirmation before any answer is written.

const first = item("first");
const second = item("second");
const other = { ...DECISION, id: "D-7", title: "Cross-host carriage", recommended: "b" };
const stdout = optionsStdout([
  { path: first.path, decisions: [DECISION] },
  { path: second.path, decisions: [other] },
]);

function pickBoth() {
  fireEvent.click(
    screen.getByRole("checkbox", { name: `Select ${first.title} for approve recommendations` }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: `Select ${second.title} for approve recommendations` }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve recommendations (2)" }));
}

beforeEach(() => installClipboardStubs());
afterEach(cleanup);

describe("approve recommendations", () => {
  it("should list each selected decision and its recommended option before writing any answer", async () => {
    const done = actions();
    renderReview({ state: loaded([heldOf(first), heldOf(second)]), stdout, actions: done });
    pickBoth();
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/D-3: How an answer is recorded: \(a\) Name the option/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/D-7: Cross-host carriage: \(b\) Fill the composer/),
    ).toBeTruthy();
    expect(done.answer).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve all" }));
    await waitFor(() => expect(done.answer).toHaveBeenCalledTimes(2));
    expect(done.answer).toHaveBeenCalledWith(
      expect.objectContaining({ key: `held:${first.path}` }),
      {
        choices: [{ decision: "D-3", key: "a" }],
      },
    );
    expect(done.answer).toHaveBeenCalledWith(
      expect.objectContaining({ key: `held:${second.path}` }),
      {
        choices: [{ decision: "D-7", key: "b" }],
      },
    );
  });

  it("should write nothing when the confirm is cancelled", async () => {
    const done = actions();
    renderReview({ state: loaded([heldOf(first), heldOf(second)]), stdout, actions: done });
    pickBoth();
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(done.answer).not.toHaveBeenCalled();
  });

  it("should not offer a decision with no recommendation for bulk approval", () => {
    const none = item("none");
    renderReview({
      state: loaded([heldOf(none)]),
      stdout: optionsStdout([{ path: none.path, decisions: [{ ...DECISION, recommended: null }] }]),
    });
    const box = screen.getByRole("checkbox", {
      name: `Select ${none.title} for approve recommendations`,
    });
    expect((box as HTMLInputElement).disabled).toBe(true);
  });
});
