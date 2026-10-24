import type { Elements, RenderElement, RenderNode, Timer } from "claude-code";

import {
  asOf,
  BACKLOG_PAGE_SIZE,
  type BacklogView,
  BOARD_PAGE_LIMIT,
  type BoardEvent,
  type BoardState,
  type BoardView,
  backlogView,
  boardView,
  type CardView,
  COMMANDS,
  clockStamp,
  createArgv,
  DEFAULT_CONFIG,
  DEFAULT_SORT,
  type DetailState,
  describeFilterError,
  detailView,
  type EditableField,
  EMPTY_FILTER_STATE,
  editArgv,
  FILTER_KEYS,
  type FilterState,
  footerHints,
  historyArgv,
  INITIAL_BOARD_STATE,
  type Issue,
  listArgv,
  nextSort,
  nextSwimlaneMode,
  openDetail,
  type PageView,
  type PendingDisplayId,
  parseBdCreatedId,
  parseBdHistoryEvents,
  parseBdList,
  parseBdReady,
  parseBdShow,
  parseBdStatuses,
  parseFieldEdit,
  parseQuickAdd,
  parseSort,
  parseSwimlaneMode,
  pendingDisplayIdStep,
  planDisplayId,
  planMove,
  type ResolvedConfig,
  readPendingDisplayIds,
  readyArgv,
  reduceBoard,
  reduceDetail,
  resolveConfig,
  type SortSpec,
  STATUS_CATEGORIES,
  type StoreResolution,
  type SwimlaneMode,
  showArgv,
  slugBudgets,
  sortLabel,
  statusesArgv,
  stepPage,
  storeLabel,
  submitFilter,
  TERMINAL_THEME,
  type Token,
  truncate,
  type UndoClose,
  undoArgv,
  undoForMove,
  undoView,
} from "../core/src/index.ts";
import type { Host } from "./host.ts";
import type { StoreResolver } from "./store.ts";

export const PANE_ID = "beads";
export const PANE_TITLE = "Beads";

/** An open nobody asked for is withdrawn below this width (T-1.6). */
export const NARROW_COLUMNS = 110;
export const NARROW_TEXT = `beads-ui did not open its pane: it needs a terminal at least ${NARROW_COLUMNS} columns wide. Widen the terminal or run /show-beads-ui.`;

/** Where the view preferences live in `$.store`. Issue data is never stored. */
export const PREFS_KEY = "view";
/**
 * Where display ids minted for a created issue wait in `$.store` until their write succeeds, so
 * a pane reopen or a new session retries the same id instead of leaving the issue without one.
 */
export const PENDING_IDS_KEY = "pending-display-ids";

/** The body the pane asks for, docked and inline; the person's own size wins. */
const WANTED_COLUMNS = 80;
const WANTED_ROWS = 24;

const READ_TIMEOUT_MS = 8_000;
/** What `$.process.run` keeps of each pipe: 4194304 bytes. */
const RUN_OUTPUT_LIMIT = "4 MiB";
const WRITE_TIMEOUT_MS = 15_000;

export type Tab = "board" | "backlog" | "detail";
const TABS: readonly { tab: Tab; label: string; hotkey: string }[] = [
  { tab: "board", label: "Board", hotkey: "1" },
  { tab: "backlog", label: "Backlog", hotkey: "2" },
  { tab: "detail", label: "Detail", hotkey: "4" },
];

/** The elements the pane draws with: every surface but mobile has them all. */
export type PaneUi = Pick<
  Elements["terminal"],
  "Box" | "Text" | "Button" | "Input" | "Select" | "Markdown" | "Code"
>;

export interface Prefs {
  tab: Tab;
  filter: string;
  swimlane: SwimlaneMode;
  sort: string;
  open: boolean;
}

type Ran =
  | { ok: true; exitCode: 0; stdout: string; stderr: string }
  | { ok: false; exitCode: number | null; stdout: string; stderr: string; message: string };

/** A `hint` notice names what to do next, so the next action that succeeds clears it. */
type Notice = { text: string; token: Token; hint?: true };

const FOCUS_HINT = "focus a card first: Tab moves between cards";

const messageOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** A mod `Text` colour for a semantic token (D-19). */
export function colorOf(token: Token): string {
  const color = TERMINAL_THEME[token];
  return color.kind === "theme" ? color.key : color.name;
}

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

/**
 * The `/show-beads-ui` pane: its state, the bd reads and writes behind each action, and its drawing. It
 * holds no `$`: register.ts binds it to a Host at session start. Every domain rule is core's.
 */
export class BeadsPane {
  host: Host | undefined;
  isOpen = false;
  board: BoardState = INITIAL_BOARD_STATE;
  readyIds: ReadonlySet<string> | undefined;
  filter: FilterState = EMPTY_FILTER_STATE;
  tab: Tab = "board";
  swimlane: SwimlaneMode = "none";
  sort: SortSpec = DEFAULT_SORT;
  config: ResolvedConfig = { config: DEFAULT_CONFIG, problems: [] };
  detailId: string | undefined;
  detail: DetailState | undefined;
  detailError: string | undefined;
  undo: UndoClose | undefined;
  notice: Notice | undefined;
  focusedId: string | undefined;
  help = false;
  quickAddText = "";
  /** Set at session start when the pane was open last time; resolved once the width is known. */
  autoOpenPending = false;
  /** The delete confirmation, wired by register.ts. */
  onDelete: ((issue: Issue, issues: readonly Issue[]) => void) | undefined;
  /** Display ids minted after a create whose write has not succeeded, retried on each refresh. */
  pendingIds: PendingDisplayId[] = [];
  /** The last failed write of each pending display id, by issue id. */
  private pendingErrors: Record<string, string> = {};
  /** The page each board cell shows, by core's cellKey. */
  cellPages: Record<string, number> = {};
  lanePage = 0;
  unplacedPage = 0;
  backlogPage = 0;
  /** The body width the pane last drew at, for the page steps that run between draws. */
  private width = WANTED_COLUMNS;

  /** The store the pane reads (D-24), from the last refresh; undefined before the first. */
  store: StoreResolution | undefined;
  /** True while the pane has stepped aside for the delete confirmation. */
  private suspended = false;
  private refreshing = false;
  private queued = false;
  private timer: Timer | undefined;
  private timerMs = 0;

  /** @param stores the session's store resolution, shared with the band (D-24) */
  constructor(private readonly stores: StoreResolver) {}

  async bind(host: Host): Promise<void> {
    this.host = host;
    await this.loadPrefs();
    void this.refresh();
  }

  // ---- view preferences -------------------------------------------------------------------

