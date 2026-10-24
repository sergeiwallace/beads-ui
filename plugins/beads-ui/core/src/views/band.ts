import type { Result } from "../model.ts";
import { DEFAULT_DONE_WINDOW, type StoreSnapshot } from "../snapshot.ts";
import type { Token } from "../tokens.ts";
import { asOf, storeName, truncate } from "./text.ts";

/** A Beads store the band reads: a repository directory holding a `.beads/` store. */
export interface BandStore {
  name: string;
  path: string;
  /** True when the store was last seen in step with the remote both hosts of the pair pull. */
  synced: boolean;
  /**
   * The store's database prefix, its identity on the shared server: the inventory's key, or what
   * `bd where` named. A linked worktree has its own `.beads` directory and the same prefix.
   */
  prefix?: string;
}

/**
 * The machine's list of every repository store, written by ai-harness's
 * `scripts/bd_publish_sweep.py` on each publish sweep, under the home directory.
 */
export const STORE_INVENTORY_FILE = ".beads/shared-server/publish-sweep.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads the store inventory: each published store under `stores` (keyed by its database name,
 * with `repo` its directory, in step with the shared remote when its attestation reads `verdict:
 * shared` and `sync_state: converged`, the sweep's own test) and each store the sweep skipped,
 * which is never in step with the pair.
 */
export function parseStoreInventory(text: string): Result<BandStore[], string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "the store inventory is not JSON" };
  }
  if (!isRecord(json) || !isRecord(json.stores)) {
    return { ok: false, error: "the store inventory has no stores object" };
  }
  const stores: BandStore[] = [];
  for (const [name, entry] of Object.entries(json.stores)) {
    if (!isRecord(entry) || typeof entry.repo !== "string" || entry.repo === "") {
      return { ok: false, error: `the store inventory gives no repo for ${name}` };
    }
    const attestation = isRecord(entry.attestation) ? entry.attestation : {};
    const synced = attestation.verdict === "shared" && attestation.sync_state === "converged";
    stores.push({ name, path: entry.repo, synced, prefix: name });
  }
  for (const entry of Array.isArray(json.skipped) ? json.skipped : []) {
    if (isRecord(entry) && typeof entry.repo === "string" && entry.repo !== "") {
      stores.push({ name: storeName(entry.repo), path: entry.repo, synced: false });
    }
  }
  if (stores.length === 0) return { ok: false, error: "the store inventory lists no stores" };
  return { ok: true, value: stores };
}

/** A firstmate session's name ends `-firstmate-<N>`, as `aih-ec2-firstmate-1` does. */
export const isFirstmate = (session: string): boolean => /-firstmate-\d+$/.test(session);

/**
 * The parts a band line can draw (T-1B.11), each addable and removable: the total, the four
 * counts (the done count with its window), the drift marker of D-34 and the unpublished-edit
 * count of T-2B.6, with its failure mark.
 */
export const BAND_PARTS = [
  "total",
  "in_progress",
  "blocked",
  "open",
  "done",
  "drift",
  "unpublished",
] as const;
export type BandPart = (typeof BAND_PARTS)[number];

/** In progress and blocked first, the order the band's format asks for. */
export const DEFAULT_BAND_PARTS: readonly BandPart[] = BAND_PARTS;

export const BAND_PART_LABELS: Readonly<Record<BandPart, string>> = {
  total: "total tasks",
  in_progress: "in progress",
  blocked: "blocked",
  open: "open",
  done: "done in the window",
  drift: "unsynced stores",
  unpublished: "unpublished edits",
};

export const isBandPart = (value: string): value is BandPart =>
  (BAND_PARTS as readonly string[]).includes(value);

/** What `beads-ui.toml`'s `[band]` table, or the pane's band settings, set. */
export interface BandSettings {
  doneWindow: string;
  parts: BandPart[];
  /** Debug mode: each line ends with the time its counts were read (T-1B.5). */
  debug: boolean;
}

export const DEFAULT_BAND_SETTINGS: BandSettings = {
  doneWindow: DEFAULT_DONE_WINDOW,
  parts: [...DEFAULT_BAND_PARTS],
  debug: false,
};

/** The glyph a line ends with when a store it sums could not be read (T-1B.10). */
export const PARTIAL_GLYPH = "~";
/** The glyph a line ends with when the session read its counts itself (T-1B.4's fallback). */
export const DIRECT_GLYPH = "*";

/** The band's labels (D-30, D-34): `[fm]` is right-aligned under `[all]`. */
export const BAND_LABEL = "[bd]";
export const ALL_LABEL = "[bd][all]";
export const FIRSTMATE_LABEL = "     [fm]";

