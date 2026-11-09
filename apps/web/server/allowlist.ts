import { execFile } from "node:child_process";
import { basename, dirname } from "node:path";
import { promisify } from "node:util";
import { parseToml, storeName, type TomlTable, type TomlValue } from "@beads-ui/core";
import type { BdClient } from "@sergeiwallace/beads-ui-bd-node";
import { type ConfigEnv, readUserConfig } from "./config.ts";

const exec = promisify(execFile);

/** The `beads-ui.toml` table of the per-host repository allowlist (D-18). */
export const HOSTS_TABLE = "hosts";

/**
 * The repositories a host may show, read at call time from the user's `beads-ui.toml` alone, so a
 * repository's own file can never list itself. Unreadable is never an empty list: it is a reason.
 */
export type Allowlist =
  | { ok: true; repos: ReadonlySet<string>; source: string }
  | { ok: false; reason: string };

const isTable = (value: TomlValue | undefined): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * This host's allowlist, `[hosts] allow_repos`; with `host`, another host's published copy,
 * `[hosts.<host>] allow_repos`. Any failure to read it is an unreadable allowlist, never a guess.
 */
export async function readAllowlist(env: ConfigEnv, host?: string): Promise<Allowlist> {
  const where = host === undefined ? "[hosts] allow_repos" : `[hosts.${host}] allow_repos`;
  const file = await readUserConfig(env);
  if (file.kind === "none") {
    return {
      ok: false,
      reason: `${where} cannot be read: neither XDG_CONFIG_HOME nor HOME is set`,
    };
  }
  if (file.kind === "error") {
    return { ok: false, reason: `${where} cannot be read: ${file.path}: ${file.message}` };
  }
  const parsed = parseToml(file.text);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: `${where} cannot be read: ${file.path} line ${parsed.error.line}: ${parsed.error.message}`,
    };
  }
  const hosts = parsed.value[HOSTS_TABLE];
  const table = host === undefined ? hosts : isTable(hosts) ? hosts[host] : undefined;
  const list = isTable(table) ? table.allow_repos : undefined;
  if (list === undefined) return { ok: false, reason: `${where} is missing from ${file.path}` };
  if (!Array.isArray(list) || list.some((repo) => repo.trim() === "")) {
    return { ok: false, reason: `${where} in ${file.path} must be a list of repository names` };
  }
  return { ok: true, repos: new Set(list), source: file.path };
}

/** Whether `repo` is on `allowlist`; an unreadable allowlist allows nothing. */
export const isAllowed = (allowlist: Allowlist, repo: string | undefined): boolean =>
  allowlist.ok && repo !== undefined && allowlist.repos.has(repo);

/**
 * The name the allowlist knows a repository by: its main working tree's directory name, so a
 * linked worktree counts as its repository; the directory's own name outside git.
 */
export async function repositoryOf(repoRoot: string): Promise<string> {
  try {
    const { stdout } = await exec(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: repoRoot, encoding: "utf8", timeout: 5_000 },
    );
    const common = stdout.trim();
    if (common === "") return storeName(repoRoot);
    return basename(common) === ".git" ? basename(dirname(common)) : storeName(common);
  } catch {
    return storeName(repoRoot);
  }
}

/**
 * Rows dropped for an unlisted repository, counted per source (the work queue, a store), so the
 * health line says how many are hidden and never which repositories they came from; or that the
 * allowlist could not be read at all, when no earlier count stands.
 */
export class AllowlistHealth {
  readonly #hidden = new Map<string, number>();
  #unreadable: string | undefined;

  /** The rows `source` dropped under a readable allowlist. */
  record(source: string, hidden: number): void {
    this.#unreadable = undefined;
    if (hidden === 0) this.#hidden.delete(source);
    else this.#hidden.set(source, hidden);
  }

  /** The allowlist could not be read: nothing is shown, so no earlier count stands. */
  unreadable(reason: string): void {
    this.#hidden.clear();
    this.#unreadable = reason;
  }

  get hidden(): number {
    let total = 0;
    for (const count of this.#hidden.values()) total += count;
    return total;
  }

  /** The health line, or undefined while nothing is hidden. */
  line(): string | undefined {
    const hidden = this.hidden;
    if (hidden === 0) return undefined;
    const rows = hidden === 1 ? "1 row" : `${hidden} rows`;
    return `${rows} from repositories not on this host's allowlist ${hidden === 1 ? "is" : "are"} hidden`;
  }

  /** Every health line: the unreadable allowlist alone, else the hidden count. */
  lines(): string[] {
    if (this.#unreadable !== undefined) {
      return [`the allowlist is unreadable, so no store or row is shown: ${this.#unreadable}`];
    }
    const line = this.line();
    return line === undefined ? [] : [line];
  }
}

/**
 * The rows whose repository is on the allowlist, every other row dropped and counted under
 * `source`. A row with no repository is dropped too; an unreadable allowlist keeps nothing and
 * says so in the health line in place of any earlier count.
 */
export function filterAllowed<T>(
  rows: readonly T[],
  repoOf: (row: T) => string | undefined,
  allowlist: Allowlist,
  health: AllowlistHealth,
  source: string,
): T[] {
  if (!allowlist.ok) {
    health.unreadable(allowlist.reason);
    return [];
  }
  const kept = rows.filter((row) => isAllowed(allowlist, repoOf(row)));
  health.record(source, rows.length - kept.length);
  return kept;
}

/** A store read refused because the store's repository is not open on this host. */
export class StoreClosed extends Error {}

/**
 * Why the served repository's store is closed right now, or undefined while it is open: the
 * allowlist is read again on every call, so an edit to it opens or closes the store at once.
 */
export async function storeClosedReason(
  env: ConfigEnv,
  repository: string,
): Promise<string | undefined> {
  const allowlist = await readAllowlist(env);
  if (!allowlist.ok) return `no store is open: ${allowlist.reason}`;
  if (!allowlist.repos.has(repository)) {
    return `no store is open: the repository this server was started in is not on [hosts] allow_repos in ${allowlist.source}`;
  }
  return undefined;
}

/**
 * A bd client that runs no bd command while `closed` gives a reason: each call checks first and
 * rejects with StoreClosed, so no route can read or write a store this host may not show.
 */
export function gatedBd(bd: BdClient, closed: () => Promise<string | undefined>): BdClient {
  return new Proxy(bd, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        const reason = await closed();
        if (reason !== undefined) throw new StoreClosed(reason);
        return value.apply(target, args);
      };
    },
  });
}
