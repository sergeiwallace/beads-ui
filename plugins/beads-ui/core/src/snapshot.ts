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
/**
 * A file lease not renewed for this long names a refresher that has stopped, killed or hung:
 * two and a half renewals. A session's minute check that finds it starts the next refresher, so
 * one runs within LEASE_DEAD_MS plus BEAT_MS of the last renewal (T-1B.4: two minutes).
 */
export const LEASE_DEAD_MS = 50_000;

/** The `$.store` key of the lease a session takes before it starts the refresher. */
export const LEASE_KEY = "refresher-lease";
/**
 * The snapshot the lease holder published last, replaced only by a holder that still holds the
 * lease once its own file is written. A session reads it only when no lease names a refresher,
 * as for a pane's first paint after the refresher stopped; otherwise it reads the snapshot of
 * the token `lease.json` names (snapshotFileName).
 */
export const SNAPSHOT_FILE = "counts.json";
export const LEASE_FILE = "lease.json";

/** A refresher's lease token: 8 to 64 letters, digits, `_` or `-`, so it is safe in a file name. */
export const isRefresherToken = (token: unknown): token is string =>
  typeof token === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(token);

/**
 * The snapshot each refresher writes under its own token. Only the refresher holding that token
 * writes it, so a refresher ousted while it wrote can never replace the holder's snapshot.
 */
export const snapshotFileName = (token: string): string => `counts-${token}.json`;
export const SESSIONS_DIR = "sessions";
export const SNAPSHOT_SCHEMA = 1;
/** One board snapshot per store a session's pane reads, in this directory (T-1B.4, T-1B.8). */
export const BOARDS_DIR = "boards";
export const BOARD_SCHEMA = 1;
/** `$.fs.read` reads at most 4 MiB a file, so a board snapshot past this is not written. */
export const BOARD_MAX_BYTES = 4 * 1024 * 1024;
/** Where a session drops a marker after a write, so the refresher re-reads that store early. */
export const WAKE_DIR = "wake";
/** How often the refresher looks for wake markers. */
export const WAKE_POLL_MS = 1_000;

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

/**
 * Where one store's board snapshot stands, in the host snapshot. `head` is the store's Dolt commit
 * when its issues were last read, `checkedAt` when that head was last confirmed current. A store
 * whose snapshot would pass BOARD_MAX_BYTES, or could not be read, has `ok: false` and why, and a
 * session's pane reads that store itself.
 */
export type BoardEntry =
  | {
      path: string;
      ok: true;
      file: string;
      head: string;
      readAt: number;
      checkedAt: number;
      bytes: number;
    }
  | { path: string; ok: false; checkedAt: number; error: string };

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
  /** The board snapshot of each store a live session's pane reads. */
  boards?: BoardEntry[];
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
  if (Array.isArray(json.boards)) {
    snapshot.boards = json.boards.flatMap((entry) => {
      const board = boardEntryOf(entry);
      return board === undefined ? [] : [board];
    });
  }
  return { ok: true, value: snapshot };
}

function boardEntryOf(value: unknown): BoardEntry | undefined {
  if (!isRecord(value) || typeof value.path !== "string" || !finite(value.checkedAt)) {
    return undefined;
  }
  if (
    value.ok === true &&
    typeof value.file === "string" &&
    typeof value.head === "string" &&
    finite(value.readAt) &&
    finite(value.bytes)
  ) {
    const { path, file, head, readAt, checkedAt, bytes } = value;
    return { path, ok: true, file, head, readAt, checkedAt, bytes };
  }
  if (value.ok === false && typeof value.error === "string") {
    return { path: value.path, ok: false, checkedAt: value.checkedAt, error: value.error };
  }
  return undefined;
}

/** The board snapshot file of a store directory: its path, with `/` and other marks as `_`. */
export const boardFileName = (path: string): string => sessionFileName(trimSlash(path));

/**
 * Where a board snapshot file lives in the state directory: under the token of the refresher
 * that wrote it, so a snapshot names only board files its own refresher wrote.
 */
export const boardPath = (token: string, file: string): string => `${BOARDS_DIR}/${token}/${file}`;

