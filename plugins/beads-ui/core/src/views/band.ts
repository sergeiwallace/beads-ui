import type { Result } from "../model.ts";
import type { Token } from "../tokens.ts";
import { asOf, storeName, truncate } from "./text.ts";

export interface BandCount {
  status: string;
  label: string;
  count: number;
  token: Token;
}

// T-1.6: the band names open, in-progress and blocked work, by bd's built-in status names.
const BAND_STATUSES: readonly { status: string; label: string; token: Token }[] = [
  { status: "open", label: "open", token: "status.active" },
  { status: "in_progress", label: "in progress", token: "status.wip" },
  { status: "blocked", label: "blocked", token: "warning" },
];

/** A Beads store the band reads: a repository directory holding a `.beads/` store. */
export interface BandStore {
  name: string;
  path: string;
  /** True when the store was last seen in step with the remote both hosts of the pair pull. */
  synced: boolean;
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
    stores.push({ name, path: entry.repo, synced });
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

/** One row of the band and what it counts: `assignee`'s issues, or every issue, in `stores`. */
export interface BandRead {
  key: "totals" | "own" | "store";
  title: string;
  stores: BandStore[];
  assignee?: string;
  /** Why the row has no stores to read, when it has none. */
  missing?: string;
}

/**
 * The rows a session's band draws (D-17: `assignee` names the session). A named session counts
 * the issues it holds in every store of the inventory, or in its own directory's store when the
 * inventory cannot be read. A firstmate session first draws the whole-machine totals, labelled
 * as the host pair's. A session with no name holds nothing it could count, so its one row counts
 * its directory's store and says it is every owner's.
 */
export function bandReads(options: {
  session: string | undefined;
  here: BandStore;
  inventory: Result<BandStore[], string>;
}): BandRead[] {
  const { session, here, inventory } = options;
  if (session === undefined) {
    return [
      {
        key: "store",
        title: `beads ${here.name}, all owners (session name unknown)`,
        stores: [here],
      },
    ];
  }
  const reads: BandRead[] = [];
  if (isFirstmate(session)) {
    if (inventory.ok) {
      const behind = inventory.value.filter((store) => !store.synced).length;
      const lag = behind === 0 ? "" : `, ${behind} not synced with the pair`;
      reads.push({
        key: "totals",
        title: `beads host pair, all ${inventory.value.length} stores${lag}`,
        stores: inventory.value,
      });
    } else {
      reads.push({ key: "totals", title: "beads host pair", stores: [], missing: inventory.error });
    }
  }
  reads.push(
    inventory.ok
      ? {
          key: "own",
          title: `beads ${session}, all ${inventory.value.length} stores`,
          stores: inventory.value,
          assignee: session,
        }
      : {
          key: "own",
          title: `beads ${session} in ${here.name}`,
          stores: [here],
          assignee: session,
        },
  );
  return reads;
}

/** One store's answer to a band read. */
export type StoreCounts =
  | { store: string; ok: true; counts: Readonly<Record<string, number>> }
  | { store: string; ok: false; error: string };

export interface BandRow {
  key: BandRead["key"];
  /** `beads <scope>`, the row's lead. */
  title: string;
  /** Summed over the stores that answered; absent when none did. */
  counts?: BandCount[];
  /** The stores that could not be read, when any could not. */
  note?: string;
  asOf?: string;
  /** The whole row as one line, cut to the width, for a surface that draws a single Text. */
  line: string;
}

function noteOf(
  read: BandRead,
  failed: readonly StoreCounts[],
  answered: number,
): string | undefined {
  if (read.missing !== undefined) return `cannot list the stores: ${read.missing}`;
  if (failed.length === 0) return undefined;
  if (answered === 0) {
    const only = failed.length === 1 ? failed[0] : undefined;
    return only !== undefined && !only.ok
      ? `could not read ${only.store}: ${only.error}`
      : `could not read any of the ${failed.length} stores`;
  }
  return `${failed.length} of ${read.stores.length} stores unread (${failed.map((one) => one.store).join(", ")})`;
}

/** A band row from its read and each store's answer, in the read's store order. */
export function bandRow(
  read: BandRead,
  answers: readonly StoreCounts[],
  options: { loadedAt?: string; width: number },
): BandRow {
  const answered = answers.filter((answer) => answer.ok);
  const failed = answers.filter((answer) => !answer.ok);
  const row: BandRow = { key: read.key, title: read.title, line: "" };
  if (answered.length > 0) {
    row.counts = BAND_STATUSES.map(({ status, label, token }) => ({
      status,
      label,
      count: answered.reduce((sum, answer) => sum + (answer.counts[status] ?? 0), 0),
      token,
    }));
  }
  const note = noteOf(read, failed, answered.length);
  if (note !== undefined) row.note = note;
  if (options.loadedAt !== undefined) row.asOf = asOf(options.loadedAt);
  const parts = [row.title, ...(row.counts ?? []).map((count) => `${count.count} ${count.label}`)];
  if (row.note !== undefined) parts.push(row.note);
  if (row.asOf !== undefined) parts.push(row.asOf);
  row.line = truncate(parts.join(" | "), options.width);
  return row;
}
