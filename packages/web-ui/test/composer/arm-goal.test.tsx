import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptComposer } from "../../src/composer/PromptComposer.tsx";
import type { DispatchStatus, DispatchSummary } from "../../src/composer/types.ts";
import { editorOf, installClipboardStubs, typeIntoEditor } from "./harness.ts";

// T-W2.3 through the rendered composer: every prompt asks the receiver to arm a goal unless the
// user clears the control for that one dispatch, and a dispatch waiting on a paused goal offers
// "Deliver now", which releases it.

const SENT: DispatchSummary = {
  id: "01JD0000000000000000000009",
  kind: "prompt",
  target: { session: "session-1", host: "host-b" },
  state: "queued",
};

function statusOf(overrides: Partial<DispatchStatus> = {}): DispatchStatus {
  return {
    id: SENT.id,
    kind: "prompt",
    target: SENT.target,
    state: "waiting",
    final: false,
    liveness: { text: "active", source: "the work queue's session registry", tone: "ok" },
    delivery: { text: "waiting: goal paused", source: "goal state reported", tone: "warn" },
    response: { text: "none yet", source: "receipts from the target session", tone: "idle" },
    ...overrides,
  };
}

async function writeAndSend(text: string) {
  fireEvent.focus(screen.getByRole("button", { name: "Write a prompt" }));
  const editor = editorOf(await screen.findByLabelText("Prompt text"));
  await act(async () => typeIntoEditor(editor, text));
  fireEvent.click(screen.getByTestId("composer-submit"));
}

beforeEach(() => installClipboardStubs());
afterEach(() => cleanup());

describe("the composer's arm-goal control", () => {
  it("should send a prompt with arm-goal on unless the user clears it", async () => {
    const send = vi.fn(() => Promise.resolve(SENT));
    render(
      <PromptComposer
        label="Prompt BU-1"
        send={send}
        status={() => new Promise(() => undefined)}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Arm a goal if none is active" })).toHaveProperty(
      "checked",
      true,
    );
    await writeAndSend("Start on the next task");
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send).toHaveBeenCalledWith("Start on the next task");
  });

  it("should send that one dispatch without arm-goal when the user clears the control, and arm the next again", async () => {
    const send = vi.fn(() => Promise.resolve(SENT));
    render(
      <PromptComposer
        label="Prompt BU-1"
        send={send}
        status={() => new Promise(() => undefined)}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Arm a goal if none is active" }));
    await writeAndSend("Just answer, no goal");
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send).toHaveBeenCalledWith("Just answer, no goal", { armGoal: false });
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Arm a goal if none is active" })).toHaveProperty(
        "checked",
        true,
      ),
    );
  });
});

describe("deliver now", () => {
  it("should offer deliver now on a dispatch waiting on a paused goal and release it when pressed", async () => {
    const deliverNow = vi.fn(() => Promise.resolve({}));
    render(
      <PromptComposer
        label="Prompt BU-1"
        send={() => Promise.resolve(SENT)}
        status={() => Promise.resolve(statusOf({ deliverNow: true }))}
        deliverNow={deliverNow}
      />,
    );
    await writeAndSend("After the limit");
    fireEvent.click(await screen.findByRole("button", { name: "Deliver now" }));
    expect(deliverNow).toHaveBeenCalledWith(SENT.id);
  });

  it("should not offer deliver now on a dispatch that is not waiting on a paused goal", async () => {
    render(
      <PromptComposer
        label="Prompt BU-1"
        send={() => Promise.resolve(SENT)}
        status={() =>
          Promise.resolve(
            statusOf({
              delivery: {
                text: "waiting: automatic wakes off",
                source: "the target host's wake policy",
                tone: "warn",
              },
            }),
          )
        }
        deliverNow={vi.fn()}
      />,
    );
    await writeAndSend("Turn end is fine");
    await screen.findByText("waiting: automatic wakes off");
    expect(screen.queryByRole("button", { name: "Deliver now" })).toBeNull();
  });

  it("should say why when deliver now is refused", async () => {
    render(
      <PromptComposer
        label="Prompt BU-1"
        send={() => Promise.resolve(SENT)}
        status={() => Promise.resolve(statusOf({ deliverNow: true }))}
        deliverNow={() =>
          Promise.reject(new Error("this dispatch is not waiting on a paused goal"))
        }
      />,
    );
    await writeAndSend("Race");
    fireEvent.click(await screen.findByRole("button", { name: "Deliver now" }));
    expect(
      await screen.findByText("Not delivered: this dispatch is not waiting on a paused goal"),
    ).toBeTruthy();
  });
});
