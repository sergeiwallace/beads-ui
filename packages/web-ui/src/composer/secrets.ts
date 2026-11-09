/**
 * Secret-shape detection for the prompt composer, the ai-core dashboard composer's guard as
 * shipped (web app design D-4, T-W1.3): a dispatched prompt never carries a secret, and the
 * composer refuses common secret shapes. "Common shapes", not "all secrets"
 * -- this is a guard against pasting a credential into a prompt by accident, not
 * a classifier, and the AC it has to satisfy is that a refusal *names the
 * offending token's position* so the author can see which token it meant.
 *
 * Every pattern is anchored on a vendor-published prefix or an unmistakable
 * structural marker, because a generic entropy heuristic on prompt text -- which
 * is full of commit SHAs, Beads display ids and file paths -- would refuse
 * legitimate prompts, and a composer that cries wolf gets worked around.
 */

export type SecretFinding = {
  /** What was matched, so the message can say which kind of credential it looks like. */
  kind: string;
  /** The offending token, verbatim. Never logged or sent anywhere. */
  token: string;
  /** Zero-based character offset of the token in the composer text. */
  index: number;
  /** One-based line and column, which is what a person can actually act on. */
  line: number;
  column: number;
};

type Rule = { kind: string; pattern: RegExp };

const RULES: Rule[] = [
  { kind: "AWS access key id", pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { kind: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { kind: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  // Anthropic before OpenAI: `sk-ant-...` satisfies both shapes, and the rule
  // listed first wins the overlap, so the more specific one has to come first.
  { kind: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "OpenAI API key", pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}\b/g },
  { kind: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "private key block", pattern: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g },
  {
    kind: "JSON Web Token",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  { kind: "npm token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { kind: "PyPI token", pattern: /\bpypi-[A-Za-z0-9_-]{32,}\b/g },
  {
    // A credential-looking assignment: a name whose own words claim it is a
    // secret, with a long opaque value attached.
    kind: "credential assignment",
    pattern:
      /\b[A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|PRIVATE[_-]?KEY)[A-Za-z0-9_]*\s*[:=]\s*["']?([A-Za-z0-9/+=_.-]{12,})["']?/gi,
  },
];

function positionOf(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const column = index - (before.lastIndexOf("\n") + 1) + 1;
  return { line, column };
}

/**
 * Every secret-shaped token in the text, in the order they appear.
 *
 * Returns all findings rather than the first, so a paste carrying two
 * credentials does not need two round trips to clear.
 */
export function findSecrets(text: string): SecretFinding[] {
  const findings: (SecretFinding & { rule: number })[] = [];
  for (const [rule, { kind, pattern }] of RULES.entries()) {
    // Each rule's RegExp is module-level and stateful (/g keeps lastIndex), so it
    // must be reset or the second call over the same text starts mid-string and
    // silently finds nothing.
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      // Group 1, when a rule declares one, is the value rather than the whole
      // assignment: naming `PASSWORD = hunter2hunter2` at the `P` would point at
      // the part that is not the secret.
      const token = match[1] ?? match[0];
      const index = match[1] === undefined ? match.index : match.index + match[0].indexOf(match[1]);
      findings.push({ kind, token, index, rule, ...positionOf(text, index) });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  // One token can satisfy two shapes (`sk-ant-...` is both an Anthropic key and
  // the generic `sk-` shape; a `TOKEN=ghp_...` line is both an assignment and a
  // GitHub token), and reporting it twice would name two positions for one
  // mistake. Keep the earliest finding, breaking a tie on rule order -- the more
  // specific rule is listed first -- and drop anything overlapping it.
  const ordered = findings.sort(
    (left, right) => left.index - right.index || left.rule - right.rule,
  );
  const kept: SecretFinding[] = [];
  let coveredUntil = -1;
  for (const { rule: _rule, ...finding } of ordered) {
    if (finding.index < coveredUntil) continue;
    kept.push(finding);
    coveredUntil = finding.index + finding.token.length;
  }
  return kept;
}

/** The refusal message the composer shows. Names the position, never the value. */
export function describeRefusal(finding: SecretFinding): string {
  return (
    `Refused: this looks like a ${finding.kind} at line ${finding.line}, ` +
    `column ${finding.column} (character ${finding.index + 1}). ` +
    "A queued prompt must never carry a secret."
  );
}
