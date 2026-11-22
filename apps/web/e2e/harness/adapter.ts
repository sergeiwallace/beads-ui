import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import {
  type AppAdapter,
  type AppSurface,
  currentTest,
  type DataShape,
  defaultRedact,
  journeyRegistry,
  type RunningApp,
  type SeedHandle,
  type Session,
  type Target,
  templateOnce,
  UnsupportedShape,
} from "@sergeiwallace/frontend-test-harness";
import { hostConfig } from "../../test/auth-env.ts";
import { exec, storeEnv } from "../../test/exec.ts";
import { CREATED_STORES } from "../../test/run-stores.ts";
import { createStore } from "../../test/store.ts";
import { DECLARED_STATES, INTERACTIONS, inventory } from "./journey-inventory.ts";
import { journeys } from "./journeys.ts";
import { screens } from "./screens/index.ts";

export const BIN = fileURLToPath(new URL("../../bin/beads-ui-web.mjs", import.meta.url));
const E2E = fileURLToPath(new URL("../", import.meta.url));
const FAKE_HELD = fileURLToPath(new URL("../../test/fixtures/fake-held.mjs", import.meta.url));

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
  /** How many characters of output the command has printed, the ones `output()` dropped included. */
  logged(): number;
  stop(): Promise<void>;
}

/** What a spec may change about the served host: its allowlist and the command's environment. */
export interface ServeOptions {
  /** `[hosts] allow_repos`; the served store's repository alone unless given. */
  allowRepos?: string[];
  /** Added to the command's environment, such as a HOME holding a store inventory. */
  env?: NodeJS.ProcessEnv;
  /** More of the user's `beads-ui.toml`, after `[hosts]` and `[auth]`. */
  extra?: string;
  /** `[auth]` keys to set in place of the defaults. */
  auth?: Record<string, string | string[] | undefined>;
  /** The port to listen on; any free port (`--port 0`) unless given. */
  port?: number;
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
      ...(options.auth === undefined ? {} : { auth: options.auth }),
    }),
  );
  await mkdir(join(configHome, "home"), { recursive: true });
  return {
    ...storeEnv(),
    HOME: join(configHome, "home"),
    XDG_CONFIG_HOME: configHome,
    XDG_STATE_HOME: join(configHome, "state"),
    ...options.env,
  };
}

/** The server's captured output keeps its last 256 KiB. */
const LOG_CAP = 256 * 1024;
/**
 * How long a stopped server gets to close before it and its bd processes are killed: its own
 * close cuts connections after 15 s and each bd call ends within 10 s, so a close still running
 * at 30 s is stuck, not slow.
 */
const STOP_GRACE_MS = 30_000;
/** How long a starting server gets to print its URL before the start fails. */
const START_DEADLINE_MS = 60_000;

/**
 * Runs the documented command, `beads-ui-web --port 0`, in `dir`, and resolves on the URL line
 * it prints. The user's config, state and store inventory are kept out with a private
 * XDG_CONFIG_HOME, XDG_STATE_HOME and HOME. Under the harness the served app is registered with
 * the running test, so its stores are proved synthetic before any capture; the adapter, which
 * registers its own app, passes `register` false.
 */
