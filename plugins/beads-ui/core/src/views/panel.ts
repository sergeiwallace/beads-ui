// The task panel's Tasks view (T-2B.2): the session's own tasks, in progress first, then
// blocked, then open, the first `shown` drawn and the rest collapsed behind a "+M more" control,
// as the collapse rule says. Pure: the element tree draws it now, and a Client later (D-31).

import type { Issue, Status } from "../model.ts";
import { sortIssues } from "../sort.ts";
import { priorityToken, type Token } from "../tokens.ts";
import { truncate } from "./text.ts";

/** `rest`: everything past the shown count collapses; `open`: only open tasks do; `none`: no collapse. */
export const COLLAPSE_RULES = ["rest", "open", "none"] as const;
export type CollapseRule = (typeof COLLAPSE_RULES)[number];

export const COLLAPSE_LABELS: Readonly<Record<CollapseRule, string>> = {
  rest: "collapse every task past the shown count",
  open: "always show in-progress and blocked tasks; collapse open ones past the count",
  none: "show every task",
};

/** D-32: both task panels, the beads-ui one alone, or Claude Code's alone. Its effect is T-2B.7's. */
export const PANEL_MODES = ["both", "beads", "native"] as const;
export type PanelMode = (typeof PANEL_MODES)[number];

export const PANEL_MODE_LABELS: Readonly<Record<PanelMode, string>> = {
  both: "both task panels",
  beads: "the beads-ui panel only",
  native: "the Claude Code panel only",
};

export interface PanelSettings {
  shown: number;
  collapse: CollapseRule;
  mode: PanelMode;
}

export const DEFAULT_PANEL_SETTINGS: PanelSettings = { shown: 10, collapse: "rest", mode: "both" };
/** The most tasks `panel.shown` may draw before the rest collapse. */
export const MAX_SHOWN = 200;

export const isCollapseRule = (value: unknown): value is CollapseRule =>
  typeof value === "string" && (COLLAPSE_RULES as readonly string[]).includes(value);
export const isPanelMode = (value: unknown): value is PanelMode =>
  typeof value === "string" && (PANEL_MODES as readonly string[]).includes(value);
export const isShownCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_SHOWN;

export type TaskGroup = "in_progress" | "blocked" | "open";
export const TASK_GROUPS: readonly TaskGroup[] = ["in_progress", "blocked", "open"];

/** bd's own glyph for each group's status (`bd statuses`). */
export const TASK_GLYPHS: Readonly<Record<TaskGroup, string>> = {
  in_progress: "◐",
  blocked: "●",
  open: "○",
};

/**
 * A task's group: `blocked` by name; in progress for every other work-in-progress status
 * (in_progress, hooked, review, uat); open for the active category. Deferred, pinned and done
 * issues are not tasks the panel lists.
 */
export function taskGroupOf(issue: Issue, statuses: readonly Status[]): TaskGroup | undefined {
  if (issue.status === "blocked") return "blocked";
  const category =
    statuses.find((status) => status.name === issue.status)?.category ??
    (issue.status === "open" ? "active" : issue.status === "in_progress" ? "wip" : undefined);
  if (category === "wip") return "in_progress";
  if (category === "active") return "open";
  return undefined;
}

/** The tasks in the order the panel lists them: by group, then priority, then age. */
export function panelTasks(issues: readonly Issue[], statuses: readonly Status[]): Issue[] {
  const byGroup = new Map<TaskGroup, Issue[]>(TASK_GROUPS.map((group) => [group, []]));
  for (const issue of issues) {
    const group = taskGroupOf(issue, statuses);
    if (group !== undefined) byGroup.get(group)?.push(issue);
  }
  return TASK_GROUPS.flatMap((group) => sortIssues(byGroup.get(group) ?? []));
}

export interface TaskRowView {
  id: string;
  group: TaskGroup;
  glyph: string;
  priorityToken: Token;
  /** The row as drawn: glyph, priority, display id and title, cut to the row's width. */
  label: string;
}

