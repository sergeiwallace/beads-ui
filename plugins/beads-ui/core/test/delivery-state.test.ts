// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  type DeliveryMachine,
  deliveryLabel,
  deliveryMachine,
  reduceDelivery,
} from "../src/index.ts";

// T-W1.3 of the web app design (D-5): the composer's delivery indicator over the dispatch
// record's states, queued, shown, taken, acted, failed, expired and waiting.

const run = (
  machine: DeliveryMachine,
  ...steps: { to: string; source: string; reason?: string }[]
): DeliveryMachine => steps.reduce((state, step) => reduceDelivery(state, step), machine);

describe("receipts in order", () => {
  test("should move from queued through shown and taken to acted, recording each source, when the receipts arrive", () => {
    const machine = run(
      deliveryMachine(),
      { to: "shown", source: "mail shown receipt" },
      { to: "taken", source: "queue receipt taken" },
      { to: "acted", source: "queue receipt acted" },
    );

    expect(machine.state).toBe("acted");
    expect(machine.source).toBe("queue receipt acted");
    expect(machine.history.map((step) => `${step.from}>${step.to}`)).toEqual([
      "queued>shown",
      "shown>taken",
      "taken>acted",
    ]);
    expect(machine.rejected).toEqual([]);
    expect(deliveryLabel(machine)).toBe("acted on");
  });

  test("should take a dispatch with no shown receipt when a turn-end pickup takes it", () => {
    const machine = run(deliveryMachine(), { to: "taken", source: "queue receipt taken" });

    expect(machine.state).toBe("taken");
    expect(machine.rejected).toEqual([]);
  });

  test("should wait with its reason and then deliver when automatic wakes are off and later the session picks it up", () => {
    const waiting = run(deliveryMachine(), {
      to: "waiting",
      source: "wake policy",
      reason: "automatic wakes off",
    });

    expect(deliveryLabel(waiting)).toBe("waiting: automatic wakes off");
    const taken = run(waiting, { to: "taken", source: "queue receipt taken" });
    expect(taken.state).toBe("taken");
    expect(deliveryLabel(taken)).toBe("taken");
  });

  test("should name the reason when the receiver marks the dispatch failed", () => {
    const failed = run(
      deliveryMachine(),
      { to: "taken", source: "queue receipt taken" },
      { to: "failed", source: "queue receipt failed", reason: "body-digest-mismatch" },
    );

    expect(deliveryLabel(failed)).toBe("failed: body-digest-mismatch");
  });

  test("should start at the stored record's state when a dispatch is read back", () => {
    const resumed = run(deliveryMachine("taken", "queue receipt taken"), {
      to: "acted",
      source: "queue receipt acted",
    });

    expect(resumed.state).toBe("acted");
    expect(resumed.history).toEqual([
      { from: "taken", to: "acted", source: "queue receipt acted" },
    ]);
  });
});

describe("transitions a state does not allow", () => {
  test("should keep the current state and record the rejected transition when its state does not allow it", () => {
    const start = deliveryMachine();
    const machine = reduceDelivery(start, {
      to: "acted",
      source: "queue receipt acted",
      at: "2026-11-09T05:00:00.000Z",
    });

    expect(machine.state).toBe("queued");
    expect(machine.source).toBe(start.source);
    expect(machine.history).toEqual([]);
    expect(machine.rejected).toEqual([
      {
        from: "queued",
        to: "acted",
        source: "queue receipt acted",
        at: "2026-11-09T05:00:00.000Z",
        problem: "queued cannot become acted; it can become waiting, shown, taken, failed, expired",
      },
    ]);
  });

  test("should keep taken and record the refusal when a late shown receipt arrives after the take", () => {
    const machine = run(
      deliveryMachine(),
      { to: "taken", source: "queue receipt taken" },
      { to: "shown", source: "mail shown receipt" },
    );

    expect(machine.state).toBe("taken");
    expect(machine.rejected.map((one) => `${one.from}>${one.to}`)).toEqual(["taken>shown"]);
  });

  test("should keep a final state and record every later transition when one follows it", () => {
    const acted = run(
      deliveryMachine(),
      { to: "taken", source: "receipt" },
      { to: "acted", source: "receipt" },
      { to: "failed", source: "late receipt" },
    );
    const expired = run(
      deliveryMachine(),
      { to: "expired", source: "expiry sweep" },
      { to: "taken", source: "late take" },
    );

    expect(acted.state).toBe("acted");
    expect(acted.rejected[0]?.problem).toBe("acted is final");
    expect(expired.state).toBe("expired");
    expect(expired.rejected[0]?.problem).toBe("expired is final");
  });

  test("should record the transition as rejected and not throw when it names an unknown state", () => {
    const machine = run(deliveryMachine(), { to: "delivered", source: "unknown receipt" });

    expect(machine.state).toBe("queued");
    expect(machine.rejected[0]).toMatchObject({
      from: "queued",
      to: "delivered",
      problem: "delivered is not a delivery state",
    });
  });
});
