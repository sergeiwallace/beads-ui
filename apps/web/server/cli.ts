import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { ADMIN_USAGE, adminMain, isAdminCommand } from "./admin-cli.ts";
import { type ConfigEnv, DEFAULT_PORT, readWebConfig } from "./config.ts";
import { StartRefused, startServer } from "./server.ts";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = join(APP_DIR, "..", "..");
export const CLIENT_DIR = join(APP_DIR, "dist", "client");

/** What the client bundle is built from; a newer file than the bundle rebuilds it at start. */
const CLIENT_SOURCES = [
  join(APP_DIR, "client"),
  join(APP_DIR, "vite.config.ts"),
  join(REPO_DIR, "packages", "web-ui", "src"),
  join(REPO_DIR, "plugins", "beads-ui", "core", "src"),
];

const USAGE = `usage: beads-ui-web [--port <n>] [--open]
${ADMIN_USAGE}

Serves the beads-ui web app on http://127.0.0.1:<port>/ (default ${DEFAULT_PORT}, or
[web] port in beads-ui.toml) for every Beads store on this host whose repository
is on [hosts] allow_repos: the host's store inventory and the current directory's.
Every request needs a browser session: run beads-ui-web login-link on this host
and open the link it prints. The [auth] and [hosts] tables of your own
beads-ui.toml must be set (the web app design, Configuration).
  --port <n>  the port; 0 picks a free one
  --open      sign this host's browser in and open the Board`;

async function newestMtime(path: string): Promise<number> {
  const info = await stat(path).catch(() => undefined);
  if (info === undefined) return 0;
  if (!info.isDirectory()) return info.mtimeMs;
  let newest = info.mtimeMs;
  for (const entry of await readdir(path, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = await stat(join(entry.parentPath, entry.name)).catch(() => undefined);
    if (file !== undefined && file.mtimeMs > newest) newest = file.mtimeMs;
  }
  return newest;
}

/** Builds the client when it is missing or older than its sources, so one command serves it. */
async function ensureClient(): Promise<void> {
  const built = await newestMtime(join(CLIENT_DIR, "index.html"));
  const sources = Math.max(...(await Promise.all(CLIENT_SOURCES.map(newestMtime))));
  if (built !== 0 && built >= sources) return;
  process.stderr.write("beads-ui web: building the client...\n");
  const { build } = await import("vite");
  await build({ configFile: join(APP_DIR, "vite.config.ts"), logLevel: "warn" });
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [url], { detached: true, stdio: "ignore" });
  child.on("error", () => process.stderr.write(`beads-ui web: could not run ${command}\n`));
  child.unref();
}

function parsePort(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const port = Number(text);
  if (!/^\d+$/.test(text) || port > 65_535) {
    throw new StartRefused(`--port takes a whole number from 0 to 65535, not ${text}`);
  }
  return port;
}

export async function main(argv: readonly string[]): Promise<number> {
  const configEnv: ConfigEnv = {
    xdgConfigHome: process.env.XDG_CONFIG_HOME,
    xdgStateHome: process.env.XDG_STATE_HOME,
    home: process.env.HOME,
  };
  const command = argv[0];
  if (isAdminCommand(command)) return adminMain(command, argv.slice(1), configEnv, process.cwd());
  let values: { port?: string | undefined; open?: boolean | undefined; help?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        port: { type: "string" },
        open: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n${USAGE}\n`);
    return 2;
  }
  if (values.help === true) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const repoRoot = process.cwd();
  try {
    const config = await readWebConfig(repoRoot, configEnv);
    for (const problem of config.problems) process.stderr.write(`beads-ui.toml: ${problem}\n`);
    const port = parsePort(values.port) ?? config.port ?? DEFAULT_PORT;
    await ensureClient();
    const running = await startServer({ repoRoot, port, clientDir: CLIENT_DIR, configEnv });
    const stores = running.stores.length === 0 ? "no store open" : running.stores.join(", ");
    process.stdout.write(`beads-ui web: ${stores} at ${running.url}\n`);
    if (running.storeClosed !== undefined) {
      process.stderr.write(`beads-ui web: ${running.storeClosed}\n`);
    }
    for (const problem of running.dispatchProblems) {
      process.stderr.write(`beads-ui web: ${problem}\n`);
    }
    process.stderr.write("beads-ui web: sign in with beads-ui-web login-link\n");
    if (values.open === true) {
      openBrowser(new URL(running.auth.mintCode().path, running.url).href);
    }
    const stop = () => {
      running.close().finally(() => process.exit(0));
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return -1;
  } catch (error) {
    if (error instanceof StartRefused) {
      process.stderr.write(`beads-ui web: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
