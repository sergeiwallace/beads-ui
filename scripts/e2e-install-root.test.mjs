// The browser suites' install root (frontend test harness design, D-16, T-1.9): apps/web/e2e alone
// depends on the private library, so a clone without access to it still installs, lints,
// type-checks and runs Vitest, and its e2e run says why it cannot run, never a module-not-found.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const web = join(root, "apps", "web");
const e2e = join(web, "e2e");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");

test("should type-check apps/web with no file under apps/web/e2e and no apps/web/playwright.config.ts", () => {
  const listed = spawnSync(process.execPath, [tsc, "-p", web, "--listFilesOnly"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(listed.status, 0, listed.stdout + listed.stderr);
  const files = listed.stdout.split("\n").filter((file) => file.startsWith(web));
  const wrong = files.filter(
    (file) => file.startsWith(`${e2e}/`) || file === join(web, "playwright.config.ts"),
  );
  assert.deepEqual(wrong, [], `apps/web's type-check lists: ${wrong.join(", ")}`);
  const checked = spawnSync(process.execPath, [tsc, "-p", web], { cwd: root, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
});

test("should keep e2e/ out of apps/web's tsconfig include and @playwright/test out of apps/web's package.json", () => {
  const { include } = json(join(web, "tsconfig.json"));
  const named = include.filter((pattern) => pattern.startsWith("e2e"));
  assert.deepEqual(named, [], `apps/web/tsconfig.json includes ${named.join(", ")}`);
  const manifest = json(join(web, "package.json"));
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  assert.equal(deps["@playwright/test"], undefined, "apps/web/package.json names @playwright/test");
});

test("should name the private library in no package.json or package-lock.json outside apps/web/e2e", () => {
  const found = spawnSync(
    "git",
    [
      "grep",
      "-n",
      "frontend-test-harness",
      "--",
      "*package.json",
      "*package-lock.json",
      ":!apps/web/e2e/",
    ],
    { cwd: root, encoding: "utf8" },
  );
  // git grep exits 1 when nothing matches; anything else is a match or a failure to search.
  assert.equal(found.status, 1, `matches outside apps/web/e2e:\n${found.stdout}${found.stderr}`);
  assert.equal(found.stdout, "");
});

test("should run the install check, then tsc -p e2e, then Playwright, in npm run test:e2e, and run it after Vitest in npm test", () => {
  const { scripts } = json(join(web, "package.json"));
  const steps = scripts["test:e2e"].split("&&").map((step) => step.trim());
  assert.equal(steps[0], "node e2e/check-install.mjs");
  assert.equal(steps[1], "tsc -p e2e");
  assert.match(steps.at(-1), /playwright test -c frontend-harness\.config\.ts$/);
  assert.equal(scripts.test, "vitest run && npm run test:e2e");
  assert.match(scripts["e2e:install"], /^node e2e\/check-install\.mjs --install && /);
});

test("should exit non-zero naming the library repo, the credential route and npm run e2e:install when the e2e install is missing", () => {
  const scratch = mkdtempSync(join(tmpdir(), "beads-ui-e2e-root-"));
  try {
    copyFileSync(join(e2e, "check-install.mjs"), join(scratch, "check-install.mjs"));
    const checked = spawnSync(process.execPath, [join(scratch, "check-install.mjs")], {
      encoding: "utf8",
    });
    assert.notEqual(checked.status, 0);
    const said = checked.stdout + checked.stderr;
    assert.match(said, /https:\/\/github\.com\/sergeiwallace\/frontend-test-harness/);
    assert.match(said, /credential helper for https:\/\/github\.com\/sergeiwallace\//);
    assert.match(said, /npm run e2e:install/);
    assert.doesNotMatch(said, /ERR_MODULE_NOT_FOUND|Cannot find (module|package)/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("should fail npm run test:e2e at the type-check, before any browser starts, when a spec under e2e has a type error", () => {
  const seeded = join(e2e, "zz-seeded-type-error.spec.ts");
  writeFileSync(
    seeded,
    'export const seeded: number = "a type error the e2e type-check must catch";\n',
  );
  try {
    const ran = spawnSync("npm", ["run", "test:e2e"], {
      cwd: web,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    // tsc colours its report; the assertions read the text.
    const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
    const said = (ran.stdout + ran.stderr).replace(ansi, "");
    assert.notEqual(ran.status, 0, said);
    assert.match(said, /zz-seeded-type-error\.spec\.ts.*error TS2322/s);
    assert.doesNotMatch(said, /Running \d+ tests? using/);
  } finally {
    rmSync(seeded, { force: true });
  }
});
