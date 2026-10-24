import { CONFIG_FILE_NAME, parseToml } from "./config.ts";
import type { Result } from "./model.ts";
import type { BandStore } from "./views/band.ts";
import { storeName } from "./views/text.ts";

/**
 * The `beads-ui.toml` table that maps a directory's name to the directory of the repository whose
 * store a session there reads (D-24): `bms-semantic-knowledge-graph = "~/projects/sw-bms-workspace"`.
 */
export const DIRECTORY_STORES_TABLE = "directory_stores";

/** Where a session's store came from, in the order D-24 tries them. */
export type StoreSource = "mapping" | "directory" | "prefix";

export type StoreResolution =
  | {
      ok: true;
      /** The directory bd runs in. */
      path: string;
      /** The store's prefix, when the inventory or the session name gives one. */
      prefix?: string;
      via: StoreSource;
    }
  | {
      ok: false;
      /** One line for each place the resolution looked, and what it found there. */
      tried: string[];
      /** How to point the session at its store. */
      fix: string[];
    };

/** What the resolution reads: each fact is gathered by the caller, so this stays pure. */
export interface StoreFacts {
  cwd: string;
  /** The config file the mapping was read from, if any, and every file looked for. */
  config: { path: string | undefined; text: string | undefined; checked: readonly string[] };
  /** The file a fix should go in: the user's own config file. */
  fixFile: string;
  home: string | undefined;
  /** Whether bd finds a store in `cwd` (`bd where`); undefined when bd did not say. */
  cwdHasStore: boolean | undefined;
  /** The prefix bd names for the store in `cwd`: a linked worktree shares its main tree's. */
  cwdPrefix?: string | undefined;
  session: string | undefined;
  inventory: Result<BandStore[], string>;
  inventoryPath: string | undefined;
}

/**
 * The store prefix a fleet session name implies: the name less its `-<host>-<N>` or
 * `-<host>-firstmate-<N>` tail, upper-cased, hyphens turned to underscores. `kg-ec2-3` gives
 * `KG`, `aih-ec2-firstmate-1` gives `AIH`, `ai-cli-ec2-1` gives `AI_CLI`.
 */
export function sessionPrefix(session: string): string | undefined {
  const base =
    /^(.+)-[^-]+-firstmate-\d+$/.exec(session)?.[1] ?? /^(.+)-[^-]+-\d+$/.exec(session)?.[1];
  return base === undefined ? undefined : base.toUpperCase().replace(/-/g, "_");
}

/** What `bd where --json` said of a directory: whether it has a store, and the store's prefix. */
export interface BdWhere {
  hasStore: boolean;
  /** The database's prefix, its identity on the shared server; an older bd names none. */
  prefix?: string;
}

/**
 * What `bd where --json` found: a store on exit 0 with a `path`, with its `prefix` when bd names
 * one; no store on its `no_beads_directory` answer; undefined for anything else (a timeout,
 * another error).
 */
export function parseBdWhere(exitCode: number | null, stdout: string): BdWhere | undefined {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!isTable(json)) return undefined;
  if (exitCode === 0 && typeof json.path === "string" && json.path !== "") {
    return typeof json.prefix === "string" && json.prefix !== ""
      ? { hasStore: true, prefix: json.prefix }
      : { hasStore: true };
  }
  if (json.error === "no_beads_directory") return { hasStore: false };
  return undefined;
}

const isTable = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const trimSlash = (path: string) => path.replace(/\/+$/, "") || "/";

/** The names of `cwd` and each directory above it, nearest first. */
function directoryNames(cwd: string): string[] {
  return trimSlash(cwd)
    .split("/")
    .filter((part) => part !== "")
    .reverse();
}

/**
 * The `[directory_stores]` entries of a config file: each value a store directory, `~/` taken
 * from `home`. A value that is not an absolute path is a problem line, never a guess.
 */
