// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  buildKeymap,
  chordOf,
  commandForPress,
  DEFAULT_KEYMAP_SETTINGS,
  DEFAULT_SHORTCUTS,
  type Keymap,
  type KeymapSettings,
  parseChord,
  remapKey,
  type Shortcut,
  setSingleKeys,
} from "../src/index.ts";

// T-W1.4 of the web app design (D-12): single-key shortcuts on by default, an off setting that
// keeps modified shortcuts, and remaps that refuse one key for two commands.

const SHORTCUTS: Shortcut[] = [
  ...DEFAULT_SHORTCUTS,
  { command: "review.approve", label: "Approve the recommendation", key: "a" },
  { command: "composer.send", label: "Send", key: "Mod+Enter" },
  { command: "undo.cancel", label: "Cancel the answer", key: "Escape" },
];

function keymap(settings: KeymapSettings = DEFAULT_KEYMAP_SETTINGS): Keymap {
  const built = buildKeymap(SHORTCUTS, settings);
  if (!built.ok) throw new Error(built.error.message);
  return built.value;
}

describe("single-key shortcuts on", () => {
  test("should run a mapped command when its single key is pressed outside a text field, on by default", () => {
    const map = keymap();

    expect(map.settings.singleKey).toBe(true);
    expect(commandForPress(map, { key: "j" })).toBe("review.next");
    expect(commandForPress(map, { key: "?", shiftKey: true })).toBe("help.open");
    expect(commandForPress(map, { key: "x" })).toBeUndefined();
  });

  test("should run no single-key command and no named key when the press is in a text field", () => {
    const map = keymap();

    expect(commandForPress(map, { key: "j" }, { inTextField: true })).toBeUndefined();
    expect(commandForPress(map, { key: "Escape" }, { inTextField: true })).toBeUndefined();
    expect(commandForPress(map, { key: "Enter", ctrlKey: true }, { inTextField: true })).toBe(
      "composer.send",
    );
  });

  test("should answer a Mod chord with Ctrl or with Meta when it is pressed", () => {
    const map = keymap();

    expect(commandForPress(map, { key: "k", ctrlKey: true })).toBe("palette.open");
    expect(commandForPress(map, { key: "k", metaKey: true })).toBe("palette.open");
    expect(commandForPress(map, { key: "k", altKey: true })).toBeUndefined();
  });
});

describe("single-key shortcuts off", () => {
  test("should ignore single-key presses and keep modified shortcuts when the setting is off", () => {
    const map = setSingleKeys(keymap(), false);

    expect(commandForPress(map, { key: "j" })).toBeUndefined();
    expect(commandForPress(map, { key: "a" })).toBeUndefined();
    expect(commandForPress(map, { key: "?", shiftKey: true })).toBeUndefined();
    expect(commandForPress(map, { key: "k", metaKey: true })).toBe("palette.open");
    expect(commandForPress(map, { key: "Enter", ctrlKey: true })).toBe("composer.send");
    expect(commandForPress(map, { key: "Escape" })).toBe("undo.cancel");
  });

  test("should run single keys again with every remap kept when the setting is turned back on", () => {
    const remapped = remapKey(keymap(), "review.next", "n");
    if (!remapped.ok) throw new Error(remapped.error.message);
    const map = setSingleKeys(setSingleKeys(remapped.value, false), true);

    expect(commandForPress(map, { key: "n" })).toBe("review.next");
  });
});

describe("remapping", () => {
  test("should refuse the remap and name both commands when a remap assigns one key to two commands", () => {
    const map = keymap();
    const result = remapKey(map, "review.approve", "j");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        kind: "conflict",
        key: "j",
        commands: ["review.approve", "review.next"],
        message: "j cannot run both review.approve and review.next",
      });
    }
    expect(commandForPress(map, { key: "a" })).toBe("review.approve");
    expect(commandForPress(map, { key: "j" })).toBe("review.next");
  });

  test("should refuse the remap and name both commands when a Mod chord already holds its Ctrl chord", () => {
    const result = remapKey(keymap(), "review.approve", "ctrl+k");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        kind: "conflict",
        commands: ["review.approve", "palette.open"],
      });
    }
  });

  test("should refuse the settings and name both commands when stored remaps give one key to two commands", () => {
    const result = buildKeymap(SHORTCUTS, {
      singleKey: true,
      remaps: { "review.next": "x", "review.previous": "x" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("conflict");
      if (result.error.kind === "conflict") {
        expect(result.error.commands).toEqual(["review.next", "review.previous"]);
      }
    }
  });

  test("should run the command on its new key and free its old one when a remap succeeds", () => {
    const result = remapKey(keymap(), "review.next", "Shift+n");
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.settings.remaps).toEqual({ "review.next": "Shift+n" });
    expect(commandForPress(result.value, { key: "N", shiftKey: true })).toBe("review.next");
    expect(commandForPress(result.value, { key: "j" })).toBeUndefined();
    const swapped = remapKey(result.value, "review.previous", "j");
    expect(swapped.ok).toBe(true);
  });

  test("should leave a command with no key when it is remapped to nothing", () => {
    const result = remapKey(keymap(), "review.approve", "");
    if (!result.ok) throw new Error(result.error.message);

    expect(commandForPress(result.value, { key: "a" })).toBeUndefined();
    expect(result.value.bindings.find((one) => one.command === "review.approve")?.key).toBe(
      undefined,
    );
  });

  test("should bind the pressed chord when the user remaps a command by pressing its new key", () => {
    const pressed = chordOf({ key: "J", ctrlKey: true, shiftKey: true });
    const result = remapKey(keymap(), "review.approve", pressed);
    if (!result.ok) throw new Error(result.error.message);

    expect(pressed).toBe("Ctrl+J");
    expect(commandForPress(result.value, { key: "J", ctrlKey: true, shiftKey: true })).toBe(
      "review.approve",
    );
    expect(chordOf({ key: " " })).toBe("Space");
  });

  test("should refuse the remap when its key does not parse or its command does not exist", () => {
    const badKey = remapKey(keymap(), "review.next", "Hyper+j");
    const unknown = buildKeymap(SHORTCUTS, { singleKey: true, remaps: { "no.such": "z" } });

    expect(badKey.ok).toBe(false);
    if (!badKey.ok) expect(badKey.error.kind).toBe("bad-key");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.kind).toBe("unknown-command");
    expect(parseChord("cmd+shift+Enter")).toEqual({ ok: true, value: "Meta+Shift+Enter" });
    expect(parseChord("Mod+Ctrl+k").ok).toBe(false);
    expect(parseChord(" j").ok).toBe(false);
  });
});
