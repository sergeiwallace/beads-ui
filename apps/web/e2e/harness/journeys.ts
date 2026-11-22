import { readFile } from "node:fs/promises";
import {
  doubleClick,
  type Journey,
  type JourneyContext,
  type Page,
  rapidNavigation,
  UnsupportedShape,
} from "@sergeiwallace/frontend-test-harness";
import { lockedCalls } from "./faults.ts";
import { screens } from "./screens/index.ts";

/** The nav tabs in the order the nav lists them (VIEWS in client/App.tsx). */
export const TABS: readonly { screen: string; label: string }[] = [
  { screen: "board", label: "Board" },
  { screen: "backlog", label: "Backlog" },
  { screen: "roadmap", label: "Roadmap" },
  { screen: "analytics", label: "Analytics" },
  { screen: "sessions", label: "Sessions" },
  { screen: "review", label: "Review" },
  { screen: "sprints", label: "Sprints" },
  { screen: "queue", label: "Queue" },
];

export const navLink = (label: string) => (page: Page) =>
  page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: label, exact: true });

export async function showViews(page: Page): Promise<void> {
  if (await page.getByRole("navigation", { name: "Views" }).isVisible()) return;
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("navigation", { name: "Views" }).waitFor();
}

/** Opens a nav tab and waits for its screen's terminal state. */
export async function openTab(page: Page, screen: string): Promise<void> {
  const tab = TABS.find((entry) => entry.screen === screen);
  if (tab === undefined) throw new Error(`no nav tab for ${screen}`);
  await showViews(page);
  await navLink(tab.label)(page).click();
  await screens.get(screen).ready(page);
}

/** The first open card's Move menu, opened. */
async function openMoveMenu(page: Page) {
  const column = page.locator('.app-main section.bu-column[data-status="open"]');
  await column
    .getByRole("button", { name: /^Move .+ to$/ })
    .first()
    .click();
  return page.getByRole("menu");
}

/** Moves the first open card to in_progress through its Move menu; resolves on the write's reply. */
async function moveFirstCard(page: Page, timeout = 30_000) {
  const menu = await openMoveMenu(page);
  const reply = page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/api\/issues\/[^/]+\/status$/.test(new URL(response.url()).pathname),
      { timeout },
    )
    .catch(() => undefined);
  await menu.getByRole("menuitem", { name: "in_progress" }).click();
  return reply;
}

/** The user-visible notice of a failure: an alert, a toast or the stale banner, or none. */
async function notice(page: Page, timeout = 10_000): Promise<string | undefined> {
  const shown = page.locator("[role=alert], .app-stale, .bu-toast").first();
  return shown
    .waitFor({ timeout })
    .then(async () => (await shown.innerText()).trim() || "(a notice with no text)")
    .catch(() => undefined);
}

const busy = async (page: Page) => (await page.locator(".app-main [aria-busy='true']").count()) > 0;

const recovered = async (page: Page, screen = "board") =>
  screens
    .get(screen)
    .ready(page)
    .then((state) => state === "content")
    .catch(() => false);

/** Writes that reached the server: POSTs to a status route answered 2xx, counted by the page. */
function okWrites(page: Page): () => number {
  let count = 0;
  page.on("response", (response) => {
    if (response.request().method() !== "POST") return;
    if (!/\/api\/issues\/[^/]+\/status$/.test(new URL(response.url()).pathname)) return;
    if (response.ok()) count += 1;
  });
  return () => count;
}

const fault = (
  id: string,
  goal: string,
  faultId: string,
  run: (ctx: JourneyContext) => Promise<void>,
): Journey => ({
  id,
  goal,
  screens: ["board"],
  mutability: "mutating",
  tags: ["fault"],
  faults: [faultId],
  run,
});

