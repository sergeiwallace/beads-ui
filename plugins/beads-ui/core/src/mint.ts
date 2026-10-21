// Display-id minting (D-9), a port of ai-harness scripts/bd_new.py's slugify_title,
// mint_display_id and display_id_from_primary. The two implementations must agree;
// test/mint.test.ts pins this one against ids bd-new minted in this repository's own store.
// bd-new's per-machine budget overrides (AIH_SLUG_BODY_MAX_CHARS and _CHILD) are environment
// reads; core does no reads, so a surface reads the two strings and passes slugBudgets' result.
import { issueIdArg } from "./argv.ts";
import type { BdArgv, Issue, RandomSource, Result } from "./model.ts";

export const SLUG_SUFFIX_ALPHABET = "abcdefghjkmnpqrstuvwxyz";
export const SLUG_SUFFIX_LENGTH = 4;
export const SLUG_BODY_MAX_CHARS = 32;
export const SLUG_BODY_MAX_CHARS_CHILD = 20;
/** The environment variables bd-new reads its slug body budgets from. */
export const SLUG_BUDGET_ENV = {
  body: "AIH_SLUG_BODY_MAX_CHARS",
  child: "AIH_SLUG_BODY_MAX_CHARS_CHILD",
} as const;
export const SLUG_MINT_ATTEMPTS = 8;
export const SLUG_FALLBACK_BODY = "task";
const SLUG_LEAD_MAX_CHARS = 24;
const SLUG_LEAD_MAX_WORDS = 3;
const SLUG_LEAD_VERBS = new Set([
  "add",
  "build",
  "create",
  "design",
  "enable",
  "fix",
  "implement",
  "improve",
  "make",
  "refactor",
  "remove",
  "update",
]);
const SLUG_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "then",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
  "when",
]);

// Python's str.isspace() over ASCII (tab to carriage return, 0x1c to 0x1f, space), which is what
// bd-new's rstrip() and split() use.
function isPySpace(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x09 && code <= 0x0d) || (code >= 0x1c && code <= 0x20);
}

function pyWordCount(text: string): number {
  let count = 0;
  let inWord = false;
  for (const ch of text) {
    const space = isPySpace(ch);
    if (!space && !inWord) count++;
    inWord = !space;
  }
  return count;
}

// NFKD, then drop every non-ASCII code unit: bd-new's .encode("ascii", "ignore").
function toAscii(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFKD")) if (ch.charCodeAt(0) < 0x80) out += ch;
  return out;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");
}

function descriptionTokens(text: string): string[] {
  const all = tokens(text);
  const meaningful = all.filter((word) => !SLUG_STOPWORDS.has(word));
  const words = meaningful.length > 0 ? meaningful : all;
  if (words.length >= 2 && SLUG_LEAD_VERBS.has(words[0] ?? "")) return words.slice(1);
  return words;
}

function fillSlugBody(words: readonly string[], budget: number): string {
  let body = "";
  for (const word of words) {
    const candidate = body === "" ? word : `${body}-${word}`;
    if (candidate.length <= budget) {
      body = candidate;
      continue;
    }
    if (body === "") return word.slice(0, budget).replace(/^-+|-+$/g, "");
    break;
  }
  return body;
}

function rstrippedLength(text: string): number {
  let end = text.length;
  while (end > 0 && isPySpace(text[end - 1] ?? "")) end--;
  return end;
}

