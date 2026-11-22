import type { Route } from "@playwright/test";
import type { RunningApp } from "@sergeiwallace/frontend-test-harness";
import { expect, test, unbudgeted } from "./fixtures.ts";
import type { BeadsCtx } from "./harness/adapter.ts";
import { DETAIL_READS, screens, VIEW_READS } from "./harness/screens/index.ts";

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "readiness is exercised once, at 1280 px");
});

const REQUIRED = [
  "board",
  "backlog",
  "roadmap",
  "analytics",
  "sessions",
  "review",
  "sprints",
  "queue",
  "issue-detail",
  "held",
  "signed-out",
  "sign-in-link-fresh",
  "sign-in-link-used",
  "sign-in-link-expired",
];

/** The request a screen's data arrives by: its API read, or for a server page the page itself. */
const HELD: Readonly<Record<string, string>> = {
  ...VIEW_READS,
  ...DETAIL_READS,
  "signed-out": "**/",
  "sign-in-link-fresh": "**/api/auth/v1/exchange*",
  "sign-in-link-used": "**/api/auth/v1/exchange*",
  "sign-in-link-expired": "**/api/auth/v1/exchange*",
};

test("should hold one screen for each of the eight views, issue detail, the held item, the signed-out page and the sign-in link states", () => {
  const ids = screens.all().map((screen) => screen.id);
  expect(ids).toEqual(expect.arrayContaining(REQUIRED));
});

for (const id of REQUIRED) {
  test(`should not call ${id} ready while its data is held, and call it ready once the data lands`, async ({
    fth,
    page,
  }) => {
    test.setTimeout(180_000);
    const screen = screens.get(id);
    const app = (await unbudgeted(() => fth.boot())) as RunningApp<BeadsCtx>;
    const seed = await unbudgeted(() => fth.seed("typical"));
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pattern = HELD[id] ?? "";
    await page.route(pattern, async (route: Route) => {
      await held;
      await route.continue().catch(() => undefined);
    });
    const opening = (async () => {
      if (screen.open !== undefined) {
        await screen.open(page, { app, seed, signIn: () => fth.signIn(page) });
      } else {
        await fth.signIn(page);
        await page.goto(new URL(screen.route(undefined).replace(/^\//, ""), app.url).toString());
      }
    })();
    opening.catch(() => undefined);
    const readiness = screen.ready(page).then(
      (state) => ({ state }),
      (error: unknown) => ({ error: String(error) }),
    );
    const early = await Promise.race([
      readiness,
      page.waitForTimeout(4_000).then(() => "held" as const),
    ]);
    expect(early, `${id} called ready with only its shell on screen`).toBe("held");
    release();
    await unbudgeted(() => opening);
    const landed = await screen.ready(page).then(
      (state) => ({ state }),
      (error: unknown) => ({ error: String(error) }),
    );
    expect(landed).toEqual({ state: expect.stringMatching(/^(content|empty|error)$/) });
  });
}

test("should run the tier's probes at the screen a spec reaches without go(), and list a URL no screen matches as unmatched", async ({
  fth,
  page,
}) => {
  const app = await unbudgeted(() => fth.boot());
  await unbudgeted(() => fth.seed("typical"));
  await unbudgeted(() => fth.signIn(page));
  await expect
    .poll(
      () =>
        fth.record.captures.some(
          (capture) => capture.screen === "board" && capture.path !== undefined,
        ),
      {
        timeout: 30_000,
      },
    )
    .toBe(true);
  await page.goto(new URL("api/health", app.url).toString());
  await expect
    .poll(() => fth.record.unmatched.some((url) => url.endsWith("/api/health")), {
      timeout: 10_000,
    })
    .toBe(true);
});
