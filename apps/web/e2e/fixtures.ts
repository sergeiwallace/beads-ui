import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test as harness } from "@sergeiwallace/frontend-test-harness/test";
import { createStore, type TestStore } from "../test/store.ts";
import { BIN, loginLink, type Served, type ServeOptions, serve } from "./harness/adapter.ts";

export { BIN, loginLink, type Served, type ServeOptions, serve };

/**
 * Runs a spec's own setup outside the test's budget: once `work` settles, the running test's
 * timeout grows by the time it took. The budget then pays for what the page and the server do,
 * however slow a loaded host makes `bd init` and the spec's own bd calls, each of which is bounded
 * by its own timeout (test/store.ts). Work that hangs still runs out the budget it started in.
 */
export async function unbudgeted<T>(work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    const info = harness.info();
    info.setTimeout(info.timeout + (Date.now() - started));
  }
}

/** `store` with every bd call it makes run outside the test's budget. */
export function unbudgetedStore(store: TestStore): TestStore {
  return {
    dir: store.dir,
    bd: (...args) => unbudgeted(() => store.bd(...args)),
    create: (title, options) => unbudgeted(() => store.create(title, options)),
    show: (id) => unbudgeted(() => store.show(id)),
    remove: () => store.remove(),
  };
}

/** Signs `page` in through a fresh link; the page lands on the Board. */
export async function signIn(page: Page, served: Served): Promise<void> {
  await page.goto(await unbudgeted(() => loginLink(served)));
}

/**
 * Gives `page` a session through a fresh link without opening a view: the page's request context
 * follows the link and keeps the cookie. A spec that starts on another view skips the Board read a
 * landing would start, which the server would go on running beside the view's own read.
 */
export async function authorize(page: Page, served: Served): Promise<void> {
  const link = await unbudgeted(() => loginLink(served));
  const reply = await page.request.get(link, { maxRedirects: 0 });
  expect(reply.status(), "the sign-in link's exchange").toBe(303);
}

export interface App {
  store: TestStore;
  served: Served;
  url: string;
}

export const test = harness.extend<{
  configHome: string;
  /** A served store, not signed in. */
  served: Served & { store: TestStore };
  /** A served store with the page signed in. */
  app: App;
  /** A served store whose page holds a session and has opened no view yet. */
  signedIn: App;
}>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern.
  configHome: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "beads-ui-e2e-config-"));
    await use(dir);
    await rm(dir, { recursive: true, maxRetries: 10, retryDelay: 200 });
  },
  served: async ({ configHome }, use) => {
    const { store, served } = await unbudgeted(async () => {
      const store = await createStore("e2e");
      return { store, served: await serve(store.dir, configHome) };
    });
    await use(Object.assign(served, { store: unbudgetedStore(store) }));
    await served.stop();
    await store.remove();
  },
  app: async ({ served, page }, use) => {
    await signIn(page, served);
    await use({ store: served.store, served, url: served.url });
  },
  signedIn: async ({ served, page }, use) => {
    await authorize(page, served);
    await use({ store: served.store, served, url: served.url });
  },
});

export { expect };

/** The Board column for a status. */
export const column = (page: Page, status: string) =>
  page.locator(`section.bu-column[data-status="${status}"]`);

/** A card by its issue id. */
export const card = (page: Page, id: string) => page.locator(`li.bu-card[data-card-id="${id}"]`);

/** The card ids of a column, top to bottom. */
export async function columnIds(page: Page, status: string) {
  return column(page, status)
    .locator("li.bu-card")
    .evaluateAll((cards) => cards.map((element) => element.getAttribute("data-card-id")));
}

/**
 * The response to the page's next write to an issue. A spec waits for it rather than polling the
 * store: an embedded store runs one bd process at a time, so a polling spec would queue its own
 * reads in front of the write it is waiting for.
 */
export const written = (page: Page, id: string, kind: "status" | "priority" | "rank") =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/issues/${id}/${kind}`,
  );
