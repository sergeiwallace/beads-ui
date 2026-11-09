import type { Result } from "./model.ts";

// The web app's key map (web app design D-12, T-W1.4): single-key shortcuts on by default, a
// setting that turns them off while modified shortcuts keep working, and remaps that refuse to
// give one key to two commands. A single-key shortcut is one printable character with no Ctrl, Alt
// or Meta (WCAG 2.1.4); Enter, Escape and the arrows are named keys and stay on with the setting
// off. Nothing but a Ctrl, Alt or Meta chord runs while focus is in a text field.

/** A key press as the surface reads it from its keyboard event. */
export interface KeyPress {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

/** A command's default key, as a chord: `j`, `?`, `Enter`, `Shift+Enter`, `Mod+k`. */
export interface Shortcut {
  command: string;
  label: string;
  key: string;
}

/** What the user's setting stores: the single-key switch and each remapped command's key. */
export interface KeymapSettings {
  singleKey: boolean;
  /** A command's key in place of its default; "" leaves it with no key. */
  remaps: Readonly<Record<string, string>>;
}

/** D-12 (a): single-key shortcuts are on until the user turns them off. */
export const DEFAULT_KEYMAP_SETTINGS: KeymapSettings = { singleKey: true, remaps: {} };

/** The defaults the Review view needs first; each view adds its own commands to this list. */
export const DEFAULT_SHORTCUTS: readonly Shortcut[] = [
  { command: "review.next", label: "Next item", key: "j" },
  { command: "review.previous", label: "Previous item", key: "k" },
  { command: "palette.open", label: "Command palette", key: "Mod+k" },
  { command: "help.open", label: "Keyboard shortcuts", key: "?" },
];

export interface KeymapBinding {
  command: string;
  label: string;
  /** The canonical chord, or undefined when the command has no key. */
  key?: string;
}

export interface Keymap {
  shortcuts: readonly Shortcut[];
  settings: KeymapSettings;
  bindings: KeymapBinding[];
}

export type KeymapError =
  | { kind: "conflict"; key: string; commands: [string, string]; message: string }
  | { kind: "unknown-command"; command: string; message: string }
  | { kind: "bad-key"; key: string; message: string };

interface Chord {
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  /** Ctrl or Meta, whichever the platform uses: `Mod+k` answers both. */
  mod: boolean;
  shift: boolean;
  key: string;
}

const MODIFIERS: Readonly<Record<string, keyof Omit<Chord, "key">>> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  mod: "mod",
  shift: "shift",
};

const printable = (key: string): boolean => [...key].length === 1;

function canonical(chord: Chord): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push("Ctrl");
  if (chord.alt) parts.push("Alt");
  if (chord.meta) parts.push("Meta");
  if (chord.mod) parts.push("Mod");
  if (chord.shift) parts.push("Shift");
  parts.push(chord.key === " " ? "Space" : chord.key);
  return parts.join("+");
}

// A printable key's value already says whether Shift was held (`?`, `J`), so Shift is folded into
// it: `Shift+j` is `J`. A named key keeps Shift as a modifier: `Shift+Enter`.
function settle(chord: Chord): Chord {
  if (!printable(chord.key) || !chord.shift) return chord;
  return { ...chord, shift: false, key: chord.key.toUpperCase() };
}

function parse(text: string): Result<Chord, KeymapError> {
  const bad = (message: string): Result<Chord, KeymapError> => ({
    ok: false,
    error: { kind: "bad-key", key: text, message },
  });
  if (text.trim() !== text || text === "") return bad("a key cannot be empty or padded");
  const parts = text.endsWith("++") ? [...text.slice(0, -2).split("+"), "+"] : text.split("+");
  const name = parts.pop() ?? "";
  if (name === "") return bad(`${text} names no key`);
  const chord: Chord = {
    ctrl: false,
    alt: false,
    meta: false,
    mod: false,
    shift: false,
    key: name,
  };
  if (name === "Space") chord.key = " ";
  for (const part of parts) {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (modifier === undefined) return bad(`${part} is not Ctrl, Alt, Meta, Mod or Shift`);
    if (chord[modifier]) return bad(`${text} names ${part} twice`);
    chord[modifier] = true;
  }
  if (chord.mod && (chord.ctrl || chord.meta)) return bad(`${text} names Mod with Ctrl or Meta`);
  return { ok: true, value: settle(chord) };
}

/** The chord `text` names, in its one spelling (`ctrl+K` is `Ctrl+K`), or why it names none. */
export function parseChord(text: string): Result<string, KeymapError> {
  const chord = parse(text);
  return chord.ok ? { ok: true, value: canonical(chord.value) } : chord;
}

