import { join } from "node:path";
import type { Browser, Locator, Page } from "@playwright/test";
import { repoStore, type StoreHost, storeHost } from "../test/host-stores.ts";
import { expect, loginLink, type Served, serve, test } from "./fixtures.ts";

interface Cell {
  name: string;
  width: number;
  height: number;
  scale: number;
  touch?: boolean;
  overflows?: readonly string[];
}

const CELLS: readonly Cell[] = [
  { name: "13 inch laptop at 100% zoom", width: 1470, height: 956, scale: 2 },
  { name: "13 inch laptop at 200% zoom", width: 735, height: 478, scale: 4 },
  { name: "13 inch laptop at 400% zoom", width: 368, height: 239, scale: 8 },
  { name: "1280 desktop", width: 1280, height: 800, scale: 1 },
  { name: "1920 wide", width: 1920, height: 1080, scale: 1 },
  { name: "390 phone", width: 390, height: 844, scale: 3, touch: true },
  { name: "1280 at 500% zoom", width: 256, height: 160, scale: 5, overflows: ["Commands"] },
];

const BASE_UI_ANIMATIONS_OFF = "BASE_UI_ANIMATIONS_DISABLED";
const LONG_REPOSITORY = "a-repository-with-a-name-as-long-as-many-real-ones";

let host: StoreHost;
let served: Served;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  host = await storeHost();
  const store = await repoStore(join(host.root, LONG_REPOSITORY), { prefix: "shell" });
  await store.create("A card on the board");
  served = await serve(store.dir, join(host.root, "config"), {
    allowRepos: [LONG_REPOSITORY],
    env: { HOME: host.home },
  });
});

test.afterAll(async () => {
  await served?.stop();
  await host?.remove();
});

async function open(browser: Browser, cell: Cell): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: cell.width, height: cell.height },
    deviceScaleFactor: cell.scale,
    hasTouch: cell.touch === true,
    isMobile: cell.touch === true,
  });
  await context.addInitScript((flag) => {
    Object.assign(globalThis, { [flag]: true });
  }, BASE_UI_ANIMATIONS_OFF);
  const page = await context.newPage();
  await page.goto(await loginLink(served));
  await expect(page.locator(".app-main li.bu-card")).toHaveCount(1);
  return page;
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("no box");
  return box;
}

async function expectOneRow(page: Page) {
  const bar = page.getByRole("banner");
  const barBox = await boxOf(bar);
  const controls = bar.locator("button, select, a, [role=status]");
  const tallest = Math.max(
    ...(await controls.evaluateAll((elements) =>
      elements
        .filter((element) => element.getBoundingClientRect().height > 0)
        .map((element) => element.getBoundingClientRect().height),
    )),
  );
  expect.soft(barBox.height, "the bar is one row of controls tall").toBeLessThan(tallest * 2);
  const below = await controls.evaluateAll(
    (elements, bottom) =>
      elements
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.height > 0 &&
            getComputedStyle(element).visibility !== "hidden" &&
            rect.bottom > bottom
          );
        })
        .map((element) => element.textContent?.trim() || element.getAttribute("aria-label")),
    barBox.y + barBox.height + 1,
  );
  expect.soft(below, "no control sits below the bar's first row").toEqual([]);
}

