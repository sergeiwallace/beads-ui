import { fileURLToPath } from "node:url";
import { defineHarnessConfig } from "@sergeiwallace/frontend-test-harness/test";
import { testJobs } from "../../../scripts/test-jobs.mjs";
import { beadsUiAdapter } from "./harness/adapter.ts";
import { beadsUiFaults } from "./harness/faults.ts";
import { navLink, TABS } from "./harness/journeys.ts";

// The browser suites' config (frontend test harness design, D-16). FTH_TIER picks the tier:
// smoke (the default, what npm run test:e2e and the pre-commit and pre-push gates run) is every
// spec at 1280 px with a mouse and at 390 px on a touch screen, with the cheap probes at each
// screen a spec reaches. The sweep and budget tiers run on fw-lnx alone, through fth run.
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
  heavyHosts: ["fw-lnx"],
  heavyRoute:
    "Heavy runs go through the cross-host route (design D-17): one git-inbox send to aih-fw-firstmate-hal@fw-lnx with subject `RE: fth request <request-id>`, naming the host, the step, the beads-ui commit, the library tag, the branch any files go to and your address for the reply.",
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
    // The budget for what the page and the server do. Every spec also makes a real store and
    // server and runs bd itself; fixtures.ts runs that setup outside the budget (`unbudgeted`),
    // since on a loaded host each bd process can take seconds.
    timeout: 90_000,
    expect: { timeout: 15_000 },
    fullyParallel: true,
    // Each test runs its own bd store and server; bd's embedded Dolt is heavy, so
    // BEADS_UI_TEST_JOBS bounds the workers (docs/procedures/web-run.md, Test it).
    workers: testJobs(),
    reporter: [["list"]],
  },
});
