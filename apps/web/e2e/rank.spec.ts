import { card, columnIds, expect, test, written } from "./fixtures.ts";

test.describe("manual rank, on by default in the web app", () => {
  test("should write a key between the new neighbours and renumber no other card when a card is dragged within its column", async ({
    app,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "pointer drag runs at 1280 px; the touch path is the Move to menu");
    const a = await app.store.create("First", { rank: "a0" });
    const b = await app.store.create("Second", { rank: "a1" });
    const c = await app.store.create("Third", { rank: "a2" });
    await page.goto(app.url);
    await expect.poll(() => columnIds(page, "open")).toEqual([a, b, c]);

    // Onto the top edge of the second card: the slot between the first and the second.
    const write = written(page, c, "rank");
    await card(page, c).dragTo(card(page, b), { targetPosition: { x: 20, y: 4 } });

    await expect.poll(() => columnIds(page, "open")).toEqual([a, c, b]);
    expect((await write).status()).toBe(200);
    const rank = (await app.store.show(c)).metadata?.rank;
    expect(typeof rank === "string" && "a0" < rank && rank < "a1").toBe(true);
    expect((await app.store.show(a)).metadata?.rank).toBe("a0");
    expect((await app.store.show(b)).metadata?.rank).toBe("a1");
    // The reloaded page draws the column only once its board read lands, which on a loaded host
    // can take longer than the poll below allows; wait for that read, as viewRead does elsewhere.
    const reread = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/board",
      { timeout: 60_000 },
    );
    await page.reload();
    await reread;
    await expect.poll(() => columnIds(page, "open")).toEqual([a, c, b]);
  });
});
