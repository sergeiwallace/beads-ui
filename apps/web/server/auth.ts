import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { parseToml, type TomlTable, type TomlValue } from "@beads-ui/core";
import { type ConfigEnv, readUserConfig, serverStateDir } from "./config.ts";

// Request authentication and write authorization (web app design D-17, T-W0.1).

export const AUTH_TABLE = "auth";
/** A one-time sign-in code works for five minutes. */
export const CODE_TTL_MS = 5 * 60_000;
/** A browser session ends 12 hours after sign-in. */
export const SESSION_MAX_AGE_MS = 12 * 3_600_000;
/** A browser session ends after 2 hours with no request. */
export const SESSION_IDLE_MS = 2 * 3_600_000;
/** Every browser write carries this header, which a cross-site form cannot set. */
export const WRITE_HEADER = "x-beads-ui";
/** The tailnet identity Tailscale Serve adds; recorded, never trusted alone. */
export const IDENTITY_HEADER = "tailscale-user-login";
export const EXCHANGE_PATH = "api/auth/v1/exchange";

/** The `[auth]` table, validated, with each `state:` reference resolved to its file. */
export interface AuthSettings {
  /** The user's `beads-ui.toml` the table was read from. */
  source: string;
  stateDir: string;
  hosts: readonly string[];
  origins: readonly string[];
  dispatchIdentities: readonly string[];
  browserSecret: string;
  receiverToken: string;
  mcpToken: string;
  configuredUser: string;
  /** As written: the envelope signer resolves it. */
  signingKey: string;
  signingKeyId: string;
  /** As written: the receiving side reads it. */
  trustedKeys: string;
}

/** A start the `[auth]` table refuses; the message names every key that is wrong. */
export class AuthRefused extends Error {}

/** Who a request was admitted as. */
export type Caller =
  | { kind: "browser"; session: string; identity: string | undefined }
  | { kind: "receiver"; host: string }
  | { kind: "mcp" }
  /** `/healthz`: no credential, and an answer that says only whether the server is healthy. */
  | { kind: "health" };

/** Which credential a path takes: one per route class, never another's. */
export type RouteClass = "browser" | "receiver" | "mcp" | "admin" | "auth" | "health";

export function routeClass(pathname: string): RouteClass {
  if (pathname === "/healthz") return "health";
  if (pathname.startsWith("/api/receiver/")) return "receiver";
  if (pathname.startsWith("/api/mcp/")) return "mcp";
  if (pathname.startsWith("/api/admin/")) return "admin";
  if (pathname.startsWith("/api/auth/")) return "auth";
  return "browser";
}

const isTable = (value: TomlValue | undefined): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const STATE_REF = /^state:([A-Za-z0-9][A-Za-z0-9._-]*)$/;
const KEY_REF = /^(?:state|secret-store):[A-Za-z0-9][A-Za-z0-9._-]*$/;
const HOST_VALUE = /^(?:[a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:.]+\])(?::(\d{1,5}))?$/i;

/** A Host value `[auth] hosts` accepts: a name or bracketed address, with a port from 1 to 65535. */
const isHostValue = (value: string): boolean => {
  const match = HOST_VALUE.exec(value);
  if (match === null) return false;
  const port = match[2];
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65_535);
};
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9.-]*-\d{8}$/;
const SECRET_TEXT = /^[A-Za-z0-9_-]{43,}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function stringList(
  table: TomlTable,
  key: string,
  problems: string[],
  check?: (value: string) => boolean,
  shape?: string,
): string[] {
  const value = table[key];
  if (value === undefined) {
    problems.push(`[auth] ${key} is missing`);
    return [];
  }
  if (!Array.isArray(value)) {
    problems.push(`[auth] ${key} must be a list of strings`);
    return [];
  }
  if (value.length === 0) {
    problems.push(`[auth] ${key} is empty`);
    return [];
  }
  for (const item of value) {
    if (item.trim() === "") problems.push(`[auth] ${key} holds an empty value`);
    else if (check !== undefined && !check(item)) {
      problems.push(`[auth] ${key}: ${JSON.stringify(item)} is not ${shape}`);
    }
  }
  return value;
}