for (const cell of CELLS) {
  test(`should keep the top bar on one row with every control reachable at ${cell.name} (${cell.width} x ${cell.height})`, async ({
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, "each cell sets its own device");
    const page = await open(browser, cell);
    try {
      await expectOneRow(page);

      const bar = page.getByRole("banner");
      const more = bar.getByRole("button", { name: "More" });
      const commands = bar.getByRole("button", { name: /^Commands/ });
      const stamp = bar.getByText(/^as of /).filter({ visible: true });
      const commandsInBar = (await commands.count()) === 1;
      const stampInBar = (await stamp.count()) === 1;
      if (cell.overflows !== undefined) {
        expect
          .soft(commandsInBar ? [] : ["Commands"], "what this width moves into More")
          .toEqual(cell.overflows);
      }

      if (commandsInBar && stampInBar) {
        await expect.soft(more, "no More menu while everything fits").toHaveCount(0);
      } else {
        await more.click();
        const menu = page.getByRole("menu");
        if (!stampInBar) {
          await expect.soft(menu.getByText(/^as of /), "the stamp is in More").toBeVisible();
        }
        if (!commandsInBar) {
          await expect
            .soft(menu.getByRole("menuitem", { name: "Commands" }), "Commands is in More")
            .toBeVisible();
        }
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect.soft(more, "Escape returns focus to More").toBeFocused();
      }

      if (commandsInBar) {
        await commands.click();
      } else {
        await more.click();
        await page.getByRole("menuitem", { name: "Commands" }).click();
      }
      const palette = page.getByRole("dialog", { name: "Command palette" });
      await expect.soft(palette, "Commands opens the palette from where it is").toBeVisible();
      await page.keyboard.press("Escape");
      await expect(palette).toBeHidden();

      const account = bar.getByRole("button", { name: "Account" });
      await account.click();
      const menu = page.getByRole("menu");
      await expect.soft(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect.soft(account, "Escape returns focus to the account trigger").toBeFocused();

      const toggle = bar.getByRole("button", { name: "Toggle Sidebar" });
      const views = page.getByRole("navigation", { name: "Views" });
      const board = views.getByRole("link", { name: "Board", exact: true });
      if (cell.width < 768) {
        await expect.soft(views).toHaveCount(0);
        await toggle.click();
        await expect.soft(board).toBeVisible();
        await views.getByRole("link", { name: "Backlog", exact: true }).click();
        await expect.soft(page).toHaveURL(/\/backlog$/);
        await expect.soft(views, "choosing a view closes the sheet").toHaveCount(0);
      } else {
        const wide = await boxOf(board);
        await toggle.click();
        await expect.poll(async () => (await boxOf(board)).width).toBeLessThan(wide.width);
        await expect.soft(board, "the rail keeps the view's name").toHaveAccessibleName("Board");
        await board.hover();
        await expect
          .soft(page.locator("[data-slot=tooltip-content]"), "the rail names the view on hover")
          .toHaveText("Board");
        await toggle.click();
        await expect.poll(async () => (await boxOf(board)).width).toBe(wide.width);
      }
      await expectOneRow(page);

      if (cell === CELLS[0]) {
        await page.getByRole("button", { name: "Account" }).click();
        await page.getByRole("menuitem", { name: "Sign out" }).click();
        await expect(page.getByRole("heading", { name: "Sign in to beads-ui" })).toBeVisible();
      }
    } finally {
      await page.context().close();
    }
  });
}

test("should toggle the sidebar with Ctrl+B outside a text field and not inside one", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "the shortcut is a keyboard's");
  const page = await open(browser, CELLS[3] as Cell);
  try {
    const sidebar = page.locator("[data-slot=sidebar][data-state]");
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await page.keyboard.press("Control+b");
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await page.keyboard.press("Control+b");
    await expect(sidebar).toHaveAttribute("data-state", "expanded");

    await page.keyboard.press("Control+k");
    const field = page.getByRole("combobox", { name: "Type a command" });
    await field.fill("bold");
    await page.keyboard.press("Control+b");
    await expect(sidebar, "Ctrl+B in a text field leaves the sidebar alone").toHaveAttribute(
      "data-state",
      "expanded",
    );
  } finally {
    await page.context().close();
  }
});

test("should name every bar control and reach the bar and its menus from the keyboard in order", async ({
  browser,
  isMobile,
}) => {
  test.skip(isMobile, "the focus order is a keyboard's");
  const page = await open(browser, CELLS[3] as Cell);
  try {
    const bar = page.getByRole("banner");
    for (const control of await bar.getByRole("button").all()) {
      await expect(control).toHaveAccessibleName(/\S/);
    }

    const order: string[] = [];
    for (let step = 0; step < 30 && !order.includes("Account"); step += 1) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const active = document.activeElement;
          if (active === null || active.closest("header") === null) return "";
          if (active instanceof HTMLSelectElement) return "Store";
          return active.getAttribute("aria-label") ?? (active.textContent ?? "").trim();
        }),
      );
    }
    const inBar = order.filter((name) => name !== "");
    expect(inBar[0]).toBe("Toggle Sidebar");
    expect(inBar).toContain("Store");
    expect(inBar.findIndex((name) => name.startsWith("Commands"))).toBeGreaterThan(
      inBar.indexOf("Store"),
    );
    expect(inBar.at(-1)).toBe("Account");

    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(bar.getByRole("button", { name: "Account" })).toBeFocused();
  } finally {
    await page.context().close();
  }
});
