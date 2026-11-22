import { sweepTests, test } from "@sergeiwallace/frontend-test-harness/test";

for (const sweep of sweepTests()) test(sweep.title, sweep.details, sweep.body);
