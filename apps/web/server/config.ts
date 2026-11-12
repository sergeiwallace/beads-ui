import { readFile } from "node:fs/promises";
import {
  type BeadsUiConfig,
  configCandidates,
  parseToml,
  resolveAnalytics,
  resolveConfig,
  resolveQueue,
  resolveRank,
  resolveReview,
  resolveWeb,
  stateDirOf,
  userConfigPath,
  WEB_RANK_DEFAULT,
} from "@beads-ui/core";
import { DEFAULT_QUEUE_WAIT_SECONDS } from "./bd-queue.ts";

/** The address the server binds unless `[web] host` names another, which needs `[auth]`. */
export const LOOPBACK = "127.0.0.1";
export const DEFAULT_PORT = 4810;
export const DEFAULT_PROBE_TIMEOUT_SECONDS = 60;
export const DEFAULT_PROBE_INTERVAL_SECONDS = 1;

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
  /**
   * `[handoff] receivers`, from the user's file alone: the session-name patterns (`*` matches any
   * run of characters) an owner change may name. Unset, every session the registry holds may.
   */
  handoffReceivers?: string[];
  /** `[review] command`, from the user's file alone: the held store's tool, for held items' detail. */
  reviewCommand?: string[];
  /**
   * `[web] bd_queue_wait_seconds`: how long a bd call may wait for its store's earlier calls before
   * it answers a failure naming the wait (bd-queue.ts); DEFAULT_QUEUE_WAIT_SECONDS when unset.
   */
  bdQueueWaitSeconds: number;
  /**
   * `[web] service_probe_timeout_seconds`: how long `install-service --enable` waits for the
   * started service to answer its health probe; DEFAULT_PROBE_TIMEOUT_SECONDS when unset.
   */
  serviceProbeTimeoutSeconds: number;
  /** `[web] service_probe_interval_seconds`: the wait between probes; DEFAULT_PROBE_INTERVAL_SECONDS when unset. */
  serviceProbeIntervalSeconds: number;
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
    bdQueueWaitSeconds: DEFAULT_QUEUE_WAIT_SECONDS,
    serviceProbeTimeoutSeconds: DEFAULT_PROBE_TIMEOUT_SECONDS,
    serviceProbeIntervalSeconds: DEFAULT_PROBE_INTERVAL_SECONDS,
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
  const queueWait = resolveBdQueueWait(text);
  config.problems.push(...queueWait.problems);
  if (queueWait.seconds !== undefined) config.bdQueueWaitSeconds = queueWait.seconds;
  const probeTimeout = resolveWebSeconds(
    text,
    "service_probe_timeout_seconds",
    DEFAULT_PROBE_TIMEOUT_SECONDS,
  );
  config.problems.push(...probeTimeout.problems);
  if (probeTimeout.seconds !== undefined) config.serviceProbeTimeoutSeconds = probeTimeout.seconds;
  const probeInterval = resolveWebSeconds(
    text,
    "service_probe_interval_seconds",
    DEFAULT_PROBE_INTERVAL_SECONDS,
  );
  config.problems.push(...probeInterval.problems);
  if (probeInterval.seconds !== undefined) {
    config.serviceProbeIntervalSeconds = probeInterval.seconds;
  }
  // The owner picker's rule and the held tool come from the user's file, as `[queue]` does: a
  // repository's own file must not widen who may receive its tasks or name a command to run.
  const userText = user.kind === "file" ? user.text : undefined;
  const handoff = resolveHandoff(userText);
  config.problems.push(...handoff.problems);
  if (handoff.receivers !== undefined) config.handoffReceivers = handoff.receivers;
  const review = resolveReview(userText);
  config.problems.push(...review.problems);
  if (review.command !== undefined) config.reviewCommand = review.command;
  if (found !== undefined) config.source = found[0];
  return config;
}

/** `[web] bd_queue_wait_seconds`: a positive number of seconds, or nothing when unset. */
export function resolveBdQueueWait(text: string | undefined): {
  seconds?: number;
  problems: string[];
} {
  return resolveWebSeconds(text, "bd_queue_wait_seconds", DEFAULT_QUEUE_WAIT_SECONDS);
}

/**
 * The longest delay a Node timer holds: setTimeout and AbortSignal.timeout take a 32-bit
 * millisecond count, and a longer one fires after about 1 ms instead of waiting.
 */
export const MAX_TIMER_SECONDS = 2_147_483.647;

/** A `[web]` key that holds a positive number of seconds, at most MAX_TIMER_SECONDS, or nothing when unset. */
function resolveWebSeconds(
  text: string | undefined,
  key: string,
  fallback: number,
): { seconds?: number; problems: string[] } {
  const problems: string[] = [];
  if (text === undefined) return { problems };
  const parsed = parseToml(text);
  if (!parsed.ok) return { problems };
  const table = parsed.value.web;
  if (typeof table !== "object" || table === null || Array.isArray(table)) return { problems };
  const value = (table as Record<string, unknown>)[key];
  if (value === undefined) return { problems };
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    problems.push(
      `web.${key} must be a positive number of seconds, not ${JSON.stringify(value)}; using ${fallback}`,
    );
    return { problems };
  }
  if (value > MAX_TIMER_SECONDS) {
    problems.push(
      `web.${key} must be at most ${MAX_TIMER_SECONDS} seconds (the Node timer limit), not ${value}; using ${fallback}`,
    );
    return { problems };
  }
  return { seconds: value, problems };
}

/** The `beads-ui.toml` table of the owner picker's handoff rule (web app design T-W1.0). */
export const HANDOFF_TABLE = "handoff";

/** `[handoff] receivers`: a list of session-name patterns, or nothing when unset. */
export function resolveHandoff(text: string | undefined): {
  receivers?: string[];
  problems: string[];
} {
  const problems: string[] = [];
  if (text === undefined) return { problems };
  const parsed = parseToml(text);
  if (!parsed.ok) return { problems };
  const table = parsed.value[HANDOFF_TABLE];
  if (table === undefined) return { problems };
  const receivers =
    typeof table === "object" && table !== null && !Array.isArray(table)
      ? (table as Record<string, unknown>).receivers
      : undefined;
  if (receivers === undefined) return { problems };
  if (
    !Array.isArray(receivers) ||
    receivers.length === 0 ||
    !receivers.every((one) => typeof one === "string" && one.trim() !== "")
  ) {
    problems.push(
      `${HANDOFF_TABLE}.receivers must be a list of session-name patterns such as ["team-*"]; the owner picker offers no session`,
    );
    return { receivers: [], problems };
  }
  return { receivers: [...receivers] as string[], problems };
}

/** Whether `host` is a loopback address: anything else needs the whole `[auth]` table. */
export const isLoopback = (host: string): boolean =>
  host === LOOPBACK || host === "localhost" || host === "::1";
