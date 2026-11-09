import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

/** The page's read of `path`: the view draws once it lands, however long a loaded host takes. */
const viewRead = (page: Page, path: string) =>
  page.waitForResponse((response) => new URL(response.url()).pathname === path, {
    timeout: 60_000,
  });

// T-3.2: "When the Roadmap renders, the system shall place epics and milestones by due date and
// shall draw blocks and parent-child dependencies as lines."

const DAY = 86_400_000;
const due = (offset: number) =>
  `${new Date(Date.now() + offset * DAY).toISOString().slice(0, 10)}T12:00:00Z`;

test.describe("the Roadmap", () => {
  test("should place epics and milestones by due date and draw their dependency lines", async ({
    app,
    page,
  }) => {
    const create = async (...args: string[]) =>
      (JSON.parse(await app.store.bd("create", ...args, "--json")) as { id: string }).id;
    const epic = await create("Platform", "-t", "epic", "--due", due(10));
    const sub = await create("Platform API", "-t", "epic", "--due", due(16), "--parent", epic);
    const launch = await create("Launch", "-t", "milestone", "--due", due(24));
    const later = await create("Someday", "-t", "epic");
    await app.store.create("A task, not on the Roadmap");
    await app.store.bd("dep", "add", launch, epic);

    const read = viewRead(page, "/api/roadmap");
    await page.goto(`${app.url}roadmap`);
    await read;

    const chart = page.locator(".bu-roadmap-chart");
    for (const id of [epic, sub, launch]) {
      await expect(chart.locator(`.bar-wrapper[data-issue-id="${id}"]`)).toBeVisible();
    }
    await expect(chart.locator(".bar-wrapper")).toHaveCount(3);
    // Placed by due date: the earliest due on the top row, the latest furthest right.
    // Read from the SVG, not the viewport: Frappe scrolls its chart after drawing, so two
    // viewport boxes taken one after the other can straddle that scroll.
    const box = async (id: string) => {
      const bar = chart.locator(`.bar-wrapper[data-issue-id="${id}"] .bar`);
      const [x, y, width] = await Promise.all(
        ["x", "y", "width"].map(async (name) => Number(await bar.getAttribute(name))),
      );
      if (![x, y, width].every(Number.isFinite)) throw new Error(`the bar of ${id} has no place`);
      return { x: x ?? 0, y: y ?? 0, width: width ?? 0 };
    };
    const [first, second, third] = [await box(epic), await box(sub), await box(launch)];
    expect(first.y).toBeLessThan(second.y);
    expect(second.y).toBeLessThan(third.y);
    expect(first.x + first.width).toBeLessThan(third.x + third.width);

    await expect(
      chart.locator(`path[data-from-issue="${epic}"][data-to-issue="${launch}"]`),
    ).toHaveAttribute("data-kind", "blocks");
    await expect(
      chart.locator(`path[data-from-issue="${epic}"][data-to-issue="${sub}"]`),
    ).toHaveAttribute("data-kind", "parent-child");
    await expect(page.locator(`[data-undated-id="${later}"]`)).toBeVisible();
    await expect(
      page.locator(".bu-roadmap").getByRole("status").filter({ hasText: "2 dependency lines" }),
    ).toBeVisible();
  });

  test("should open an epic's detail from its bar", async ({ app, page }) => {
    const epic = (
      JSON.parse(
        await app.store.bd("create", "Clickable epic", "-t", "epic", "--due", due(7), "--json"),
      ) as { id: string }
    ).id;
    const read = viewRead(page, "/api/roadmap");
    await page.goto(`${app.url}roadmap`);
    await read;

    // Frappe draws the label over the bar; the group holding both takes the click.
    const detail = viewRead(page, `/api/issues/${epic}`);
    await page.locator(`.bar-wrapper[data-issue-id="${epic}"]`).click();
    await detail;

    await expect(page).toHaveURL(new RegExp(`/issues/${epic}$`));
    await expect(page.getByRole("heading", { name: "Clickable epic" })).toBeVisible();
  });

  test("should say so when no epic or milestone has a due date", async ({ app, page }) => {
    await app.store.bd("create", "Undated epic", "-t", "epic", "--json");
    const read = viewRead(page, "/api/roadmap");
    await page.goto(`${app.url}roadmap`);
    await read;

    await expect(page.locator(".bu-roadmap").getByRole("status")).toHaveText(
      "No epic or milestone has a due date: set one with its Due field.",
    );
    await expect(page.locator(".bu-roadmap-chart")).toHaveCount(0);
  });
});
