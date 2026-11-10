import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BdResult } from "@sergeiwallace/beads-ui-bd-node";
import { StoreClosed } from "./allowlist.ts";
import type { OpenStore, StoreRegistry } from "./registry.ts";

/** The longest a failing heads query waits before its next try, unless the interval is longer. */
export const MAX_BACKOFF_MS = 60_000;

/** What the feed pushes to every open event stream. */
export type FeedEvent =
  | {
      type: "change";
      /** The stores whose head moved since the last poll, by the repository the allowlist opened. */
      data: { stores: string[]; asOf: string };
    }
  | {
      type: "stale";
      /** The heads could not be read: the last state stands, and the next try is `retryInMs` away. */
      data: { since: string; message: string; retryInMs: number };
    };

export interface FeedStatus {
  /** When the heads were last read whole. */
  asOf?: string;
  stale?: { since: string; message: string; retryInMs: number };
}

/** How bd reaches a store's database, from the store's `.beads/metadata.json`. */
export interface StoreDatabase {
  /** The database's name on its Dolt server. */
  name: string;
  /** Stores with the same key are on the same Dolt server, so one query reads all their heads. */
  server: string;
}

/**
 * The database a store in server mode uses and the server it is on, or undefined for an embedded
 * store or one whose metadata cannot be read: that store's head is read on its own.
 */
export async function storeDatabase(path: string): Promise<StoreDatabase | undefined> {
  let metadata: unknown;
  try {
    metadata = JSON.parse(await readFile(join(path, ".beads", "metadata.json"), "utf8"));
  } catch {
    return undefined;
  }
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const fields = metadata as Record<string, unknown>;
  if (fields.dolt_mode !== "server" || typeof fields.dolt_database !== "string") return undefined;
  const host = typeof fields.dolt_server_host === "string" ? fields.dolt_server_host : "127.0.0.1";
  let port = typeof fields.dolt_server_port === "number" ? String(fields.dolt_server_port) : "";
  if (port === "") {
    // A shared-server store names its port in a file beside the metadata, not in it.
    port = await readFile(join(path, ".beads", "dolt-server.port"), "utf8").then(
      (text) => text.trim(),
      () => "shared",
    );
  }
  return { name: fields.dolt_database, server: `${host}:${port}` };
}

export interface HeadsFeedOptions<T> {
  stores: StoreRegistry;
  /** Re-reads one store whose head moved; the feed keeps what it returns for that head. */
  read(store: OpenStore): Promise<T>;
  /** Whether a read is worth keeping: a failed read is read again next time. */
  keep(value: T): boolean;
  /** The poll interval, read again before every poll. */
  intervalMs(): Promise<number>;
  /** Milliseconds since the epoch. */
  clock?: () => number;
}

type Attempt<T> = BdResult<T> | { kind: "closed" } | { kind: "thrown"; message: string };

/** A bd call that may throw: a store closed since the poll began is skipped, not a failure. */
async function attempt<T>(call: () => Promise<BdResult<T>>): Promise<Attempt<T>> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof StoreClosed) return { kind: "closed" };
    return { kind: "thrown", message: error instanceof Error ? error.message : String(error) };
  }
}

const failureText = (result: Exclude<Attempt<unknown>, { kind: "ok" | "closed" }>): string =>
  result.kind === "thrown"
    ? result.message
    : result.kind === "timeout"
      ? `${result.command} took longer than ${result.timeoutMs} ms`
      : result.kind === "failed"
        ? result.message
        : result.kind;

/**
 * The change feed (D-13 of the web app design): every allowed store's Dolt head in one query per
 * Dolt server, which on a host whose stores share one server is one query; then only the stores
 * whose head moved are read again, and one `change` event names them. A failed poll keeps the last
 * heads and reads, pushes a `stale` event, and tries again with a doubling wait. It polls only while
 * an event stream is open: with no page to tell, it runs no bd at all and keeps no read.
 */
export class HeadsFeed<T> {
  readonly #options: HeadsFeedOptions<T>;
  readonly #clock: () => number;
  readonly #listeners = new Set<(event: FeedEvent) => void>();
  /** Each open store's head at the last poll, by its path. */
  #heads: Map<string, string> | undefined;
  readonly #kept = new Map<string, { head: string; value: T }>();
  #status: FeedStatus = {};
  #failures = 0;
  #timer: NodeJS.Timeout | undefined;
  #polling: Promise<void> = Promise.resolve();
  #stopped = true;

  constructor(options: HeadsFeedOptions<T>) {
    this.#options = options;
    this.#clock = options.clock ?? Date.now;
  }

