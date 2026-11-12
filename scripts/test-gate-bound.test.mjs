// The commit test gate's two limits, driven through their real entry points: the pre-commit
// test hooks' docs-only path filter (scripts/test-hook.mjs) and the BEADS_UI_TEST_JOBS bound read
// by turbo, every Vitest config, Playwright and the plugin-test loop (scripts/plugin-test.mjs).
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "node_modules", ".bin");
const scratch = mkdtempSync(join(tmpdir(), "test-gate-bound-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

// Inside a git hook, git exports GIT_DIR, GIT_INDEX_FILE and friends; inherited, they point every
// git call here at the repository being committed instead of the throwaway one. The bound itself
// is set per case, never inherited from the shell running the suite.
const inherited = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !key.startsWith("GIT_") && !key.startsWith("PRE_COMMIT_") && key !== "BEADS_UI_TEST_JOBS",
  ),
);
const ENV = {
  ...inherited,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  TURBO_TELEMETRY_DISABLED: "1",
};
const envWith = (jobs) => (jobs === undefined ? ENV : { ...ENV, BEADS_UI_TEST_JOBS: String(jobs) });

let counter = 0;
const fresh = (name) => {
  counter += 1;
  const dir = join(scratch, `${name}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

function write(dir, path, text) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function run(command, args, { cwd = ROOT, jobs } = {}) {
  return spawnSync(command, args, { cwd, env: envWith(jobs), encoding: "utf8" });
}

describe("the pre-commit test hooks' path filter", () => {
  // The marker is built at run time so the hook's skip line, which names the command, never holds it.
  const SUITE = ["-e", "console.log(['SUITE', 'RAN'].join(' '))"];

  function repo() {
    const dir = fresh("hook");
    const git = (...args) => execFileSync("git", args, { cwd: dir, env: ENV, encoding: "utf8" });
    git("init", "-q", "-b", "main");
    write(dir, "src/a.ts", "export const a = 1;\n");
    write(dir, "docs/guide.md", "# Guide\n");
    git("add", "-A");
    git("commit", "-q", "-m", "seed");
    return { dir, git };
  }

  const hook = (dir, args = SUITE) =>
    run(process.execPath, [join(ROOT, "scripts", "test-hook.mjs"), process.execPath, ...args], {
      cwd: dir,
    });

  test("should skip the suite when every staged path is docs/** or *.md", () => {
    const { dir, git } = repo();
    write(dir, "docs/guide.md", "# Guide\n\nMore.\n");
    write(dir, "docs/images/board.png", "png");
    write(dir, "README.md", "# Read me\n");
    git("add", "-A");
    const result = hook(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /SUITE RAN/);
    assert.match(result.stdout, /skipped .*every staged path is docs\/\*\* or \*\.md/);
  });

  test("should run the suite when a code path is staged beside docs", () => {
    const { dir, git } = repo();
    write(dir, "docs/guide.md", "# Guide\n\nMore.\n");
    write(dir, "src/a.ts", "export const a = 2;\n");
    git("add", "-A");
    const result = hook(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /SUITE RAN/);
  });

  test("should run the suite when the only staged change deletes a code file", () => {
    const { dir, git } = repo();
    git("rm", "-q", "src/a.ts");
    assert.match(hook(dir).stdout, /SUITE RAN/);
  });

  test("should run the suite when a code file is renamed into docs/", () => {
    const { dir, git } = repo();
    git("mv", "src/a.ts", "docs/a.ts");
    assert.match(hook(dir).stdout, /SUITE RAN/);
  });

  test("should run the suite when nothing is staged", () => {
    const { dir } = repo();
    assert.match(hook(dir).stdout, /SUITE RAN/);
  });

  test("should fail with the suite's status when the suite fails", () => {
    const { dir, git } = repo();
    write(dir, "src/a.ts", "export const a = 3;\n");
    git("add", "-A");
    assert.equal(hook(dir, ["-e", "process.exit(3)"]).status, 3);
  });

  test("should put both test hooks of .pre-commit-config.yaml behind the filter", () => {
    const config = readFileSync(join(ROOT, ".pre-commit-config.yaml"), "utf8");
    const entryOf = (id) =>
      config.match(new RegExp(`- id: ${id}\\n(?: {8}.*\\n)*? {8}entry: (.*)`))?.[1];
    assert.equal(entryOf("npm-test"), "node scripts/test-hook.mjs npm test");
    assert.equal(
      entryOf("plugin-test"),
      "node scripts/test-hook.mjs node scripts/plugin-test.mjs plugins/beads-ui",
    );
  });
});

// The highest number of overlapping start/end intervals in a log of `start <name>` and
// `end <name>` lines.
function peak(lines, startOf, endOf) {
  let now = 0;
  let max = 0;
  for (const line of lines) {
    if (startOf(line)) max = Math.max(max, ++now);
    else if (endOf(line)) now -= 1;
  }
  return max;
}

describe("turbo's concurrency", () => {
  // Three packages whose tests each hold for a moment, run from the fixture's folder by the root
  // test script's own turbo command.
  function turboCommand() {
    const script = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts.test;
    const segment = script.split(" && ").find((part) => part.includes(" turbo "));
    assert.ok(segment, `no turbo command in the root test script: ${script}`);
    const [node, ...args] = segment.split(" ");
    assert.equal(node, "node");
    return args.map((arg) =>
      arg === "turbo" ? join(BIN, "turbo") : arg.startsWith("scripts/") ? join(ROOT, arg) : arg,
    );
  }

  function workspace() {
    const dir = fresh("turbo");
    const log = join(dir, "events.log");
    write(
      dir,
      "package.json",
      JSON.stringify({
        name: "fixture",
        private: true,
        packageManager: "npm@11.19.0",
        workspaces: ["packages/*"],
      }),
    );
    write(dir, "turbo.json", JSON.stringify({ tasks: { test: { cache: false } } }));
    write(
      dir,
      "hold.mjs",
      `import { appendFileSync } from "node:fs";
const [log, name] = process.argv.slice(2);
appendFileSync(log, \`start \${name}\\n\`);
setTimeout(() => appendFileSync(log, \`end \${name}\\n\`), 800);
`,
    );
    for (const name of ["a", "b", "c"]) {
      write(
        dir,
        `packages/${name}/package.json`,
        JSON.stringify({ name, scripts: { test: `node ../../hold.mjs ${log} ${name}` } }),
      );
    }
    appendFileSync(log, "");
    return { dir, log };
  }

  for (const [jobs, expected] of [
    [undefined, 1],
    [2, 2],
  ]) {
    test(`should run ${expected} package task(s) at a time when BEADS_UI_TEST_JOBS is ${jobs ?? "unset"}`, () => {
      const { dir, log } = workspace();
      const result = run(process.execPath, turboCommand(), { cwd: dir, jobs });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const lines = readFileSync(log, "utf8").split("\n");
      assert.equal(lines.filter((l) => l.startsWith("end ")).length, 3);
      assert.equal(
        peak(
          lines,
          (l) => l.startsWith("start "),
          (l) => l.startsWith("end "),
        ),
        expected,
      );
    });
  }

  test("should refuse a bound above 2 before starting turbo", () => {
    const { dir, log } = workspace();
    const result = run(process.execPath, turboCommand(), { cwd: dir, jobs: 3 });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BEADS_UI_TEST_JOBS=3: expected a whole number from 1 to 2/);
    assert.equal(readFileSync(log, "utf8"), "");
  });
});

