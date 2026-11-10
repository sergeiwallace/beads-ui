import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNDO_MS } from "../../src/review/HeldAnswer.tsx";
import { editorOf, installClipboardStubs } from "../composer/harness.ts";
import {
  actions,
  DECISION,
  heldOf,
  item,
  loaded,
  optionsStdout,
  renderReview,
  status,
} from "./fixtures.tsx";

// T-W1.2 through the rendered Review view: option cards from the structured-options command, the
// recommended option preselected and the card focused, one key to choose, the five-second undo
// window, a text field that keeps its keys, the Markdown fallback, a malformed payload that draws
// no partial card, and the receiver's refusal shown on the item.

const held = item("d-3");
const stdout = optionsStdout([{ path: held.path, decisions: [DECISION] }]);

const card = () => screen.getByRole("radiogroup", { name: `${DECISION.id}: ${DECISION.title}` });

beforeEach(() => installClipboardStubs());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a held decision's option card", () => {
  it("should draw each option with its label and mark the recommended one", async () => {
    renderReview({ state: loaded([heldOf(held)]), stdout });
    const options = within(await waitFor(card)).getAllByRole("radio");
    expect(options.map((option) => option.textContent)).toEqual([
      "1 (a) Name the option and say a control chose it recommended",
      "2 (b) Fill the composer and require Send",
      "3 (c) Both, by a setting",
    ]);
  });

  it("should preselect the recommended option and give the card keyboard focus", async () => {
    renderReview({ state: loaded([heldOf(held)]), stdout });
    await waitFor(() => expect(document.activeElement).toBe(card()));
    const checked = within(card())
      .getAllByRole("radio")
      .filter((option) => option.getAttribute("aria-checked") === "true");
    expect(checked.map((option) => option.getAttribute("data-option"))).toEqual(["a"]);
  });

  it("should choose the recommended option on Enter and write the answer only when the undo window closes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const done = actions();
    renderReview({ state: loaded([heldOf(held)]), stdout, actions: done });
    await waitFor(() => expect(document.activeElement).toBe(card()));
    fireEvent.keyDown(card(), { key: "Enter" });
    expect(screen.getByText(/Answering D-3 \(a\) Name the option/)).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(UNDO_MS - 100));
    expect(done.answer).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(200));
    expect(done.answer).toHaveBeenCalledOnce();
    expect(done.answer).toHaveBeenCalledWith(
      expect.objectContaining({ key: `held:${held.path}` }),
      {
        choices: [{ decision: "D-3", key: "a" }],
      },
    );
  });

  it("should choose an option with its number key", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const done = actions();
    renderReview({ state: loaded([heldOf(held)]), stdout, actions: done });
    await waitFor(() => expect(document.activeElement).toBe(card()));
    fireEvent.keyDown(card(), { key: "3" });
    await act(async () => vi.advanceTimersByTime(UNDO_MS + 10));
    expect(done.answer).toHaveBeenCalledWith(expect.anything(), {
      choices: [{ decision: "D-3", key: "c" }],
    });
  });

  it("should cancel the answer and write nothing on Escape inside the undo window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const done = actions();
    renderReview({ state: loaded([heldOf(held)]), stdout, actions: done });
    await waitFor(() => expect(document.activeElement).toBe(card()));
    fireEvent.keyDown(card(), { key: "2" });
    fireEvent.keyDown(card(), { key: "Escape" });
    await act(async () => vi.advanceTimersByTime(UNDO_MS * 2));
    expect(done.answer).not.toHaveBeenCalled();
    expect(screen.queryByText(/Answering/)).toBeNull();
  });

  it("should cancel the answer and write nothing on Undo inside the undo window", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const done = actions();
    renderReview({ state: loaded([heldOf(held)]), stdout, actions: done });
    await waitFor(() => expect(document.activeElement).toBe(card()));
    fireEvent.keyDown(card(), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /Undo/ }));
    await act(async () => vi.advanceTimersByTime(UNDO_MS * 2));
    expect(done.answer).not.toHaveBeenCalled();
  });

  it("should let Enter and the number keys type into a text field and choose no option", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const done = actions();
    renderReview({ state: loaded([heldOf(held)]), stdout, actions: done });
    await waitFor(card);
    fireEvent.focus(screen.getByRole("button", { name: "Write a prompt" }));
    const field = await screen.findByLabelText("Prompt text");
    editorOf(field);
    for (const key of ["1", "2", "Enter"]) fireEvent.keyDown(field, { key });
    await act(async () => vi.advanceTimersByTime(UNDO_MS * 2));
    expect(screen.queryByText(/Answering/)).toBeNull();
    expect(done.answer).not.toHaveBeenCalled();
  });

  it("should write one answer once every decision on the item has a choice", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const two = item("two");
    const second = { ...DECISION, id: "D-4", title: "The composer", recommended: "b" };
    const done = actions();
    renderReview({
      state: loaded([heldOf(two)]),
      stdout: optionsStdout([{ path: two.path, decisions: [DECISION, second] }]),
      actions: done,
    });
    const first = await screen.findByRole("radiogroup", { name: `D-3: ${DECISION.title}` });
    fireEvent.keyDown(first, { key: "Enter" });
    expect(screen.queryByText(/Answering/)).toBeNull();
    const next = screen.getByRole("radiogroup", { name: "D-4: The composer" });
    await waitFor(() => expect(document.activeElement).toBe(next));
    fireEvent.keyDown(next, { key: "1" });
    await act(async () => vi.advanceTimersByTime(UNDO_MS + 10));
    expect(done.answer).toHaveBeenCalledOnce();
    expect(done.answer).toHaveBeenCalledWith(expect.anything(), {
      choices: [
        { decision: "D-3", key: "a" },
        { decision: "D-4", key: "a" },
      ],
    });
  });

  it("should show the receiver's reason when it refuses the answer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const reason = "the landing pad for this item is not clean";
    const done = actions({
      status: vi.fn(() =>
        Promise.resolve(
          status({
            state: "failed",
            final: true,
            delivery: {
              text: `failed: ${reason}`,
              source: "receipt from session-1@host-c",
              tone: "error",
            },
          }),
        ),
      ),
    });
    renderReview({ state: loaded([heldOf(held)]), stdout, actions: done });
    await waitFor(() => expect(document.activeElement).toBe(card()));
    fireEvent.keyDown(card(), { key: "Enter" });
    await act(async () => vi.advanceTimersByTime(UNDO_MS + 10));
    expect(await screen.findByText(`failed: ${reason}`)).toBeTruthy();
    expect(screen.getByText(`Decide d-3`, { selector: "h2" })).toBeTruthy();
  });
});

