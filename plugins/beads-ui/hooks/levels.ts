import type { RenderElement, RenderNode } from "claude-code";

import {
  type BandLine,
  type BandPart,
  type BandRowView,
  type BandSettings,
  type BandTask,
  bandRowsView,
  buttonWidth,
  CONTROL_HOTKEYS,
  DEFAULT_BAND_SETTINGS,
  type Disclosure,
  type DisclosureEvent,
  disclosureOf,
  glyphOf,
  gutterColumns,
  type IndicatorRead,
  indicatorRead,
  isRowGroup,
  orderTasks,
  plannedText,
  ROW_GROUPS,
  type RowGroup,
  reduceDisclosure,
  rowLabelColumns,
  settleDisclosure,
  storeName,
  summaryPieces,
  taskRowView,
  truncate,
} from "../core/src/index.ts";
import { bandSurface, type Surface, type SurfaceUi } from "./components/adapters.ts";
import {
  aboveNote,
  controlsRow,
  countRows,
  indented,
  type LevelControls,
  moreLabel,
  ROW_INDENT,
  summaryLine,
} from "./components/band.ts";
import { enabledIndicators, gutterFor } from "./components/indicators.ts";
import { colorOf } from "./components/look.ts";
import { bandNav, navBar } from "./components/nav.ts";
import type { Host } from "./host.ts";
import type { BeadsPane } from "./pane.ts";
import type { BandTally } from "./tally.ts";

/** Where each session's chosen level lives in `$.store`, by session name (D-36). */
export const BAND_LEVEL_KEY = "band-level";

/** The band's pane toggle (D-27, D-43, T-2C.14): its keys. */
export const BEADS_BUTTON_KEY = "beads-band:open";
export const PANE_CLOSE_KEY = "beads-band:close";
export const EXPAND_KEY = "band:expand";
export const OVERVIEW_KEY = "band:overview";

/** The band's height when the engine names none: BAND_PROPS' 10, the test kit's. */
const DEFAULT_MAX_ROWS = 10;
/**
 * The fewest rows the overview hands a view the framework draws: the Tasks view's count, edges
 * and "+M more" take 4 of them, so it draws at least one task. Below it, the view's note says so.
 */
export const MIN_VIEW_ROWS = 5;

/** One count's rows as last read: its tasks, the stores that failed, and the count they match. */
interface Read {
  tasks: BandTask[];
  failed: string[];
  count: number | undefined;
  reading: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

/**
 * The band's disclosure levels (D-36, T-2C.2): the summary line, every count a button and the
 * expand, overview and pane controls right after its text; a count's task rows under its line,
 * `band.rows` at a time with "+M more", collapse and summary; and the overview, the views the
 * view registry draws on the band, under a nav generated from it. The level a session last chose
 * is kept in `$.store` under its name, and a new `band.level` replaces it at the next redraw.
 */
export class BandLevels {
  host: Host | undefined;
  private kept: Disclosure | undefined;
  private loaded = false;
  private readonly reads = new Map<string, Read>();

  constructor(
    private readonly tally: BandTally,
    private readonly pane: BeadsPane,
    private readonly session: () => string | undefined,
  ) {
    tally.onRecount = (wrote) => this.recount(wrote);
    pane.onBandOpen = (id) => this.press({ type: "open", id });
  }

  async bind(host: Host): Promise<void> {
    this.host = host;
    const held = await host.storeGet(BAND_LEVEL_KEY).catch(() => undefined);
    const mine = isRecord(held) ? held[this.session() ?? ""] : undefined;
    this.kept = disclosureOf(mine);
    this.loaded = true;
    this.recount(false);
  }

  private get settings(): BandSettings {
    return this.tally.drawnSettings ?? DEFAULT_BAND_SETTINGS;
  }

  /** The line the expand control and a rows-level start open: the session's own. */
  private ownLine(): string {
    const lines = this.tally.lines;
    return lines.find((line) => line.key === "own")?.key ?? lines[0]?.key ?? "own";
  }

  /** The state drawn now: the kept one, settled against band.level and band.rows. */
  state(): Disclosure {
    const settled = settleDisclosure(this.kept, this.settings, this.ownLine());
    if (this.loaded && settled !== this.kept) {
      this.kept = settled;
      this.save();
    }
    return settled;
  }

  /** A press on the band: the new state, kept for the session, and its rows read. */
  press(event: DisclosureEvent): void {
    this.kept = reduceDisclosure(this.state(), event, this.settings);
    this.save();
    this.recount(false);
    this.host?.invalidate();
  }

  private save(): void {
    const host = this.host;
    const state = this.kept;
    if (host === undefined || state === undefined) return;
    const name = this.session() ?? "";
    void host
      .storeGet(BAND_LEVEL_KEY)
      .then((held) =>
        host.storeSet(BAND_LEVEL_KEY, { ...(isRecord(held) ? held : {}), [name]: state }),
      )
      .catch(() => undefined);
  }

