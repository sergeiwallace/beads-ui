import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../test/store.ts";
import { expect, serve, test } from "./fixtures.ts";

// T-3.5: the documented single command, run in a repository with a .beads store.
test("should serve the web app on a local port and show the Board within 10 seconds", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the command is measured once, at 1280 px");
  const store = await createStore("run");
  const configHome = await mkdtemp(join(tmpdir(), "beads-ui-e2e-config-"));
  const id = await store.create("Served card");
  const started = Date.now();
  const served = await serve(store.dir, configHome);
  try {
    expect(served.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    await page.goto(served.url);
    await expect(page.locator(`li.bu-card[data-card-id="${id}"]`)).toBeVisible();
    const elapsed = Date.now() - started;
    test.info().annotations.push({ type: "time to Board", description: `${elapsed} ms` });
    expect(elapsed).toBeLessThan(10_000);
  } finally {
    await served.stop();
    await store.remove();
    await rm(configHome, { recursive: true });
  }
});
