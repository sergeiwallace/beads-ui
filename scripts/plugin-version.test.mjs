// Drives scripts/plugin-version.mjs the way the pre-push hook and a person do: as a CLI,
// in a throwaway repository with an origin, so every case runs real git.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "plugin-version.mjs");
const POLICY = readFileSync(join(dirname(SCRIPT), "..", "plugin-release.json"), "utf8");
const MANIFEST = "plugins/beads-ui/.claude-plugin/plugin.json";
const scratch = mkdtempSync(join(tmpdir(), "plugin-version-test-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

// Inside a git hook, git exports GIT_DIR, GIT_INDEX_FILE and friends; inherited, they point every
// git call here at the repository being committed instead of the throwaway one.
const inherited = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
);
const ENV = {
  ...inherited,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

let counter = 0;
function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
}

function write(cwd, path, text) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), text);
}

function commit(cwd, message, files) {
  for (const [path, text] of Object.entries(files)) write(cwd, path, text);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
}

// A clone whose origin/main holds the policy and the plugin at `version`, on a work branch.
function repo(version = "0.1.1") {
  counter += 1;
  const origin = join(scratch, `origin-${counter}.git`);
  const work = join(scratch, `work-${counter}`);
  git(scratch, "init", "-q", "--bare", "-b", "main", origin);
  git(scratch, "clone", "-q", origin, work);
  git(work, "checkout", "-q", "-b", "main");
  commit(work, "chore: seed", {
    "plugin-release.json": POLICY,
    [MANIFEST]: `{\n  "name": "beads-ui",\n  "version": "${version}"\n}\n`,
    "plugins/beads-ui/hooks/pane.ts": "export const a = 1;\n",
    "README.md": "readme\n",
  });
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "-b", "wt/change");
  return work;
}

function run(cwd, ...args) {
  const result = spawnSync("node", [SCRIPT, ...args], {
    cwd,
    env: { ...ENV, PRE_COMMIT_REMOTE_NAME: "origin" },
    encoding: "utf8",
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function version(cwd, ref = "HEAD") {
  return JSON.parse(git(cwd, "show", `${ref}:${MANIFEST}`)).version;
}

test("a fix to shipped plugin code cannot be pushed at main's version, and pre-push raises it by a patch", () => {
  const cwd = repo();
  commit(cwd, "fix(mod): stream bd list", {
    "plugins/beads-ui/hooks/pane.ts": "export const a = 2;\n",
  });
  assert.equal(run(cwd, "check").status, 1);
  const push = run(cwd, "pre-push");
  assert.equal(push.status, 1, push.out);
  assert.match(push.out, /raised beads-ui 0\.1\.2 in a new commit/);
  assert.equal(version(cwd), "0.1.2");
  assert.match(git(cwd, "log", "-1", "--format=%s"), /^chore\(release\): beads-ui 0\.1\.2$/);
  assert.equal(run(cwd, "pre-push").status, 0);
});

test("a feat branch is raised by a minor", () => {
  const cwd = repo();
  commit(cwd, "feat(mod): sprints lane", {
    "plugins/beads-ui/hooks/pane.ts": "export const a = 3;\n",
  });
  assert.equal(run(cwd, "pre-push").status, 1);
  assert.equal(version(cwd), "0.2.0");
});

test("a patch bump is not enough once a feat lands, and the bump recomputes from main", () => {
  const cwd = repo();
  commit(cwd, "fix: one", { "plugins/beads-ui/hooks/pane.ts": "export const a = 4;\n" });
  run(cwd, "pre-push");
  assert.equal(version(cwd), "0.1.2");
  commit(cwd, "feat: two", { "plugins/beads-ui/hooks/pane.ts": "export const a = 5;\n" });
  const check = run(cwd, "check");
  assert.equal(check.status, 1);
  assert.match(check.out, /call for a minor bump/);
  assert.equal(run(cwd, "bump").status, 0);
  assert.equal(JSON.parse(readFileSync(join(cwd, MANIFEST), "utf8")).version, "0.2.0");
});

test("a squash title of type feat raises the requirement to minor", () => {
  const cwd = repo();
  commit(cwd, "fix: x", { "plugins/beads-ui/hooks/pane.ts": "export const a = 6;\n" });
  run(cwd, "pre-push");
  assert.equal(run(cwd, "check").status, 0);
  assert.equal(run(cwd, "check", "--title", "feat(mod): new lane").status, 1);
});

test("test-only, doc-only and unshipped changes need no bump", () => {
  const cwd = repo();
  commit(cwd, "test: more", {
    "plugins/beads-ui/hooks/pane.test.ts": "x\n",
    "plugins/beads-ui/hooks/tests/kit.ts": "x\n",
    "plugins/beads-ui/core/test/fixture.json": "{}\n",
    "README.md": "more\n",
  });
  const push = run(cwd, "pre-push");
  assert.equal(push.status, 0, push.out);
  assert.match(push.out, /no shipped change/);
  assert.equal(version(cwd), "0.1.1");
});

test("a breaking change is refused and nothing is committed, without Sergei's approval", () => {
  const cwd = repo();
  commit(cwd, "feat(mod)!: new config shape", {
    "plugins/beads-ui/hooks/pane.ts": "export const a = 7;\n",
  });
  const before = git(cwd, "rev-parse", "HEAD");
  const push = run(cwd, "pre-push");
  assert.equal(push.status, 1);
  assert.match(push.out, /only Sergei approves a major/);
  assert.equal(git(cwd, "rev-parse", "HEAD"), before);
});

test("a hand-made major bump is refused without the trailer and accepted with it", () => {
  const cwd = repo();
  commit(cwd, "fix: x", {
    "plugins/beads-ui/hooks/pane.ts": "export const a = 8;\n",
    [MANIFEST]: '{\n  "name": "beads-ui",\n  "version": "1.0.0"\n}\n',
  });
  assert.match(run(cwd, "check").out, /is a major bump/);
  git(
    cwd,
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "chore(release): 1.0.0\n\nSemver-major-approved-by: Sergei",
  );
  assert.equal(run(cwd, "check").status, 0);
});

test("a version raised past main's by the right level passes as it is", () => {
  const cwd = repo();
  commit(cwd, "fix: x", {
    "plugins/beads-ui/hooks/pane.ts": "export const a = 9;\n",
    [MANIFEST]: '{\n  "name": "beads-ui",\n  "version": "0.1.2"\n}\n',
  });
  const before = git(cwd, "rev-parse", "HEAD");
  assert.equal(run(cwd, "pre-push").status, 0);
  assert.equal(git(cwd, "rev-parse", "HEAD"), before);
});

test("a feat that touches no shipped file does not raise the plugin's bump to minor", () => {
  const cwd = repo();
  commit(cwd, "feat(release): repository tooling", { "scripts/tool.mjs": "x\n" });
  commit(cwd, "fix(mod): one", { "plugins/beads-ui/hooks/pane.ts": "export const a = 10;\n" });
  assert.equal(run(cwd, "pre-push").status, 1);
  assert.equal(version(cwd), "0.1.2");
});
