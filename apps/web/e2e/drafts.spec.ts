import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { createStore } from "../test/store.ts";
import { authorize, expect, serve, test, unbudgeted } from "./fixtures.ts";

// Web app design Phase W4 in a real browser: a prompt a model drafted through the MCP server
// (here, the MCP route the server calls, with the host's MCP token) waits in the Review view
// under Drafts, and is sent only when the user confirms it there.

test("should list a drafted MCP prompt under Drafts and send it only when the user confirms it", async ({
  configHome,
  page,
}) => {
  // Three bd processes and the server's start are the spec's setup, outside its budget.
  const { store, task, repo, served } = await unbudgeted(async () => {
    const store = await createStore("e2e");
    const task = await store.create("Owned by a session", { status: "in_progress" });
    await store.bd("update", task, "--assignee", "worker");
    const repo = basename(store.dir);
    const served = await serve(store.dir, configHome, {
      auth: { signing_key: "state:dispatch-signing-key" },
      extra: [`[hosts.host-b]\nallow_repos = ["${repo}"]`, `[dispatch]\nhost = "host-b"`].join(
        "\n\n",
      ),
    });
    return { store, task, repo, served };
  });
  try {
    const token = (
      await readFile(
        join(String(served.env.XDG_STATE_HOME), "beads-ui", "web", "mcp-token"),
        "utf8",
      )
    ).trim();
    const drafted = await fetch(new URL("api/mcp/v1/drafts", served.url), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        id: "e2e-draft-000000000001",
        user: "owner",
        repo,
        task,
        text: "Rerun the flaky suite",
      }),
    });
    expect(drafted.status).toBe(201);

    // The page opens the Review view first, with no Board landing read beside it.
    await authorize(page, served);
    await page.goto(new URL("review", served.url).href);
    const drafts = page.getByRole("region", { name: "Drafts" });
    await expect(drafts).toContainText("Rerun the flaky suite");
    await expect(drafts).toContainText(`Prompt for ${task} in ${repo}`);

    const confirmed = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/drafts/e2e-draft-000000000001/confirm",
      { timeout: 20_000 },
    );
    await drafts.getByRole("button", { name: "Confirm and send" }).click();
    expect((await confirmed).status()).toBe(201);
    await expect(drafts.getByRole("status")).toContainText("to worker@host-b");
  } finally {
    await served.stop();
    await store.remove();
  }
});
