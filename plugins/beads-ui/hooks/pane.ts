import type { Elements, RenderElement, RenderNode, Timer } from "claude-code";

import {
  type ActionContext,
  asOf,
  BACKLOG_PAGE_SIZE,
  type BacklogView,
  BOARD_PAGE_LIMIT,
  type BoardEntry,
  type BoardEvent,
  type BoardState,
  type BoardView,
  backlogView,
  boardFileName,
  boardPath,
  boardReadArgvs,
  boardView,
  buttonWidth,
  type CardView,
  COMMANDS,
  clockStamp,
  createArgv,
  DEFAULT_BAND_SETTINGS,
  DEFAULT_CONFIG,
  DEFAULT_SORT,
  type DetailState,
  DIRECT_GLYPH,
  describeFilterError,
  detailView,
  type EditableField,
  EMPTY_FILTER_STATE,
  editArgv,
  FILTER_KEYS,
  type FilterState,
  footerHints,
  groupLayout,
  historyArgv,
  hotkeyOf,
  INITIAL_BOARD_STATE,
  type Issue,
  isCollapseRule,
  isFirstmate,
  isPanelMode,
  isPanelView,
  isRefresherToken,
  isShort,
  LEASE_FILE,
  MAX_SHOWN,
  type MenuView,
  menuView,
  type NavLayout,
  navLayout,
  nextSort,
  nextSwimlaneMode,
  openDetail,
  PARTIAL_GLYPH,
  type PageView,
  type PanelView,
  type PendingDisplayId,
  type PlannedView,
  packRows,
  panelActions,
  parseBdCreatedId,
  parseBdHistoryEvents,
  parseBdList,
  parseBdReady,
  parseBdShow,
  parseBdStatuses,
  parseBoardSnapshot,
  parseFieldEdit,
  parseFileLease,
  parseIssueRows,
  parseQuickAdd,
  parseShownCount,
  parseSnapshot,
  parseSort,
  parseStatusesJson,
  parseSwimlaneMode,
  parseTaskMessage,
  pendingDisplayIdStep,
  planDisplayId,
  planMove,
  plannedText,
  type ResolvedConfig,
  readPendingDisplayIds,
  readyArgv,
  reduceBoard,
  reduceDetail,
  refresherRunning,
  resolveConfig,
  SHORT_ROWS,
  SNAPSHOT_FILE,
  type SortSpec,
  STALE_MS,
  STATUS_CATEGORIES,
  type StoreResolution,
  type SwimlaneMode,
  settingsView,
  showArgv,
  showsTasks,
  slugBudgets,
  snapshotFileName,
  sortLabel,
  stateDirOf,
  statusesArgv,
  stepPage,
  storeLabel,
  submitFilter,
  type TaskClientProps,
  type TaskListView,
  TERMINAL_THEME,
  TIMELINE_TYPES,
  type Token,
  taskClientProps,
  taskListView,
  textWidth,
  tierOf,
  timelineLayout,
  timelinePlacement,
  timelineReadArgvs,
  timelineView,
  truncate,
  type UndoClose,
  undoArgv,
  undoForMove,
  undoView,
  withPanelTable,
} from "../core/src/index.ts";
import type { BandSettingsPanel } from "./bandSettings.ts";
import type { Host } from "./host.ts";
import {
  drawFrame,
  drawMenu,
  drawSettings,
  drawTaskList,
  drawTimeline,
  menuColumns,
  menuRows,
  PanelSettingsState,
  rowControlColumns,
  settingsOptionRoom,
  TASKS_CLIENT_KEY,
  type TaskListClient,
} from "./panel.ts";
import type { StoreResolver } from "./store.ts";

export const PANE_ID = "beads";
export const PANE_TITLE = "Beads";

/**
 * Claude Code places a pane nobody asked for only from UNASKED_COLUMNS terminal columns, and from
 * NARROW_COLUMNS once the person has opened it; below that it holds the open unplaced.
 */
export const UNASKED_COLUMNS = 144;
export const NARROW_COLUMNS = 110;
/** The toast when Claude Code holds the session-start open unplaced (T-2B.7, D-32). */
export const NARROW_TEXT = `beads-ui did not open its task panel: Claude Code opens a pane nobody asked for from ${UNASKED_COLUMNS} terminal columns, or ${NARROW_COLUMNS} once you have opened it. Widen the terminal or run /bu.`;
/** The one toast when Claude Code's task panel is retired and panel.mode is native (D-32 point 3). */
export const NO_PANEL_TEXT =
  "No task panel is enabled: Claude Code's task panel is retired here and beads-ui's panel.mode is native. Set Panel mode to beads in the pane's Settings (/bu, then 6), or mode = \"beads\" under [panel] in beads-ui.toml.";

/** Where the view preferences live in `$.store`. Issue data is never stored. */
export const PREFS_KEY = "view";
/**
 * Where display ids minted for a created issue wait in `$.store` until their write succeeds, so
 * a pane reopen or a new session retries the same id instead of leaving the issue without one.
 */
export const PENDING_IDS_KEY = "pending-display-ids";
/**
 * Where each session's Mine or All choice lives in `$.store` (D-29), by session name, so one
 * session's choice never changes another's default.
 */
export const SCOPE_KEY = "view-scope";

/** Mine draws the issues assigned to the session; All draws every issue (D-29). */
export type Scope = "mine" | "all";

/** The body the pane asks for, docked and inline; the person's own size wins. */
const WANTED_COLUMNS = 80;
const WANTED_ROWS = 24;

/** At short height, the rows the nav, the header, the toolbar and the list's summary take. */
const SHORT_CHROME_ROWS = 6;
/**
 * The most task rows the Tasks view draws at once: Claude Code keeps only a tree's first 100,000
 * characters, so a longer list draws a window of rows that follows the focus.
 */
export const TASK_WINDOW_ROWS = 100;
/**
 * The rows the Timeline's chrome takes besides the nav: the header, the toolbar, the footer, and
 * the view's count, axis, above, undated heading and below lines.
 */
const TIMELINE_CHROME_ROWS = 9;

const READ_TIMEOUT_MS = 8_000;
/** What `$.process.run` keeps of each pipe: 4194304 bytes. */
const RUN_OUTPUT_LIMIT = "4 MiB";
const WRITE_TIMEOUT_MS = 15_000;

/** The views the nav opens (T-2B.1); Sprint is planned and never opens. */
export type Tab = Exclude<PanelView, PlannedView>;
/** D-28: tab 3 is the Sprint view Phase 2 builds; until then pressing it says so and stays put. */
export const SPRINT_PLANNED_TEXT = plannedText("sprint");
/** The view the pane opens on when no view was kept (T-2B.2): the task panel. */
export const DEFAULT_TAB: Tab = "tasks";
const isTab = (value: unknown): value is Tab => isPanelView(value) && value !== "sprint";
/** The issue types a Detail's Type list offers, with every type the store's issues carry. */
export const ISSUE_TYPES: readonly string[] = ["task", "bug", "feature", "epic", "chore"];

/** What the pane is drawn into: its body's width and rows, and where it sits (T-1B.9). */
export interface PaneFrame {
  width: number;
  placement: string;
  bodyRows?: number;
  /** The props' own bodyColumns, which pick the nav's tier (T-2B.1); `width` when not given. */
  bodyColumns?: number;
}

/** The elements the pane draws with: every surface but mobile has them all. */
export type PaneUi = Pick<
  Elements["terminal"],
  "Box" | "Text" | "Button" | "Input" | "Select" | "Markdown" | "Code"
>;

/**
 * Draws the task list's Client (T-2B.5) where the surface has one: register.ts names the module,
 * since Claude Code reads a Client's module path off the hooks module's source.
 */