/** The mark after the unpublished count once a failed publish's turn was given up (T-2B.6). */
export const SYNC_FAILED_MARK = "publish failed";

/** One line of the band and what it counts: `assignee`'s issues, or every issue, in `stores`. */
export interface BandRead {
  key: "all" | "own" | "store";
  label: string;
  stores: BandStore[];
  assignee?: string;
  /** How many of `stores` are out of step with the pair, on the firstmate's totals line. */
  drift?: number;
  /** Why the totals line cannot sum every store: the inventory did not read. */
  missing?: string;
}

const samePath = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/**
 * Whether two stores are one database: the same prefix, or, where either has none, the same
 * directory. A linked worktree and its main tree share a prefix and not a directory.
 */
export const sameStore = (
  a: Pick<BandStore, "path" | "prefix">,
  b: Pick<BandStore, "path" | "prefix">,
): boolean =>
  a.prefix !== undefined && b.prefix !== undefined
    ? a.prefix === b.prefix
    : samePath(a.path, b.path);

/**
 * The stores a session sums: the inventory's, plus the session's own store when the inventory
 * holds no store of its database (a `[directory_stores]` mapping, T-1B.1); its own store alone
 * when there is no inventory. A session in a linked worktree sums its main tree's entry.
 */
export function bandStores(
  here: BandStore | undefined,
  inventory: Result<BandStore[], string>,
): BandStore[] {
  if (!inventory.ok) return here === undefined ? [] : [here];
  const listed = inventory.value;
  return here === undefined || listed.some((store) => sameStore(store, here))
    ? listed
    : [...listed, here];
}

/**
 * The lines a session's band draws (D-17: `assignee` names the session; D-30, D-34). A named
 * session counts the issues it holds in every store it sums. A firstmate session first draws
 * every owner's issues over those stores as `[bd][all]`, with its own as `[fm]` beneath. A
 * session with no name holds nothing it could count, so its one line counts its own store for
 * every owner. `here` is undefined when the session's store did not resolve.
 */
export function bandReads(options: {
  session: string | undefined;
  here: BandStore | undefined;
  inventory: Result<BandStore[], string>;
}): BandRead[] {
  const { session, here, inventory } = options;
  const missing = inventory.ok ? {} : { missing: inventory.error };
  if (session === undefined) {
    return here === undefined ? [] : [{ key: "store", label: BAND_LABEL, stores: [here] }];
  }
  const stores = bandStores(here, inventory);
  if (!isFirstmate(session)) return [{ key: "own", label: BAND_LABEL, stores, assignee: session }];
  const drift = inventory.ok ? inventory.value.filter((store) => !store.synced).length : 0;
  // Without the inventory the totals cannot cover every store, so that line says it is partial.
  return [
    { key: "all", label: ALL_LABEL, stores, drift, ...missing },
    { key: "own", label: FIRSTMATE_LABEL, stores, assignee: session },
  ];
}

export interface BandCounts {
  in_progress: number;
  blocked: number;
  open: number;
  done: number;
}

/** A line's counts summed over the stores that answered, and whether any did not. */
export interface BandTotal {
  counts: BandCounts;
  /** How many of the line's stores the counts come from. */
  answered: number;
  partial: boolean;
}

const ownerSum = (owners: Readonly<Record<string, number>> | undefined, assignee?: string) =>
  owners === undefined
    ? 0
    : assignee === undefined
      ? Object.values(owners).reduce((sum, count) => sum + count, 0)
      : (owners[assignee] ?? 0);

/**
 * Sums a line's stores from their snapshots. A store with no snapshot, a failed read or no count
 * for the done window adds nothing and makes the total partial, as a missing inventory does.
 */
export function bandTotal(
  read: BandRead,
  snapshots: readonly StoreSnapshot[],
  doneWindow: string,
): BandTotal {
  const counts: BandCounts = { in_progress: 0, blocked: 0, open: 0, done: 0 };
  let answered = 0;
  let partial = read.missing !== undefined;
  for (const store of read.stores) {
    const snapshot = snapshots.find((one) => samePath(one.path, store.path));
    if (snapshot === undefined || !snapshot.ok || snapshot.done[doneWindow] === undefined) {
      partial = true;
      continue;
    }
    answered++;
    counts.in_progress += ownerSum(snapshot.statuses.in_progress, read.assignee);
    counts.blocked += ownerSum(snapshot.statuses.blocked, read.assignee);
    counts.open += ownerSum(snapshot.statuses.open, read.assignee);
    counts.done += ownerSum(snapshot.done[doneWindow], read.assignee);
  }
  return { counts, answered, partial };
}

