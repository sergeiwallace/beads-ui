import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HandoffStatus, type HandoffView } from "../../src/inline-edit/HandoffStatus.tsx";

// T-W2.2 on a task's detail: the owner change's handoff, each state named with the record that
// proves it, read again until it can no longer change.

const view = (state: string, source: string, final = false): HandoffView => ({
  state,
  source,
  final,
  holder: { session: "holder-1", host: "host-b" },
  receiver: { session: "receiver-1", host: "host-b" },
});

afterEach(() => cleanup());

describe("the handoff status on a task", () => {
  it("should show each state with its source as the handoff moves, and stop reading once it is complete", async () => {
    const states = [
      view("handoff pending to receiver-1", "dispatch 01JD: queued"),
      view("handoff sent", "the published store: bd show BU-1 names receiver-1"),
      view("handoff complete", "receipt from holder-1@host-b: verify exited 0", true),
    ];
    const read = vi.fn(() => Promise.resolve(states.shift() ?? view("unexpected", "x", true)));
    render(<HandoffStatus read={read} pollMs={10} />);
    expect(await screen.findByText("handoff pending to receiver-1")).toBeTruthy();
    expect(await screen.findByText("handoff sent")).toBeTruthy();
    expect(await screen.findByText("handoff complete")).toBeTruthy();
    expect(screen.getByLabelText("Owner handoff").textContent).toContain(
      "from receipt from holder-1@host-b: verify exited 0; holder-1@host-b to receiver-1@host-b",
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("should show what the server reads in the store beside a pending handoff, as an observation only", async () => {
    const pending = {
      ...view("handoff pending to receiver-1", "dispatch 01JD: queued"),
      observation: "the store as this server reads it names receiver-1",
    };
    render(<HandoffStatus read={() => Promise.resolve(pending)} pollMs={1_000} />);
    expect(await screen.findByText("handoff pending to receiver-1")).toBeTruthy();
    expect(screen.getByLabelText("Owner handoff").textContent).toContain(
      "(the store as this server reads it names receiver-1)",
    );
    expect(screen.queryByText("handoff sent")).toBeNull();
  });

  it("should draw nothing for a task with no handoff", async () => {
    const read = vi.fn(() => Promise.resolve(undefined));
    const { container } = render(<HandoffStatus read={read} pollMs={10} />);
    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("should say the state could not be read when the read fails", async () => {
    render(
      <HandoffStatus
        read={() => Promise.reject(new Error("502 from the server"))}
        pollMs={1_000}
      />,
    );
    expect(
      await screen.findByText("The handoff's state could not be read: 502 from the server"),
    ).toBeTruthy();
  });
});