  private async loadPrefs(): Promise<void> {
    const pending = await this.host?.storeGet(PENDING_IDS_KEY).catch(() => undefined);
    for (const entry of readPendingDisplayIds(pending)) {
      if (!this.pendingIds.some((known) => known.id === entry.id)) this.pendingIds.push(entry);
    }
    const stored = await this.host?.storeGet(PREFS_KEY).catch(() => undefined);
    if (!isRecord(stored)) return;
    const tab = TABS.find((candidate) => candidate.tab === stored.tab)?.tab;
    if (tab !== undefined) this.tab = tab;
    if (typeof stored.filter === "string") {
      this.filter = submitFilter(EMPTY_FILTER_STATE, stored.filter);
    }
    if (typeof stored.swimlane === "string") {
      const mode = parseSwimlaneMode(stored.swimlane);
      if (mode.ok) this.swimlane = mode.value;
    }
    if (typeof stored.sort === "string") {
      const sort = parseSort(stored.sort);
      if (sort.ok) this.sort = sort.value;
    }
    this.autoOpenPending = stored.open === true;
  }

  private savePrefs(): void {
    const prefs: Prefs = {
      tab: this.tab,
      filter: this.filter.text,
      swimlane: this.swimlane,
      sort: sortLabel(this.sort),
      open: this.isOpen,
    };
    void this.host?.storeSet(PREFS_KEY, prefs).catch(() => undefined);
  }

  private savePending(): void {
    const pending = this.pendingIds.map(({ id, displayId }) => ({ id, displayId }));
    void this.host?.storeSet(PENDING_IDS_KEY, pending).catch(() => undefined);
  }

  /**
   * Retries each pending display id against the store as just read: the same id again, never a
   * second one; an issue that now carries an id, or is gone, drops it (D-9). bd has no
   * compare-and-set on metadata, so the write runs only when a `bd show` of that one issue, read
   * just before it, still finds no id; an unreadable show writes nothing and keeps it pending.
   */
  private async retryPendingIds(): Promise<void> {
    const done = new Set<string>();
    let wrote = false;
    for (const pending of [...this.pendingIds]) {
      let step = pendingDisplayIdStep(pending, this.board.issues);
      if (step.kind === "write") {
        const shown = await this.run(showArgv(pending.id), READ_TIMEOUT_MS);
        const parsed = shown.ok ? parseBdShow(shown.stdout) : undefined;
        const issue =
          parsed?.ok === true ? parsed.value.find((one) => one.id === pending.id) : undefined;
        if (issue === undefined) {
          this.pendingErrors[pending.id] = shown.ok
            ? `re-reading it failed: bd show ${pending.id} returned nothing beads-ui can read`
            : this.failure("re-reading it", shown);
          continue;
        }
        step = pendingDisplayIdStep(pending, [issue]);
      }
      if (step.kind === "kept") {
        this.note(
          `${pending.id} already carries ${step.existing}; ${pending.displayId} was not written`,
          "warning",
        );
      } else if (step.kind === "write") {
        const ran = await this.run(step.argv, WRITE_TIMEOUT_MS);
        if (!ran.ok) {
          this.pendingErrors[pending.id] = this.failure("writing its display id", ran);
          continue;
        }
        wrote = true;
        this.note(`wrote ${pending.displayId} for ${pending.id}`, "success");
      }
      delete this.pendingErrors[pending.id];
      done.add(pending.id);
    }
    if (done.size > 0) {
      this.pendingIds = this.pendingIds.filter((pending) => !done.has(pending.id));
      this.savePending();
    }
    if (wrote) this.queued = true;
  }

  // ---- bd ---------------------------------------------------------------------------------

  /**
   * One bd call. `streamed` reads it through `$.process.spawn`, for a read whose output can pass
   * the 4 MiB `$.process.run` keeps; a `$.process.run` read cut at that limit is a failure.
   */
  private async run(
    argv: readonly string[],
    timeoutMs: number,
    { streamed = false }: { streamed?: boolean } = {},
  ): Promise<Ran> {
    const host = this.host;
    if (host === undefined) {
      return { ok: false, exitCode: null, stdout: "", stderr: "", message: "no session" };
    }
    try {
      const dir = this.storePath();
      const result = streamed
        ? await host.stream(dir, argv, timeoutMs)
        : await host.runIn(dir, argv, timeoutMs);
      if ("isStdoutTruncated" in result && result.isStdoutTruncated === true) {
        return {
          ok: false,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          message: `its output passed the ${RUN_OUTPUT_LIMIT} $.process.run keeps and was cut short`,
        };
      }
      if (result.exitCode === 0) {
        return { ok: true, exitCode: 0, stdout: result.stdout, stderr: result.stderr };
      }
      return {
        ok: false,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        message: result.stderr.trim() || result.stdout.trim(),
      };
    } catch (reason) {
      return { ok: false, exitCode: null, stdout: "", stderr: "", message: messageOf(reason) };
    }
  }

  private failure(what: string, ran: Ran): string {
    if (ran.ok) return "";
    const detail = ran.message === "" ? "" : `: ${ran.message}`;
    if (ran.exitCode === 0) return `${what} failed${detail}`;
    const how = ran.exitCode === null ? "timed out or could not start" : `exit ${ran.exitCode}`;
    return `${what} failed (${how})${detail}`;
  }

  /** The directory bd runs in: the resolved store's, else the session's own. */
  storePath(): string {
    return this.store?.ok === true ? this.store.path : (this.host?.cwd ?? "");
  }

  /** Resolves the session's store (D-24) and reads its settings, both at call time. */
  private async readConfig(): Promise<ResolvedConfig> {
    if (this.host === undefined) return this.config;
    const { resolution, config, problems } = await this.stores.resolve();
    this.store = resolution;
    const resolved = resolveConfig(config.text, this.storePath());
    return { ...resolved, problems: [...resolved.problems, ...problems] };
  }

  private retime(): void {
    const host = this.host;
    const ms = this.config.config.refreshSeconds * 1000;
    if (host === undefined || ms === this.timerMs) return;
    this.timer?.cancel();
    this.timerMs = ms;
    this.timer = host.every(ms, () => {
      void this.refresh();
    });
  }

  private dispatch(event: BoardEvent): void {
    this.board = reduceBoard(this.board, event);
  }

  private async stamp(): Promise<string> {
    const ms = (await this.host?.now().catch(() => undefined)) ?? 0;
    return clockStamp(ms, new Date(ms).getTimezoneOffset());
  }