  /** The row groups a state's rows draw: one status, every status for total, none for a store count. */
  private groupsOf(part: BandPart): RowGroup[] {
    if (part === "total") return [...ROW_GROUPS];
    return isRowGroup(part) ? [part] : [];
  }

  /**
   * Reads the open count's rows when it has none yet, when its count moved since they were read,
   * or (`wrote`) after this session's write. Each read redraws the band when it lands.
   */
  private recount(wrote: boolean): void {
    // After a write every read is stale, one under way too, but its tasks stay drawn (and a
    // detail stays readable) until the next read lands: NaN matches no count.
    if (wrote) {
      for (const [key, read] of this.reads) {
        this.reads.set(key, { ...read, count: Number.NaN, reading: false });
      }
    }
    if (!this.loaded) return;
    const state = this.state();
    const wanted = state.level === "rows" ? this.groupsOf(state.part) : [];
    for (const group of wanted) {
      const key = `${state.line}:${group}`;
      const count = this.tally.countOf(state.line, group);
      const held = this.reads.get(key);
      if (held !== undefined && (held.reading || held.count === count)) continue;
      const pending: Read = {
        tasks: held?.tasks ?? [],
        failed: held?.failed ?? [],
        count,
        reading: true,
      };
      this.reads.set(key, pending);
      void this.tally
        .readTasks(state.line, group)
        .then((read) => {
          // A write since cleared this read, and a newer one is under way: it draws instead.
          if (this.reads.get(key) !== pending) return;
          this.reads.set(key, {
            tasks: read?.tasks ?? [],
            failed: read?.failed ?? [],
            count,
            reading: false,
          });
          this.host?.invalidate();
        })
        .catch(() => this.reads.delete(key));
    }
  }

  /**
   * What a task row's indicators read (D-41): the pane's board when the task is in the pane's
   * store, which holds every issue of it not closed, and every task the band read in the store.
   */
  private readFor(store: string): IndicatorRead {
    const trim = (path: string) => path.replace(/\/+$/, "");
    const issues = new Map(
      trim(store) === trim(this.pane.storePath())
        ? this.pane.board.issues.map((issue) => [issue.id, issue])
        : [],
    );
    for (const read of this.reads.values()) {
      for (const task of read.tasks) {
        if (trim(task.store) === trim(store)) issues.set(task.issue.id, task.issue);
      }
    }
    return indicatorRead([...issues.values()]);
  }

  /** The rows a state draws under its line, in the Tasks view's order. */
  private rowsOf(
    state: Disclosure,
    width: number,
    columns: number,
  ): { items: BandRowView[]; status?: string } {
    const part = state.part;
    if (part === "drift") {
      const read = this.tally.readOf(state.line);
      const items = (read?.stores ?? [])
        .filter((store) => !store.synced)
        .map((store) => ({
          key: `band-store:${store.path}`,
          token: "warning" as const,
          label: truncate(`${store.name}: not in step with the pair (${store.path})`, width),
        }));
      return { items };
    }
    if (part === "unpublished") {
      const items = (this.tally.sync?.pendingStores ?? []).map((one) => ({
        key: `band-store:${one.store}`,
        token: one.failed ? ("error" as const) : ("accent" as const),
        label: truncate(
          `${storeName(one.store)}: ${one.unpublished} unpublished${one.failed ? ", publish failed" : ""}`,
          width,
        ),
      }));
      return { items };
    }
    const groups = this.groupsOf(part);
    const held = groups.map((group) => this.reads.get(`${state.line}:${group}`));
    const byGroup: Partial<Record<RowGroup, BandTask[]>> = {};
    groups.forEach((group, i) => {
      byGroup[group] = held[i]?.tasks ?? [];
    });
    const storeReads = new Map<string, IndicatorRead>();
    const readOf = (store: string) => {
      const read = storeReads.get(store) ?? this.readFor(store);
      storeReads.set(store, read);
      return read;
    };
    const labelWidth = Math.max(1, width - gutterColumns(enabledIndicators(), columns));
    const items = orderTasks(byGroup).map((task) => ({
      ...taskRowView(task, labelWidth),
      gutter: gutterFor(task.issue, readOf(task.store), columns),
    }));
    const failed = [...new Set(held.flatMap((read) => read?.failed ?? []))];
    const reading = held.some((read) => read === undefined || read.reading);
    const status =
      reading && items.length === 0
        ? `reading the tasks${glyphOf("text.more")}`
        : failed.length > 0
          ? `not read from ${failed.join(", ")}`
          : items.length === 0
            ? "no tasks"
            : undefined;
    return status === undefined ? { items } : { items, status: truncate(status, width) };
  }

