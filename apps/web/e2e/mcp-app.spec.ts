import type { Page } from "@playwright/test";
import { boardHtml } from "../../../packages/mcp-server/src/view.ts";
import { expect, test } from "./fixtures.ts";

// The MCP App's board view in a real browser (beads-ui design T-4.1 and T-4.2, web app design
// Phase W4): the `ui://beads-ui/board` document runs in a sandboxed iframe under a minimal MCP
// Apps host that answers the view's JSON-RPC over postMessage and records every request. A draft
// the model asked for is shown with its Confirm control, a prompt the user types is confirmed in
// the view before it is sent, and no write tool is called until the user confirms.

interface HostLog {
  initialized: boolean;
  modes: string[];
  calls: { name: string; arguments: Record<string, unknown> }[];
}

const DRAFT = {
  id: "draft-e2e-0000000001",
  repo: "work",
  task: "work-7",
  text: "Rebase onto main and rerun the suite",
  state: "draft",
};

/** Opens the board view under the host and waits until it has initialized. */
async function openView(page: Page) {
  const html = await boardHtml();
  await page.setContent("<!doctype html><title>host</title><body></body>");
  await page.evaluate((view) => {
    const log: HostLog = { initialized: false, modes: [], calls: [] };
    (window as unknown as { hostLog: HostLog }).hostLog = log;
    const frame = document.createElement("iframe");
    frame.id = "app";
    frame.setAttribute("sandbox", "allow-scripts allow-forms");
    frame.style.width = "800px";
    frame.style.height = "600px";
    window.addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow) return;
      const message = event.data as {
        jsonrpc?: string;
        id?: number | string;
        method?: string;
        params?: Record<string, unknown>;
      };
      if (message?.jsonrpc !== "2.0" || message.method === undefined) return;
      const reply = (result: unknown) =>
        frame.contentWindow?.postMessage({ jsonrpc: "2.0", id: message.id, result }, "*");
      switch (message.method) {
        case "ui/initialize":
          reply({
            protocolVersion: message.params?.protocolVersion,
            hostInfo: { name: "test-host", version: "1.0.0" },
            hostCapabilities: { serverTools: {} },
            hostContext: {
              theme: "dark",
              displayMode: "inline",
              availableDisplayModes: ["inline", "fullscreen"],
              styles: { variables: { "--color-background-primary": "rgb(1, 2, 3)" } },
            },
          });
          return;
        case "ui/notifications/initialized":
          log.initialized = true;
          return;
        case "ui/request-display-mode":
          log.modes.push(String(message.params?.mode));
          reply({ mode: message.params?.mode });
          return;
        case "tools/call":
          log.calls.push({
            name: String(message.params?.name),
            arguments: message.params?.arguments as Record<string, unknown>,
          });
          reply({ content: [{ type: "text", text: "sent as dispatch 01JTEST" }] });
          return;
        default:
          if (message.id !== undefined) reply({});
      }
    });
    frame.srcdoc = view;
    document.body.append(frame);
  }, html);
  const log = () => page.evaluate(() => (window as unknown as { hostLog: HostLog }).hostLog);
  await expect.poll(async () => (await log()).initialized, { timeout: 20_000 }).toBe(true);
  return { log, view: page.frameLocator("#app") };
}

test("should show a drafted prompt with its Confirm control and call the confirm tool only when it is pressed", async ({
  page,
}) => {
  const { log, view } = await openView(page);
  expect((await log()).modes).toEqual(["fullscreen"]);

  await page.evaluate((draft) => {
    const frame = document.getElementById("app") as HTMLIFrameElement;
    frame.contentWindow?.postMessage(
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          content: [{ type: "text", text: `draft ${draft.id}: nothing was sent.` }],
          structuredContent: { draft },
        },
      },
      "*",
    );
  }, DRAFT);

  const row = view.locator(`li[data-draft="${DRAFT.id}"]`);
  await expect(row).toContainText(DRAFT.text);
  await expect(row).toContainText(`for ${DRAFT.task} in ${DRAFT.repo}`);
  expect((await log()).calls).toEqual([]);

  await row.getByRole("button", { name: "Confirm and send" }).click();
  await expect(row).toContainText("sent as dispatch 01JTEST");
  expect((await log()).calls).toEqual([
    { name: "beads_dispatch_confirm", arguments: { draft: DRAFT.id } },
  ]);
  await expect(view.locator("body")).toHaveCSS("background-color", "rgb(1, 2, 3)");
});

test("should confirm a typed prompt in the view before calling the send tool, and call nothing when it is cancelled", async ({
  page,
}) => {
  const { log, view } = await openView(page);
  const fill = async (text: string) => {
    await view.getByRole("textbox", { name: "Repository" }).fill("work");
    await view.getByRole("textbox", { name: "Task" }).fill("work-9");
    await view.getByRole("textbox", { name: "Prompt" }).fill(text);
    await view.getByRole("button", { name: "Send", exact: true }).click();
  };
  const confirm = view.getByRole("group", { name: "Send this prompt?" });

  await fill("Not this one");
  await expect(confirm).toContainText("To the session that owns work-9 in work");
  await expect(confirm).toContainText("Not this one");
  expect((await log()).calls).toEqual([]);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  await expect(view.getByRole("status")).toHaveText("Not sent.");
  expect((await log()).calls).toEqual([]);

  await fill("Pick up the failing test");
  expect((await log()).calls).toEqual([]);
  await confirm.getByRole("button", { name: "Send it" }).click();
  await expect(view.getByRole("status")).toHaveText("sent as dispatch 01JTEST");
  const calls = (await log()).calls;
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    name: "beads_dispatch_send",
    arguments: { repo: "work", task: "work-9", text: "Pick up the failing test" },
  });
  expect(String(calls[0]?.arguments.id)).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
});