  /**
   * One read set: `bd statuses` and `bd list`, plus `bd ready` and the open Detail's `bd show` and
   * `bd history --events` while the pane is open. A failed or timed-out read keeps the last good
   * board, and the next refresh tries again.
   */
  async refresh(): Promise<void> {
    if (this.host === undefined) return;
    if (this.refreshing) {
      this.queued = true;
      return;
    }
    this.refreshing = true;
    try {
      this.config = await this.readConfig();
      this.retime();
      // No store resolved: the pane says what it tried, and no bd read runs until one does.
      if (this.store?.ok !== true) return;
      const full = this.isOpen;
      const [statuses, list, ready] = await Promise.all([
        this.run(statusesArgv(), READ_TIMEOUT_MS),
        this.run(listArgv(), READ_TIMEOUT_MS, { streamed: true }),
        full ? this.run(readyArgv(), READ_TIMEOUT_MS) : Promise.resolve(undefined),
      ]);
      const loaded = this.applyReads(statuses, list, await this.stamp());
      if (loaded) await this.retryPendingIds();
      if (ready?.ok === true) {
        const parsed = parseBdReady(ready.stdout);
        if (parsed.ok) this.readyIds = new Set(parsed.value.map((issue) => issue.id));
      }
      for (const id of this.board.refresh) {
        const shown = await this.run(showArgv(id), READ_TIMEOUT_MS);
        const parsed = shown.ok ? parseBdShow(shown.stdout) : undefined;
        const issue = parsed?.ok === true ? parsed.value.find((one) => one.id === id) : undefined;
        if (issue !== undefined) this.dispatch({ type: "issue-refreshed", issue });
      }
      if (full && this.detailId !== undefined) await this.loadDetail(this.detailId);
      if (this.undo !== undefined) {
        const undone = this.board.issues.find((issue) => issue.id === this.undo?.id);
        if (undone !== undefined && undone.status !== this.undo.closed) this.undo = undefined;
      }
    } finally {
      this.refreshing = false;
      this.host?.invalidate();
      if (this.queued) {
        this.queued = false;
        void this.refresh();
      }
    }
  }

  /** Applies one read set; true when the store's issues loaded. */
  private applyReads(statuses: Ran, list: Ran, at: string): boolean {
    if (!list.ok) {
      this.dispatch({ type: "load-failed", exitCode: list.exitCode, message: list.message });
      return false;
    }
    const issues = parseBdList(list.stdout);
    if (!issues.ok) {
      this.dispatch({
        type: "load-failed",
        exitCode: list.exitCode,
        message: `${issues.error.message} at ${issues.error.path}`,
      });
      return false;
    }
    const parsedStatuses = statuses.ok ? parseBdStatuses(statuses.stdout) : undefined;
    const known = parsedStatuses?.ok === true ? parsedStatuses.value : this.board.statuses;
    if (known.length === 0) {
      this.dispatch({
        type: "load-failed",
        command: "bd statuses",
        exitCode: statuses.ok ? 0 : statuses.exitCode,
        message: !statuses.ok
          ? statuses.message
          : parsedStatuses?.ok === false
            ? `${parsedStatuses.error.message} at ${parsedStatuses.error.path}`
            : "it listed no statuses",
      });
      return false;
    }
    this.dispatch({ type: "load-succeeded", issues: issues.value, statuses: known, at });
    return true;
  }

  // ---- opening and closing ----------------------------------------------------------------

  /** `/show-beads-ui` and `/bu`: close the open pane, else open it, as the person asked. */
  async toggle(): Promise<void> {
    if (this.isOpen) {
      await this.close();
      return;
    }
    await this.open(true);
  }

  /**
   * Opens the pane. One the person asked for follows Claude Code's placement; one the mod opens
   * on its own (`asked` false) is withdrawn with a toast when the engine holds it unplaced.
   */
  async open(asked: boolean): Promise<void> {
    const host = this.host;
    if (host === undefined) throw new Error("beads-ui has no session yet");
    const opened = await host.openPane({
      id: PANE_ID,
      title: PANE_TITLE,
      closeOnEscape: true,
      columns: WANTED_COLUMNS,
      rows: WANTED_ROWS,
      ...(asked ? { focus: true as const } : {}),
    });
    if (!asked && isRecord(opened) && opened.isPlaced === false) {
      await host.closePane(PANE_ID).catch(() => undefined);
      host.toast(NARROW_TEXT);
      return;
    }
    this.isOpen = true;
    this.savePrefs();
    void this.refresh();
  }

  async close(): Promise<void> {
    await this.host?.closePane(PANE_ID);
    this.closed();
  }

  /** The pane closed, by `/show-beads-ui` or by the person (Esc, the close mark). */
  closed(): void {
    this.isOpen = false;
    this.savePrefs();
  }

  /**
   * The terminal's width, as the band's drawing measured it. A pane left open last session
   * reopens on its own, unless the terminal is narrower than NARROW_COLUMNS: then a toast names
   * the width and no pane is drawn.
   */
  measured(columns: number): void {
    if (!this.autoOpenPending || this.host === undefined) return;
    this.autoOpenPending = false;
    if (this.isOpen) return;
    if (columns < NARROW_COLUMNS) {
      this.host.toast(NARROW_TEXT);
      return;
    }
    void this.open(false).catch(() => undefined);
  }

  // ---- actions ----------------------------------------------------------------------------

  private note(text: string, token: Token = "text.default"): void {
    this.notice = { text, token };
  }

  private hint(text: string): void {
    this.notice = { text, token: "warning", hint: true };
  }

  /** An action succeeded or the tab changed: a hint it answered no longer applies. */
  private clearHint(): void {
    if (this.notice?.hint === true) this.notice = undefined;
  }

  /** A card's Move to: the guarded write, shown at once and rolled back on exit 13 (T-1.1). */
  async move(id: string, to: string): Promise<void> {
    const plan = planMove(this.board, id, to);
    if (!plan.ok) {
      if (plan.error.kind !== "same-status") this.note(plan.error.message, "error");
      this.host?.invalidate();
      return;
    }
    const issue = this.board.issues.find((candidate) => candidate.id === id);
    const from = issue?.status ?? "";
    this.notice = undefined;
    this.undo = undefined;
    this.dispatch(plan.value.event);
    this.host?.invalidate();
    const ran = await this.run(plan.value.argv, WRITE_TIMEOUT_MS);
    if (ran.ok) {
      this.dispatch({ type: "move-succeeded", id });
      this.undo = undoForMove(this.board.statuses, {
        id,
        label: issue?.displayId ?? id,
        from,
        to,
      });
    } else {
      this.dispatch({
        type: "move-failed",
        id,
        exitCode: ran.exitCode ?? -1,
        message: ran.message,
      });
    }
    await this.refresh();
  }

