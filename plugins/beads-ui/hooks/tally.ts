import type { Timer } from "claude-code";

import {
  type BandLine,
  type BandRead,
  type BandSettings,
  type BandStore,
  BEAT_MS,
  bandLine,
  bandReads,
  bandTotal,
  clockStamp,
  type HostSnapshot,
  LEASE_KEY,
  leaseOf,
  parseSnapshot,
  type ReadAnswer,
  SESSIONS_DIR,
  SNAPSHOT_FILE,
  type StoreSnapshot,
  sessionFileName,
  snapshotLive,
  stateDirOf,
  storeName,
  storeReads,
  storeSnapshotOf,
  supervise,
} from "../core/src/index.ts";
import type { BandSettingsPanel } from "./bandSettings.ts";
import type { Host } from "./host.ts";
import type { StoreResolver } from "./store.ts";

const COUNT_TIMEOUT_MS = 8_000;
const START_TIMEOUT_MS = 15_000;
/** The refresher inside the plugin, from `$.plugin.root`. */
export const REFRESHER_PATH = "refresher/refresher.mjs";

const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";

/** Where the band's counts came from on its last read. */
export type BandSource = "snapshot" | "direct";

export interface Tallied {
  reads: BandRead[];
  /** Every store snapshot the lines sum, from the host snapshot or the session's own reads. */
  stores: StoreSnapshot[];
  source: BandSource;
  /** When the counts were read, as the surface clock's milliseconds. */
  readAt: number;
}

const randomToken = () =>
  Array.from({ length: 4 }, () => Math.floor(Math.random() * 0xffffffff).toString(36)).join("");

/**
 * The counts behind the band above the prompt (D-26, T-1B.4, T-1B.5). Once a minute, and at
 * session start, it registers the session in the host state directory, reads the host
 * refresher's snapshot and draws from it; when the snapshot is stale it starts the refresher
 * under a `$.store` lease, and when none can be started it reads its own counts directly and the
 * band marks them so. The band redraws only when this changes: once a minute, and once after a
 * write the session makes.
 */
export class BandTally {
  host: Host | undefined;
  last: Tallied | undefined;
  /** The last lines, as drawBand draws them. */
  lines: BandLine[] = [];
  private refreshing = false;
  private queued = false;
  private timer: Timer | undefined;
  /** The token of this session's lease whose refresher did not start. */
  private failedToken: string | undefined;
  private anonId = `anon-${randomToken()}`;

  /**
   * @param stores the session's store resolution, shared with the pane (D-24)
   * @param settings the band's settings: the config file's, with the pane's changes over them
   */
  constructor(
    private readonly stores: StoreResolver,
    private readonly settings: BandSettingsPanel,
  ) {}

  async bind(host: Host): Promise<void> {
    this.host = host;
    this.timer?.cancel();
    this.timer = host.every(BEAT_MS, () => {
      void this.refresh();
    });
    void this.refresh();
  }

  private async stateDir(): Promise<string | undefined> {
    const xdgStateHome = await this.host?.stateHome().catch(() => undefined);
    return stateDirOf({ xdgStateHome, home: this.stores.home });
  }

