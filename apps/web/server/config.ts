import { readFile } from "node:fs/promises";
import {
  type BeadsUiConfig,
  configCandidates,
  resolveAnalytics,
  resolveConfig,
  resolveQueue,
  resolveRank,
  resolveWeb,
  stateDirOf,
  userConfigPath,
  WEB_RANK_DEFAULT,
} from "@beads-ui/core";

/** The address the server binds unless `[web] host` names another, which needs `[auth]`. */
export const LOOPBACK = "127.0.0.1";
export const DEFAULT_PORT = 4810;

export interface WebConfig extends BeadsUiConfig {
  /** `[web] host`, when the file sets one; beyond loopback only with a valid `[auth]` table. */
  host?: string;
  /** `[web] port`, when the file sets one. */
  port?: number;
  /** `[web] base_path` as `/beads/`, when the file sets one; the app is mounted at `/` otherwise. */
  basePath?: string;
  /** `[views] rank`, on unless the file turns it off (D-21). */
  rank: boolean;
  /** `[queue] url`: the work queue the Sessions view and leased status writes go through. */
  queueUrl?: string;
  /** `[queue] repo`: this store's name in the queue; its directory name when unset. */
  queueRepo?: string;
  /** `[analytics] cost_export`: the Claude Code cost export, as written in the file. */
  costExport?: string;
  /** The file the settings came from, or undefined when no candidate exists. */
  source?: string;
  /** One line per setting the file got wrong; the default stands for each. */
  problems: string[];
}

export interface ConfigEnv {
  xdgConfigHome?: string | undefined;
  /** Where the server's credentials live (serverStateDir). */
  xdgStateHome?: string | undefined;
  home?: string | undefined;
}

/** The user's own `beads-ui.toml`, the only file the host's `[auth]` and `[hosts]` come from. */
export type UserConfigFile =
  | { kind: "file"; path: string; text: string }
  | { kind: "error"; path: string; message: string }
  | { kind: "none" };

/**
 * Reads the user's `beads-ui.toml` (userConfigPath), never the repository's: a repository's own
 * file must not widen what the host accepts or shows, as `[sync]` is read from it alone.
 */
export async function readUserConfig(env: ConfigEnv): Promise<UserConfigFile> {
  const path = userConfigPath(env);
  if (path === undefined) return { kind: "none" };
  try {
    return { kind: "file", path, text: await readFile(path, "utf8") };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { kind: "error", path, message: code === "ENOENT" ? "no such file" : String(code) };
  }
}

/** The web server's state directory: `web/` in the host's beads-ui state directory. */
export function serverStateDir(env: ConfigEnv): string | undefined {
  const dir = stateDirOf({ xdgStateHome: env.xdgStateHome, home: env.home });
  return dir === undefined ? undefined : `${dir}/web`;
}

async function firstFile(paths: readonly string[]): Promise<[string, string] | undefined> {
  for (const path of paths) {
    try {
      return [path, await readFile(path, "utf8")];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return undefined;
}

/**
 * The web app's settings, read again on every call: the repository's `beads-ui.toml`, else the
 * user's (configCandidates). A file that cannot be parsed gives the defaults and says so.
 * `[queue]` comes from the user's file alone, as `[hosts]` does: the work queue it names takes
 * this host's status writes and shows its sessions, which a repository's file must not redirect.
 */
export async function readWebConfig(repoRoot: string, env: ConfigEnv): Promise<WebConfig> {
  const found = await firstFile(configCandidates(repoRoot, env));
  const text = found?.[1];
  const base = resolveConfig(text, repoRoot);
  const rank = resolveRank(text, WEB_RANK_DEFAULT);
  const web = resolveWeb(text);
  const user = await readUserConfig(env);
  const queue = resolveQueue(user.kind === "file" ? user.text : undefined);
  const analytics = resolveAnalytics(text);
  const config: WebConfig = {
    ...base.config,
    rank: rank.rank,
    problems: [
      ...base.problems,
      ...rank.problems,
      ...web.problems,
      ...queue.problems,
      ...analytics.problems,
    ],
  };
  if (web.host !== undefined) config.host = web.host;
  if (web.port !== undefined) config.port = web.port;
  if (web.basePath !== undefined) config.basePath = web.basePath;
  if (queue.url !== undefined) config.queueUrl = queue.url;
  if (queue.repo !== undefined) config.queueRepo = queue.repo;
  if (analytics.costExport !== undefined) config.costExport = analytics.costExport;
  if (found !== undefined) config.source = found[0];
  return config;
}

/** Whether `host` is a loopback address: anything else needs the whole `[auth]` table. */
export const isLoopback = (host: string): boolean =>
  host === LOOPBACK || host === "localhost" || host === "::1";