  /** The issue a detail is about: from the rows read, else from the pane's board. */
  private issueOf(id: string): BandTask | undefined {
    for (const read of this.reads.values()) {
      const task = read.tasks.find((one) => one.issue.id === id);
      if (task !== undefined) return task;
    }
    const issue = this.pane.board.issues.find((one) => one.id === id);
    return issue === undefined ? undefined : { issue, store: this.pane.storePath() };
  }

  /**
   * The band, at the level the session chose, within `columns` and `maxRows`. Nothing is drawn
   * until the tally has lines, so a session with no store shows no band.
   */
  draw(
    elements: SurfaceUi,
    size: { columns: number; maxRows?: number },
    toggle: { open: boolean; onOpen: () => void; onClose: () => void },
  ): RenderElement | undefined {
    const lines = this.tally.lines;
    if (lines.length === 0) return undefined;
    const columns = Math.max(1, size.columns);
    const maxRows = Math.max(1, size.maxRows ?? DEFAULT_MAX_ROWS);
    const state = this.state();
    const surface = bandSurface(elements, { columns, maxRows });
    const { Box, Button } = surface.ui;
    const controls = [
      Button({
        key: EXPAND_KEY,
        label: glyphOf("band.expand"),
        hotkey: CONTROL_HOTKEYS.expand,
        plain: true,
        onPress: () => this.press({ type: "expand", line: this.ownLine() }),
      }),
      Button({
        key: OVERVIEW_KEY,
        label: glyphOf("band.overview"),
        hotkey: CONTROL_HOTKEYS.overview,
        plain: true,
        onPress: () => this.press({ type: "overview" }),
      }),
      Button({ key: BEADS_BUTTON_KEY, label: glyphOf("pane.open"), onPress: toggle.onOpen }),
      ...(toggle.open
        ? [Button({ key: PANE_CLOSE_KEY, label: glyphOf("pane.close"), onPress: toggle.onClose })]
        : []),
    ];
    const controlColumns =
      buttonWidth(glyphOf("band.expand"), CONTROL_HOTKEYS.expand) +
      buttonWidth(glyphOf("band.overview"), CONTROL_HOTKEYS.overview) +
      buttonWidth(glyphOf("pane.open")) * (toggle.open ? 2 : 1) +
      controls.length;
    const drawLine = (line: BandLine, i: number) => {
      const room = i === 0 ? columns - controlColumns : columns;
      const pieces = summaryPieces(line, Math.max(0, room));
      const text = summaryLine(surface, line, pieces, {
        color: colorOf,
        press: (part) => this.press({ type: "count", line: line.key, part }),
      });
      if (i > 0) return text;
      return Box({
        key: "beads-band:first",
        flexDirection: "row",
        columnGap: 1,
        children: [text, ...controls],
      });
    };
    const drawnLines = lines.slice(0, maxRows);
    const left = maxRows - drawnLines.length;
    const blocks: RenderNode[] = drawnLines.map(drawLine);
    if (state.level === "rows" && left >= 1) {
      const at = Math.max(
        0,
        drawnLines.findIndex((line) => line.key === state.line),
      );
      blocks.splice(at + 1, 0, this.drawRows(surface, state, columns, left));
    } else if (state.level === "overview" && left >= 1) {
      blocks.push(this.drawOverview(elements, state, columns, left));
    }
    return Box({ key: "beads-band", flexDirection: "column", children: blocks });
  }

  /** The rows level: the open count's rows under its line and their controls, in `budget` rows. */
  private drawRows(
    surface: Surface,
    state: Disclosure,
    columns: number,
    budget: number,
  ): RenderElement {
    const settings = this.settings;
    const width = rowLabelColumns(columns, ROW_INDENT);
    const { items, status } = this.rowsOf(state, width, columns);
    const rowBudget = budget - 1 - (status === undefined ? 0 : 1);
    const view = bandRowsView(items, {
      shown: state.shown,
      rows: settings.rows,
      budget: rowBudget,
    });
    const controls: LevelControls = {
      ...(view.more > 0
        ? { more: { label: moreLabel(view.more), press: () => this.press({ type: "more" }) } }
        : {}),
      ...(view.collapsible ? { collapse: () => this.press({ type: "collapse" }) } : {}),
      summary: () => this.press({ type: "summary" }),
      ...(view.above > 0 ? { note: aboveNote(view.above) } : {}),
    };
    if (rowBudget < 0) return controlsRow(surface, "band-rows:controls", controls);
    return countRows(surface, view, {
      color: colorOf,
      open: (id) => this.press({ type: "open", id }),
      ...(status === undefined || rowBudget < 1 ? {} : { status }),
      controls,
    });
  }

