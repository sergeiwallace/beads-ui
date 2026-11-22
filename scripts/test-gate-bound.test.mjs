import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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

const inherited = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !key.startsWith("GIT_") &&
      !key.startsWith("PRE_COMMIT_") &&
      key !== "BEADS_UI_TEST_JOBS" &&
      key !== "BEADS_UI_TEST_SCOPE",
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

function run(command, args, { cwd = ROOT, jobs, scope } = {}) {
  const env =
    scope === undefined ? envWith(jobs) : { ...envWith(jobs), BEADS_UI_TEST_SCOPE: scope };
  return spawnSync(command, args, { cwd, env, encoding: "utf8" });
}

describe("the pre-commit test hooks' path filter", () => {
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

  test("should run the suite under the commit scope", () => {
    const { dir, git } = repo();
    write(dir, "src/a.ts", "export const a = 4;\n");
    git("add", "-A");
    const result = hook(dir, ["-e", "console.log('SCOPE=' + process.env.BEADS_UI_TEST_SCOPE)"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^SCOPE=commit$/m);
  });

  test("should fail with the suite's status when the suite fails", () => {
    const { dir, git } = repo();
    write(dir, "src/a.ts", "export const a = 3;\n");
    git("add", "-A");
    assert.equal(hook(dir, ["-e", "process.exit(3)"]).status, 3);
  });

  test("should put the commit's test hook behind the filter and run the mod's loop only inside it", () => {
    const config = readFileSync(join(ROOT, ".pre-commit-config.yaml"), "utf8");
    const hooks = config
      .split(/^ {6}- id: /m)
      .slice(1)
      .map((block) => ({
        id: block.split("\n")[0],
        entry: block.match(/^ {8}entry: (.*)$/m)?.[1] ?? "",
      }));
    assert.equal(
      hooks.find((hook) => hook.id === "npm-test")?.entry,
      "node scripts/test-hook.mjs npm test",
    );
    assert.deepEqual(
      hooks.filter((hook) => hook.entry.includes("plugin-test.mjs")).map((hook) => hook.id),
      [],
    );
  });
});

function peak(lines, startOf, endOf) {
  let now = 0;
  let max = 0;
  for (const line of lines) {
    if (startOf(line)) max = Math.max(max, ++now);
    else if (endOf(line)) now -= 1;
  }
  return max;
}

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

describe("turbo's concurrency", () => {
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
    write(
      dir,
      "turbo.json",
      JSON.stringify({ tasks: { test: { cache: false }, "test:mod": { cache: false } } }),
    );
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

  test("should refuse a test scope other than commit before starting turbo", () => {
    const { dir, log } = workspace();
    const result = run(process.execPath, turboCommand(), { cwd: dir, scope: "push" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BEADS_UI_TEST_SCOPE=push: expected commit or nothing/);
    assert.equal(readFileSync(log, "utf8"), "");
  });

  test("should refuse a bound above 2 before starting turbo", () => {
    const { dir, log } = workspace();
    const result = run(process.execPath, turboCommand(), { cwd: dir, jobs: 3 });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /BEADS_UI_TEST_JOBS=3: expected a whole number from 1 to 2/);
    assert.equal(readFileSync(log, "utf8"), "");
  });

  test("should hand BEADS_UI_TEST_JOBS and BEADS_UI_TEST_SCOPE to each package task under the repository's turbo.json", () => {
    const dir = fresh("turbo-env");
    const log = join(dir, "env.log");
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
    write(dir, "turbo.json", readFileSync(join(ROOT, "turbo.json"), "utf8"));
    write(
      dir,
      "env.mjs",
      `import { appendFileSync } from "node:fs";
appendFileSync(process.argv[2], \`JOBS=\${process.env.BEADS_UI_TEST_JOBS} SCOPE=\${process.env.BEADS_UI_TEST_SCOPE}\\n\`);
`,
    );
    write(
      dir,
      "packages/a/package.json",
      JSON.stringify({ name: "a", scripts: { test: `node ../../env.mjs ${log}` } }),
    );
    const result = run(process.execPath, turboCommand(), { cwd: dir, jobs: 2, scope: "commit" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(readFileSync(log, "utf8"), "JOBS=2 SCOPE=commit\n");
  });
});

describe("the mod's loop as its own turbo task", () => {
  const MOD = "@sergeiwallace/beads-ui-plugin";
  const rootScripts = () => JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;

  test("should run the mod's loop once, as its test:mod task, and the script tests, when npm test runs", () => {
    const args = turboCommand();
    const result = run(process.execPath, [...args, "--dry=json"], { jobs: 2 });
    assert.equal(result.status, 0, result.stderr);
    const tasks = JSON.parse(result.stdout).tasks.filter(
      (task) => task.command !== "<NONEXISTENT>",
    );
    const command = (id) => tasks.find((task) => task.taskId === id)?.command;
    assert.equal(command(`${MOD}#test:mod`), "node ../../scripts/plugin-test.mjs .");
    assert.deepEqual(
      tasks.filter((task) => task.command.includes("plugin-test.mjs")).map((task) => task.taskId),
      [`${MOD}#test:mod`],
    );
    assert.equal(command("//#test:scripts"), rootScripts()["test:scripts"]);
    assert.match(
      rootScripts()["test:scripts"],
      /node --test --test-concurrency=\{jobs\} scripts\/\*\.test\.mjs$/,
    );
  });

  function workspace(log, loop) {
    const dir = fresh("turbo-loop");
    const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const hold = (name, ms, until) =>
      `node ../../hold.mjs ${log} ${name} ${ms}${until ? ` "${until}"` : ""}`;
    write(
      dir,
      "package.json",
      JSON.stringify({
        name: "fixture",
        private: true,
        packageManager: root.packageManager,
        workspaces: ["packages/*", "plugins/*"],
        scripts: { "test:scripts": `node hold.mjs ${log} scripts 400` },
      }),
    );
    write(dir, "turbo.json", readFileSync(join(ROOT, "turbo.json"), "utf8"));
    write(
      dir,
      "hold.mjs",
      `import { appendFileSync, readFileSync } from "node:fs";
const [log, name, ms, until] = process.argv.slice(2);
appendFileSync(log, \`start \${name} \${process.env.BEADS_UI_TEST_JOBS}\\n\`);
const end = () => appendFileSync(log, \`end \${name}\\n\`);
const other = () => readFileSync(log, "utf8").split("\\n").some((l) => l.startsWith(until));
const deadline = Date.now() + Number(ms);
const poll = () => (other() || Date.now() > deadline ? end() : setTimeout(poll, 20));
if (until) poll();
else setTimeout(end, Number(ms));
`,
    );
    const packages = ["a", "b", "c", "d", "e", "f", "g", "h"];
    for (const name of packages) {
      write(
        dir,
        `packages/${name}/package.json`,
        JSON.stringify({ name, scripts: { test: hold(name, 200) } }),
      );
    }
    write(
      dir,
      "plugins/mod/package.json",
      JSON.stringify({
        name: MOD,
        scripts: { test: hold("mod-vitest", 200), "test:mod": hold("mod-loop", ...loop) },
      }),
    );
    appendFileSync(log, "");
    return { dir, packages: [...packages, "mod-vitest"] };
  }

  for (const [jobs, expected, loop] of [
    [undefined, 1, [200]],
    [2, 2, [20000, "start a "]],
  ]) {
    test(`should start the loop and the script tests first, and run ${expected} task(s) at a time, when BEADS_UI_TEST_JOBS is ${jobs ?? "unset"}`, () => {
      const log = join(fresh("turbo-loop-log"), "events.log");
      const { dir, packages } = workspace(log, loop);
      const result = run(process.execPath, turboCommand(), { cwd: dir, jobs });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
      const starts = lines.filter((l) => l.startsWith("start ")).map((l) => l.split(" "));
      assert.equal(starts.length, packages.length + 2);
      assert.deepEqual(
        starts.map(([, , seen]) => seen),
        starts.map(() => String(jobs ?? "undefined")),
      );
      assert.equal(starts.filter(([, name]) => name === "mod-loop").length, 1);
      const scriptsEnd = lines.indexOf("end scripts");
      for (const name of packages) {
        assert.ok(
          lines.findIndex((l) => l.startsWith(`start ${name} `)) > scriptsEnd,
          `${name} started before the script tests ended`,
        );
      }
      if (expected === 2) {
        assert.deepEqual(
          starts
            .slice(0, 2)
            .map(([, name]) => name)
            .sort(),
          ["mod-loop", "scripts"],
        );
        const loopEnd = lines.indexOf("end mod-loop");
        assert.ok(
          packages.some((name) => lines.findIndex((l) => l.startsWith(`start ${name} `)) < loopEnd),
          "no package test ran beside the loop",
        );
      }
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

describe("apps/web's suites under the commit scope", () => {
  const WEB = join(ROOT, "apps", "web");
  const PROBE = `import { relative } from "node:path";
import { createVitest } from "vitest/node";
const root = process.argv[1];
const vitest = await createVitest("test", { root, watch: false }, {}, {});
const found = await vitest.globTestSpecifications();
console.log(JSON.stringify(found.map((spec) => relative(root, spec.moduleId)).sort()));
await vitest.close();`;
  const SERVER_IMPORT = /from "(\.\.\/server\/server|\.\/store|\.\/host-stores)\.ts"/;
  const every = readdirSync(join(WEB, "test"))
    .filter((name) => name.endsWith(".test.ts"))
    .map((name) => `test/${name}`)
    .sort();
  const serving = every.filter((path) => SERVER_IMPORT.test(readFileSync(join(WEB, path), "utf8")));

  const suites = (scope) => {
    const result = run(process.execPath, ["--input-type=module", "-e", PROBE, WEB], { scope });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout.trim().split("\n").at(-1));
  };

  test("should run every apps/web suite when no scope is set", () => {
    assert.ok(serving.length >= 20, `only ${serving.length} suites import the server or a store`);
    assert.deepEqual(suites(undefined), every);
  });

  test("should run no suite that imports the server or a store factory, and every other suite, under the commit scope", () => {
    const kept = suites("commit");
    assert.deepEqual(
      kept,
      every.filter((path) => !serving.includes(path)),
    );
    for (const path of ["test/envelope.test.ts", "test/favicon.test.ts", "test/service.test.ts"]) {
      assert.ok(kept.includes(path), `${path} left the commit gate`);
    }
    for (const path of [
      "test/server.test.ts",
      "test/registry.test.ts",
      "test/store-image.test.ts",
    ]) {
      assert.ok(!kept.includes(path), `${path} stayed in the commit gate`);
    }
  });

  test("should run the pre-push test gate with no scope, even when the push inherits one", () => {
    const config = readFileSync(join(ROOT, ".pre-commit-config.yaml"), "utf8");
    const entry = config.match(/- id: test-gate\n(?: {8}.*\n)*? {8}entry: (.*)/)?.[1];
    assert.ok(entry, "no test-gate hook in .pre-commit-config.yaml");
    const bin = fresh("test-gate-bin");
    write(
      bin,
      "test-gate",
      '#!/bin/sh\necho "SCOPE=$(printenv BEADS_UI_TEST_SCOPE || echo unset)"\n',
    );
    execFileSync("chmod", ["+x", join(bin, "test-gate")]);
    const result = spawnSync("sh", ["-c", entry], {
      env: { ...ENV, PATH: `${bin}:${ENV.PATH}`, BEADS_UI_TEST_SCOPE: "commit" },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "SCOPE=unset");
  });

  test("should fail to load apps/web's config when BEADS_UI_TEST_SCOPE holds another value", () => {
    const result = run(process.execPath, ["--input-type=module", "-e", PROBE, WEB], {
      scope: "push",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /BEADS_UI_TEST_SCOPE=push: expected commit or nothing/);
  });
});

describe("Playwright's workers", () => {
  const E2E = join(ROOT, "apps", "web", "e2e");
  const listed = (jobs) =>
    run(
      join(E2E, "node_modules", ".bin", "playwright"),
      ["test", "-c", "frontend-harness.config.ts", "--list", "--reporter=json"],
      { cwd: E2E, jobs },
    );

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

describe("Vitest's module cache", () => {
  const PROBE = `import { createVitest } from "vitest/node";
const vitest = await createVitest("test", { root: process.argv[1], watch: false }, {}, {});
console.log(JSON.stringify(vitest.config.fsModuleCachePath ?? null));
await vitest.close();`;

  for (const dir of [
    "apps/terminal",
    "apps/web",
    "packages/bd-node",
    "packages/mcp-server",
    "packages/web-ui",
    "plugins/beads-ui",
  ]) {
    test(`should keep ${dir}'s module cache inside ${dir}`, () => {
      const result = run(process.execPath, ["--input-type=module", "-e", PROBE, join(ROOT, dir)], {
        jobs: 2,
      });
      assert.equal(result.status, 0, result.stderr);
      const path = JSON.parse(result.stdout.trim().split("\n").at(-1));
      assert.equal(path, join(ROOT, dir, "node_modules", ".vitest-cache"));
    });
  }
});
