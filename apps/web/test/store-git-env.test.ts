import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { repoStore } from "./host-stores.ts";
import { createStore, STORE_IMAGE_VAR } from "./store.ts";

const exec = promisify(execFile);
const HOOK_VARS = ["GIT_DIR", "GIT_INDEX_FILE", STORE_IMAGE_VAR] as const;
const saved = Object.fromEntries(HOOK_VARS.map((name) => [name, process.env[name]]));

const cleanEnv = () => {
  const env = { ...process.env };
  for (const name of HOOK_VARS) delete env[name];
  return env;
};
const hostGit = async (...args: string[]) =>
  (await exec("git", ["-C", host, ...args], { env: cleanEnv(), encoding: "utf8" })).stdout.trim();

let host: string;
const made: string[] = [];
let before: { head: string; status: string; metadata: string };

const hostState = async () => ({
  head: await hostGit("rev-parse", "HEAD"),
  status: await hostGit("status", "--porcelain", "--untracked-files=all"),
  metadata: await readFile(join(host, ".beads", "metadata.json"), "utf8"),
});

beforeAll(async () => {
  host = await mkdtemp(join(tmpdir(), "beads-ui-web-git-host-"));
  await exec("git", ["init", "-q", host], { env: cleanEnv() });
  await exec("bd", ["init", "--non-interactive", "--skip-hooks", "-p", "host"], {
    cwd: host,
    env: cleanEnv(),
  });
  await hostGit("add", "-A");
  await hostGit(
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "seed",
  );
  before = await hostState();
});

afterEach(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const dir of made.splice(0)) await rm(dir, { recursive: true, force: true });
});

afterAll(() => rm(host, { recursive: true, force: true }));

describe("a store made while a git hook's repository variables are set", () => {
  it("should make its own store with bd init, and leave the hook's repository untouched", async () => {
    process.env.GIT_DIR = join(host, ".git");
    process.env.GIT_INDEX_FILE = join(host, ".git", "index");
    delete process.env[STORE_IMAGE_VAR];
    const store = await createStore("hooked");
    made.push(store.dir);
    const id = await store.create("Made under a hook");
    expect(id).toMatch(/^hooked-/);
    await access(join(store.dir, ".beads", "metadata.json"));
    expect(await hostState()).toEqual(before);
  });

  it("should make a git repository store in its own directory, and leave the hook's repository untouched", async () => {
    process.env.GIT_DIR = join(host, ".git");
    process.env.GIT_INDEX_FILE = join(host, ".git", "index");
    const dir = await mkdtemp(join(tmpdir(), "beads-ui-web-git-repo-store-"));
    made.push(dir);
    const store = await repoStore(join(dir, "repo"), { prefix: "hookrepo" });
    expect(await store.create("Made under a hook")).toMatch(/^hookrepo-/);
    await access(join(dir, "repo", ".git", "HEAD"));
    expect(await hostState()).toEqual(before);
  });
});
