import { join } from "node:path";
import type { Screen } from "@sergeiwallace/frontend-test-harness";
import { viewReady } from "./ready.ts";

/** The held item the adapter's fixture holds inside the served store (adapter.ts heldFixture). */
const heldItemPath = (store: string) => join(store, "docs", "held", "detail.md");

export const DETAIL_READS: Readonly<Record<string, string>> = {
  "issue-detail": "**/api/issues/**",
  held: "**/api/held/item*",
};

/** The issue detail and the held item detail, each opened from a record the run made. */
export const DETAIL_SCREENS: readonly Screen<unknown>[] = [
  {
    id: "issue-detail",
    route: (params) =>
      `/issues/${encodeURIComponent(String((params as { id?: string } | undefined)?.id ?? ""))}`,
    async open(page, { app, seed, signIn }) {
      const id = seed?.records[0]?.id;
      if (id === undefined) throw new Error("the issue detail needs a seeded issue to open");
      await signIn();
      await page.goto(new URL(`issues/${encodeURIComponent(id)}`, app.url).toString());
    },
    ready: (page) =>
      viewReady(page, {
        content: ".app-main article.bu-detail h1.bu-detail-title",
        error:
          ".app-main article.bu-detail p.bu-read-error[role=alert], .app-main > p.bu-read-error[role=alert]",
      }),
    landmarks: { detail: (page) => page.locator(".app-main article.bu-detail") },
    scope: ".app-main",
  },
  {
    id: "held",
    route: (params) =>
      `/held?path=${encodeURIComponent(String((params as { path?: string } | undefined)?.path ?? ""))}`,
    async open(page, { app, signIn }) {
      const store = (app.ctx as { served?: { cwd: string } }).served?.cwd;
      if (store === undefined) throw new Error("the held item screen needs a served store");
      await signIn();
      const path = heldItemPath(store);
      await page.goto(new URL(`held?path=${encodeURIComponent(path)}`, app.url).toString());
    },
    ready: (page) =>
      viewReady(page, {
        content: ".app-main article.bu-held-detail .bu-held-body",
        error:
          ".app-main article.bu-held-detail p.bu-read-error[role=alert], .app-main > p.bu-read-error[role=alert]",
      }),
    landmarks: { detail: (page) => page.locator(".app-main article.bu-held-detail") },
    scope: ".app-main",
  },
];
