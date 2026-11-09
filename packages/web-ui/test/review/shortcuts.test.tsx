import type { Keymap } from "@beads-ui/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReviewQueue } from "../../src/review/ReviewQueue.tsx";
import { ShortcutSettings } from "../../src/review/ShortcutSettings.tsx";
import { installClipboardStubs } from "../composer/harness.ts";
import { actions, issue, keymapOf, loaded, taskOf } from "./fixtures.tsx";

// T-W1.4 through the Review view and the shortcut setting: a mapped key outside a text field runs
// its command; with single-key shortcuts off, single keys do nothing and modified ones still run;
// a remap that gives one key to two commands is refused, naming both.

const ENTRIES = [
  taskOf(issue("w-1", { status: "blocked", priority: 0 })),
  taskOf(issue("w-2", { status: "blocked", priority: 1 })),
];

function Page() {
  const [keymap, setKeymap] = useState<Keymap>(keymapOf());
  return (
    <>
      <ShortcutSettings keymap={keymap} onChange={setKeymap} />
      <ReviewQueue
        state={loaded(ENTRIES)}
        onFilters={() => undefined}
        options={{ state: "ok", output: { version: 1, items: [] } }}
        actions={actions()}
        keymap={keymap}
      />
    </>
  );
}

const current = () =>
  document
    .querySelector(".bu-review-row[aria-current='true'] .bu-review-open")
    ?.getAttribute("data-entry");

function remap(label: string, key: string) {
  fireEvent.change(screen.getByLabelText(`Key for ${label}`), { target: { value: key } });
  fireEvent.click(screen.getByLabelText(`Key for ${label}`).nextElementSibling as HTMLElement);
}

beforeEach(() => installClipboardStubs());
afterEach(cleanup);

describe("single-key shortcuts", () => {
  it("should run a mapped key's command when it is pressed outside a text field", () => {
    render(<Page />);
    expect(current()).toBe("task:work-repo:w-1");
    fireEvent.keyDown(document.body, { key: "j" });
    expect(current()).toBe("task:work-repo:w-2");
    fireEvent.keyDown(document.body, { key: "k" });
    expect(current()).toBe("task:work-repo:w-1");
  });

  it("should not run a mapped key's command when it is pressed in a text field", () => {
    render(<Page />);
    fireEvent.keyDown(screen.getByLabelText("Resolution"), { key: "j" });
    expect(current()).toBe("task:work-repo:w-1");
  });

  it("should ignore single keys and keep modified shortcuts while the setting is off", () => {
    render(<Page />);
    remap("Next item", "Ctrl+ArrowDown");
    fireEvent.click(screen.getByRole("checkbox", { name: "Single-key shortcuts" }));
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "k" });
    expect(current()).toBe("task:work-repo:w-1");
    fireEvent.keyDown(document.body, { key: "ArrowDown", ctrlKey: true });
    expect(current()).toBe("task:work-repo:w-2");
  });

  it("should refuse a remap that gives one key to two commands and name both", () => {
    render(<Page />);
    remap("Next item", "k");
    expect(screen.getByRole("alert").textContent).toBe(
      "Not remapped: k cannot run both review.next and review.previous",
    );
    fireEvent.keyDown(document.body, { key: "j" });
    expect(current()).toBe("task:work-repo:w-2");
  });
});