  /** The minute check: register, read the snapshot, supervise the refresher, draw. */
  async refresh(): Promise<void> {
    const host = this.host;
    if (host === undefined) return;
    if (this.refreshing) {
      this.queued = true;
      return;
    }
    this.refreshing = true;
    try {
      const { resolution, inventory, config } = await this.stores.resolve();
      const settings = await this.settings.current(config.text);
      const here: BandStore | undefined = resolution.ok
        ? { name: storeName(resolution.path), path: resolution.path, synced: false }
        : undefined;
      const reads = bandReads({ session: this.stores.sessionName, here, inventory });
      const now = await host.now();
      const dir = await this.stateDir();
      const own = reads.flatMap((read) => read.stores);
      if (dir !== undefined && reads.length > 0) {
        await this.register(dir, now, settings, inventory.ok ? inventory.value : [], own);
      }
      const snapshot = dir === undefined ? undefined : await this.readSnapshot(dir);
      const live = snapshotLive(snapshot, now);
      let source: BandSource = "snapshot";
      if (!live && reads.length > 0) {
        const lease = leaseOf(await host.storeGet(LEASE_KEY).catch(() => undefined));
        let step = supervise({
          live,
          lease,
          nowMs: now,
          startFailed: lease !== undefined && lease.token === this.failedToken,
        });
        if (step.kind === "start") step = await this.start(dir, now);
        if (step.kind === "direct") source = "direct";
      }
      if (reads.length === 0) {
        this.last = undefined;
      } else if (source === "direct") {
        this.last = { reads, stores: await this.readOwn(own, settings, now), source, readAt: now };
      } else if (snapshot !== undefined) {
        const stores = await this.withWindow(snapshot.stores, own, settings, now);
        this.last = { reads, stores, source, readAt: snapshot.beatAt };
      }
      // A start under way with no snapshot yet keeps whatever was drawn last.
      this.draw(settings);
    } catch {
      // The engine refused a call (the session is ending): the last lines stay.
    } finally {
      this.refreshing = false;
      host.invalidate();
      if (this.queued) {
        this.queued = false;
        void this.refresh();
      }
    }
  }

  /** A write this session made (a move, a create, an edit): the band redraws once more. */
  afterWrite(): void {
    void this.refresh();
  }

  /** The band's settings changed in the pane: redraw from the counts held, reading any missing. */
  async settingsChanged(): Promise<void> {
    const host = this.host;
    const last = this.last;
    if (host === undefined) return;
    try {
      const { config } = await this.stores.resolve();
      const settings = await this.settings.current(config.text);
      if (last !== undefined) {
        const own = last.reads.flatMap((read) => read.stores);
        const now = await host.now();
        this.last = { ...last, stores: await this.withWindow(last.stores, own, settings, now) };
      }
      this.draw(settings);
    } catch {
      // The engine refused a call: the last lines stay.
    }
    host.invalidate();
  }

  private draw(settings: BandSettings): void {
    const last = this.last;
    if (last === undefined) {
      this.lines = [];
      return;
    }
    const totals = last.reads.map((read) => bandTotal(read, last.stores, settings.doneWindow));
    if (!totals.some((total) => total.answered > 0)) {
      this.lines = [];
      return;
    }
    const readAt = clockStamp(last.readAt, new Date(last.readAt).getTimezoneOffset());
    this.lines = last.reads.map((read, i) =>
      bandLine(read, totals[i] ?? { counts: EMPTY, answered: 0, partial: true }, {
        settings,
        direct: last.source === "direct",
        readAt,
        width: Number.POSITIVE_INFINITY,
      }),
    );
  }

  /**
   * The session's registry file: its done window and the stores it sums that the inventory does
   * not list, so the refresher counts those too (T-1B.1's mapped store).
   */
  private async register(
    dir: string,
    now: number,
    settings: BandSettings,
    listed: readonly BandStore[],
    own: readonly BandStore[],
  ): Promise<void> {
    const id = this.stores.sessionName ?? this.anonId;
    const extra = own.filter((store) => !listed.some((known) => known.path === store.path));
    const entry = {
      id,
      seenAt: now,
      windows: [settings.doneWindow],
      stores: [...new Map(extra.map((store) => [store.path, store])).values()].map(
        ({ name, path }) => ({ name, path }),
      ),
    };
    await this.host
      ?.writeFile(`${dir}/${SESSIONS_DIR}/${sessionFileName(id)}`, `${JSON.stringify(entry)}\n`)
      .catch(() => undefined);
  }

  private async readSnapshot(dir: string): Promise<HostSnapshot | undefined> {
    const text = await this.host?.readFile(`${dir}/${SNAPSHOT_FILE}`).catch(() => undefined);
    if (text === undefined) return undefined;
    const parsed = parseSnapshot(text);
    return parsed.ok ? parsed.value : undefined;
  }

