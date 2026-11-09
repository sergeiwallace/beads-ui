import { card, column, columnIds, expect, test, written } from "./fixtures.ts";

// WCAG 2.2 2.5.7 Dragging Movements: every drag has a single-pointer alternative.
test.describe("on a touch device", () => {
  test("should give every draggable card a Move to menu that moves it with taps", async ({
    app,
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the 390 px touch project");
    const ids = [
      await app.store.create("Open card"),
      await app.store.create("Working card", { status: "in_progress" }),
      await app.store.create("Deferred card", { status: "deferred" }),
    ];
    await page.goto(app.url);
    await expect(page.locator("li.bu-card")).toHaveCount(ids.length);

    for (const id of ids) {
      const trigger = card(page, id).getByRole("button", { name: `Move ${id} to` });
      await trigger.scrollIntoViewIfNeeded();
      await expect(trigger).toBeVisible();
      const box = await trigger.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(24);
      expect(box?.height).toBeGreaterThanOrEqual(24);
    }

    const [first] = ids as [string];
    await card(page, first)
      .getByRole("button", { name: `Move ${first} to` })
      .tap();
    const write = written(page, first, "status");
    await page.getByRole("menuitem", { name: "in_progress" }).tap();

    await expect(column(page, "in_progress").locator(`[data-card-id="${first}"]`)).toBeVisible();
    expect((await write).status()).toBe(200);
    expect((await app.store.show(first)).status).toBe("in_progress");
  });

  test("should reorder a card one place up from its Move to menu, with no drag", async ({
    app,
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the 390 px touch project");
    const a = await app.store.create("First", { rank: "a0" });
    const b = await app.store.create("Second", { rank: "a1" });
    const c = await app.store.create("Third", { rank: "a2" });
    await page.goto(app.url);
    await expect.poll(() => columnIds(page, "open")).toEqual([a, b, c]);

    await card(page, c)
      .getByRole("button", { name: `Move ${c} to` })
      .tap();
    const write = written(page, c, "rank");
    await page.getByRole("menuitem", { name: "Up one place" }).tap();

    await expect.poll(() => columnIds(page, "open")).toEqual([a, c, b]);
    expect((await write).status()).toBe(200);
    const rank = (await app.store.show(c)).metadata?.rank;
    expect(typeof rank === "string" && "a0" < rank && rank < "a1").toBe(true);
    expect((await app.store.show(a)).metadata?.rank).toBe("a0");
    expect((await app.store.show(b)).metadata?.rank).toBe("a1");
  });
});
