// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  CARRIERS,
  DEFAULT_DISPATCH_POLICY,
  dispatchPointer,
  goalHold,
  HOUR_MS,
  parseGoalReport,
  parseWakePolicy,
  planDelivery,
  rateCheck,
  resolveDispatchPolicy,
  rungSummary,
} from "../src/index.ts";

// T-W2.1 and T-W2.3 of the web app design (D-6, D-7, D-10, § Configuration): the policy one
// dispatch's delivery follows, read from beads-ui.toml and the target host's wake policy.

const ON = { state: "on" } as const;
const OFF = { state: "off" } as const;

describe("the dispatch policy in beads-ui.toml", () => {
  test("should use the documented defaults when beads-ui.toml is absent or has no [dispatch]", () => {
    for (const text of [undefined, '[web]\nhost = "127.0.0.1"\n']) {
      const read = resolveDispatchPolicy(text);
      expect(read).toEqual({ ok: true, policy: DEFAULT_DISPATCH_POLICY });
    }
    expect(DEFAULT_DISPATCH_POLICY).toMatchObject({
      coalesceWindowS: 20,
      maxPerSessionPerHour: 30,
      shownWithinS: 60,
      carriers: ["agent-mail", "buzz", "git-inbox"],
      local: ["notifier", "prompt-injection", "mod-submit", "turn-end"],
    });
  });

  test("should read the window, the cap, the shown deadline and both orders when they are set", () => {
    const read = resolveDispatchPolicy(
      [
        "[dispatch]",
        "coalesce_window_s = 5",
        "max_per_session_per_hour = 3",
        "shown_within_s = 10",
        "[dispatch.carriers]",
        'order = ["buzz", "agent-mail"]',
        'git_inbox_payload = "pointer"',
        "[dispatch.local]",
        'order = ["notifier", "mod-submit", "turn-end"]',
      ].join("\n"),
    );
    expect(read).toEqual({
      ok: true,
      policy: {
        coalesceWindowS: 5,
        maxPerSessionPerHour: 3,
        shownWithinS: 10,
        carriers: ["buzz", "agent-mail"],
        local: ["notifier", "mod-submit", "turn-end"],
      },
    });
  });

  test("should be unreadable, naming the setting, when a value is not one the ladder can follow", () => {
    const cases: [string, RegExp][] = [
      ["[dispatch]\ncoalesce_window_s = -1", /coalesce_window_s must be a whole number/],
      ["[dispatch]\nmax_per_session_per_hour = 0", /max_per_session_per_hour/],
      ['[dispatch]\nshown_within_s = "soon"', /shown_within_s/],
      ['[dispatch.carriers]\norder = ["agent-mail", "pigeon"]', /"pigeon", not one of/],
      ['[dispatch.carriers]\norder = ["buzz", "buzz"]', /buzz twice/],
      ['[dispatch.local]\norder = ["notifier", "prompt-injection"]', /must keep turn-end/],
      ['[dispatch.carriers]\ngit_inbox_payload = "body"', /can only be "pointer"/],
      ["[dispatch\n", /line 1/],
    ];
    for (const [text, reason] of cases) {
      const read = resolveDispatchPolicy(text);
      expect(read.ok, text).toBe(false);
      if (!read.ok) expect(read.reason, text).toMatch(reason);
    }
  });
});

describe("the target host's wake policy", () => {
  test("should read automatic_wakes as on or off from the wake policy file's JSON", () => {
    expect(parseWakePolicy('{"schema":1,"automatic_wakes":true}')).toEqual(ON);
    expect(parseWakePolicy('{"schema":1,"automatic_wakes":false,"incident_after_s":300}')).toEqual(
      OFF,
    );
    expect(parseWakePolicy('{"automatic_wakes":true}')).toEqual(ON);
  });

  test("should be unreadable, never on, when the file is not the policy it should be", () => {
    for (const text of [
      "",
      "not json",
      "[]",
      '{"automatic_wakes":"yes"}',
      '{"schema":2,"automatic_wakes":true}',
    ]) {
      expect(parseWakePolicy(text).state, text).toBe("unreadable");
    }
  });
});

