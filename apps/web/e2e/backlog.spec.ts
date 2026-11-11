import { expect, test, written } from "./fixtures.ts";

test.describe("the Backlog", () => {
  test("should list open issues by priority, then rank, then age", async ({ app, page }) => {
    const oldP2 = await app.store.create("Older P2");
    const p1 = await app.store.create("Plain P1", { priority: 1 });
    const rankedP2 = await app.store.create("Ranked P2", { rank: "a0" });
    const newP2 = await app.store.create("Newer P2");
    await app.store.create("Working", { status: "in_progress" });

    await page.goto(`${app.url}backlog`);

    const rows = page.locator("tr[data-row-id]");
    await expect(rows).toHaveCount(4);
    expect(
      await rows.evaluateAll((all) => all.map((row) => row.getAttribute("data-row-id"))),
    ).toEqual([p1, rankedP2, oldP2, newP2]);
  });

  test("should write a row's priority and status with guarded writes", async ({
    signedIn: app,
    page,
  }) => {
    const id = await app.store.create("Edit in place", { priority: 3 });
    await page.goto(`${app.url}backlog`);

    const priorityWrite = written(page, id, "priority");
    await page.getByLabel(`Priority of ${id}`).selectOption("0");
    expect((await priorityWrite).status()).toBe(200);
    expect((await app.store.show(id)).priority).toBe(0);

    const statusWrite = written(page, id, "status");
    await page.getByLabel(`Status of ${id}`).selectOption("in_progress");
    expect((await statusWrite).status()).toBe(200);
    expect((await app.store.show(id)).status).toBe("in_progress");
    await expect(page.locator(`tr[data-row-id="${id}"]`)).toHaveCount(0);
  });

  test("should show a conflict toast and keep the store's value when the status changed elsewhere", async ({
    app,
    page,
  }) => {
    const id = await app.store.create("Raced row", { priority: 3 });
    await page.goto(`${app.url}backlog`);
    await expect(page.locator(`tr[data-row-id="${id}"]`)).toBeVisible();
    await app.store.bd("update", id, "--status", "blocked");

    const write = written(page, id, "priority");
    await page.getByLabel(`Priority of ${id}`).selectOption("0");
    expect((await write).status()).toBe(409);

    await expect(page.locator(".bu-toast[data-kind='conflict']")).toBeVisible();
    expect((await app.store.show(id)).priority).toBe(3);
  });
});