describe("Vitest's worker cap", () => {
  const PROBE = `import { createVitest } from "vitest/node";
const vitest = await createVitest("test", { root: process.argv[1], watch: false }, {}, {});
console.log(JSON.stringify(vitest.config.maxWorkers));
await vitest.close();`;
  const CONFIGS = [
    "",
    "plugins/beads-ui",
    "packages/bd-node",
    "packages/mcp-server",
    "packages/web-ui",
    "apps/web",
  ];

  const maxWorkers = (dir, jobs) =>
    run(process.execPath, ["--input-type=module", "-e", PROBE, join(ROOT, dir)], { jobs });

  for (const dir of CONFIGS) {
    const name = dir || "the root config";
    for (const [jobs, expected] of [
      [undefined, 1],
      [2, 2],
    ]) {
      test(`should give ${name} ${expected} worker(s) when BEADS_UI_TEST_JOBS is ${jobs ?? "unset"}`, () => {
        const result = maxWorkers(dir, jobs);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout.trim().split("\n").at(-1)), expected);
      });
    }
  }

  test("should fail to load a config when BEADS_UI_TEST_JOBS is not a whole number", () => {
    const result = maxWorkers("packages/bd-node", "two");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BEADS_UI_TEST_JOBS=two: expected a whole number from 1 to 2/);
  });
});

