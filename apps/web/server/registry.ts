import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  type BandStore,
  bandStores,
  parseStoreInventory,
  STORE_INVENTORY_FILE,
  storeName,
} from "@beads-ui/core";
import { type BdClient, createBdClient } from "@sergeiwallace/beads-ui-bd-node";
import {
  type AllowlistHealth,
  ambiguousLine,
  gatedBd,
  readAllowlist,
  StoreClosed,
} from "./allowlist.ts";
import { DEFAULT_QUEUE_WAIT_SECONDS, queuedBd } from "./bd-queue.ts";
import type { ConfigEnv } from "./config.ts";

const exec = promisify(execFile);

/**
 * What a store's repository is, by something two different repositories cannot share: its origin
 * remote, normalized, or where it has none the absolute directory of the repository itself.
 */
export interface RepositoryIdentity {
  /** `remote:<host>/<path>` or `path:<directory>`. */
  key: string;
  /** The last segment of the remote's path, or the repository directory's name. */
  name: string;
  /** The origin remote as host then path segments, the host lower-cased and `.git` dropped. */
  remote?: readonly string[];
  /** The main working tree (a linked worktree counts as its repository), else the store's own directory. */
  dir: string;
}

/**
 * The origin remote URL as host then path segments: `git@host:owner/name.git` and
 * `https://user@host/owner/name` both give `[host, owner, name]`. Credentials are dropped. A local
 * path or `file://` remote gives undefined, and the repository is known by its directory instead.
 */
export function remoteSegments(url: string): string[] | undefined {
  const text = url.trim();
  let host: string;
  let path: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let parsed: URL;
    try {
      parsed = new URL(text);
    } catch {
      return undefined;
    }
    if (parsed.protocol === "file:" || parsed.hostname === "") return undefined;
    host = parsed.hostname.toLowerCase();
    try {
      path = decodeURIComponent(parsed.pathname);
    } catch {
      return undefined;
    }
  } else {
    const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(text);
    if (scp?.[1] === undefined || scp[2] === undefined) return undefined;
    host = scp[1].toLowerCase();
    path = scp[2];
  }
  const parts = path
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .split("/")
    .filter((part) => part !== "");
  return parts.length === 0 ? undefined : [host, ...parts];
}

async function git(cwd: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout } = await exec("git", [...args], { cwd, encoding: "utf8", timeout: 5_000 });
    const out = stdout.trim();
    return out === "" ? undefined : out;
  } catch {
    return undefined;
  }
}

const realOrSelf = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch {
    return path.replace(/\/+$/, "") || "/";
  }
};

/** The identity of the repository whose store is at `path`. */
export async function repositoryIdentity(path: string): Promise<RepositoryIdentity> {
  const common = await git(path, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const dir =
    common === undefined
      ? await realOrSelf(path)
      : basename(common) === ".git"
        ? dirname(common)
        : common;
  const url =
    common === undefined ? undefined : await git(path, ["config", "--get", "remote.origin.url"]);
  const remote = url === undefined ? undefined : remoteSegments(url);
  if (remote !== undefined) {
    return { key: `remote:${remote.join("/")}`, name: remote.at(-1) ?? "", remote, dir };
  }
  return { key: `path:${dir}`, name: storeName(dir).replace(/\.git$/, ""), dir };
}

/**
 * Whether an `allow_repos` entry names this repository: an absolute or `~/` path names its
 * directory; `name` its repository name; `owner/name` (or `host/owner/name`) the trailing
 * segments of its origin remote, so a repository with no remote never matches an owner.
 */
export function entryMatches(
  entry: string,
  identity: RepositoryIdentity,
  paths: { home: string | undefined; real: ReadonlyMap<string, string> },
): boolean {
  const trimmed = entry.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("/") || trimmed.startsWith("~/")) {
    const path = trimmed.startsWith("~/")
      ? paths.home === undefined || paths.home === ""
        ? undefined
        : join(paths.home, trimmed.slice(2))
      : trimmed;
    if (path === undefined) return false;
    return path === identity.dir || paths.real.get(path) === identity.dir;
  }
  const parts = trimmed.split("/").filter((part) => part !== "");
  if (parts.length === 1) return parts[0] === identity.name;
  const remote = identity.remote;
  if (remote === undefined || parts.length > remote.length) return false;
  const tail = remote.slice(remote.length - parts.length);
  return tail.every((segment, i) => segment === parts[i]);
}

/** A store the server may read and write right now, addressed by the allowlist entry that opened it. */
export interface OpenStore {
  /** How the API and the page name the store: the `allow_repos` entry that matched it. */
  repository: string;
  /** The directory bd runs in. */
  path: string;
  bd: BdClient;
}

/** What one reading of the allowlist and the host's stores found. */
export interface RegistryReading {
  open: { repository: string; path: string }[];
  /** Why no store is open, while none is. */
  closed?: string;
  /** The open store the directory the server started in reads, when that store is open. */
  startedIn?: string;
}

export interface StoreRegistry {
  /** Every store open now, read again on every call; rejects with StoreClosed while none is. */
  open(): Promise<OpenStore[]>;
  /** The allowlist and the host's stores, read now, with no bd command run. */
  read(): Promise<RegistryReading>;
  /** The bd client of an open store's directory: it runs nothing once that store closes. */
  client(path: string): BdClient;
}

