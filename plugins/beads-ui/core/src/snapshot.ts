import type { Result } from "./model.ts";

// The host refresher's files and timings (D-26, T-1B.4), shared by the refresher process
// (plugins/beads-ui/refresher/refresher.mjs, which Node loads with its type stripping, so this file
// keeps to erasable syntax) and by each session's band. Every function takes the time it needs.

/** The refresher counts once a minute (T-1B.4: no sooner than every 50 s, no later than 90). */
export const BEAT_MS = 60_000;
/** A snapshot older than this is stale (T-1B.4): its refresher is taken to have stopped. */
export const STALE_MS = 180_000;
/** A lease in `$.store` this old is expired, so another session may take it. */
export const LEASE_TTL_MS = 120_000;
/** How long a session waits after a start for its snapshot before it reads its own counts. */
export const START_GRACE_MS = 90_000;
/** A session's registry file older than this names a session that has closed. */
export const SESSION_LIVE_MS = 180_000;
/** The refresher stops when no session has registered for this long. */
export const IDLE_EXIT_MS = 300_000;
/** The refresher renews its file lease this often, apart from its minute of reads. */
export const RENEW_MS = 20_000;

/** The `$.store` key of the lease a session takes before it starts the refresher. */
export const LEASE_KEY = "refresher-lease";
export const SNAPSHOT_FILE = "counts.json";
export const LEASE_FILE = "lease.json";
export const SESSIONS_DIR = "sessions";
export const SNAPSHOT_SCHEMA = 1;

/** The statuses the band counts by owner, besides the issues closed within the done window. */
export const COUNTED_STATUSES = ["in_progress", "blocked", "open"] as const;
export type CountedStatus = (typeof COUNTED_STATUSES)[number];
export const DEFAULT_DONE_WINDOW = "24h";
/** The group `bd count --by-assignee` gives the issues that have no assignee. */
export const UNASSIGNED = "(unassigned)";

const trimSlash = (path: string) => path.replace(/\/+$/, "") || "/";

/**
 * The host's state directory for beads-ui: `$XDG_STATE_HOME/beads-ui`, else
 * `$HOME/.local/state/beads-ui`; undefined with neither.
 */
export function stateDirOf(env: {
  xdgStateHome?: string | undefined;
  home?: string | undefined;
}): string | undefined {
  if (env.xdgStateHome?.startsWith("/")) {
    return `${trimSlash(env.xdgStateHome)}/beads-ui`;
  }
  if (env.home?.startsWith("/")) {
    return `${trimSlash(env.home)}/.local/state/beads-ui`;
  }
  return undefined;
}

const UNITS: Readonly<Record<string, number>> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** A done window such as `24h`, `90m`, `7d` or `2w` in milliseconds; undefined when malformed. */
export function windowMs(span: string): number | undefined {
  const match = /^([1-9][0-9]{0,4})([mhdw])$/.exec(span.trim());
  if (match === null) return undefined;
  return Number(match[1]) * (UNITS[match[2] ?? ""] ?? 0);
}

/** One `bd count` a store's read runs, and the key its answer is filed under. */
export interface StoreRead {
  key: string;
  argv: string[];
}

/**
 * The reads that count a store for every owner at once: one `bd count --by-assignee` per counted
 * status, and one per done window over the issues closed since `nowMs` less the window. Their
 * number does not grow with the number of sessions.
 */
