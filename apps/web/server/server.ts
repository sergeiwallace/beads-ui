import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createBdClient } from "@sergeiwallace/beads-ui-bd-node";
import { createApp } from "./app.ts";
import { type ConfigEnv, hostRefusal, LOOPBACK, readWebConfig } from "./config.ts";

export interface StartOptions {
  /** The repository whose `.beads/` store the app serves; bd runs there. */
  repoRoot: string;
  /** 0 picks a free port. */
  port: number;
  clientDir: string;
  /** Where the user's `beads-ui.toml` is looked for. */
  configEnv: ConfigEnv;
  /** The environment bd runs with; the server's own when unset. */
  bdEnv?: NodeJS.ProcessEnv;
}

export interface RunningServer {
  url: string;
  port: number;
  server: Server;
  close(): Promise<void>;
}

/** A start the server refuses, with the reason it prints. */
export class StartRefused extends Error {}

/**
 * Starts the web app on 127.0.0.1 and nowhere else: a `[web] host` naming any other address
 * refuses the start, as does a directory where bd finds no store.
 */
export async function startServer(options: StartOptions): Promise<RunningServer> {
  const config = await readWebConfig(options.repoRoot, options.configEnv);
  const refusal = hostRefusal(config.host);
  if (refusal !== undefined) throw new StartRefused(refusal);

  const bd = createBdClient({
    cwd: options.repoRoot,
    ...(options.bdEnv === undefined ? {} : { env: options.bdEnv }),
  });
  const where = await bd.where();
  if (where.kind !== "ok") {
    const reason = where.kind === "failed" ? where.message : `bd where: ${where.kind}`;
    throw new StartRefused(`cannot read the Beads store from ${options.repoRoot}: ${reason}`);
  }
  if (!where.value.hasStore) {
    throw new StartRefused(
      `no Beads store found from ${options.repoRoot}; run beads-ui-web in a repository with a .beads store (bd init creates one)`,
    );
  }

  const server = createServer(
    createApp({
      clientDir: options.clientDir,
      context: {
        repoRoot: options.repoRoot,
        bd,
        config: () => readWebConfig(options.repoRoot, options.configEnv),
        random: Math.random,
        now: () => new Date().toISOString(),
      },
    }),
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, LOOPBACK, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://${LOOPBACK}:${port}/`,
    port,
    server,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