  /** Quick-add (T-1.4): `bd create`, then the display id when the store uses them. */
  async quickAdd(line: string): Promise<void> {
    const parsed = parseQuickAdd(line);
    if (!parsed.ok) {
      this.quickAddText = line;
      this.note(parsed.error.message, "error");
      this.host?.invalidate();
      return;
    }
    this.undo = undefined;
    this.config = await this.readConfig();
    if (this.store?.ok !== true) {
      this.quickAddText = line;
      this.host?.invalidate();
      return;
    }
    const created = await this.run(createArgv(parsed.value), WRITE_TIMEOUT_MS);
    if (!created.ok) {
      this.quickAddText = line;
      this.note(this.failure("bd create", created), "error");
      await this.refresh();
      return;
    }
    this.quickAddText = "";
    const id = parseBdCreatedId(created.stdout);
    if (!id.ok) {
      this.note(
        `bd create succeeded but its output was unreadable: ${id.error.message}`,
        "warning",
      );
      await this.refresh();
      return;
    }
    const budgetEnv = await this.host
      ?.slugBudgetEnv()
      .catch(() => ({ body: undefined, child: undefined }));
    const plan = planDisplayId({
      policy: this.config.config.idPolicy,
      issues: this.board.issues,
      createdId: id.value,
      title: parsed.value.title,
      child: false,
      random: Math.random,
      budgets: slugBudgets(budgetEnv ?? {}),
    });
    if (!plan.ok) {
      this.note(`created ${id.value}; no display id: ${plan.error.message}`, "warning");
    } else if (plan.value.kind === "attach") {
      const attached = await this.run(plan.value.argv, WRITE_TIMEOUT_MS);
      if (attached.ok) {
        this.note(`created ${id.value} as ${plan.value.displayId}`, "success");
      } else {
        const failure = this.failure("writing its display id", attached);
        this.pendingIds = [
          ...this.pendingIds.filter((pending) => pending.id !== id.value),
          { id: id.value, displayId: plan.value.displayId },
        ];
        this.pendingErrors[id.value] = failure;
        this.savePending();
        this.note(`created ${id.value}; ${failure}`, "warning");
      }
    } else {
      this.note(`created ${id.value}`, "success");
    }
    await this.refresh();
  }

  submitFilter(text: string): void {
    this.filter = submitFilter(this.filter, text);
    this.clearHint();
    this.resetPages();
    this.savePrefs();
    this.host?.invalidate();
  }

  /** A new filter, swimlane or sort reorders every list, so each starts again at its first page. */
  private resetPages(): void {
    this.cellPages = {};
    this.lanePage = 0;
    this.unplacedPage = 0;
    this.backlogPage = 0;
  }

  /** Steps one board cell's page (or the unplaced cards', key `unplaced`), wrapping at the ends. */
  stepCell(key: string, delta: number): void {
    const view = this.boardViewAt(this.width);
    const page =
      key === view.unplacedPage.key
        ? view.unplacedPage
        : view.lanes.flatMap((lane) => lane.pages).find((candidate) => candidate.key === key);
    if (page === undefined) return;
    this.clearHint();
    const next = stepPage(page.page, page.pages, delta);
    if (key === view.unplacedPage.key) this.unplacedPage = next;
    else this.cellPages = { ...this.cellPages, [key]: next };
    this.host?.invalidate();
  }

  /** Steps the lane page, wrapping at the ends. */
  stepLanes(delta: number): void {
    const { lanePage } = this.boardViewAt(this.width);
    this.lanePage = stepPage(lanePage.page, lanePage.pages, delta);
    this.clearHint();
    this.host?.invalidate();
  }

  /**
   * `p` and `b`: on the Board the next or previous page of the focused card's cell, on the
   * Backlog of the list. The focused card or row leaves the drawing, so the focus ring moves onto
   * the new page's first one instead of falling back to the prompt.
   */
  async stepFocusedPage(delta: number): Promise<void> {
    if (this.tab === "backlog") {
      await this.stepBacklog(delta, true);
      return;
    }
    const view = this.boardViewAt(this.width);
    const id = this.focusedId;
    const cells = [
      ...view.lanes.flatMap((lane) =>
        lane.cells.map((cards, i) => ({ cards, page: lane.pages[i] })),
      ),
      { cards: view.unplaced, page: view.unplacedPage },
    ];
    const cell = cells.find(({ cards }) => cards.some((card) => card.id === id));
    if (cell?.page === undefined) {
      this.hint(FOCUS_HINT);
      this.host?.invalidate();
      return;
    }
    this.stepCell(cell.page.key, delta);
    const after = this.boardViewAt(this.width);
    const drawn =
      cell.page.key === after.unplacedPage.key
        ? after.unplaced
        : after.lanes.flatMap(
            (lane) => lane.cells[lane.pages.findIndex((p) => p.key === cell.page?.key)] ?? [],
          );
    const first = drawn[0];
    if (first === undefined) return;
    this.focusedId = first.id;
    // The card's detail button, not its Move to: a focused Select reads a letter as type-ahead,
    // so the next p would pick an option instead of stepping the page. m reaches the Move to.
    await this.host?.focus(PANE_ID, `open:${first.id}`).catch(() => undefined);
  }

  /**
   * Switches tab. The focus ring moves onto the tab's own button, which every tab draws: left on
   * an element the new tab does not draw (a card's detail button), the ring and the keyboard
   * would fall back to the prompt.
   */
  setTab(tab: Tab): void {
    this.tab = tab;
    this.clearHint();
    this.savePrefs();
    this.host?.invalidate();
    void this.host?.focus(PANE_ID, `tab:${tab}`).catch(() => undefined);
  }

  cycleSwimlane(): void {
    this.swimlane = nextSwimlaneMode(this.swimlane);
    this.clearHint();
    this.resetPages();
    this.savePrefs();
    this.host?.invalidate();
  }

  cycleSort(): void {
    this.sort = nextSort(this.sort);
    this.clearHint();
    this.resetPages();
    this.savePrefs();
    this.host?.invalidate();
  }

  toggleHelp(): void {
    this.help = !this.help;
    this.clearHint();
    this.host?.invalidate();
  }

  /** The pane's focus ring moved onto an element: a card's own controls name the card. */
  focused(element: string | undefined): void {
    const match = element === undefined ? null : /^(?:move|open|row):(.+)$/.exec(element);
    if (match?.[1] !== undefined) this.focusedId = match[1];
  }

  /** The issue `d`, `m` and `x` act on: the focused card, or on the Detail tab its issue. */
  private target(): string | undefined {
    return this.tab === "detail" ? this.detailId : this.focusedId;
  }

  async focusMove(): Promise<void> {
    const id = this.focusedId;
    if (id === undefined) {
      this.hint(FOCUS_HINT);
      this.host?.invalidate();
      return;
    }
    this.clearHint();
    if (this.tab !== "board") this.setTab("board");
    this.host?.invalidate();
    await this.host?.focus(PANE_ID, `move:${id}`).catch(() => undefined);
  }

  async focusQuickAdd(): Promise<void> {
    this.clearHint();
    if (this.tab === "detail") this.setTab("board");
    this.host?.invalidate();
    await this.host?.focus(PANE_ID, "quickadd").catch(() => undefined);
  }

