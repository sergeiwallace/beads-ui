import { sweepTests, test } from "@sergeiwallace/frontend-test-harness/test";

// The sweep (frontend test harness design, T-1.4): every screen at seven windows and two zoom
// emulations in light and dark, every journey in light, the fault and stress journeys at 1280 and
// 390, the inventory check and the budget step. Its tests run only in the sweep tier's projects,
// on a host FTH_HEAVY_HOSTS names: `fth run --tier sweep` in apps/web/e2e.
for (const sweep of sweepTests()) test(sweep.title, sweep.details, sweep.body);
