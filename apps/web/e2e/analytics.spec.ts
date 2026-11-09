import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

/** The page's read of `path`: the view draws once it lands, however long a loaded host takes. */
const viewRead = (page: Page, path: string) =>
  page.waitForResponse((response) => new URL(response.url()).pathname === path, {
    timeout: 60_000,
  });

// T-3.3: "When Analytics renders, the system shall draw throughput, cycle time with a rolling
// average, cumulative flow, a count-based sprint burndown and aging work in progress from bd
// history --events." and "Where a Claude Code cost export is configured, when an issue closed
// with a session id the system shall show cost and tokens per closed issue."

const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

test.describe("Analytics", () => {
  test("should draw throughput, cycle time, cumulative flow, the sprint burndown and aging work", async ({
    app,
    page,
  }) => {
    const done = await app.store.create("Shipped");
    await app.store.bd("update", done, "--status", "in_progress");
    await app.store.bd("close", done);
    const working = await app.store.create("Still going", { status: "in_progress" });
    await app.store.bd(
      "create",
      "Sprint s1",
      "-t",
      "milestone",
      "--due",
      `${day(4)}T12:00:00Z`,
      `--metadata=${JSON.stringify({ "sprint.starts_at": day(-3) })}`,
      "--json",
    );
    const member = await app.store.create("Sprint task");
    await app.store.bd("update", member, "--add-label", "sprint:s1");

    const read = viewRead(page, "/api/analytics");
    await page.goto(`${app.url}analytics`);
    await read;

    for (const chart of ["throughput", "cycle-time", "cumulative-flow", "burndown"]) {
      await expect(
        page.locator(`figure[data-chart="${chart}"] svg.recharts-surface`).first(),
      ).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Sprint s1 burndown" })).toBeVisible();
    await expect(
      page.locator(`figure[data-chart="aging"] li[data-aging-id="${working}"]`),
    ).toBeVisible();

    const throughput = page.locator('figure[data-chart="throughput"]');
    await throughput.getByText("Data").click();
    await expect(throughput.locator("tbody tr").last().locator("td").last()).toHaveText("1");
    const cycle = page.locator('figure[data-chart="cycle-time"]');
    await cycle.getByText("Data").click();
    await expect(cycle.locator("tbody tr")).toHaveCount(1);
    await expect(cycle.locator("thead")).toContainText("Rolling average");
    await expect(page.locator('[data-chart="cost"]')).toHaveCount(0);
  });

  test("should show cost and tokens for an issue closed with a session id where an export is configured", async ({
    app,
    page,
  }) => {
    const dir = await mkdtemp(join(tmpdir(), "beads-ui-e2e-cost-"));
    try {
      const id = await app.store.create("Closed by a session");
      await app.store.bd("close", id, "--session", "session-e2e");
      const attributes = (type?: string) => [
        { key: "session.id", value: { stringValue: "session-e2e" } },
        ...(type === undefined ? [] : [{ key: "type", value: { stringValue: type } }]),
      ];
      const line = {
        resourceMetrics: [
          {
            resource: { attributes: [] },
            scopeMetrics: [
              {
                metrics: [
                  {
                    name: "claude_code.cost.usage",
                    sum: {
                      aggregationTemporality: 1,
                      dataPoints: [{ attributes: attributes(), asDouble: 0.42 }],
                    },
                  },
                  {
                    name: "claude_code.token.usage",
                    sum: {
                      aggregationTemporality: 1,
                      dataPoints: [
                        { attributes: attributes("input"), asInt: "1000" },
                        { attributes: attributes("output"), asInt: "234" },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      };
      await writeFile(join(dir, "metrics.jsonl"), `${JSON.stringify(line)}\n`);
      await writeFile(
        join(app.store.dir, "beads-ui.toml"),
        `[analytics]\ncost_export = "${join(dir, "metrics.jsonl")}"\n`,
      );

      const read = viewRead(page, "/api/analytics");
      await page.goto(`${app.url}analytics`);
      await read;

      const row = page.locator(`[data-chart="cost"] tr`, {
        has: page.locator(`[data-cost-id="${id}"]`),
      });
      await expect(row).toContainText("session-e2e");
      await expect(row).toContainText("$0.4200");
      await expect(row).toContainText("1,234");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