  async openDetailFor(id: string | undefined = this.target()): Promise<void> {
    if (id === undefined) {
      this.hint(FOCUS_HINT);
      this.host?.invalidate();
      return;
    }
    this.focusedId = id;
    this.detailId = id;
    this.detail = undefined;
    this.detailError = undefined;
    this.setTab("detail");
    await this.loadDetail(id);
    this.host?.invalidate();
  }

  private async loadDetail(id: string): Promise<void> {
    const [shown, history] = await Promise.all([
      this.run(showArgv(id), READ_TIMEOUT_MS),
      this.run(historyArgv(id), READ_TIMEOUT_MS),
    ]);
    if (this.detailId !== id) return;
    const issue = shown.ok ? parseBdShow(shown.stdout) : undefined;
    const first = issue?.ok === true ? issue.value.find((one) => one.id === id) : undefined;
    if (first === undefined) {
      this.detailError = shown.ok
        ? `bd show ${id} returned nothing beads-ui can read`
        : this.failure(`bd show ${id}`, shown);
      return;
    }
    const events = history.ok ? parseBdHistoryEvents(history.stdout) : undefined;
    const list = events?.ok === true ? events.value : [];
    this.detailError = history.ok ? undefined : this.failure(`bd history ${id}`, history);
    this.detail =
      this.detail === undefined || this.detail.issue.id !== id
        ? openDetail(first, list)
        : reduceDetail(this.detail, { type: "reread", issue: first, events: list });
  }

  /** An edited Detail field (T-1.3): `bd update`, then the issue is re-read before it redraws. */
  async edit(field: EditableField, text: string): Promise<void> {
    const detail = this.detail;
    if (detail === undefined) return;
    const parsed = parseFieldEdit(field, text);
    const argv = parsed.ok ? editArgv(detail.issue, parsed.value) : parsed;
    if (!argv.ok) {
      this.detailError = argv.error.message;
      this.host?.invalidate();
      return;
    }
    this.undo = undefined;
    this.detailError = undefined;
    this.clearHint();
    this.detail = reduceDetail(detail, { type: "edit-submitted", field });
    this.host?.invalidate();
    const ran = await this.run(argv.value, WRITE_TIMEOUT_MS);
    if (this.detail === undefined) return;
    if (!ran.ok) {
      this.detail = reduceDetail(this.detail, {
        type: "edit-failed",
        exitCode: ran.exitCode ?? -1,
        message: ran.message,
      });
      this.host?.invalidate();
      return;
    }
    this.detail = reduceDetail(this.detail, { type: "edit-succeeded" });
    await this.loadDetail(detail.issue.id);
    await this.refresh();
  }

  requestDelete(): void {
    const id = this.target();
    const issue =
      this.board.issues.find((candidate) => candidate.id === id) ??
      (this.detail?.issue.id === id ? this.detail?.issue : undefined);
    if (issue === undefined) {
      this.hint(FOCUS_HINT);
      this.host?.invalidate();
      return;
    }
    this.undo = undefined;
    this.clearHint();
    this.onDelete?.(issue, this.board.issues);
  }

  /**
   * Steps aside for the delete confirmation. Claude Code gives an opening pane the keyboard only
   * while the prompt holds it, so the confirmation opens focused only once this pane has closed.
   */
  async suspend(): Promise<void> {
    if (!this.isOpen) return;
    this.suspended = true;
    this.isOpen = false;
    await this.host?.closePane(PANE_ID).catch(() => undefined);
  }

  /** Comes back after the confirmation, focused, as the person's press asked. */
  async resume(): Promise<void> {
    if (!this.suspended) return;
    this.suspended = false;
    await this.open(true).catch(() => undefined);
  }

  /** The confirmation finished: a Close instead leaves its undo here, then the board reloads. */
  afterConfirm(text: string, undo: UndoClose | undefined): void {
    this.note(text, "success");
    this.undo = undo;
    if (this.suspended) void this.resume();
    else void this.refresh();
  }

  async undoClose(): Promise<void> {
    const undo = this.undo;
    if (undo === undefined) return;
    this.undo = undefined;
    const ran = await this.run(undoArgv(undo), WRITE_TIMEOUT_MS);
    this.note(
      ran.ok
        ? `${undo.label} is back to ${undo.previous}`
        : ran.exitCode === 13
          ? `${undo.label} changed elsewhere since it was closed; nothing was undone`
          : this.failure("the undo", ran),
      ran.ok ? "success" : "warning",
    );
    await this.refresh();
  }

  // ---- drawing ----------------------------------------------------------------------------

  draw(ui: PaneUi, width: number, helpRegion?: RenderElement): RenderElement {
    const { Box, Text } = ui;
    if (this.host === undefined) {
      return Box({ children: [Text({ children: "beads-ui starts with the session." })] });
    }
    this.width = width;
    if (this.store?.ok === false) return this.drawNoStore(ui, this.store);
    const { groups, groupWidth } = this.layout(width);
    const view = this.boardViewAt(width);
    const body =
      this.tab === "board"
        ? this.drawBoard(ui, view, groups, groupWidth)
        : this.tab === "backlog"
          ? this.drawBacklog(ui, width)
          : this.drawDetail(ui, width);
    const paged =
      this.tab === "backlog"
        ? this.backlogViewAt(width).page.pages > 1
        : this.tab === "board" &&
          (view.unplacedPage.pages > 1 ||
            view.lanes.some((lane) => lane.pages.some((page) => page.pages > 1)));
    return Box({
      flexDirection: "column",
      children: present<RenderNode>([
        this.drawHeader(ui),
        this.drawToolbar(ui, paged),
        ...this.drawLines(ui, width, view),
        this.help ? this.drawHelp(ui, helpRegion) : undefined,
        this.tab === "detail" ? undefined : this.drawInputs(ui),
        body,
        Box({
          key: "footer",
          children: [Text({ dimColor: true, children: footerHints("card").join(" · ") })],
        }),
      ]),
    });
  }

  /** The board's column groups and the width each gets. */
  private layout(width: number): { groups: string[]; groupWidth: number } {
    const groups = STATUS_CATEGORIES.filter((category) =>
      this.board.statuses.some((status) => status.category === category),
    );
    const gaps = Math.max(0, groups.length - 1);
    const groupWidth = Math.max(12, Math.floor((width - gaps) / Math.max(1, groups.length)));
    return { groups, groupWidth };
  }

