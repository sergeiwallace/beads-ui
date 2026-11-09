import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Page } from "@playwright/test";
import { hostConfig } from "../test/auth-env.ts";
import { type FakeQueue, startFakeQueue } from "../test/queue-fake.ts";
import { expect, test, written } from "./fixtures.ts";

/** The page's read of `path`: the view draws once it lands, however long a loaded host takes. */
const viewRead = (page: Page, path: string) =>
  page.waitForResponse((response) => new URL(response.url()).pathname === path, {
    timeout: 60_000,
  });

// T-3.4: the Sessions view from the work queue where `[queue] url` is set, from the store's
// assignees without it, and a status change on a leased task written through the queue. The
// queue is an in-process fake answering ai-core's routes with its shapes (test/queue-fake.ts).

const QUEUE_REPO = "demo";

const withQueue = test.extend<{ queue: FakeQueue }>({
  queue: async ({ app, configHome }, use) => {
    const queue = await startFakeQueue();
    // `[queue]` is read from the host's own file, beside its allowlist and `[auth]`.
    await writeFile(
      join(configHome, "beads-ui", "beads-ui.toml"),
      hostConfig({
        allowRepos: [basename(app.store.dir), QUEUE_REPO],
        extra: `[queue]\nurl = "${queue.url}"\nrepo = "${QUEUE_REPO}"\n`,
      }),
    );
    await use(queue);
    await queue.close();
  },
});

test.describe("Sessions", () => {
  test("should list the store's assignees and say liveness is unavailable when queue.url is empty", async ({
    app,
    page,
  }) => {
    const id = await app.store.create("Claimed", { status: "in_progress" });
    await app.store.bd("update", id, "--assignee", "host-a/session-1");

    const read = viewRead(page, "/api/sessions");
    await page.goto(`${app.url}sessions`);
    await read;

    await expect(page.locator(".bu-sessions").getByRole("status")).toContainText(
      "Liveness is unavailable",
    );
    const row = page.locator('tr[data-session-id="host-a/session-1"]');
    await expect(row).toContainText("session-1");
    await expect(row).toContainText(id);
    await expect(page.getByRole("columnheader", { name: "State" })).toHaveCount(0);
  });

  withQueue(
    "should show each queue session's state, current task, last heartbeat and claim age",
    async ({ app, page, queue }) => {
      queue.sessions = [
        {
          id: "host-a/session-1",
          machine: "host-a",
          repo: QUEUE_REPO,
          state: "busy",
          last_heartbeat_at: new Date(Date.now() - 30_000).toISOString(),
        },
        { id: "host-b/session-2", machine: "host-b", repo: QUEUE_REPO, state: "gone" },
      ];
      queue.tasks = [
        {
          repo: QUEUE_REPO,
          task_id: "demo-7",
          title: "Queue task",
          queue_state: "assigned",
          owner_session: "host-a/session-1",
          events: [
            {
              kind: "queue.task.assigned",
              ts: new Date(Date.now() - 45 * 60_000).toISOString(),
              session_id: "host-a/session-1",
            },
          ],
        },
      ];

      const read = viewRead(page, "/api/sessions");
      await page.goto(`${app.url}sessions`);
      await read;

      await expect(page.locator(".bu-sessions").getByRole("status")).toHaveText(
        "1 of 2 sessions in the work queue's registry are live.",
      );
      const busy = page.locator('tr[data-session-id="host-a/session-1"]');
      await expect(busy.locator('[data-label="State"]')).toHaveText("busy");
      await expect(busy.locator('[data-label="Current task"]')).toContainText("demo-7");
      await expect(busy.locator('[data-label="Last heartbeat"]')).toHaveText(/^\d+s ago$/);
      await expect(busy.locator('[data-label="Claim age"]')).toHaveText("45m");
      await expect(page.locator('tr[data-session-id="host-b/session-2"]')).toHaveAttribute(
        "data-state",
        "gone",
      );
    },
  );

  withQueue(
    "should request a leased task's status through the queue, and show its 409 conflict",
    async ({ app, page, queue }) => {
      const leased = await app.store.create("Leased in the queue");
      const raced = await app.store.create("Moved in the queue");
      queue.tasks = [
        {
          repo: QUEUE_REPO,
          task_id: leased,
          status: "open",
          queue_state: "assigned",
          owner_session: "host-a/s",
        },
        {
          repo: QUEUE_REPO,
          task_id: raced,
          status: "blocked",
          queue_state: "active",
          owner_session: "host-a/s",
        },
      ];
      await page.goto(`${app.url}backlog`);

      const accepted = written(page, leased, "status");
      await page.getByLabel(`Status of ${leased}`).selectOption("in_progress");
      expect((await accepted).status()).toBe(202);
      await expect(
        page.locator(".bu-toast").filter({ hasText: "Requested through the work queue" }),
      ).toBeVisible();
      expect(queue.requests[0]?.body).toEqual({
        status: "in_progress",
        actor: "beads-ui-web",
        expected_status: "open",
      });
      expect((await app.store.show(leased)).status).toBe("open");

      const refused = written(page, raced, "status");
      await page.getByLabel(`Status of ${raced}`).selectOption("in_progress");
      expect((await refused).status()).toBe(409);
      await expect(page.locator(".bu-toast[data-kind='conflict']")).toContainText("blocked");
      expect((await app.store.show(raced)).status).toBe("open");
    },
  );
});