describe("one delivery's plan", () => {
  const policy = resolveDispatchPolicy(undefined);

  test("should send every carrier in order and keep the active rungs when automatic wakes are on", () => {
    expect(planDelivery(policy, ON)).toEqual({
      mode: "active",
      carriers: [...CARRIERS],
      local: ["prompt-injection", "mod-submit"],
    });
  });

  test("should still send the carriers but use no active rung and say why while automatic wakes are off", () => {
    expect(planDelivery(policy, OFF)).toEqual({
      mode: "passive",
      carriers: [...CARRIERS],
      waiting: "automatic wakes off",
    });
  });

  test("should deliver at the next turn end only, with the reason, when the dispatch policy is unreadable", () => {
    const plan = planDelivery(resolveDispatchPolicy("[dispatch]\nshown_within_s = 0"), ON);
    expect(plan.mode).toBe("turn-end");
    if (plan.mode === "turn-end") {
      expect(plan.reason).toMatch(/^the dispatch policy is unreadable: dispatch.shown_within_s/);
    }
  });

  test("should deliver at the next turn end only, with the reason, when the wake policy is unreadable", () => {
    const plan = planDelivery(policy, { state: "unreadable", reason: "no wake policy for host-b" });
    expect(plan).toEqual({
      mode: "turn-end",
      reason: "the target host's wake policy is unreadable: no wake policy for host-b",
    });
  });

  test("should follow the configured local order, and send no carrier when the notifier is left out", () => {
    const plan = planDelivery(
      resolveDispatchPolicy(
        '[dispatch.local]\norder = ["mod-submit", "prompt-injection", "turn-end"]',
      ),
      ON,
    );
    expect(plan).toEqual({
      mode: "active",
      carriers: [],
      local: ["mod-submit", "prompt-injection"],
    });
  });
});

describe("the per-session rate cap", () => {
  const now = 10 * HOUR_MS;

  test("should let a dispatch go while fewer than the cap were sent in the trailing hour", () => {
    expect(rateCheck([now - 1000, now - 2000], now, 3)).toEqual({ held: false, count: 2 });
    expect(rateCheck([now - HOUR_MS, now - HOUR_MS - 1, now - 5], now, 2)).toEqual({
      held: false,
      count: 1,
    });
  });

  test("should hold the next dispatch at the cap until the oldest counted one leaves the hour", () => {
    const check = rateCheck([now - 30_000, now - 20_000, now - 10_000], now, 3);
    expect(check.held).toBe(true);
    if (check.held) {
      expect(check.releaseAt).toBe(now - 30_000 + HOUR_MS);
      expect(check.reason).toMatch(
        /3 dispatches to this session in the last hour reached max_per_session_per_hour = 3/,
      );
    }
  });
});

describe("a receiving session's goal", () => {
  const now = "2026-11-09T12:00:00.000Z";

  test("should hold a dispatch while the goal is paused and its pause window has not ended", () => {
    expect(goalHold({ state: "paused", at: now, until: "2026-11-09T13:00:00.000Z" }, now)).toEqual({
      held: true,
      reason: "goal paused",
      until: "2026-11-09T13:00:00.000Z",
    });
    expect(goalHold({ state: "paused", at: now }, now)).toEqual({
      held: true,
      reason: "goal paused",
    });
  });

  test("should not hold once the goal is active, there is none, or the pause window has ended", () => {
    expect(goalHold({ state: "active", at: now }, now)).toEqual({ held: false });
    expect(goalHold({ state: "none", at: now }, now)).toEqual({ held: false });
    expect(goalHold(undefined, now)).toEqual({ held: false });
    expect(goalHold({ state: "paused", at: now, until: "2026-11-09T11:59:59.000Z" }, now)).toEqual({
      held: false,
    });
  });

  test("should refuse a goal report that names no known state or a pause end that is not a UTC time", () => {
    expect(parseGoalReport({ state: "sleeping" }, now)).toMatch(/state must be/);
    expect(parseGoalReport({ state: "paused", until: "tomorrow" }, now)).toMatch(/until must be/);
    expect(parseGoalReport({ state: "paused", until: "2026-11-09T13:00:00Z" }, now)).toEqual({
      state: "paused",
      at: now,
      until: "2026-11-09T13:00:00Z",
    });
  });
});

describe("what a carrier says", () => {
  test("should name each dispatch by id and digest and carry nothing else", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const pointer = dispatchPointer([
      { id: "01J0000000000000000000000A", body_digest: digest },
      { id: "01J0000000000000000000000B", body_digest: digest },
    ]);
    expect(pointer.subject).toBe(
      "beads-ui dispatches 01J0000000000000000000000A, 01J0000000000000000000000B",
    );
    expect(pointer.text.split("\n")).toEqual([
      `beads-ui dispatch 01J0000000000000000000000A ${digest}`,
      `beads-ui dispatch 01J0000000000000000000000B ${digest}`,
    ]);
  });

  test("should name the rung that delivered and every rung that failed with its reason", () => {
    const at = "2026-11-09T12:00:00.000Z";
    expect(
      rungSummary([
        { rung: "agent-mail", outcome: "failed", detail: "exit 1: board unreachable", at },
        { rung: "buzz", outcome: "sent", detail: "exit 0", at },
      ]),
    ).toBe("delivered by buzz; agent-mail failed (exit 1: board unreachable)");
    expect(
      rungSummary([
        { rung: "prompt-injection", outcome: "failed", detail: "no pane", at },
        { rung: "mod-submit", outcome: "skipped", detail: "not configured", at },
        { rung: "turn-end", outcome: "sent", detail: "every active rung failed", at },
      ]),
    ).toBe(
      "left for turn-end pickup; prompt-injection failed (no pane); mod-submit skipped (not configured)",
    );
    expect(rungSummary([])).toBeUndefined();
  });
});
