import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
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

  test("should show a failed read with its source and its store, never as empty fields", async ({
    app,
    page,
  }) => {
    await page.goto(`${app.url}issues/e2e-missing`);

    const alert = page.getByRole("alert");
    await expect(alert).toContainText(
      `bd show failed in ${basename(app.store.dir)}: e2e-missing is not in this store`,
    );
    await expect(page.locator(".bu-field")).toHaveCount(0);
  });

  test("should show the issue's links, each opening the linked issue", async ({ app, page }) => {
    const blocker = await app.store.create("The blocker");
    const id = await app.store.create("Has a link");
    await app.store.bd("dep", "add", id, blocker);

    await page.goto(`${app.url}issues/${id}`);

    const link = page.locator(".bu-link");
    await expect(link).toContainText(`blocks ${blocker}`);
    await link.getByRole("link", { name: blocker }).click();
    await expect(page.getByRole("heading", { name: "The blocker" })).toBeVisible();
  });

  test("should change an unclaimed issue's owner from its detail", async ({
    app,
    page,
    isMobile,
  }) => {
    const known = await app.store.create("Owned");
    await app.store.bd("update", known, "--assignee=session-a");
    const id = await app.store.create("Owner from detail");
    await page.goto(`${app.url}issues/${id}`);

    const picker = page.getByRole("button", { name: /Owner of .*: none/ });
    await (isMobile ? picker.tap() : picker.click());
    const item = page.getByRole("menuitem", { name: "session-a" });
    const write = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/api/issues/${id}/owner`,
    );
    await (isMobile ? item.tap() : item.click());

    expect((await write).status()).toBe(200);
    await expect(page.getByRole("button", { name: /Owner of .*: session-a/ })).toBeVisible();
    const [shown] = JSON.parse(await app.store.bd("show", id, "--json")) as [{ assignee?: string }];
    expect(shown.assignee).toBe("session-a");
  });
});

test.describe("Markdown and the Content Security Policy", () => {
  test("should run nothing from a description's script tags, event handlers or javascript: links, and leave those links inert", async ({
    app,
    page,
  }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Trusted Type/i.test(message.text()))
        violations.push(message.text());
    });
    const id = await app.store.create("Hostile description");
    await app.store.bd(
      "update",
      id,
      [
        "--description=# Heading",
        "<script>window.__pwned = 'script'</script>",
        "<img src=x onerror=\"window.__pwned = 'onerror'\">",
        "[click](javascript:window.__pwned='link') and [site](https://example.com/)",
      ].join("\n\n"),
    );

    const response = await page.goto(`${app.url}issues/${id}`);

    const policy = response?.headers()["content-security-policy"] ?? "";
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("require-trusted-types-for 'script'");
    const description = page.locator(".bu-description");
    await expect(description.getByRole("heading", { name: "Heading" })).toBeVisible();
    await expect(description.locator("script, img")).toHaveCount(0);
    await expect(description.getByRole("link", { name: "click" })).toHaveCount(0);
    await description.getByText("click").click();
    await expect(description.getByRole("link", { name: "site" })).toHaveAttribute(
      "href",
      "https://example.com/",
    );
    expect(await page.evaluate(() => (window as { __pwned?: string }).__pwned)).toBeUndefined();
    expect(new URL(page.url()).pathname).toBe(`/issues/${id}`);
    expect(violations).toEqual([]);
  });

  test("should refuse an inline script and a string written to a script sink in the served app", async ({
    app,
    page,
  }) => {
    await page.goto(app.url);
    await expect(page.locator("section.bu-column").first()).toBeVisible();

    const outcome = await page.evaluate(() => {
      const results: string[] = [];
      try {
        // Trusted Types refuses the text outright; were it taken, CSP would block the run.
        const inline = document.createElement("script");
        inline.textContent = "window.__inline = 1";
        document.body.append(inline);
      } catch {
        // Refused at the sink.
      }
      results.push(
        `inline:${(window as { __inline?: number }).__inline === undefined ? "blocked" : "ran"}`,
      );
      try {
        const sink = document.createElement("script");
        sink.src = "data:text/javascript,window.__sink=1";
        results.push("script-url:assigned");
      } catch {
        results.push("script-url:refused");
      }
      return results;
    });

    expect(outcome).toEqual(["inline:blocked", "script-url:refused"]);
  });
});

test.describe("held item detail", () => {
  test("should render a held item's full Markdown body with its option card above it", async ({
    app,
    page,
    configHome,
  }) => {
    const dir = await mkdtemp(join(tmpdir(), "beads-ui-e2e-held-"));
    try {
      const path = join(app.store.dir, "docs", "held", "d.md");
      const review = {
        schema: 1,
        fingerprint: "f1",
        host: "host-a",
        pair: ["host-a"],
        scope: "pair",
        read_at: "2026-11-09T00:00:00Z",
        items: [
          {
            path,
            store: app.store.dir,
            kind: "decision",
            status: "open",
            session: "session-a@host-a",
            title: "Pick a store",
            task: "t-1",
          },
        ],
      };
      const options = {
        version: 1,
        items: [
          {
            item: path,
            kind: "decision",
            error: null,
            decisions: [
              {
                id: "D-1",
                title: "Pick a store",
                anchor: "d-1",
                recommended: "b",
                options: [
                  { key: "a", label: "Keep it" },
                  { key: "b", label: "Move it" },
                ],
              },
            ],
          },
        ],
      };
      const body = "## Context\n\nThe **whole** body.\n\n<script>window.__held = 1</script>";
      const replies = { review, show: { body }, options };
      const tool = join(dir, "held");
      await writeFile(
        tool,
        `#!/usr/bin/env node\nconst replies = ${JSON.stringify(replies)};\nprocess.stdout.write(JSON.stringify(replies[process.argv[2]]));\n`,
      );
      await chmod(tool, 0o755);
      const settings = join(configHome, "beads-ui", "beads-ui.toml");
      await writeFile(
        settings,
        `${await readFile(settings, "utf8")}\n[review]\ncommand = ["${tool}"]\n`,
      );

      await page.goto(`${app.url}held?path=${encodeURIComponent(path)}`);

      const detail = page.locator("article.bu-held-detail");
      await expect(detail.getByRole("heading", { name: "Pick a store", level: 1 })).toBeVisible();
      const optionCard = detail.getByRole("region", { name: "D-1 Pick a store" });
      await expect(optionCard).toContainText("Move it");
      await expect(detail.getByRole("heading", { name: "Context" })).toBeVisible();
      await expect(detail.locator("strong", { hasText: "whole" })).toBeVisible();
      const cardBox = await optionCard.boundingBox();
      const bodyBox = await detail.getByRole("heading", { name: "Context" }).boundingBox();
      expect((cardBox?.y ?? 0) < (bodyBox?.y ?? 0)).toBe(true);
      expect(await page.evaluate(() => (window as { __held?: number }).__held)).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
