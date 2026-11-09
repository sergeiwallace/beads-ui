import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { request as playwrightRequest } from "@playwright/test";
import { column, expect, loginLink, test } from "./fixtures.ts";

// T-W0.1 in the browser: sign-in, replay, storage, the event stream, CSRF and logout.

const SESSION = /^beads_ui_session_\d+$/;

/** A page on another origin of 127.0.0.1 (same site, other port): what a hostile local page is. */
async function hostilePage(html: string): Promise<{ url: string; close(): Promise<void> }> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test.describe("signing in", () => {
  test("should open the Board from the one-time link and leave no token in the URL or in browser storage", async ({
    page,
    served,
  }) => {
    const id = await served.store.create("Signed in");
    await page.goto(await loginLink(served));
    await expect(page.locator(`li.bu-card[data-card-id="${id}"]`)).toBeVisible();
    expect(page.url()).toBe(served.url);
    const session = (await page.context().cookies()).find((cookie) => SESSION.test(cookie.name));
    expect(session).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });
    const stored = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      cookie: document.cookie,
    }));
    expect(stored).toEqual({ local: [], session: [], cookie: "" });
  });

  test("should refuse the link a second time and set no cookie", async ({
    page,
    browser,
    served,
  }) => {
    const link = await loginLink(served);
    await page.goto(link);
    await expect(column(page, "open")).toBeVisible();
    const replay = await browser.newContext();
    const again = await replay.newPage();
    const reply = await again.goto(link);
    expect(reply?.status()).toBe(401);
    await expect(
      again.getByRole("heading", { name: "This sign-in link no longer works" }),
    ).toBeVisible();
    expect(await replay.cookies()).toEqual([]);
    await replay.close();
  });

  test("should show the sign-in page, and no Board, without a session", async ({
    page,
    served,
  }) => {
    const reply = await page.goto(served.url);
    expect(reply?.status()).toBe(401);
    await expect(page.getByText("beads-ui-web login-link")).toBeVisible();
    await expect(column(page, "open")).toHaveCount(0);
  });
});

test.describe("the event stream", () => {
  test("should open on the session cookie alone, with no token in its URL", async ({
    page,
    browser,
    served,
  }) => {
    await page.goto(await loginLink(served));
    await expect(column(page, "open")).toBeVisible();
    const opened = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const events = new EventSource("/api/events");
          events.addEventListener("ready", () => {
            events.close();
            resolve(events.url);
          });
          events.onerror = () => resolve("error");
        }),
    );
    expect(new URL(opened).search).toBe("");

    const stranger = await browser.newContext();
    const other = await stranger.newPage();
    await other.goto(served.url);
    const refused = await other.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const events = new EventSource("/api/events");
          events.addEventListener("ready", () => resolve("ready"));
          events.onerror = () =>
            resolve(events.readyState === EventSource.CLOSED ? "closed" : "error");
        }),
    );
    expect(refused).toBe("closed");
    await stranger.close();
  });
});

test.describe("cross-site writes", () => {
  test("should refuse a form post and a fetch from another origin, and write nothing", async ({
    page,
    served,
  }) => {
    const id = await served.store.create("Not moved by a hostile page");
    await page.goto(await loginLink(served));
    await expect(column(page, "open")).toBeVisible();
    const target = `${served.url}api/issues/${id}/status`;
    const hostile = await hostilePage(`<!doctype html>
<form id="f" method="POST" action="${target}" enctype="text/plain">
  <input name='{"to":"closed","shown":"open","x":"' value='"}'>
</form>
<script>
  window.fetched = fetch(${JSON.stringify(target)}, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-beads-ui": "1" },
    body: JSON.stringify({ to: "closed", shown: "open" }),
  }).then((r) => r.status, () => "blocked");
</script>`);
    try {
      await page.goto(hostile.url);
      expect(
        await page.evaluate(() => (window as unknown as { fetched: Promise<unknown> }).fetched),
      ).toBe("blocked");
      const posted = page.waitForResponse((response) => response.url() === target);
      await page.evaluate(() => (document.getElementById("f") as HTMLFormElement).submit());
      // 403 when the browser sends the cookie same-site (no X-Beads-UI), 401 when it does not.
      expect([401, 403]).toContain((await posted).status());
      expect((await served.store.show(id)).status).toBe("open");
    } finally {
      await hostile.close();
    }
  });
});

test.describe("signing out", () => {
  test("should revoke the session on the server and clear its cookie", async ({ page, served }) => {
    await page.goto(await loginLink(served));
    await expect(column(page, "open")).toBeVisible();
    const session = (await page.context().cookies()).find((cookie) => SESSION.test(cookie.name));
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in to beads-ui" })).toBeVisible();
    expect((await page.context().cookies()).filter((cookie) => SESSION.test(cookie.name))).toEqual(
      [],
    );

    const replay = await playwrightRequest.newContext();
    const reply = await replay.get(`${served.url}api/board`, {
      headers: { cookie: `${session?.name}=${session?.value}` },
    });
    expect(reply.status()).toBe(401);
    await replay.dispose();
  });

  test("should refuse a request with forged Tailscale identity headers and no session", async ({
    served,
  }) => {
    const forged = await playwrightRequest.newContext();
    const reply = await forged.get(`${served.url}api/board`, {
      headers: {
        "tailscale-user-login": "owner@example.com",
        "tailscale-user-name": "Owner",
      },
    });
    expect(reply.status()).toBe(401);
    await forged.dispose();
  });
});
