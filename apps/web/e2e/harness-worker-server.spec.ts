import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { type App, BIN, card, column, expect, test } from "./fixtures.ts";

const exec = promisify(execFile);

test.describe.configure({ mode: "serial" });

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "one worker's server is exercised once, at 1280 px");
});

const configFile = (app: App) => join(app.configHome, "beads-ui", "beads-ui.toml");

const sessionLines = async (app: App) =>
  (
    await exec(process.execPath, [BIN, "sessions", "--port", String(app.served.port)], {
      cwd: app.served.cwd,
      env: app.served.env,
      encoding: "utf8",
    })
  ).stdout
    .split("\n")
    .filter((line) => line.trim() !== "" && line !== "no browser sessions");

const issuesOf = async (app: App) =>
  (JSON.parse((await app.store.bd("list", "--all", "--limit", "0", "--json")) || "[]") ?? []) as {
    id: string;
  }[];

const serverLog = (fth: { apps: { serverLog(): string }[] }) => fth.apps[0]?.serverLog() ?? "";

const stateFile = (app: App) =>
  join(app.configHome, "state", "beads-ui", "web", "left-by-a-test.json");

let first: { pid: number | undefined; config: string; id: string } | undefined;

test("should leave an issue, a config edit, a file in the store and a session behind it", async ({
  app,
  page,
}) => {
  const id = await app.store.create("Left by the first test");
  const config = await readFile(configFile(app), "utf8");
  await writeFile(configFile(app), `${config}\n[queue]\nurl = "http://127.0.0.1:9/"\n`);
  await writeFile(join(app.store.dir, "left-behind.txt"), "left\n");
  await page.goto(app.url);
  await expect(card(page, id)).toBeVisible();
  expect(await sessionLines(app)).toHaveLength(1);
  first = { pid: app.served.child.pid, config, id };
});

test("should give the next test in the worker the same server with a clean store, the default config and only its own session", async ({
  app,
  page,
  fth,
}) => {
  expect(first, "the first test ran in this worker").toBeDefined();
  expect(app.served.child.pid).toBe(first?.pid);
  expect(await issuesOf(app)).toEqual([]);
  expect(await readFile(configFile(app), "utf8")).toBe(first?.config);
  await expect(access(join(app.store.dir, "left-behind.txt"))).rejects.toThrow();
  expect(await sessionLines(app)).toHaveLength(1);
  await page.goto(app.url);
  await expect(column(page, "open")).toBeVisible();
  await expect(card(page, first?.id ?? "")).toHaveCount(0);
  expect(serverLog(fth)).not.toContain(`at ${app.url}`);
});

test("should stop the worker's server", async ({ app }) => {
  first = { pid: app.served.child.pid, config: "", id: "" };
  await app.served.stop();
});

test("should start a fresh server for the next test when a test leaves the worker's server stopped", async ({
  app,
  page,
  fth,
}) => {
  expect(app.served.child.pid).not.toBe(first?.pid);
  expect(serverLog(fth)).toContain(`at ${app.url}`);
  const id = await app.store.create("On the fresh server");
  await page.goto(app.url);
  await expect(card(page, id)).toBeVisible();
});

test("should leave server state behind that the reset cannot put back", async ({ app }) => {
  await writeFile(stateFile(app), "{}\n");
  first = { pid: app.served.child.pid, config: "", id: "" };
});

test("should start a fresh server for the next test when a test leaves such state behind", async ({
  app,
}) => {
  expect(app.served.child.pid).not.toBe(first?.pid);
  await expect(access(stateFile(app))).rejects.toThrow();
});