  /** The board as core pages it, at the pages the person stepped to. */
  private boardViewAt(width: number): BoardView {
    return boardView(this.board, {
      columnWidth: this.layout(width).groupWidth - 1,
      swimlane: this.swimlane,
      softWipLimit: this.config.config.softWipLimit,
      filter: this.filter.filter,
      sort: this.sort,
      pageLimit: BOARD_PAGE_LIMIT,
      pages: this.cellPages,
      lanePage: this.lanePage,
      unplacedPage: this.unplacedPage,
      ...(this.readyIds === undefined ? {} : { readyIds: this.readyIds }),
    });
  }

  private line(ui: PaneUi, key: string, text: string, token: Token): RenderElement {
    return ui.Box({ key, children: [ui.Text({ color: colorOf(token), children: text })] });
  }

  private drawHeader(ui: PaneUi): RenderElement {
    const { Box, Text, Button } = ui;
    const resolved = this.store?.ok === true;
    return Box({
      key: "header",
      flexDirection: "row",
      gap: 2,
      children: [
        ...TABS.map(({ tab, label, hotkey }) =>
          Button({
            key: `tab:${tab}`,
            label,
            hotkey,
            plain: true,
            ...(this.tab === tab ? {} : { dimColor: true }),
            onPress: () => this.setTab(tab),
          }),
        ),
        Text({
          wrap: "truncate-end",
          children: [
            Text({
              bold: true,
              children: truncate(this.store === undefined ? "" : storeLabel(this.store), 40),
            }),
            "  ",
            Text({
              dimColor: true,
              children: !resolved
                ? ""
                : this.board.loadedAt === undefined
                  ? "loading…"
                  : asOf(this.board.loadedAt),
            }),
          ],
        }),
      ],
    });
  }

  /** D-24's empty state: what the pane looked for, and the line that points it at a store. */
  private drawNoStore(ui: PaneUi, store: Extract<StoreResolution, { ok: false }>): RenderElement {
    const { Box, Text } = ui;
    return Box({
      flexDirection: "column",
      children: present<RenderNode>([
        this.drawHeader(ui),
        ...this.config.problems.map((problem, i) =>
          this.line(ui, `config:${i}`, problem, "warning"),
        ),
        this.notice === undefined
          ? undefined
          : this.line(ui, "notice", this.notice.text, this.notice.token),
        Box({
          key: "no-store",
          flexDirection: "column",
          children: [
            Text({ bold: true, children: "beads-ui found no Beads store for this session." }),
            ...store.tried.map((line) => Text({ children: `- ${line}` })),
            ...store.fix.map((line, i) =>
              i === 0
                ? Text({ children: line })
                : Text({ color: colorOf("accent"), children: `  ${line}` }),
            ),
          ],
        }),
      ]),
    });
  }

  private drawToolbar(ui: PaneUi, paged: boolean): RenderElement {
    const { Box, Button } = ui;
    const button = (key: string, label: string, hotkey: string, onPress: () => void) =>
      Button({ key, label, hotkey, plain: true, onPress });
    return Box({
      key: "toolbar",
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: 2,
      children: present([
        button("swimlane", `Swimlane: ${this.swimlane}`, "s", () => this.cycleSwimlane()),
        button("sort", `Sort: ${sortLabel(this.sort)}`, "o", () => this.cycleSort()),
        button("new", "New", "n", () => void this.focusQuickAdd()),
        button("detail", "Detail", "d", () => void this.openDetailFor()),
        button("move", "Move to", "m", () => void this.focusMove()),
        button("delete", "Delete", "x", () => this.requestDelete()),
        this.undo === undefined
          ? undefined
          : button("undo", "Undo close", "u", () => void this.undoClose()),
        paged
          ? button("page-next", "Next page", "p", () => void this.stepFocusedPage(1))
          : undefined,
        paged
          ? button("page-back", "Page back", "b", () => void this.stepFocusedPage(-1))
          : undefined,
        button("help", "Help", "h", () => this.toggleHelp()),
      ]),
    });
  }

  private drawLines(ui: PaneUi, width: number, view: BoardView): RenderElement[] {
    const filterLine =
      this.filter.error === undefined ? view.filterLine : describeFilterError(this.filter.error);
    return present([
      ...this.config.problems.map((problem, i) => this.line(ui, `config:${i}`, problem, "warning")),
      view.errorLine === undefined
        ? undefined
        : this.line(ui, "error-line", view.errorLine, "error"),
      view.conflictLine === undefined
        ? undefined
        : this.line(ui, "conflict-line", view.conflictLine, "conflict"),
      filterLine === undefined ? undefined : this.line(ui, "filter-line", filterLine, "warning"),
      this.notice === undefined
        ? undefined
        : this.line(ui, "notice", this.notice.text, this.notice.token),
      ...this.pendingIds.map((pending) => {
        const error = this.pendingErrors[pending.id];
        return this.line(
          ui,
          `pending-id:${pending.id}`,
          `${pending.id} has no display id yet${error === undefined ? "" : ` (${error})`}; writing ${pending.displayId} again on the next refresh`,
          "warning",
        );
      }),
      this.undo === undefined
        ? undefined
        : this.line(ui, "undo-line", undoView(this.undo, width).line, "accent"),
    ]);
  }

  private drawInputs(ui: PaneUi): RenderElement {
    const { Box, Input } = ui;
    return Box({
      key: "inputs",
      flexDirection: "column",
      children: [
        Input({
          key: "filter",
          label: "Filter",
          placeholder: FILTER_KEYS.map((key) => `${key}:`).join(" "),
          value: this.filter.text,
          submitLabel: "filter",
          onSubmit: (value) => this.submitFilter(value),
        }),
        Input({
          key: "quickadd",
          label: "New",
          placeholder: "title p0-p4 type:task @assignee +label due:YYYY-MM-DD sprint:name",
          value: this.quickAddText,
          submitLabel: "create",
          onSubmit: (value) => void this.quickAdd(value),
        }),
      ],
    });
  }

  private drawHelp(ui: PaneUi, helpRegion: RenderElement | undefined): RenderElement {
    const { Box, Text } = ui;
    const keys = COMMANDS.map((command) => {
      const { binding } = command;
      const key =
        binding.kind === "hotkey" ? binding.key : binding.kind === "input" ? binding.hint : "Esc";
      const scope =
        command.scope === "card"
          ? " (focused card)"
          : command.scope === "confirm"
            ? " (delete confirmation)"
            : "";
      return `${key}: ${command.label}${scope}`;
    });
    return Box({
      key: "help",
      flexDirection: "column",
      borderStyle: "round",
      paddingX: 1,
      children: present<RenderNode>([
        Text({ bold: true, children: "Keys" }),
        ...keys.map((text) => Text({ children: text })),
        Text({
          children:
            "Tab walks the controls; on a card, Move to opens with Enter and the arrows pick a status.",
        }),
        Text({
          children: "Quick-add: title words plus p0-p4, type:, @assignee, +label, due:, sprint:",
        }),
        Text({ children: `Filter keys: ${FILTER_KEYS.join(", ")}` }),
        Box({
          key: "columns",
          children: [Text({ children: `Columns: ${STATUS_CATEGORIES.join(", ")}` })],
        }),
        helpRegion,
      ]),
    });
  }

