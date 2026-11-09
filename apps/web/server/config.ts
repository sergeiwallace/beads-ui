import { readFile } from "node:fs/promises";
import {
  type BeadsUiConfig,
  configCandidates,
  resolveAnalytics,
  resolveConfig,
  resolveQueue,
  resolveRank,
  resolveWeb,
  WEB_RANK_DEFAULT,
} from "@beads-ui/core";

/** The only address the server binds; the authentication layer is what may widen it. */
export const LOOPBACK = "127.0.0.1";
export const DEFAULT_PORT = 4810;

export interface WebConfig extends BeadsUiConfig {
  /** `[web] host`, when the file sets one; the server refuses any value but LOOPBACK. */
  host?: string;
  /** `[web] port`, when the file sets one. */
  port?: number;
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
  home?: string | undefined;
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
 */
export async function readWebConfig(repoRoot: string, env: ConfigEnv): Promise<WebConfig> {
  const found = await firstFile(configCandidates(repoRoot, env));
  const text = found?.[1];
  const base = resolveConfig(text, repoRoot);
  const rank = resolveRank(text, WEB_RANK_DEFAULT);
  const web = resolveWeb(text);
  const queue = resolveQueue(text);
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
  if (queue.url !== undefined) config.queueUrl = queue.url;
  if (queue.repo !== undefined) config.queueRepo = queue.repo;
  if (analytics.costExport !== undefined) config.costExport = analytics.costExport;
  if (found !== undefined) config.source = found[0];
  return config;
}

/** Why the server must not start on `host`, or undefined for the loopback address. */
export function hostRefusal(host: string | undefined): string | undefined {
  if (host === undefined || host === LOOPBACK) return undefined;
  return `beads-ui web binds ${LOOPBACK} only; refusing [web] host = ${JSON.stringify(host)}`;
}