describe("the Markdown fallback", () => {
  it("should render the Markdown body and take a typed answer only when the options command is unavailable", async () => {
    const done = actions();
    renderReview({
      state: loaded([heldOf(held)]),
      optionsRead: { state: "failed", problem: "held options could not be read (exit 2)" },
      actions: done,
    });
    expect((await screen.findByTestId("held-body")).textContent).toContain("The body.");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText(/held options could not be read \(exit 2\)/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "(b), with a note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    await waitFor(() => expect(done.answer).toHaveBeenCalledOnce());
    expect(done.answer).toHaveBeenCalledWith(expect.anything(), { text: "(b), with a note" });
  });

  it("should fall back for an item the command printed no options for", async () => {
    renderReview({ state: loaded([heldOf(held)]), stdout: optionsStdout([]) });
    expect(await screen.findByLabelText("Your answer")).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("should draw no partial card and name the field when the item's options are malformed", async () => {
    const bad = JSON.stringify({
      version: 1,
      items: [
        {
          item: held.path,
          kind: "decision",
          decisions: [
            {
              id: "D-3",
              title: DECISION.title,
              options: [
                { key: "a", label: "One" },
                { key: "b", label: "Two" },
              ],
              recommended: "z",
              anchor: "decision-d-3",
            },
          ],
          error: null,
        },
      ],
    });
    renderReview({ state: loaded([heldOf(held)]), stdout: bad });
    expect(await screen.findByLabelText("Your answer")).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByText(/items\[0\]\.decisions\[0\]\.recommended names z/)).toBeTruthy();
  });

  it("should fall back for every item when the command's output is not the payload at all", async () => {
    renderReview({ state: loaded([heldOf(held)]), stdout: "not json" });
    expect(
      await screen.findByText(/the options command's output: the options command printed no JSON/),
    ).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("should show the read error and its source when the body cannot be read", async () => {
    const failing = Object.assign(new Error("exit 3: no such item"), { source: "held show" });
    renderReview({
      state: loaded([heldOf(held)]),
      stdout,
      actions: actions({ body: vi.fn(() => Promise.reject(failing)) }),
    });
    const alert = await screen.findByText(/no such item/);
    expect(alert.textContent).toContain("held show");
  });
});
