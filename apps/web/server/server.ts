import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DispatchStoreError } from "@beads-ui/core";
import { AllowlistHealth, readAllowlist } from "./allowlist.ts";
import { type App, createApp } from "./app.ts";
import { AuthLayer, AuthRefused, type AuthSettings, loadAuth } from "./auth.ts";
import { requestScope } from "./bd-queue.ts";
import { DEFAULT_BD_CALL_TIMEOUT_SECONDS } from "./bd-timeout.ts";
import { type ConfigEnv, isLoopback, LOOPBACK, readWebConfig } from "./config.ts";
import { releaseFollowUps } from "./dispatch.ts";
import { DispatchLadder } from "./dispatch-ladder.ts";
import {
  DispatchRefused,
  DispatchService,
  openStore,
  readStoreChoice,
  SWEEP_MS,
} from "./dispatch-service.ts";
import { HeadsFeed } from "./heads-feed.ts";
import { createStoreRegistry } from "./registry.ts";
import { type ApiContext, type Route, readStoreBoard, type StoreBoard } from "./routes.ts";

export interface StartOptions {
  /**
   * The directory the server starts in. Its store is one of the host's stores, beside every store
   * in the host's store inventory (`$HOME/.beads/shared-server/publish-sweep.json`), and its
   * `beads-ui.toml` is the settings file the server reads.
   */
  repoRoot: string;
  /** 0 picks a free port. */
  port: number;
  clientDir: string;
  /** Where the user's `beads-ui.toml`, the server's state directory and the store inventory are looked for. */
  configEnv: ConfigEnv;
  /** The environment bd runs with; the server's own when unset. */
  bdEnv?: NodeJS.ProcessEnv;
  /** The route table; ROUTES unless a later layer or a test adds routes. */
  routes?: readonly Route[];
  /** Milliseconds since the epoch, for sign-in codes and sessions; the system clock by default. */
  clock?: () => number;
  /** How often an open event stream re-checks its session. */
  heartbeatMs?: number;
  /** How often due dispatches expire and the published files are rewritten; SWEEP_MS by default. */
  sweepMs?: number;
  /** The change feed's poll interval; `refresh_seconds` from beads-ui.toml, read before each poll, by default. */
  feedIntervalMs?: number;
}

export interface RunningServer {
  url: string;
  port: number;
  server: Server;
  auth: AuthLayer;
  /** The stores open at start, each named as the allowlist entry that opened it. */
  stores: string[];
  /** Why no store is open at start, or undefined while at least one is. */
  storeClosed: string | undefined;
  /** The dispatch store, signer and publisher the receiver API serves. */
  dispatches: DispatchService;
  /** The dispatch ladder: carriers, local rungs, holds and their release. */
  ladder: DispatchLadder;
  /** What the dispatch service could not do at start, such as sign; the server runs on. */
  dispatchProblems: string[];
  /** What the dispatch service did at start, such as generate its signing key; one line each. */
  dispatchNotices: string[];
  /** The change feed: every store's Dolt head, polled, and an event when one moves. */
  feed: HeadsFeed<StoreBoard>;
  close(): Promise<void>;
}

export const CLOSE_MARGIN_MS = 5_000;

/**
 * How long a stop waits for requests in flight: past the bd call timeout, `[web]
 * bd_call_timeout_seconds` read as the stop begins, by CLOSE_MARGIN_MS; this is its value at the
 * default. Then their connections close, so a read still waiting in its store's bd queue is
 * dropped; a write runs.
 */
export const CLOSE_GRACE_MS = DEFAULT_BD_CALL_TIMEOUT_SECONDS * 1000 + CLOSE_MARGIN_MS;

/** A start the server refuses, with the reason it prints. */
export class StartRefused extends Error {}

const urlHost = (host: string) => (host.includes(":") ? `[${host}]` : host);

/**
 * Starts the web app behind its authentication layer. The whole `[auth]` table must validate, on
 * loopback too; `[web] host` may name an address beyond loopback only then. It opens every store
 * on the host whose repository is on the host's allowlist, whatever directory it started in;
 * with none open it starts and says why, and an allowlisted start directory where bd finds no
 * store refuses the start.
 */
