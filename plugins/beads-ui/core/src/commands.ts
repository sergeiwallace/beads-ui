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
  { id: "tab.board", label: "Board", scope: "pane", binding: hotkey("1"), hint: "1 Board" },
  { id: "tab.backlog", label: "Backlog", scope: "pane", binding: hotkey("2"), hint: "2 Backlog" },
  { id: "tab.detail", label: "Detail", scope: "pane", binding: hotkey("4"), hint: "4 Detail" },
  { id: "issue.new", label: "New", scope: "pane", binding: hotkey("n"), hint: "n new" },
  {
    id: "board.swimlane",
    label: "Swimlane",
    scope: "pane",
    binding: hotkey("s"),
    hint: "s swimlane",
  },
  { id: "view.sort", label: "Sort", scope: "pane", binding: hotkey("o"), hint: "o sort" },
  {
    id: "view.filter",
    label: "Filter",
    scope: "pane",
    binding: { kind: "input", hint: "/" },
    hint: "/ filter",
  },
  { id: "help", label: "Help", scope: "pane", binding: hotkey("h"), hint: "? help" },
  { id: "card.detail", label: "Detail", scope: "card", binding: hotkey("d"), hint: "d detail" },
  { id: "card.move", label: "Move to", scope: "card", binding: hotkey("m"), hint: "m move to" },
  { id: "card.delete", label: "Delete", scope: "card", binding: hotkey("x"), hint: "x delete" },
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

/** Digit keys held for tabs that arrive later: `3` is the Phase 2 Sprint tab. */
export const RESERVED_KEYS: Readonly<Record<string, string>> = { "3": "Sprint tab (Phase 2)" };

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