function trailingParentheticalStart(text: string): number | undefined {
  const end = rstrippedLength(text);
  if (end === 0 || text[end - 1] !== ")") return undefined;
  let depth = 0;
  for (const ch of text.slice(0, end)) {
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth < 0) return undefined;
    }
  }
  if (depth !== 0) return undefined;
  for (let index = end - 1; index >= 0; index--) {
    if (text[index] === ")") depth++;
    else if (text[index] === "(") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

/** The slug body budgets in characters: `body` for a top-level issue, `child` under a parent. */
export interface SlugBudgets {
  body: number;
  child: number;
}

export const DEFAULT_SLUG_BUDGETS: SlugBudgets = {
  body: SLUG_BODY_MAX_CHARS,
  child: SLUG_BODY_MAX_CHARS_CHILD,
};

// What Python's int() takes from a string: surrounding whitespace, a sign, and any Unicode decimal
// digits (Nd) with single underscores between them. Its whitespace, measured over every code
// point with Python 3.14 (Unicode 16): JavaScript's \s with U+0085 and without U+FEFF.
const PY_SPACE =
  "[\\t\\n\\v\\f\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const PY_INT = new RegExp(`^${PY_SPACE}*([+-]?\\p{Nd}+(?:_\\p{Nd}+)*)${PY_SPACE}*$`, "u");
const DECIMAL_DIGIT = /^\p{Nd}$/u;

/**
 * A decimal digit's value. Unicode draws every Nd digit from a run of tens that counts up from
 * zero, so the value is the digit's place in its run, modulo ten.
 */
function digitValue(digit: string): number {
  const code = digit.codePointAt(0) ?? 0;
  let before = 0;
  while (code - before > 0 && DECIMAL_DIGIT.test(String.fromCodePoint(code - before - 1))) {
    before++;
  }
  return before % 10;
}

/** bd-new's `_env_budget`: a positive integer override, else the default. */
export function envBudget(text: string | undefined, fallback: number): number {
  const match = text === undefined ? null : PY_INT.exec(text);
  if (match?.[1] === undefined) return fallback;
  let value = 0;
  for (const char of match[1].replaceAll("_", "").replace(/^[+-]/, "")) {
    value = value * 10 + digitValue(char);
  }
  return !match[1].startsWith("-") && value > 0 ? value : fallback;
}

/** The budgets bd-new would mint under, from the two override variables' values as read. */
export function slugBudgets(env: {
  body?: string | undefined;
  child?: string | undefined;
}): SlugBudgets {
  return {
    body: envBudget(env.body, SLUG_BODY_MAX_CHARS),
    child: envBudget(env.child, SLUG_BODY_MAX_CHARS_CHILD),
  };
}

/**
 * The readable body of a slug display id, from the issue's own title. A short, digit-bearing lead
 * before the first colon is dropped for a top-level issue and kept first for a child; a trailing
 * balanced parenthetical is dropped; the words fill the body budget (32 characters, 20 for a
 * child, unless `budgets` says otherwise) greedily. Never empty: a title with nothing sluggable
 * yields "task".
 */
export function slugifyTitle(
  title: string,
  options: { child?: boolean; budgets?: SlugBudgets } = {},
): string {
  const budgets = options.budgets ?? DEFAULT_SLUG_BUDGETS;
  let ascii = toAscii(title);

  const parenthetical = trailingParentheticalStart(ascii);
  if (parenthetical !== undefined && tokens(ascii.slice(0, parenthetical)).length > 0) {
    ascii = ascii.slice(0, parenthetical);
  }

  let lead = "";
  let rest = ascii;
  const colon = ascii.indexOf(":");
  if (colon !== -1) {
    const candidateLead = ascii.slice(0, colon);
    const candidateRest = ascii.slice(colon + 1);
    if (
      /[0-9]/.test(candidateLead) &&
      candidateLead.length <= SLUG_LEAD_MAX_CHARS &&
      pyWordCount(candidateLead) <= SLUG_LEAD_MAX_WORDS &&
      descriptionTokens(candidateRest).length >= 2
    ) {
      lead = candidateLead;
      rest = candidateRest;
    }
  }

  let words = descriptionTokens(rest);
  let budget = budgets.body;
  if (options.child === true) {
    words = [...tokens(lead), ...words];
    budget = budgets.child;
  }
  return fillSlugBody(words, budget) || SLUG_FALLBACK_BODY;
}

export type MintError =
  | { kind: "collision"; message: string }
  | { kind: "bad-random"; message: string }
  | { kind: "invalid-id"; message: string };

export interface MintInput {
  prefix: string;
  title: string;
  child?: boolean;
  /** Display ids already in use; a candidate found here is re-drawn. */
  taken: ReadonlySet<string>;
  random: RandomSource;
  budgets?: SlugBudgets;
}

/** A fresh `PREFIX-<slug>-<4 suffix letters>` not present in `taken`. */
export function mintDisplayId(input: MintInput): Result<string, MintError> {
  const body = slugifyTitle(input.title, {
    child: input.child === true,
    ...(input.budgets === undefined ? {} : { budgets: input.budgets }),
  });
  for (let attempt = 0; attempt < SLUG_MINT_ATTEMPTS; attempt++) {
    let suffix = "";
    for (let i = 0; i < SLUG_SUFFIX_LENGTH; i++) {
      const draw = input.random();
      if (!(draw >= 0 && draw < 1)) {
        return {
          ok: false,
          error: { kind: "bad-random", message: `random source returned ${draw}, not [0, 1)` },
        };
      }
      suffix += SLUG_SUFFIX_ALPHABET[Math.floor(draw * SLUG_SUFFIX_ALPHABET.length)];
    }
    const candidate = `${input.prefix}-${body}-${suffix}`;
    if (!input.taken.has(candidate)) return { ok: true, value: candidate };
  }
  return {
    ok: false,
    error: {
      kind: "collision",
      message: `could not mint a free display id for ${input.prefix}-${body} in ${SLUG_MINT_ATTEMPTS} attempts`,
    },
  };
}

export const ID_POLICIES = ["auto", "fleet-slug", "off"] as const;
export type IdPolicy = (typeof ID_POLICIES)[number];

export interface IdPolicyError {
  kind: "unknown-id-policy";
  text: string;
  accepted: readonly IdPolicy[];
}

/** Reads `id_policy` from beads-ui.toml; the default is `auto`. */
export function parseIdPolicy(text: string): Result<IdPolicy, IdPolicyError> {
  const match = ID_POLICIES.find((policy) => policy === text.trim());
  if (match === undefined) {
    return { ok: false, error: { kind: "unknown-id-policy", text, accepted: ID_POLICIES } };
  }
  return { ok: true, value: match };
}

export const DEFAULT_ID_POLICY: IdPolicy = "auto";

/** True when any issue the store returned carries `metadata.display_id`. */
export function storeUsesDisplayIds(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.displayId !== undefined);
}

