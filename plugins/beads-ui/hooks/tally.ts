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
  type FileLease,
  failureOf,
  type HostSnapshot,
  isRefresherToken,
  LEASE_FILE,
  LEASE_KEY,
  leaseOf,
  type PendingSubmit,
  parseFileLease,
  parseSnapshot,
  type ReadAnswer,
  refresherRunning,
  resolveSync,
  SESSIONS_DIR,
  SNAPSHOT_FILE,
  type StoreSnapshot,
  type SyncRun,
  type SyncSettings,
  SyncState,
  sameStore,
  sessionFileName,
  snapshotFileName,
  snapshotLive,
  stateDirOf,
  storeName,
  storeReads,
  storeSnapshotOf,
  supervise,
  syncArgv,
  WAKE_DIR,
  wakeFileName,
  wakeText,
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

/** 28 base-36 characters: always within the 8 to 64 the refresher accepts for `--token`. */
const randomToken = () =>
  Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(36)
      .padStart(7, "0"),
  ).join("");

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
  private queuedFinal = false;
  /**
   * The band's entry for the database of the store this session's pane reads: the main tree's,
   * for a session in a linked worktree.
   */
  private counted: BandStore | undefined;
  /** When this session last wrote, until the band has drawn a read of its store made after. */
  private wroteAt: number | undefined;
  private rechecks: Timer[] = [];
  /** The settings the band last drew with, for a redraw the publishing state asks for. */
  private drawnWith: BandSettings | undefined;
  /** The session's publishing state (T-2B.6): the unpublished count and the failure mark. */
  sync: SyncState | undefined;

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
  async refresh(options: { final?: boolean } = {}): Promise<void> {
    const host = this.host;
    if (host === undefined) return;
    if (this.refreshing) {
      this.queued = true;
      if (options.final === true) this.queuedFinal = true;
      return;
    }
    this.refreshing = true;
    try {
      const { resolution, inventory, config } = await this.stores.resolve();
      const settings = await this.settings.current(config.text);
      const here: BandStore | undefined = resolution.ok
        ? {
            name: storeName(resolution.path),
            path: resolution.path,
            synced: false,
            ...(resolution.prefix === undefined ? {} : { prefix: resolution.prefix }),
          }
        : undefined;
      const reads = bandReads({ session: this.stores.sessionName, here, inventory });
      const now = await host.now();
      const dir = await this.stateDir();
      const own = reads.flatMap((read) => read.stores);
      this.counted = here === undefined ? undefined : own.find((store) => sameStore(store, here));
      if (dir !== undefined && reads.length > 0) {
        await this.register(dir, now, settings, inventory.ok ? inventory.value : [], own, here);
      }
      const fileLease = dir === undefined ? undefined : await this.readLease(dir);
      const snapshot = dir === undefined ? undefined : await this.readSnapshot(dir, fileLease);
      const live = snapshotLive(snapshot, now);
      const running = refresherRunning(fileLease, now);
      let source: BandSource = "snapshot";
      if (!(live && running) && reads.length > 0) {
        const lease = leaseOf(await host.storeGet(LEASE_KEY).catch(() => undefined));
        let step = supervise({
          live,
          running,
          lease,
          heldBy: fileLease?.token,
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
        this.wroteAt = undefined;
      } else if (snapshot !== undefined) {
        const held = await this.withWindow(snapshot.stores, own, settings, now);
        const stores = await this.seenWrite(held, settings, now, options.final === true);
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
        const final = this.queuedFinal;
        this.queued = false;
        this.queuedFinal = false;
        void this.refresh({ final });
      }
    }
  }

  /**
   * A write this session made (a move, a create, an edit). The band redraws at once, and the
   * session drops a wake marker naming its store, so the refresher reads that store again within
   * a second or two; the band reads the snapshot again 3, 6 and 9 seconds on, and at the last, if
   * the snapshot still holds no read of the store made after the write, it reads that store's
   * counts itself. So the write shows within 10 seconds, not at the next minute (T-1B.5).
   */
  afterWrite(store: string): void {
    void this.wake(store);
  }

  /** `store` is the directory the write ran in: the marker names it, not the band's own store. */
  private async wake(store: string): Promise<void> {
    const host = this.host;
    if (host === undefined) return;
    const now = await host.now().catch(() => undefined);
    if (now === undefined) return;
    this.wroteAt = now;
    const dir = await this.stateDir();
    if (dir !== undefined && store.startsWith("/")) {
      await host
        .writeFile(`${dir}/${WAKE_DIR}/${wakeFileName(store)}`, wakeText(store, now))
        .catch(() => undefined);
    }
    void this.refresh();
    for (const timer of this.rechecks) timer.cancel();
    const last = WAKE_RECHECK_MS.length - 1;
    this.rechecks = WAKE_RECHECK_MS.map((ms, i) =>
      host.after(ms, () => {
        void this.refresh({ final: i === last });
      }),
    );
  }

  /**
   * After this session's write, the snapshot's counts of its store, once a read of it made after
   * the write is there; at the last recheck (`final`), this session's own read instead.
   */
  private async seenWrite(
    stores: StoreSnapshot[],
    settings: BandSettings,
    now: number,
    final: boolean,
  ): Promise<StoreSnapshot[]> {
    const wroteAt = this.wroteAt;
    const here = this.counted;
    if (wroteAt === undefined || here === undefined) return stores;
    const i = stores.findIndex((one) => samePath(one.path, here.path));
    if ((stores[i]?.readAt ?? Number.NEGATIVE_INFINITY) >= wroteAt) {
      this.wroteAt = undefined;
      return stores;
    }
    if (!final) return stores;
    this.wroteAt = undefined;
    const read = await this.readStore(here, storeReads([settings.doneWindow], now), now);
    if (!read.ok) return stores;
    return i < 0 ? [...stores, read] : stores.map((one, j) => (j === i ? read : one));
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

  /** The unpublished count or the failure mark changed: redraw from the counts held. */
  syncChanged(): void {
    if (this.drawnWith === undefined) return;
    this.draw(this.drawnWith);
    this.host?.invalidate();
  }

  private draw(settings: BandSettings): void {
    this.drawnWith = settings;
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
    // The session's own edits: on its own line, never the firstmate's totals over every owner.
    const own = {
      unpublished: this.sync?.unpublished ?? 0,
      syncFailed: this.sync?.failed ?? false,
    };
    this.lines = last.reads.map((read, i) =>
      bandLine(read, totals[i] ?? { counts: EMPTY, answered: 0, partial: true }, {
        settings,
        direct: last.source === "direct",
        readAt,
        width: Number.POSITIVE_INFINITY,
        ...(read.key === "all" ? {} : own),
      }),
    );
  }

  /**
   * The session's registry file: its done window and the stores it sums that the inventory does
   * not list, so the refresher counts those too (T-1B.1's mapped store), and the store its pane
   * reads, `here`, whose board snapshot the refresher keeps (T-1B.8).
   */
  private async register(
    dir: string,
    now: number,
    settings: BandSettings,
    listed: readonly BandStore[],
    own: readonly BandStore[],
    here: BandStore | undefined,
  ): Promise<void> {
    const id = this.stores.sessionName ?? this.anonId;
    const extra = own.filter((store) => !listed.some((known) => sameStore(known, store)));
    const named = ({ name, path, prefix }: BandStore) =>
      prefix === undefined ? { name, path } : { name, path, prefix };
    const entry = {
      id,
      seenAt: now,
      windows: [settings.doneWindow],
      stores: [...new Map(extra.map((store) => [store.path, store])).values()].map(named),
      boards: here === undefined ? [] : [named(here)],
    };
    await this.host
      ?.writeFile(`${dir}/${SESSIONS_DIR}/${sessionFileName(id)}`, `${JSON.stringify(entry)}\n`)
      .catch(() => undefined);
  }

  /**
   * The snapshot of the refresher `lease.json` names, written under its token: never another
   * token's, so a refresher ousted while it wrote cannot pass for the holder. With no lease (the
   * refresher stopped and a start is under way), the last one published, `counts.json`.
   */
  private async readSnapshot(
    dir: string,
    lease: FileLease | undefined,
  ): Promise<HostSnapshot | undefined> {
    const token = lease?.token;
    if (token !== undefined && !isRefresherToken(token)) return undefined;
    const file = token === undefined ? SNAPSHOT_FILE : snapshotFileName(token);
    const text = await this.host?.readFile(`${dir}/${file}`).catch(() => undefined);
    if (text === undefined) return undefined;
    const parsed = parseSnapshot(text);
    if (!parsed.ok || !isRefresherToken(parsed.value.token)) return undefined;
    return token === undefined || parsed.value.token === token ? parsed.value : undefined;
  }

  /** The refresher's file lease, renewed every 20 s while it runs: its liveness (T-1B.4). */
  private async readLease(dir: string): Promise<FileLease | undefined> {
    const text = await this.host?.readFile(`${dir}/${LEASE_FILE}`).catch(() => undefined);
    return text === undefined ? undefined : parseFileLease(text);
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

/** When the band reads the snapshot again after a write of its own. */
const WAKE_RECHECK_MS = [3_000, 6_000, 9_000];

const samePath = (a: string, b: string) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

const unique = (stores: readonly BandStore[]): BandStore[] => [
  ...new Map(stores.map((store) => [store.path, store])).values(),
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const messageOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

/**
 * Edits that publish themselves (D-33, T-2B.6). After a write the pane or the confirmation made,
 * and `sync.quiet_seconds` (10) with no other, it runs `sync.command` once for the store written,
 * as an argument list with no shell, one publish at a time. Exit 0 toasts `synced`. A failure
 * sends a terminal notification (a toast when none is sent) and starts a turn in the session
 * from core's template, unless the same store, step and exit code failed within 10 minutes; a
 * refused or dropped turn is sent again from `turn.complete`, at most 3 times. With no
 * `sync.command` in the user's beads-ui.toml, read at each call, it does nothing; a
 * repository's own beads-ui.toml never sets it.
 */
export class EditSync {
  host: Host | undefined;
  readonly state = new SyncState();
  /** The unpublished count or the failure mark changed: the band redraws. */
  onChange: (() => void) | undefined;
  private readonly timers = new Map<string, Timer>();

  constructor(private readonly stores: StoreResolver) {}

  bind(host: Host): void {
    this.host = host;
  }

  private async settings(): Promise<SyncSettings | undefined> {
    return resolveSync(await this.stores.userConfigText()).settings;
  }

  /** A write to the store at `store` succeeded. */
  wrote(store: string): void {
    void this.schedule(store).catch(() => undefined);
  }

  private async schedule(store: string): Promise<void> {
    const host = this.host;
    if (host === undefined || store === "") return;
    const settings = await this.settings();
    if (settings === undefined) return;
    const now = await host.now();
    const quietMs = settings.quietSeconds * 1000;
    this.state.wrote(store, now, quietMs);
    this.timers.get(store)?.cancel();
    this.timers.set(
      store,
      host.after(quietMs, () => {
        this.timers.delete(store);
        void this.pump().catch(() => undefined);
      }),
    );
    this.onChange?.();
  }

  /** Runs the publish now due, if no other is running; then the next one due. */
  private async pump(): Promise<void> {
    const host = this.host;
    if (host === undefined) return;
    const now = await host.now();
    const store = this.state.next(now);
    if (store === undefined) return;
    const settings = await this.settings().catch(() => undefined);
    if (settings === undefined) {
      this.state.forget(store);
      this.onChange?.();
      return this.pump();
    }
    const run: SyncRun = await host
      .runIn(store, syncArgv(settings.command, store), settings.timeoutSeconds * 1000)
      .then(
        (ran): SyncRun =>
          typeof ran.exitCode === "number"
            ? { exitCode: ran.exitCode, stdout: ran.stdout, stderr: ran.stderr }
            : { error: "it was ended by a signal" },
        (reason: unknown): SyncRun => ({ error: messageOf(reason) }),
      );
    const ended = await host.now().catch(() => now);
    const finished = this.state.finished(store, failureOf(store, settings.command, run), ended);
    const toast = (text: string) => {
      try {
        host.toast(text);
      } catch {
        // The engine refused the call (the session is ending).
      }
    };
    if (finished.kind === "synced") {
      toast(finished.text);
    } else {
      const sent = await host.notify(finished.notify).then(
        (answer) => isRecord(answer) && answer.isSent === true,
        () => false,
      );
      if (!sent) toast(finished.notify);
      if (finished.submit !== undefined) this.send(finished.submit, host.submit);
    }
    this.onChange?.();
    return this.pump();
  }

  private send(submit: PendingSubmit, via: (text: string) => Promise<unknown>): void {
    void via(submit.text)
      .then(
        (answer) => isRecord(answer) && answer.drop !== undefined,
        () => true,
      )
      .then((dropped) => {
        if (this.state.answered(submit.key, dropped) === "given-up") this.onChange?.();
      });
  }

  /** A turn ended: each refused or dropped submit goes again, through that hook's own submit. */
  turnComplete(via: (text: string) => Promise<unknown>): void {
    for (const submit of this.state.retries()) this.send(submit, via);
  }
}