export async function serve(
  dir: string,
  configHome: string,
  options: ServeOptions = {},
  register = true,
): Promise<Served> {
  const env = await hostSettings(dir, configHome, options);
  const started = Date.now();
  const child = spawn(process.execPath, [BIN, "--port", String(options.port ?? 0)], {
    cwd: dir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  let logged = 0;
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  const stop = () =>
    new Promise<void>((resolve) => {
      if (exited()) {
        resolve();
        return;
      }
      const kill = setTimeout(() => {
        process.stderr.write(
          `beads-ui-web (${dir}) did not exit within ${STOP_GRACE_MS} ms of SIGTERM; killing it. Its output ends:\n${output.slice(-4096)}\n`,
        );
        try {
          if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, STOP_GRACE_MS);
      child.once("exit", () => {
        clearTimeout(kill);
        resolve();
      });
      child.kill("SIGTERM");
    });
  const url = await new Promise<string>((resolve, reject) => {
    const late = setTimeout(() => {
      reject(new Error(`beads-ui-web printed no URL within ${START_DEADLINE_MS} ms: ${output}`));
      void stop();
    }, START_DEADLINE_MS);
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      logged += text.length;
      output = (output + text).slice(-LOG_CAP);
      const match = /at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(output);
      if (match?.[1] !== undefined) {
        clearTimeout(late);
        resolve(match[1]);
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code, signal) => {
      clearTimeout(late);
      reject(new Error(`beads-ui-web exited ${code ?? signal}: ${output}`));
    });
  });
  const served: Served = {
    url,
    port: Number(new URL(url).port),
    startedInMs: Date.now() - started,
    child,
    env,
    cwd: dir,
    output: () => output,
    logged: () => logged,
    stop,
  };
  if (register) currentTest()?.registerApp(servedApp({ served, configHome }));
  return served;
}

/**
 * The sign-in link the documented host command prints, `beads-ui-web login-link`, for the
 * origin the browser opens the server on; with a label, the session it opens carries it.
 */
export async function loginLink(served: Served, label?: string): Promise<string> {
  const { stdout } = await exec(
    process.execPath,
    [
      BIN,
      "login-link",
      "--port",
      String(served.port),
      "--origin",
      new URL(served.url).origin,
      ...(label === undefined ? [] : ["--label", label]),
    ],
    { cwd: served.cwd, env: served.env, encoding: "utf8", timeout: 30_000 },
  );
  return stdout.trim();
}

/** The adapter's handles on one app: a served worktree server, or a live deployment. */
export interface BeadsCtx {
  served?: Served;
  configHome?: string;
  /** Spec-supplied serve options, kept so a reseed restarts the server the same way. */
  options?: ServeOptions;
  queue?: Server;
  live?: { origin: string; env: NodeJS.ProcessEnv; port?: number };
  labels: number;
  sessionLabels: string[];
}

const redact = (text: string) => defaultRedact(text);

const outputSince = (served: Served | undefined, from: number) => {
  if (served === undefined) return "";
  const grown = served.logged() - from;
  return grown <= 0 ? "" : served.output().slice(-grown);
};

/** A served server as the harness's app; its log starts at `from`, a count `logged()` gave. */
export function servedApp(
  ctx: Omit<BeadsCtx, "labels" | "sessionLabels"> & { served: Served },
  from = 0,
): RunningApp<BeadsCtx> {
  const full: BeadsCtx = { ...ctx, labels: 0, sessionLabels: [] };
  return {
    url: new URL(ctx.served.url),
    ctx: full,
    serverLog: () => redact(outputSince(full.served, from)).slice(-LOG_CAP),
    stop: async () => {
      await full.served?.stop();
      const queue = full.queue;
      if (queue !== undefined) {
        queue.closeAllConnections();
        await new Promise<void>((done) => queue.close(() => done()));
      }
    },
  };
}

const runId = () => process.env.FTH_RUN_ID ?? "local";
const marker = () => `fth-${createHash("sha256").update(runId()).digest("hex").slice(0, 4)}`;

/** The stand-in work queue the Review view reads its skill catalog and session registry from. */
async function startQueue(): Promise<{ url: string; server: Server }> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://queue").pathname;
    const body =
      path === "/api/queue/skills"
        ? [{ name: "implement", source: "installed" }]
        : path === "/api/queue/sessions"
          ? [{ id: "worker@host-b", machine: "host-b", name: "worker", state: "active" }]
          : undefined;
    response.writeHead(body === undefined ? 404 : 200, { "content-type": "application/json" });
    response.end(JSON.stringify(body ?? { detail: "not found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server };
}

/** The path the Review list's held item is read at. */
const REVIEW_ITEM = "/stores/held/docs/held/host-c/holder/2026/11/09/record.md";

/** Where the held item screen's item lives: inside the served store, as detail.spec.ts holds it. */
export const heldItemPath = (store: string) => join(store, "docs", "held", "detail.md");

/**
 * Two held decisions, written as the stand-in held tool reads them (test/fixtures/fake-held.mjs):
 * one the Review list shows, named by its repository as review.spec.ts names it, and one inside
 * the served store, named by the store's path, which the held item detail reads.
 */
async function heldFixture(dir: string, repo: string, store: string, title: string): Promise<void> {
  await mkdir(join(dir, "bodies"), { recursive: true });
  const base = {
    kind: "decision",
    status: "open",
    selection: "current",
    session: "holder@host-c",
    machine: "host-c",
    task: "none",
    title,
    ask: `Answer ${title}`,
    created_at: "2026-11-09T10:00:00Z",
  };
  const item = {
    ...base,
    path: REVIEW_ITEM,
    relpath: "docs/held/host-c/holder/2026/11/09/record.md",
    store: repo,
  };
  const detail = { ...base, path: heldItemPath(store), relpath: "docs/held/detail.md", store };
  await writeFile(
    join(dir, "review.json"),
    JSON.stringify({
      schema: 1,
      fingerprint: "f1",
      host: "host-c",
      pair: ["host-c"],
      scope: "pair",
      read_at: "2026-11-09T12:00:00Z",
      stores: { [repo]: { path: "/stores/held/docs/held", status: "ok", error: null } },
      items: [item, detail],
    }),
  );
  const options = (path: string) => ({
    item: path,
    kind: "decision",
    error: null,
    decisions: [
      {
        id: "D-1",
        title,
        options: [
          { key: "a", label: "The first option" },
          { key: "b", label: "The second option" },
        ],
        recommended: "a",
        anchor: "decision-d-1",
      },
    ],
  });
  await writeFile(
    join(dir, "options.json"),
    JSON.stringify({ version: 1, items: [options(REVIEW_ITEM), options(detail.path)] }),
  );
  const body = `# ${title}\n\nThe options follow.\n`;
  await writeFile(join(dir, "bodies", "record.md"), body);
  await writeFile(join(dir, "bodies", "detail.md"), body);
}

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

/** The rows of a data shape's `bd import` file; every title carries the run's marker. */
function shapeRows(shape: DataShape, mark: string): Record<string, unknown>[] {
  const row = (title: string, extra: Record<string, unknown> = {}) => ({
    title: `${title} ${mark}`,
    issue_type: "task",
    priority: 2,
    status: "open",
    ...extra,
  });
  if (shape === "empty") return [];
  if (shape === "one") return [row("The one issue")];
  if (shape !== "typical") {
    throw new UnsupportedShape(
      shape,
      "the beads-ui adapter seeds empty, one and typical in Phase 1",
    );
  }
  return [
    row("Write the release notes", { priority: 1 }),
    row("Fix the board's column width", { issue_type: "bug", priority: 0 }),
    row("Tidy the settings page", { priority: 3 }),
    row("Add an export button", { issue_type: "feature", labels: ["sprint:s1"] }),
    row("Review the sign-in copy", { status: "in_progress", assignee: "worker" }),
    row("Measure the tab switch", { status: "in_progress", assignee: "worker", priority: 1 }),
    row("Wait on the design review", { status: "blocked" }),
    row("Ship the favicon", { status: "closed", closed_at: day(-2), labels: ["sprint:s1"] }),
    row("Remove the old logo", { status: "closed", closed_at: day(-5) }),
    row("Platform milestone", { issue_type: "epic", priority: 1, due_at: day(10) }),
    row("Launch milestone", { issue_type: "epic", priority: 2, due_at: day(20) }),
    row("Document the API", { priority: 4 }),
  ];
}

/** The store directories a served server reads: the one it started in and its HOME inventory. */
async function storesOf(served: Served): Promise<string[]> {
  const stores = [served.cwd];
  const home = served.env.HOME;
  if (home !== undefined) {
    try {
      const inventoryFile = join(home, ".beads", "shared-server", "publish-sweep.json");
      const parsed = JSON.parse(await readFile(inventoryFile, "utf8")) as {
        stores?: Record<string, { repo?: string }>;
        skipped?: { repo?: string }[];
      };
      for (const entry of Object.values(parsed.stores ?? {}))
        if (entry.repo) stores.push(entry.repo);
      for (const entry of parsed.skipped ?? []) if (entry.repo) stores.push(entry.repo);
    } catch {}
  }
  return stores;
}

/** Every test title in the suite's own spec files, read from the files. */
async function specTitles(): Promise<string[]> {
  const titles: string[] = [];
  for (const file of (await readdir(E2E)).sort()) {
    if (!file.endsWith(".spec.ts") || file.startsWith("harness-") || file === "sweep.spec.ts")
      continue;
    const text = await readFile(join(E2E, file), "utf8");
    for (const match of text.matchAll(/\b(?:test|[a-z][A-Za-z]*Test)\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      titles.push(JSON.parse(`"${match[1]}"`) as string);
    }
  }
  return titles;
}

const labelFor = (app: RunningApp<BeadsCtx>) => {
  app.ctx.labels += 1;
  return `fth-${runId().slice(-4)}-${process.pid}-${app.ctx.labels}`.replace(
    /[^A-Za-z0-9._-]/g,
    "-",
  );
};

/** Runs `beads-ui-web <args>` as the host's own command, for the served or live server. */
export async function hostCommand(app: RunningApp<BeadsCtx>, args: string[]): Promise<string> {
  const { served, live } = app.ctx;
  if (served !== undefined) {
    const { stdout } = await exec(process.execPath, [BIN, ...args, "--port", String(served.port)], {
      cwd: served.cwd,
      env: served.env,
      encoding: "utf8",
      timeout: 30_000,
    });
    return stdout;
  }
  if (live === undefined) throw new Error("the app has neither a served server nor a live target");
  const { stdout } = await exec(
    process.execPath,
    [BIN, ...args, ...(live.port === undefined ? [] : ["--port", String(live.port)])],
    { env: live.env, encoding: "utf8", timeout: 30_000 },
  );
  return stdout;
}

async function restart(
  app: RunningApp<BeadsCtx>,
  dir: string,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  const { served, configHome } = app.ctx;
  if (served === undefined || configHome === undefined)
    throw new Error("only a served app restarts");
  await served.stop();
  const options = {
    ...app.ctx.options,
    env: { ...app.ctx.options?.env, ...env },
    port: served.port,
  };
  app.ctx.served = await serve(dir, configHome, options, false);
}

/**
 * Restarts a served app's server in place, on its port and state home, with `env` added: a
 * wrapped bd first on PATH for a backend fault, or nothing to end one. Sessions survive it.
 */
export async function restartWith(
  app: RunningApp<BeadsCtx>,
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  const dir = app.ctx.served?.cwd;
  if (dir === undefined) throw new Error("only a served app restarts");
  await restart(app, dir, env);
}

/** Stops a served app's server, and returns the function that starts it again on its port. */
export async function stopServer(app: RunningApp<BeadsCtx>): Promise<() => Promise<void>> {
  const { served } = app.ctx;
  if (served === undefined) throw new Error("only a served app stops");
  await served.stop();
  return () => restart(app, served.cwd);
}

/** The labels of every session this app signed in, newest last. */
export const sessionLabels = (app: RunningApp<BeadsCtx>): string[] => app.ctx.sessionLabels;

/**
 * The beads-ui adapter: boots `beads-ui-web --port 0` in a fresh store with private config, state
 * and HOME (as e2e/fixtures.ts always has), seeds a shape from a once-per-run template store, signs
 * in through a labelled `login-link`, and signs out with `revoke-session --label`.
 */
export const beadsUiAdapter: AppAdapter<BeadsCtx> = {
  name: "beads-ui",
  async boot(target: Target, bootEnv) {
    if (target.kind === "live") {
      const origin = new URL(target.origin);
      const loopback =
        origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname);
      const ctx: BeadsCtx = {
        live: {
          origin: target.origin,
          env: { ...process.env, ...bootEnv.env },
          ...(loopback && origin.port !== "" ? { port: Number(origin.port) } : {}),
        },
        labels: 0,
        sessionLabels: [],
      };
      return {
        url: new URL(target.basePath.replace(/^\/?/, ""), `${target.origin.replace(/\/+$/, "")}/`),
        ctx,
        serverLog: () => "",
        stop: async () => undefined,
      };
    }
    const store = await createStore("fth");
    const configHome = await mkdtemp(join(tmpdir(), "beads-ui-e2e-config-"));
    const repo = basename(store.dir);
    const held = join(configHome, "held");
    await heldFixture(held, repo, store.dir, `How an answer is recorded ${marker()}`);
    const queue = await startQueue();
    const options: ServeOptions = {
      auth: { signing_key: "state:dispatch-signing-key" },
      extra: [
        `[hosts.host-c]\nallow_repos = ["${repo}"]`,
        `[review]\ncommand = ${JSON.stringify([process.execPath, FAKE_HELD, held])}`,
        `[queue]\nurl = "${queue.url}"`,
        `[dispatch]\nhost = "host-c"\nrecord = "local"`,
      ].join("\n\n"),
      env: bootEnv.env,
    };
    const served = await serve(store.dir, configHome, options, false);
    const app = servedApp({ served, configHome, options, queue: queue.server });
    return app;
  },
  async seed(app, shape): Promise<SeedHandle> {
    const mark = marker();
    const rows = shapeRows(shape, mark);
    const template = await templateOnce(
      process.env.FTH_RUN_DIR ?? tmpdir(),
      `beads-ui-${shape}`,
      async (dir) => {
        const scratch = await mkdtemp(join(tmpdir(), "beads-ui-web-store-"));
        const run = (...args: string[]) =>
          exec("bd", args, { cwd: scratch, encoding: "utf8", timeout: 300_000 });
        await run("init", "--non-interactive", "--skip-hooks", "-p", "fth");
        if (rows.length > 0) {
          await writeFile(
            join(scratch, "seed.jsonl"),
            rows.map((row) => JSON.stringify(row)).join("\n"),
          );
          await run("import", "seed.jsonl");
        }
        const listed = JSON.parse(
          (await run("list", "--all", "--limit", "0", "--json")).stdout || "[]",
        ) as {
          id: string;
          title: string;
        }[];
        await writeFile(
          join(scratch, "records.json"),
          JSON.stringify(listed.map((r) => ({ id: r.id, visible: [r.id, r.title] }))),
        );
        await cp(scratch, dir, { recursive: true });
        await rm(scratch, { recursive: true, force: true });
      },
    );
    const served = app.ctx.served;
    if (served === undefined) throw new Error("only a served app is seeded");
    const store = served.cwd;
    await served.stop();
    await rm(join(store, ".beads"), { recursive: true, force: true });
    await cp(template.dir, store, { recursive: true });
    await restart(app, store);
    const records = JSON.parse(
      await readFile(join(store, "records.json"), "utf8"),
    ) as SeedHandle["records"];
    return { marker: mark, records };
  },
  async signInUrl(app) {
    const label = labelFor(app);
    app.ctx.sessionLabels.push(label);
    const origin =
      app.ctx.served === undefined
        ? (app.ctx.live?.origin ?? "")
        : new URL(app.ctx.served.url).origin;
    const url = (
      await hostCommand(app, ["login-link", "--label", label, "--origin", origin])
    ).trim();
    return { url, session: { label, createdAt: new Date().toISOString() } };
  },
  async signIn(app, page: Page): Promise<Session> {
    const { url, session } = await beadsUiAdapter.signInUrl(app);
    await page.goto(url);
    await page.getByRole("button", { name: "Sign out" }).waitFor();
    return session;
  },
  async signOut(app, session) {
    await hostCommand(app, ["revoke-session", "--label", session.label]);
  },
  dataPolicy: (target) => ({ synthetic: target.kind === "worktree", uploadAllowed: false }),
  async proveSynthetic(app) {
    if (app.ctx.served === undefined) {
      return { sources: [{ id: app.ctx.live?.origin ?? "live", createdByRun: false }] };
    }
    const run = process.env.FTH_RUN_DIR;
    const created = new Set(
      run === undefined
        ? []
        : (await readFile(join(run, CREATED_STORES), "utf8").catch(() => ""))
            .split("\n")
            .filter((line) => line !== ""),
    );
    const sources = [];
    for (const dir of await storesOf(app.ctx.served)) {
      const real = await realpath(dir).catch(() => dir);
      sources.push({ id: real, createdByRun: created.has(real) });
    }
    return { sources };
  },
  redact,
  screens,
  journeys: journeyRegistry(journeys, inventory),
  async surfaces(): Promise<AppSurface[]> {
    const { ROUTES } = await import("../../server/routes.ts");
    const surfaces: AppSurface[] = [];
    for (const screen of screens.all()) {
      surfaces.push({
        id: `screen:${screen.id}`,
        kinds: ["route"],
        evidence: [`screens/${screen.id}`],
      });
      for (const state of Object.keys(screen.states ?? {})) {
        const kind = state.split(":")[0] ?? state;
        surfaces.push({
          id: `state:${screen.id}:${state}`,
          kinds: [kind],
          evidence: [`screens/${screen.id} states`],
        });
      }
    }
    const mutations = ROUTES.filter(
      (route) => route.method === "POST" && !/^\/api\/(receiver|mcp|admin)\//.test(route.path),
    );
    for (const route of mutations) {
      surfaces.push({
        id: `mutation:POST ${route.path}`,
        kinds: ["mutation"],
        evidence: ["server/routes.ts ROUTES"],
      });
    }
    surfaces.push({
      id: "mutation:POST /api/auth/v1/logout",
      kinds: ["mutation"],
      evidence: ["server/auth.ts"],
    });
    for (const state of DECLARED_STATES) {
      surfaces.push({ id: state.id, kinds: [state.kind], evidence: [`screens/${state.screen}`] });
    }
    for (const interaction of INTERACTIONS) {
      surfaces.push({
        id: interaction.id,
        kinds: [interaction.kind],
        evidence: [interaction.evidence],
      });
    }
    for (const fault of [
      "feed-drop",
      "server-restart",
      "session-expiry",
      "slow-backend",
      "failing-backend",
      "serialised-backend",
      "offline",
    ]) {
      surfaces.push({ id: `fault:${fault}`, kinds: ["fault"], evidence: ["harness/faults.ts"] });
    }
    for (const stress of ["double-submit", "two-tabs", "rapid-navigation", "large-data"]) {
      surfaces.push({ id: `stress:${stress}`, kinds: ["stress"], evidence: ["Faults and stress"] });
    }
    for (const title of await specTitles()) {
      surfaces.push({ id: `spec:${title}`, kinds: ["existing-spec"], evidence: [title] });
    }
    return surfaces;
  },
};