/** The `bd list` fields the board, the backlog and the Mine view draw; a snapshot keeps only these. */
export const BOARD_FIELDS = [
  "id",
  "title",
  "status",
  "priority",
  "issue_type",
  "assignee",
  "labels",
  "parent",
  "due_at",
  "created_at",
  "updated_at",
  "closed_at",
] as const;

/** One `bd list` row cut to BOARD_FIELDS and the metadata a card draws (its display id). */
export function boardRow(row: unknown): Record<string, unknown> | undefined {
  if (!isRecord(row)) return undefined;
  const kept: Record<string, unknown> = {};
  for (const field of BOARD_FIELDS) {
    if (row[field] !== undefined && row[field] !== null) kept[field] = row[field];
  }
  let metadata: unknown = row.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = undefined;
    }
  }
  if (isRecord(metadata)) {
    const drawn: Record<string, unknown> = {};
    for (const key of ["display_id", "owner"]) {
      if (typeof metadata[key] === "string") drawn[key] = metadata[key];
    }
    if (Object.keys(drawn).length > 0) kept.metadata = drawn;
  }
  return kept;
}

/** The commit `bd vc status --json` names: the store's Dolt head. */
export function parseHead(text: string): string | undefined {
  try {
    const json: unknown = JSON.parse(text);
    return isRecord(json) && typeof json.commit === "string" && json.commit !== ""
      ? json.commit
      : undefined;
  } catch {
    return undefined;
  }
}

/** One store's board snapshot file: `bd statuses` and the board's rows as of `head`. */
export interface BoardSnapshot {
  schema: number;
  path: string;
  name: string;
  head: string;
  readAt: number;
  /** `bd statuses --json` as bd wrote it. */
  statuses: unknown;
  /** The open issues, then the most recently closed page, each cut by boardRow. */
  issues: unknown[];
}

export function parseBoardSnapshot(text: string): Result<BoardSnapshot, string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "the board snapshot is not JSON" };
  }
  if (!isRecord(json) || json.schema !== BOARD_SCHEMA) {
    return { ok: false, error: "the board snapshot has another schema" };
  }
  const { path, name, head, readAt, statuses, issues } = json;
  if (typeof path !== "string" || typeof name !== "string" || typeof head !== "string") {
    return { ok: false, error: "the board snapshot names no store or head" };
  }
  if (!finite(readAt) || !Array.isArray(issues)) {
    return { ok: false, error: "the board snapshot has no read time or issues" };
  }
  return { ok: true, value: { schema: BOARD_SCHEMA, path, name, head, readAt, statuses, issues } };
}

/** A wake marker's file name and text: the store a session just wrote to, and when. */
export const wakeFileName = boardFileName;
export const wakeText = (path: string, at: number): string => `${JSON.stringify({ path, at })}\n`;

export function parseWake(text: string): { path: string; at: number } | undefined {
  try {
    const json: unknown = JSON.parse(text);
    return isRecord(json) && typeof json.path === "string" && json.path.startsWith("/")
      ? { path: json.path, at: finite(json.at) ? json.at : 0 }
      : undefined;
  } catch {
    return undefined;
  }
}

/** The file lease a running refresher holds and renews every RENEW_MS. */
export interface FileLease {
  token: string;
  pid: number;
  beatAt: number;
  /** The plugin build the refresher runs; builds before 0.9.4 record none. */
  version?: string;
}

export function parseFileLease(text: string): FileLease | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    !isRecord(json) ||
    typeof json.token !== "string" ||
    !finite(json.pid) ||
    !finite(json.beatAt)
  ) {
    return undefined;
  }
  const lease: FileLease = { token: json.token, pid: json.pid, beatAt: json.beatAt };
  if (typeof json.version === "string") lease.version = json.version;
  return lease;
}

/** The plugin's manifest under its root, whose `version` is the build a refresher records. */
export const MANIFEST_PATH = ".claude-plugin/plugin.json";

const BUILD = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+].*)?$/;

/** The `major.minor.patch` build the manifest's text names; undefined when it names none. */
export function buildOf(manifest: string | undefined): string | undefined {
  try {
    const version: unknown = JSON.parse(manifest ?? "")?.version;
    const parts = typeof version === "string" ? BUILD.exec(version) : null;
    return parts === null ? undefined : parts.slice(1, 4).map(Number).join(".");
  } catch {
    return undefined;
  }
}

