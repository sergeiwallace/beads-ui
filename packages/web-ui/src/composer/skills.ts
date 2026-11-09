/**
 * The `/skill` token vocabulary of the composer (web app design D-4, ported from the ai-core
 * dashboard): a token is valid when its name is in the skill catalog and invalid otherwise.
 *
 * Pure, and deliberately free of Lexical: the matching rule and the validity rule
 * are the part worth pinning independently of the editor, and the node transform
 * in `components/SkillTokenNode.ts` is the only thing that has to know both.
 */

/** One skill of the catalog, as the work queue's skills endpoint lists it. */
export interface Skill {
  name: string;
  source?: string;
  description?: string | null;
}

export type SkillCatalog = ReadonlySet<string>;

export function catalogOf(skills: Skill[]): SkillCatalog {
  return new Set(skills.map((skill) => skill.name));
}

/**
 * A `/skill` token: a slash at a word boundary followed by the name.
 *
 * Names come from the server's catalog, where they are file-stem or built-in
 * command names -- letters, digits, hyphens, underscores and colons (`/beads-task`,
 * `/cdp-automation`, `/report-feedback`). A `/` not followed by one of those is
 * not a token, which is what keeps a file path (`src/lib`) and a date (`10/08`)
 * from being decorated: the slash must be preceded by start-of-text or
 * whitespace.
 */
export const SKILL_TOKEN = /(^|\s)(\/[A-Za-z][A-Za-z0-9_:-]*)/;

/** The same rule, global, for scanning a whole string. */
export const SKILL_TOKEN_GLOBAL = new RegExp(SKILL_TOKEN.source, "g");

export type TokenMatch = { start: number; end: number; name: string };

/**
 * The first `/skill` token in `text`, as offsets into `text`.
 *
 * Shaped for `registerLexicalTextEntity`'s `getMatch`, which wants `{start, end}`
 * of the entity itself -- so the leading whitespace the pattern needs for its
 * boundary is excluded from the range.
 */
export function matchSkillToken(text: string): TokenMatch | null {
  const found = SKILL_TOKEN.exec(text);
  if (!found) return null;
  const token = found[2] ?? "";
  const start = found.index + (found[1] ?? "").length;
  return { start, end: start + token.length, name: token.slice(1) };
}

/** Every token in the text, in order. */
export function allSkillTokens(text: string): TokenMatch[] {
  const matches: TokenMatch[] = [];
  for (const found of text.matchAll(SKILL_TOKEN_GLOBAL)) {
    const token = found[2] ?? "";
    const start = (found.index ?? 0) + (found[1] ?? "").length;
    matches.push({ start, end: start + token.length, name: token.slice(1) });
  }
  return matches;
}

/**
 * The three answers available about a token, in the order the node state
 * declares them -- `unknown` first, so it is the default an un-decided node has.
 */
export const SKILL_VERDICTS = ["unknown", "valid", "invalid"] as const;

export type SkillVerdict = (typeof SKILL_VERDICTS)[number];

/**
 * What the editor should mark a token, given the catalog it currently has.
 *
 * The AC's validity is MEMBERSHIP: `valid if <name> is in /api/queue/skills and
 * invalid otherwise`. Both answers need a catalog, so a `null` one -- the fetch
 * still in flight, or failed -- yields neither. Treating a missing catalog as an
 * empty one marked every real skill invalid on a transport failure, which is a
 * verdict the service never gave.
 */
export function skillVerdict(name: string, catalog: SkillCatalog | null): SkillVerdict {
  if (catalog === null) return "unknown";
  return catalog.has(name) ? "valid" : "invalid";
}
