import { card, expect, test } from "./fixtures.ts";

test.describe("Issue detail", () => {
  test("should show the issue's fields, description and comments as the store holds them", async ({
    app,
    page,
  }) => {
    const parent = await app.store.create("The epic");
    const id = await app.store.create("Detailed task", { priority: 1 });
    await app.store.bd(
      "update",
      id,
      "--description=Line one\nLine two",
      "--add-label=web",
      `--parent=${parent}`,
      `--metadata=${JSON.stringify({ owner: "person-a" })}`,
    );
    await app.store.bd("comments", "add", id, "--", "A first comment");

    await page.goto(app.url);
    await card(page, id).getByRole("link", { name: "Detailed task" }).click();

    const detail = page.locator("article.bu-detail");
    await expect(detail.getByRole("heading", { name: "Detailed task" })).toBeVisible();
    const field = (label: string) => detail.locator(".bu-field", { hasText: label }).locator("dd");
    await expect(field("Type")).toHaveText("task");
    await expect(field("Status")).toHaveText("open");
    await expect(field("Priority")).toHaveText("P1");
    await expect(field("Owner")).toHaveText("person-a");
    await expect(field("Labels")).toHaveText("web");
    await expect(field("Parent")).toHaveText(parent);
    await expect(field("Created")).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    await expect(detail.locator(".bu-description").first()).toHaveText("Line one\nLine two");
    await expect(detail.locator(".bu-comment")).toContainText("A first comment");
    expect(new URL(page.url()).pathname).toBe(`/issues/${id}`);
  });

  test("should show a failed read with its source, never as empty fields", async ({
    app,
    page,
  }) => {
    await page.goto(`${app.url}issues/e2e-missing`);

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("bd show failed: e2e-missing is not in this store");
    await expect(page.locator(".bu-field")).toHaveCount(0);
  });
});
