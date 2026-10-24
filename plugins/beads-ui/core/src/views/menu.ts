// Every action the task panel offers, as data (T-2B.4): the toolbar, the list's own controls and
// the nav draw their keys from it, and the options menu lists the same actions with those keys,
// so no action is reachable only one way. A Client drawing (T-2B.5) reads the same lists.

import { commandById } from "../commands.ts";
import { type Labels, labels } from "../layout.ts";
import { hotkeyOf, navEntries, type PanelView } from "./nav.ts";
import type { TaskListView } from "./panel.ts";

export interface PanelAction {
  /** The COMMANDS id: its hotkey and the help's line. */
  command: string;
  /** The drawn control's element key. */
  key: string;
  labels: Labels;
  /** Where the control is drawn: the toolbar, or inside the view (a pager, the list's "+M more"). */
  place: "toolbar" | "view";
  /** True for an action on the focused task. */
  task: boolean;
}

/** What the drawn view offers right now. */
export interface ActionContext {
  view: PanelView;
  mine: boolean;
  swimlane: string;
  sort: string;
  undo: boolean;
  /** The Board or Backlog draws more than one page. */
  paged: boolean;
  /** The Board's swimlanes take more than one page. */
  lanesPaged: boolean;
  bandSettings: boolean;
  /** The Tasks view's "+M more" control, when it is drawn. */
  more?: string;
  /** `panel.mode = native`: the nav, and so the menu's Go to section, has no Tasks entry (T-2B.7). */
  hideTasks?: boolean;
}

const action = (
  command: string,
  key: string,
  l: Labels,
  options: { place?: PanelAction["place"]; task?: boolean } = {},
): PanelAction => ({
  command,
  key,
  labels: l,
  place: options.place ?? "toolbar",
  task: options.task ?? false,
});

/** The actions the drawn view offers, toolbar first, in the order they are drawn. */
export function panelActions(ctx: ActionContext): PanelAction[] {
  const scope = action(
    "view.scope",
    "scope",
    labels(ctx.mine ? "Showing: mine" : "Showing: all", ctx.mine ? "Mine" : "All"),
  );
  const menu = action("panel.menu", "menu", labels("Menu"));
  const help = action("help", "help", labels("Help"));
  const band = ctx.bandSettings
    ? action("band.settings", "band-settings", labels("Band"))
    : undefined;
  const create = action("issue.new", "new", labels("New"));
  const del = action("card.delete", "delete", labels("Delete", "Delete", "Del"), { task: true });
  const undo = ctx.undo ? action("close.undo", "undo", labels("Undo close", "Undo")) : undefined;
  const list: (PanelAction | undefined)[] =
    ctx.view === "settings"
      ? [menu, help]
      : ctx.view === "tasks"
        ? [
            scope,
            create,
            action("card.detail", "detail", labels("Open"), { task: true }),
            action("card.move", "move", labels("Status", "Stat"), { task: true }),
            action("card.edit", "edit", labels("Edit"), { task: true }),
            del,
            undo,
            menu,
            band,
            help,
            ctx.more === undefined
              ? undefined
              : action("tasks.more", "tasks:more", labels(ctx.more), { place: "view" }),
          ]
        : [
            scope,
            action(
              "board.swimlane",
              "swimlane",
              labels(`Swimlane: ${ctx.swimlane}`, `Lanes: ${ctx.swimlane}`, "Lanes"),
            ),
            action("view.sort", "sort", labels(`Sort: ${ctx.sort}`, `Sort: ${ctx.sort}`, "Sort")),
            create,
            action("card.detail", "detail", labels("Detail", "Detail", "Dtl"), { task: true }),
            action("card.move", "move", labels("Move to", "Move"), { task: true }),
            del,
            undo,
            ctx.paged ? action("page.next", "page-next", labels("Next page", "Next")) : undefined,
            ctx.paged ? action("page.back", "page-back", labels("Page back", "Back")) : undefined,
            band,
            menu,
            help,
            ctx.lanesPaged
              ? action("board.lanes", "lanes-next", labels("more lanes"), { place: "view" })
              : undefined,
          ];
  return list.filter((item): item is PanelAction => item !== undefined);
}

export interface MenuItem {
  command: string;
  /** The menu row's element key. */
  key: string;
  hotkey: string;
  label: string;
}

export interface MenuSection {
  key: string;
  title: string;
  items: MenuItem[];
}

export interface MenuView {
  sections: MenuSection[];
}

