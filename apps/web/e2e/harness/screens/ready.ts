import { type Page, type ReadyState, readyOn } from "@sergeiwallace/frontend-test-harness";

export const SIGN_IN_HEADING = "Sign in to beads-ui";
export const LINK_GONE_HEADING = "This sign-in link no longer works";

/** The terminal evidence of one view: rendered data, its declared empty state, its error alert. */
export interface ViewEvidence {
  content: string;
  empty?: string;
  error: string;
}

/**
 * Readiness for a signed-in view: nothing under the main region busy, then the view's rendered
 * data, declared empty state or error alert, never the shell alone. A page showing the sign-in
 * page is not this view, and says so at once instead of waiting out the timeout.
 */
export async function viewReady(page: Page, evidence: ViewEvidence): Promise<ReadyState> {
  if (await page.getByRole("heading", { name: SIGN_IN_HEADING }).isVisible()) {
    throw new Error("the page shows the sign-in page, not this view");
  }
  return readyOn(page, { busy: ".app-main [aria-busy='true']", ...evidence });
}

/** Readiness for a server-rendered page: its heading. */
export async function headingReady(page: Page, name: string): Promise<ReadyState> {
  await page.getByRole("heading", { name }).waitFor({ timeout: 30_000 });
  return "content";
}
