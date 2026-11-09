// The server's dispatch service (web app design D-14, D-20, T-W0.2, T-W0.3, T-W0.4): the one
// dispatch store the receiver API serves, chosen by `[queue] url`; the signing key `[auth]
// signing_key` names, read at call time; the files this host publishes for receivers and other
// servers (its public signing keys as a trusted-keys map, and its repository allowlist); and the
// sweep that expires a dispatch, tombstoning its body.

import { createPublicKey, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type CreateResult,
  type DispatchKind,
  type DispatchStore,
  type DispatchTarget,
  type DispatchTask,
  parseToml,
  type TomlTable,
  type TomlValue,
} from "@beads-ui/core";
import { type Allowlist, isAllowed } from "./allowlist.ts";
import { AuthRefused, loadAuth } from "./auth.ts";
import { type ConfigEnv, readUserConfig } from "./config.ts";
import { Serial } from "./dispatch-store/common.ts";
import { openLocalDispatchStore } from "./dispatch-store/local.ts";
import { openQueueDispatchStore } from "./dispatch-store/queue.ts";
import {
  bodyDigest,
  formatTimestamp,
  isTimestamp,
  MalformedDispatch,
  type SigningKey,
  signDispatch,
  signingKeySource,
} from "./envelope.ts";
import type { StoreRegistry } from "./registry.ts";

/** This host's public signing keys, in the receivers' trusted-keys map shape (Envelope wire format). */
export const PUBLISHED_KEYS_FILE = "published-dispatch-keys.json";
/** This host's repository allowlist, for the servers that dispatch to it (T-W0.2). */
export const PUBLISHED_ALLOWLIST_FILE = "published-allowlist.json";
/** A key the server stops signing with stays published as valid this long (T-W0.4). */
export const ROTATION_OVERLAP_MS = 24 * 3_600_000;
/** A dispatch nobody acts on expires this long after it is written. */
export const DISPATCH_TTL_MS = 24 * 3_600_000;
/** How often the server expires due dispatches and republishes its files. */
export const SWEEP_MS = 30_000;

/** A dispatch the server will not write, with the reason it shows; nothing was stored. */
export class DispatchRefused extends Error {
  override name = "DispatchRefused";
}

/** `[queue] url` and `[dispatch] record` in the user's beads-ui.toml, as a store to open. */
export type StoreChoice = { kind: "local" } | { kind: "queue"; url: string };

const isTable = (value: TomlValue | undefined): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * The store D-14 picks: the work queue's prompt store where `[queue] url` is set, the local store
 * otherwise. `[dispatch] record` may force either; asking for the queue with no URL is refused.
 */
export async function readStoreChoice(env: ConfigEnv): Promise<StoreChoice> {
  const file = await readUserConfig(env);
  if (file.kind !== "file") return { kind: "local" };
  const parsed = parseToml(file.text);
  if (!parsed.ok)
    throw new DispatchRefused(`${file.path} line ${parsed.error.line} cannot be read`);
  const queue = parsed.value.queue;
  const dispatch = parsed.value.dispatch;
  let url: string | undefined;
  if (queue !== undefined) {
    const value = isTable(queue) ? queue.url : undefined;
    if (value !== undefined && (typeof value !== "string" || !isHttpUrl(value))) {
      throw new DispatchRefused(`[queue] url in ${file.path} is not an http or https URL`);
    }
    url = value;
  }
  const record = isTable(dispatch) ? dispatch.record : undefined;
  if (record !== undefined && record !== "queue" && record !== "local") {
    throw new DispatchRefused(`[dispatch] record in ${file.path} must be "queue" or "local"`);
  }
  if (record === "queue" && url === undefined) {
    throw new DispatchRefused(`[dispatch] record = "queue" in ${file.path} needs [queue] url`);
  }
  if (record === "local" || url === undefined) return { kind: "local" };
  return { kind: "queue", url };
}

