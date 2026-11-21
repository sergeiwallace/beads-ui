import type { FaultInjector, Page, RunningApp } from "@sergeiwallace/frontend-test-harness";
import { failingBd, type LockedBd, lockedBd, slowBd } from "../../test/store.ts";
import { type BeadsCtx, hostCommand, restartWith, sessionLabels, stopServer } from "./adapter.ts";

// beads-ui's fault catalogue (frontend test harness design, Faults and stress). `offline` is the
// library's own; each fault here ends when the function inject() returns is called.

const beads = (app: RunningApp) => app as RunningApp<BeadsCtx>;

/** The bd subcommands each view reads with, so a backend fault reaches the reads a journey makes. */
export const READ_SUBCOMMANDS = ["list", "show", "ready", "export", "query"] as const;
/** The bd subcommands a browser write runs. */
export const WRITE_SUBCOMMANDS = ["update", "close", "reopen"] as const;

/** The serialised backend a journey made, for counting the bd writes it let through. */
let lastLocked: LockedBd | undefined;
export const lockedCalls = () => lastLocked?.calls;

/** A page shows the stale banner within `ms`, or the fault never took hold. */
async function staleBanner(page: Page, ms: number): Promise<boolean> {
  return page
    .locator(".app-stale")
    .waitFor({ timeout: ms })
    .then(
      () => true,
      () => false,
    );
}

export const beadsUiFaults: readonly FaultInjector[] = [
  {
    id: "feed-drop",
    async inject(_app, page) {
      // Hold every reconnect, then end the stream already open with a short offline pulse.
      const abort = (route: import("@playwright/test").Route) => route.abort();
      await page.route("**/api/events", abort);
      await page.context().setOffline(true);
      await page.waitForTimeout(2_000);
      await page.context().setOffline(false);
      if (!(await staleBanner(page, 30_000))) {
        await page.unroute("**/api/events", abort);
        throw new Error(
          "fault not injected: the stale banner never appeared after the feed dropped",
        );
      }
      return async () => {
        await page.unroute("**/api/events", abort);
      };
    },
  },
  {
    id: "server-restart",
    async inject(app) {
      const start = await stopServer(beads(app));
      return start;
    },
  },
  {
    id: "session-expiry",
    async inject(app) {
      for (const label of sessionLabels(beads(app))) {
        await hostCommand(beads(app), ["revoke-session", "--label", label]).catch(() => undefined);
      }
      return async () => undefined;
    },
  },
  {
    id: "slow-backend",
    async inject(app) {
      const wrapped = await slowBd(READ_SUBCOMMANDS, 3);
      await restartWith(beads(app), { PATH: wrapped.env.PATH });
      return async () => {
        await restartWith(beads(app), { PATH: process.env.PATH });
        await wrapped.remove();
      };
    },
  },
  {
    id: "failing-backend",
    async inject(app) {
      const wrapped = await failingBd([...READ_SUBCOMMANDS, ...WRITE_SUBCOMMANDS]);
      await restartWith(beads(app), { PATH: wrapped.env.PATH });
      return async () => {
        await restartWith(beads(app), { PATH: process.env.PATH });
        await wrapped.remove();
      };
    },
  },
  {
    id: "serialised-backend",
    async inject(app) {
      const wrapped = await lockedBd([...READ_SUBCOMMANDS, ...WRITE_SUBCOMMANDS], 1);
      lastLocked = wrapped;
      await restartWith(beads(app), { PATH: wrapped.env.PATH });
      // A journey reads lockedCalls() before it ends the fault; ending it removes the wrapper.
      return async () => {
        await restartWith(beads(app), { PATH: process.env.PATH });
        await wrapped.remove();
        lastLocked = undefined;
      };
    },
  },
];