  /**
   * The overview (D-36): the nav the view registry gives the band, and the chosen view drawn
   * through the band adapter, or the detail of the task pressed, all in `budget` rows. A view the
   * framework does not draw yet (T-2C.8) says so and opens in the pane.
   */
  private drawOverview(
    elements: SurfaceUi,
    state: Disclosure,
    columns: number,
    budget: number,
  ): RenderElement {
    const entries = this.pane.viewsOn("band");
    const active = state.detail !== undefined ? "detail" : state.view;
    const nav = bandNav(columns, entries, active);
    const summary = () => this.press({ type: "summary" });
    const plain = bandSurface(elements, { columns, maxRows: budget });
    const controls = controlsRow(plain, "band-overview:controls", {
      summary,
      ...(state.detail === undefined ? {} : { back: () => this.press({ type: "back" }) }),
    });
    const bodyRows = budget - nav.rows.length - 1;
    const { Box, Text, Button } = plain.ui;
    if (bodyRows < 1) {
      return Box({ key: "beads-band:overview", flexDirection: "column", children: [controls] });
    }
    const surface = bandSurface(
      elements,
      { columns, maxRows: bodyRows },
      { start: state.start, to: (start) => this.press({ type: "scroll", start }) },
    );
    const entry = entries.find((one) => one.view === state.view);
    const note = (text: string, action?: { key: string; label: string; press: () => void }) =>
      Box({
        key: "band-overview:note",
        flexDirection: "column",
        children: present<RenderNode>([
          Text({ dimColor: true, wrap: "truncate-end", children: truncate(text, columns) }),
          action === undefined || bodyRows < 2
            ? undefined
            : Button({ key: action.key, label: action.label, plain: true, onPress: action.press }),
        ]),
      });
    const inPane = (view: string, label: string) => ({
      key: `band-pane:${view}`,
      label: `${glyphOf("pane.open")} open ${label} in the pane`,
      press: () => {
        this.pane.setTab(view);
        void this.pane.openOrFocus();
      },
    });
    let body: RenderNode;
    if (state.detail !== undefined) {
      body = this.drawDetail(surface, state.detail, bodyRows);
    } else if (entry === undefined) {
      body = note("This view is not drawn on the band: Settings' surfaces keep it to the pane.");
    } else if (entry.planned) {
      body = note(plannedText(entry.view as "sprint"));
    } else if (entry.draw !== undefined) {
      body =
        bodyRows >= MIN_VIEW_ROWS
          ? entry.draw(surface)
          : note(
              `${entry.labels.wide} needs ${MIN_VIEW_ROWS} of the band's rows and has ${bodyRows} here.`,
              inPane(entry.view, entry.labels.wide),
            );
    } else if (entry.view === "detail") {
      body = note("Press a task's row to see its detail here.");
    } else {
      body = note(
        `${entry.labels.wide} draws in the pane until it moves onto the shared components.`,
        inPane(entry.view, entry.labels.wide),
      );
    }
    return Box({
      key: "beads-band:overview",
      flexDirection: "column",
      children: [
        navBar(plain, nav, (item) => this.press({ type: "view", view: item.view })),
        body,
        controls,
      ],
    });
  }

  /** A task's detail in the overview: its row, its fields, and a button to open it in the pane. */
  private drawDetail(surface: Surface, id: string, rows: number): RenderElement {
    const { Box, Text, Button } = surface.ui;
    const width = surface.columns;
    const task = this.issueOf(id);
    if (task === undefined) {
      return Box({
        key: "band-detail",
        children: [Text({ dimColor: true, children: truncate(`${id}: not read yet`, width) })],
      });
    }
    const { issue } = task;
    const head = taskRowView(task, width);
    const fields = [
      `${issue.status}, ${issue.type}${issue.assignee === undefined ? "" : `, @${issue.assignee}`}`,
      issue.parent === undefined ? undefined : `parent ${issue.parent}`,
      `${storeName(task.store)}, updated ${issue.updatedAt}${issue.closedAt === undefined ? "" : `, closed ${issue.closedAt}`}`,
    ].filter((one): one is string => one !== undefined);
    const ownStore = task.store.replace(/\/+$/, "") === this.pane.storePath().replace(/\/+$/, "");
    const children = present<RenderNode>([
      Text({ bold: true, color: colorOf(head.token), wrap: "truncate-end", children: head.label }),
      ...fields.map((field) =>
        indented(surface, `band-detail:${field.slice(0, 8)}`, [
          Text({
            dimColor: true,
            wrap: "truncate-end",
            children: truncate(field, width - ROW_INDENT),
          }),
        ]),
      ),
      ownStore
        ? Button({
            key: `band-detail:pane:${issue.id}`,
            label: `${glyphOf("pane.open")} open in the pane`,
            plain: true,
            onPress: () =>
              void this.pane.openOrFocus().then(() => this.pane.openDetailFor(issue.id)),
          })
        : undefined,
    ]);
    return Box({ key: "band-detail", flexDirection: "column", children: children.slice(0, rows) });
  }
}
