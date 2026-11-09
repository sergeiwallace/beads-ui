import { join } from "node:path";
import {
  type RepoStore,
  repoStore,
  type StoreHost,
  scriptedBd,
  shQuote,
  storeHost,
} from "../test/host-stores.ts";
import { card, expect, loginLink, type Served, serve, test } from "./fixtures.ts";

// The web server's store registry in the browser: every allowlisted store on the host, a store
// picker whose choice is in the URL, and each card addressed by its repository and id.

let host: StoreHost;
let served: Served | undefined;

test.beforeEach(async ({ isMobile }) => {
  test.skip(isMobile, "the store registry is exercised once, at 1280 px");
  // Each spec makes two or three real stores with bd init before its server starts.
  test.setTimeout(180_000);
  host = await storeHost();
});

test.afterEach(async () => {
  await served?.stop();
  served = undefined;
  await host?.remove();
});

/** Serves `start` with `allow` as the allowlist and the host's store inventory under its HOME. */
async function serveStores(
  start: RepoStore,
  allow: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<Served> {
  served = await serve(start.dir, join(host.root, "config"), {
    allowRepos: allow,
    env: { HOME: host.home, ...env },
  });
  return served;
}

test("should show every open store's cards naming their repository, and narrow to the store the picker chooses, in the URL", async ({
  page,
}) => {
  const [alpha, beta, gamma] = await Promise.all(
    ["alpha", "beta", "gamma"].map((name) => repoStore(join(host.root, name), { prefix: name })),
  );
  if (alpha === undefined || beta === undefined || gamma === undefined) throw new Error("stores");
  const [a, b] = await Promise.all([
    alpha.create("Alpha card"),
    beta.create("Beta card"),
    gamma.create("Gamma card"),
  ]);
  await host.inventory([
    { prefix: "beta", dir: beta.dir },
    { prefix: "gamma", dir: gamma.dir },
  ]);
  const server = await serveStores(alpha, ["alpha", "beta"]);
  await page.goto(await loginLink(server));

  await expect(card(page, `alpha:${a}`).locator(".bu-repo")).toHaveText("alpha");
  await expect(card(page, `beta:${b}`).locator(".bu-repo")).toHaveText("beta");
  await expect(page.locator("li.bu-card", { hasText: "Gamma card" })).toHaveCount(0);
  await expect(page.getByText("from repositories not on this host's allowlist")).toBeVisible();

  await page.getByLabel("Store").selectOption("beta");
  await expect(page).toHaveURL(/\/\?store=beta$/);
  await expect(card(page, b)).toBeVisible();
  await expect(page.locator("li.bu-card", { hasText: "Alpha card" })).toHaveCount(0);
  await expect(page.locator(".bu-repo")).toHaveCount(0);

  await page.reload();
  await expect(card(page, b)).toBeVisible();
  await expect(page.locator("li.bu-card", { hasText: "Alpha card" })).toHaveCount(0);

  await page.getByRole("link", { name: "Backlog" }).click();
  await expect(page).toHaveURL(/\/backlog\?store=beta$/);
  await expect(page.locator("tr[data-row-id]")).toHaveCount(1);

  await page.getByLabel("Store").selectOption("");
  await expect(page).toHaveURL(/\/backlog$/);
  await expect(page.locator("tr[data-row-id]")).toHaveCount(2);
  await page.getByRole("link", { name: "Alpha card" }).click();
  expect(new URL(page.url()).pathname).toBe(`/issues/${a}`);
  expect(new URL(page.url()).searchParams.get("store")).toBe("alpha");
  const detail = page.locator("article.bu-detail");
  await expect(detail.locator(".bu-field", { hasText: "Repository" }).locator("dd")).toHaveText(
    "alpha",
  );
});

test("should keep showing the other stores and name the one that cannot be read", async ({
  page,
}) => {
  const [alpha, beta] = await Promise.all([
    repoStore(join(host.root, "alpha"), { prefix: "alpha" }),
    repoStore(join(host.root, "beta"), { prefix: "beta" }),
  ]);
  const [a] = await Promise.all([alpha.create("Readable card"), beta.create("Unreadable card")]);
  await host.inventory([{ prefix: "beta", dir: beta.dir }]);
  const failing = await scriptedBd(
    `[ "$DIR" = ${shQuote(beta.dir)} ] && { echo "Error: database is locked" >&2; exit 1; }`,
  );
  try {
    const server = await serveStores(alpha, ["alpha", "beta"], { PATH: failing.env.PATH });
    await page.goto(await loginLink(server));

    await expect(card(page, `alpha:${a}`)).toBeVisible();
    const failed = page.locator('[data-failed-store="beta"]');
    await expect(failed).toHaveAttribute("role", "alert");
    await expect(failed).toContainText("beta: bd statuses failed: bd statuses exited 1");
    await expect(page.locator("li.bu-card", { hasText: "Unreadable card" })).toHaveCount(0);
  } finally {
    await failing.remove();
  }
});

test("should keep two issues with one id apart and write each to its own store", async ({
  page,
}) => {
  const [left, right] = await Promise.all([
    repoStore(join(host.root, "left"), { prefix: "dup" }),
    repoStore(join(host.root, "right"), { prefix: "dup" }),
  ]);
  await Promise.all([
    left.create("The left one", { id: "dup-1" }),
    right.create("The right one", { id: "dup-1" }),
  ]);
  await host.inventory([{ prefix: "dup", dir: right.dir }]);
  const server = await serveStores(left, ["left", "right"]);
  await page.goto(await loginLink(server));

  await expect(card(page, "left:dup-1")).toContainText("The left one");
  await expect(card(page, "right:dup-1")).toContainText("The right one");

  const write = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/issues/dup-1/status",
  );
  await card(page, "right:dup-1").getByRole("button", { name: "Move dup-1 to" }).click();
  await page.getByRole("menuitem", { name: "in_progress" }).click();
  const response = await write;
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).searchParams.get("store")).toBe("right");
  expect((await right.show("dup-1")).status).toBe("in_progress");
  expect((await left.show("dup-1")).status).toBe("open");

  await card(page, "left:dup-1").getByRole("link", { name: "The left one" }).click();
  await expect(page.getByRole("heading", { name: "The left one" })).toBeVisible();
});
