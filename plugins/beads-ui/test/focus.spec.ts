// Runners: Vitest only. The band's beads button moves the focus into an open pane through
// $.ui.focus, which `claude plugin test` answers inside its own drawing without raising it to
// the test's hooks; so this drives the pane the button calls with a Host that records the call.
import { describe, expect, it } from "vitest";

import type { Host } from "../hooks/host.ts";
import { BeadsPane, PANE_ID } from "../hooks/pane.ts";
import { StoreResolver } from "../hooks/store.ts";

function recordingHost() {
  const calls: { opened: unknown[]; focused: [string, string][] } = { opened: [], focused: [] };
  const host = {
    cwd: "/work/beads-ui",
    now: async () => 0,
    storeGet: async () => undefined,
    storeSet: async () => undefined,
    readFile: async () => {
      throw new Error("ENOENT");
    },
    stateHome: async () => undefined,
    invalidate: () => undefined,
    every: () => ({ cancel: () => undefined }),
    openPane: async (args: unknown) => {
      calls.opened.push(args);
      return {};
    },
    focus: async (requestId: string, key: string) => {
      calls.focused.push([requestId, key]);
      return {};
    },
  } as unknown as Host;
  return { host, calls };
}

describe("the band's beads button (T-1B.6)", () => {
  it("should move the focus ring into the open pane, onto its open tab, with $.ui.focus", async () => {
    const { host, calls } = recordingHost();
    const pane = new BeadsPane(new StoreResolver());
    pane.host = host;
    pane.isOpen = true;
    pane.tab = "backlog";

    await pane.openOrFocus();

    expect(calls.focused).toEqual([[PANE_ID, "tab:backlog"]]);
    expect(calls.opened).toEqual([]);
  });

  it("should open the pane focused, and move no focus ring, when the pane is closed", async () => {
    const { host, calls } = recordingHost();
    const pane = new BeadsPane(new StoreResolver());
    pane.host = host;

    await pane.openOrFocus();

    expect(calls.opened).toMatchObject([{ id: PANE_ID, focus: true, closeOnEscape: true }]);
    expect(calls.focused).toEqual([]);
  });
});
