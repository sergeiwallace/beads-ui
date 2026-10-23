#!/usr/bin/env node
// Keeps each plugin's version ahead of main whenever its shipped content changes.
//
// An installed copy of the mod only updates when `version` in its plugin.json rises:
// `claude plugin update` and marketplace auto-update both compare it and install nothing
// for a commit that leaves it alone. So a branch that changes shipped plugin files must
// carry a version above main's, raised by at least the level its commits call for:
//
//   feat            -> minor
//   anything else   -> patch
//   `type!:` or a BREAKING CHANGE footer -> major, which is never automatic: it needs
//                      the policy's approval trailer (Sergei decides majors).
//
//   node scripts/plugin-version.mjs check [--base <ref>] [--head <ref>] [--title <subject>]
//   node scripts/plugin-version.mjs bump [--base <ref>]
//   node scripts/plugin-version.mjs pre-push
//
// `pre-push` is the pre-commit hook: when the pushed branch falls short it raises the
// version in a commit of its own and fails the push once, so the next push carries it.
// The policy is plugin-release.json at the repository root; ai-harness's
// `ghp pr merge` reads the same file and refuses a merge that falls short.
// Exit status: 0 ok, 1 refused, 2 could not run.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LEVELS = ["none", "patch", "minor", "major"];

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

export function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

export function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(text ?? ""));
  return match ? match.slice(1, 4).map(Number) : null;
}

export function formatVersion(parts) {
  return parts.join(".");
}

export function increment(parts, level) {
  const [major, minor, patch] = parts;
  if (level === "major") return [major + 1, 0, 0];
  if (level === "minor") return [major, minor + 1, 0];
  return [major, minor, patch + 1];
}

export function compare(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

export function bumpLevel(base, head) {
  if (head[0] !== base[0]) return "major";
  if (head[1] !== base[1]) return "minor";
  return "patch";
}

// The level one commit message calls for.
export function messageLevel(message) {
  const subject = message.split("\n", 1)[0].trim();
  const typed = /^([A-Za-z]+)(\([^)]*\))?(!)?:/.exec(subject);
  if (typed?.[3] || /^BREAKING[ -]CHANGE:/m.test(message)) return "major";
  if (typed?.[1].toLowerCase() === "feat") return "minor";
  return "patch";
}

function maxLevel(levels) {
  return levels.reduce(
    (best, level) => (LEVELS.indexOf(level) > LEVELS.indexOf(best) ? level : best),
    "none",
  );
}

export function readPolicy(cwd) {
  return JSON.parse(readFileSync(join(cwd, "plugin-release.json"), "utf8"));
}

function manifestVersion(cwd, ref, manifest) {
  const text =
    ref === null
      ? readFileSync(join(cwd, manifest), "utf8")
      : tryGit(cwd, ["show", `${ref}:${manifest}`]);
  if (text === null) return null;
  return JSON.parse(text).version ?? null;
}

// One verdict per plugin: does `head` carry a version far enough above `base`'s?
export function evaluate({ cwd, base, head = "HEAD", messages = [], worktree = false }) {
  const policy = readPolicy(cwd);
  const mergeBase = git(cwd, ["merge-base", base, head]).trim();
  const changed = git(cwd, ["diff", "--name-only", "--no-renames", `${mergeBase}`, head])
    .split("\n")
    .filter(Boolean);
  // Each commit with the files it touches: a commit's type counts only for a plugin whose
  // shipped files it changed, so a feat to the repository's tooling never raises the mod.
  const commits = git(cwd, ["rev-list", "--no-merges", `${mergeBase}..${head}`])
    .split("\n")
    .filter(Boolean)
    .map((sha) => ({
      message: git(cwd, ["log", "-1", "--format=%B", sha]).trim(),
      files: git(cwd, ["diff-tree", "--no-commit-id", "--name-only", "-r", "--no-renames", sha])
        .split("\n")
        .filter(Boolean),
    }));
  const approved = [...commits.map((c) => c.message), ...messages].some((m) =>
    m
      .split("\n")
      .some((line) => line.trim().toLowerCase() === policy.majorApprovalTrailer.toLowerCase()),
  );
  return policy.plugins.map((plugin) => {
    const ignore = (plugin.ignore ?? []).map(globToRegExp);
    const ships = (file) =>
      plugin.paths.some((prefix) => file.startsWith(prefix)) && !ignore.some((re) => re.test(file));
    const shipped = changed.filter(ships);
    const allMessages = [
      ...commits.filter((c) => c.files.some(ships)).map((c) => c.message),
      ...messages,
    ];
    const result = { name: plugin.name, manifest: plugin.manifest, shipped, approved };
    const baseText = manifestVersion(cwd, base, plugin.manifest);
    const headText = manifestVersion(cwd, worktree ? null : head, plugin.manifest);
    result.baseVersion = baseText;
    result.headVersion = headText;
    if (shipped.length === 0) return { ...result, required: "none", ok: true };
    const required = maxLevel(allMessages.map(messageLevel).concat("patch"));
    const baseParts = parseVersion(baseText);
    const headParts = parseVersion(headText);
    result.required = required;
    if (!baseParts)
      return {
        ...result,
        ok: false,
        fixable: false,
        reason: `${plugin.manifest} on ${base} has no x.y.z version (${baseText})`,
      };
    if (!headParts)
      return {
        ...result,
        ok: false,
        fixable: false,
        reason: `${plugin.manifest} has no x.y.z version (${headText})`,
      };
    result.target = formatVersion(increment(baseParts, required === "major" ? "major" : required));
    if (required === "major" && !approved) {
      return {
        ...result,
        ok: false,
        fixable: false,
        reason: `a commit is marked breaking (\`type!:\` or BREAKING CHANGE), which needs a major bump, and only Sergei approves a major: drop the breaking marker, or add the trailer "${policy.majorApprovalTrailer}" once he has said so`,
      };
    }
    if (compare(headParts, baseParts) <= 0) {
      return {
        ...result,
        ok: false,
        fixable: required !== "major",
        reason: `shipped files changed but ${plugin.name} is still at ${headText}, not above ${base}'s ${baseText}`,
      };
    }
    const actual = bumpLevel(baseParts, headParts);
    if (actual === "major" && !approved) {
      return {
        ...result,
        ok: false,
        fixable: false,
        reason: `${headText} is a major bump from ${baseText}; only Sergei approves a major, recorded by the trailer "${policy.majorApprovalTrailer}"`,
      };
    }
    if (LEVELS.indexOf(actual) < LEVELS.indexOf(required)) {
      return {
        ...result,
        ok: false,
        fixable: true,
        reason: `the commits call for a ${required} bump, but ${headText} is only a ${actual} bump from ${baseText}`,
      };
    }
    return { ...result, ok: true };
  });
}

