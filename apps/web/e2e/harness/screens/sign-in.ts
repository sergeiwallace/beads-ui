import { randomBytes } from "node:crypto";
import type { Screen } from "@sergeiwallace/frontend-test-harness";
import { headingReady, LINK_GONE_HEADING, SIGN_IN_HEADING, viewReady } from "./ready.ts";

const EXCHANGE = "api/auth/v1/exchange";

/**
 * The pages a person meets before a session: the signed-out page, and a sign-in link fresh (it
 * lands on the Board), used (opened a second time) and expired (a code the server no longer
 * holds, which it answers exactly as it answers one past its five minutes).
 */
export const SIGN_IN_SCREENS: readonly Screen<unknown>[] = [
  {
    id: "signed-out",
    route: () => "/",
    async open(page, { app }) {
      await page.goto(app.url.toString());
    },
    ready: (page) => headingReady(page, SIGN_IN_HEADING),
    landmarks: { heading: (page) => page.getByRole("heading", { name: SIGN_IN_HEADING }) },
  },
  {
    id: "sign-in-link-fresh",
    route: () => `/${EXCHANGE}`,
    async open(_page, { signIn }) {
      await signIn();
    },
    ready: (page) =>
      viewReady(page, {
        content: ".app-main section.bu-column li.bu-card",
        empty: ".app-main .bu-board[aria-busy='false']",
        error: "p.app-error[role=alert]",
      }),
    landmarks: { main: (page) => page.locator(".app-main") },
    scope: ".app-main",
  },
  {
    id: "sign-in-link-used",
    route: () => `/${EXCHANGE}`,
    async open(page, { app }) {
      const { beadsUiAdapter } = await import("../adapter.ts");
      const { url } = await beadsUiAdapter.signInUrl(app as never);
      await page.goto(url);
      await page.getByRole("button", { name: "Sign out" }).waitFor();
      await page.goto(url);
    },
    ready: (page) => headingReady(page, LINK_GONE_HEADING),
    landmarks: { heading: (page) => page.getByRole("heading", { name: LINK_GONE_HEADING }) },
  },
  {
    id: "sign-in-link-expired",
    route: () => `/${EXCHANGE}`,
    async open(page, { app }) {
      const code = randomBytes(32).toString("base64url");
      await page.goto(new URL(`${EXCHANGE}?code=${code}`, app.url).toString());
    },
    ready: (page) => headingReady(page, LINK_GONE_HEADING),
    landmarks: { heading: (page) => page.getByRole("heading", { name: LINK_GONE_HEADING }) },
  },
];