function text(
  table: TomlTable,
  key: string,
  problems: string[],
  pattern?: RegExp,
  shape?: string,
): string {
  const value = table[key];
  if (value === undefined) {
    problems.push(`[auth] ${key} is missing`);
    return "";
  }
  if (typeof value !== "string") {
    problems.push(`[auth] ${key} must be a string`);
    return "";
  }
  if (value.trim() === "") {
    problems.push(`[auth] ${key} is empty`);
    return "";
  }
  if (pattern !== undefined && !pattern.test(value)) {
    problems.push(`[auth] ${key}: ${JSON.stringify(value)} is not ${shape}`);
  }
  return value;
}

const isOrigin = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
};

/** The `[auth]` table as written, each key checked; credentials are checked by loadAuth. */
function parseAuthTable(
  table: TomlTable,
  source: string,
  stateDir: string,
): { settings: AuthSettings; problems: string[] } {
  const problems: string[] = [];
  const stateFile = (key: string): string => {
    const ref = text(table, key, problems, STATE_REF, "a state:<file> reference");
    const name = STATE_REF.exec(ref)?.[1];
    return name === undefined ? "" : join(stateDir, name);
  };
  const settings: AuthSettings = {
    source,
    stateDir,
    hosts: stringList(
      table,
      "hosts",
      problems,
      isHostValue,
      "a host name, with any port from 1 to 65535",
    ),
    origins: stringList(
      table,
      "origins",
      problems,
      isOrigin,
      "an origin such as http://localhost:4810",
    ),
    dispatchIdentities: stringList(table, "dispatch_identities", problems),
    browserSecret: stateFile("browser_secret"),
    receiverToken: stateFile("receiver_token"),
    mcpToken: stateFile("mcp_token"),
    configuredUser: text(table, "configured_user", problems),
    signingKey: text(
      table,
      "signing_key",
      problems,
      KEY_REF,
      "a state: or secret-store: reference",
    ),
    signingKeyId: text(table, "signing_key_id", problems, KEY_ID, "<host>-<yyyymmdd>"),
    trustedKeys: text(table, "trusted_keys", problems, STATE_REF, "a state:<file> reference"),
  };
  return { settings, problems };
}

const newSecret = (): string => `${randomBytes(32).toString("base64url")}\n`;
const EMPTY_RECEIVER_MAP = `${JSON.stringify({ version: 1, tokens: {} }, null, 2)}\n`;

/** The receiver token map: host name to the SHA-256 of that host's token (Receiver API). */
export interface ReceiverTokenMap {
  version: 1;
  tokens: Record<string, string>;
}

export function parseReceiverMap(content: string): ReceiverTokenMap | undefined {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (typeof json !== "object" || json === null) return undefined;
  const { version, tokens } = json as { version?: unknown; tokens?: unknown };
  if (version !== 1 || typeof tokens !== "object" || tokens === null || Array.isArray(tokens)) {
    return undefined;
  }
  const entries = Object.entries(tokens as Record<string, unknown>);
  if (entries.some(([, hash]) => typeof hash !== "string" || !SHA256_HEX.test(hash))) {
    return undefined;
  }
  return { version: 1, tokens: Object.fromEntries(entries) as Record<string, string> };
}

const secretProblem = (content: string) =>
  SECRET_TEXT.test(content.trim()) ? undefined : "does not hold a generated secret";

/**
 * Checks one credential file: created with mode 0600 when absent (generated at first start),
 * else it must be a regular file of mode 0600, owned by the server's user, readable and well
 * formed. Returns the problem naming the key, or undefined.
 */
