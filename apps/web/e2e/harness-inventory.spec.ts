import { readFile } from "node:fs/promises";
import {
  builtinProbes,
  checkInventory,
  isFaultJourney,
} from "@sergeiwallace/frontend-test-harness";
import { expect, test } from "./fixtures.ts";
import { beadsUiAdapter } from "./harness/adapter.ts";
import { beadsUiFaults } from "./harness/faults.ts";

// The finite journey inventory (frontend test harness design, T-1.4 and T-1.7). This runs in the
// ordinary suite on any host: it boots nothing.

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "the inventory is checked once");
});

const journeys = beadsUiAdapter.journeys;

test("should map every supported route, mutation, dialog and menu, keyboard and touch path, declared state and spec title to a journey or named probe that exists", async () => {
  const report = checkInventory(journeys.inventory, await beadsUiAdapter.surfaces(), {
    journeys: journeys.all().map((journey) => journey.id),
    probes: builtinProbes.map((probe) => probe.id),
  });
  expect(report.problems).toEqual([]);
  expect(report.rows).toBe(report.surfaces);
});

test("should cover every fault and stress row with a journey tagged fault or stress, the backend faults through slowBd, failingBd and lockedBd", async () => {
  const rows = journeys.inventory.filter(
    (row) => row.kinds.includes("fault") || row.kinds.includes("stress"),
  );
  expect(rows.map((row) => row.surface).sort()).toEqual(
    [
      "fault:failing-backend",
      "fault:feed-drop",
      "fault:offline",
      "fault:serialised-backend",
      "fault:server-restart",
      "fault:session-expiry",
      "fault:slow-backend",
      "stress:double-submit",
      "stress:large-data",
      "stress:rapid-navigation",
      "stress:two-tabs",
    ].sort(),
  );
  for (const row of rows) {
    expect(row.coveredBy.kind, row.id).toBe("journey");
    const journey = journeys.get(row.coveredBy.id);
    expect(isFaultJourney(journey), row.id).toBe(true);
    expect(
      journey.tags.some((tag) => tag === "fault" || tag === "stress"),
      row.id,
    ).toBe(true);
  }
  const source = await readFile(new URL("./harness/faults.ts", import.meta.url), "utf8");
  for (const [fault, wrapper] of [
    ["slow-backend", "slowBd("],
    ["failing-backend", "failingBd("],
    ["serialised-backend", "lockedBd("],
  ] as const) {
    expect(beadsUiFaults.map((injector) => injector.id)).toContain(fault);
    const body = source.slice(source.indexOf(`id: "${fault}"`));
    expect(
      body.slice(0, body.indexOf("},\n  {") === -1 ? undefined : body.indexOf("},\n  {")),
    ).toContain(wrapper);
  }
});
