import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { createStore } from "../test/store.ts";
import { card, expect, loginLink, serve, test } from "./fixtures.ts";

// T-W3.1: one Server-Sent Events connection per browser, shared by its tabs, and taken over
// when the tab holding it closes. The served store's poll interval is the default, 10 seconds.
const POLL_INTERVAL_MS = 10_000;
/** How long one poll may take on a loaded host: the heads, then the moved store's board read. */
const POLL_TAKES_MS = 30_000;

/**
 * The feed reads every head once when the first stream opens, and reports moves from there on, so
 * a spec waits out that first poll before it makes the change it expects to hear about.
 */
const firstPoll = (page: Page) => page.waitForTimeout(POLL_INTERVAL_MS);

const role = (page: Page) => page.locator("html").getAttribute("data-feed-role");
const seen = async (page: Page) =>
  Number((await page.locator("html").getAttribute("data-feed-seen")) ?? "0");

test.describe("live updates across tabs", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "tabs are a desktop browser's; the feed is the same at 390 px");
    // Each case waits out a first poll and then hears a change: two poll intervals and more.
    test.setTimeout(150_000);
  });

  test("should hold one event stream for two tabs and deliver each change to both", async ({
    app,
    page,
  }) => {
    await expect(page.locator("html")).toHaveAttribute("data-feed-role", "holder");
    const second = await page.context().newPage();
    const streams: string[] = [];
    second.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/api/events")) streams.push(request.url());
    });
    await second.goto(app.url);
    await expect(second.locator("html")).toHaveAttribute("data-feed-role", "follower");
    expect(await role(page)).toBe("holder");

    await firstPoll(page);
    const before = [await seen(page), await seen(second)];
    const id = await app.store.create("Made by another actor");
    const heard = { timeout: POLL_INTERVAL_MS + POLL_TAKES_MS };
    await expect.poll(() => seen(page), heard).toBeGreaterThan(before[0] ?? 0);
    await expect.poll(() => seen(second), heard).toBeGreaterThan(before[1] ?? 0);
    for (const tab of [page, second]) await expect(card(tab, id)).toBeVisible();
    // The second tab got both changes through the first tab's stream, never one of its own.
    expect(streams).toEqual([]);
    await second.close();
  });

  test("should hand the stream to another open tab within the poll interval when the holding tab closes", async ({
    app,
    page,
  }) => {
    await expect(page.locator("html")).toHaveAttribute("data-feed-role", "holder");
    const second = await page.context().newPage();
    await second.goto(app.url);
    await expect(second.locator("html")).toHaveAttribute("data-feed-role", "follower");

    const opened = second.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith("/api/events"),
    );
    const closed = Date.now();
    await page.close();
    await expect(second.locator("html")).toHaveAttribute("data-feed-role", "holder", {
      timeout: POLL_INTERVAL_MS,
    });
    await opened;
    expect(Date.now() - closed).toBeLessThan(POLL_INTERVAL_MS);

    await firstPoll(second);
    const before = await seen(second);
    const id = await app.store.create("Made after the takeover");
    await expect
      .poll(() => seen(second), { timeout: POLL_INTERVAL_MS + POLL_TAKES_MS })
      .toBeGreaterThan(before);
    await expect(card(second, id)).toBeVisible();
    await second.close();
  });
});

// T-W3.2: the member duties a browser sees, the base path app-portal mounts the app at included.
test.describe("the app as an app-portal member", () => {
  test("should load the Board under /beads with every asset and API call under it, and register no service worker", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the shell is the same at 390 px");
    const store = await createStore("portal");
    const configHome = await mkdtemp(join(tmpdir(), "beads-ui-e2e-config-"));
    const id = await store.create("Under the base path");
    const served = await serve(store.dir, configHome, { extra: '[web]\nbase_path = "/beads"\n' });
    try {
      expect(served.output()).toMatch(/at http:\/\/127\.0\.0\.1:\d+\/beads\//);
      const root = new URL("/beads/", served.url).href;
      const outside: string[] = [];
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        // The browser asks for /favicon.ico on its own; everything the app asks for is below /beads/.
        if (!path.startsWith("/beads/") && path !== "/favicon.ico") outside.push(path);
      });
      const link = await loginLink(served);
      expect(new URL(link).pathname.startsWith("/beads/api/auth/")).toBe(true);
      await page.goto(link);
      await expect(card(page, id)).toBeVisible();
      // A deep link below the base gets the shell, and the shell's assets and API calls follow it.
      await page.goto(new URL("backlog", root).href);
      await expect(page.locator(`tr[data-row-id="${id}"]`)).toBeVisible();
      await page.goto(new URL(`issues/${encodeURIComponent(id)}`, root).href);
      await expect(
        page.locator("article.bu-detail").getByRole("heading", { name: "Under the base path" }),
      ).toBeVisible();
      expect(outside).toEqual([]);

      const registrations = await page.evaluate(async () =>
        "serviceWorker" in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : 0,
      );
      expect(registrations).toBe(0);
      // The link's href as the browser resolves it, against the shell's <base>.
      const href = await page.evaluate(
        () => document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href ?? "",
      );
      const manifest = await page.request.get(href);
      expect(manifest.status()).toBe(200);
      expect(new URL(manifest.url()).pathname).toBe("/beads/manifest.webmanifest");
    } finally {
      await served.stop();
      await store.remove();
      // bd may still be writing its event log under the private HOME (fixtures.ts, configHome).
      await rm(configHome, { recursive: true, maxRetries: 10, retryDelay: 200 });
    }
  });
});
