import { execFile } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";
import { currentTest } from "@sergeiwallace/frontend-test-harness";
import { expect, test as harness } from "@sergeiwallace/frontend-test-harness/test";
import { adminKey } from "../server/auth.ts";
import { createStore, type TestStore } from "../test/store.ts";
import {
  BIN,
  loginLink,
  type Served,
  type ServeOptions,
  serve,
  servedApp,
} from "./harness/adapter.ts";

export { BIN, loginLink, type Served, type ServeOptions, serve };

const exec = promisify(execFile);

/**
 * Runs a spec's own setup outside the test's budget: once `work` settles, the running test's
 * timeout grows by the time it took. The budget then pays for what the page and the server do,
 * however slow a loaded host makes `bd init` and the spec's own bd calls, each of which is bounded
 * by its own timeout (test/store.ts). Work that hangs still runs out the budget it started in.
 */
export async function unbudgeted<T>(work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    const info = harness.info();
    info.setTimeout(info.timeout + (Date.now() - started));
  }
}

/** `store` with every bd call it makes run outside the test's budget. */
export function unbudgetedStore(store: TestStore): TestStore {
  return {
    dir: store.dir,
    bd: (...args) => unbudgeted(() => store.bd(...args)),
    create: (title, options) => unbudgeted(() => store.create(title, options)),
    show: (id) => unbudgeted(() => store.show(id)),
    remove: () => store.remove(),
  };
}

/** Signs `page` in through a fresh link; the page lands on the Board. */
export async function signIn(page: Page, served: Served): Promise<void> {
  await page.goto(await unbudgeted(() => loginLink(served)));
}

/**
 * Gives `page` a session through a fresh link without opening a view: the page's request context
 * follows the link and keeps the cookie. A spec that starts on another view skips the Board read a
 * landing would start, which the server would go on running beside the view's own read.
 */
export async function authorize(page: Page, served: Served): Promise<void> {
  const link = await unbudgeted(() => loginLink(served));
  const reply = await page.request.get(link, { maxRedirects: 0 });
  expect(reply.status(), "the sign-in link's exchange").toBe(303);
}

export interface App {
  store: TestStore;
  served: Served;
  url: string;
  /** The served command's private config home: its `beads-ui/beads-ui.toml`, state and HOME. */
  configHome: string;
}

const STATE = join("state", "beads-ui", "web");
const SESSIONS_FILE = join(STATE, "browser-sessions.json");
const RESTORED = [join("beads-ui", "beads-ui.toml"), join(STATE, "writes.jsonl")];
const restorable = (path: string) =>
  RESTORED.includes(path) || path === "home" || path.startsWith(`home${sep}`);
const COPY = { recursive: true, verbatimSymlinks: true } as const;
const QUIET_WITHIN_MS = 15_000;
const QUIET_FOR_MS = 300;

interface Entry {
  dir: boolean;
  size: number;
  mtimeMs: number;
}

interface Image {
  copy: string;
  seen: Map<string, Entry>;
}

async function tree(root: string): Promise<Map<string, Entry>> {
  const entries = new Map<string, Entry>();
  for (const found of await readdir(root, { recursive: true, withFileTypes: true })) {
    const path = join(found.parentPath, found.name);
    const info = await lstat(path).catch(() => undefined);
    if (info === undefined) continue;
    entries.set(relative(root, path), {
      dir: info.isDirectory(),
      size: info.size,
      mtimeMs: info.mtimeMs,
    });
  }
  return entries;
}

async function takeImage(live: string, copy: string): Promise<Image> {
  const seen = await tree(live);
  await cp(live, copy, COPY);
  return { copy, seen };
}

async function changed(image: Image, live: string): Promise<string[]> {
  const now = await tree(live);
  const paths: string[] = [];
  for (const [path, entry] of now) {
    const before = image.seen.get(path);
    const same =
      before !== undefined &&
      before.dir === entry.dir &&
      (entry.dir || (before.size === entry.size && before.mtimeMs === entry.mtimeMs));
    if (!same) paths.push(path);
  }
  for (const path of image.seen.keys()) if (!now.has(path)) paths.push(path);
  return paths;
}

