import { fileURLToPath } from "node:url";
import { defineHarnessConfig } from "@sergeiwallace/frontend-test-harness/test";
import { testJobs } from "../../../scripts/test-jobs.mjs";
import { beadsUiAdapter } from "./harness/adapter.ts";
import { beadsUiFaults } from "./harness/faults.ts";
import { navLink, TABS } from "./harness/journeys.ts";

const BD_CALL_MS = 10_000;
const REFRESH_MS = 10_000;
const SETTLE_MS = 5_000;
const ONE_BD_RETRY_MS = BD_CALL_MS + REFRESH_MS + BD_CALL_MS + SETTLE_MS;

const heavyHosts = (process.env.FTH_HEAVY_HOSTS ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter((name) => name !== "");
const heavyRoute =
  process.env.FTH_HEAVY_ROUTE ??
  "Heavy runs need a host named in FTH_HEAVY_HOSTS. Ask its operator to run the step, naming the beads-ui commit, the library tag and where the results should go, or set FTH_HEAVY_ROUTE on this host to the route your team uses.";

export default defineHarnessConfig({
  adapter: beadsUiAdapter,
  root: fileURLToPath(new URL(".", import.meta.url)),
  extensions: { faults: beadsUiFaults },
  tiers: {
    smoke: {
      cells: "projects:desktop-1280,touch-390",
      probes: ["health", "capture", "timing", "axe"],
      budgets: "relative",
    },
    sweep: {
      cells: {
        screens: "viewports:*;zoom:*;schemes:*;data:typical;browser:chromium",
        journeys: "viewports:*;zoom:*;scheme:light;data:typical;browser:chromium",
      },
      probes: "all",
    },
    budget: { cells: "budget-step", probes: ["timing"], budgets: "absolute" },
  },
  budgets: "./qa/budgets.json",
  heavyHosts,
  heavyRoute,
  contention: { command: "machine-contention status --json" },
  tabs: {
    home: "board",
    screens: TABS.slice(1).map((tab) => tab.screen),
    async open(page, screen) {
      const tab = TABS.find((entry) => entry.screen === screen);
      if (tab === undefined) throw new Error(`no nav tab for ${screen}`);
      await navLink(tab.label)(page).click();
    },
    controls: TABS.map((tab) => navLink(tab.label)),
  },
  playwright: {
    testDir: ".",
    globalSetup: "./global-setup.ts",
    timeout: 90_000,
    expect: { timeout: ONE_BD_RETRY_MS },
    fullyParallel: true,
    workers: testJobs(),
    reporter: [["list"]],
  },
});
