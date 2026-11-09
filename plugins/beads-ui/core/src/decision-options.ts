import type { Result } from "./model.ts";

// Option cards (web app design D-2, T-W1.2): the held store's structured-options command
// (`held_cli.py options`) prints each review item's decisions as JSON, and this reads it into
// cards. A malformed decision gives its item no card at all and an error naming the field, so a
// partial card is never drawn; the view falls back to the item's Markdown body.

/** The payload version this reads; any other is refused. */
export const OPTIONS_VERSION = 1;
/** The item kinds the command prints; an option card's reader tells these apart. */
export const OPTIONS_ITEM_KINDS = ["decision", "open-question", "blocker", "other"] as const;
export type OptionsItemKind = (typeof OPTIONS_ITEM_KINDS)[number];
/** Options past the ninth have no number key. */
export const MAX_NUMBER_KEYS = 9;

export interface OptionChoice {
  /** The option's letter, as the answer names it. */
  key: string;
  label: string;
  /** Its number key, 1 for the first option; absent past the ninth. */
  number?: number;
  recommended: boolean;
}

export interface OptionCard {
  /** The decision's id, `D-3`. */
  id: string;
  title: string;
  options: OptionChoice[];
  /** The recommended option's key, or null when the decision recommends none. */
  recommended: string | null;
  /** The id of the decision's heading in the item, for a link to its body. */
  anchor: string;
}

export interface OptionsError {
  /** The part at fault: a path into the output such as `items[0].decisions[1].recommended`. */
  field: string;
  problem: string;
}

export interface ItemOptions {
  /** The item's path, exactly as the review command prints it. */
  item: string;
  kind: OptionsItemKind;
  /** Empty when the item has no decision, and whenever `error` is set. */
  cards: OptionCard[];
  error?: OptionsError;
}

export interface DecisionOptionsOutput {
  version: typeof OPTIONS_VERSION;
  items: ItemOptions[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value !== "";

class Malformed {
  readonly field: string;
  readonly problem: string;
  constructor(field: string, problem: string) {
    this.field = field;
    this.problem = problem;
  }
}

function optionsOf(value: unknown, at: string): OptionChoice[] {
  if (!Array.isArray(value)) throw new Malformed(`${at}.options`, "is not a list");
  if (value.length < 2) throw new Malformed(`${at}.options`, "has fewer than two options");
  const seen = new Set<string>();
  return value.map((one, index): OptionChoice => {
    const where = `${at}.options[${index}]`;
    if (!isRecord(one)) throw new Malformed(where, "is not an object");
    if (!nonEmpty(one.key)) throw new Malformed(`${where}.key`, "is missing or empty");
    if (seen.has(one.key)) throw new Malformed(`${where}.key`, `repeats option ${one.key}`);
    seen.add(one.key);
    if (!nonEmpty(one.label)) throw new Malformed(`${where}.label`, "is missing or empty");
    const choice: OptionChoice = { key: one.key, label: one.label, recommended: false };
    if (index < MAX_NUMBER_KEYS) choice.number = index + 1;
    return choice;
  });
}

function cardOf(value: unknown, at: string): OptionCard {
  if (!isRecord(value)) throw new Malformed(at, "is not an object");
  if (!nonEmpty(value.id)) throw new Malformed(`${at}.id`, "is missing or empty");
  if (typeof value.title !== "string") throw new Malformed(`${at}.title`, "is not a string");
  if (!nonEmpty(value.anchor)) throw new Malformed(`${at}.anchor`, "is missing or empty");
  const options = optionsOf(value.options, at);
  const recommended = value.recommended;
  if (recommended !== null && typeof recommended !== "string") {
    throw new Malformed(`${at}.recommended`, "is neither an option key nor null");
  }
  if (recommended !== null) {
    const chosen = options.find((option) => option.key === recommended);
    if (chosen === undefined) {
      throw new Malformed(`${at}.recommended`, `names ${recommended}, which is not an option`);
    }
    chosen.recommended = true;
  }
  return { id: value.id, title: value.title, options, recommended, anchor: value.anchor };
}

function itemOf(value: unknown, at: string): ItemOptions {
  if (!isRecord(value)) throw new Malformed(at, "is not an object");
  if (!nonEmpty(value.item)) throw new Malformed(`${at}.item`, "is missing or empty");
  const kind = OPTIONS_ITEM_KINDS.find((one) => one === value.kind);
  if (kind === undefined) {
    throw new Malformed(`${at}.kind`, `is ${JSON.stringify(value.kind)}, not a known kind`);
  }
  const item: ItemOptions = { item: value.item, kind, cards: [] };
  const error = value.error;
  if (error !== null && error !== undefined) {
    if (!isRecord(error) || !nonEmpty(error.field) || typeof error.problem !== "string") {
      item.error = { field: `${at}.error`, problem: "is not an object with a field and a problem" };
    } else {
      item.error = { field: error.field, problem: error.problem };
    }
    return item;
  }
  if (!Array.isArray(value.decisions)) {
    item.error = { field: `${at}.decisions`, problem: "is not a list" };
    return item;
  }
  try {
    item.cards = value.decisions.map((one, index) => cardOf(one, `${at}.decisions[${index}]`));
  } catch (fault) {
    if (!(fault instanceof Malformed)) throw fault;
    item.cards = [];
    item.error = { field: fault.field, problem: fault.problem };
  }
  return item;
}

/**
 * The command's stdout as option cards. Output that is not the payload at all (not JSON, another
 * version, no item list, an item with no path) is an error and no item; a fault inside one item's
 * decisions leaves that item with no card and its own error, and every other item stands.
 */
export function parseDecisionOptions(stdout: string): Result<DecisionOptionsOutput, OptionsError> {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      error: { field: "output", problem: "the options command printed no JSON" },
    };
  }
  if (!isRecord(json)) {
    return { ok: false, error: { field: "output", problem: "is not an object" } };
  }
  if (json.version !== OPTIONS_VERSION) {
    return {
      ok: false,
      error: { field: "version", problem: `is ${JSON.stringify(json.version)}, not 1` },
    };
  }
  if (!Array.isArray(json.items)) {
    return { ok: false, error: { field: "items", problem: "is not a list" } };
  }
  const items: ItemOptions[] = [];
  for (const [index, row] of json.items.entries()) {
    try {
      items.push(itemOf(row, `items[${index}]`));
    } catch (fault) {
      if (!(fault instanceof Malformed)) throw fault;
      return { ok: false, error: { field: fault.field, problem: fault.problem } };
    }
  }
  return { ok: true, value: { version: OPTIONS_VERSION, items } };
}

export const optionsForItem = (
  output: DecisionOptionsOutput,
  path: string,
): ItemOptions | undefined => output.items.find((item) => item.item === path);

/**
 * How a held item's detail draws: option cards when its options parsed, its Markdown body with a
 * typed answer only when the command was unavailable, printed no options or reported an error.
 */
export const optionCardMode = (item: ItemOptions | undefined): "cards" | "markdown" =>
  item !== undefined && item.error === undefined && item.cards.length > 0 ? "cards" : "markdown";

/**
 * The option one key chooses on a shown card: a number key picks that option, Enter the
 * recommended one. Inside a text field neither chooses anything, so the key types.
 */
export function optionForKey(
  card: OptionCard,
  key: string,
  inTextField = false,
): OptionChoice | undefined {
  if (inTextField) return undefined;
  if (key === "Enter") return card.options.find((option) => option.recommended);
  if (!/^[1-9]$/.test(key)) return undefined;
  const number = Number(key);
  return card.options.find((option) => option.number === number);
}
