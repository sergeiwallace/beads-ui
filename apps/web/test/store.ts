import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { recordCreatedStore } from "./run-stores.ts";

const exec = promisify(execFile);

export const STORE_IMAGE_VAR = "BEADS_UI_TEST_STORE_IMAGE";
const IMAGE_PREFIX = "web";

async function tree(root: string): Promise<string> {
  const entries: [string, { dir: boolean; mode: number; size: number; mtimeMs: number }][] = [];
  for (const found of await readdir(root, { recursive: true, withFileTypes: true })) {
    const path = join(found.parentPath, found.name);
    const info = await lstat(path);
    const dir = info.isDirectory();
    entries.push([
      relative(root, path),
      { dir, mode: info.mode, size: dir ? 0 : info.size, mtimeMs: dir ? 0 : info.mtimeMs },
    ]);
  }
  return JSON.stringify(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

const bdIn = (dir: string, ...args: string[]) =>
  exec("bd", args, { cwd: dir, encoding: "utf8", timeout: 60_000 });

const bdInit = (dir: string, prefix: string) =>
  bdIn(dir, "init", "--non-interactive", "--skip-hooks", "-p", prefix);

async function storeImage(root: string): Promise<{ store: string; tree: string }> {
  const image = join(root, "image");
  const made = () => readFile(join(image, "tree.json"), "utf8");
  const ready = await made().catch(() => undefined);
  if (ready !== undefined) return { store: join(image, "store"), tree: ready };
  const build = await mkdtemp(join(root, "build-"));
  await mkdir(join(build, "store"));
  await bdInit(join(build, "store"), IMAGE_PREFIX);
  await writeFile(join(build, "tree.json"), await tree(join(build, "store")));
  await rename(build, image).catch(() => rm(build, { recursive: true, force: true }));
  return { store: join(image, "store"), tree: await made() };
}

const holds = async (dir: string, recorded: string) =>
  (await tree(dir).catch(() => undefined)) === recorded;

async function initStore(dir: string, prefix: string): Promise<void> {
  const root = process.env[STORE_IMAGE_VAR];
  const image = root === undefined || root === "" ? undefined : await storeImage(root);
  if (image !== undefined && (await holds(image.store, image.tree))) {
    await exec("cp", ["-a", `${image.store}/.`, dir]);
    if (await holds(dir, image.tree)) {
      if (prefix !== IMAGE_PREFIX) await bdIn(dir, "rename-prefix", `${prefix}-`);
      return;
    }
    for (const name of await readdir(dir)) await rm(join(dir, name), { recursive: true });
  }
  await bdInit(dir, prefix);
}

/** A real Beads store in its own temporary directory, made with `bd init` (embedded Dolt). */
export interface TestStore {
  dir: string;
  /** Runs bd in the store and returns its stdout. */
  bd(...args: string[]): Promise<string>;
  /** Creates an issue and returns its id. */
  create(
    title: string,
    options?: { priority?: number; status?: string; rank?: string },
  ): Promise<string>;
  show(
    id: string,
  ): Promise<{ status: string; priority: number; metadata?: Record<string, unknown> }>;
  remove(): Promise<void>;
}

export async function createStore(prefix = "web"): Promise<TestStore> {
  const dir = await mkdtemp(join(tmpdir(), "beads-ui-web-store-"));
  const bd = async (...args: string[]) => (await bdIn(dir, ...args)).stdout;
  await initStore(dir, prefix);
  await recordCreatedStore(dir);
  return {
    dir,
    bd,
    async create(title, options = {}) {
      const created = JSON.parse(
        await bd("create", title, "-p", String(options.priority ?? 2), "--json"),
      ) as { id: string };
      if (options.status !== undefined) await bd("update", created.id, "--status", options.status);
      if (options.rank !== undefined) {
        await bd("update", created.id, `--metadata=${JSON.stringify({ rank: options.rank })}`);
      }
      return created.id;
    },
    async show(id) {
      const [issue] = JSON.parse(await bd("show", id, "--json")) as [
        { status: string; priority: number; metadata?: Record<string, unknown> },
      ];
      return issue;
    },
    remove: () => rm(dir, { recursive: true }),
  };
}

export interface WrappedBd {
  /** PATH with the wrapper first. */
  env: NodeJS.ProcessEnv;
  /** Written by the wrapper when it reaches its special case, for a test to wait on. */
  marker: string;
  remove(): Promise<void>;
}

async function wrappedBd(subcommands: readonly string[], special: string): Promise<WrappedBd> {
  const real = (await exec("sh", ["-c", "command -v bd"], { encoding: "utf8" })).stdout.trim();
  const dir = await mkdtemp(join(tmpdir(), "beads-ui-web-wrapped-bd-"));
  const marker = join(dir, "reached");
  const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;
  const script = [
    "#!/bin/sh",
    `REAL=${quote(real)}`,
    `case "$1" in`,
    `  ${subcommands.join("|")}) touch ${quote(marker)}; ${special} ;;`,
    "esac",
    'exec "$REAL" "$@"',
    "",
  ].join("\n");
  await writeFile(join(dir, "bd"), script);
  await chmod(join(dir, "bd"), 0o755);
  return {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
    marker,
    remove: () => rm(dir, { recursive: true }),
  };
}

/**
 * A `bd` that fails the named subcommands with a lock error and hands every other call to the
 * real bd, so a route's read failure is bd's own exit status and text.
 */
export const failingBd = (subcommands: readonly string[]): Promise<WrappedBd> =>
  wrappedBd(subcommands, 'echo "Error: database is locked" >&2; exit 1');

/** A `bd` that waits `seconds` before running the named subcommands, then runs the real bd. */
export const slowBd = (subcommands: readonly string[], seconds: number): Promise<WrappedBd> =>
  wrappedBd(subcommands, `sleep ${seconds}`);

export interface LockedBd extends WrappedBd {
  /** One line per call of a named subcommand, written once it holds the store and starts. */
  calls: string;
}

/**
 * A `bd` that runs the named subcommands one at a time, as an embedded store does, each `seconds`
 * long: a call takes a lock on one file before it sleeps and runs the real bd, so calls started
 * side by side wait inside bd's own process. Every other subcommand runs at once.
 */
export async function lockedBd(subcommands: readonly string[], seconds: number): Promise<LockedBd> {
  const dir = await mkdtemp(join(tmpdir(), "beads-ui-web-locked-bd-"));
  const lock = join(dir, "store.lock");
  const calls = join(dir, "calls");
  const wrapped = await wrappedBd(
    subcommands,
    `exec flock '${lock}' sh -c 'echo "$1" >> "${calls}"; sleep ${seconds}; exec "$0" "$@"' "$REAL" "$@"`,
  );
  return {
    ...wrapped,
    calls,
    remove: async () => {
      await wrapped.remove();
      await rm(dir, { recursive: true });
    },
  };
}