  /**
   * Takes the lease with a compare step (write this session's token, read it back, go on only
   * while it is still this session's), then starts the refresher with that token. A lost compare
   * waits for the winner's refresher; a start that fails reads this session's own counts.
   */
  private async start(dir: string | undefined, now: number) {
    const host = this.host;
    const home = this.stores.home;
    if (host === undefined || dir === undefined || home === undefined) {
      return { kind: "direct" } as const;
    }
    const token = randomToken();
    const taken = await host
      .storeSet(LEASE_KEY, { token, at: now })
      .then(() => host.storeGet(LEASE_KEY))
      .then(leaseOf)
      .catch(() => undefined);
    if (taken?.token !== token) return { kind: "wait" } as const;
    const argv = [
      "node",
      `${host.pluginRoot}/${REFRESHER_PATH}`,
      "start",
      "--state-dir",
      dir,
      "--home",
      home,
      "--token",
      token,
    ];
    const started = await host
      .stream(host.cwd, argv, START_TIMEOUT_MS)
      .then((ran) => ran.exitCode === 0)
      .catch(() => false);
    if (started) return { kind: "wait" } as const;
    this.failedToken = token;
    return { kind: "direct" } as const;
  }

  /** The fallback (T-1B.4): this session reads every store it sums itself, as the refresher does. */
  private async readOwn(
    stores: readonly BandStore[],
    settings: BandSettings,
    now: number,
  ): Promise<StoreSnapshot[]> {
    const read: StoreSnapshot[] = [];
    for (const store of unique(stores)) {
      read.push(await this.readStore(store, storeReads([settings.doneWindow], now), now));
    }
    return read;
  }

  /**
   * The snapshot's stores, with the done count of a window it does not hold yet (the window was
   * just changed) read by this session, so a change shows at once.
   */
  private async withWindow(
    held: readonly StoreSnapshot[],
    stores: readonly BandStore[],
    settings: BandSettings,
    now: number,
  ): Promise<StoreSnapshot[]> {
    const span = settings.doneWindow;
    const doneRead = storeReads([span], now).filter((read) => read.key.startsWith("done:"));
    const out = [...held];
    for (const store of unique(stores)) {
      const i = out.findIndex((one) => one.path === store.path);
      const one = out[i];
      if (one === undefined || !one.ok || one.done[span] !== undefined) continue;
      const done = await this.readStore(store, doneRead, now);
      if (done.ok) out[i] = { ...one, done: { ...one.done, ...done.done } };
    }
    return out;
  }

  private async readStore(
    store: BandStore,
    reads: ReturnType<typeof storeReads>,
    now: number,
  ): Promise<StoreSnapshot> {
    const answers: ReadAnswer[] = [];
    for (const read of reads) answers.push(await this.count(store, read.key, read.argv));
    return storeSnapshotOf(store, answers, now);
  }

  private async count(store: BandStore, key: string, argv: readonly string[]): Promise<ReadAnswer> {
    const host = this.host;
    if (host === undefined) return { key, ok: false, error: "no session" };
    try {
      const ran = await host.runIn(store.path, argv, COUNT_TIMEOUT_MS);
      if (ran.exitCode === 0) return { key, ok: true, stdout: ran.stdout };
      const why = firstLine(ran.stderr) || firstLine(ran.stdout);
      return {
        key,
        ok: false,
        error: why === "" ? `exit ${ran.exitCode}` : `exit ${ran.exitCode}, ${why}`,
      };
    } catch {
      return { key, ok: false, error: "timed out or could not start" };
    }
  }
}

const EMPTY = { in_progress: 0, blocked: 0, open: 0, done: 0 };

const unique = (stores: readonly BandStore[]): BandStore[] => [
  ...new Map(stores.map((store) => [store.path, store])).values(),
];