export interface TaskListView {
  /** The rows drawn, in order. */
  rows: TaskRowView[];
  /** Every task the list holds, collapsed ones included. */
  total: number;
  counts: Readonly<Record<TaskGroup, number>>;
  /** Tasks the collapse rule holds back; 0 when expanded or nothing collapses. */
  hidden: number;
  /** True when a "+M more" control is drawn: something collapses, or the list is expanded. */
  collapsible: boolean;
  expanded: boolean;
  /** The "+M more" control's label, or the one that collapses the list again. */
  moreLabel: string;
  /** With a row window (short height): rows before and after the window, not drawn. */
  above: number;
  below: number;
}

export interface TaskListOptions {
  statuses: readonly Status[];
  settings: PanelSettings;
  expanded: boolean;
  /** Columns for a row's label. */
  width: number;
  /** The task the focus ring is on, kept inside the window. */
  focusedId?: string;
  /** At short height: the most rows drawn, a window kept round the focused task. */
  windowRows?: number;
}

/** How many of `tasks` the rule draws before the rest collapse. */
function drawnCount(tasks: readonly TaskRowView[], settings: PanelSettings): number {
  if (settings.collapse === "none") return tasks.length;
  if (settings.collapse === "open") {
    const pinned = tasks.filter((task) => task.group !== "open").length;
    return Math.min(tasks.length, Math.max(pinned, settings.shown));
  }
  return Math.min(tasks.length, settings.shown);
}

export function taskListView(issues: readonly Issue[], options: TaskListOptions): TaskListView {
  const tasks = panelTasks(issues, options.statuses).map((issue): TaskRowView => {
    const group = taskGroupOf(issue, options.statuses) ?? "open";
    const glyph = TASK_GLYPHS[group];
    return {
      id: issue.id,
      group,
      glyph,
      priorityToken: priorityToken(issue.priority),
      label: truncate(
        `${glyph} P${issue.priority} ${issue.displayId ?? issue.id} ${issue.title}`,
        options.width,
      ),
    };
  });
  const counts = { in_progress: 0, blocked: 0, open: 0 };
  for (const task of tasks) counts[task.group]++;
  const drawn = drawnCount(tasks, options.settings);
  const collapsible = drawn < tasks.length;
  const visible = options.expanded ? tasks : tasks.slice(0, drawn);
  const hidden = tasks.length - visible.length;
  let rows = visible;
  let above = 0;
  let below = 0;
  const limit = options.windowRows;
  if (limit !== undefined && limit >= 1 && visible.length > limit) {
    const at = Math.max(
      0,
      visible.findIndex((task) => task.id === options.focusedId),
    );
    // The focused row and, while there is one, the row after it, so Down always reaches a drawn
    // row and the window follows the focus.
    const end = Math.min(visible.length, Math.max(limit, at + 2));
    const start = Math.max(0, end - limit);
    rows = visible.slice(start, end);
    above = start;
    below = visible.length - end;
  }
  return {
    rows,
    total: tasks.length,
    counts,
    hidden,
    collapsible,
    expanded: options.expanded && collapsible,
    moreLabel: options.expanded ? "show fewer" : `+${hidden} more`,
    above,
    below,
  };
}

/** The panel settings the pane changed, kept in `$.store` until Save to file writes them. */
export interface PanelOverrides {
  shown?: number;
  collapse?: CollapseRule;
  mode?: PanelMode;
}

export function panelOverridesOf(value: unknown): PanelOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    ...(isShownCount(record.shown) ? { shown: record.shown } : {}),
    ...(isCollapseRule(record.collapse) ? { collapse: record.collapse } : {}),
    ...(isPanelMode(record.mode) ? { mode: record.mode } : {}),
  };
}

export const withPanelOverrides = (
  settings: PanelSettings,
  overrides: PanelOverrides,
): PanelSettings => ({ ...settings, ...overrides });

/** Reads what the Shown tasks field holds: a whole number from 1 to MAX_SHOWN. */
export function parseShownCount(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return isShownCount(value) ? value : undefined;
}
