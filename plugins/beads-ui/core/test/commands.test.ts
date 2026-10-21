// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  COMMANDS,
  commandById,
  commandForKey,
  footerHints,
  priorityToken,
  RESERVED_KEYS,
  STATUS_CATEGORIES,
  statusToken,
  TERMINAL_THEME,
  TOKENS,
  terminalColor,
} from "../src/index.ts";

describe("COMMANDS", () => {
  test("should give every action a keyboard path when the catalog is read", () => {
    for (const command of COMMANDS) {
      const binding = command.binding;
      if (binding.kind === "hotkey") expect(binding.key).toMatch(/^[a-z0-9]$/);
      if (binding.kind === "input") expect(binding.hint.length > 0).toBe(true);
      expect(command.hint.length > 0).toBe(true);
    }
  });

  test("should give each command a unique id and no hotkey twice in a shared key space", () => {
    const idList = COMMANDS.map((command) => command.id);
    expect(new Set(idList).size).toBe(idList.length);

    for (const space of [["pane", "card"], ["confirm"]]) {
      const keys = COMMANDS.filter((command) => space.includes(command.scope)).flatMap((command) =>
        command.binding.kind === "hotkey" ? [command.binding.key] : [],
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  test("should bind the Mockups' footer keys and leave 3 for the Sprint tab", () => {
    const hotkeys = Object.fromEntries(
      COMMANDS.flatMap((command) =>
        command.binding.kind === "hotkey" ? [[command.id, command.binding.key]] : [],
      ),
    );
    expect(hotkeys).toEqual({
      "tab.board": "1",
      "tab.backlog": "2",
      "tab.detail": "4",
      "issue.new": "n",
      "board.swimlane": "s",
      "view.sort": "o",
      help: "h",
      "card.detail": "d",
      "card.move": "m",
      "card.delete": "x",
      "close.undo": "u",
      "confirm.close-instead": "c",
      "confirm.delete": "x",
    });
    expect(commandById("view.filter")?.binding).toEqual({ kind: "input", hint: "/" });
    expect(Object.keys(RESERVED_KEYS)).toEqual(["3"]);
  });
});

describe("commandForKey", () => {
  test("should find a pane hotkey while a card has focus", () => {
    expect(commandForKey("n", "card")?.id).toBe("issue.new");
    expect(commandForKey("m", "card")?.id).toBe("card.move");
  });

  test("should resolve x to delete in the confirmation and keep pane keys out of it", () => {
    expect(commandForKey("x", "confirm")?.id).toBe("confirm.delete");
    expect(commandForKey("c", "confirm")?.id).toBe("confirm.close-instead");
    expect(commandForKey("n", "confirm")).toBeUndefined();
  });

  test("should return undefined for an unbound or reserved key", () => {
    expect(commandForKey("3", "pane")).toBeUndefined();
    expect(commandForKey("/", "pane")).toBeUndefined();
  });
});

describe("footerHints", () => {
  test("should list the confirmation's own hints when the confirmation has focus", () => {
    expect(footerHints("confirm")).toEqual([
      "c close instead",
      "x delete",
      "type the id to enable delete",
      "esc cancel",
    ]);
  });
});

describe("TOKENS", () => {
  test("should give every token a value in the terminal map", () => {
    for (const token of TOKENS) expect(TERMINAL_THEME[token]).toBeDefined();
    expect(Object.keys(TERMINAL_THEME).sort()).toEqual([...TOKENS].sort());
  });

  test("should name a token for every status category and priority", () => {
    for (const category of STATUS_CATEGORIES) expect(TOKENS).toContain(statusToken(category));
    for (const priority of [0, 1, 2, 3, 4] as const) {
      expect(TOKENS).toContain(priorityToken(priority));
    }
  });

  test("should look a token up by name and return undefined for an unknown name", () => {
    expect(terminalColor("warning")).toEqual({ kind: "theme", key: "warning" });
    expect(terminalColor("status.sprint")).toBeUndefined();
  });
});
