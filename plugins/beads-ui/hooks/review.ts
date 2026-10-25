import {
  answerArgv,
  answerTurn,
  inPair,
  isRefresherToken,
  itemKey,
  LEASE_FILE,
  parseFileLease,
  parseReviewSnapshot,
  READER_PAGE_CHARS,
  REVIEW_WAKE_FILE,
  type ReviewItem,
  type ReviewSnapshot,
  readerPages,
  resolveReview,
  reviewFileName,
  showItemArgv,
  stateDirOf,
  WAKE_DIR,
  wakeText,
} from "../core/src/index.ts";
import type { Host } from "./host.ts";
import type { StoreResolver } from "./store.ts";

// Review items in the session (D-37, D-39, T-2C.5): the host refresher's review snapshot, read
// with `[review] command` from the user's own beads-ui.toml, and the reader that shows one item's
// body and records Sergei's answer through the held store's own verb.

const SHOW_TIMEOUT_MS = 15_000;
/** `held_cli.py answer` commits in a landing pad, its hooks with it. */
const ANSWER_TIMEOUT_MS = 120_000;
/** Where the reader writes an answer's text before `answer --text-file` reads it. */
export const ANSWERS_DIR = "answers";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const messageOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

/** What a held command printed when it refused: its JSON `detail`, else its stderr or stdout. */
function refusalOf(ran: { exitCode: number | null; stdout: string; stderr: string }): string {
  const json = parseJson(ran.stdout);
  const detail = isRecord(json) && typeof json.detail === "string" ? json.detail : undefined;
  const text = detail ?? (ran.stderr.trim() || ran.stdout.trim());
  const how = ran.exitCode === null ? "did not finish" : `exited ${ran.exitCode}`;
  return text === "" ? how : `${how}: ${text}`;
}

/**
 * The host's review snapshot, as the session reads it: `[review] command` from the user's own
 * file, then `review-<token>.json` of the refresher `lease.json` names. Read when a Detail loads.
 */
export class ReviewFeed {
  host: Host | undefined;
  /** The command, while `[review] command` is set. */
  command: string[] | undefined;
  snapshot: ReviewSnapshot | undefined;
  /** Why no snapshot is drawn while the command is set. */
  missing: string | undefined;
  /** Items answered from this pane since the snapshot was read, by path. */
  private readonly answered = new Map<string, string>();

  constructor(private readonly stores: StoreResolver) {}

  bind(host: Host): void {
    this.host = host;
  }

  get configured(): boolean {
    return this.command !== undefined;
  }

  /**
   * Every item inside the snapshot's pair (D-38: no session draws one from outside it), answered
   * ones from this pane marked so before the next snapshot shows it.
   */
  get items(): ReviewItem[] {
    const snapshot = this.snapshot;
    const items = snapshot === undefined ? [] : inPair(snapshot.items, snapshot);
    return items.map((item) => {
      const at = this.answered.get(item.path);
      return at === undefined || item.status !== "open"
        ? item
        : { ...item, status: "answered", answeredAt: at };
    });
  }

  /** What the section says beside its rows: why nothing was read, or the last run's failure. */
  get note(): string | undefined {
    return this.missing ?? this.snapshot?.error;
  }

  item(path: string): ReviewItem | undefined {
    return this.items.find((one) => one.path === path);
  }

  markAnswered(path: string, at: string): void {
    this.answered.set(path, at);
  }

  async load(): Promise<void> {
    const host = this.host;
    if (host === undefined) return;
    this.command = resolveReview(await this.stores.userConfigText()).command;
    if (this.command === undefined) {
      this.snapshot = undefined;
      this.missing = undefined;
      return;
    }
    const xdgStateHome = await host.stateHome().catch(() => undefined);
    const dir = stateDirOf({ xdgStateHome, home: this.stores.home });
    if (dir === undefined) {
      this.missing = "held items are not read: no state directory for the host refresher";
      return;
    }
    const lease = parseFileLease(
      (await host.readFile(`${dir}/${LEASE_FILE}`).catch(() => undefined)) ?? "",
    );
    const token = lease?.token;
    if (token === undefined || !isRefresherToken(token)) {
      this.missing = "held items are not read yet: the host refresher is not running";
      return;
    }
    const text = await host.readFile(`${dir}/${reviewFileName(token)}`).catch(() => undefined);
    const parsed = text === undefined ? undefined : parseReviewSnapshot(text);
    if (parsed?.ok !== true || parsed.value.token !== token) {
      this.missing =
        "held items are not read yet: the host refresher has written no review snapshot";
      return;
    }
    this.missing = undefined;
    if (parsed.value.fingerprint !== this.snapshot?.fingerprint) this.answered.clear();
    this.snapshot = parsed.value;
  }
}

/** What the reader's last action came to. */
export type ReaderOutcome =
  | { kind: "answered"; commit: string; turn: string }
  | { kind: "refused"; message: string }
  | { kind: "sent"; turn: string }
  | { kind: "empty" };

/** One item open in the reader (T-2C.5). */
export interface ReaderState {
  item: ReviewItem;
  /** The body's pages, once `show --json` answered. */
  pages: string[] | undefined;
  page: number;
  error: string | undefined;
  /** What the Answer control holds: kept when the answer is refused. */
  draft: string;
  busy: boolean;
  outcome: ReaderOutcome | undefined;
}

/**
 * The reader: an item's whole body from `show --json`, a page at a time; Answer, which writes the
 * text exactly as typed to a file in the state directory and runs `answer --text-file`, then
 * starts the fixed-template turn; and Send to session, which starts that turn with no answer
 * commit. Every command is `[review] command`'s program, run as an argument list.
 */
