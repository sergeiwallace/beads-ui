import type { Page, Screen } from "@sergeiwallace/frontend-test-harness";
import { type ViewEvidence, viewReady } from "./ready.ts";

/** The read each view's data arrives by, for the delayed-data specs (T-1.3). */
export const VIEW_READS: Readonly<Record<string, string>> = {
  board: "**/api/board*",
  backlog: "**/api/board*",
  sprints: "**/api/board*",
  roadmap: "**/api/roadmap*",
  analytics: "**/api/analytics*",
  sessions: "**/api/sessions*",
  review: "**/api/review",
  queue: "**/api/queue-view*",
};

const BOARD_ERROR = "p.app-error[role=alert]";
const VIEW_ERROR = ".app-main > p.bu-read-error[role=alert]";

const main = (page: Page) => page.locator(".app-main");

function view(
  id: string,
  path: string,
  evidence: ViewEvidence,
  extra: Partial<Screen<unknown>> = {},
): Screen<unknown> {
  return {
    id,
    route: () => `/${path}`,
    ready: (page) => viewReady(page, evidence),
    landmarks: {
      nav: (page) => page.getByRole("navigation").first(),
      main,
    },
    scope: ".app-main",
    ...extra,
  };
}

const cards = (page: Page) => page.locator(".app-main li.bu-card");
const tableRows = (page: Page) => page.locator(".app-main table.bu-table tbody tr");

/**
 * The eight views of the nav (VIEWS in client/App.tsx). The Backlog and Sprints views are drawn
 * from the board read and declare no empty state and no busy state, so they are ready only on
 * rendered rows or the error alert: before the board read lands they look exactly like an empty
 * store, which is a state-not-shown defect for the sweep to record, not a state to capture.
 */
export const VIEW_SCREENS: readonly Screen<unknown>[] = [
  view(
    "board",
    "",
    {
      content: ".app-main section.bu-column li.bu-card",
      empty: ".app-main .bu-board[aria-busy='false']",
      error: BOARD_ERROR,
    },
    {
      rows: cards,
      states: {
        async "dialog:command-palette"(page) {
          await page.getByRole("button", { name: /^Commands/ }).click();
          await page.getByRole("dialog", { name: "Command palette" }).waitFor();
        },
        async "menu:move-to"(page) {
          await page
            .getByRole("button", { name: /^Move .+ to$/ })
            .first()
            .click();
          await page.getByRole("menu").waitFor();
        },
      },
    },
  ),
  view(
    "backlog",
    "backlog",
    { content: ".app-main .bu-backlog table.bu-table tbody tr", error: BOARD_ERROR },
    {
      rows: tableRows,
      states: {
        async "menu:owner-picker"(page) {
          await page
            .getByRole("button", { name: /^Owner of / })
            .first()
            .click();
          await page.getByRole("menu").waitFor();
        },
      },
    },
  ),
  view("roadmap", "roadmap", {
    content: ".app-main section.bu-roadmap .bu-roadmap-chart svg",
    empty: ".app-main section.bu-roadmap p.bu-dim[role=status]:text-matches('no epic', 'i')",
    error: VIEW_ERROR,
  }),
  view("analytics", "analytics", { content: ".app-main figure.bu-chart", error: VIEW_ERROR }),
  view("sessions", "sessions", {
    content: ".app-main section.bu-sessions table.bu-table tbody tr",
    empty: ".app-main section.bu-sessions > p.bu-dim",
    error: VIEW_ERROR,
  }),
  view("review", "review", {
    content: ".app-main .bu-review .bu-review-section",
    empty: ".app-main .bu-review p.bu-dim[role=status]",
    error: VIEW_ERROR,
  }),
  view(
    "sprints",
    "sprints",
    {
      content:
        ".app-main .bu-sprint-view li.bu-card, .app-main .bu-sprint-view table.bu-table tbody tr",
      error: BOARD_ERROR,
    },
    {
      rows: (page) =>
        page.locator(
          ".app-main .bu-sprint-view li.bu-card, .app-main .bu-sprint-view table.bu-table tbody tr",
        ),
    },
  ),
  view(
    "queue",
    "queue",
    {
      content: ".app-main ol.bu-queue-rows li.bu-queue-row",
      empty: ".app-main .bu-queue-count:text-matches('^0 ')",
      error: VIEW_ERROR,
    },
    { rows: (page) => page.locator(".app-main ol.bu-queue-rows li.bu-queue-row") },
  ),
];
