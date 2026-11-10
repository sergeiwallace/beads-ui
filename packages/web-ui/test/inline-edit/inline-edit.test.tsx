import type { Priority } from "@beads-ui/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type OwnerChoices,
  OwnerPicker,
  PriorityEdit,
  type Refusal,
  ToastProvider,
  useFieldEdits,
} from "../../src/index.ts";

afterEach(cleanup);

class Refused extends Error {
  readonly conflict: boolean;
  constructor(message: string, conflict: boolean) {
    super(message);
    this.conflict = conflict;
  }
}

const describeRefusal = (error: unknown): Refusal => ({
  conflict: error instanceof Refused && error.conflict,
  message: (error as Error).message,
});

const CHOICES: OwnerChoices = {
  source: "the work queue",
  candidates: [
    { name: "session-a", state: "active" },
    { name: "session-b", state: "idle" },
  ],
};

/** One list row's inline fields over a store the test holds: writes go through `write`. */
function Row(props: {
  write: (field: string, value: unknown) => Promise<void>;
  stored: { priority: Priority; owner: string };
}) {
  const [stored, setStored] = useState(props.stored);
  const [choices, setChoices] = useState<OwnerChoices | undefined>(undefined);
  const edits = useFieldEdits(describeRefusal, async () => setStored({ ...props.stored }));
  return (
    <div>
      <PriorityEdit
        issueLabel="t-1"
        value={edits.shown("t-1", "priority", stored.priority)}
        onChange={(priority) =>
          edits.edit("t-1", "t-1", "priority", priority, () => props.write("priority", priority))
        }
      />
      <OwnerPicker
        issueLabel="t-1"
        owner={edits.shown("t-1", "owner", stored.owner)}
        choices={choices}
        onOpen={() => setChoices(CHOICES)}
        onPick={(name) => edits.edit("t-1", "t-1", "owner", name, () => props.write("owner", name))}
      />
    </div>
  );
}

function renderRow(write: (field: string, value: unknown) => Promise<void>) {
  const stored = { priority: 2 as Priority, owner: "" };
  render(
    <ToastProvider>
      <Row write={write} stored={stored} />
    </ToastProvider>,
  );
  return stored;
}

const priority = () =>
  screen.getByRole("combobox", { name: "Priority of t-1" }) as HTMLSelectElement;

describe("inline edits", () => {
  it("should perform the write and show the new priority once the store holds it", async () => {
    let stored: { priority: Priority } | undefined;
    const write = vi.fn(async (_field: string, value: unknown) => {
      if (stored !== undefined) stored.priority = value as Priority;
    });
    stored = renderRow(write);

    await userEvent.selectOptions(priority(), "P0");

    expect(priority().value).toBe("0");
    await waitFor(() => expect(write).toHaveBeenCalledWith("priority", 0));
    await waitFor(() => expect(priority().value).toBe("0"));
  });

  it("should roll back to the stored value and name the field when the write is a conflict", async () => {
    let fail: (error: Error) => void = () => undefined;
    const write = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    renderRow(write);

    await userEvent.selectOptions(priority(), "P0");
    expect(priority().value).toBe("0");
    fail(new Refused("bd update exited 13", true));

    await waitFor(() => expect(priority().value).toBe("2"));
    expect(await screen.findByText("Priority not written: changed elsewhere")).toBeTruthy();
    expect(screen.getByText(/t-1's priority changed before this edit was written/)).toBeTruthy();
  });

  it("should offer the sessions the handoff rules allow from the owner picker, by keyboard", async () => {
    const write = vi.fn(async () => undefined);
    renderRow(write);

    const trigger = screen.getByRole("button", { name: /Owner of t-1: none/ });
    trigger.focus();
    await userEvent.keyboard("{Enter}");

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["session-a active", "session-b idle"]);
    expect(screen.getByText("From the work queue")).toBeTruthy();
    await userEvent.click(items[1] as HTMLElement);
    await waitFor(() => expect(write).toHaveBeenCalledWith("owner", "session-b"));
  });

  it("should roll back the owner and say why when the change is refused", async () => {
    const write = vi.fn(async () => {
      throw new Refused("session-a holds the claim on t-1; nothing was written", false);
    });
    renderRow(write);

    await userEvent.click(screen.getByRole("button", { name: /Owner of t-1/ }));
    await userEvent.click((await screen.findAllByRole("menuitem"))[0] as HTMLElement);

    expect(await screen.findByText("Owner not written")).toBeTruthy();
    expect(screen.getByText("session-a holds the claim on t-1; nothing was written")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Owner of t-1: none/ })).toBeTruthy(),
    );
  });
});