const pressChord = (press: KeyPress): Chord =>
  settle({
    ctrl: press.ctrlKey === true,
    alt: press.altKey === true,
    meta: press.metaKey === true,
    mod: false,
    shift: press.shiftKey === true,
    key: press.key,
  });

/** The press's chord in parseChord's spelling. */
export const chordOf = (press: KeyPress): string => canonical(pressChord(press));

/** Every concrete chord `chord` answers: a Mod chord answers its Ctrl and its Meta form. */
function concrete(chord: Chord): string[] {
  if (!chord.mod) return [canonical(chord)];
  return [
    canonical({ ...chord, mod: false, ctrl: true }),
    canonical({ ...chord, mod: false, meta: true }),
  ];
}

const conflict = (key: string, a: string, b: string): KeymapError => ({
  kind: "conflict",
  key,
  commands: [a, b],
  message: `${key} cannot run both ${a} and ${b}`,
});

/**
 * The key map from the commands' defaults and the user's settings. Refuses a remap of a command
 * not in `shortcuts`, a key that does not parse, and any key two commands would share, naming both.
 */
export function buildKeymap(
  shortcuts: readonly Shortcut[],
  settings: KeymapSettings = DEFAULT_KEYMAP_SETTINGS,
): Result<Keymap, KeymapError> {
  for (const command of Object.keys(settings.remaps)) {
    if (!shortcuts.some((shortcut) => shortcut.command === command)) {
      return {
        ok: false,
        error: { kind: "unknown-command", command, message: `${command} is not a command` },
      };
    }
  }
  const owners = new Map<string, string>();
  const bindings: KeymapBinding[] = [];
  for (const shortcut of shortcuts) {
    const text = settings.remaps[shortcut.command] ?? shortcut.key;
    const binding: KeymapBinding = { command: shortcut.command, label: shortcut.label };
    if (text !== "") {
      const chord = parse(text);
      if (!chord.ok) return chord;
      const key = canonical(chord.value);
      for (const one of concrete(chord.value)) {
        const owner = owners.get(one);
        if (owner !== undefined && owner !== shortcut.command) {
          return { ok: false, error: conflict(key, owner, shortcut.command) };
        }
        owners.set(one, shortcut.command);
      }
      binding.key = key;
    }
    bindings.push(binding);
  }
  return { ok: true, value: { shortcuts, settings, bindings } };
}

/**
 * `keymap` with `command` on `key` ("" for no key). Refuses a key another command holds, naming
 * `command` first and the holder second, and leaves `keymap` as it was.
 */
export function remapKey(
  keymap: Keymap,
  command: string,
  key: string,
): Result<Keymap, KeymapError> {
  if (key !== "") {
    const chord = parse(key);
    if (!chord.ok) return chord;
    const wanted = new Set(concrete(chord.value));
    for (const binding of keymap.bindings) {
      if (binding.command === command || binding.key === undefined) continue;
      const held = parse(binding.key);
      if (held.ok && concrete(held.value).some((one) => wanted.has(one))) {
        return { ok: false, error: conflict(canonical(chord.value), command, binding.command) };
      }
    }
  }
  const remaps = { ...keymap.settings.remaps, [command]: key };
  return buildKeymap(keymap.shortcuts, { ...keymap.settings, remaps });
}

/** `keymap` with single-key shortcuts turned on or off; remaps are kept either way. */
export function setSingleKeys(keymap: Keymap, on: boolean): Keymap {
  return { ...keymap, settings: { ...keymap.settings, singleKey: on } };
}

/**
 * The command a press runs, or undefined. Single-key shortcuts run only while the setting is on;
 * in a text field only a Ctrl, Alt or Meta chord runs, so typed characters, Enter and Escape reach
 * the field.
 */
export function commandForPress(
  keymap: Keymap,
  press: KeyPress,
  context: { inTextField?: boolean } = {},
): string | undefined {
  const chord = pressChord(press);
  const modified = chord.ctrl || chord.alt || chord.meta;
  if (context.inTextField === true && !modified) return undefined;
  if (!keymap.settings.singleKey && !modified && printable(chord.key)) return undefined;
  const pressed = canonical(chord);
  for (const binding of keymap.bindings) {
    if (binding.key === undefined) continue;
    const bound = parse(binding.key);
    if (bound.ok && concrete(bound.value).includes(pressed)) return binding.command;
  }
  return undefined;
}
