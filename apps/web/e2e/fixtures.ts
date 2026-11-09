import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect } from "@playwright/test";
import { createStore, type TestStore } from "../test/store.ts";

export const BIN = fileURLToPath(new URL("../bin/beads-ui-web.mjs", import.meta.url));

export interface Served {
  url: string;
  /** Milliseconds from spawning the command to its URL line. */
  startedInMs: number;
  child: ChildProcess;
  output(): string;
  stop(): Promise<void>;
}

/**
 * Runs the documented command, `beads-ui-web --port 0`, in `dir`, and resolves on the URL line
 * it prints. The user's config is kept out with a private XDG_CONFIG_HOME.
 */
export async function serve(dir: string, configHome: string): Promise<Served> {
  const started = Date.now();
  const child = spawn(process.execPath, [BIN, "--port", "0"], {
    cwd: dir,
    env: { ...process.env, XDG_CONFIG_HOME: configHome },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const url = await new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = /at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(output);
      if (match?.[1] !== undefined) resolve(match[1]);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => reject(new Error(`beads-ui-web exited ${code}: ${output}`)));
  });
  return {
    url,
    startedInMs: Date.now() - started,
    child,
    output: () => output,
    stop: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
      }),
  };
}

export interface App {
  store: TestStore;
  served: Served;
  url: string;
}

export const test = base.extend<{ app: App; configHome: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern.
  configHome: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "beads-ui-e2e-config-"));
    await use(dir);
    await rm(dir, { recursive: true });
  },
  app: async ({ configHome }, use) => {
    const store = await createStore("e2e");
    const served = await serve(store.dir, configHome);
    await use({ store, served, url: served.url });
    await served.stop();
    await store.remove();
  },
});

export { expect };

/** The Board column for a status. */
export const column = (page: import("@playwright/test").Page, status: string) =>
  page.locator(`section.bu-column[data-status="${status}"]`);

/** A card by its issue id. */
export const card = (page: import("@playwright/test").Page, id: string) =>
  page.locator(`li.bu-card[data-card-id="${id}"]`);

/** The card ids of a column, top to bottom. */
export async function columnIds(page: import("@playwright/test").Page, status: string) {
  return column(page, status)
    .locator("li.bu-card")
    .evaluateAll((cards) => cards.map((element) => element.getAttribute("data-card-id")));
}

/**
 * The response to the page's next write to an issue. A spec waits for it rather than polling the
 * store: an embedded store runs one bd process at a time, so a polling spec would queue its own
 * reads in front of the write it is waiting for.
 */
export const written = (
  page: import("@playwright/test").Page,
  id: string,
  kind: "status" | "priority" | "rank",
) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/issues/${id}/${kind}`,
  );