export type TasksRegion = (props: TaskClientProps, width: number, height: number) => RenderElement;

/** The terminal's Raster (T-2B.9): a grid of coloured cells; no other surface draws one. */
export type RasterElement = Elements["terminal"]["Raster"];

export interface Prefs {
  /** The open view; `tab`, which held 0.4.0's board-first tab, is no longer read. */
  view: Tab;
  filter: string;
  swimlane: SwimlaneMode;
  sort: string;
}

type Ran = (
  | { ok: true; exitCode: 0; stdout: string; stderr: string }
  | { ok: false; exitCode: number | null; stdout: string; stderr: string; message: string }
) & {
  /** The directory bd ran in: the store a write landed in, whatever the pane reads by now. */
  dir: string;
};

/** A `hint` notice names what to do next, so the next action that succeeds clears it. */
type Notice = { text: string; token: Token; hint?: true };

const FOCUS_HINT = "focus a card first: Tab moves between cards";
const TASK_FOCUS_HINT = "focus a task first: Tab or the arrows move between tasks";
const MOVE_LABEL = "Move to";
/** What a `Select` draws beside its value: the open mark and a space. */
export const SELECT_CHROME = 2;
/**
 * How focus reaches the pane and leaves it, and how to close and reopen it (D-27, T-1B.6): the
 * help draws these lines, and README.md and docs/procedures/mod-install.md carry the same.
 */
export const USAGE_LINES: readonly string[] = [
  "Focus enters the pane: Ctrl+X then Tab (again for the next pane, then back to the prompt), a click on it (fullscreen rendering), or the band's beads button (click it, or Ctrl+X then Tab to the band and Enter).",
  "Focus leaves: Esc returns it to the prompt and closes the pane.",
  "Close: Esc, Ctrl+X then X, or /bu (also /show-beads-ui).",
  "Reopen: /bu, the band's beads button, or a key chord bound to command:bu in ~/.claude/keybindings.json, such as this one for Meta+B:",
];
export const KEYBINDINGS_BLOCK = `{
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "meta+b": "command:bu"
      }
    }
  ]
}`;
/** Short height drops the help (T-1B.9); pressing h then says how to get room for it. */
export const SHORT_HELP_TEXT =
  "Help needs a docked pane 12 rows or taller: Ctrl+X then an arrow resizes the pane.";
export const NO_NAME_TEXT =
  "Mine needs the session's name, which ai c sets in CLAUDE_CODE_TASK_LIST_ID; this session has none, so the board shows all issues";

/** The Backlog's measured columns (backlogViewAt): the tier and each fixed column's width. */
interface BacklogColumns {
  wide: boolean;
  idWidth: number;
  typeWidth: number;
}