  private drawCard(ui: PaneUi, card: CardView): RenderElement {
    const status = this.board.issues.find((issue) => issue.id === card.id)?.status ?? "";
    const { Box, Text, Select, Button } = ui;
    return Box({
      key: `card:${card.id}`,
      flexDirection: "column",
      marginBottom: 1,
      children: [
        Text({ dimColor: true, children: card.displayId }),
        Text({ children: card.title }),
        Text({
          color: colorOf(card.priorityToken),
          children: `${card.priority}${card.assignee === "" ? "" : ` ${card.assignee}`}${card.pending ? " moving…" : ""}`,
        }),
        Select({
          key: `move:${card.id}`,
          label: "Move to",
          options: [status, ...card.moveTargets].map((value) => ({ value })),
          value: status,
          onSelect: (value) => void this.move(card.id, value),
        }),
        Button({
          key: `open:${card.id}`,
          label: "detail",
          plain: true,
          dimColor: true,
          onPress: () => void this.openDetailFor(card.id),
        }),
      ],
    });
  }

  private drawBoard(
    ui: PaneUi,
    view: BoardView,
    groups: readonly string[],
    groupWidth: number,
  ): RenderElement {
    const { Box, Text, Button } = ui;
    if (view.loading) {
      return Box({
        key: "board",
        children: [Text({ dimColor: true, children: "reading the store…" })],
      });
    }
    const lanes = view.lanes.map((lane) =>
      Box({
        key: `lane:${lane.key === "" ? "-" : lane.key}`,
        flexDirection: "column",
        children: present<RenderNode>([
          lane.label === ""
            ? undefined
            : Text({ bold: true, underline: true, children: lane.label }),
          Box({
            flexDirection: "row",
            gap: 1,
            children: groups.map((category) =>
              Box({
                key: `group:${lane.key}:${category}`,
                flexDirection: "column",
                width: groupWidth,
                children: view.columns.flatMap((column, i) => {
                  if (column.category !== category) return [];
                  const cards = lane.cells[i] ?? [];
                  const page = lane.pages[i];
                  return present<RenderNode>([
                    Box({
                      key: `column:${lane.key}:${column.status}`,
                      children: [
                        Text({ bold: true, color: colorOf(column.token), children: column.label }),
                      ],
                    }),
                    ...cards.map((card) => this.drawCard(ui, card)),
                    page === undefined ? undefined : this.drawPager(ui, page),
                  ]);
                }),
              }),
            ),
          }),
        ]),
      }),
    );
    const unplaced =
      view.unplaced.length === 0
        ? undefined
        : Box({
            key: "unplaced",
            flexDirection: "column",
            children: present<RenderNode>([
              Text({ bold: true, children: "Statuses bd statuses did not list" }),
              ...view.unplaced.map((card) => this.drawCard(ui, card)),
              this.drawPager(ui, view.unplacedPage),
            ]),
          });
    const { lanePage, columnWindow } = view;
    const columnsText =
      columnWindow === undefined
        ? ""
        : `, columns ${columnWindow.from}-${columnWindow.to} of ${columnWindow.total}`;
    const lanePager =
      lanePage.pages === 1
        ? undefined
        : Box({
            key: "lane-pager",
            flexDirection: "row",
            columnGap: 1,
            children: [
              Button({
                key: "lanes-back",
                label: "back",
                plain: true,
                onPress: () => this.stepLanes(-1),
              }),
              Text({
                dimColor: true,
                children: `lanes ${lanePage.from}-${lanePage.to} of ${lanePage.total}${columnsText}`,
              }),
              Button({
                key: "lanes-next",
                label: "more lanes",
                hotkey: "l",
                plain: true,
                onPress: () => this.stepLanes(1),
              }),
            ],
          });
    return Box({
      key: "board",
      flexDirection: "column",
      children: present([lanePager, ...lanes, unplaced]),
    });
  }

  /**
   * A paged cell's controls: back, the range drawn, and more. Both wrap round, so both stay drawn
   * and a press keeps the focus ring on the control it pressed.
   */
  private drawPager(ui: PaneUi, page: PageView): RenderElement | undefined {
    if (page.pages === 1) return undefined;
    const { Box, Text, Button } = ui;
    return Box({
      key: `pager:${page.key}`,
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: 1,
      children: [
        Button({
          key: `prev:${page.key}`,
          label: page.page === 0 ? "last page" : "back",
          plain: true,
          dimColor: true,
          onPress: () => this.stepCell(page.key, -1),
        }),
        Text({ dimColor: true, children: `${page.from}-${page.to} of ${page.total}` }),
        Button({
          key: `next:${page.key}`,
          label: page.to < page.total ? `+${page.total - page.to} more` : "first page",
          plain: true,
          onPress: () => this.stepCell(page.key, 1),
        }),
      ],
    });
  }

  /** The Backlog's column widths at a body width. */
  private backlogLayout(width: number): { wide: boolean; idWidth: number; titleWidth: number } {
    const wide = width >= 90;
    const idWidth = Math.min(32, Math.max(10, Math.floor(width * (wide ? 0.28 : 0.3))));
    const fixed = wide ? 3 + idWidth + 8 + 12 + 10 + 8 + 6 : 3 + idWidth + 6 + 3;
    return { wide, idWidth, titleWidth: Math.max(10, width - fixed) };
  }

  /** The Backlog as core pages it, at the page the person stepped to. */
  private backlogViewAt(width: number): BacklogView {
    const { idWidth, titleWidth } = this.backlogLayout(width);
    return backlogView(this.board.issues, {
      statuses: this.board.statuses,
      filter: this.filter,
      sort: this.sort,
      titleWidth,
      idWidth,
      pageSize: BACKLOG_PAGE_SIZE,
      page: this.backlogPage,
      ...(this.readyIds === undefined ? {} : { readyIds: this.readyIds }),
    });
  }

  /**
   * Steps the Backlog's page, wrapping at the ends. When `refocus`, the focus ring moves onto the
   * new page's first row, as the row that held it is no longer drawn.
   */
  async stepBacklog(delta: number, refocus = false): Promise<void> {
    const { page } = this.backlogViewAt(this.width);
    this.backlogPage = stepPage(page.page, page.pages, delta);
    this.clearHint();
    this.host?.invalidate();
    const first = this.backlogViewAt(this.width).rows[0];
    if (!refocus || first === undefined) return;
    this.focusedId = first.id;
    await this.host?.focus(PANE_ID, `open:${first.id}`).catch(() => undefined);
  }

