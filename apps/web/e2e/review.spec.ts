import { mkdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { createStore, type TestStore } from "../test/store.ts";
import { expect, serve, signIn, test } from "./fixtures.ts";

// The Review view in a real browser at 1280 px and 390 px (web app design T-W1.1 to T-W1.4,
// T-W1.6): the served command reads a held store through a stand-in tool, and every write goes
// through the running server's dispatch routes.

const FAKE_HELD = fileURLToPath(new URL("../test/fixtures/fake-held.mjs", import.meta.url));

interface ReviewApp {
  page: Page;
  store: TestStore;
  ids: { blocked: string; running: string };
}

/**
 * The two work-queue reads the Review view makes, the skill catalog and the session registry, from
 * a stand-in queue; dispatch records stay in the local store (`[dispatch] record = "local"`).
 */
async function startQueue(): Promise<{ url: string; server: Server }> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://queue").pathname;
    const body =
      path === "/api/queue/skills"
        ? [
            { name: "implement", source: "installed" },
            { name: "beads-task", source: "builtin" },
          ]
        : path === "/api/queue/sessions"
          ? [{ id: "worker@host-b", machine: "host-b", name: "worker", state: "active" }]
          : undefined;
    response.writeHead(body === undefined ? 404 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify(body ?? { detail: "not found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

const itemPath = (name: string) => `/stores/held/docs/held/host-c/holder/2026/11/09/${name}.md`;

async function heldFiles(dir: string, repo: string) {
  await mkdir(join(dir, "bodies"), { recursive: true });
  const item = (name: string, title: string) => ({
    path: itemPath(name),
    relpath: `docs/held/host-c/holder/2026/11/09/${name}.md`,
    store: repo,
    kind: "decision",
    status: "open",
    selection: "current",
    session: "holder@host-c",
    machine: "host-c",
    task: "none",
    title,
    ask: `Answer ${title}`,
    created_at: "2026-11-09T10:00:00Z",
  });
  await writeFile(
    join(dir, "review.json"),
    JSON.stringify({
      schema: 1,
      fingerprint: "f1",
      host: "host-c",
      pair: ["host-c"],
      scope: "pair",
      read_at: "2026-11-09T12:00:00Z",
      stores: { [repo]: { path: "/stores/held/docs/held", status: "ok", error: null } },
      items: [item("record", "How an answer is recorded")],
    }),
  );
  await writeFile(
    join(dir, "options.json"),
    JSON.stringify({
      version: 1,
      items: [
        {
          item: itemPath("record"),
          kind: "decision",
          error: null,
          decisions: [
            {
              id: "D-3",
              title: "How an answer is recorded",
              options: [
                { key: "a", label: "Name the option and say a control chose it" },
                { key: "b", label: "Fill the composer and require Send" },
              ],
              recommended: "a",
              anchor: "decision-d-3",
            },
          ],
        },
      ],
    }),
  );
  await writeFile(
    join(dir, "bodies", "record.md"),
    "# How an answer is recorded\n\nThe options follow.\n",
  );
}

const reviewTest = test.extend<{ review: ReviewApp }>({
  review: async ({ configHome, page }, use) => {
    const store = await createStore("e2e");
    const ids = {
      blocked: await store.create("Blocked on the space", { status: "blocked", priority: 1 }),
      running: await store.create("Running work", { status: "in_progress", priority: 2 }),
    };
    await store.bd("update", ids.blocked, "--assignee", "worker");
    await store.bd("update", ids.running, "--assignee", "worker", "--type", "bug");
    const repo = basename(store.dir);
    const held = join(configHome, "held");
    await heldFiles(held, repo);
    const queue = await startQueue();
    const served = await serve(store.dir, configHome, {
      auth: { signing_key: "state:dispatch-signing-key" },
      extra: [
        `[hosts.host-b]\nallow_repos = ["${repo}"]`,
        `[hosts.host-c]\nallow_repos = ["${repo}"]`,
        `[review]\ncommand = ${JSON.stringify([process.execPath, FAKE_HELD, held])}`,
        `[queue]\nurl = "${queue.url}"`,
        `[dispatch]\nhost = "host-b"\nrecord = "local"`,
      ].join("\n\n"),
    });
    await signIn(page, served);
    await page.goto(new URL("review", served.url).href);
    await use({ page, store, ids });
    await served.stop();
    await new Promise((resolve) => queue.server.close(resolve));
    await store.remove();
  },
});

reviewTest.describe("the Review view", () => {
  reviewTest(
    "should answer a held decision with one key after the undo window",
    async ({ review }) => {
      const { page } = review;
      const card = page.getByRole("radiogroup", { name: "D-3: How an answer is recorded" });
      await expect(card).toBeFocused();
      await expect(card.getByRole("radio", { checked: true })).toContainText("(a)");
      await expect(page.getByTestId("held-body")).toContainText("The options follow.");
      const answered = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/dispatch/answer",
        { timeout: 20_000 },
      );
      await page.keyboard.press("Enter");
      await expect(page.getByText(/Answering D-3 \(a\)/)).toBeVisible();
      const reply = await answered;
      expect(reply.status()).toBe(201);
      const body = (await reply.json()) as { answer: string; dispatch: { id: string } };
      expect(body.answer).toContain("D-3: (a) Name the option and say a control chose it");
      await expect(page.getByText("Delivery", { exact: true })).toBeVisible();
      await expect(page.locator("[data-indicator='delivery']")).toContainText("queued");
    },
  );

  reviewTest("should cancel a one-key answer on Escape and write nothing", async ({ review }) => {
    const { page } = review;
    let wrote = false;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/dispatch/answer") wrote = true;
    });
    await expect(page.getByRole("radiogroup", { name: /D-3/ })).toBeFocused();
    await page.keyboard.press("2");
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Answering/)).toHaveCount(0);
    await page.waitForTimeout(6_000);
    expect(wrote).toBe(false);
  });

  reviewTest(
    "should carry its filters in the URL and draw the same list when the URL is opened",
    async ({ review }) => {
      const { page, ids } = review;
      if ((page.viewportSize()?.width ?? 0) < 600) {
        await page.getByRole("button", { name: /Back to the list/ }).click();
      }
      await page.getByLabel("Type").selectOption("bug");
      await expect(page).toHaveURL(/[?&]type=bug/);
      await expect(page.locator(`[data-entry$=":${ids.running}"]`).first()).toBeVisible();
      await expect(page.locator(`button[data-entry$=":${ids.blocked}"]`)).toHaveCount(0);
      await page.reload();
      await expect(page.getByLabel("Type")).toHaveValue("bug");
      await expect(page.locator(`button[data-entry$=":${ids.blocked}"]`)).toHaveCount(0);
    },
  );

  reviewTest(
    "should send a prompt from the composer, keep its action on screen and show it queued",
    async ({ review }) => {
      const { page, ids } = review;
      if ((page.viewportSize()?.width ?? 0) < 600) {
        await page.getByRole("button", { name: /Back to the list/ }).click();
      }
      await page.locator(`button[data-entry$=":${ids.running}"]`).click();
      await page.getByRole("button", { name: "Write a prompt" }).click();
      const editor = page.getByLabel("Prompt text");
      await expect(editor).toBeFocused();
      await page.keyboard.type("Report where the run stands");
      await page.keyboard.press("Enter");
      await page.keyboard.type("then stop");
      const action = page.getByTestId("composer-submit");
      await expect(action).toBeInViewport();
      const sent = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/dispatch/prompt",
      );
      await action.click();
      expect((await sent).status()).toBe(201);
      await expect(page.locator("[data-indicator='delivery']")).toContainText("queued");
      await expect(page.locator("[data-indicator='liveness']")).toContainText("active");
      await expect(page.locator("[data-indicator='liveness']")).toContainText(
        "from the work queue's session registry",
      );
      const comments = JSON.parse(await review.store.bd("comments", ids.running, "--json")) as {
        text: string;
      }[];
      expect(comments.some((comment) => comment.text.includes("beads-ui dispatch"))).toBe(true);
    },
  );

  reviewTest(
    "should offer the skill catalog on / in the composer and complete the chosen skill",
    async ({ review }) => {
      const { page, ids } = review;
      if ((page.viewportSize()?.width ?? 0) < 600) {
        await page.getByRole("button", { name: /Back to the list/ }).click();
      }
      await page.locator(`button[data-entry$=":${ids.running}"]`).click();
      const catalog = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/dispatch/skills",
      );
      await page.getByRole("button", { name: "Write a prompt" }).click();
      expect((await catalog).status()).toBe(200);
      await expect(page.getByLabel("Prompt text")).toBeFocused();
      await page.keyboard.type("/imp");
      await expect(page.locator("[data-skill='imp']")).toHaveAttribute(
        "data-skill-verdict",
        "invalid",
      );
      await expect(page.getByTestId("skill-suggestion-beads-task")).toHaveCount(0);
      await page.keyboard.press("Enter");
      await expect(page.locator("[data-skill='implement']")).toHaveAttribute(
        "data-skill-verdict",
        "valid",
      );
      await page.keyboard.type(" and /nonsense");
      await expect(page.locator("[data-skill='nonsense']")).toHaveAttribute(
        "data-skill-verdict",
        "invalid",
      );
    },
  );

  reviewTest(
    "should refuse a prompt holding a secret and name the rule without the text",
    async ({ review }) => {
      const { page, ids } = review;
      if ((page.viewportSize()?.width ?? 0) < 600) {
        await page.getByRole("button", { name: /Back to the list/ }).click();
      }
      await page.locator(`button[data-entry$=":${ids.running}"]`).click();
      await page.getByRole("button", { name: "Write a prompt" }).click();
      await expect(page.getByLabel("Prompt text")).toBeFocused();
      const secret = ["AKIA", "IOSFODNN7", "EXAMPLE"].join("");
      await page.keyboard.type(`use ${secret} now`);
      let sent = false;
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/api/dispatch/prompt") sent = true;
      });
      await page.getByTestId("composer-submit").click();
      const alert = page.locator(".composer-refusal");
      await expect(alert).toContainText("AWS access key id");
      await expect(alert).not.toContainText(secret);
      expect(sent).toBe(false);
    },
  );

  reviewTest(
    "should unblock a task with a resolution and hold its next-step prompt until the unblock is acted on",
    async ({ review }) => {
      const { page, ids } = review;
      if ((page.viewportSize()?.width ?? 0) < 600) {
        await page.getByRole("button", { name: /Back to the list/ }).click();
      }
      await page.locator(`button[data-entry$=":${ids.blocked}"]`).click();
      await page.getByLabel("Resolution").fill("The space is approved.");
      await page.getByLabel(/Next-step prompt/).fill("Publish the drafts.");
      const sent = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/dispatch/unblock",
      );
      await page.getByRole("button", { name: "Unblock" }).click();
      expect((await sent).status()).toBe(201);
      await expect(page.getByText(/waits for the unblock to be acted on/)).toBeVisible();
    },
  );
});