/** Opens the chosen store over the server's state directory, where the bodies live. */
export function openStore(choice: StoreChoice, stateDir: string): Promise<DispatchStore> {
  return choice.kind === "queue"
    ? openQueueDispatchStore({ url: choice.url, dir: stateDir })
    : openLocalDispatchStore(stateDir);
}

const STATE_REF = /^state:([A-Za-z0-9][A-Za-z0-9._-]*)$/;
const code = (error: unknown) => (error as NodeJS.ErrnoException).code ?? String(error);

/**
 * The secret text `[auth] signing_key` names. A `state:<file>` reference is a file in the server's
 * state directory, which must be a regular file of mode 0600 owned by the server's user.
 */
async function readSigningSecret(reference: string, stateDir: string): Promise<string> {
  const name = STATE_REF.exec(reference)?.[1];
  if (name === undefined) {
    throw new DispatchRefused(
      `[auth] signing_key = ${JSON.stringify(reference)}: this server reads its signing key only from a state:<file> reference, so it cannot sign`,
    );
  }
  const path = join(stateDir, name);
  const where = `[auth] signing_key: ${path}`;
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch (error) {
    throw new DispatchRefused(`${where} cannot be read (${code(error)}), so nothing can be signed`);
  }
  if (!info.isFile()) throw new DispatchRefused(`${where} is not a file`);
  const mode = Number(info.mode) & 0o777;
  if (mode !== 0o600) {
    throw new DispatchRefused(`${where} is mode ${mode.toString(8).padStart(4, "0")}, not 0600`);
  }
  if (typeof process.getuid === "function" && Number(info.uid) !== process.getuid()) {
    throw new DispatchRefused(`${where} is not owned by the server's user`);
  }
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new DispatchRefused(`${where} cannot be read (${code(error)}), so nothing can be signed`);
  }
}

/** One entry of a trusted-keys map (Envelope wire format). */
export interface PublishedKey {
  key_id: string;
  /** base64url, unpadded, the raw 32-byte Ed25519 public key. */
  public_key: string;
  not_before: string;
  not_after: string | null;
  revoked: boolean;
}

export interface PublishedKeys {
  version: 1;
  keys: PublishedKey[];
}

const KEY_FIELDS = "key_id,not_after,not_before,public_key,revoked";

function parsePublishedKeys(text: string): PublishedKeys | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof json !== "object" || json === null) return undefined;
  const { version, keys } = json as { version?: unknown; keys?: unknown };
  if (version !== 1 || !Array.isArray(keys)) return undefined;
  for (const entry of keys as unknown[]) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const key = entry as Record<string, unknown>;
    if (Object.keys(key).sort().join(",") !== KEY_FIELDS) return undefined;
    if (typeof key.key_id !== "string" || typeof key.public_key !== "string") return undefined;
    if (!isTimestamp(key.not_before) || typeof key.revoked !== "boolean") return undefined;
    if (key.not_after !== null && !isTimestamp(key.not_after)) return undefined;
  }
  return { version: 1, keys: keys as PublishedKey[] };
}

/**
 * The published keys after the server signs with `current` at `now` (T-W0.4): `current` is added
 * from `now` with no end, or kept as published; every other key still open is closed 24 hours on,
 * a closed key is never extended, and a key whose window has ended is dropped. A key id names one
 * key for its whole life, so `current` published with another public key, or revoked, is refused.
 */
export function mergePublishedKeys(
  published: readonly PublishedKey[],
  current: { key_id: string; public_key: string },
  now: string,
): PublishedKey[] {
  const held = published.find((key) => key.key_id === current.key_id);
  if (held !== undefined && held.public_key !== current.public_key) {
    throw new DispatchRefused(
      `[auth] signing_key_id ${current.key_id} is already published for another key; give a new key a new signing_key_id`,
    );
  }
  if (held?.revoked === true) {
    throw new DispatchRefused(`[auth] signing_key_id ${current.key_id} is published as revoked`);
  }
  const closesAt = formatTimestamp(new Date(new Date(now).getTime() + ROTATION_OVERLAP_MS));
  const keys: PublishedKey[] = [
    held === undefined
      ? { ...current, not_before: now, not_after: null, revoked: false }
      : { ...held, not_after: null },
  ];
  for (const key of published) {
    if (key.key_id === current.key_id) continue;
    if (key.not_after !== null && key.not_after <= now) continue;
    keys.push(key.not_after === null && !key.revoked ? { ...key, not_after: closesAt } : key);
  }
  return keys.sort((a, b) => (a.key_id < b.key_id ? -1 : a.key_id > b.key_id ? 1 : 0));
}

