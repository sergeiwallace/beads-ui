/** Where a command is reachable: the whole pane, the focused card, or the delete confirmation. */
export type CommandScope = "pane" | "card" | "confirm";

/**
 * How the keyboard reaches a command. `hotkey` is a mod `Button` hotkey (one digit or one
 * lowercase letter); `input` is a control the user focuses and types into, because `/` is not a
 * valid hotkey; `escape` is the pane's `closeOnEscape`.
 */
export type KeyBinding =
  | { kind: "hotkey"; key: string }
  | { kind: "input"; hint: string }
  | { kind: "escape" };

export interface Command {
  id: string;
  label: string;
  scope: CommandScope;
  /** The keyboard path; every MVP action has one (product-level AC). */
  binding: KeyBinding;
  /** The footer hint text, as the Mockups section shows it. */
  hint: string;
}

const hotkey = (key: string): KeyBinding => ({ kind: "hotkey", key });

/** Every user action in the MVP, as data. */
export const COMMANDS: readonly Command[] = [
  // T-2B.1: the task panel's own views, beside the board's tabs in the nav.
  { id: "tab.tasks", label: "Tasks", scope: "pane", binding: hotkey("t"), hint: "t Tasks" },
  { id: "tab.board", label: "Board", scope: "pane", binding: hotkey("1"), hint: "1 Board" },
  { id: "tab.backlog", label: "Backlog", scope: "pane", binding: hotkey("2"), hint: "2 Backlog" },
  // D-28: 3 is the Sprint tab Phase 2 builds; until then it is drawn dimmed and says so.
  {
    id: "tab.sprint",
    label: "Sprint (planned, not built yet)",
    scope: "pane",
    binding: hotkey("3"),
    hint: "3 Sprint",
  },
  { id: "tab.detail", label: "Detail", scope: "pane", binding: hotkey("4"), hint: "4 Detail" },
  // T-2B.9: the store's epics and milestones by due date.
  {
    id: "tab.timeline",
    label: "Timeline",
    scope: "pane",
    binding: hotkey("5"),
    hint: "5 Timeline",
  },
  {
    id: "tab.settings",
    label: "Settings",
    scope: "pane",
    binding: hotkey("6"),
    hint: "6 Settings",
  },
  // T-2C.6 (D-40): every held item in the session's scope, filtered, sorted and grouped.
  { id: "tab.review", label: "Review", scope: "pane", binding: hotkey("7"), hint: "7 Review" },
  // T-2B.4: every action this pane draws a key for is also in this menu.
  {
    id: "panel.menu",
    label: "Options menu: every action here, each with its key",
    scope: "pane",
    binding: hotkey("k"),
    hint: "k menu",
  },
  {
    id: "tasks.more",
    label: "More or fewer tasks: show the collapsed tasks, or collapse them again",
    scope: "pane",
    binding: hotkey("r"),
    hint: "r more tasks",
  },
  { id: "issue.new", label: "New", scope: "pane", binding: hotkey("n"), hint: "n new" },
  {
    id: "board.swimlane",
    label: "Swimlane",
    scope: "pane",
    binding: hotkey("s"),
    hint: "s swimlane",
  },
  { id: "view.sort", label: "Sort", scope: "pane", binding: hotkey("o"), hint: "o sort" },
  // D-29: a session opens on its own issues (a firstmate on every issue); a switches.
  {
    id: "view.scope",
    label: "Mine or All: this session's own issues, or every issue",
    scope: "pane",
    binding: hotkey("a"),
    hint: "a mine/all",
  },
  {
    id: "view.filter",
    label: "Filter",
    scope: "pane",
    binding: { kind: "input", hint: "/" },
    hint: "/ filter",
  },
  {
    id: "band.settings",
    label: "Band settings",
    scope: "pane",
    binding: hotkey("g"),
    hint: "g band",
  },
  { id: "help", label: "Help", scope: "pane", binding: hotkey("h"), hint: "? help" },
  { id: "card.detail", label: "Detail", scope: "card", binding: hotkey("d"), hint: "d detail" },
  { id: "card.move", label: "Move to", scope: "card", binding: hotkey("m"), hint: "m move to" },
  {
    id: "card.edit",
    label: "Edit: open the focused task's detail on its title",
    scope: "card",
    binding: hotkey("e"),
    hint: "e edit",
  },
  { id: "card.delete", label: "Delete", scope: "card", binding: hotkey("x"), hint: "x delete" },
  {
    id: "page.next",
    label: "Next page: the focused card's column on the Board, the list on the Backlog",
    scope: "pane",
    binding: hotkey("p"),
    hint: "p next page",
  },
  {
    id: "page.back",
    label: "Previous page: the focused card's column on the Board, the list on the Backlog",
    scope: "pane",
    binding: hotkey("b"),
    hint: "b page back",
  },
  {
    id: "board.lanes",
    label: "More swimlanes, when they take more than one page",
    scope: "pane",
    binding: hotkey("l"),
    hint: "l more lanes",
  },
  {
    id: "close.undo",
    label: "Undo close",
    scope: "pane",
    binding: hotkey("u"),
    hint: "u undo close",
  },
  {
    id: "confirm.close-instead",
    label: "Close instead",
    scope: "confirm",
    binding: hotkey("c"),
    hint: "c close instead",
  },
  {
    id: "confirm.delete",
    label: "Delete",
    scope: "confirm",
    binding: hotkey("x"),
    hint: "x delete",
  },
  {
    id: "confirm.typed-id",
    label: "Type the id to confirm",
    scope: "confirm",
    binding: { kind: "input", hint: "type the id" },
    hint: "type the id to enable delete",
  },
  {
    id: "confirm.cancel",
    label: "Cancel",
    scope: "confirm",
    binding: { kind: "escape" },
    hint: "esc cancel",
  },
];

/** Pane hotkeys stay live while a card has focus, so both scopes share one key space. */
const SHARED_SCOPES: Readonly<Record<CommandScope, readonly CommandScope[]>> = {
  pane: ["pane", "card"],
  card: ["pane", "card"],
  confirm: ["confirm"],
};

/** The command a hotkey runs in a scope, or undefined when the key is unbound there. */
export function commandForKey(key: string, scope: CommandScope): Command | undefined {
  return COMMANDS.find(
    (command) =>
      command.binding.kind === "hotkey" &&
      command.binding.key === key &&
      SHARED_SCOPES[scope].includes(command.scope),
  );
}

export function commandById(id: string): Command | undefined {
  return COMMANDS.find((command) => command.id === id);
}

/** Footer hints for a scope, in catalog order. */
export function footerHints(scope: CommandScope): string[] {
  return COMMANDS.filter((command) => SHARED_SCOPES[scope].includes(command.scope)).map(
    (command) => command.hint,
  );
}
