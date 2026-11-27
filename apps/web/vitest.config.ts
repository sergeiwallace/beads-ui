import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { COMMIT_SCOPE, testJobs, testScope } from "../../scripts/test-jobs.mjs";

const TEST_MS = 300_000;
const STORE_SETUP_MS = 300_000;

const coreSrc = fileURLToPath(new URL("../../plugins/beads-ui/core/src/", import.meta.url));
const testDir = fileURLToPath(new URL("test/", import.meta.url));
const SERVER_IMPORT = /from "(\.\.\/server\/server|\.\/store|\.\/host-stores)\.ts"/;

const serverSuites = () =>
  readdirSync(testDir, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".test.ts"))
    .filter((path) => SERVER_IMPORT.test(readFileSync(join(testDir, path), "utf8")))
    .map((path) => `test/${path}`);

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@beads-ui\/core$/, replacement: `${coreSrc}index.ts` },
      { find: /^@beads-ui\/core\/(.*)$/, replacement: `${coreSrc}$1` },
    ],
  },
  test: {
    maxWorkers: testJobs(),
    fsModuleCachePath: fileURLToPath(new URL("node_modules/.vitest-cache/", import.meta.url)),
    include: ["test/**/*.test.ts"],
    exclude:
      testScope() === COMMIT_SCOPE
        ? [...configDefaults.exclude, ...serverSuites()]
        : configDefaults.exclude,
    globalSetup: ["test/global-setup.ts"],
    testTimeout: TEST_MS,
    hookTimeout: STORE_SETUP_MS,
  },
});