async function checkCredential(
  key: string,
  path: string,
  make: () => string,
  problem: (content: string) => string | undefined,
): Promise<string | undefined> {
  const where = `[auth] ${key}: ${path}`;
  const code = (error: unknown) => (error as NodeJS.ErrnoException).code ?? String(error);
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(path);
  } catch (error) {
    if (code(error) !== "ENOENT") return `${where} cannot be read (${code(error)})`;
    try {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, make(), { mode: 0o600, flag: "wx" });
    } catch (created) {
      if (code(created) !== "EEXIST") return `${where} cannot be created (${code(created)})`;
    }
    try {
      info = await stat(path);
    } catch (again) {
      return `${where} cannot be read (${code(again)})`;
    }
  }
  if (!info.isFile()) return `${where} is not a file`;
  const mode = Number(info.mode) & 0o777;
  if (mode !== 0o600) return `${where} is mode ${mode.toString(8).padStart(4, "0")}, not 0600`;
  if (typeof process.getuid === "function" && Number(info.uid) !== process.getuid()) {
    return `${where} is not owned by the server's user`;
  }
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    return `${where} cannot be read (${code(error)})`;
  }
  const wrong = problem(content);
  return wrong === undefined ? undefined : `${where} ${wrong}`;
}

/**
 * Reads and validates the whole `[auth]` table from the user's `beads-ui.toml` and checks every
 * credential the server reads, generating any that is absent. Throws AuthRefused naming every
 * key that is missing, empty or malformed, and every credential that is unreadable or not 0600.
 */
export async function loadAuth(env: ConfigEnv): Promise<AuthSettings> {
  const file = await readUserConfig(env);
  if (file.kind === "none") {
    throw new AuthRefused("[auth] cannot be read: neither XDG_CONFIG_HOME nor HOME is set");
  }
  if (file.kind === "error") {
    throw new AuthRefused(`[auth] is missing: ${file.path}: ${file.message}`);
  }
  const parsed = parseToml(file.text);
  if (!parsed.ok) {
    throw new AuthRefused(
      `[auth] cannot be read: ${file.path} line ${parsed.error.line}: ${parsed.error.message}`,
    );
  }
  const table = parsed.value[AUTH_TABLE];
  if (!isTable(table)) throw new AuthRefused(`[auth] is missing from ${file.path}`);
  const stateDir = serverStateDir(env);
  if (stateDir === undefined) {
    throw new AuthRefused("[auth] credentials have no state directory: set XDG_STATE_HOME or HOME");
  }
  const { settings, problems } = parseAuthTable(table, file.path, stateDir);
  const credentials: [string, string, () => string, (content: string) => string | undefined][] = [
    ["browser_secret", settings.browserSecret, newSecret, secretProblem],
    [
      "receiver_token",
      settings.receiverToken,
      () => EMPTY_RECEIVER_MAP,
      (content) =>
        parseReceiverMap(content) === undefined
          ? 'is not a receiver token map ({"version": 1, "tokens": {"<host>": "<sha256>"}})'
          : undefined,
    ],
    ["mcp_token", settings.mcpToken, newSecret, secretProblem],
  ];
  for (const [key, path, make, problem] of credentials) {
    if (path === "") continue;
    const wrong = await checkCredential(key, path, make, problem);
    if (wrong !== undefined) problems.push(wrong);
  }
  if (problems.length > 0) {
    throw new AuthRefused(`${problems.join("; ")} (in ${file.path})`);
  }
  return settings;
}

const sha256 = (value: string): Buffer => createHash("sha256").update(value).digest();
export const sha256Hex = (value: string): string => sha256(value).toString("hex");
const hmac = (secret: string, message: string): string =>
  createHmac("sha256", secret).update(message).digest("base64url");
const sameDigest = (a: string, b: string): boolean => timingSafeEqual(sha256(a), sha256(b));

/** The key the host's own commands (login-link, sessions, revoke) present: only the host can derive it. */
export const adminKey = (browserSecret: string): string =>
  hmac(browserSecret.trim(), "beads-ui-web admin v1");

/**
 * Replaces a credential file in one step: a 0600 file beside it, then a rename over it, so a
 * reader sees the old content or the new and nothing between.
 */
export async function replaceCredential(path: string, content: string): Promise<void> {
  const next = `${path}.${randomBytes(6).toString("hex")}.new`;
  await writeFile(next, content, { mode: 0o600, flag: "wx" });
  await rename(next, path);
}

export const rotatedSecret = newSecret;

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  const first = Array.isArray(value) ? value[0] : value;
  return first === undefined || first === "" ? undefined : first;
}

function bearer(request: IncomingMessage): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(header(request, "authorization") ?? "");
  return match?.[1];
}