describe("Playwright's workers", () => {
  const listed = (jobs) =>
    run(join(BIN, "playwright"), ["test", "--list", "--reporter=json"], {
      cwd: join(ROOT, "apps", "web"),
      jobs,
    });

  for (const [jobs, expected] of [
    [undefined, 1],
    [2, 2],
  ]) {
    test(`should run ${expected} worker(s) when BEADS_UI_TEST_JOBS is ${jobs ?? "unset"}`, () => {
      const result = listed(jobs);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).config.workers, expected);
    });
  }
});

describe("the plugin-test loop", () => {
  const HOLD = (ms) => `import { describe, expect, test } from "claude-code/testing";
describe("hold", () => {
  test("should pass after ${ms} ms", async () => {
    await new Promise((resolve) => setTimeout(resolve, ${ms}));
    expect(1).toBe(1);
  });
});
`;
  const FAIL = `import { describe, expect, test } from "claude-code/testing";
describe("broken", () => {
  test("should fail", () => {
    expect(1).toBe(2);
  });
});
`;

  function mod(files) {
    const dir = fresh("mod");
    write(dir, ".claude-plugin/plugin.json", JSON.stringify({ name: "fixture", version: "0.0.1" }));
    write(dir, "hooks/hooks.json", JSON.stringify({ modules: ["./register.ts"] }));
    write(dir, "hooks/register.ts", "export default function register() {}\n");
    for (const [path, text] of Object.entries(files)) write(dir, path, text);
    return dir;
  }

  const loop = (dir, jobs) =>
    run(process.execPath, [join(ROOT, "scripts", "plugin-test.mjs"), dir], { jobs });

  // A file is in flight from its `run <file>` line to its `<file>:` result block.
  const inFlight = (stdout) =>
    peak(
      stdout.split("\n"),
      (l) => l.startsWith("run "),
      (l) => /^\S+\.test\.tsx?:$/.test(l),
    );

  const held = () =>
    mod({
      "hooks/a.test.ts": HOLD(1500),
      "hooks/b.test.ts": HOLD(1500),
      "core/c.test.ts": HOLD(1500),
    });

  for (const [jobs, expected] of [
    [undefined, 1],
    [2, 2],
  ]) {
    test(`should run ${expected} file(s) at a time when BEADS_UI_TEST_JOBS is ${jobs ?? "unset"}`, () => {
      const result = loop(held(), jobs);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /^ 3 pass$/m);
      assert.match(result.stdout, /^Ran 3 tests across 3 files/m);
      assert.equal(inFlight(result.stdout), expected);
    });
  }

  test("should fail the run and name the failing file when one file fails", () => {
    const dir = mod({ "hooks/a.test.ts": HOLD(0), "hooks/broken.test.ts": FAIL });
    const result = loop(dir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^ 1 pass$/m);
    assert.match(result.stdout, /^ 1 fail$/m);
    assert.match(result.stdout, /^\(fail\) broken > should fail/m);
    assert.match(result.stdout, /Failed files:\n {2}hooks\/broken\.test\.ts$/m);
    assert.doesNotMatch(result.stdout, /Failed files:[\s\S]*hooks\/a\.test\.ts/);
  });

  test("should fail when the folder holds no test file", () => {
    const result = loop(mod({}));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no \*\.test\.ts or \*\.test\.tsx under/);
  });
});
