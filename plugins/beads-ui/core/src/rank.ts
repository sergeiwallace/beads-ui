import type { Issue, RandomSource, Result } from "./model.ts";
import { DEFAULT_SORT, sortIssues } from "./sort.ts";

/**
 * Manual rank (D-6): `metadata.rank` holds a fractional-index key, a base-62 string that sorts
 * by plain string comparison. A reorder writes one key between the card's new neighbours and
 * never touches another card. The key shape is the one rocicorp's `fractional-indexing`
 * defines (CC0): an integer part whose head letter gives its length (`a0`, `a1`, `Zz`, `b10`),
 * then an optional fraction that never ends in `0`.
 */
export const RANK_KEY = "rank";

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO = "0";
const LAST = "z";
// The smallest integer part; a key equal to it leaves no room below.
const SMALLEST_INTEGER = `A${ZERO.repeat(26)}`;
const SHAPE = /^[0-9A-Za-z]+$/;

/**
 * How many random halvings a jittered key takes inside its interval: 2^10 positions, so two
 * sessions dropping a card into the same gap at once draw the same key about once in 1,024.
 */
export const RANK_JITTER_STEPS = 10;

export type RankError =
  | { kind: "malformed-rank"; value: unknown; message: string }
  | { kind: "out-of-order"; above: string; below: string; message: string };

/** What one issue's `metadata.rank` holds. */
export type RankRead =
  | { kind: "ranked"; key: string }
  | { kind: "unranked" }
  | { kind: "malformed"; value: unknown; message: string };

function integerLength(head: string): number | undefined {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  if (head >= "A" && head <= "Z") return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  return undefined;
}

/** Why `value` is not a rank key, or undefined when it is one. */
function problemOf(value: unknown): string | undefined {
  if (typeof value !== "string") return `a rank key is a string, not ${JSON.stringify(value)}`;
  if (!SHAPE.test(value)) return `${JSON.stringify(value)} holds a character outside 0-9, A-Z, a-z`;
  const length = integerLength(value[0] ?? "");
  if (length === undefined || length > value.length) {
    return `${JSON.stringify(value)} has no whole integer part`;
  }
  if (value === SMALLEST_INTEGER) return `${JSON.stringify(value)} is the reserved smallest key`;
  if (value.length > length && value.endsWith(ZERO)) {
    return `${JSON.stringify(value)} ends its fraction in 0`;
  }
  return undefined;
}

export function isRankKey(value: unknown): value is string {
  return problemOf(value) === undefined;
}

export function readRank(issue: Issue): RankRead {
  const value = issue.metadata[RANK_KEY];
  if (value === undefined || value === null) return { kind: "unranked" };
  const problem = problemOf(value);
  if (problem !== undefined) return { kind: "malformed", value, message: problem };
  return { kind: "ranked", key: value as string };
}

// The digit string strictly between fractions `a` and `b` (b undefined: no upper bound).
function midpoint(a: string, b: string | undefined): string {
  if (b !== undefined) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a === "" ? 0 : DIGITS.indexOf(a[0] ?? ZERO);
  const digitB = b === undefined ? DIGITS.length : DIGITS.indexOf(b[0] ?? ZERO);
  if (digitB - digitA > 1) return DIGITS[Math.round((digitA + digitB) / 2)] ?? ZERO;
  if (b !== undefined && b.length > 1) return b.slice(0, 1);
  return (DIGITS[digitA] ?? ZERO) + midpoint(a.slice(1), undefined);
}

function step(integer: string, delta: 1 | -1): string | undefined {
  const head = integer[0] ?? "";
  const digits = integer.slice(1).split("");
  const wrapFrom = delta === 1 ? LAST : ZERO;
  const wrapTo = delta === 1 ? ZERO : LAST;
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    if (digits[i] === wrapFrom) {
      digits[i] = wrapTo;
    } else {
      digits[i] = DIGITS[DIGITS.indexOf(digits[i] ?? ZERO) + delta] ?? ZERO;
      carry = false;
    }
  }
  if (!carry) return head + digits.join("");
  if (delta === 1) {
    if (head === "Z") return `a${ZERO}`;
    if (head === "z") return undefined;
    const next = String.fromCharCode(head.charCodeAt(0) + 1);
    if (next > "a") digits.push(ZERO);
    else digits.pop();
    return next + digits.join("");
  }
  if (head === "a") return `Z${LAST}`;
  if (head === "A") return undefined;
  const next = String.fromCharCode(head.charCodeAt(0) - 1);
  if (next < "Z") digits.push(LAST);
  else digits.pop();
  return next + digits.join("");
}