export interface RegistryOptions {
  /** The directory the server started in: its store is one of the host's stores. */
  repoRoot: string;
  configEnv: ConfigEnv;
  bdEnv?: NodeJS.ProcessEnv;
  health: AllowlistHealth;
  /** How long a bd call may wait for its store's earlier calls, read at each call (bd-queue.ts). */
  queueWaitMs?: () => Promise<number>;
}

async function readInventory(home: string | undefined) {
  if (home === undefined || home === "") {
    return { ok: false as const, error: "HOME is not set, so there is no store inventory" };
  }
  let text: string;
  try {
    text = await readFile(join(home, STORE_INVENTORY_FILE), "utf8");
  } catch (error) {
    return {
      ok: false as const,
      error: `the store inventory: ${(error as NodeJS.ErrnoException).code}`,
    };
  }
  return parseStoreInventory(text);
}

/**
 * The host's stores (the store inventory every surface reads, plus the store of the directory the
 * server started in) opened through the allowlist (D-18): a store opens when an `allow_repos`
 * entry names its repository and no other store's; an entry naming two is ambiguous and opens
 * neither through it. Read again on every call, so an edit to the allowlist applies at once.
 */
export function createStoreRegistry(options: RegistryOptions): StoreRegistry {
  const identities = new Map<string, Promise<RepositoryIdentity>>();
  const identityOf = (path: string) => {
    let identity = identities.get(path);
    if (identity === undefined) {
      identity = repositoryIdentity(path);
      identities.set(path, identity);
    }
    return identity;
  };
  const clients = new Map<string, BdClient>();
  const home = options.configEnv.home;

  async function read(): Promise<RegistryReading> {
    const allowlist = await readAllowlist(options.configEnv);
    if (!allowlist.ok) {
      options.health.unreadable(allowlist.reason);
      return { open: [], closed: `no store is open: ${allowlist.reason}` };
    }
    const here: BandStore = {
      name: storeName(options.repoRoot),
      path: options.repoRoot,
      synced: false,
    };
    const candidates = bandStores(here, await readInventory(home));
    const resolved = await Promise.all(candidates.map((store) => identityOf(store.path)));
    const known: { store: BandStore; identity: RepositoryIdentity }[] = [];
    for (const [i, store] of candidates.entries()) {
      const identity = resolved[i];
      if (identity === undefined) continue;
      // One repository reached by two paths (a linked worktree and its main tree) is one store.
      const same = known.find(
        (entry) =>
          entry.identity.key === identity.key &&
          (entry.store.prefix === undefined ||
            store.prefix === undefined ||
            entry.store.prefix === store.prefix),
      );
      if (same === undefined) known.push({ store, identity });
    }
    const real = new Map<string, string>();
    for (const entry of allowlist.repos) {
      const trimmed = entry.trim().replace(/\/+$/, "");
      const path = trimmed.startsWith("~/") && home ? join(home, trimmed.slice(2)) : trimmed;
      if (path.startsWith("/")) real.set(path, await realOrSelf(path));
    }
    const matches = (entry: string, identity: RepositoryIdentity) =>
      entryMatches(entry, identity, { home, real });

    const opened = new Map<number, string>();
    const ambiguous: string[] = [];
    for (const entry of allowlist.repos) {
      const hits = known.flatMap((candidate, i) => (matches(entry, candidate.identity) ? [i] : []));
      if (hits.length > 1) ambiguous.push(entry);
      else if (hits[0] !== undefined && !opened.has(hits[0])) opened.set(hits[0], entry);
    }
    const listed = (identity: RepositoryIdentity) =>
      [...allowlist.repos].some((entry) => matches(entry, identity));
    const unlisted = known.filter((candidate) => !listed(candidate.identity));
    options.health.recordStores(unlisted.length, ambiguous);

    const open = [...opened].map(([i, repository]) => ({
      repository,
      path: known[i]?.store.path ?? "",
    }));
    const hereIdentity = await identityOf(options.repoRoot);
    const startedIndex = known.findIndex(
      (candidate) => candidate.identity.key === hereIdentity.key,
    );
    const startedIn = opened.has(startedIndex) ? known[startedIndex]?.store.path : undefined;
    if (open.length > 0) return { open, ...(startedIn === undefined ? {} : { startedIn }) };
    const where = `[hosts] allow_repos in ${allowlist.source}`;
    const closed = !listed(hereIdentity)
      ? `no store is open: the repository this server was started in is not on ${where}`
      : ambiguous.length > 0
        ? `no store is open: ${ambiguousLine(ambiguous[0] ?? "")}`
        : `no store is open: no repository on this host is on ${where}`;
    return { open, closed };
  }

  function client(path: string): BdClient {
    let bd = clients.get(path);
    if (bd === undefined) {
      bd = gatedBd(
        queuedBd(
          createBdClient({
            cwd: path,
            ...(options.bdEnv === undefined ? {} : { env: options.bdEnv }),
          }),
          options.queueWaitMs ?? (async () => DEFAULT_QUEUE_WAIT_SECONDS * 1000),
        ),
        async () => {
          const reading = await read();
          if (reading.open.some((store) => store.path === path)) return undefined;
          return (
            reading.closed ??
            "this store is no longer open: its repository is not on [hosts] allow_repos"
          );
        },
      );
      clients.set(path, bd);
    }
    return bd;
  }

  return {
    read,
    client,
    async open() {
      const reading = await read();
      if (reading.closed !== undefined) throw new StoreClosed(reading.closed);
      return reading.open.map((store) => ({ ...store, bd: client(store.path) }));
    },
  };
}
