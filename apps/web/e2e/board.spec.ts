import { card, column, columnIds, expect, test, written } from "./fixtures.ts";

const CATEGORY_ORDER = ["active", "wip", "frozen", "done"];

test.describe("the Board", () => {
  test("should render one column per bd status, grouped by category in bd's order", async ({
    app,
    page,
  }) => {
    await app.store.create("Anything");
    const listed = JSON.parse(await app.store.bd("statuses", "--json")) as {
      built_in_statuses: { name: string; category: string }[];
      custom_statuses?: { name: string; category: string }[] | null;
    };
    const statuses = [...listed.built_in_statuses, ...(listed.custom_statuses ?? [])];
    const expected = CATEGORY_ORDER.flatMap((category) =>
      statuses.filter((status) => status.category === category).map((status) => status.name),
    );

    await page.goto(app.url);

    await expect(page.locator("section.bu-column")).toHaveCount(expected.length);
    const drawn = await page
      .locator("section.bu-column")
      .evaluateAll((sections) => sections.map((section) => section.getAttribute("data-status")));
    expect(drawn).toEqual(expected);
  });

  test("should write the status with a guarded update when a card is dropped on a column", async ({
    app,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "pointer drag runs at 1280 px; the touch path is the Move to menu");
    const id = await app.store.create("Drag me");
    await page.goto(app.url);
    await expect(card(page, id)).toBeVisible();

    const write = written(page, id, "status");
    await card(page, id).dragTo(column(page, "in_progress"));

    await expect(column(page, "in_progress").locator(`[data-card-id="${id}"]`)).toBeVisible();
    expect((await write).status()).toBe(200);
    expect((await app.store.show(id)).status).toBe("in_progress");
  });

  test("should roll the card back and show a conflict toast when the drop's write exits 13", async ({
    app,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "pointer drag runs at 1280 px; the touch path is the Move to menu");
    const id = await app.store.create("Raced card");
    await page.goto(app.url);
    await expect(column(page, "open").locator(`[data-card-id="${id}"]`)).toBeVisible();
    // Another actor moves it after the Board drew it as open.
    await app.store.bd("update", id, "--status", "deferred");

    const write = written(page, id, "status");
    await card(page, id).dragTo(column(page, "in_progress"));
    expect((await write).status()).toBe(409);

    const toast = page.locator(".bu-toast[data-kind='conflict']");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(`${id} changed elsewhere before the move to in_progress`);
    // Rolled back off the target column, then re-read into the status the store holds.
    await expect(column(page, "in_progress").locator(`[data-card-id="${id}"]`)).toHaveCount(0);
    await expect(column(page, "deferred").locator(`[data-card-id="${id}"]`)).toBeVisible();
    expect((await app.store.show(id)).status).toBe("deferred");
    expect(await columnIds(page, "in_progress")).toEqual([]);
  });
});