  private drawBacklog(ui: PaneUi, width: number): RenderElement {
    const { Box, Text, Button } = ui;
    const { wide, idWidth } = this.backlogLayout(width);
    const view = this.backlogViewAt(width);
    const { page } = view;
    return Box({
      key: "backlog",
      flexDirection: "column",
      children: present<RenderNode>([
        Box({
          key: "backlog-count",
          children: [
            Text({
              dimColor: true,
              children: `${page.total} of ${view.total} open issues, ${sortLabel(this.sort)} order`,
            }),
          ],
        }),
        ...view.rows.map((row) =>
          Box({
            key: `row:${row.id}`,
            flexDirection: "row",
            gap: 1,
            children: [
              Text({ color: colorOf(row.priorityToken), children: row.priority }),
              Box({
                width: idWidth,
                children: [Text({ dimColor: true, wrap: "truncate-end", children: row.displayId })],
              }),
              ...(wide
                ? [Box({ width: 8, children: [Text({ children: truncate(row.type, 8) })] })]
                : []),
              Box({
                flexGrow: 1,
                children: [Text({ wrap: "truncate-end", children: row.title })],
              }),
              ...(wide
                ? [
                    Text({
                      children: truncate(row.assignee === "" ? "" : `@${row.assignee}`, 12),
                    }),
                    Text({ dimColor: true, children: row.created }),
                  ]
                : []),
              Button({
                key: `open:${row.id}`,
                label: "detail",
                plain: true,
                dimColor: true,
                onPress: () => void this.openDetailFor(row.id),
              }),
            ],
          }),
        ),
        page.pages === 1
          ? undefined
          : Box({
              key: "backlog-pager",
              flexDirection: "row",
              columnGap: 1,
              children: [
                Button({
                  key: "backlog-back",
                  label: page.page === 0 ? "last page" : "back",
                  plain: true,
                  dimColor: true,
                  onPress: () => void this.stepBacklog(-1),
                }),
                Text({ dimColor: true, children: `rows ${page.from}-${page.to} of ${page.total}` }),
                Button({
                  key: "backlog-next",
                  label: page.to < page.total ? `+${page.total - page.to} more` : "first page",
                  plain: true,
                  onPress: () => void this.stepBacklog(1),
                }),
              ],
            }),
      ]),
    });
  }

  private drawDetail(ui: PaneUi, width: number): RenderElement {
    const { Box, Text, Input, Select, Markdown } = ui;
    const id = this.detailId;
    if (id === undefined) {
      return Box({
        key: "detail",
        children: [
          Text({
            dimColor: true,
            children:
              "No issue open: Tab to a card's detail button and press Enter, or focus a card and press d.",
          }),
        ],
      });
    }
    const errorLine =
      this.detailError === undefined
        ? undefined
        : this.line(ui, "detail-error", this.detailError, "error");
    if (this.detail === undefined) {
      return Box({
        key: "detail",
        flexDirection: "column",
        children: present([errorLine ?? Text({ dimColor: true, children: `reading ${id}…` })]),
      });
    }
    const wide = width >= 90;
    const left = wide ? Math.floor(width * 0.45) : width;
    const view = detailView(this.detail, { issues: this.board.issues, width: left - 14 });
    const statuses = this.board.statuses.map((status) => ({ value: status.name }));
    // A control's own label shares its row with the value, and on a narrow pane a long value
    // squeezes it and cuts it in two (Claude Code 2.1.306, 53 columns). So the label is drawn
    // beside the control in a Box that never shrinks, and the control carries none.
    const labelled = (editable: EditableField, label: string, control: RenderElement) =>
      Box({
        key: `edit-row:${editable}`,
        flexDirection: "row",
        gap: 1,
        children: [
          Box({
            key: `label:${editable}`,
            flexShrink: 0,
            children: [Text({ children: `${label}:` })],
          }),
          control,
        ],
      });
    const fields = view.fields.map((field) => {
      const raw = field.raw ?? field.value;
      const editable = field.editable;
      if (editable === "status" && statuses.length > 0) {
        return labelled(
          editable,
          field.label,
          Select({
            key: "edit:status",
            options: statuses.some((option) => option.value === raw)
              ? statuses
              : [{ value: raw }, ...statuses],
            value: raw,
            onSelect: (value) => void this.edit("status", value),
          }),
        );
      }
      if (editable === "priority") {
        return labelled(
          editable,
          field.label,
          Select({
            key: "edit:priority",
            options: [0, 1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${p}` })),
            value: raw,
            onSelect: (value) => void this.edit("priority", value),
          }),
        );
      }
      if (editable !== undefined) {
        return labelled(
          editable,
          field.label,
          Input({
            key: `edit:${editable}`,
            value: raw,
            ...(editable === "description"
              ? { placeholder: "one line: \\n is a line break, \\\\ a backslash" }
              : {}),
            submitLabel: "save",
            onSubmit: (value) => void this.edit(editable, value),
          }),
        );
      }
      return Box({
        key: `field:${field.key}`,
        children: [Text({ children: `${field.label}: ${field.value}` })],
      });
    });
    return Box({
      key: "detail",
      flexDirection: "column",
      children: present<RenderNode>([
        Box({ key: "detail-heading", children: [Text({ bold: true, children: view.heading })] }),
        view.savingLine === undefined
          ? undefined
          : this.line(ui, "detail-saving", view.savingLine, "text.dim"),
        view.errorLine === undefined
          ? undefined
          : this.line(ui, "detail-save-error", view.errorLine, "error"),
        errorLine,
        Box({
          flexDirection: wide ? "row" : "column",
          gap: wide ? 2 : 1,
          children: [
            Box({ key: "detail-fields", flexDirection: "column", width: left, children: fields }),
            Box({
              key: "detail-text",
              flexDirection: "column",
              flexGrow: 1,
              children: view.markdown.flatMap((block) => [
                Text({ bold: true, children: block.label }),
                Markdown({ key: `md:${block.key}`, text: block.text }),
              ]),
            }),
          ],
        }),
        Text({ bold: true, children: `Dependencies (${view.dependencies.length})` }),
        ...view.dependencies.map((dep) =>
          Box({
            key: `dep:${dep.id}`,
            children: [
              Text({
                children: truncate(
                  `${dep.displayId}  ${dep.status}  ${dep.type}  ${dep.title}`,
                  width,
                ),
              }),
            ],
          }),
        ),
        Text({ bold: true, children: `History, last ${view.events.length}` }),
        ...view.events.map((event, i) =>
          Box({
            key: `event:${i}`,
            children: [
              Text({
                dimColor: true,
                children: truncate(
                  `${event.at}  ${event.actor}  ${event.type}  ${event.summary}`,
                  width,
                ),
              }),
            ],
          }),
        ),
      ]),
    });
  }
}
