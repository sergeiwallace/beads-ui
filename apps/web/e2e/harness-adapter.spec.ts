import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RunningApp } from "@sergeiwallace/frontend-test-harness";
import { createStore } from "../test/store.ts";
import { expect, loginLink, serve, test, unbudgeted } from "./fixtures.ts";
import { type BeadsCtx, BIN, beadsUiAdapter } from "./harness/adapter.ts";
import { screens } from "./harness/screens/index.ts";

const exec = promisify(execFile);

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, "the adapter is exercised once, at 1280 px");
});

const sessionsOf = async (app: RunningApp<BeadsCtx>) => {
  const served = app.ctx.served;
  if (served === undefined) throw new Error("no served server");
  const { stdout } = await exec(
    process.execPath,
    [BIN, "sessions", "--port", String(served.port)],
    {
      cwd: served.cwd,
      env: served.env,
      encoding: "utf8",
    },
  );
  return stdout;
};

test("should boot beads-ui-web --port 0 with a private config, state and HOME and return the URL it printed", async ({
  fth,
}) => {
  const app = (await unbudgeted(() => fth.boot())) as RunningApp<BeadsCtx>;
  const served = app.ctx.served;
  expect(app.url.href).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  expect(served?.output()).toContain(`at ${app.url.href}`);
  const homes = [served?.env.XDG_CONFIG_HOME, served?.env.XDG_STATE_HOME, served?.env.HOME];
  for (const home of homes)
    expect(home?.startsWith(join(tmpdir(), "beads-ui-e2e-config-"))).toBe(true);
  expect(served?.env.HOME).not.toBe(process.env.HOME);
});

test("should stop a server that does not answer SIGTERM within seconds, and seed again after it", async ({
  fth,
}) => {
  test.setTimeout(180_000);
  const app = (await unbudgeted(() => fth.boot())) as RunningApp<BeadsCtx>;
  const first = app.ctx.served;
  if (first === undefined) throw new Error("no served server");
  first.child.kill("SIGSTOP");
  const started = Date.now();
  await unbudgeted(() => fth.seed("typical"));
  expect(first.child.signalCode).toBe("SIGKILL");
  expect(Date.now() - started).toBeLessThan(60_000);
  const second = app.ctx.served;
  expect(second?.child.pid).not.toBe(first.child.pid);
  expect(second?.child.exitCode).toBeNull();
  expect(second?.output()).toContain(`at ${app.url.href}`);
});

test("should land the page signed in through a labelled beads-ui-web login-link", async ({
  fth,
  page,
}) => {
  const app = (await unbudgeted(() => fth.boot())) as RunningApp<BeadsCtx>;
  const session = await unbudgeted(() => fth.signIn(page));
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await screens.get("board").ready(page);
  expect(session.label).toMatch(/^fth-[A-Za-z0-9._-]+$/);
  expect(await unbudgeted(() => sessionsOf(app))).toContain(`label ${session.label}`);
});

test("should refuse uploads on a live target and sign it out through revoke-session, sending no logout POST", async ({
  fth,
  page,
}) => {
  const local = (await unbudgeted(() => fth.boot())) as RunningApp<BeadsCtx>;
  const served = local.ctx.served;
  if (served === undefined) throw new Error("no served server");
  const target = {
    kind: "live" as const,
    origin: new URL(served.url).origin,
    basePath: "/",
    host: "local",
  };
  expect(beadsUiAdapter.dataPolicy(target)).toEqual({ synthetic: false, uploadAllowed: false });
  const live = await beadsUiAdapter.boot(target, {
    runDir: "",
    host: "local",
    env: { ...served.env } as Record<string, string>,
  });
  const session = await unbudgeted(() => beadsUiAdapter.signIn(live, page));
  const posts: string[] = [];
  page.context().on("request", (request) => {
    if (request.method() === "POST") posts.push(new URL(request.url()).pathname);
  });
  await unbudgeted(() => beadsUiAdapter.signOut(live, session));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to beads-ui" })).toBeVisible();
  expect(posts.filter((path) => path.endsWith("/api/auth/v1/logout"))).toEqual([]);
  expect(await unbudgeted(() => sessionsOf(local))).not.toContain(session.label);
});

test("should end only the run's own session when signOut runs with a second, unlabelled session open", async ({
  fth,
  page,
  browser,
}) => {
  const app = (await unbudgeted(() => fth.boot())) as RunningApp<BeadsCtx>;
  const served = app.ctx.served;
  if (served === undefined) throw new Error("no served server");
  const session = await unbudgeted(() => fth.signIn(page));
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(await unbudgeted(() => loginLink(served)));
  await expect(second.getByRole("button", { name: "Sign out" })).toBeVisible();
  await unbudgeted(() => beadsUiAdapter.signOut(app, session));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in to beads-ui" })).toBeVisible();
  await second.reload();
  await expect(second.getByRole("button", { name: "Sign out" })).toBeVisible();
  await other.close();
});

test("should list every store the served config reads, each created by this run, and a store made outside the factory as not", async ({
  configHome,
}) => {
  const { store, outside, served } = await unbudgeted(async () => {
    const store = await createStore("e2e");
    const outside = await mkdtemp(join(tmpdir(), "made-outside-"));
    await exec("bd", ["init", "--non-interactive", "--skip-hooks", "-p", "outside"], {
      cwd: outside,
    });
    const home = join(configHome, "inventory-home");
    await exec("mkdir", ["-p", join(home, ".beads", "shared-server")]);
    await writeFile(
      join(home, ".beads", "shared-server", "publish-sweep.json"),
      JSON.stringify({ stores: { outside: { repo: outside } } }),
    );
    return { store, outside, served: await serve(store.dir, configHome, { env: { HOME: home } }) };
  });
  try {
    const app = {
      url: new URL(served.url),
      ctx: { served, configHome, labels: 0, sessionLabels: [] },
    } as unknown as RunningApp<BeadsCtx>;
    const proof = await beadsUiAdapter.proveSynthetic(app);
    const byId = new Map(proof.sources.map((source) => [source.id, source.createdByRun]));
    const real = async (dir: string) =>
      (await exec("realpath", [dir], { encoding: "utf8" })).stdout.trim();
    expect(byId.get(await real(store.dir))).toBe(true);
    expect(byId.get(await real(outside))).toBe(false);
  } finally {
    await served.stop();
    await store.remove();
  }
});

test("should keep a seeded fake session cookie and sign-in token out of the server log it hands the harness", async ({
  fth,
}) => {
  const cookie = "beads_ui_session_4810=fthFakeCookieValue7d1e";
  const token = "fthFakeSignInToken92ab";
  const line = `GET /api/auth/v1/exchange?code=${token} cookie: ${cookie}`;
  const app = await unbudgeted(() =>
    beadsUiAdapter.boot(
      { kind: "worktree", cwd: "." },
      {
        runDir: "",
        host: "local",
        env: {
          NODE_OPTIONS: `--import=data:text/javascript,console.log(${encodeURIComponent(JSON.stringify(line))})`,
        },
      },
    ),
  );
  fth.registerApp(app);
  try {
    expect(app.ctx.served?.output()).toContain(token);
    const log = app.serverLog();
    expect(log).toContain("[redacted]");
    expect(log).not.toContain(token);
    expect(log).not.toContain("fthFakeCookieValue7d1e");
  } finally {
    await app.stop();
  }
});