function split(key: string): [integer: string, fraction: string] {
  const length = integerLength(key[0] ?? "") ?? key.length;
  return [key.slice(0, length), key.slice(length)];
}

// Both bounds are valid keys and above < below when both are set.
function between(above: string | undefined, below: string | undefined): string {
  if (above === undefined) {
    if (below === undefined) return `a${ZERO}`;
    const [integer, fraction] = split(below);
    if (integer === SMALLEST_INTEGER) return integer + midpoint("", fraction);
    if (integer < below) return integer;
    return step(integer, -1) ?? integer + midpoint("", fraction);
  }
  const [integer, fraction] = split(above);
  if (below === undefined) return step(integer, 1) ?? integer + midpoint(fraction, undefined);
  const [belowInteger, belowFraction] = split(below);
  if (integer === belowInteger) return integer + midpoint(fraction, belowFraction);
  const next = step(integer, 1);
  return next !== undefined && next < below ? next : integer + midpoint(fraction, undefined);
}

/**
 * A key that sorts after `above` and before `below`; either may be absent at a column's end.
 * With `random`, the key is drawn from RANK_JITTER_STEPS random halvings of the gap, so
 * concurrent reorders into one gap rarely collide (D-6); without it the key is the midpoint.
 */
export function keyBetween(
  above: string | undefined,
  below: string | undefined,
  random?: RandomSource,
): Result<string, RankError> {
  for (const bound of [above, below]) {
    const problem = bound === undefined ? undefined : problemOf(bound);
    if (problem !== undefined) {
      return { ok: false, error: { kind: "malformed-rank", value: bound, message: problem } };
    }
  }
  if (above !== undefined && below !== undefined && above >= below) {
    return {
      ok: false,
      error: {
        kind: "out-of-order",
        above,
        below,
        message: `the card above ranks ${above}, not before the card below at ${below}`,
      },
    };
  }
  let low = above;
  let high = below;
  let key = between(low, high);
  if (random !== undefined) {
    for (let i = 0; i < RANK_JITTER_STEPS; i++) {
      if (random() < 0.5) high = key;
      else low = key;
      key = between(low, high);
    }
  }
  return { ok: true, value: key };
}

/**
 * A column's order under rank: ranked issues by key, then every other issue (no rank, or a
 * malformed one) in the order it came in. The sort is stable, so the incoming order (the
 * default sort) settles ties and the unranked tail.
 */
export function orderByRank(issues: readonly Issue[]): Issue[] {
  const keyed = issues.map((issue) => {
    const read = readRank(issue);
    return { issue, key: read.kind === "ranked" ? read.key : undefined };
  });
  keyed.sort((a, b) => {
    if (a.key === undefined || b.key === undefined) {
      return (a.key === undefined ? 1 : 0) - (b.key === undefined ? 1 : 0);
    }
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return keyed.map((entry) => entry.issue);
}

/**
 * The Backlog's order under rank: priority, then rank (ranked first, by key), then age, oldest
 * first. Without rank the Backlog keeps sortIssues' priority then created.
 */
export function orderByPriorityRank(issues: readonly Issue[]): Issue[] {
  const byPriority = new Map<number, Issue[]>();
  for (const issue of sortIssues(issues, DEFAULT_SORT)) {
    const group = byPriority.get(issue.priority) ?? [];
    group.push(issue);
    byPriority.set(issue.priority, group);
  }
  return [...byPriority.values()].flatMap((group) => orderByRank(group));
}

/** The ranked cards a reorder writes between: the nearest ranked card above the slot and below it. */
export interface RankNeighbours {
  above?: Issue;
  below?: Issue;
}

/**
 * The neighbours of slot `index` in `column` once `id` is taken out of it, counting slots in the
 * column's rank order (orderByRank), where the ranked cards come first. A slot inside the
 * unranked tail cannot be held without ranking the cards around it, which would renumber them,
 * so the card lands at the end of the ranked run instead.
 */
export function rankNeighbours(
  column: readonly Issue[],
  id: string,
  index: number,
): RankNeighbours {
  const rest = orderByRank(column.filter((issue) => issue.id !== id));
  const rankedCount = rest.filter((issue) => readRank(issue).kind === "ranked").length;
  const slot = Math.min(Math.max(0, Math.floor(index) || 0), rest.length, rankedCount);
  const neighbours: RankNeighbours = {};
  const above = rest[slot - 1];
  const below = slot < rankedCount ? rest[slot] : undefined;
  if (above !== undefined) neighbours.above = above;
  if (below !== undefined) neighbours.below = below;
  return neighbours;
}
