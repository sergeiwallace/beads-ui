import type { Page, Screen } from "@sergeiwallace/frontend-test-harness";
import { boardHtml } from "../../../../../packages/mcp-server/src/view.ts";

/**
 * Hosts the MCP App's board view (`ui://beads-ui/board`) in a sandboxed iframe under a minimal
 * MCP Apps host that answers its JSON-RPC handshake, as e2e/mcp-app.spec.ts does, and resolves
 * once the view has initialised.
 */
async function hostBoardView(page: Page): Promise<void> {
  const html = await boardHtml();
  await page.setContent("<!doctype html><title>host</title><body></body>");
  await page.evaluate((view) => {
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
      if (message.method === "ui/initialize") {
        reply({
          protocolVersion: message.params?.protocolVersion,
          hostInfo: { name: "harness-host", version: "1.0.0" },
          hostCapabilities: { serverTools: {} },
          hostContext: {
            theme: "dark",
            displayMode: "inline",
            availableDisplayModes: ["inline", "fullscreen"],
          },
        });
        return;
      }
      if (message.method === "ui/notifications/initialized") {
        (window as unknown as { hostReady: boolean }).hostReady = true;
        return;
      }
      if (message.id !== undefined) reply({ mode: message.params?.mode });
    });
    frame.srcdoc = view;
    document.body.append(frame);
  }, html);
}

/** The MCP App's board view inside its host; a page on about:blank holding the #app frame. */
export const MCP_APP_SCREEN: Screen<unknown> = {
  id: "mcp-app",
  route: () => "about:blank",
  async open(page) {
    await hostBoardView(page);
  },
  async ready(page) {
    await page.waitForFunction(
      () =>
        (window as unknown as { hostReady?: boolean }).hostReady === true ||
        document.getElementById("app") !== null,
      undefined,
      { timeout: 30_000 },
    );
    await page.frameLocator("#app").locator("body *").first().waitFor({ timeout: 30_000 });
    return "content";
  },
  landmarks: { frame: (page) => page.locator("#app") },
};
