// Display-id minting (D-9), a port of ai-harness scripts/bd_new.py's slugify_title and
// mint_display_id. The two implementations must agree; test/mint.test.ts pins this one against
// ids bd-new minted in this repository's own store. bd-new's per-machine budget overrides
// (AIH_SLUG_BODY_MAX_CHARS*) are environment reads, which core does not do, so the budgets here
// are bd-new's defaults.
import { issueIdArg } from "./argv.ts";
import type { BdArgv, Issue, RandomSource, Result } from "./model.ts";

export const SLUG_SUFFIX_ALPHABET = "abcdefghjkmnpqrstuvwxyz";
export const SLUG_SUFFIX_LENGTH = 4;
export const SLUG_BODY_MAX_CHARS = 32;
export const SLUG_BODY_MAX_CHARS_CHILD = 20;
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

/**
 * The readable body of a slug display id, from the issue's own title. A short, digit-bearing lead
 * before the first colon is dropped for a top-level issue and kept first for a child; a trailing
 * balanced parenthetical is dropped; the words fill 32 characters (20 for a child) greedily.
 * Never empty: a title with nothing sluggable yields "task".
 */
export function slugifyTitle(title: string, options: { child?: boolean } = {}): string {
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
  let budget = SLUG_BODY_MAX_CHARS;
  if (options.child === true) {
    words = [...tokens(lead), ...words];
    budget = SLUG_BODY_MAX_CHARS_CHILD;
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
}

/** A fresh `PREFIX-<slug>-<4 suffix letters>` not present in `taken`. */
export function mintDisplayId(input: MintInput): Result<string, MintError> {
  const body = slugifyTitle(input.title, { child: input.child === true });
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
}

/**
 * The step after `bd create`: whether to mint, and the `bd update` that writes
 * `metadata.display_id` and the `id:<display_id>` label, the two-step shape bd-new uses.
 * `off` never touches either; an issue that already carries a display id keeps it.
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
  if (dash <= 0 || input.createdId.startsWith("-")) {
    return {
      ok: false,
      error: { kind: "invalid-id", message: `cannot read a prefix from ${input.createdId}` },
    };
  }
  const minted = mintDisplayId({
    prefix: input.createdId.slice(0, dash),
    title: input.title,
    child: input.child,
    taken: takenDisplayIds(input.issues),
    random: input.random,
  });
  if (!minted.ok) return minted;
  const displayId = minted.value;
  return {
    ok: true,
    value: {
      kind: "attach",
      displayId,
      argv: [
        "bd",
        "update",
        issueIdArg(input.createdId),
        "--set-metadata",
        `display_id=${displayId}`,
        "--add-label",
        `id:${displayId}`,
      ],
    },
  };
}