export function storeReads(windows: readonly string[], nowMs: number): StoreRead[] {
  const reads: StoreRead[] = COUNTED_STATUSES.map((status) => ({
    key: `status:${status}`,
    argv: ["bd", "count", "--by-assignee", `--status=${status}`, "--json"],
  }));
  for (const span of [...new Set(windows)]) {
    const ms = windowMs(span);
    if (ms === undefined) continue;
    reads.push({
      key: `done:${span}`,
      argv: [
        "bd",
        "count",
        "--by-assignee",
        "--status=closed",
        `--closed-after=${new Date(nowMs - ms).toISOString()}`,
        "--json",
      ],
    });
  }
  return reads;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `bd count --by-assignee --json`: each owner's count, `(unassigned)` for none. */
export function parseGroupedCount(text: string): Result<Record<string, number>, string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "bd count did not answer JSON" };
  }
  if (!isRecord(json)) return { ok: false, error: "bd count answered no object" };
  const counts: Record<string, number> = {};
  // bd leaves `groups` out when nothing matched.
  const groups = json.groups ?? [];
  if (!Array.isArray(groups)) return { ok: false, error: "bd count's groups is not a list" };
  for (const group of groups) {
    if (
      !isRecord(group) ||
      typeof group.group !== "string" ||
      typeof group.count !== "number" ||
      !Number.isInteger(group.count) ||
      group.count < 0
    ) {
      return { ok: false, error: "bd count gave a group without a name and a count" };
    }
    counts[group.group] = group.count;
  }
  return { ok: true, value: counts };
}

/** One store's counts by owner, or why they could not be read. */
export type StoreSnapshot =
  | {
      path: string;
      name: string;
      ok: true;
      readAt: number;
      /** By counted status, each owner's count. */
      statuses: Record<string, Record<string, number>>;
      /** By done window, each owner's count of issues closed within it. */
      done: Record<string, Record<string, number>>;
    }
  | { path: string; name: string; ok: false; readAt: number; error: string };

/** What one store read answered: a count's text, or why it failed. */
export type ReadAnswer =
  | { key: string; ok: true; stdout: string }
  | { key: string; ok: false; error: string };

/** A store's snapshot from its reads' answers: the first failure fails the store. */
export function storeSnapshotOf(
  store: { path: string; name: string },
  answers: readonly ReadAnswer[],
  readAt: number,
): StoreSnapshot {
  const statuses: Record<string, Record<string, number>> = {};
  const done: Record<string, Record<string, number>> = {};
  for (const answer of answers) {
    if (!answer.ok) return { ...store, ok: false, readAt, error: answer.error };
    const counts = parseGroupedCount(answer.stdout);
    if (!counts.ok) return { ...store, ok: false, readAt, error: counts.error };
    const cut = answer.key.indexOf(":");
    const name = answer.key.slice(cut + 1);
    if (answer.key.startsWith("status:")) statuses[name] = counts.value;
    else if (answer.key.startsWith("done:")) done[name] = counts.value;
  }
  return { ...store, ok: true, readAt, statuses, done };
}

/** The host snapshot the refresher writes once a minute, by write-to-temp then rename. */
export interface HostSnapshot {
  schema: number;
  /** The lease token of the refresher that wrote it. */
  token: string;
  pid: number;
  /** When the refresher last wrote it: its heartbeat. */
  beatAt: number;
  /** Set when the refresher stopped on purpose, so a session restarts it without waiting. */
  stoppedAt?: number;
  stores: StoreSnapshot[];
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const countTable = (value: unknown): value is Record<string, Record<string, number>> =>
  isRecord(value) &&
  Object.values(value).every((owners) => isRecord(owners) && Object.values(owners).every(finite));

function storeOf(value: unknown): StoreSnapshot | undefined {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.name !== "string") {
    return undefined;
  }
  if (!finite(value.readAt)) return undefined;
  const base = { path: value.path, name: value.name, readAt: value.readAt };
  if (value.ok === true && countTable(value.statuses) && countTable(value.done)) {
    return { ...base, ok: true, statuses: value.statuses, done: value.done };
  }
  if (value.ok === false && typeof value.error === "string") {
    return { ...base, ok: false, error: value.error };
  }
  return undefined;
}

