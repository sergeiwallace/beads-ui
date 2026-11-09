import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PromptComposer } from "../../src/composer/PromptComposer.tsx";
import type { DispatchStatus, DispatchSummary } from "../../src/composer/types.ts";
import { editorOf, FAKE_AWS_KEY, installClipboardStubs, typeIntoEditor } from "./harness.ts";

// T-W1.3 through the rendered composer: one send writes one dispatch and shows "queued"; the
// secret guard refuses before anything is sent and names the rule without the text; the submit
// state and the server's refusal show; and an outstanding dispatch shows three indicators, each
// naming its source.

const SENT: DispatchSummary = {
  id: "01JD0000000000000000000001",
  kind: "prompt",
  target: { session: "session-1", host: "host-b" },
  state: "queued",
};

function statusOf(overrides: Partial<DispatchStatus> = {}): DispatchStatus {
  return {
    id: SENT.id,
    kind: "prompt",
    target: SENT.target,
    state: "queued",
    final: false,
    liveness: { text: "active", source: "the work queue's session registry", tone: "ok" },
    delivery: { text: "queued", source: "dispatch record", tone: "idle" },
    response: { text: "none yet", source: "receipts from the target session", tone: "idle" },
    ...overrides,
  };
}

async function openComposer(): Promise<HTMLElement> {
  fireEvent.focus(screen.getByRole("button", { name: "Write a prompt" }));
  return screen.findByLabelText("Prompt text");
}

async function write(text: string) {
  const editor = editorOf(await openComposer());
  act(() => typeIntoEditor(editor, text));
}

beforeEach(() => installClipboardStubs());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the composer on a task", () => {
  it("should load the editor only once its launcher is focused", async () => {
    render(<PromptComposer label="Prompt BU-1" send={vi.fn()} status={vi.fn()} />);
    expect(screen.queryByLabelText("Prompt text")).toBeNull();
    expect(await openComposer()).toBeTruthy();
  });

  it("should write one dispatch with the text and show the state queued", async () => {
    const send = vi.fn(() => Promise.resolve(SENT));
    const status = vi.fn(() => new Promise<DispatchStatus>(() => undefined));
    render(<PromptComposer label="Prompt BU-1" send={send} status={status} />);
    await write("Pick up the next ready task");
    fireEvent.click(screen.getByTestId("composer-submit"));
    expect(await screen.findByText(`Dispatch ${SENT.id}: queued`)).toBeTruthy();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith("Pick up the next ready task");
  });

  it("should send nothing for an empty draft", async () => {
    const send = vi.fn(() => Promise.resolve(SENT));
    render(<PromptComposer label="Prompt BU-1" send={send} status={vi.fn()} />);
    await openComposer();
    fireEvent.click(screen.getByTestId("composer-submit"));
    expect(send).not.toHaveBeenCalled();
  });

  it("should refuse to send text matching the secret guard, naming the rule and never the text", async () => {
    const send = vi.fn(() => Promise.resolve(SENT));
    render(<PromptComposer label="Prompt BU-1" send={send} status={vi.fn()} />);
    await write(`use ${FAKE_AWS_KEY} for the run`);
    fireEvent.click(screen.getByTestId("composer-submit"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("AWS access key id");
    expect(alert.textContent).not.toContain(FAKE_AWS_KEY);
    expect(send).not.toHaveBeenCalled();
  });

  it("should disable the action while sending, then show the server's refusal and keep the draft", async () => {
    let refuse: (error: Error) => void = () => undefined;
    const send = vi.fn(
      () =>
        new Promise<DispatchSummary>((_resolve, reject) => {
          refuse = reject;
        }),
    );
    render(<PromptComposer label="Prompt BU-1" send={send} status={vi.fn()} />);
    await write("draft that stays");
    fireEvent.click(screen.getByTestId("composer-submit"));
    await waitFor(() =>
      expect((screen.getByTestId("composer-submit") as HTMLButtonElement).disabled).toBe(true),
    );
    await act(async () => refuse(new Error("sales-repo is not on host-b's published allowlist")));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "sales-repo is not on host-b's published allowlist",
    );
    expect((screen.getByTestId("composer-submit") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByLabelText("Prompt text").textContent).toBe("draft that stays");
  });

  it("should show session liveness, delivery state and the response as three indicators, each naming its source", async () => {
    const send = vi.fn(() => Promise.resolve(SENT));
    const status = vi.fn(() =>
      Promise.resolve(
        statusOf({
          state: "taken",
          delivery: { text: "taken", source: "receipt from session-1@host-b", tone: "busy" },
          response: {
            text: "working on it",
            source: "receipt from session-1@host-b at 2026-11-09T12:00:01.000Z",
            tone: "busy",
          },
        }),
      ),
    );
    render(<PromptComposer label="Prompt BU-1" send={send} status={status} />);
    await write("go");
    fireEvent.click(screen.getByTestId("composer-submit"));
    const indicators = await screen.findByRole("status", {
      name: `Dispatch ${SENT.id} to session-1@host-b`,
    });
    const session = within(indicators).getByText("Session").parentElement as HTMLElement;
    const delivery = within(indicators).getByText("Delivery").parentElement as HTMLElement;
    const response = within(indicators).getByText("Response").parentElement as HTMLElement;
    expect(new Set([session, delivery, response]).size).toBe(3);
    expect(session.textContent).toContain("active");
    expect(session.textContent).toContain("from the work queue's session registry");
    expect(delivery.textContent).toContain("taken");
    expect(delivery.textContent).toContain("from receipt from session-1@host-b");
    expect(response.textContent).toContain("working on it");
    expect(response.textContent).toContain("from receipt from session-1@host-b at");
  });

  it("should read the indicators again while the dispatch is outstanding and stop once it is final", async () => {
    const send = vi.fn(() => Promise.resolve(SENT));
    const answers = [
      statusOf(),
      statusOf({
        state: "acted",
        final: true,
        delivery: { text: "acted on", source: "receipt from session-1@host-b", tone: "ok" },
      }),
    ];
    const status = vi.fn(() => Promise.resolve(answers.shift() ?? statusOf({ final: true })));
    render(<PromptComposer label="Prompt BU-1" send={send} status={status} pollMs={20} />);
    await write("go");
    fireEvent.click(screen.getByTestId("composer-submit"));
    await screen.findByText("acted on");
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(status).toHaveBeenCalledTimes(2);
  });
});
