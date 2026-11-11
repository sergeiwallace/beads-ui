import { basename } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { card, expect, test, written } from "./fixtures.ts";

// Phase W1's Sprint view, inline edits, owner picker and Queue view (web app design T-W1.0,
// T-W1.5), at 1280 px with a mouse and at 390 px on a touch screen. A touch run reaches every
// reorder and edit with taps, never a drag or a hover.

/** The next write the page sends to one of an issue's W1 routes. */
const sent = (page: Page, id: string, kind: "sprint" | "owner" | "list-rank") =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/issues/${id}/${kind}`,
  );

/**
 * The page's next Queue read, with whether each store was read. The view draws its rows once this
 * lands, so a spec waits for it instead of an expectation's 15 seconds racing a loaded host's bd.
 */
const queueRead = async (page: Page) => {
  const response = await page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/queue-view",
  );
  const body = (await response.json()) as {
    reads: { repository: string; ok: boolean; error?: { message: string } }[];
  };
  return {
    status: response.status(),
    // A failed read keeps its message, so the assertion's diff says what bd answered.
    reads: body.reads.map(({ repository, ok, error }) =>
      error === undefined ? { repository, ok } : { repository, ok, error: error.message },
    ),
  };
};

const press = (target: Locator, touch: boolean) => (touch ? target.tap() : target.click());

const labelsOf = async (app: { store: { bd(...args: string[]): Promise<string> } }, id: string) =>
  (JSON.parse(await app.store.bd("show", id, "--json")) as [{ labels?: string[] }])[0].labels ?? [];

const assigneeOf = async (app: { store: { bd(...args: string[]): Promise<string> } }, id: string) =>
  (JSON.parse(await app.store.bd("show", id, "--json")) as [{ assignee?: string }])[0].assignee;

test.describe("the Sprint view", () => {
  test("should list the selected sprint's issues as a board and as a list, with every open sprint and the backlog in its picker", async ({
    app,
    page,
    isMobile,
  }) => {
    const member = await app.store.create("In the sprint");
    await app.store.bd("update", member, "--add-label", "sprint:s1");
    const loose = await app.store.create("In the backlog");
    await app.store.bd("create", "Sprint s1", "-t", "milestone", "--json");
    const closed = JSON.parse(
      await app.store.bd("create", "Sprint s0", "-t", "milestone", "--json"),
    ) as { id: string };
    await app.store.bd("close", closed.id);

    await page.goto(`${app.url}sprints`);
    const picker = page.getByRole("navigation", { name: "Sprints" });
    await expect
      .poll(() =>
        picker
          .locator("[data-sprint]")
          .evaluateAll((entries) => entries.map((entry) => entry.getAttribute("data-sprint"))),
      )
      .toEqual(["backlog", "sprint:s1"]);
    await expect(card(page, loose)).toBeVisible();

    await press(picker.locator('[data-sprint="sprint:s1"]'), isMobile);
    await expect(page).toHaveURL(/[?&]sprint=sprint%3As1/);
    await expect(card(page, member)).toBeVisible();
    await expect(card(page, loose)).toHaveCount(0);

    await press(page.getByRole("radio", { name: "List" }), isMobile);
    await expect(page.locator(`tr[data-row-id="${member}"]`)).toBeVisible();
  });

  test("should move an issue from the backlog to a sprint from its Move to menu through a guarded bd write", async ({
    app,
    page,
    isMobile,
  }) => {
    const member = await app.store.create("Sprint seed");
    await app.store.bd("update", member, "--add-label", "sprint:s1");
    const id = await app.store.create("Goes into the sprint");
    await page.goto(`${app.url}sprints`);

    await press(card(page, id).getByRole("button", { name: `Move ${id} to` }), isMobile);
    const write = sent(page, id, "sprint");
    await press(page.getByRole("menuitem", { name: "Sprint s1" }), isMobile);

    expect((await write).status()).toBe(200);
    expect(await labelsOf(app, id)).toContain("sprint:s1");
    await expect(card(page, id)).toHaveCount(0);
  });

  test("should move an issue to a sprint by dragging it onto the sprint in the picker", async ({
    app,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "pointer drag runs at 1280 px; the touch path is the Move to menu");
    const member = await app.store.create("Sprint seed");
    await app.store.bd("update", member, "--add-label", "sprint:s1");
    const id = await app.store.create("Dragged into the sprint");
    await page.goto(`${app.url}sprints`);

    const write = sent(page, id, "sprint");
    await card(page, id).dragTo(page.locator('[data-sprint="sprint:s1"]'));

    expect((await write).status()).toBe(200);
    expect(await labelsOf(app, id)).toContain("sprint:s1");
  });

  test("should move an issue back to the backlog from the command palette", async ({
    app,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the palette's chord is a keyboard path; touch moves through Move to");
    const id = await app.store.create("Leaves the sprint");
    await app.store.bd("update", id, "--add-label", "sprint:s1");
    await page.goto(app.url);

    await card(page, id).locator(".bu-id").click();
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toContainText(`Selected: ${id} Leaves the sprint`);
    await palette.getByRole("combobox").fill("move to backlog");
    const write = sent(page, id, "sprint");
    await page.keyboard.press("Enter");

    expect((await write).status()).toBe(200);
    expect((await labelsOf(app, id)).some((label) => label.startsWith("sprint:"))).toBe(false);
  });
});

test.describe("inline edits", () => {
  test("should write a card's priority in place and show the new value", async ({ app, page }) => {
    const id = await app.store.create("Edited on its card", { priority: 2 });
    await page.goto(app.url);

    const picker = card(page, id).getByRole("combobox", { name: `Priority of ${id}` });
    const write = written(page, id, "priority");
    await picker.selectOption("0");

    expect((await write).status()).toBe(200);
    await expect(picker).toHaveValue("0");
    expect((await app.store.show(id)).priority).toBe(0);
  });

  test("should roll back to the stored value and name the field when the write is a conflict", async ({
    app,
    page,
  }) => {
    const id = await app.store.create("Changed elsewhere", { priority: 2 });
    await page.goto(app.url);
    const picker = card(page, id).getByRole("combobox", { name: `Priority of ${id}` });
    await expect(picker).toHaveValue("2");
    // Another actor moves it, so the page's drawn status no longer holds.
    await app.store.bd("update", id, "--status", "in_progress");

    const write = written(page, id, "priority");
    await picker.selectOption("0");

    expect((await write).status()).toBe(409);
    const toast = page.locator(".bu-toast[data-kind='conflict']");
    await expect(toast).toContainText("Priority not written: changed elsewhere");
    await expect(card(page, id).getByRole("combobox", { name: `Priority of ${id}` })).toHaveValue(
      "2",
    );
    expect((await app.store.show(id)).priority).toBe(2);
  });

  test("should offer the store's sessions in a card's owner picker and write an unclaimed task's owner", async ({
    app,
    page,
    isMobile,
  }) => {
    const known = await app.store.create("Owned already");
    await app.store.bd("update", known, "--assignee=session-a");
    const id = await app.store.create("Needs an owner");
    await page.goto(app.url);

    await press(card(page, id).getByRole("button", { name: /Owner of .*: none/ }), isMobile);
    await expect(page.getByText("From the store's assignees")).toBeVisible();
    const write = sent(page, id, "owner");
    await press(page.getByRole("menuitem", { name: "session-a" }), isMobile);

    expect((await write).status()).toBe(200);
    expect(await assigneeOf(app, id)).toBe("session-a");
    await expect(
      card(page, id).getByRole("button", { name: /Owner of .*: session-a/ }),
    ).toBeVisible();
  });

  test("should reorder a backlog row by its Down button, writing a key between its neighbours", async ({
    app,
    page,
    isMobile,
  }) => {
    const a = await app.store.create("Row a", { priority: 1, rank: "a0" });
    const b = await app.store.create("Row b", { priority: 1, rank: "a1" });
    const c = await app.store.create("Row c", { priority: 1, rank: "a2" });
    await page.goto(`${app.url}backlog`);
    const order = () =>
      page
        .locator("tr[data-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-id")));
    await expect.poll(order).toEqual([a, b, c]);

    const write = sent(page, a, "list-rank");
    await press(page.getByRole("button", { name: `Move ${a} down one place` }), isMobile);

    expect((await write).status()).toBe(200);
    await expect.poll(order).toEqual([b, a, c]);
    const key = (await app.store.show(a)).metadata?.rank;
    expect(typeof key === "string" && "a1" < key && key < "a2").toBe(true);
    expect((await app.store.show(b)).metadata?.rank).toBe("a1");
  });

  test("should reorder a backlog row by dragging it below another", async ({
    app,
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "pointer drag runs at 1280 px; the touch path is the Up and Down buttons");
    const a = await app.store.create("Drag a", { priority: 1, rank: "a0" });
    const b = await app.store.create("Drag b", { priority: 1, rank: "a1" });
    await page.goto(`${app.url}backlog`);
    await expect(page.locator(`tr[data-row-id="${b}"]`)).toBeVisible();

    const write = sent(page, a, "list-rank");
    const target = page.locator(`tr[data-row-id="${b}"]`);
    const box = await target.boundingBox();
    await page
      .locator(`tr[data-row-id="${a}"]`)
      .dragTo(target, { targetPosition: { x: 20, y: (box?.height ?? 20) - 3 } });

    expect((await write).status()).toBe(200);
    const key = (await app.store.show(a)).metadata?.rank;
    expect(typeof key === "string" && key > "a1").toBe(true);
  });
});

test.describe("the Queue view", () => {
  test("should list every open task by priority, rank and age, saying so, and show only blocked tasks with their blocker under the filter", async ({
    app,
    page,
    isMobile,
  }) => {
    const repo = basename(app.store.dir);
    const blocker = await app.store.create("The blocker", { priority: 1 });
    const waiting = await app.store.create("Waits on it", { priority: 2 });
    await app.store.bd("dep", "add", waiting, blocker);
    const free = await app.store.create("Free to start", { priority: 0 });
    await page.goto(`${app.url}queue`);

    await expect(page.getByRole("status").filter({ hasText: "Ordered by" })).toHaveText(
      "Ordered by priority, then rank, then age",
    );
    const keys = () =>
      page
        .locator(".bu-queue-row")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-key")));
    await expect
      .poll(keys)
      .toEqual([`${repo}:${free}`, `${repo}:${blocker}`, `${repo}:${waiting}`]);

    await press(page.getByRole("checkbox", { name: "Blocked only" }), isMobile);
    await expect(page).toHaveURL(/[?&]blocked=1/);
    await expect.poll(keys).toEqual([`${repo}:${waiting}`]);
    await expect(page.locator(".bu-blocker")).toHaveText(`Blocked by ${blocker} The blocker`);
  });

  test("should encode a filter in the URL and show the same list when that URL is opened", async ({
    signedIn: app,
    page,
  }) => {
    const repo = basename(app.store.dir);
    const bug = JSON.parse(
      await app.store.bd("create", "A bug", "-t", "bug", "-p", "2", "--json"),
    ) as { id: string };
    await app.store.create("A task");
    await page.goto(`${app.url}queue`);

    await page.getByRole("combobox", { name: "Filter by type" }).selectOption("bug");
    await expect(page).toHaveURL(/[?&]type=bug/);
    const url = page.url();

    const reopened = queueRead(page);
    await page.goto(url);
    expect(await reopened).toEqual({ status: 200, reads: [{ repository: repo, ok: true }] });
    const keys = () =>
      page
        .locator(".bu-queue-row")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-key")));
    await expect.poll(keys).toEqual([`${repo}:${bug.id}`]);
    await expect(page.getByRole("combobox", { name: "Filter by type" })).toHaveValue("bug");
  });
});
