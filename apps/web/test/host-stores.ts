import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { STORE_INVENTORY_FILE } from "@beads-ui/core";

const exec = promisify(execFile);

/** Quotes `text` for a POSIX sh script. */
export const shQuote = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

export interface ScriptedBd {
  /** PATH with the scripted bd first. */
  env: NodeJS.ProcessEnv;
  remove(): Promise<void>;
}

/**
 * A `bd` that runs `script` (POSIX sh, with "$REAL" the real bd and "$DIR" the directory bd runs
 * in, symlinks resolved) before handing the call to the real bd; `script` may exit instead.
 */
export async function scriptedBd(script: string): Promise<ScriptedBd> {
  const real = (await exec("sh", ["-c", "command -v bd"], { encoding: "utf8" })).stdout.trim();
  const dir = await mkdtemp(join(tmpdir(), "beads-ui-web-scripted-bd-"));
  const lines = [
    "#!/bin/sh",
    `REAL=${shQuote(real)}`,
    'DIR="$(pwd -P)"',
    script,
    'exec "$REAL" "$@"',
  ];
  await writeFile(join(dir, "bd"), `${lines.join("\n")}\n`);
  await chmod(join(dir, "bd"), 0o755);
  return {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
    remove: () => rm(dir, { recursive: true }),
  };
}

/** A real Beads store at a chosen directory, in its own git repository unless `git` is false. */
export interface RepoStore {
  dir: string;
  bd(...args: string[]): Promise<string>;
  /** Creates an issue, with the explicit id `id` when given, and returns its id. */
  create(
    title: string,
    options?: { id?: string; priority?: number; status?: string; rank?: string },
  ): Promise<string>;
  show(id: string): Promise<{
    title: string;
    status: string;
    priority: number;
    metadata?: Record<string, unknown>;
  }>;
}

/**
 * Makes `dir` a Beads store. The origin remote, when given, is added after `bd init`, which would
 * otherwise try to reach it; use a `.invalid` host so nothing can.
 */
export async function repoStore(
  dir: string,
  options: { prefix: string; remote?: string; git?: boolean },
): Promise<RepoStore> {
  await mkdir(dir, { recursive: true });
  const run = async (command: string, args: string[]) =>
    (await exec(command, args, { cwd: dir, encoding: "utf8", timeout: 120_000 })).stdout;
  if (options.git !== false) await run("git", ["init", "-q"]);
  await run("bd", ["init", "--non-interactive", "--skip-hooks", "-p", options.prefix]);
  if (options.remote !== undefined) await run("git", ["remote", "add", "origin", options.remote]);
  const bd = (...args: string[]) => run("bd", args);
  return {
    dir,
    bd,
    async create(title, created = {}) {
      const args = ["create", title, "-p", String(created.priority ?? 2), "--json"];
      if (created.id !== undefined) args.push("--id", created.id);
      const { id } = JSON.parse(await bd(...args)) as { id: string };
      if (created.status !== undefined) await bd("update", id, "--status", created.status);
      if (created.rank !== undefined) {
        await bd("update", id, `--metadata=${JSON.stringify({ rank: created.rank })}`);
      }
      return id;
    },
    async show(id) {
      const [issue] = JSON.parse(await bd("show", id, "--json")) as [
        { title: string; status: string; priority: number; metadata?: Record<string, unknown> },
      ];
      return issue;
    },
  };
}

/** A root to make stores in, and a private home whose store inventory lists the ones a test names. */
export interface StoreHost {
  /** Symlinks resolved, so it reads as bd's and git's own paths do. */
  root: string;
  home: string;
  /** Writes the inventory a publish sweep writes: each store under its database name. */
  inventory(stores: readonly { prefix: string; dir: string }[]): Promise<void>;
  remove(): Promise<void>;
}

export async function storeHost(): Promise<StoreHost> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "beads-ui-web-registry-")));
  const home = join(root, "home");
  await mkdir(home);
  return {
    root,
    home,
    async inventory(stores) {
      const file = join(home, STORE_INVENTORY_FILE);
      await mkdir(dirname(file), { recursive: true });
      const listed = Object.fromEntries(stores.map((store) => [store.prefix, { repo: store.dir }]));
      await writeFile(file, JSON.stringify({ schema: 1, stores: listed, skipped: [] }));
    },
    remove: () => rm(root, { recursive: true }),
  };
}