  subscribe(listener: (event: FeedEvent) => void): () => void {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) this.#schedule(0);
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#idle();
    };
  }

  /** With no stream open the heads go unread, so nothing kept can be trusted past this point. */
  #idle(): void {
    clearTimeout(this.#timer);
    this.#heads = undefined;
    this.#kept.clear();
    this.#status = {};
    this.#failures = 0;
  }

  status(): FeedStatus {
    return { ...this.#status };
  }

  /** Whether the last poll read every head; false before the first. */
  get live(): boolean {
    return this.#heads !== undefined && this.#status.stale === undefined;
  }

  /**
   * A store's read: the one kept for its current head while the feed is live, else read now and
   * kept for the head the last poll saw, which the next poll corrects if the store has moved.
   */
  async read(store: OpenStore): Promise<T> {
    const head = this.#heads?.get(store.path);
    const kept = this.#kept.get(store.path);
    if (this.live && head !== undefined && kept?.head === head) return kept.value;
    const value = await this.#options.read(store);
    if (this.live && head !== undefined && this.#options.keep(value)) {
      this.#kept.set(store.path, { head, value });
    }
    return value;
  }

  /** Drops every kept read: a write through the server moves a head the next poll has not seen. */
  forget(): void {
    this.#kept.clear();
  }

  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    if (this.#listeners.size > 0) this.#schedule(0);
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    clearTimeout(this.#timer);
    await this.#polling;
  }

  /** One poll, after any poll still running. */
  poll(): Promise<void> {
    this.#polling = this.#polling.then(() => this.#poll());
    return this.#polling;
  }

  #schedule(delayMs: number): void {
    if (this.#stopped || this.#listeners.size === 0) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      void this.poll().finally(async () => {
        if (this.#listeners.size === 0) {
          this.#idle();
          return;
        }
        this.#schedule(this.#wait(await this.#interval()));
      });
    }, delayMs);
    this.#timer.unref();
  }

  /** The interval while polls succeed; after `n` failures in a row, `interval * 2^n`, capped. */
  #wait(interval: number): number {
    if (this.#failures === 0) return interval;
    return Math.min(interval * 2 ** this.#failures, Math.max(MAX_BACKOFF_MS, interval));
  }

  async #interval(): Promise<number> {
    try {
      return await this.#options.intervalMs();
    } catch {
      return MAX_BACKOFF_MS;
    }
  }

  #emit(event: FeedEvent): void {
    for (const listener of [...this.#listeners]) listener(event);
  }

  async #poll(): Promise<void> {
    try {
      await this.#pollOnce();
    } catch (error) {
      await this.#fail(error instanceof Error ? error.message : String(error));
    }
  }

  /** A failed poll: the last heads and reads stand, and the stamp says since when. */
  async #fail(message: string): Promise<void> {
    this.#failures += 1;
    const retryInMs = this.#wait(await this.#interval());
    const since = this.#status.stale?.since ?? new Date(this.#clock()).toISOString();
    this.#status = {
      ...(this.#status.asOf === undefined ? {} : { asOf: this.#status.asOf }),
      stale: { since, message, retryInMs },
    };
    this.#emit({ type: "stale", data: { since, message, retryInMs } });
  }

  async #pollOnce(): Promise<void> {
    let stores: OpenStore[];
    try {
      stores = await this.#options.stores.open();
    } catch (error) {
      if (!(error instanceof StoreClosed)) throw error;
      stores = [];
    }
    const read = await this.#readHeads(stores);
    if (this.#listeners.size === 0) return;
    if (!read.ok) {
      await this.#fail(read.message);
      return;
    }
    const now = new Date(this.#clock()).toISOString();
    const recovered = this.#failures > 0;
    const previous = this.#heads;
    if (previous === undefined) {
      this.#failures = 0;
      this.#heads = read.heads;
      this.#status = { asOf: now };
      return;
    }
    const moved = stores.filter((store) => {
      const head = read.heads.get(store.path);
      return head !== undefined && previous.get(store.path) !== head;
    });
    const gone = [...previous.keys()].filter((path) => !read.heads.has(path));
    for (const path of gone) this.#kept.delete(path);
    for (const store of moved) {
      if (this.#listeners.size === 0) return;
      const value = await this.#options.read(store);
      const head = read.heads.get(store.path);
      if (head !== undefined && this.#options.keep(value)) {
        this.#kept.set(store.path, { head, value });
      } else this.#kept.delete(store.path);
    }
    // The heads are taken only once every moved store is read again, so a poll that fails on
    // the way finds the same stores moved next time.
    this.#failures = 0;
    this.#heads = read.heads;
    this.#status = { asOf: now };
    if (moved.length > 0 || gone.length > 0 || recovered) {
      this.#emit({
        type: "change",
        data: { stores: moved.map((store) => store.repository), asOf: now },
      });
    }
  }

  /** Every store's head: one query per Dolt server, and one `bd vc status` per embedded store. */
  async #readHeads(
    stores: readonly OpenStore[],
  ): Promise<{ ok: true; heads: Map<string, string> } | { ok: false; message: string }> {
    const heads = new Map<string, string>();
    const groups = new Map<string, { store: OpenStore; database: string }[]>();
    const alone: OpenStore[] = [];
    for (const store of stores) {
      const database = await storeDatabase(store.path);
      if (database === undefined) {
        alone.push(store);
        continue;
      }
      const group = groups.get(database.server) ?? [];
      group.push({ store, database: database.name });
      groups.set(database.server, group);
    }
    const failures: string[] = [];
    for (const group of groups.values()) {
      if (this.#listeners.size === 0) break;
      const [first] = group;
      if (first === undefined) continue;
      const result = await attempt(() =>
        first.store.bd.heads(group.map((entry) => entry.database)),
      );
      if (result.kind === "ok") {
        for (const [i, entry] of group.entries()) {
          const head = result.value[i];
          if (head !== undefined) heads.set(entry.store.path, head);
        }
      } else {
        // A database the server does not hold fails the whole query; each store then answers alone.
        alone.push(...group.map((entry) => entry.store));
      }
    }
    for (const store of alone) {
      // The last stream closed mid-poll: no bd starts once the feed is idle.
      if (this.#listeners.size === 0) break;
      const result = await attempt(() => store.bd.head());
      if (result.kind === "ok") heads.set(store.path, result.value);
      else if (result.kind !== "closed") {
        failures.push(`${store.repository}: ${failureText(result)}`);
      }
    }
    if (failures.length > 0) {
      return { ok: false, message: `the heads query failed: ${failures.join("; ")}` };
    }
    return { ok: true, heads };
  }
}