export function writeVersion(cwd, manifest, version) {
  const path = join(cwd, manifest);
  const text = readFileSync(path, "utf8");
  const next = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
  if (next === text && !text.includes(`"version": "${version}"`))
    throw new Error(`no version field in ${manifest}`);
  writeFileSync(path, next);
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith("--")) throw new Error(`unexpected argument ${flag}`);
    options[flag.slice(2)] = argv[i + 1];
    i += 1;
  }
  return options;
}

function report(results) {
  for (const r of results) {
    if (r.ok) {
      const note =
        r.required === "none"
          ? "no shipped change"
          : `${r.baseVersion} -> ${r.headVersion} (${r.required} required)`;
      console.log(`plugin-version: ${r.name}: ok, ${note}`);
    } else {
      console.error(`plugin-version: ${r.name}: REFUSED: ${r.reason}`);
      if (r.fixable)
        console.error(
          `plugin-version: fix: node scripts/plugin-version.mjs bump (sets ${r.target}), then commit it`,
        );
    }
  }
  return results.every((r) => r.ok);
}

function bump(cwd, base) {
  const results = evaluate({ cwd, base, worktree: true });
  const changed = [];
  for (const r of results) {
    if (r.ok) continue;
    if (!r.fixable) return { results, changed, refused: true };
    writeVersion(cwd, r.manifest, r.target);
    changed.push(r);
  }
  return { results, changed, refused: false };
}

function prePush(cwd) {
  const policy = readPolicy(cwd);
  // pre-commit's pre-push stage names the remote and the pushed sha in these two variables.
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: set by pre-commit, not a turbo task input
  const remote = process.env.PRE_COMMIT_REMOTE_NAME || "origin";
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: set by pre-commit, not a turbo task input
  const toRef = process.env.PRE_COMMIT_TO_REF || "HEAD";
  if (/^0+$/.test(toRef)) return 0; // deleting a remote branch
  if (
    tryGit(cwd, [
      "fetch",
      "--quiet",
      "--no-write-fetch-head",
      remote,
      `+refs/heads/${policy.base}:refs/remotes/${remote}/${policy.base}`,
    ]) === null
  ) {
    console.error(
      `plugin-version: WARNING: could not fetch ${remote}/${policy.base}; checking against the local copy`,
    );
  }
  const base = `${remote}/${policy.base}`;
  const results = evaluate({ cwd, base, head: toRef });
  if (report(results)) return 0;
  const head = git(cwd, ["rev-parse", "HEAD"]).trim();
  const pushed = git(cwd, ["rev-parse", toRef]).trim();
  if (results.some((r) => !r.ok && !r.fixable) || pushed !== head) return 1;
  const manifests = results.filter((r) => !r.ok).map((r) => r.manifest);
  if (git(cwd, ["status", "--porcelain", "--", ...manifests]).trim()) {
    console.error(
      `plugin-version: ${manifests.join(", ")} has uncommitted changes, so the version was not raised for you`,
    );
    return 1;
  }
  for (const r of results.filter((x) => !x.ok)) writeVersion(cwd, r.manifest, r.target);
  const names = results
    .filter((r) => !r.ok)
    .map((r) => `${r.name} ${r.target}`)
    .join(", ");
  git(
    cwd,
    [
      "commit",
      "--quiet",
      "-m",
      `chore(release): ${names}\n\nRaised by scripts/plugin-version.mjs on push: shipped plugin files changed\nsince ${base}.\n\n\nDelegated-to: none`,
      "--",
      ...manifests,
    ],
    { stdio: "inherit" },
  );
  console.error(
    `plugin-version: raised ${names} in a new commit on this branch; run the same git push again`,
  );
  return 1;
}

function main(argv) {
  const [command, ...rest] = argv;
  const cwd = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
  const options = parseArgs(rest);
  const base = options.base ?? `origin/${readPolicy(cwd).base}`;
  if (command === "check") {
    const messages = options.title ? [options.title] : [];
    return report(evaluate({ cwd, base, head: options.head ?? "HEAD", messages })) ? 0 : 1;
  }
  if (command === "bump") {
    const { results, changed, refused } = bump(cwd, base);
    if (refused) return report(results) ? 0 : 1;
    for (const r of changed)
      console.log(`plugin-version: ${r.name}: ${r.headVersion} -> ${r.target} in ${r.manifest}`);
    if (changed.length === 0) report(results);
    return 0;
  }
  if (command === "pre-push") return prePush(cwd);
  console.error(
    "usage: plugin-version.mjs check|bump|pre-push [--base <ref>] [--head <ref>] [--title <subject>]",
  );
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`plugin-version: ${error.message}`);
    process.exit(2);
  }
}
