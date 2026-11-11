import { card, column, expect, test, written } from "./fixtures.ts";

test.describe("the command palette", () => {
  test("should move the selected card without a drag when Move to runs from Ctrl+K", async ({
    app,
    page,
  }) => {
    const id = await app.store.create("Palette move");
    await page.goto(app.url);
    await card(page, id).locator(".bu-card-head").click();

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(palette).toContainText(`Selected: ${id} Palette move`);
    await palette.getByRole("combobox").fill("move to in_progress");
    const write = written(page, id, "status");
    await page.keyboard.press("Enter");

    await expect(palette).toBeHidden();
    await expect(column(page, "in_progress").locator(`[data-card-id="${id}"]`)).toBeVisible();
    expect((await write).status()).toBe(200);
    expect((await app.store.show(id)).status).toBe("in_progress");
  });

  // The sign-in lands on the Board, which is all the shortcut needs: no card and no second load.
  test("should open on Cmd+K too", async ({ app: _signedIn, page }) => {
    await expect(page.locator("section.bu-column").first()).toBeVisible();

    await page.keyboard.press("Meta+k");

    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });
});
