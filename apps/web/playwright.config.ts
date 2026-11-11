import { defineConfig, devices } from "@playwright/test";
import { testJobs } from "../../scripts/test-jobs.mjs";

// Phase 3's exit gate: every spec at 1280 px with a mouse and at 390 px on a touch screen.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // The budget for what the page and the server do. Every spec also makes a real store and server
  // and runs bd itself; e2e/fixtures.ts runs that setup outside the budget (`unbudgeted`), since on
  // a loaded host each bd process can take seconds.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // Each test runs its own bd store and server; bd's embedded Dolt is heavy, so BEADS_UI_TEST_JOBS
  // bounds the workers (docs/procedures/web-run.md, Test it).
  workers: testJobs(),
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "touch-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
