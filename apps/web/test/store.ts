import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

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
  const bd = async (...args: string[]) =>
    (await exec("bd", args, { cwd: dir, encoding: "utf8", timeout: 60_000 })).stdout;
  await bd("init", "--non-interactive", "--skip-hooks", "-p", prefix);
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

// A `bd` that runs `special` for the subcommands it names and hands every other call to the
// real bd; `special` may run the real bd too, through "$REAL".
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