export const journeys: readonly Journey[] = [
  {
    id: "switch-every-tab",
    goal: "Open every tab of the nav in turn and see each one's rows",
    screens: TABS.map((tab) => tab.screen),
    mutability: "read-only",
    tags: ["smoke"],
    async run({ go, step, page }) {
      await go("board");
      for (const tab of TABS.slice(1))
        await step(`open ${tab.label}`, () => openTab(page, tab.screen));
    },
  },
  {
    id: "open-an-issue",
    goal: "Open an issue from its card on the Board and read its detail",
    screens: ["board", "issue-detail"],
    mutability: "read-only",
    tags: ["smoke"],
    async run({ go, step, page }) {
      await go("board");
      await step("open the first card", async () => {
        await page.locator(".app-main li.bu-card .bu-card-title").first().click();
        await screens.get("issue-detail").ready(page);
      });
    },
  },
  {
    id: "open-the-command-palette",
    goal: "Open the command palette from the keyboard, then close it with Escape and keep focus",
    screens: ["board"],
    mutability: "read-only",
    tags: ["keyboard"],
    async run({ go, step, page }) {
      await go("board");
      await step("press Ctrl K", async () => {
        await page.keyboard.press("Control+k");
        await page.getByRole("dialog", { name: "Command palette" }).waitFor();
      });
      await step("press Escape", async () => {
        await page.keyboard.press("Escape");
        await page.getByRole("dialog", { name: "Command palette" }).waitFor({ state: "hidden" });
      });
    },
  },
  {
    id: "move-a-card-by-menu",
    goal: "Move a card to in progress through its Move menu",
    screens: ["board"],
    mutability: "mutating",
    tags: ["smoke", "touch"],
    async run({ go, step, page }) {
      await go("board");
      await step("move the first open card to in progress", async () => {
        const reply = await moveFirstCard(page);
        if (reply === undefined || !reply.ok()) throw new Error("the move was not written");
      });
    },
  },
  {
    id: "sign-out",
    goal: "Sign out from the account menu and land on the sign-in page",
    screens: ["board", "signed-out"],
    mutability: "mutating",
    tags: ["smoke"],
    async run({ go, step, page }) {
      await go("board");
      await step("press Sign out", async () => {
        await page.getByRole("button", { name: "Account" }).click();
        await page.getByRole("menuitem", { name: "Sign out" }).click();
        await screens.get("signed-out").ready(page);
      });
    },
  },

  fault(
    "feed-drop",
    "Lose the live feed and see the stale banner, then see it clear on reconnect",
    "feed-drop",
    async ({ go, step, page, inject, observe }) => {
      await go("board");
      const end = await inject("feed-drop");
      const shown = await notice(page, 5_000);
      await step("let the feed reconnect", async () => {
        await end();
        await page
          .locator(".app-stale")
          .waitFor({ state: "hidden", timeout: 60_000 })
          .catch(() => undefined);
      });
      observe({
        fault: "feed-drop",
        notice: shown,
        spinnerAfterFault: await busy(page),
        recovered: (await page.locator(".app-stale").count()) === 0,
      });
    },
  ),
  fault(
    "server-restart",
    "Move a card while the server restarts and see it applied once or reported",
    "server-restart",
    async ({ go, step, page, inject, observe }) => {
      await go("board");
      const applied = okWrites(page);
      const end = await inject("server-restart");
      const reply = await step("move a card while the server is down", () =>
        moveFirstCard(page, 10_000),
      );
      const shown = await notice(page);
      await step("start the server again", end);
      const back = await recovered(page);
      observe({
        fault: "server-restart",
        writes: {
          intended: shown === undefined && reply?.ok() ? 1 : 0,
          applied: applied(),
          source: "status POSTs answered 2xx",
        },
        notice: shown,
        spinnerAfterFault: await busy(page),
        recovered: back,
      });
    },
  ),
  fault(
    "session-expiry",
    "Lose the session with the palette open and see the expiry named",
    "session-expiry",
    async ({ go, step, page, inject, observe }) => {
      await go("board");
      await step("open the palette and type", async () => {
        await page.keyboard.press("Control+k");
        await page.getByRole("combobox", { name: "Type a command" }).fill("move");
      });
      await inject("session-expiry");
      const reply = await moveFirstCard(page, 10_000).catch(() => undefined);
      const shown = await notice(page);
      observe({
        fault: "session-expiry",
        writes: {
          intended: 0,
          applied: reply?.ok() ? 1 : 0,
          source: "status POST after the session ended",
        },
        notice: shown,
        spinnerAfterFault: await busy(page),
        recovered:
          (await page.getByRole("heading", { name: "Sign in to beads-ui" }).count()) > 0 ||
          shown !== undefined,
      });
    },
  ),
  fault(
    "slow-backend",
    "Open the Backlog while bd is slow and see a loading state within 100 ms",
    "slow-backend",
    async ({ go, step, page, inject, observe }) => {
      await go("board");
      const end = await inject("slow-backend");
      const loading = await step("reload while reads are slow", async () => {
        await page.reload();
        return page
          .locator(".app-main [aria-busy='true']")
          .waitFor({ timeout: 100 })
          .then(
            () => "a loading state",
            () => undefined,
          );
      });
      await end();
      observe({
        fault: "slow-backend",
        notice: loading,
        spinnerAfterFault: false,
        recovered: await recovered(page),
      });
    },
  ),
  fault(
    "failing-backend",
    "Read and write while bd fails and see the failure named, then recover",
    "failing-backend",
    async ({ go, step, page, inject, observe }) => {
      await go("board");
      const applied = okWrites(page);
      const end = await inject("failing-backend");
      await step("move a card while bd fails", () => moveFirstCard(page, 15_000));
      const shown = await notice(page);
      await end();
      await page.reload();
      observe({
        fault: "failing-backend",
        writes: {
          intended: 0,
          applied: applied(),
          source: "status POSTs answered 2xx while bd failed",
        },
        notice: shown,
        spinnerAfterFault: await busy(page),
        recovered: await recovered(page),
      });
    },
  ),
  fault(
    "serialised-backend",
    "Write behind queued reads on a one-process store and see it land",
    "serialised-backend",
    async ({ go, step, page, inject, observe }) => {
      await go("board");
      const end = await inject("serialised-backend");
      const reply = await step("move a card behind the queued reads", () =>
        moveFirstCard(page, 30_000),
      );
      const calls = lockedCalls();
      const updates =
        calls === undefined
          ? 0
          : (await readFile(calls, "utf8").catch(() => ""))
              .split("\n")
              .filter((line) => line === "update").length;
      await end();
      observe({
        fault: "serialised-backend",
        writes: { intended: 1, applied: updates, source: "bd update calls through lockedBd" },
        notice: reply?.ok() ? "written" : await notice(page),
        spinnerAfterFault: await busy(page),
        recovered: await recovered(page),
      });
    },
  ),
  {
    id: "offline",
    goal: "Move a card while offline and see an offline notice, with nothing written twice",
    screens: ["board"],
    mutability: "mutating",
    tags: ["fault"],
    faults: ["offline"],
    async run({ go, step, page, inject, observe, writes }) {
      await go("board");
      const end = await inject("offline");
      await step("move a card while offline", () => moveFirstCard(page, 5_000));
      const shown = await notice(page);
      await end();
      await page.waitForTimeout(2_000);
      observe({
        fault: "offline",
        writes: {
          intended: 1,
          applied: writes("/status"),
          source: "status POSTs the browser sent",
        },
        notice: shown,
        spinnerAfterFault: await busy(page),
        recovered: await recovered(page),
      });
    },
  },

  {
    id: "double-submit",
    goal: "Choose a move twice within 50 ms and see exactly one write",
    screens: ["board"],
    mutability: "mutating",
    tags: ["stress"],
    async run({ go, step, page, observe, writes }) {
      await go("board");
      await step("choose in progress twice", async () => {
        const menu = await openMoveMenu(page);
        await doubleClick(menu.getByRole("menuitem", { name: "in_progress" }));
        await page.waitForTimeout(1_000);
      });
      observe({
        fault: "double-submit",
        writes: {
          intended: 1,
          applied: writes("/status"),
          source: "status POSTs across the context",
        },
        notice: "the move",
        spinnerAfterFault: await busy(page),
        recovered: await recovered(page),
      });
    },
  },
  {
    id: "two-tabs",
    goal: "Change a card in one tab and see the other tab show it within a feed message",
    screens: ["board"],
    mutability: "mutating",
    tags: ["stress"],
    async run({ go, step, page, app, observe, writes }) {
      await go("board");
      const other = await page.context().newPage();
      await other.goto(app.url.toString());
      await screens.get("board").ready(other);
      const moved = await step("move a card in the first tab", async () => {
        const card = page
          .locator('.app-main section.bu-column[data-status="open"] li.bu-card')
          .first();
        const id = await card.getAttribute("data-card-id");
        await moveFirstCard(page);
        return id;
      });
      const seen = await other
        .locator(
          `.app-main section.bu-column[data-status="in_progress"] li.bu-card[data-card-id="${moved}"]`,
        )
        .waitFor({ timeout: 30_000 })
        .then(
          () => true,
          () => false,
        );
      await other.close();
      observe({
        fault: "two-tabs",
        writes: {
          intended: 1,
          applied: writes("/status"),
          source: "status POSTs across both tabs",
        },
        notice: seen ? "the second tab shows the move" : undefined,
        spinnerAfterFault: await busy(page),
        recovered: seen,
      });
    },
  },
  {
    id: "rapid-navigation",
    goal: "Switch across every nav tab ten times as fast as the page takes input and land settled",
    screens: TABS.map((tab) => tab.screen),
    mutability: "read-only",
    tags: ["stress"],
    async run({ go, step, page, observe }) {
      await go("board");
      await step("switch tabs ten times", () =>
        rapidNavigation(
          page,
          TABS.map((tab) => navLink(tab.label)),
          10,
        ),
      );
      const last = TABS.at(-1)?.screen ?? "board";
      const settled = await recovered(page, last).catch(() => false);
      observe({
        fault: "rapid-navigation",
        notice: settled ? "the last tab shows its own rows" : undefined,
        spinnerAfterFault: await busy(page),
        recovered: settled,
      });
    },
  },
  {
    id: "large-data",
    goal: "Open every screen on a thousand issues and on long titles and see budgets and layout hold",
    screens: TABS.map((tab) => tab.screen),
    mutability: "read-only",
    tags: ["stress"],
    async run() {
      throw new UnsupportedShape("thousand", "large data runs in the full tier's data-shape pass");
    },
  },
];