function cookie(request: IncomingMessage, name: string): string | undefined {
  for (const part of (header(request, "cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** The Host header's name, lower-cased, with any port. */
function hostParts(value: string): { full: string; name: string } {
  const full = value.toLowerCase();
  const bracket = /^(\[[^\]]+\])(?::\d+)?$/.exec(full);
  if (bracket?.[1] !== undefined) return { full, name: bracket[1] };
  const port = /^(.*):\d+$/.exec(full);
  return { full, name: port?.[1] ?? full };
}

/** Whether a Host header is on `[auth] hosts`: an entry with a port matches exactly, one without matches any port. */
export function hostAllowed(value: string | undefined, hosts: readonly string[]): boolean {
  if (value === undefined) return false;
  const { full, name } = hostParts(value);
  return hosts.some((entry) => {
    const allowed = entry.toLowerCase();
    return hostParts(allowed).name === allowed ? allowed === name : allowed === full;
  });
}

/**
 * Why a browser write is refused, or undefined when it passes: it must carry X-Beads-UI, and
 * Sec-Fetch-Site must say same-origin; with no Sec-Fetch-Site, Origin must equal an allowed origin.
 */
export function writeRefusal(
  request: IncomingMessage,
  origins: readonly string[],
): string | undefined {
  if (header(request, WRITE_HEADER) === undefined) return "a write needs the X-Beads-UI header";
  const site = header(request, "sec-fetch-site");
  if (site !== undefined) {
    return site === "same-origin" ? undefined : `a write from Sec-Fetch-Site: ${site} is refused`;
  }
  const origin = header(request, "origin");
  if (origin === undefined) return "a write with neither Sec-Fetch-Site nor Origin is refused";
  return origins.includes(origin) ? undefined : `a write from Origin ${origin} is refused`;
}

const isWrite = (method: string | undefined) => method !== "GET" && method !== "HEAD";

interface Session {
  id: string;
  /** What the host's commands list and revoke by; never the cookie's value. */
  publicId: string;
  /** The cookie's MAC under the secret it was issued with; a rotation stops it matching. */
  mac: string;
  createdAt: number;
  seenAt: number;
  identity: string | undefined;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  seenAt: string;
  identity: string | null;
}

export interface AuthOptions {
  settings: AuthSettings;
  /** The server's port: the cookie's name carries it, so two servers on one host never share one. */
  port: number;
  /** The path the app is mounted at; the cookie is scoped to it. */
  basePath?: string;
  /** Milliseconds since the epoch; the system clock unless a test sets one. */
  clock?: () => number;
}

function sendJson(response: ServerResponse, status: number, body: unknown, extra = {}): void {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(content),
    ...extra,
  });
  response.end(content);
}

function sendPage(
  response: ServerResponse,
  status: number,
  title: string,
  line: string,
  extra = {},
) {
  const html = (value: string) => value.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${html(title)}</title><h1>${html(title)}</h1><p>${html(line)}</p></html>`;
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "content-length": Buffer.byteLength(page),
    ...extra,
  });
  response.end(page);
}

const SIGN_IN_LINE =
  "On the host, run beads-ui-web login-link and open the link it prints. It works once, for five minutes.";

/**
 * The authentication layer in front of every route: the Host allowlist on every request, then
 * one credential per route class (the browser session cookie, the receiver token, the MCP token,
 * the host's admin key), then the write checks on every browser write. It also serves the
 * sign-in exchange, logout and the host's admin routes.
 */
export class AuthLayer {
  readonly settings: AuthSettings;
  readonly cookieName: string;
  readonly basePath: string;
  readonly #clock: () => number;
  readonly #sessions = new Map<string, Session>();
  /** SHA-256 of each outstanding one-time code, to its expiry. */
  readonly #codes = new Map<string, number>();
  readonly #ended = new Map<string, Set<() => void>>();

  constructor(options: AuthOptions) {
    this.settings = options.settings;
    this.cookieName = `beads_ui_session_${options.port}`;
    this.basePath = options.basePath ?? "/";
    this.#clock = options.clock ?? Date.now;
  }

  /** Mints a one-time sign-in code; the link carrying it works once, within CODE_TTL_MS. */
  mintCode(): { code: string; expiresAt: number; path: string } {
    const now = this.#clock();
    for (const [hash, expires] of this.#codes) if (expires <= now) this.#codes.delete(hash);
    const code = randomBytes(32).toString("base64url");
    const expiresAt = now + CODE_TTL_MS;
    this.#codes.set(sha256Hex(code), expiresAt);
    return { code, expiresAt, path: `${this.basePath}${EXCHANGE_PATH}?code=${code}` };
  }

  /** The live sessions, for the host's sessions command. */
  sessions(): SessionInfo[] {
    const now = this.#clock();
    const live: SessionInfo[] = [];
    for (const session of [...this.#sessions.values()]) {
      if (this.#expired(session, now)) {
        this.#end(session.id);
        continue;
      }
      live.push({
        id: session.publicId,
        createdAt: new Date(session.createdAt).toISOString(),
        seenAt: new Date(session.seenAt).toISOString(),
        identity: session.identity ?? null,
      });
    }
    return live;
  }

  /** Ends the one session the host's revoke command names; false when none has that id. */
  revoke(publicId: string): boolean {
    for (const session of this.#sessions.values()) {
      if (session.publicId === publicId) {
        this.#end(session.id);
        return true;
      }
    }
    return false;
  }

  /** Calls `listener` once when the session ends (logout, revoke, expiry); returns an unsubscribe. */
  onEnd(sessionId: string, listener: () => void): () => void {
    const listeners = this.#ended.get(sessionId) ?? new Set();
    listeners.add(listener);
    this.#ended.set(sessionId, listeners);
    return () => listeners.delete(listener);
  }

  /** Whether a session still holds, without counting as activity: for a long-lived stream. */
  async stillValid(sessionId: string): Promise<boolean> {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return false;
    const secret = await this.#secret();
    if (secret === undefined || !sameDigest(hmac(secret, `session:${session.id}`), session.mac)) {
      this.#end(session.id);
      return false;
    }
    if (this.#expired(session, this.#clock())) {
      this.#end(session.id);
      return false;
    }
    return true;
  }

  /** The browser session behind a caller, for a stream to watch; its internal id. */
  sessionIdOf(caller: Caller): string | undefined {
    if (caller.kind !== "browser") return undefined;
    for (const session of this.#sessions.values()) {
      if (session.publicId === caller.session) return session.id;
    }
    return undefined;
  }

  /**
   * Why a dispatch is refused on top of the session, or undefined: a request that came through
   * Tailscale Serve, so carries its identity header, dispatches only for an identity on
   * `[auth] dispatch_identities`.
   */
  dispatchRefusal(request: IncomingMessage, caller: Caller): string | undefined {
    if (caller.kind !== "browser") return undefined;
    const identity = header(request, IDENTITY_HEADER);
    if (identity === undefined) return undefined;
    return this.settings.dispatchIdentities.includes(identity)
      ? undefined
      : `${identity} is not on [auth] dispatch_identities`;
  }

  /**
   * Admits a request or answers it. Returns the caller to route it as, or undefined once this
   * layer has written the response: a refusal, or one of its own routes.
   */
  async admit(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
  ): Promise<Caller | undefined> {
    const kind = routeClass(url.pathname);
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const refuse = (status: number, errorKind: string, message: string, extra = {}) => {
      if (kind === "receiver") {
        // Every receiver refusal is the same empty 404, whatever its cause (Receiver API).
        response.writeHead(404, { "cache-control": "no-store", "content-length": 0 });
        response.end();
      } else if (isApi) {
        sendJson(response, status, { error: { kind: errorKind, message } }, extra);
      } else if (status === 401) {
        sendPage(response, status, "Sign in to beads-ui", SIGN_IN_LINE, extra);
      } else {
        sendPage(response, status, "Refused", message, extra);
      }
      return undefined;
    };

    if (!hostAllowed(header(request, "host"), this.settings.hosts)) {
      return refuse(403, "forbidden", "this Host is not on [auth] hosts");
    }
    switch (kind) {
      case "receiver": {
        const host = await this.#receiverHost(request);
        return host === undefined ? refuse(404, "not-found", "") : { kind: "receiver", host };
      }
      case "mcp":
        return (await this.#mcpTokenMatches(request))
          ? { kind: "mcp" }
          : refuse(401, "unauthenticated", "an MCP route takes the MCP token");
      case "admin":
        await this.#admin(request, response, url);
        return undefined;
      case "health":
        return { kind: "health" };
      case "auth":
        await this.#auth(request, response, url, refuse);
        return undefined;
      case "browser": {
        const found = await this.#session(request);
        if (found === undefined || found === "ended") {
          const clear = found === "ended" || cookie(request, this.cookieName) !== undefined;
          return refuse(
            401,
            "unauthenticated",
            `not signed in: ${SIGN_IN_LINE}`,
            clear ? { "set-cookie": this.#clearCookie() } : {},
          );
        }
        const caller: Caller = {
          kind: "browser",
          session: found.publicId,
          identity: header(request, IDENTITY_HEADER),
        };
        if (isWrite(request.method)) {
          const refusal = writeRefusal(request, this.settings.origins);
          if (refusal !== undefined) return refuse(403, "forbidden", refusal);
          if (!(await this.#recordWrite(request, url, caller))) {
            return refuse(503, "failed", "the write could not be recorded, so it was not made");
          }
        }
        return caller;
      }
    }
  }

  #expired(session: Session, now: number): boolean {
    return now - session.createdAt >= SESSION_MAX_AGE_MS || now - session.seenAt >= SESSION_IDLE_MS;
  }

  #end(sessionId: string): void {
    this.#sessions.delete(sessionId);
    const listeners = this.#ended.get(sessionId);
    this.#ended.delete(sessionId);
    for (const listener of listeners ?? []) listener();
  }

  async #secret(): Promise<string | undefined> {
    try {
      const value = (await readFile(this.settings.browserSecret, "utf8")).trim();
      return SECRET_TEXT.test(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  /** The request's live session, "ended" for one that just expired, or undefined for none. */
  async #session(request: IncomingMessage): Promise<Session | "ended" | undefined> {
    const value = cookie(request, this.cookieName);
    if (value === undefined) return undefined;
    const dot = value.indexOf(".");
    if (dot === -1) return undefined;
    const id = value.slice(0, dot);
    const mac = value.slice(dot + 1);
    const secret = await this.#secret();
    if (secret === undefined || !sameDigest(hmac(secret, `session:${id}`), mac)) {
      if (this.#sessions.has(id)) this.#end(id);
      return undefined;
    }
    const session = this.#sessions.get(id);
    if (session === undefined) return undefined;
    const now = this.#clock();
    if (this.#expired(session, now)) {
      this.#end(id);
      return "ended";
    }
    session.seenAt = now;
    const identity = header(request, IDENTITY_HEADER);
    if (identity !== undefined) session.identity = identity;
    return session;
  }

  #cookie(value: string, maxAgeSeconds: number): string {
    return `${this.cookieName}=${value}; Path=${this.basePath}; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
  }

  #clearCookie(): string {
    return this.#cookie("", 0);
  }

  async #recordWrite(request: IncomingMessage, url: URL, caller: Caller): Promise<boolean> {
    if (caller.kind !== "browser") return true;
    const line = JSON.stringify({
      at: new Date(this.#clock()).toISOString(),
      method: request.method,
      path: url.pathname,
      session: caller.session,
      identity: caller.identity ?? null,
    });
    try {
      await appendFile(join(this.settings.stateDir, "writes.jsonl"), `${line}\n`, { mode: 0o600 });
      return true;
    } catch {
      return false;
    }
  }

  async #receiverHost(request: IncomingMessage): Promise<string | undefined> {
    const token = bearer(request);
    if (token === undefined) return undefined;
    let map: ReceiverTokenMap | undefined;
    try {
      map = parseReceiverMap(await readFile(this.settings.receiverToken, "utf8"));
    } catch {
      return undefined;
    }
    const digest = sha256(token);
    for (const [host, hash] of Object.entries(map?.tokens ?? {})) {
      if (timingSafeEqual(Buffer.from(hash, "hex"), digest)) return host;
    }
    return undefined;
  }

  async #mcpTokenMatches(request: IncomingMessage): Promise<boolean> {
    const token = bearer(request);
    if (token === undefined) return false;
    try {
      const expected = (await readFile(this.settings.mcpToken, "utf8")).trim();
      return SECRET_TEXT.test(expected) && sameDigest(token, expected);
    } catch {
      return false;
    }
  }

  async #admin(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const token = bearer(request);
    const secret = await this.#secret();
    if (token === undefined || secret === undefined || !sameDigest(token, adminKey(secret))) {
      sendJson(response, 401, {
        error: {
          kind: "unauthenticated",
          message: "a host command route takes the host's admin key",
        },
      });
      return;
    }
    const path = url.pathname.slice("/api/admin/v1/".length);
    if (request.method === "POST" && path === "login-codes") {
      const { code, expiresAt, path: link } = this.mintCode();
      sendJson(response, 200, { code, expiresAt: new Date(expiresAt).toISOString(), path: link });
      return;
    }
    if (request.method === "GET" && path === "sessions") {
      sendJson(response, 200, { sessions: this.sessions() });
      return;
    }
    const revoke = /^sessions\/([^/]+)\/revoke$/.exec(path);
    if (request.method === "POST" && revoke?.[1] !== undefined) {
      if (this.revoke(decodeURIComponent(revoke[1]))) {
        response.writeHead(204, { "cache-control": "no-store" });
        response.end();
      } else {
        sendJson(response, 404, {
          error: { kind: "not-found", message: `no live session ${revoke[1]}` },
        });
      }
      return;
    }
    sendJson(response, 404, {
      error: { kind: "unknown-route", message: `no API route ${request.method} ${url.pathname}` },
    });
  }

  async #auth(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    refuse: (status: number, kind: string, message: string, extra?: object) => undefined,
  ): Promise<void> {
    if (url.pathname === `/${EXCHANGE_PATH}` && request.method === "GET") {
      await this.#exchange(request, response, url);
      return;
    }
    if (url.pathname === "/api/auth/v1/logout" && request.method === "POST") {
      const found = await this.#session(request);
      if (found === undefined || found === "ended") {
        refuse(401, "unauthenticated", "not signed in", { "set-cookie": this.#clearCookie() });
        return;
      }
      const refusal = writeRefusal(request, this.settings.origins);
      if (refusal !== undefined) {
        refuse(403, "forbidden", refusal);
        return;
      }
      this.#end(found.id);
      response.writeHead(204, { "cache-control": "no-store", "set-cookie": this.#clearCookie() });
      response.end();
      return;
    }
    refuse(404, "unknown-route", `no API route ${request.method} ${url.pathname}`);
  }

  /** Exchanges a one-time code, once and before it expires, for a session cookie. */
  async #exchange(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
    const site = header(request, "sec-fetch-site");
    if (site === "cross-site" || site === "same-site") {
      sendPage(response, 403, "Refused", "a sign-in link works only when opened directly");
      return;
    }
    const code = url.searchParams.get("code") ?? "";
    const hash = sha256Hex(code);
    const expiresAt = this.#codes.get(hash);
    this.#codes.delete(hash);
    const now = this.#clock();
    if (code === "" || expiresAt === undefined || now >= expiresAt) {
      sendPage(
        response,
        401,
        "This sign-in link no longer works",
        `It was already used or is past its five minutes. ${SIGN_IN_LINE}`,
      );
      return;
    }
    const secret = await this.#secret();
    if (secret === undefined) {
      sendPage(response, 503, "Refused", "the server cannot read [auth] browser_secret");
      return;
    }
    const id = randomBytes(32).toString("base64url");
    const mac = hmac(secret, `session:${id}`);
    this.#sessions.set(id, {
      id,
      publicId: randomBytes(6).toString("hex"),
      mac,
      createdAt: now,
      seenAt: now,
      identity: header(request, IDENTITY_HEADER),
    });
    response.writeHead(303, {
      location: this.basePath,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "set-cookie": this.#cookie(`${id}.${mac}`, SESSION_MAX_AGE_MS / 1000),
      "content-length": 0,
    });
    response.end();
  }
}