const itemOf = (command: string): MenuItem => {
  const found = commandById(command);
  return {
    command,
    key: `menu:item:${command}`,
    hotkey: hotkeyOf(command),
    label: found?.label ?? command,
  };
};

/**
 * The options menu: the focused task's actions, then the view's, then the nav's, each with the
 * key that presses it. `task` names the focused task, when there is one.
 */
export function menuView(ctx: ActionContext, task?: string): MenuView {
  const actions = panelActions(ctx);
  return {
    sections: [
      {
        key: "menu:task",
        title: task === undefined ? "Focused task (focus one first)" : `Task ${task}`,
        items: actions.filter((one) => one.task).map((one) => itemOf(one.command)),
      },
      {
        key: "menu:view",
        title: "This view",
        items: actions.filter((one) => !one.task).map((one) => itemOf(one.command)),
      },
      {
        key: "menu:nav",
        title: "Go to",
        items: navEntries(ctx.hideTasks).map((entry) => itemOf(entry.command)),
      },
    ],
  };
}

/** A menu row as drawn: its key, then its label, as a plain Button with a hotkey reads. */
export const menuItemText = (item: MenuItem): string => `${item.hotkey}: ${item.label}`;

// The Tasks view's Client (T-2B.5, D-31): the rows it draws and the keys it hands back, as the
// plain data a Client's props carry, and the messages it posts, read back as untrusted input.

/** A key the Client hands back while it has the focus, and the command it runs. */
export interface ClientKey {
  key: string;
  command: string;
}

export interface TaskClientRow {
  id: string;
  label: string;
}

/** What the hooks hand the task list's Client: rows and keys, never behaviour. */
export interface TaskClientProps {
  rows: TaskClientRow[];
  /** The task the panel's focus is on: a left click on it opens it. */
  selected?: string;
  /** The row the options menu is drawn under, and the rows of room the Client leaves for it. */
  gapAfter?: string;
  gapRows: number;
  /** Every key the options menu lists, so the keyboard reaches each action from the Client too. */
  keys: ClientKey[];
  selectedColor: string;
}

export type TaskClientMessage =
  | { kind: "select" | "open"; id: string }
  | { kind: "menu"; id: string; x: number }
  /** A key the menu lists, typed while the Client has the focus; `id` the selected task, if any. */
  | { kind: "run"; id?: string; command: string };

/** The keys the options menu lists, each once, in its order. */
export function clientKeys(ctx: ActionContext): ClientKey[] {
  const seen = new Set<string>();
  const keys: ClientKey[] = [];
  for (const item of menuView(ctx).sections.flatMap((section) => section.items)) {
    if (item.hotkey === "" || seen.has(item.hotkey)) continue;
    seen.add(item.hotkey);
    keys.push({ key: item.hotkey, command: item.command });
  }
  return keys;
}

/** The task list as the Client's props: the same rows and keys the element tree draws. */
export function taskClientProps(
  list: TaskListView,
  ctx: ActionContext,
  options: { selected?: string; gapAfter?: string; gapRows?: number; selectedColor: string },
): TaskClientProps {
  const gapAfter = list.rows.some((row) => row.id === options.gapAfter)
    ? options.gapAfter
    : undefined;
  return {
    rows: list.rows.map((row) => ({ id: row.id, label: row.label })),
    ...(options.selected === undefined ? {} : { selected: options.selected }),
    ...(gapAfter === undefined ? {} : { gapAfter }),
    gapRows: gapAfter === undefined ? 0 : Math.max(0, options.gapRows ?? 0),
    keys: clientKeys(ctx),
    selectedColor: options.selectedColor,
  };
}

/**
 * A Client's post, read as input: a known kind about a row the Client was handed, and for `run`
 * a command among its keys. Anything else is undefined.
 */
export function parseTaskMessage(
  data: unknown,
  props: TaskClientProps,
): TaskClientMessage | undefined {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  const { kind, id, command, x } = record;
  const row = props.rows.find((one) => one.id === id)?.id;
  if (kind === "run") {
    if (typeof command !== "string" || !props.keys.some((key) => key.command === command)) {
      return undefined;
    }
    if (id === undefined) return { kind, command };
    return row === undefined ? undefined : { kind, id: row, command };
  }
  if (row === undefined) return undefined;
  if (kind === "select" || kind === "open") return { kind, id: row };
  if (kind !== "menu") return undefined;
  return { kind, id: row, x: typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : 0 };
}