export class ReviewReader {
  host: Host | undefined;
  state: ReaderState | undefined;
  onChange: (() => void) | undefined;

  constructor(
    private readonly stores: StoreResolver,
    readonly feed: ReviewFeed,
  ) {}

  bind(host: Host): void {
    this.host = host;
  }

  private changed(): void {
    this.onChange?.();
  }

  async open(path: string): Promise<void> {
    const item = this.feed.item(path);
    const command = this.feed.command;
    if (item === undefined || command === undefined || this.host === undefined) return;
    this.state = {
      item,
      pages: undefined,
      page: 0,
      error: undefined,
      draft: "",
      busy: false,
      outcome: undefined,
    };
    this.changed();
    const ran = await this.host
      .run(showItemArgv(command, item.path), SHOW_TIMEOUT_MS)
      .catch((reason: unknown) => ({ exitCode: null, stdout: "", stderr: messageOf(reason) }));
    const state = this.state;
    if (state?.item.path !== item.path) return;
    const json = ran.exitCode === 0 ? parseJson(ran.stdout) : undefined;
    if (isRecord(json) && typeof json.body === "string") {
      state.pages = readerPages(json.body, READER_PAGE_CHARS);
    } else {
      state.error = `${item.path} could not be read: the show command ${ran.exitCode === 0 ? "printed no body" : refusalOf(ran)}`;
    }
    this.changed();
  }

  close(): void {
    this.state = undefined;
    this.changed();
  }

  step(delta: number): void {
    const state = this.state;
    if (state?.pages === undefined) return;
    state.page = Math.min(Math.max(0, state.page + delta), state.pages.length - 1);
    this.changed();
  }

  private async stateDir(): Promise<string | undefined> {
    const xdgStateHome = await this.host?.stateHome().catch(() => undefined);
    return stateDirOf({ xdgStateHome, home: this.stores.home });
  }

  /** The text, byte for byte as typed, to a file under the state directory; its path. */
  private async writeAnswer(item: ReviewItem, text: string): Promise<string | undefined> {
    const host = this.host;
    if (host === undefined) return undefined;
    const dir = await this.stateDir();
    if (dir === undefined) return undefined;
    const now = await host.now();
    const name = itemKey(item).replace(/[^A-Za-z0-9._-]/g, "_");
    const path = `${dir}/${ANSWERS_DIR}/${now}-${name}.txt`;
    await host.writeFile(path, text);
    return path;
  }

  async answer(text: string): Promise<void> {
    const state = this.state;
    const host = this.host;
    const command = this.feed.command;
    if (state === undefined || host === undefined || command === undefined || state.busy) return;
    state.draft = text;
    if (text.trim() === "") {
      state.outcome = { kind: "empty" };
      this.changed();
      return;
    }
    state.busy = true;
    state.outcome = undefined;
    this.changed();
    let outcome: ReaderOutcome;
    try {
      const file = await this.writeAnswer(state.item, text);
      if (file === undefined) {
        outcome = { kind: "refused", message: "no state directory to write the answer's file in" };
      } else {
        const ran = await host
          .run(answerArgv(command, state.item.path, file), ANSWER_TIMEOUT_MS)
          .catch((reason: unknown) => ({ exitCode: null, stdout: "", stderr: messageOf(reason) }));
        const json = ran.exitCode === 0 ? parseJson(ran.stdout) : undefined;
        if (isRecord(json) && json.status === "ok" && typeof json.commit === "string") {
          const turn = answerTurn({
            item: state.item,
            text,
            commit: json.commit,
            session: this.stores.sessionName,
          });
          const at = typeof json.answered_at === "string" ? json.answered_at : "";
          this.feed.markAnswered(state.item.path, at);
          state.item = { ...state.item, status: "answered", answeredAt: at };
          state.draft = "";
          // The refresher runs the review verb again at once, not at its next beat (D-37).
          const dir = await this.stateDir();
          if (dir !== undefined) {
            const now = await host.now();
            await host
              .writeFile(`${dir}/${WAKE_DIR}/${REVIEW_WAKE_FILE}`, wakeText(state.item.path, now))
              .catch(() => undefined);
          }
          await host.submit(turn).catch(() => undefined);
          outcome = { kind: "answered", commit: json.commit, turn };
        } else {
          outcome = {
            kind: "refused",
            message: `the answer was not recorded: the answer command ${ran.exitCode === 0 ? "printed no commit" : refusalOf(ran)}`,
          };
        }
      }
    } catch (reason) {
      outcome = { kind: "refused", message: `the answer was not recorded: ${messageOf(reason)}` };
    }
    if (this.state === state) {
      state.busy = false;
      state.outcome = outcome;
    }
    this.changed();
  }

  /** The same turn with the typed text and no answer commit: the session records it. */
  async send(): Promise<void> {
    const state = this.state;
    const host = this.host;
    if (state === undefined || host === undefined || state.busy) return;
    if (state.draft.trim() === "") {
      state.outcome = { kind: "empty" };
      this.changed();
      return;
    }
    const turn = answerTurn({
      item: state.item,
      text: state.draft,
      session: this.stores.sessionName,
    });
    await host.submit(turn).catch(() => undefined);
    state.outcome = { kind: "sent", turn };
    this.changed();
  }

  /** The text the Answer control holds, kept as it is typed so Send to session has it. */
  type(text: string): void {
    if (this.state !== undefined) this.state.draft = text;
  }
}