async function restore(image: Image, live: string, paths: readonly string[]): Promise<void> {
  for (const path of [...paths].sort((a, b) => b.length - a.length)) {
    if (!image.seen.has(path)) await rm(join(live, path), { recursive: true, force: true });
  }
  for (const path of [...paths].sort((a, b) => a.length - b.length)) {
    const entry = image.seen.get(path);
    if (entry === undefined) continue;
    const target = join(live, path);
    if (entry.dir) {
      await mkdir(target, { recursive: true });
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    if ((await lstat(target).catch(() => undefined))?.isDirectory()) {
      await rm(target, { recursive: true, force: true });
    }
    const next = `${target}.pristine-${process.pid}`;
    await cp(join(image.copy, path), next, COPY);
    await rename(next, target);
  }
  image.seen = await tree(live);
}

const alive = (served: Served) =>
  served.child.exitCode === null && served.child.signalCode === null;

async function children(group: number): Promise<number> {
  try {
    const { stdout } = await exec("pgrep", ["-g", String(group)]);
    return stdout.split("\n").filter((line) => line.trim() !== "" && Number(line) !== group).length;
  } catch (error) {
    if ((error as { code?: unknown }).code === 1) return 0;
    throw error;
  }
}

async function quiet(served: Served): Promise<boolean> {
  const group = served.child.pid;
  if (group === undefined) return false;
  const deadline = Date.now() + QUIET_WITHIN_MS;
  let since: number | undefined;
  while (Date.now() < deadline) {
    if ((await children(group)) > 0) since = undefined;
    else {
      since ??= Date.now();
      if (Date.now() - since >= QUIET_FOR_MS) return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function admin(configHome: string) {
  const secret = await readFile(join(configHome, STATE, "browser-secret"), "utf8");
  return { authorization: `Bearer ${adminKey(secret)}` };
}

async function sessionIds(served: Served, configHome: string): Promise<string[]> {
  const listed = await fetch(new URL("api/admin/v1/sessions", served.url), {
    headers: await admin(configHome),
  });
  if (listed.status !== 200) throw new Error(`the sessions read answered ${listed.status}`);
  return ((await listed.json()) as { sessions: { id: string }[] }).sessions.map(({ id }) => id);
}

async function endSessions(served: Served, configHome: string): Promise<void> {
  const headers = await admin(configHome);
  for (const id of await sessionIds(served, configHome)) {
    const path = `api/admin/v1/sessions/${encodeURIComponent(id)}/revoke`;
    const ended = await fetch(new URL(path, served.url), { method: "POST", headers });
    if (ended.status !== 204) throw new Error(`revoking a session answered ${ended.status}`);
  }
}

interface WorkerApp {
  store: TestStore;
  served: Served;
  configHome: string;
  pristine: string;
  storeImage: Image;
  configImage: Image;
  logFrom: number;
}

async function bootWorkerApp(): Promise<WorkerApp> {
  const store = await createStore("e2e");
  const configHome = await mkdtemp(join(tmpdir(), "beads-ui-e2e-config-"));
  const pristine = await mkdtemp(join(tmpdir(), "beads-ui-e2e-pristine-"));
  const storeImage = await takeImage(store.dir, join(pristine, "store"));
  const served = await serve(store.dir, configHome, {}, false);
  const configImage = await takeImage(configHome, join(pristine, "config"));
  return { store, served, configHome, pristine, storeImage, configImage, logFrom: 0 };
}

async function retire(app: WorkerApp): Promise<void> {
  await app.served.stop();
  await app.store.remove().catch(() => undefined);
  for (const dir of [app.configHome, app.pristine]) {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

const configChanges = async (app: WorkerApp) =>
  (await changed(app.configImage, app.configHome)).filter((path) => path !== SESSIONS_FILE);

async function reset(app: WorkerApp): Promise<boolean> {
  try {
    if (!alive(app.served) || !(await quiet(app.served))) return false;
    await endSessions(app.served, app.configHome);
    const configPaths = await configChanges(app);
    if (!configPaths.every(restorable)) return false;
    await restore(app.configImage, app.configHome, configPaths);
    await restore(app.storeImage, app.store.dir, await changed(app.storeImage, app.store.dir));
    if (!(await quiet(app.served))) return false;
    const late = [...(await configChanges(app)), ...(await changed(app.storeImage, app.store.dir))];
    if (late.length > 0) return false;
    return (await sessionIds(app.served, app.configHome)).length === 0 && alive(app.served);
  } catch {
    return false;
  }
}

class WorkerServer {
  #app: WorkerApp | undefined;

  async acquire(): Promise<WorkerApp> {
    const kept = this.#app;
    if (kept !== undefined && (await reset(kept))) {
      kept.logFrom = kept.served.logged();
      return kept;
    }
    this.#app = undefined;
    if (kept !== undefined) await retire(kept);
    this.#app = await bootWorkerApp();
    return this.#app;
  }

  async close(): Promise<void> {
    if (this.#app !== undefined) await retire(this.#app);
    this.#app = undefined;
  }
}

export const test = harness.extend<
  {
    configHome: string;
    /** A served store, not signed in. */
    served: Served & { store: TestStore; configHome: string };
    /** A served store with the page signed in. */
    app: App;
    /** A served store whose page holds a session and has opened no view yet. */
    signedIn: App;
  },
  { workerServer: WorkerServer }
>({
  workerServer: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern.
    async ({}, use) => {
      const server = new WorkerServer();
      await use(server);
      await server.close();
    },
    { scope: "worker", timeout: 120_000 },
  ],
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern.
  configHome: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "beads-ui-e2e-config-"));
    await use(dir);
    await rm(dir, { recursive: true, maxRetries: 10, retryDelay: 200 });
  },
  served: async ({ workerServer }, use) => {
    const { store, served, configHome, logFrom } = await unbudgeted(() => workerServer.acquire());
    currentTest()?.registerApp(servedApp({ served, configHome }, logFrom));
    await use(Object.assign(served, { store: unbudgetedStore(store), configHome }));
  },
  app: async ({ served, page }, use) => {
    await signIn(page, served);
    await use({ store: served.store, served, url: served.url, configHome: served.configHome });
  },
  signedIn: async ({ served, page }, use) => {
    await authorize(page, served);
    await use({ store: served.store, served, url: served.url, configHome: served.configHome });
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