/** Replaces `path` in one step, readable by the host's installer; false when it already held `text`. */
async function publishFile(path: string, text: string): Promise<boolean> {
  const before = await readFile(path, "utf8").catch(() => undefined);
  if (before === text) return false;
  const next = `${path}.${randomBytes(6).toString("hex")}.new`;
  await writeFile(next, text, { mode: 0o644, flag: "wx" });
  await rename(next, path);
  return true;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ULID for a dispatch written at `ms`: 48 bits of time, then 80 random bits. */
export function mintUlid(ms: number, random: Uint8Array = randomBytes(10)): string {
  let time = "";
  let rest = ms;
  for (let i = 0; i < 10; i += 1) {
    time = CROCKFORD[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  let bits = BigInt(`0x${Buffer.from(random).toString("hex")}`);
  let tail = "";
  for (let i = 0; i < 16; i += 1) {
    tail = CROCKFORD[Number(bits & 31n)] + tail;
    bits >>= 5n;
  }
  return time + tail;
}

/** A dispatch to write, before it is signed. */
export interface NewDispatch {
  task: DispatchTask;
  target: DispatchTarget;
  kind: DispatchKind;
  /** The exact text the receiving session gets. */
  body: string | Uint8Array;
  arm_goal: boolean;
  /** How long until it expires; DISPATCH_TTL_MS unless set. */
  ttlMs?: number;
}

export interface DispatchServiceOptions {
  env: ConfigEnv;
  stateDir: string;
  store: DispatchStore;
  /** This host's allowlist, or with `host` that host's published copy, read at call time. */
  allowlist(host?: string): Promise<Allowlist>;
  /** This host's open stores: a dispatch's task is addressed by repository and id in one of them. */
  stores: Pick<StoreRegistry, "read">;
  /** Milliseconds since the epoch. */
  clock: () => number;
}

export class DispatchService {
  readonly store: DispatchStore;
  readonly stateDir: string;
  readonly #env: ConfigEnv;
  readonly #allowlist: (host?: string) => Promise<Allowlist>;
  readonly #stores: Pick<StoreRegistry, "read">;
  readonly #clock: () => number;
  readonly #publishing = new Serial();

  constructor(options: DispatchServiceOptions) {
    this.store = options.store;
    this.stateDir = options.stateDir;
    this.#env = options.env;
    this.#allowlist = options.allowlist;
    this.#stores = options.stores;
    this.#clock = options.clock;
  }

  now(): string {
    return formatTimestamp(new Date(this.#clock()));
  }

  /**
   * The key `[auth]` names now, after publishing it: a key is in the published file before the
   * server signs anything with it, and the key it replaces stays valid there for 24 hours.
   */
  publishKey(): Promise<{ key: SigningKey; user: string }> {
    return this.#publishing.run(async () => {
      let user = "";
      const source = signingKeySource(async () => {
        let settings: Awaited<ReturnType<typeof loadAuth>>;
        try {
          settings = await loadAuth(this.#env);
        } catch (error) {
          if (error instanceof AuthRefused) throw new DispatchRefused(error.message);
          throw error;
        }
        user = settings.configuredUser;
        return {
          keyId: settings.signingKeyId,
          secret: await readSigningSecret(settings.signingKey, settings.stateDir),
        };
      });
      let key: SigningKey;
      try {
        key = await source();
      } catch (error) {
        if (error instanceof MalformedDispatch) {
          throw new DispatchRefused(`[auth] signing_key: ${error.message}`);
        }
        throw error;
      }
      const jwk = createPublicKey(key.privateKey).export({ format: "jwk" });
      const path = join(this.stateDir, PUBLISHED_KEYS_FILE);
      const text = await readFile(path, "utf8").catch((error: unknown) => {
        if (code(error) === "ENOENT") return undefined;
        throw new DispatchRefused(`${path} cannot be read (${code(error)})`);
      });
      const published = text === undefined ? { version: 1, keys: [] } : parsePublishedKeys(text);
      if (published === undefined) {
        throw new DispatchRefused(`${path} is not a trusted-keys map; nothing was signed`);
      }
      const keys = mergePublishedKeys(
        published.keys,
        { key_id: key.keyId, public_key: String(jwk.x) },
        this.now(),
      );
      await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
      await publishFile(path, `${JSON.stringify({ version: 1, keys }, null, 2)}\n`);
      return { key, user };
    });
  }

  /** Publishes this host's allowlist; an unreadable one is published as allowing nothing. */
  async publishAllowlist(): Promise<void> {
    const allowlist = await this.#allowlist();
    const content = allowlist.ok
      ? { version: 1, allow_repos: [...allowlist.repos].sort() }
      : { version: 1, allow_repos: [], unreadable: allowlist.reason };
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    await publishFile(
      join(this.stateDir, PUBLISHED_ALLOWLIST_FILE),
      `${JSON.stringify(content, null, 2)}\n`,
    );
  }

  /** Publishes both files; returns why the keys could not be, without stopping the server. */
  async publish(): Promise<string[]> {
    const problems: string[] = [];
    try {
      await this.publishKey();
    } catch (error) {
      if (!(error instanceof DispatchRefused)) throw error;
      problems.push(`dispatches cannot be signed: ${error.message}`);
    }
    await this.publishAllowlist();
    return problems;
  }

  /**
   * Signs and stores one dispatch. Refused, with nothing stored, when the task's repository is not
   * on the target host's published allowlist (T-W0.2), when it is not one of this host's open
   * stores (the store registry, D-18), or when the signing key cannot be read.
   */
  async create(input: NewDispatch): Promise<CreateResult> {
    const { task, target } = input;
    const allowlist = await this.#allowlist(target.host);
    if (!allowlist.ok) {
      throw new DispatchRefused(`${target.host}'s published allowlist: ${allowlist.reason}`);
    }
    if (!isAllowed(allowlist, task.repo)) {
      throw new DispatchRefused(`${task.repo} is not on ${target.host}'s published allowlist`);
    }
    const { open } = await this.#stores.read();
    if (!open.some((store) => store.repository === task.repo)) {
      throw new DispatchRefused(`${task.repo} is not an open store on this host`);
    }
    const { key, user } = await this.publishKey();
    const body = typeof input.body === "string" ? new TextEncoder().encode(input.body) : input.body;
    const at = this.#clock();
    const id = mintUlid(at);
    let record: Awaited<ReturnType<typeof signDispatch>>;
    try {
      record = await signDispatch(
        {
          id,
          task,
          target,
          kind: input.kind,
          body_ref: `body-store:${id}`,
          body_digest: bodyDigest(body),
          arm_goal: input.arm_goal,
          created_by: user,
          created_at: formatTimestamp(new Date(at)),
          expires_at: formatTimestamp(new Date(at + (input.ttlMs ?? DISPATCH_TTL_MS))),
        },
        async () => key,
      );
    } catch (error) {
      if (error instanceof MalformedDispatch) throw new DispatchRefused(error.message);
      throw error;
    }
    return this.store.create(record, body);
  }

  /** Expires every dispatch due now, which deletes its body and appends its tombstone. */
  expireDue(): Promise<string[]> {
    return this.store.expire(this.now());
  }

  /** The periodic pass: expiry, then compaction of tombstoned bodies, then publication. */
  async sweep(): Promise<{ expired: string[]; problems: string[] }> {
    const expired = await this.expireDue();
    await this.store.compact();
    return { expired, problems: await this.publish() };
  }
}