export async function startServer(options: StartOptions): Promise<RunningServer> {
  const config = await readWebConfig(options.repoRoot, options.configEnv);
  const host = config.host ?? LOOPBACK;
  let settings: AuthSettings;
  try {
    settings = await loadAuth(options.configEnv);
  } catch (error) {
    if (!(error instanceof AuthRefused)) throw error;
    if (!isLoopback(host)) {
      throw new StartRefused(
        `[web] host = ${JSON.stringify(host)} binds beyond loopback, which needs the whole [auth] table: ${error.message}`,
      );
    }
    throw new StartRefused(error.message);
  }

  const health = new AllowlistHealth();
  const stores = createStoreRegistry({
    repoRoot: options.repoRoot,
    configEnv: options.configEnv,
    ...(options.bdEnv === undefined ? {} : { bdEnv: options.bdEnv }),
    health,
    queueWaitMs: async () =>
      (await readWebConfig(options.repoRoot, options.configEnv)).bdQueueWaitSeconds * 1000,
    callTimeoutMs: async () =>
      (await readWebConfig(options.repoRoot, options.configEnv)).bdCallTimeoutSeconds * 1000,
  });
  const reading = await stores.read();
  if (reading.startedIn !== undefined) {
    const where = await stores.client(reading.startedIn).where();
    if (where.kind !== "ok") {
      const reason = where.kind === "failed" ? where.message : `bd where: ${where.kind}`;
      throw new StartRefused(`cannot read the Beads store from ${options.repoRoot}: ${reason}`);
    }
    if (!where.value.hasStore) {
      throw new StartRefused(
        `no Beads store found from ${options.repoRoot}; run beads-ui-web in a repository with a .beads store (bd init creates one)`,
      );
    }
  }

  const clock = options.clock ?? Date.now;
  const allowlist = (name?: string) => readAllowlist(options.configEnv, name);
  let dispatches: DispatchService;
  try {
    dispatches = new DispatchService({
      env: options.configEnv,
      stateDir: settings.stateDir,
      store: await openStore(await readStoreChoice(options.configEnv), settings.stateDir),
      allowlist,
      stores,
      clock,
    });
  } catch (error) {
    if (!(error instanceof DispatchRefused || error instanceof DispatchStoreError)) throw error;
    throw new StartRefused(`the dispatch store cannot open: ${error.message}`);
  }
  const generated = await dispatches.ensureSigningKey();
  const dispatchNotices = generated === undefined ? [] : [generated];
  const dispatchProblems = await dispatches.publish();

  let app: App | undefined;
  const server = createServer((request, response) => {
    if (app === undefined) {
      response.writeHead(503).end();
      return;
    }
    const abandoned = new AbortController();
    response.once("close", () => {
      if (!response.writableFinished) abandoned.abort();
    });
    const handling = app;
    requestScope.run(abandoned.signal, () => handling.handle(request, response));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  const auth = await AuthLayer.open({
    settings,
    port,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(config.basePath === undefined ? {} : { basePath: config.basePath }),
  });
  const feed = new HeadsFeed<StoreBoard>({
    stores,
    read: readStoreBoard,
    keep: (board) => board.ok,
    intervalMs: async () =>
      options.feedIntervalMs ??
      (await readWebConfig(options.repoRoot, options.configEnv)).refreshSeconds * 1000,
    clock,
  });
  const ladder = new DispatchLadder({
    store: () => dispatches.store,
    stateDir: settings.stateDir,
    configEnv: options.configEnv,
    clock,
  });
  void ladder.resume();
  const context: ApiContext = {
    repoRoot: options.repoRoot,
    stores,
    config: () => readWebConfig(options.repoRoot, options.configEnv),
    allowlist,
    health,
    dispatches,
    ladder,
    feed,
    random: Math.random,
    now: () => new Date(clock()).toISOString(),
  };
  const started = createApp({
    clientDir: options.clientDir,
    auth,
    ...(options.routes === undefined ? {} : { routes: options.routes }),
    ...(options.heartbeatMs === undefined ? {} : { heartbeatMs: options.heartbeatMs }),
    ...(config.basePath === undefined ? {} : { basePath: config.basePath }),
    context,
  });
  app = started;
  feed.start();
  let sweeping: Promise<unknown> = Promise.resolve();
  const sweep = setInterval(() => {
    sweeping = sweeping
      .then(() => dispatches.sweep())
      .then(() => releaseFollowUps(context))
      .then(() => ladder.sweep())
      .catch(() => undefined);
  }, options.sweepMs ?? SWEEP_MS);
  sweep.unref();
  return {
    url: `http://${urlHost(host)}:${port}/`,
    port,
    server,
    auth,
    stores: reading.open.map((store) => store.repository),
    storeClosed: reading.closed,
    dispatches,
    ladder,
    dispatchProblems,
    dispatchNotices,
    feed,
    close: async () => {
      clearInterval(sweep);
      ladder.close();
      started.closeStreams();
      await feed.stop();
      const grace =
        (await readWebConfig(options.repoRoot, options.configEnv)).bdCallTimeoutSeconds * 1000 +
        CLOSE_MARGIN_MS;
      await new Promise<void>((resolve, reject) => {
        const deadline = setTimeout(() => server.closeAllConnections(), grace);
        server.close((error) => {
          clearTimeout(deadline);
          if (error) reject(error);
          else resolve();
        });
        server.closeIdleConnections();
      });
      await started.settled();
      await auth.close();
      await sweeping;
      await ladder.idle();
    },
  };
}