const assigneeLabel = (assignee: string): string => (assignee === "" ? "" : `@${assignee}`);

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
  tab: Tab = DEFAULT_TAB;
  /** The task panel's settings (T-2B.2, T-2B.8). */
  readonly panel = new PanelSettingsState();
  /** The Tasks view shows its collapsed tasks (T-2B.2). */
  expanded = false;
  /** The options menu is open (T-2B.4), about `menuFor` when a task was focused. */
  menuOpen = false;
  menuFor: string | undefined;
  /** The column a right click opened the menu at (T-2B.5); undefined when a key or button did. */
  menuX: number | undefined;
  /** The task list's Client failed (T-2B.5): the element tree draws the list for the session. */
  clientFaulted = false;
  /** The props the task list's Client was last handed, which its posts are read against. */
  private clientProps: TaskClientProps | undefined;
  /** The Settings view's last notice. */
  settingsNotice: Notice | undefined;
  /** The body size the pane last drew at, for the actions that run between draws. */
  private frame: PaneFrame = { width: WANTED_COLUMNS, placement: "dock" };
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
  /** The session-start open (T-2B.7) has run: a session never opens the panel unasked twice. */
  private started = false;
  /** The person has opened the pane this session. */
  private asked = false;
  /** The delete confirmation, wired by register.ts. */
  onDelete: ((issue: Issue, issues: readonly Issue[]) => void) | undefined;
  /**
   * A write succeeded in the store at the directory given: the band redraws its counts once more
   * (T-1B.5) and the store publishes (T-2B.6); wired by register.ts.
   */
  onWrite: ((store: string) => void) | undefined;
  /** The inventory's stores out of step with the pair (D-34), named in the header. */
  unsynced: string[] = [];
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
  /** Mine or All (D-29): a firstmate, or a session with no name, starts on All. */
  scope: Scope = "all";
  /** The Dolt head of the board snapshot drawn; undefined when bd was read directly. */
  private boardHead: string | undefined;
  /** When the pane last wrote: a snapshot read before it is not drawn, bd is read instead. */
  private wroteAt = 0;
  /** Why the store's board snapshot cannot be drawn, as the refresher named it. */
  boardSkipped: string | undefined;
  /**
   * The Timeline's own read (T-2B.9): the store's closed epics and milestones, read when the
   * Timeline opens, and kept while the board draws the same snapshot head of the same store.
   */
  private timelineRead: { store: string; head: string | undefined; issues: Issue[] } | undefined;
  private timelineReading = false;

  /** The store the pane reads (D-24), from the last refresh; undefined before the first. */
  store: StoreResolution | undefined;
  /** True while the pane has stepped aside for the delete confirmation. */
  private suspended = false;
  private refreshing = false;
  private queued = false;
  private queuedDirect = false;
  private timer: Timer | undefined;
  private timerMs = 0;

  /**
   * @param stores the session's store resolution, shared with the band (D-24)
   * @param bandSettings the band's settings, drawn in the pane's band settings section (T-1B.11)
   */
  constructor(
    private readonly stores: StoreResolver,
    private readonly bandSettings?: BandSettingsPanel,
  ) {}

  async bind(host: Host): Promise<void> {
    this.host = host;
    await this.panel.bind(host);
    await this.loadPrefs();
    void this.refresh();
  }

  /** A write the pane made landed: a snapshot read before now is not drawn. */
  private async markWrite(): Promise<void> {
    const now = await this.host?.now().catch(() => undefined);
    if (now !== undefined) this.wroteAt = now;
  }

  /** As markWrite, and the band and the publish hear of the store written, `store` (T-1B.5). */
  private async wrote(store: string): Promise<void> {
    await this.markWrite();
    this.onWrite?.(store);
  }

  // ---- view preferences -------------------------------------------------------------------

  private async loadPrefs(): Promise<void> {
    const pending = await this.host?.storeGet(PENDING_IDS_KEY).catch(() => undefined);
    for (const entry of readPendingDisplayIds(pending)) {
      if (!this.pendingIds.some((known) => known.id === entry.id)) this.pendingIds.push(entry);
    }
    const session = this.stores.sessionName;
    this.scope = session !== undefined && !isFirstmate(session) ? "mine" : "all";
    const scopes = await this.host?.storeGet(SCOPE_KEY).catch(() => undefined);
    const chosen = isRecord(scopes) ? scopes[session ?? ""] : undefined;
    if (chosen === "mine" || chosen === "all") this.scope = chosen;
    const stored = await this.host?.storeGet(PREFS_KEY).catch(() => undefined);
    if (!isRecord(stored)) return;
    if (isTab(stored.view)) this.tab = stored.view;
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
  }

  private savePrefs(): void {
    const prefs: Prefs = {
      view: this.tab,
      filter: this.filter.text,
      swimlane: this.swimlane,
      sort: sortLabel(this.sort),
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
    let wrote: string | undefined;
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
        wrote = ran.dir;
        this.note(`wrote ${pending.displayId} for ${pending.id}`, "success");
      }
      delete this.pendingErrors[pending.id];
      done.add(pending.id);
    }
    if (done.size > 0) {
      this.pendingIds = this.pendingIds.filter((pending) => !done.has(pending.id));
      this.savePending();
    }
    if (wrote !== undefined) {
      this.queued = true;
      // A display id written late is a write like any other: the band and the publish hear of it.
      this.onWrite?.(wrote);
    }
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
    const dir = this.storePath();
    return { ...(await this.runAt(dir, argv, timeoutMs, streamed)), dir };
  }

  private async runAt(
    dir: string,
    argv: readonly string[],
    timeoutMs: number,
    streamed: boolean,
  ): Promise<Omit<Ran, "dir">> {
    const host = this.host;
    if (host === undefined) {
      return { ok: false, exitCode: null, stdout: "", stderr: "", message: "no session" };
    }
    try {
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
    const { resolution, config, problems, inventory } = await this.stores.resolve();
    this.store = resolution;
    this.unsynced = inventory.ok
      ? inventory.value.filter((store) => !store.synced).map((store) => store.name)
      : [];
    await this.panel.read(config.text);
    const resolved = resolveConfig(config.text, this.storePath());
    return {
      ...resolved,
      problems: [...resolved.problems, ...problems, ...this.panel.problems],
    };
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
   * One read set. The board comes from the host refresher's snapshot of the store while one is
   * running and current (D-26, D-29), else from bd: `bd statuses`, the open issues and the newest
   * closed page, never every closed issue (T-1B.8). `direct` always reads bd, as after a write
   * and when the pane opens. While the pane is open it also reads `bd ready` and the open
   * Detail's `bd show` and `bd history --events`. A failed or timed-out read keeps the last good
   * board, and the next refresh tries again.
   */
  async refresh(options: { direct?: boolean } = {}): Promise<void> {
    if (this.host === undefined) return;
    if (this.refreshing) {
      this.queued = true;
      if (options.direct === true) this.queuedDirect = true;
      return;
    }
    this.refreshing = true;
    try {
      this.config = await this.readConfig();
      this.retime();
      // No store resolved: the pane says what it tried, and no bd read runs until one does.
      if (this.store?.ok !== true) return;
      const full = this.isOpen;
      const snapshot = options.direct === true ? false : await this.fromSnapshot(true);
      let loaded = snapshot;
      const ready = full ? this.run(readyArgv(), READ_TIMEOUT_MS) : undefined;
      if (!snapshot) {
        const [open, closed] = boardReadArgvs();
        const [statuses, opened, closedPage] = await Promise.all([
          this.run(statusesArgv(), READ_TIMEOUT_MS),
          this.run(open, READ_TIMEOUT_MS, { streamed: true }),
          this.run(closed, READ_TIMEOUT_MS),
        ]);
        loaded = this.applyReads(statuses, [opened, closedPage], await this.stamp());
        if (loaded) this.boardHead = undefined;
      }
      if (loaded) await this.retryPendingIds();
      // The pane opened on the Timeline before its store was resolved: its own read runs now.
      if (full && this.tab === "timeline" && this.timelineRead?.store !== this.store.path) {
        void this.readTimeline();
      }
      const readied = await ready;
      if (readied?.ok === true) {
        const parsed = parseBdReady(readied.stdout);
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
        const direct = this.queuedDirect;
        this.queued = false;
        this.queuedDirect = false;
        void this.refresh({ direct });
      }
    }
  }

  /** The host refresher's state directory, where the board snapshots live. */
  private async stateDir(): Promise<string | undefined> {
    const xdgStateHome = await this.host?.stateHome().catch(() => undefined);
    return stateDirOf({ xdgStateHome, home: this.stores.home });
  }

  /**
   * Draws the board from the refresher's snapshot of the store (D-29); true when the board now
   * shows it, or already shows that snapshot. With `current`, only while a refresher runs and has
   * confirmed the snapshot within STALE_MS, and never over a read of bd made after it: so a
   * periodic refresh costs no bd call. Without it, any snapshot of the store will do, as when the
   * pane opens and the board has nothing yet to draw (T-1B.8). A store the refresher skipped is
   * named on the pane and read directly.
   */
  private async fromSnapshot(current: boolean): Promise<boolean> {
    const host = this.host;
    const dir = await this.stateDir();
    if (host === undefined || dir === undefined || this.store?.ok !== true) return false;
    const path = this.store.path.replace(/\/+$/, "");
    const [leaseText, now] = await Promise.all([
      host.readFile(`${dir}/${LEASE_FILE}`).catch(() => undefined),
      host.now().catch(() => 0),
    ]);
    const lease = leaseText === undefined ? undefined : parseFileLease(leaseText);
    // The snapshot of the token the lease names; with no lease, the last one published.
    const token = lease === undefined ? undefined : lease.token;
    if (token !== undefined && !isRefresherToken(token)) return false;
    const countsFile = token === undefined ? SNAPSHOT_FILE : snapshotFileName(token);
    const countsText = await host.readFile(`${dir}/${countsFile}`).catch(() => undefined);
    const parsed = countsText === undefined ? undefined : parseSnapshot(countsText);
    const counts =
      parsed?.ok === true &&
      isRefresherToken(parsed.value.token) &&
      (token === undefined || parsed.value.token === token)
        ? parsed.value
        : undefined;
    const entry: BoardEntry | undefined = counts?.boards?.find(
      (one) => one.path.replace(/\/+$/, "") === path,
    );
    this.boardSkipped = entry?.ok === false ? entry.error : undefined;
    if (counts === undefined) return false;
    if (current) {
      if (entry?.ok !== true || !refresherRunning(lease, now)) return false;
      if (now - entry.checkedAt > STALE_MS || entry.readAt < this.wroteAt) return false;
      // The board already draws this head: nothing to read.
      if (entry.head === this.boardHead && this.board.loaded) return true;
    }
    if (entry?.ok === false) return false;
    const file = entry?.ok === true ? entry.file : boardFileName(path);
    const text = await host
      .readFile(`${dir}/${boardPath(counts.token, file)}`)
      .catch(() => undefined);
    const board = text === undefined ? undefined : parseBoardSnapshot(text);
    if (board?.ok !== true || board.value.path.replace(/\/+$/, "") !== path) return false;
    const issues = parseIssueRows(board.value.issues);
    const statuses = parseStatusesJson(board.value.statuses);
    if (!issues.ok || !statuses.ok || statuses.value.length === 0) return false;
    const confirmed =
      entry?.ok === true && entry.head === board.value.head ? entry.checkedAt : board.value.readAt;
    this.dispatch({
      type: "load-succeeded",
      issues: issues.value,
      statuses: statuses.value,
      at: this.stampOf(confirmed),
    });
    this.boardHead = board.value.head;
    return true;
  }

  private stampOf(ms: number): string {
    return clockStamp(ms, new Date(ms).getTimezoneOffset());
  }

  /**
   * Applies one read set, `bd statuses` and the board's lists (the open issues and the closed
   * page); true when the store's issues loaded.
   */
  private applyReads(statuses: Ran, lists: readonly Ran[], at: string): boolean {
    const issues: Issue[] = [];
    const seen = new Set<string>();
    for (const list of lists) {
      if (!list.ok) {
        this.dispatch({ type: "load-failed", exitCode: list.exitCode, message: list.message });
        return false;
      }
      const parsed = parseBdList(list.stdout);
      if (!parsed.ok) {
        this.dispatch({
          type: "load-failed",
          exitCode: list.exitCode,
          message: `${parsed.error.message} at ${parsed.error.path}`,
        });
        return false;
      }
      // An issue closed between the two reads is in both: the first read's copy is kept.
      for (const issue of parsed.value) {
        if (seen.has(issue.id)) continue;
        seen.add(issue.id);
        issues.push(issue);
      }
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
    this.dispatch({ type: "load-succeeded", issues, statuses: known, at });
    return true;
  }

  /**
   * The Timeline opened (T-2B.9): reads the store's closed epics and milestones, one bd call a
   * type, unless the last read was of this store at the snapshot head the board draws. A failed
   * read keeps the last good one and says so; the Timeline still draws the board's own.
   */
  private async readTimeline(): Promise<void> {
    if (this.store?.ok !== true || this.timelineReading) return;
    const store = this.store.path;
    const head = this.boardHead;
    const kept = this.timelineRead;
    if (kept?.store === store && head !== undefined && kept.head === head) return;
    this.timelineReading = true;
    try {
      await this.readTimelineOf(store, head);
    } finally {
      this.timelineReading = false;
    }
  }

  private async readTimelineOf(store: string, head: string | undefined): Promise<void> {
    const argvs = timelineReadArgvs(TIMELINE_TYPES);
    const ran = await Promise.all(
      argvs.map((argv) => this.run(argv, READ_TIMEOUT_MS, { streamed: true })),
    );
    const issues: Issue[] = [];
    for (const [i, read] of ran.entries()) {
      const what = `bd list --type ${TIMELINE_TYPES[i]}`;
      const parsed = read.ok ? parseBdList(read.stdout) : undefined;
      if (parsed?.ok !== true) {
        const failure = !read.ok
          ? this.failure(what, read)
          : `${what} failed: ${parsed?.ok === false ? `${parsed.error.message} at ${parsed.error.path}` : "unreadable"}`;
        this.note(
          `The Timeline shows only the newest closed epics and milestones: ${failure}`,
          "warning",
        );
        // Kept with no head, so the next open reads again and no refresh retries meanwhile.
        const kept = this.timelineRead?.store === store ? this.timelineRead.issues : [];
        this.timelineRead = { store, head: undefined, issues: kept };
        this.host?.invalidate();
        return;
      }
      issues.push(...parsed.value);
    }
    this.timelineRead = { store, head, issues };
    this.host?.invalidate();
  }

  /** What the Timeline places: the board's issues, then the closed ones only its own read has. */
  private timelineIssues(): Issue[] {
    const read = this.timelineRead;
    if (read === undefined || this.store?.ok !== true || read.store !== this.store.path) {
      return [...this.board.issues];
    }
    const known = new Set(this.board.issues.map((issue) => issue.id));
    return [...this.board.issues, ...read.issues.filter((issue) => !known.has(issue.id))];
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
   * The band's beads button (D-27, T-1B.6): opens the pane focused when it is closed, and moves
   * the focus ring into it, onto its open tab, when it is open.
   */
  async openOrFocus(): Promise<void> {
    if (!this.isOpen) {
      await this.open(true);
      return;
    }
    this.settleTab();
    await this.host?.focus(PANE_ID, `tab:${this.tab}`).catch(() => undefined);
  }

  /** The panel mode draws the Tasks view: every mode but native (T-2B.7). */
  get tasksShown(): boolean {
    return showsTasks(this.panel.settings.mode);
  }

  /** Under native the Tasks view is never drawn: a kept or default Tasks view opens the Board. */
  private settleTab(): void {
    if (this.tab === "tasks" && !this.tasksShown) this.tab = "board";
  }

  /**
   * The session's start (T-2B.7, D-32), once a session. Under `panel.mode` both or beads, read
   * from beads-ui.toml and the held Settings change now, the pane opens unasked on the Tasks
   * view, docked where Claude Code places it and leaving the keyboard on the prompt. Under native
   * nothing opens, and when `retired` (Claude Code's task panel is retired on this machine, D-21)
   * one toast says no task panel is enabled.
   */
  async start(retired: boolean): Promise<void> {
    if (this.started || this.host === undefined) return;
    this.started = true;
    this.config = await this.readConfig();
    if (!this.tasksShown) {
      if (retired) this.host.toast(NO_PANEL_TEXT);
      return;
    }
    // The person opened the pane while the settings were read: theirs is the open, even if closed.
    if (this.isOpen || this.asked) return;
    const kept = this.tab;
    this.tab = "tasks";
    await this.open(false).catch(() => undefined);
    // Held unplaced: `/bu` later opens on the view the person kept.
    if (!this.isOpen) this.tab = kept;
  }

  /**
   * Opens the pane. One the person asked for follows Claude Code's placement; one the mod opens
   * on its own (`asked` false) is withdrawn with a toast when the engine holds it unplaced.
   */
  async open(asked: boolean): Promise<void> {
    const host = this.host;
    if (host === undefined) throw new Error("beads-ui has no session yet");
    if (asked) this.asked = true;
    this.settleTab();
    // T-1B.8: a board with nothing to draw yet takes the store's snapshot before the pane opens,
    // so the first render draws cards; the bd read below then replaces it.
    if (!this.board.loaded && this.store?.ok === true) {
      await this.fromSnapshot(false).catch(() => false);
    }
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
    void this.refresh({ direct: true });
    if (this.tab === "timeline") void this.readTimeline();
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
      await this.wrote(ran.dir);
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
    await this.refresh({ direct: true });
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
      await this.refresh({ direct: true });
      return;
    }
    this.quickAddText = "";
    await this.wrote(created.dir);
    const id = parseBdCreatedId(created.stdout);
    if (!id.ok) {
      this.note(
        `bd create succeeded but its output was unreadable: ${id.error.message}`,
        "warning",
      );
      await this.refresh({ direct: true });
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
    await this.refresh({ direct: true });
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
    if (tab === "tasks" && !this.tasksShown) return;
    this.tab = tab;
    this.menuOpen = false;
    this.clearHint();
    this.savePrefs();
    this.host?.invalidate();
    void this.host?.focus(PANE_ID, `tab:${tab}`).catch(() => undefined);
    if (tab === "timeline") void this.readTimeline();
  }

  cycleSwimlane(): void {
    this.swimlane = nextSwimlaneMode(this.swimlane);
    this.clearHint();
    this.resetPages();
    this.savePrefs();
    this.host?.invalidate();
  }

  /** The board as drawn: on Mine, only the issues assigned to this session (D-29). */
  shown(): BoardState {
    const session = this.stores.sessionName;
    if (this.scope === "all" || session === undefined) return this.board;
    return { ...this.board, issues: this.scoped(this.board.issues) };
  }

  /** `issues` as the scope draws them: on Mine, only the ones assigned to this session. */
  private scoped(issues: readonly Issue[]): Issue[] {
    const session = this.stores.sessionName;
    if (this.scope === "all" || session === undefined) return [...issues];
    return issues.filter((one) => one.assignee === session);
  }

  /**
   * `a`: Mine and All. The choice is kept in `$.store` under this session's name, read back and
   * merged so another session's choice is kept.
   */
  async toggleScope(): Promise<void> {
    if (this.stores.sessionName === undefined) {
      this.hint(NO_NAME_TEXT);
      this.host?.invalidate();
      return;
    }
    this.scope = this.scope === "mine" ? "all" : "mine";
    this.clearHint();
    this.resetPages();
    this.host?.invalidate();
    const host = this.host;
    if (host === undefined) return;
    const held = await host.storeGet(SCOPE_KEY).catch(() => undefined);
    const scopes = isRecord(held) ? held : {};
    await host
      .storeSet(SCOPE_KEY, { ...scopes, [this.stores.sessionName ?? ""]: this.scope })
      .catch(() => undefined);
  }

  cycleSort(): void {
    this.sort = nextSort(this.sort);
    this.clearHint();
    this.resetPages();
    this.savePrefs();
    this.host?.invalidate();
  }

  /** Sprint (D-28, T-2B.1): a notice that the view is planned; the view stays. */
  pressPlanned(view: PlannedView): void {
    this.note(plannedText(view), "warning");
    this.host?.invalidate();
  }

  toggleHelp(): void {
    this.help = !this.help;
    this.clearHint();
    this.host?.invalidate();
  }

  /** The pane's focus ring moved onto an element: a card's or a task's own controls name it. */
  focused(element: string | undefined): void {
    const match =
      element === undefined
        ? null
        : /^(?:move|open|row|task|taskmenu|timeline):(.+)$/.exec(element);
    if (match?.[1] === undefined || match[1] === this.focusedId) return;
    this.focusedId = match[1];
    // The Tasks view and the Timeline draw a window of rows that follows the focus (T-2B.1), so
    // the next row is drawn before Down reaches it.
    if (this.tab === "tasks" || this.tab === "timeline") this.host?.invalidate();
  }

  private focusHint(): string {
    return this.tab === "tasks" ? TASK_FOCUS_HINT : FOCUS_HINT;
  }

  /** `r` and the "+M more" control (T-2B.2): the collapsed tasks, in place, or collapsed again. */
  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.clearHint();
    this.host?.invalidate();
  }

  /**
   * `k`, or a task row's menu button (T-2B.4): opens the options menu about the focused task, or
   * about `id`, and moves the focus ring onto its first item; a second press closes it.
   */
  async toggleMenu(id?: string, x?: number): Promise<void> {
    if (this.menuOpen && (id === undefined || id === this.menuFor)) {
      this.closeMenu();
      return;
    }
    if (id !== undefined) this.focusedId = id;
    this.menuX = x;
    this.menuFor = this.target();
    this.menuOpen = true;
    this.clearHint();
    this.host?.invalidate();
    const first = this.menuAt(this.frame).sections.flatMap((section) => section.items)[0];
    if (first !== undefined) {
      await this.host?.focus(PANE_ID, first.key).catch(() => undefined);
    }
  }

  closeMenu(): void {
    this.menuOpen = false;
    this.host?.invalidate();
  }

  /** A menu item: the menu closes, and its action runs on the task the menu was opened about. */
  runFromMenu(command: string): void {
    this.menuOpen = false;
    if (this.menuFor !== undefined && this.tab !== "detail") this.focusedId = this.menuFor;
    this.runCommand(command);
    this.host?.invalidate();
  }

  /**
   * A post from the task list's Client (T-2B.5), read against the props it was handed: each kind
   * runs what the element tree's focus ring, row button, menu button or key runs.
   */
  async clientMessage(data: unknown): Promise<void> {
    const props = this.clientProps;
    const message = props === undefined ? undefined : parseTaskMessage(data, props);
    if (message === undefined) return;
    if (message.kind === "run") {
      if (message.id !== undefined) this.focusedId = message.id;
      this.runCommand(message.command);
      this.host?.invalidate();
      return;
    }
    if (message.kind === "menu") {
      await this.toggleMenu(message.id, message.x);
      return;
    }
    if (message.kind === "open") {
      await this.openDetailFor(message.id);
      return;
    }
    this.focused(`task:${message.id}`);
  }

  /** `ui.fault` (T-2B.5): the task list's Client failed, so the element tree draws it from now on. */
  clientFault(element: string): void {
    if (element !== TASKS_CLIENT_KEY || this.clientFaulted) return;
    this.clientFaulted = true;
    this.host?.invalidate();
  }

  /** Every command a control or a menu item runs, by COMMANDS id (T-2B.4). */
  runCommand(command: string): void {
    const views: Readonly<Record<string, Tab>> = {
      "tab.tasks": "tasks",
      "tab.board": "board",
      "tab.backlog": "backlog",
      "tab.detail": "detail",
      "tab.timeline": "timeline",
      "tab.settings": "settings",
    };
    const view = views[command];
    if (view !== undefined) {
      this.setTab(view);
      return;
    }
    const actions: Readonly<Record<string, () => void>> = {
      "tab.sprint": () => this.pressPlanned("sprint"),
      "panel.menu": () => void this.toggleMenu(),
      "tasks.more": () => this.toggleExpanded(),
      "issue.new": () => void this.focusQuickAdd(),
      "board.swimlane": () => this.cycleSwimlane(),
      "view.sort": () => this.cycleSort(),
      "view.scope": () => void this.toggleScope(),
      "band.settings": () => this.bandSettings?.toggle(),
      help: () => this.toggleHelp(),
      "card.detail": () => void this.openDetailFor(),
      "card.move": () => void this.focusMove(),
      "card.edit": () => void this.editFocused("title"),
      "card.delete": () => this.requestDelete(),
      "page.next": () => void this.stepFocusedPage(1),
      "page.back": () => void this.stepFocusedPage(-1),
      "board.lanes": () => this.stepLanes(1),
      "close.undo": () => void this.undoClose(),
    };
    actions[command]?.();
  }

  /** Settings' Shown tasks (T-2B.2): applied at once and kept in `$.store`. */
  async setShown(text: string): Promise<void> {
    const shown = parseShownCount(text);
    if (shown === undefined) {
      this.settingsNotice = {
        text: `${JSON.stringify(text.trim())} is not a whole number from 1 to ${MAX_SHOWN}`,
        token: "error",
      };
      this.host?.invalidate();
      return;
    }
    this.settingsNotice = undefined;
    await this.panel.change({ shown });
  }

  /** A Settings list (T-2B.8): the collapse rule, panel.mode or debug mode, applied at once. */
  async chooseSetting(key: string, value: string): Promise<void> {
    this.settingsNotice = undefined;
    if (key === "settings:collapse" && isCollapseRule(value)) {
      await this.panel.change({ collapse: value });
    } else if (key === "settings:mode" && isPanelMode(value)) {
      await this.panel.change({ mode: value });
    } else if (key === "settings:debug") {
      await this.bandSettings?.setDebug(value === "on");
    }
  }

  /**
   * Settings' Save to file (T-2B.8): one write of the `[panel]` and `[band]` tables into the
   * `beads-ui.toml` the mod read, every other line kept, then nothing is held in `$.store`.
   */
  async saveSettings(): Promise<void> {
    const panel = this.panel.settings;
    const band = this.bandSettings;
    if (band === undefined) return;
    const saved = await band.save((text) => withPanelTable(text, panel));
    this.settingsNotice = band.notice;
    band.notice = undefined;
    if (saved) await this.panel.saved();
    this.host?.invalidate();
  }

  /** `e`, and `m` on the Tasks view: the task's detail, with the focus ring on one field's control. */
  async editFocused(field: EditableField): Promise<void> {
    const id = this.target();
    if (id === undefined) {
      this.hint(this.focusHint());
      this.host?.invalidate();
      return;
    }
    await this.openDetailFor(id);
    await this.host?.focus(PANE_ID, `edit:${field}`).catch(() => undefined);
  }

  /** The issue `d`, `m` and `x` act on: the focused card, or on the Detail tab its issue. */
  private target(): string | undefined {
    return this.tab === "detail" ? this.detailId : this.focusedId;
  }

  async focusMove(): Promise<void> {
    if (this.tab === "tasks") {
      await this.editFocused("status");
      return;
    }
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
    if (this.tab === "detail" || this.tab === "settings" || this.tab === "timeline") {
      this.setTab("board");
    }
    this.host?.invalidate();
    await this.host?.focus(PANE_ID, "quickadd").catch(() => undefined);
  }

  async openDetailFor(id: string | undefined = this.target()): Promise<void> {
    if (id === undefined) {
      this.hint(this.focusHint());
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
    await this.wrote(ran.dir);
    await this.loadDetail(detail.issue.id);
    await this.refresh({ direct: true });
  }

  requestDelete(): void {
    const id = this.target();
    const issue =
      this.board.issues.find((candidate) => candidate.id === id) ??
      (this.detail?.issue.id === id ? this.detail?.issue : undefined);
    if (issue === undefined) {
      this.hint(this.focusHint());
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
    else void this.markWrite().then(() => this.refresh({ direct: true }));
  }

  async undoClose(): Promise<void> {
    const undo = this.undo;
    if (undo === undefined) return;
    this.undo = undefined;
    const ran = await this.run(undoArgv(undo), WRITE_TIMEOUT_MS);
    if (ran.ok) await this.wrote(ran.dir);
    this.note(
      ran.ok
        ? `${undo.label} is back to ${undo.previous}`
        : ran.exitCode === 13
          ? `${undo.label} changed elsewhere since it was closed; nothing was undone`
          : this.failure("the undo", ran),
      ran.ok ? "success" : "warning",
    );
    await this.refresh({ direct: true });
  }

  // ---- drawing ----------------------------------------------------------------------------

  /**
   * The pane at its body size (T-1B.9): `width` picks the layout tier, and above the prompt or
   * under 12 rows the help, the band settings and the footer's hints are dropped and the inputs
   * move below the board, so the tabs, the board's header and a card come first.
   */
  draw(
    ui: PaneUi,
    frame: PaneFrame,
    helpRegion?: RenderElement,
    tasksRegion?: TasksRegion,
    raster?: RasterElement,
  ): RenderElement {
    const { Box, Text } = ui;
    if (this.host === undefined) {
      return Box({ children: [Text({ children: "beads-ui starts with the session." })] });
    }
    this.frame = frame;
    // A panel.mode changed to native in beads-ui.toml shows at this draw.
    this.settleTab();
    const nav = this.navAt(frame);
    // The view's own width: the body less the side nav when it is drawn (T-2B.1).
    const width = nav.viewColumns;
    this.width = width;
    const framed = (content: readonly RenderNode[]) =>
      drawFrame(ui, nav, (item) => this.pressNav(item.view), content);
    if (this.store?.ok === false) return framed(this.drawNoStore(ui, this.store));
    const short = isShort(frame.placement, frame.bodyRows);
    const { groups, perRow, groupWidth } = this.layout(width);
    const view = this.boardViewAt(width);
    const ctx = this.actionContext(width, view);
    const region = this.clientFaulted ? undefined : tasksRegion;
    const menu = this.menuOpen
      ? this.drawMenu(ui, ctx, width, this.tab === "tasks" && region !== undefined)
      : undefined;
    const body =
      this.tab === "tasks"
        ? this.drawTasks(ui, width, frame, ctx, menu, region)
        : this.tab === "board"
          ? this.drawBoard(ui, view, groups, perRow, groupWidth)
          : this.tab === "backlog"
            ? this.drawBacklog(ui, width)
            : this.tab === "settings"
              ? this.drawSettingsView(ui, width)
              : this.tab === "timeline"
                ? this.drawTimeline(ui, width, frame, raster)
                : this.drawDetail(ui, width);
    const inputs =
      this.tab === "detail" || this.tab === "settings" || this.tab === "timeline"
        ? undefined
        : this.drawInputs(ui, this.tab !== "tasks");
    const settings =
      this.bandSettings?.isOpen === true && this.tab !== "settings"
        ? this.bandSettings.draw(ui, colorOf)
        : undefined;
    return framed(
      present<RenderNode>([
        this.drawHeader(ui),
        this.drawToolbar(ui, ctx, width),
        ...this.drawLines(ui, width, view, short),
        this.tab === "tasks" ? undefined : menu,
        !short && this.help ? this.drawHelp(ui, helpRegion) : undefined,
        short ? undefined : settings,
        short ? undefined : inputs,
        body,
        short ? settings : undefined,
        short ? inputs : undefined,
        short
          ? undefined
          : Box({
              key: "footer",
              children: [Text({ dimColor: true, children: footerHints("card").join(" · ") })],
            }),
      ]),
    );
  }

  /** The nav at a body size, for the view now open (T-2B.1). */
  private navAt(frame: PaneFrame): NavLayout {
    return navLayout(
      frame.width,
      frame.placement,
      frame.bodyRows,
      this.tab,
      frame.bodyColumns,
      !this.tasksShown,
    );
  }

  private pressNav(view: PanelView): void {
    if (view === "sprint") this.pressPlanned(view);
    else this.setTab(view);
  }

  /** What the drawn view offers (T-2B.4): the toolbar, the view's own controls and the menu read it. */
  private actionContext(width: number, view: BoardView = this.boardViewAt(width)): ActionContext {
    const paged =
      this.tab === "backlog"
        ? this.backlogViewAt(width).page.pages > 1
        : this.tab === "board" &&
          (view.unplacedPage.pages > 1 ||
            view.lanes.some((lane) => lane.pages.some((page) => page.pages > 1)));
    const list = this.tab === "tasks" ? this.taskListAt(width, this.frame) : undefined;
    return {
      view: this.tab,
      mine: this.scope === "mine",
      swimlane: this.swimlane,
      sort: sortLabel(this.sort),
      undo: this.undo !== undefined,
      paged,
      lanesPaged: this.tab === "board" && view.lanePage.pages > 1,
      bandSettings: this.bandSettings !== undefined,
      ...(list?.collapsible === true ? { more: list.moreLabel } : {}),
      ...(this.tasksShown ? {} : { hideTasks: true }),
    };
  }

  /** The options menu as the view now offers it. */
  private menuAt(frame: PaneFrame): MenuView {
    const width = this.navAt(frame).viewColumns;
    const id = this.menuFor;
    const issue =
      id === undefined ? undefined : this.board.issues.find((candidate) => candidate.id === id);
    const name = id === undefined ? undefined : (issue?.displayId ?? id);
    return menuView(this.actionContext(width), name);
  }

  private menuViewOf(ctx: ActionContext): MenuView {
    const id = this.menuFor;
    const issue =
      id === undefined ? undefined : this.board.issues.find((candidate) => candidate.id === id);
    return menuView(ctx, id === undefined ? undefined : (issue?.displayId ?? id));
  }

  /** The options menu; over the Client's rows it is as wide as its widest line (T-2B.5). */
  private drawMenu(ui: PaneUi, ctx: ActionContext, width: number, popup: boolean): RenderElement {
    const menu = this.menuViewOf(ctx);
    return drawMenu(
      ui,
      menu,
      popup ? menuColumns(menu, width) : width,
      (command) => this.runFromMenu(command),
      () => this.closeMenu(),
    );
  }

  /** The Tasks view's list at a width (T-2B.2); at short height a window round the focused task. */
  private taskListAt(width: number, frame: PaneFrame, client = false): TaskListView {
    const short = isShort(frame.placement, frame.bodyRows);
    return taskListView(this.shown().issues, {
      statuses: this.board.statuses,
      settings: this.panel.settings,
      expanded: this.expanded,
      width: Math.max(1, width - rowControlColumns(client)),
      ...(this.focusedId === undefined ? {} : { focusedId: this.focusedId }),
      windowRows: short
        ? Math.max(3, (frame.bodyRows ?? SHORT_ROWS) - SHORT_CHROME_ROWS)
        : TASK_WINDOW_ROWS,
    });
  }

  /**
   * The Client path (T-2B.5): the rows as the Client's props, the room it leaves under the row
   * the menu is about, and the column the menu opens at, kept inside the view.
   */
  private tasksClient(
    list: TaskListView,
    ctx: ActionContext,
    width: number,
    region: TasksRegion,
  ): TaskListClient {
    const menu = this.menuOpen ? this.menuViewOf(ctx) : undefined;
    const menuWidth = menu === undefined ? 0 : menuColumns(menu, width);
    const props = taskClientProps(list, ctx, {
      ...(this.focusedId === undefined ? {} : { selected: this.focusedId }),
      ...(menu === undefined || this.menuFor === undefined
        ? {}
        : { gapAfter: this.menuFor, gapRows: menuRows(menu) }),
      selectedColor: colorOf("surface.focus"),
    });
    this.clientProps = props;
    const labelWidth = Math.max(1, width - rowControlColumns(true));
    return {
      region: region(props, labelWidth, props.rows.length + props.gapRows),
      gapRows: props.gapRows,
      menuLeft: Math.max(0, Math.min(this.menuX ?? 0, width - menuWidth)),
      menuWidth,
    };
  }

  private drawTasks(
    ui: PaneUi,
    width: number,
    frame: PaneFrame,
    ctx: ActionContext,
    menu: RenderElement | undefined,
    region: TasksRegion | undefined,
  ): RenderElement {
    const { Box, Text } = ui;
    if (!this.board.loaded) {
      return Box({
        key: "tasks",
        children: [Text({ dimColor: true, children: "reading the store…" })],
      });
    }
    const session = this.stores.sessionName;
    const list = this.taskListAt(width, frame, region !== undefined);
    const empty =
      this.scope === "mine" && session !== undefined
        ? `No task in progress, blocked or open is assigned to ${session}; a shows every owner's.`
        : "No task is in progress, blocked or open.";
    return drawTaskList(ui, list, {
      color: colorOf,
      empty,
      handlers: {
        open: (id) => void this.openDetailFor(id),
        menu: (id) => void this.toggleMenu(id),
        more: () => this.toggleExpanded(),
      },
      ...(this.menuFor === undefined ? {} : { menuFor: this.menuFor }),
      ...(menu === undefined ? {} : { menu }),
      ...(region === undefined ? {} : { client: this.tasksClient(list, ctx, width, region) }),
    });
  }

  private drawSettingsView(ui: PaneUi, width: number): RenderElement {
    const band = this.bandSettings;
    const view = settingsView(
      this.panel.settings,
      band?.settings ?? DEFAULT_BAND_SETTINGS,
      settingsOptionRoom(width),
    );
    return drawSettings(ui, view, {
      color: colorOf,
      problems: this.panel.problems,
      ...(this.settingsNotice === undefined ? {} : { notice: this.settingsNotice }),
      ...(band === undefined ? {} : { band: band.draw(ui, colorOf, { saveButton: false }) }),
      handlers: {
        shown: (text) => void this.setShown(text),
        choose: (key, value) => void this.chooseSetting(key, value),
        save: () => void this.saveSettings(),
      },
    });
  }

  /**
   * The Timeline (T-2B.9): the store's epics and milestones, closed ones included, by due date;
   * on Mine only the session's own (D-29). Today is the day of the last read. Raster bars where
   * the surface has a Raster, Text rows elsewhere, in a window of rows the pane's body holds that
   * follows the focus.
   */
  private drawTimeline(
    ui: PaneUi,
    width: number,
    frame: PaneFrame,
    raster: RasterElement | undefined,
  ): RenderElement {
    if (!this.board.loaded) {
      return ui.Box({
        key: "timeline",
        children: [ui.Text({ dimColor: true, children: "reading the store…" })],
      });
    }
    const view = timelineView(this.scoped(this.timelineIssues()), {
      statuses: this.board.statuses,
      ...(this.board.loadedAt === undefined ? {} : { today: this.board.loadedAt }),
    });
    const nav = this.navAt(frame);
    const room =
      (frame.bodyRows ?? WANTED_ROWS) -
      TIMELINE_CHROME_ROWS -
      (nav.kind === "side" ? 0 : nav.rows.length);
    // A Raster bar under its label takes two rows.
    const perItem = raster !== undefined && timelinePlacement(width) === "above" ? 2 : 1;
    const layout = timelineLayout(view, width, {
      ...(this.focusedId === undefined ? {} : { focusedId: this.focusedId }),
      rows: Math.min(TASK_WINDOW_ROWS, Math.max(3, Math.floor(room / perItem))),
    });
    const session = this.stores.sessionName;
    const mineEmpty =
      this.scope === "mine" &&
      session !== undefined &&
      view.items.length + view.undated.length === 0;
    return drawTimeline(
      ui,
      mineEmpty
        ? {
            ...layout,
            emptyLine: truncate(
              `No epic or milestone is assigned to ${session}; a shows every owner's.`,
              width,
            ),
          }
        : layout,
      {
        ...(raster === undefined ? {} : { raster }),
        open: (id) => void this.openDetailFor(id),
      },
    );
  }

  /** The board's column groups, how many sit on a row, and the width each gets. */
  private layout(width: number): { groups: string[]; perRow: number; groupWidth: number } {
    const groups = STATUS_CATEGORIES.filter((category) =>
      this.board.statuses.some((status) => status.category === category),
    );
    return { groups, ...groupLayout(width, groups.length) };
  }

  /** The board as core pages it, at the pages the person stepped to. */
  private boardViewAt(width: number): BoardView {
    return boardView(this.shown(), {
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

  /** The store and its read time, cut at the view's edge; the nav draws the views beside it. */
  private drawHeader(ui: PaneUi): RenderElement {
    const { Box, Text } = ui;
    const resolved = this.store?.ok === true;
    const store = Text({
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
        ...(this.unsynced.length === 0
          ? []
          : [
              "  ",
              Text({
                color: colorOf("warning"),
                children: `unsynced with the pair: ${this.unsynced.join(", ")}`,
              }),
            ]),
      ],
    });
    return Box({ key: "header", children: [store] });
  }

  /** D-24's empty state: what the pane looked for, and the line that points it at a store. */
  private drawNoStore(ui: PaneUi, store: Extract<StoreResolution, { ok: false }>): RenderElement[] {
    const { Box, Text } = ui;
    return present<RenderElement>([
      this.drawHeader(ui),
      ...this.config.problems.map((problem, i) => this.line(ui, `config:${i}`, problem, "warning")),
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
    ]);
  }

  /**
   * The toolbar's buttons, labelled for the width's tier and packed into rows that each fit it
   * (T-1B.9): full words from 72 columns, a short word from 48, the shortest form below.
   */
  private drawToolbar(ui: PaneUi, ctx: ActionContext, width: number): RenderElement {
    const { Box, Button } = ui;
    const tier = tierOf(width);
    const gap = tier === "narrow" ? 1 : 2;
    const items = panelActions(ctx)
      .filter((action) => action.place === "toolbar")
      .map((action) => {
        const hotkey = hotkeyOf(action.command);
        const label = action.labels[tier];
        return { ...action, label, hotkey, width: buttonWidth(label, hotkey) };
      });
    return Box({
      key: "toolbar",
      flexDirection: "column",
      children: packRows(items, width, gap).map((row, i) =>
        Box({
          key: `toolbar:${i}`,
          flexDirection: "row",
          columnGap: gap,
          children: row.map((item) =>
            Button({
              key: item.key,
              label: item.label,
              hotkey: item.hotkey,
              plain: true,
              onPress: () => this.runCommand(item.command),
            }),
          ),
        }),
      ),
    });
  }

  private drawLines(ui: PaneUi, width: number, view: BoardView, short: boolean): RenderElement[] {
    const filterLine =
      this.filter.error === undefined ? view.filterLine : describeFilterError(this.filter.error);
    const session = this.stores.sessionName;
    const onBoard = this.tab === "board" || this.tab === "backlog";
    const ownOpen =
      this.scope === "mine" && session !== undefined && this.board.loaded
        ? this.shown().issues.filter((issue) => issue.status !== "closed").length
        : undefined;
    const allOpen = this.board.issues.filter((issue) => issue.status !== "closed").length;
    return present([
      ...this.config.problems.map((problem, i) => this.line(ui, `config:${i}`, problem, "warning")),
      onBoard && ownOpen === 0
        ? this.line(
            ui,
            "mine-empty",
            `No open issues are assigned to ${session}; a shows all ${allOpen} open.`,
            "text.dim",
          )
        : undefined,
      short && this.help ? this.line(ui, "help-short", SHORT_HELP_TEXT, "text.dim") : undefined,
      onBoard && !short && this.boardSkipped !== undefined
        ? this.line(
            ui,
            "board-skipped",
            `Read from bd, not the host snapshot: ${this.boardSkipped}`,
            "text.dim",
          )
        : undefined,
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

  /** The Filter field (the Board and Backlog only) and the quick-add New field. */
  private drawInputs(ui: PaneUi, withFilter: boolean): RenderElement {
    const { Box, Input } = ui;
    return Box({
      key: "inputs",
      flexDirection: "column",
      children: present<RenderElement>([
        withFilter
          ? Input({
              key: "filter",
              label: "Filter",
              placeholder: FILTER_KEYS.map((key) => `${key}:`).join(" "),
              value: this.filter.text,
              submitLabel: "filter",
              onSubmit: (value) => this.submitFilter(value),
            })
          : undefined,
        Input({
          key: "quickadd",
          label: "New",
          placeholder: "title p0-p4 type:task @assignee +label due:YYYY-MM-DD sprint:name",
          value: this.quickAddText,
          submitLabel: "create",
          onSubmit: (value) => void this.quickAdd(value),
        }),
      ]),
    });
  }

  private drawHelp(ui: PaneUi, helpRegion: RenderElement | undefined): RenderElement {
    const { Box, Text, Code } = ui;
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
        Text({ bold: true, children: "Focus, hide and show" }),
        ...USAGE_LINES.map((text) => Text({ children: text })),
        Code({ source: KEYBINDINGS_BLOCK }),
        Text({
          children: `The band above the prompt: [bd] counts your own issues in every store; a firstmate's [bd][all] counts every owner's, with [fm] its own. "N unsynced" means N stores are out of step with the pair, named in the header. A line ending ${PARTIAL_GLYPH} is partial: a store could not be read. ${DIRECT_GLYPH} means this session read the counts itself because the host refresher is not running. g opens the band settings.`,
        }),
        Box({
          key: "columns",
          children: [Text({ children: `Columns: ${STATUS_CATEGORIES.join(", ")}` })],
        }),
        helpRegion,
      ]),
    });
  }

  /**
   * One card in a column `width` wide. Its Move to keeps its label while the label and the longest
   * status fit beside each other; a status too long for the column is cut in its option label.
   */
  private drawCard(ui: PaneUi, card: CardView, width: number): RenderElement {
    const status = this.board.issues.find((issue) => issue.id === card.id)?.status ?? "";
    const { Box, Text, Select, Button } = ui;
    const values = [status, ...card.moveTargets];
    const room = Math.max(1, width - SELECT_CHROME);
    const longest = Math.max(0, ...values.map(textWidth));
    const labelled = width >= textWidth(MOVE_LABEL) + 2 + Math.min(longest, room) + SELECT_CHROME;
    const options = values.map((value) =>
      textWidth(value) <= room ? { value } : { value, label: truncate(value, room) },
    );
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
          ...(labelled ? { label: MOVE_LABEL } : {}),
          options,
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
    perRow: number,
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
          // perRow groups to a row; a narrow pane stacks the rest below (T-1B.9).
          ...Array.from({ length: Math.ceil(groups.length / perRow) }, (_, row) =>
            Box({
              flexDirection: "row",
              gap: 1,
              children: groups.slice(row * perRow, (row + 1) * perRow).map((category) =>
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
                          Text({
                            bold: true,
                            color: colorOf(column.token),
                            children: column.label,
                          }),
                        ],
                      }),
                      ...cards.map((card) => this.drawCard(ui, card, groupWidth)),
                      page === undefined ? undefined : this.drawPager(ui, page),
                    ]);
                  }),
                }),
              ),
            }),
          ),
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
              ...view.unplaced.map((card) => this.drawCard(ui, card, this.width)),
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

  /**
   * The Backlog as core pages it, at the page the person stepped to, with its columns sized to
   * the page drawn: the display id, type and assignee columns take their longest value up to a
   * cap, so a value that fits is drawn whole, and the title takes the rest of the width.
   */
  private backlogViewAt(width: number): BacklogView & BacklogColumns {
    const wide = width >= 90;
    const view = backlogView(this.shown().issues, {
      statuses: this.board.statuses,
      filter: this.filter,
      sort: this.sort,
      titleWidth: Number.POSITIVE_INFINITY,
      idWidth: Number.POSITIVE_INFINITY,
      pageSize: BACKLOG_PAGE_SIZE,
      page: this.backlogPage,
      ...(this.readyIds === undefined ? {} : { readyIds: this.readyIds }),
    });
    const longest = (values: readonly string[]) => Math.max(1, ...values.map(textWidth));
    const idCap = Math.max(10, Math.floor(width * (wide ? 0.28 : 0.3)));
    const idWidth = Math.min(idCap, longest(view.rows.map((row) => row.displayId)));
    const typeWidth = wide ? Math.min(12, longest(view.rows.map((row) => row.type))) : 0;
    const assigneeWidth = wide
      ? Math.min(24, longest(view.rows.map((row) => assigneeLabel(row.assignee))))
      : 0;
    const fixed = wide ? 3 + idWidth + typeWidth + assigneeWidth + 10 + 8 + 6 : 3 + idWidth + 6 + 3;
    const titleWidth = Math.max(10, width - fixed);
    return {
      ...view,
      rows: view.rows.map((row) => ({
        ...row,
        displayId: truncate(row.displayId, idWidth),
        type: truncate(row.type, typeWidth),
        assignee: truncate(assigneeLabel(row.assignee), assigneeWidth),
        title: truncate(row.title, titleWidth),
      })),
      wide,
      idWidth,
      typeWidth,
    };
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
    const view = this.backlogViewAt(width);
    const { page, wide, idWidth, typeWidth } = view;
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
                ? [Box({ width: typeWidth, children: [Text({ children: row.type })] })]
                : []),
              Box({
                flexGrow: 1,
                children: [Text({ wrap: "truncate-end", children: row.title })],
              }),
              ...(wide
                ? [
                    Text({ children: row.assignee }),
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
    const view = detailView(this.detail, { issues: this.board.issues, width, fieldWidth: left });
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
      if (editable === "type") {
        const types = [
          ...new Set([raw, ...ISSUE_TYPES, ...this.board.issues.map((one) => one.type)]),
        ].filter((type) => type !== "");
        return labelled(
          editable,
          field.label,
          Select({
            key: "edit:type",
            options: types.map((value) => ({ value })),
            value: raw,
            onSelect: (value) => void this.edit("type", value),
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
            children: [Text({ children: dep.line })],
          }),
        ),
        Text({ bold: true, children: `History, last ${view.events.length}` }),
        ...view.events.map((event, i) =>
          Box({
            key: `event:${i}`,
            children: [Text({ dimColor: true, children: event.line })],
          }),
        ),
      ]),
    });
  }
}
