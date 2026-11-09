import { parseToml, type TomlTable, type TomlValue } from "@beads-ui/core";
import type { BdClient } from "@sergeiwallace/beads-ui-bd-node";
import { type ConfigEnv, readUserConfig } from "./config.ts";

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

/** The health line for an `allow_repos` entry that names more than one repository on the host. */
export const ambiguousLine = (entry: string): string =>
  `[hosts] allow_repos entry ${JSON.stringify(entry)} names more than one repository on this host, so none of them is opened through it; name it as owner/name or by its path`;

const counted = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

/**
 * What the allowlist hid, for the health line: rows dropped per source (the work queue), the
 * host's stores left closed, entries naming more than one repository, or that the allowlist could
 * not be read at all. It counts and never names a hidden repository.
 */
export class AllowlistHealth {
  readonly #hidden = new Map<string, number>();
  #stores = 0;
  #ambiguous: readonly string[] = [];
  #unreadable: string | undefined;

  /** The rows `source` dropped under a readable allowlist. */
  record(source: string, hidden: number): void {
    this.#unreadable = undefined;
    if (hidden === 0) this.#hidden.delete(source);
    else this.#hidden.set(source, hidden);
  }

  /** The host's stores left closed, and the entries naming more than one, under a readable allowlist. */
  recordStores(hidden: number, ambiguous: readonly string[]): void {
    this.#unreadable = undefined;
    this.#stores = hidden;
    this.#ambiguous = ambiguous;
  }

  /** The allowlist could not be read: nothing is shown, so no earlier count stands. */
  unreadable(reason: string): void {
    this.#hidden.clear();
    this.#stores = 0;
    this.#ambiguous = [];
    this.#unreadable = reason;
  }

  get hidden(): number {
    let total = this.#stores;
    for (const count of this.#hidden.values()) total += count;
    return total;
  }

  /** The hidden-count line, or undefined while nothing is hidden. */
  line(): string | undefined {
    let rows = 0;
    for (const count of this.#hidden.values()) rows += count;
    const parts = [
      ...(this.#stores === 0 ? [] : [counted(this.#stores, "store", "stores")]),
      ...(rows === 0 ? [] : [counted(rows, "row", "rows")]),
    ];
    if (parts.length === 0) return undefined;
    const one = parts.length === 1 && this.#stores + rows === 1;
    return `${parts.join(" and ")} from repositories not on this host's allowlist ${one ? "is" : "are"} hidden`;
  }

  /** Every health line: the unreadable allowlist alone, else the hidden count and each ambiguous entry. */
  lines(): string[] {
    if (this.#unreadable !== undefined) {
      return [`the allowlist is unreadable, so no store or row is shown: ${this.#unreadable}`];
    }
    const line = this.line();
    return [...(line === undefined ? [] : [line]), ...this.#ambiguous.map(ambiguousLine)];
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

/** A store read refused because no store, or not the one asked for, is open on this host. */
export class StoreClosed extends Error {}

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
