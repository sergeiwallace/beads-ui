import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test as base, expect, type Page } from "@playwright/test";
import { hostConfig } from "../test/auth-env.ts";
import { createStore, type TestStore } from "../test/store.ts";

const exec = promisify(execFile);

export const BIN = fileURLToPath(new URL("../bin/beads-ui-web.mjs", import.meta.url));

export interface Served {
  url: string;
  port: number;
  /** Milliseconds from spawning the command to its URL line. */
  startedInMs: number;
  child: ChildProcess;
  /** The environment the command ran with: its private config and state homes. */
  env: NodeJS.ProcessEnv;
  cwd: string;
  output(): string;
  stop(): Promise<void>;
}

/** What a spec may change about the served host: its allowlist and the command's environment. */
export interface ServeOptions {
  /** `[hosts] allow_repos`; the served store's repository alone unless given. */
  allowRepos?: string[];
  /** More of the host's `beads-ui.toml`, such as a `[web]` table. */
  extra?: string;
  /** Added to the command's environment, such as a HOME holding a store inventory. */
  env?: NodeJS.ProcessEnv;
}

/**
 * The host settings the documented command needs, in a private config home: the `[auth]` table
 * and `[hosts] allow_repos` listing the store's repository. Credentials go to a private state home.
 */
async function hostSettings(
  dir: string,
  configHome: string,
  options: ServeOptions,
): Promise<NodeJS.ProcessEnv> {
  await mkdir(join(configHome, "beads-ui"), { recursive: true });
  await writeFile(
    join(configHome, "beads-ui", "beads-ui.toml"),
    hostConfig({
      allowRepos: options.allowRepos ?? [basename(dir)],
      ...(options.extra === undefined ? {} : { extra: options.extra }),
    }),
  );
  // A private HOME too: the server reads the host's store inventory under HOME, and a spec
  // serves only the stores it makes.
  await mkdir(join(configHome, "home"), { recursive: true });
  return {
    ...process.env,
    HOME: join(configHome, "home"),
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: join(configHome, "state"),
    ...options.env,
  };
}

/**
 * Runs the documented command, `beads-ui-web --port 0`, in `dir`, and resolves on the URL line
 * it prints. The user's config, state and store inventory are kept out with a private
 * XDG_CONFIG_HOME, XDG_STATE_HOME and HOME.
 */
export async function serve(
  dir: string,
  configHome: string,
  options: ServeOptions = {},
): Promise<Served> {
  const env = await hostSettings(dir, configHome, options);
  const started = Date.now();
  const child = spawn(process.execPath, [BIN, "--port", "0"], {
    cwd: dir,
    env,
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
    port: Number(new URL(url).port),
    startedInMs: Date.now() - started,
    child,
    env,
    cwd: dir,
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

/**
 * The sign-in link the documented host command prints, `beads-ui-web login-link`, for the
 * origin the browser opens the server on.
 */
export async function loginLink(served: Served): Promise<string> {
  const { stdout } = await exec(
    process.execPath,
    [BIN, "login-link", "--port", String(served.port), "--origin", new URL(served.url).origin],
    { cwd: served.cwd, env: served.env, encoding: "utf8", timeout: 30_000 },
  );
  return stdout.trim();
}

/** Signs `page` in through a fresh link; the page lands on the Board. */
export async function signIn(page: Page, served: Served): Promise<void> {
  await page.goto(await loginLink(served));
}

export interface App {
  store: TestStore;
  served: Served;
  url: string;
}

export const test = base.extend<{
  configHome: string;
  /** A served store, not signed in. */
  served: Served & { store: TestStore };
  /** A served store with the page signed in. */
  app: App;
}>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern.
  configHome: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "beads-ui-e2e-config-"));
    await use(dir);
    // bd writes its event log under the private HOME (`.beads/eventsData`) for a moment after the
    // served command has exited, so a one-shot removal can meet a directory still filling.
    await rm(dir, { recursive: true, maxRetries: 10, retryDelay: 200 });
  },
  served: async ({ configHome }, use) => {
    const store = await createStore("e2e");
    const served = await serve(store.dir, configHome);
    await use(Object.assign(served, { store }));
    await served.stop();
    await store.remove();
  },
  app: async ({ served, page }, use) => {
    await signIn(page, served);
    await use({ store: served.store, served, url: served.url });
  },
});

export { expect };

/** The Board column for a status. */
export const column = (page: Page, status: string) =>
  page.locator(`section.bu-column[data-status="${status}"]`);

/** A card by its issue id. */
export const card = (page: Page, id: string) => page.locator(`li.bu-card[data-card-id="${id}"]`);

/** The card ids of a column, top to bottom. */
export async function columnIds(page: Page, status: string) {
  return column(page, status)
    .locator("li.bu-card")
    .evaluateAll((cards) => cards.map((element) => element.getAttribute("data-card-id")));
}

/**
 * The response to the page's next write to an issue. A spec waits for it rather than polling the
 * store: an embedded store runs one bd process at a time, so a polling spec would queue its own
 * reads in front of the write it is waiting for.
 */
export const written = (page: Page, id: string, kind: "status" | "priority" | "rank") =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/issues/${id}/${kind}`,
  );