/** One run of a band line's text and how it is drawn. */
export interface BandSegment {
  text: string;
  token?: Token;
  bold?: boolean;
  dim?: boolean;
}

export interface BandLine {
  key: BandRead["key"];
  segments: BandSegment[];
  /** The whole line as one string, cut to the width after its label. */
  line: string;
}

const COUNT_PARTS: readonly { part: BandPart; token: Token }[] = [
  { part: "in_progress", token: "status.wip" },
  { part: "blocked", token: "warning" },
  { part: "open", token: "status.active" },
  { part: "done", token: "status.done" },
];

/**
 * A band line (T-1B.10, T-1B.11): `[bd] {T} tasks ({P} in progress, {B} blocked, {O} open, {D}
 * done last {W})` in the configured part order, T the sum of the counts drawn (`1 task` for one).
 * The counts follow the total in brackets when the total is drawn. The drift marker (`1 unsynced`) and the
 * unpublished-edit count (`2 unpublished`) draw only while above zero, the count followed by
 * SYNC_FAILED_MARK while `syncFailed` is set. The line ends with PARTIAL_GLYPH when a
 * store did not answer, DIRECT_GLYPH when the session read the counts itself, and in debug mode
 * the read time.
 */
export function bandLine(
  read: BandRead,
  total: BandTotal,
  options: {
    settings: BandSettings;
    direct: boolean;
    /** The read time as a local ISO stamp, shown in debug mode. */
    readAt?: string;
    unpublished?: number;
    /** A failed publish's turn was given up, and the store has not published since. */
    syncFailed?: boolean;
    width: number;
  },
): BandLine {
  const { settings } = options;
  const parts = settings.parts;
  const counts = COUNT_PARTS.filter(({ part }) => parts.includes(part)).sort(
    (a, b) => parts.indexOf(a.part) - parts.indexOf(b.part),
  );
  const value = (part: BandPart) => total.counts[part as keyof BandCounts];
  const sum = counts.reduce((acc, { part }) => acc + value(part), 0);
  const countText = (part: BandPart) =>
    part === "done"
      ? `${value(part)} done last ${settings.doneWindow}`
      : `${value(part)} ${BAND_PART_LABELS[part]}`;
  const list = (into: BandSegment[]) =>
    counts.forEach(({ part, token }, i) => {
      if (i > 0) into.push({ text: ", " });
      into.push({ text: countText(part), token });
    });

  const groups: BandSegment[][] = [];
  let listed = false;
  for (const part of parts) {
    if (part === "total") {
      const group: BandSegment[] = [{ text: `${sum} ${sum === 1 ? "task" : "tasks"}` }];
      if (counts.length > 0) {
        group.push({ text: " (" });
        list(group);
        group.push({ text: ")" });
      }
      groups.push(group);
      listed = true;
    } else if (part === "drift") {
      if ((read.drift ?? 0) > 0)
        groups.push([{ text: `${read.drift} unsynced`, token: "warning" }]);
    } else if (part === "unpublished") {
      const count = options.unpublished ?? 0;
      const group: BandSegment[] =
        count > 0 ? [{ text: `${count} unpublished`, token: "accent" }] : [];
      if (options.syncFailed === true) {
        if (group.length > 0) group.push({ text: " " });
        group.push({ text: SYNC_FAILED_MARK, token: "error" });
      }
      if (group.length > 0) groups.push(group);
    } else if (!listed && !parts.includes("total")) {
      const group: BandSegment[] = [];
      list(group);
      groups.push(group);
      listed = true;
    }
  }
  const marks = `${total.partial ? PARTIAL_GLYPH : ""}${options.direct ? DIRECT_GLYPH : ""}`;
  if (marks !== "") groups.push([{ text: marks, token: "warning" }]);
  if (settings.debug && options.readAt !== undefined) {
    groups.push([{ text: asOf(options.readAt), dim: true }]);
  }

  const segments: BandSegment[] = [{ text: read.label, bold: true }];
  for (const group of groups) segments.push({ text: " " }, ...group);
  const rest = groups.map((group) => group.map((segment) => segment.text).join("")).join(" ");
  // The label keeps its own spaces: `[fm]` sits under `[all]` only while they are not collapsed.
  const room = options.width - read.label.length - 1;
  const line = rest === "" || room < 1 ? read.label : `${read.label} ${truncate(rest, room)}`;
  return { key: read.key, segments, line };
}
