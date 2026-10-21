import type { Elements, RenderElement, RenderNode, Timer } from "claude-code";

import {
  asOf,
  BOARD_CARD_LIMIT,
  type BoardEvent,
  type BoardState,
  type BoardView,
  backlogView,
  boardView,
  type CardView,
  COMMANDS,
  clockStamp,
  configCandidates,
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
  planDisplayId,
  planMove,
  type ResolvedConfig,
  readyArgv,
  reduceBoard,
  reduceDetail,
  resolveConfig,
  type SortSpec,
  STATUS_CATEGORIES,
  type SwimlaneMode,
  showArgv,
  sortLabel,
  statusesArgv,
  storeName,
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

export const PANE_ID = "beads";
export const PANE_TITLE = "Beads";

/** An open nobody asked for is withdrawn below this width (T-1.6). */
export const NARROW_COLUMNS = 110;
export const NARROW_TEXT = `beads-ui did not open its pane: it needs a terminal at least ${NARROW_COLUMNS} columns wide. Widen the terminal or run /beads.`;

/** Where the view preferences live in `$.store`. Issue data is never stored. */
export const PREFS_KEY = "view";

const READ_TIMEOUT_MS = 8_000;
const WRITE_TIMEOUT_MS = 15_000;
const BACKLOG_ROW_LIMIT = 60;

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

type Notice = { text: string; token: Token };

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
 * The `/beads` pane: its state, the bd reads and writes behind each action, and its drawing. It
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

  private env: { xdgConfigHome?: string; home?: string } = {};
  private refreshing = false;
  private queued = false;
  private timer: Timer | undefined;
  private timerMs = 0;

  async bind(host: Host): Promise<void> {
    this.host = host;
    const { xdgConfigHome, home } = await host
      .configEnv()
      .catch(() => ({ xdgConfigHome: undefined, home: undefined }));
    this.env = {
      ...(xdgConfigHome === undefined ? {} : { xdgConfigHome }),
      ...(home === undefined ? {} : { home }),
    };
    await this.loadPrefs();
    void this.refresh();
  }

  // ---- view preferences -------------------------------------------------------------------

  private async loadPrefs(): Promise<void> {
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

  // ---- bd ---------------------------------------------------------------------------------

  private async run(argv: readonly string[], timeoutMs: number): Promise<Ran> {
    const host = this.host;
    if (host === undefined) {
      return { ok: false, exitCode: null, stdout: "", stderr: "", message: "no session" };
    }
    try {
      const result = await host.run(argv, timeoutMs);
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
    const how = ran.exitCode === null ? "timed out or could not start" : `exit ${ran.exitCode}`;
    return `${what} failed (${how})${ran.message === "" ? "" : `: ${ran.message}`}`;
  }

  private async readConfig(): Promise<ResolvedConfig> {
    const host = this.host;
    if (host === undefined) return this.config;
    for (const path of configCandidates(host.cwd, this.env)) {
      const text = await host.readFile(path).catch(() => undefined);
      if (text !== undefined) return resolveConfig(text, host.cwd);
    }
    return resolveConfig(undefined, host.cwd);
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
      const full = this.isOpen;
      const [statuses, list, ready] = await Promise.all([
        this.run(statusesArgv(), READ_TIMEOUT_MS),
        this.run(listArgv(), READ_TIMEOUT_MS),
        full ? this.run(readyArgv(), READ_TIMEOUT_MS) : Promise.resolve(undefined),
      ]);
      this.applyReads(statuses, list, await this.stamp());
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

  private applyReads(statuses: Ran, list: Ran, at: string): void {
    if (!list.ok) {
      this.dispatch({ type: "load-failed", exitCode: list.exitCode, message: list.message });
      return;
    }
    const issues = parseBdList(list.stdout);
    if (!issues.ok) {
      this.dispatch({
        type: "load-failed",
        exitCode: list.exitCode,
        message: `unreadable output at ${issues.error.path}: ${issues.error.message}`,
      });
      return;
    }
    const parsedStatuses = statuses.ok ? parseBdStatuses(statuses.stdout) : undefined;
    const known = parsedStatuses?.ok === true ? parsedStatuses.value : this.board.statuses;
    if (known.length === 0) {
      this.dispatch({
        type: "load-failed",
        exitCode: statuses.exitCode,
        message: statuses.ok
          ? "bd statuses returned no statuses"
          : this.failure("bd statuses", statuses),
      });
      return;
    }
    this.dispatch({ type: "load-succeeded", issues: issues.value, statuses: known, at });
  }

  // ---- opening and closing ----------------------------------------------------------------

  /** `/beads` and `/bu`: close the open pane, else open it, as the person asked. */
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

  /** The pane closed, by `/beads` or by the person (Esc, the close mark). */
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
    const plan = planDisplayId({
      policy: this.config.config.idPolicy,
      issues: this.board.issues,
      createdId: id.value,
      title: parsed.value.title,
      child: false,
      random: Math.random,
    });
    if (!plan.ok) {
      this.note(`created ${id.value}; no display id: ${plan.error.message}`, "warning");
    } else if (plan.value.kind === "attach") {
      const attached = await this.run(plan.value.argv, WRITE_TIMEOUT_MS);
      this.note(
        attached.ok
          ? `created ${id.value} as ${plan.value.displayId}`
          : `created ${id.value}; ${this.failure("writing its display id", attached)}`,
        attached.ok ? "success" : "warning",
      );
    } else {
      this.note(`created ${id.value}`, "success");
    }
    await this.refresh();
  }

  submitFilter(text: string): void {
    this.filter = submitFilter(this.filter, text);
    this.savePrefs();
    this.host?.invalidate();
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    this.savePrefs();
    this.host?.invalidate();
  }

  cycleSwimlane(): void {
    this.swimlane = nextSwimlaneMode(this.swimlane);
    this.savePrefs();
    this.host?.invalidate();
  }

  cycleSort(): void {
    this.sort = nextSort(this.sort);
    this.savePrefs();
    this.host?.invalidate();
  }

  toggleHelp(): void {
    this.help = !this.help;
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
      this.note("focus a card first: Tab moves between cards", "warning");
      this.host?.invalidate();
      return;
    }
    if (this.tab !== "board") this.setTab("board");
    await this.host?.focus(PANE_ID, `move:${id}`).catch(() => undefined);
  }

  async focusQuickAdd(): Promise<void> {
    if (this.tab === "detail") this.setTab("board");
    await this.host?.focus(PANE_ID, "quickadd").catch(() => undefined);
  }

  async openDetailFor(id: string | undefined = this.target()): Promise<void> {
    if (id === undefined) {
      this.note("focus a card first: Tab moves between cards", "warning");
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
      this.note("focus a card first: Tab moves between cards", "warning");
      this.host?.invalidate();
      return;
    }
    this.undo = undefined;
    this.onDelete?.(issue, this.board.issues);
  }

  /** The confirmation finished: a Close instead leaves its undo here, then the board reloads. */
  afterConfirm(text: string, undo: UndoClose | undefined): void {
    this.note(text, "success");
    this.undo = undo;
    void this.refresh();
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
    const groups = STATUS_CATEGORIES.filter((category) =>
      this.board.statuses.some((status) => status.category === category),
    );
    const gaps = Math.max(0, groups.length - 1);
    const groupWidth = Math.max(12, Math.floor((width - gaps) / Math.max(1, groups.length)));
    const view = boardView(this.board, {
      columnWidth: groupWidth - 1,
      swimlane: this.swimlane,
      softWipLimit: this.config.config.softWipLimit,
      filter: this.filter.filter,
      sort: this.sort,
      cardLimit: BOARD_CARD_LIMIT,
      ...(this.readyIds === undefined ? {} : { readyIds: this.readyIds }),
    });
    const body =
      this.tab === "board"
        ? this.drawBoard(ui, view, groups, groupWidth)
        : this.tab === "backlog"
          ? this.drawBacklog(ui, width)
          : this.drawDetail(ui, width);
    return Box({
      flexDirection: "column",
      children: present<RenderNode>([
        this.drawHeader(ui),
        this.drawToolbar(ui),
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

  private line(ui: PaneUi, key: string, text: string, token: Token): RenderElement {
    return ui.Box({ key, children: [ui.Text({ color: colorOf(token), children: text })] });
  }

  private drawHeader(ui: PaneUi): RenderElement {
    const { Box, Text, Button } = ui;
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
        Text({ bold: true, children: storeName(this.host?.cwd ?? "") }),
        Text({
          dimColor: true,
          children: this.board.loadedAt === undefined ? "loading…" : asOf(this.board.loadedAt),
        }),
      ],
    });
  }

  private drawToolbar(ui: PaneUi): RenderElement {
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
          label: "/ ",
          placeholder: `filter: ${FILTER_KEYS.map((key) => `${key}:`).join(" ")}`,
          value: this.filter.text,
          submitLabel: "filter",
          onSubmit: (value) => this.submitFilter(value),
        }),
        Input({
          key: "quickadd",
          label: "+ ",
          placeholder: "new: title p0-p4 type:task @assignee +label due:YYYY-MM-DD sprint:name",
          value: this.quickAddText,
          submitLabel: "create",
          onSubmit: (value) => void this.quickAdd(value),
        }),
      ],
    });
  }

  private drawHelp(ui: PaneUi, helpRegion: RenderElement | undefined): RenderElement {
    const { Box, Text } = ui;
    const keys = COMMANDS.map((command) => `${command.hint}: ${command.label}`);
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

  private drawCard(ui: PaneUi, card: CardView, order: string[]): RenderElement {
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
          options: [status, ...order.filter((name) => name !== status)].map((value) => ({ value })),
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
    const { Box, Text } = ui;
    if (view.loading) {
      return Box({
        key: "board",
        children: [Text({ dimColor: true, children: "reading the store…" })],
      });
    }
    const order = view.columns.map((column) => column.status);
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
                  const hidden = lane.hidden[i] ?? 0;
                  return present<RenderNode>([
                    Box({
                      key: `column:${lane.key}:${column.status}`,
                      children: [
                        Text({ bold: true, color: colorOf(column.token), children: column.label }),
                      ],
                    }),
                    ...cards.map((card) => this.drawCard(ui, card, order)),
                    hidden === 0
                      ? undefined
                      : Text({ dimColor: true, children: `+${hidden} more; narrow the filter` }),
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
            children: [
              Text({ bold: true, children: "Statuses bd statuses did not list" }),
              ...view.unplaced.map((card) => this.drawCard(ui, card, order)),
            ],
          });
    return Box({ key: "board", flexDirection: "column", children: present([...lanes, unplaced]) });
  }

  private drawBacklog(ui: PaneUi, width: number): RenderElement {
    const { Box, Text, Button } = ui;
    const idWidth = Math.min(32, Math.max(10, Math.floor(width * 0.28)));
    const fixed = 3 + idWidth + 8 + 12 + 10 + 8 + 6;
    const view = backlogView(this.board.issues, {
      statuses: this.board.statuses,
      filter: this.filter,
      sort: this.sort,
      titleWidth: Math.max(10, width - fixed),
      idWidth,
      ...(this.readyIds === undefined ? {} : { readyIds: this.readyIds }),
    });
    const shown = view.rows.slice(0, BACKLOG_ROW_LIMIT);
    const cut = view.rows.length - shown.length;
    return Box({
      key: "backlog",
      flexDirection: "column",
      children: present<RenderNode>([
        Box({
          key: "backlog-count",
          children: [
            Text({
              dimColor: true,
              children: `${view.rows.length} of ${view.total} open issues, ${sortLabel(this.sort)} order`,
            }),
          ],
        }),
        ...shown.map((row) =>
          Box({
            key: `row:${row.id}`,
            flexDirection: "row",
            gap: 1,
            children: [
              Text({ color: colorOf(row.priorityToken), children: row.priority }),
              Box({
                width: idWidth,
                children: [Text({ dimColor: true, children: row.displayId })],
              }),
              Box({ width: 8, children: [Text({ children: truncate(row.type, 8) })] }),
              Box({ flexGrow: 1, children: [Text({ children: row.title })] }),
              Text({ children: truncate(row.assignee === "" ? "" : `@${row.assignee}`, 12) }),
              Text({ dimColor: true, children: row.created }),
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
        cut === 0
          ? undefined
          : Text({ dimColor: true, children: `+${cut} more; narrow the filter` }),
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
    const left = Math.max(30, Math.floor(width * 0.45));
    const view = detailView(this.detail, { issues: this.board.issues, width: left - 14 });
    const statuses = this.board.statuses.map((status) => ({ value: status.name }));
    const fields = view.fields.map((field) => {
      const raw = field.raw ?? field.value;
      const editable = field.editable;
      if (editable === "status" && statuses.length > 0) {
        return Select({
          key: "edit:status",
          label: "Status",
          options: statuses.some((option) => option.value === raw)
            ? statuses
            : [{ value: raw }, ...statuses],
          value: raw,
          onSelect: (value) => void this.edit("status", value),
        });
      }
      if (editable === "priority") {
        return Select({
          key: "edit:priority",
          label: "Priority",
          options: [0, 1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${p}` })),
          value: raw,
          onSelect: (value) => void this.edit("priority", value),
        });
      }
      if (editable !== undefined) {
        return Input({
          key: `edit:${editable}`,
          label: `${field.label}: `,
          value: raw,
          submitLabel: "save",
          onSubmit: (value) => void this.edit(editable, value),
        });
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
          flexDirection: "row",
          gap: 2,
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