export function parseSnapshot(text: string): Result<HostSnapshot, string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "the snapshot is not JSON" };
  }
  if (!isRecord(json) || json.schema !== SNAPSHOT_SCHEMA) {
    return { ok: false, error: "the snapshot has another schema" };
  }
  if (typeof json.token !== "string" || !finite(json.pid) || !finite(json.beatAt)) {
    return { ok: false, error: "the snapshot has no token, pid or heartbeat" };
  }
  if (!Array.isArray(json.stores)) return { ok: false, error: "the snapshot has no stores" };
  const stores: StoreSnapshot[] = [];
  for (const entry of json.stores) {
    const store = storeOf(entry);
    if (store === undefined) return { ok: false, error: "the snapshot holds a malformed store" };
    stores.push(store);
  }
  const snapshot: HostSnapshot = {
    schema: SNAPSHOT_SCHEMA,
    token: json.token,
    pid: json.pid,
    beatAt: json.beatAt,
    stores,
  };
  if (finite(json.stoppedAt)) snapshot.stoppedAt = json.stoppedAt;
  return { ok: true, value: snapshot };
}

/** True while the snapshot's refresher runs: not stopped, its heartbeat at most STALE_MS old. */
export function snapshotLive(snapshot: HostSnapshot | undefined, nowMs: number): boolean {
  return (
    snapshot !== undefined &&
    snapshot.stoppedAt === undefined &&
    nowMs - snapshot.beatAt <= STALE_MS
  );
}

/**
 * One session's registry file, rewritten every minute: which done windows it draws, and any
 * store it reads that the inventory does not list (a `[directory_stores]` mapping, or its own
 * store when there is no inventory), so the refresher counts those too.
 */
export interface SessionEntry {
  id: string;
  seenAt: number;
  windows: string[];
  stores: { path: string; name: string }[];
}

export function parseSessionEntry(text: string): SessionEntry | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(json) || typeof json.id !== "string" || !finite(json.seenAt)) return undefined;
  const windows = Array.isArray(json.windows)
    ? json.windows.filter((span): span is string => typeof span === "string")
    : [];
  const stores = Array.isArray(json.stores)
    ? json.stores.flatMap((store) =>
        isRecord(store) && typeof store.path === "string" && store.path.startsWith("/")
          ? [{ path: store.path, name: typeof store.name === "string" ? store.name : store.path }]
          : [],
      )
    : [];
  return { id: json.id, seenAt: json.seenAt, windows, stores };
}

/** The registry file name of a session id: letters, digits, `.`, `_` and `-` kept, else `_`. */
export const sessionFileName = (id: string): string =>
  `${id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "_"}.json`;

/** The lease a session takes in `$.store` before it starts the refresher. */
export interface Lease {
  token: string;
  at: number;
}

export function leaseOf(value: unknown): Lease | undefined {
  return isRecord(value) && typeof value.token === "string" && finite(value.at)
    ? { token: value.token, at: value.at }
    : undefined;
}

/** What a session's minute check does about the refresher (T-1B.4). */
export type Supervision =
  | { kind: "snapshot" }
  | { kind: "start" }
  | { kind: "wait" }
  | { kind: "direct" };

/**
 * A live snapshot is drawn. A stale one, with the lease free or expired, starts a refresher. A
 * lease taken under LEASE_TTL_MS ago means a start is under way: the session waits START_GRACE_MS
 * for its snapshot, then reads its own counts, as it does at once when the lease is its own and
 * its start failed (`startFailed`); once that lease expires it tries the start again.
 */
export function supervise(options: {
  live: boolean;
  lease: Lease | undefined;
  nowMs: number;
  startFailed: boolean;
}): Supervision {
  const { live, lease, nowMs, startFailed } = options;
  if (live) return { kind: "snapshot" };
  if (lease === undefined || nowMs - lease.at >= LEASE_TTL_MS) return { kind: "start" };
  if (startFailed) return { kind: "direct" };
  return nowMs - lease.at <= START_GRACE_MS ? { kind: "wait" } : { kind: "direct" };
}