export function directoryStores(
  text: string | undefined,
  home: string | undefined,
): { stores: Record<string, string>; problems: string[] } {
  const stores: Record<string, string> = {};
  const problems: string[] = [];
  if (text === undefined) return { stores, problems };
  const parsed = parseToml(text);
  if (!parsed.ok) return { stores, problems };
  const table = parsed.value[DIRECTORY_STORES_TABLE];
  if (table === undefined) return { stores, problems };
  if (!isTable(table)) {
    problems.push(`${DIRECTORY_STORES_TABLE} must be a table of directory names`);
    return { stores, problems };
  }
  for (const [name, value] of Object.entries(table)) {
    const path =
      typeof value !== "string"
        ? undefined
        : value.startsWith("~/") && home !== undefined && home !== ""
          ? `${trimSlash(home)}/${value.slice(2)}`
          : value;
    if (path === undefined || !path.startsWith("/")) {
      problems.push(
        `${DIRECTORY_STORES_TABLE}.${name} must be an absolute path or start with ~/; ignored`,
      );
    } else {
      stores[name] = trimSlash(path);
    }
  }
  return { stores, problems };
}

const prefixOf = (inventory: Result<BandStore[], string>, path: string): string | undefined =>
  inventory.ok
    ? inventory.value.find((store) => trimSlash(store.path) === trimSlash(path))?.name
    : undefined;

const withPrefix = (prefix: string | undefined) => (prefix === undefined ? {} : { prefix });

/**
 * The store a session reads (D-24): a `[directory_stores]` entry for the session directory's
 * name or a directory above it, then the session directory's own store, then the inventory's
 * store whose prefix the session name implies. When none applies, the lines say what was tried
 * and how to add a mapping.
 */
export function resolveStore(facts: StoreFacts): StoreResolution {
  const { cwd, config, home, cwdHasStore, cwdPrefix, session, inventory, inventoryPath } = facts;
  const { stores } = directoryStores(config.text, home);
  const names = directoryNames(cwd);
  const mapped = names.find((name) => stores[name] !== undefined);
  if (mapped !== undefined) {
    const path = stores[mapped] ?? cwd;
    return { ok: true, path, ...withPrefix(prefixOf(inventory, path)), via: "mapping" };
  }
  if (cwdHasStore === true) {
    const prefix = cwdPrefix ?? prefixOf(inventory, cwd);
    return { ok: true, path: cwd, ...withPrefix(prefix), via: "directory" };
  }
  const prefix = session === undefined ? undefined : sessionPrefix(session);
  const matched =
    prefix !== undefined && inventory.ok
      ? inventory.value.find((store) => store.name === prefix)
      : undefined;
  if (matched !== undefined) {
    return { ok: true, path: matched.path, prefix: matched.name, via: "prefix" };
  }

  const name = names[0] ?? cwd;
  const tried = [
    cwdHasStore === false
      ? `the session's directory ${cwd} has no Beads store (bd where)`
      : `bd where did not say whether ${cwd} has a Beads store`,
    config.path === undefined
      ? `no ${CONFIG_FILE_NAME} found (looked for ${config.checked.join(", ")})`
      : `${config.path} has no [${DIRECTORY_STORES_TABLE}] entry for ${name}`,
    !inventory.ok
      ? `the store inventory: ${inventory.error}`
      : session === undefined
        ? `the store inventory ${inventoryPath ?? ""}: the session has no name to take a store prefix from`
        : prefix === undefined
          ? `the store inventory ${inventoryPath ?? ""}: the session name ${session} gives no store prefix`
          : `the store inventory ${inventoryPath ?? ""} has no store with the prefix ${prefix} (from the session name ${session})`,
  ];
  const fix = [
    `To read a store, add this to ${facts.fixFile}; the pane reads it on its next refresh:`,
    `[${DIRECTORY_STORES_TABLE}]`,
    `${name} = "<the directory of the repository whose store this session uses>"`,
  ];
  return { ok: false, tried, fix };
}

/** How the pane's header names a resolved store: `KG (sw-bms-workspace)`, or the directory alone. */
export function storeLabel(resolution: StoreResolution): string {
  if (!resolution.ok) return "no store";
  const name = storeName(resolution.path);
  return resolution.prefix === undefined ? name : `${resolution.prefix} (${name})`;
}