/** Every display id in use, from metadata and from `id:` labels, as bd-new checks both. */
export function takenDisplayIds(issues: readonly Issue[]): Set<string> {
  const taken = new Set<string>();
  for (const issue of issues) {
    if (issue.displayId !== undefined) taken.add(issue.displayId);
    for (const label of issue.labels) if (label.startsWith("id:")) taken.add(label.slice(3));
  }
  return taken;
}

export type DisplayIdPlan =
  | { kind: "skip"; reason: string }
  | { kind: "attach"; displayId: string; argv: BdArgv };

export interface DisplayIdPlanInput {
  policy: IdPolicy;
  /** The store's issues as last read; decides `auto` and supplies the taken ids. */
  issues: readonly Issue[];
  /** The hash id `bd create --json` returned. */
  createdId: string;
  title: string;
  /** True when the issue was created with a parent; bd-new uses the child budget then. */
  child: boolean;
  random: RandomSource;
  /** bd-new's slug body budgets; its defaults when not given. */
  budgets?: SlugBudgets;
}

/**
 * The gitleaks `aih-fleet-task-id` rule, ported from ai-harness `.gitleaks.toml` (read
 * 2026-10-21): a legacy numeric fleet task id. bd-new's `_suffix_would_trip_gate` refuses a
 * hash suffix whose `PREFIX-<suffix>` matches it, because such an id cannot be written outside
 * `.beads/`, and mints a random suffix instead.
 */
export const FLEET_TASK_ID_RULE =
  /\b(?:SW|ACN|AG|AI-CLI|CORE|DOJO|AIH|MACOS|MOBILE|AIDO|APT|ART|AURION|HEG|JOB|KC|MNS|EVE|PS|TPL|TP|KG)-[0-9]+\b/;

const HASH_SUFFIX = /^[a-z0-9]+$/;
const CHILD_ORDINAL_SUFFIX = /^[a-z0-9]+(?:\.[0-9]+)+$/;

/**
 * The step after `bd create`: whether to mint, and the `bd update` that writes
 * `metadata.display_id` and the `id:<display_id>` label, the two-step shape bd-new uses.
 * `off` never touches either; an issue that already carries a display id keeps it.
 *
 * The suffix follows bd-new's `display_id_from_primary`: a top-level create's plain base-36
 * hash suffix is copied (`BU-2zw` gives `BU-<slug>-2zw`); a dotted child ordinal
 * (`BU-mg2.3.11`) has no suffix of its own, so four letters are drawn, as they are for a hash
 * suffix that would trip the fleet task-id rule.
 */
