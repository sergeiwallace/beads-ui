#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const LIBRARY = "@sergeiwallace/frontend-test-harness";
const REPO = "https://github.com/sergeiwallace/frontend-test-harness";
const host = process.env.AI_HOST || hostname();
const ROUTE = [
  `The frontend test harness library (${REPO}) is a private repository, and the browser suites need it.`,
  `Give this host's git (${host}) a credential that can read it: a credential helper for https://github.com/sergeiwallace/ (git config --global credential.https://github.com/sergeiwallace/.helper '<helper>').`,
  "Then run npm run e2e:install in apps/web.",
].join("\n");

const installed = (name) =>
  existsSync(join(here, "node_modules", ...name.split("/"), "package.json"));

if (process.argv.includes("--install")) {
  const ci = spawnSync("npm", ["ci", "--no-audit", "--no-fund"], {
    cwd: here,
    stdio: ["ignore", "inherit", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    encoding: "utf8",
  });
  if (ci.status !== 0) {
    process.stderr.write(ci.stderr ?? "");
    process.stderr.write(`\nbeads-ui e2e: npm ci in apps/web/e2e failed on ${host}.\n${ROUTE}\n`);
    process.exit(1);
  }
  process.exit(0);
}

const missing = [LIBRARY, "@playwright/test"].filter((name) => !installed(name));
if (missing.length > 0) {
  process.stderr.write(
    `beads-ui e2e: the e2e install is missing (apps/web/e2e/node_modules has no ${missing.join(" and no ")}).\n${ROUTE}\n`,
  );
  process.exit(1);
}
