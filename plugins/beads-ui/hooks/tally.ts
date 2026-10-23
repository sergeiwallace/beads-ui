import type { Timer } from "claude-code";

import {
  type BandRead,
  type BandStore,
  bandReads,
  clockStamp,
  countArgv,
  parseBdCount,
  parseStoreInventory,
  type Result,
  STORE_INVENTORY_FILE,
  type StoreCounts,
  storeName,
} from "../core/src/index.ts";
import type { Host } from "./host.ts";

/**
 * The band reads every store at most this often: up to two `bd count` calls a store, so a slower
 * beat than the pane's 10-second board read keeps a busy machine's many sessions affordable.
 */
export const TALLY_REFRESH_MS = 30_000;
const COUNT_TIMEOUT_MS = 8_000;

export interface Tallied {
  reads: BandRead[];
  /** Each read's answers, one per store, in the read's store order. */
  answers: StoreCounts[][];
  loadedAt: string;
}

const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";

/**
 * The counts behind the band above the prompt: which rows this session draws and each store's
 * `bd count` answer, read at session start and every 30 seconds. A refresh in which no store
 * answers keeps the last one that did, whose "as of" says how old it is.
 */
export class BandTally {
  host: Host | undefined;
  last: Tallied | undefined;
  private session: string | undefined;
  private home: string | undefined;
  private refreshing = false;
  private timer: Timer | undefined;

  async bind(host: Host): Promise<void> {
    this.host = host;
    const name = (await host.sessionName().catch(() => undefined))?.trim();
    this.session = name === undefined || name === "" ? undefined : name;
    const { home } = await host
      .configEnv()
      .catch(() => ({ xdgConfigHome: undefined, home: undefined }));
    this.home = home === undefined || home === "" ? undefined : home;
    this.timer?.cancel();
    this.timer = host.every(TALLY_REFRESH_MS, () => {
      void this.refresh();
    });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const host = this.host;
    if (host === undefined || this.refreshing) return;
    this.refreshing = true;
    try {
      const here: BandStore = { name: storeName(host.cwd), path: host.cwd, synced: false };
      const reads = bandReads({ session: this.session, here, inventory: await this.inventory() });
      const asked = new Map<string, Promise<StoreCounts>>();
      const answers: StoreCounts[][] = [];
      for (const read of reads) {
        const row: StoreCounts[] = [];
        for (const store of read.stores) {
          const key = `${store.path}\n${read.assignee ?? ""}`;
          const answer = asked.get(key) ?? this.count(store, read.assignee);
          asked.set(key, answer);
          row.push(await answer);
        }
        answers.push(row);
      }
      if (answers.flat().some((answer) => answer.ok) || this.last === undefined) {
        const ms = (await host.now().catch(() => undefined)) ?? 0;
        this.last = { reads, answers, loadedAt: clockStamp(ms, new Date(ms).getTimezoneOffset()) };
      }
    } finally {
      this.refreshing = false;
      host.invalidate();
    }
  }

  private async inventory(): Promise<Result<BandStore[], string>> {
    const host = this.host;
    if (host === undefined || this.home === undefined) {
      return { ok: false, error: "no home directory to find the store inventory in" };
    }
    const path = `${this.home.replace(/\/+$/, "")}/${STORE_INVENTORY_FILE}`;
    const text = await host.readFile(path).catch(() => undefined);
    if (text === undefined) return { ok: false, error: `no store inventory at ${path}` };
    return parseStoreInventory(text);
  }

  private async count(store: BandStore, assignee: string | undefined): Promise<StoreCounts> {
    const host = this.host;
    if (host === undefined) return { store: store.name, ok: false, error: "no session" };
    try {
      const ran = await host.runIn(store.path, countArgv(assignee), COUNT_TIMEOUT_MS);
      if (ran.exitCode !== 0) {
        const why = firstLine(ran.stderr) || firstLine(ran.stdout);
        const exit =
          ran.exitCode === null ? "timed out or could not start" : `exit ${ran.exitCode}`;
        return { store: store.name, ok: false, error: why === "" ? exit : `${exit}, ${why}` };
      }
      const counts = parseBdCount(ran.stdout);
      if (!counts.ok) {
        return {
          store: store.name,
          ok: false,
          error: `${counts.error.message} at ${counts.error.path}`,
        };
      }
      return { store: store.name, ok: true, counts: counts.value };
    } catch {
      return { store: store.name, ok: false, error: "timed out or could not start" };
    }
  }
}