export function planDisplayId(input: DisplayIdPlanInput): Result<DisplayIdPlan, MintError> {
  if (input.policy === "off")
    return { ok: true, value: { kind: "skip", reason: "id_policy is off" } };
  if (input.policy === "auto" && !storeUsesDisplayIds(input.issues)) {
    return { ok: true, value: { kind: "skip", reason: "the store's issues carry no display id" } };
  }
  const existing = input.issues.find((issue) => issue.id === input.createdId);
  if (existing?.displayId !== undefined) {
    return {
      ok: true,
      value: { kind: "skip", reason: `${input.createdId} already carries ${existing.displayId}` },
    };
  }
  const dash = input.createdId.lastIndexOf("-");
  const prefix = input.createdId.slice(0, dash);
  const suffix = input.createdId.slice(dash + 1);
  const copied = HASH_SUFFIX.test(suffix);
  if (
    dash <= 0 ||
    input.createdId.startsWith("-") ||
    !(copied || CHILD_ORDINAL_SUFFIX.test(suffix))
  ) {
    return {
      ok: false,
      error: {
        kind: "invalid-id",
        message: `${input.createdId} is not a hash id bd mints (PREFIX-<hash> or PREFIX-<hash>.<n>)`,
      },
    };
  }
  const budgets = input.budgets ?? DEFAULT_SLUG_BUDGETS;
  let displayId: string;
  if (copied && !FLEET_TASK_ID_RULE.test(`${prefix}-${suffix}`)) {
    displayId = `${prefix}-${slugifyTitle(input.title, { child: input.child, budgets })}-${suffix}`;
  } else {
    const minted = mintDisplayId({
      prefix,
      title: input.title,
      child: input.child,
      taken: takenDisplayIds(input.issues),
      random: input.random,
      budgets,
    });
    if (!minted.ok) return minted;
    displayId = minted.value;
  }
  return {
    ok: true,
    value: {
      kind: "attach",
      displayId,
      argv: displayIdArgv(input.createdId, displayId),
    },
  };
}

/** The `bd update` that writes a minted display id: `metadata.display_id` and the `id:` label. */
export function displayIdArgv(id: string, displayId: string): BdArgv {
  return [
    "bd",
    "update",
    issueIdArg(id),
    "--set-metadata",
    `display_id=${displayId}`,
    "--add-label",
    `id:${displayId}`,
    "--json",
  ];
}

/** A display id minted for a created issue whose write has not succeeded yet. */
export interface PendingDisplayId {
  id: string;
  displayId: string;
}

/**
 * What to do with a pending display id once the store's issues are read: write the same id again,
 * or stop because the issue now carries it, carries another one (a published id never changes,
 * so it is never overwritten), or is no longer in the store. It never mints a second id.
 */
export type PendingDisplayIdStep =
  | { kind: "write"; argv: BdArgv }
  | { kind: "written" }
  | { kind: "kept"; existing: string }
  | { kind: "gone" };

export function pendingDisplayIdStep(
  pending: PendingDisplayId,
  issues: readonly Issue[],
): PendingDisplayIdStep {
  const issue = issues.find((candidate) => candidate.id === pending.id);
  if (issue === undefined) return { kind: "gone" };
  if (issue.displayId === pending.displayId) return { kind: "written" };
  if (issue.displayId !== undefined) return { kind: "kept", existing: issue.displayId };
  return { kind: "write", argv: displayIdArgv(pending.id, pending.displayId) };
}

const ARG = /^[^-\s]\S*$/;

/** The pending display ids as a surface stored them; anything else in the value is dropped. */
export function readPendingDisplayIds(stored: unknown): PendingDisplayId[] {
  if (!Array.isArray(stored)) return [];
  const pending: PendingDisplayId[] = [];
  for (const entry of stored) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, displayId } = entry as Record<string, unknown>;
    if (typeof id !== "string" || typeof displayId !== "string") continue;
    if (!ARG.test(id) || !ARG.test(displayId)) continue;
    if (pending.some((known) => known.id === id)) continue;
    pending.push({ id, displayId });
  }
  return pending;
}