/**
 * True when `mine` is a later build than `held`, the one a refresher's lease records (D-26): that
 * refresher is superseded, its lease taken while it is live. A lease that records no build, or
 * one this cannot read, was written by a build before 0.9.4, so every build is later; with no
 * build of its own a refresher or session is never later, so it supersedes nothing.
 */
export function laterBuild(mine: string | undefined, held: string | undefined): boolean {
  const own = mine === undefined ? null : BUILD.exec(mine);
  if (own === null) return false;
  const their = held === undefined ? null : BUILD.exec(held);
  if (their === null) return true;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(own[i]) - Number(their[i]);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * True while a refresher runs: its file lease was renewed within LEASE_DEAD_MS. A refresher that
 * stops on purpose removes the lease; a killed one leaves it to go stale.
 */
export function refresherRunning(lease: FileLease | undefined, nowMs: number): boolean {
  return lease !== undefined && nowMs - lease.beatAt <= LEASE_DEAD_MS;
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
 * store when there is no inventory), so the refresher counts those too, and the store its pane
 * reads, whose board snapshot the refresher keeps.
 */
export interface SessionEntry {
  id: string;
  seenAt: number;
  windows: string[];
  /** Each with the database prefix bd named, when it named one: a worktree's is its main tree's. */
  stores: { path: string; name: string; prefix?: string }[];
  boards: { path: string; name: string; prefix?: string }[];
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
  const named = (list: unknown) =>
    Array.isArray(list)
      ? list.flatMap((store) =>
          isRecord(store) && typeof store.path === "string" && store.path.startsWith("/")
            ? [
                {
                  path: store.path,
                  name: typeof store.name === "string" ? store.name : store.path,
                  ...(typeof store.prefix === "string" && store.prefix !== ""
                    ? { prefix: store.prefix }
                    : {}),
                },
              ]
            : [],
        )
      : [];
  return {
    id: json.id,
    seenAt: json.seenAt,
    windows,
    stores: named(json.stores),
    boards: named(json.boards),
  };
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
 * A running refresher with a live snapshot is drawn; a running one whose counts are older than
 * STALE_MS is drawn from this session's own reads, marked so. With no refresher running, a free
 * or expired `$.store` lease starts one, as does a lease whose start completed (the stopped
 * refresher's file lease carries its token), so a killed refresher is replaced at the next minute
 * check rather than when the lease expires. A lease taken under LEASE_TTL_MS ago whose refresher
 * never ran means a start is under way: the session waits START_GRACE_MS for its snapshot, then
 * reads its own counts, as it does at once when the lease is its own and its start failed
 * (`startFailed`); once that lease expires it tries the start again.
 *
 * A running refresher of an older build than the session's (`outdated`, BU-4af) is replaced the
 * same way: the session starts one of its own build under a free lease, whose refresher takes the
 * older one's file lease while it is live. Until then the session draws the older one's snapshot
 * when it has one under its token, and otherwise waits START_GRACE_MS, as for any start.
 */
export function supervise(options: {
  live: boolean;
  running: boolean;
  /** The running refresher is an older build than the session's (laterBuild). */
  outdated: boolean;
  lease: Lease | undefined;
  /** The token in the last refresher's file lease, live or stale. */
  heldBy: string | undefined;
  nowMs: number;
  startFailed: boolean;
}): Supervision {
  const { live, running, outdated, lease, heldBy, nowMs, startFailed } = options;
  const expired = lease === undefined || nowMs - lease.at >= LEASE_TTL_MS;
  const free = expired || lease.token === heldBy;
  // A failed replacing start is tried again once its lease expires, as any failed start is.
  if (running && (!outdated || (startFailed && !expired))) {
    return live ? { kind: "snapshot" } : { kind: "direct" };
  }
  if (free) return { kind: "start" };
  if (running && live) return { kind: "snapshot" };
  if (startFailed) return { kind: "direct" };
  return lease !== undefined && nowMs - lease.at <= START_GRACE_MS
    ? { kind: "wait" }
    : { kind: "direct" };
}
