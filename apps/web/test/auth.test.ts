import { randomBytes } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CODE_TTL_MS, SESSION_IDLE_MS, SESSION_MAX_AGE_MS } from "../server/auth.ts";
import { ROUTES, type Route } from "../server/routes.ts";
import { type RunningServer, StartRefused, startServer } from "../server/server.ts";
import {
  AUTH_DEFAULTS,
  exchange,
  type HostEnv,
  hostConfig,
  hostEnv,
  repoName,
  runCli,
  SAME_ORIGIN_WRITE,
  send,
  sessionCookie,
  signIn,
} from "./auth-env.ts";
import { createStore, type TestStore } from "./store.ts";

// T-W0.1: every criterion through a real request to the running server, or through the CLI.

/** Routes the receiver, MCP and dispatch legs will register; here they only name their caller. */
const PROBE_ROUTES: Route[] = [
  {
    method: "GET",
    path: "/api/receiver/v1/whoami",
    handle: async ({ caller }) => ({ status: 200, body: { caller } }),
  },
  {
    method: "POST",
    path: "/api/receiver/v1/whoami",
    handle: async ({ caller }) => ({ status: 200, body: { caller } }),
  },
  {
    method: "GET",
    path: "/api/mcp/v1/whoami",
    handle: async ({ caller }) => ({ status: 200, body: { caller } }),
  },
  {
    method: "POST",
    path: "/api/probe/dispatch",
    dispatch: true,
    handle: async ({ caller }) => ({ status: 200, body: { caller } }),
  },
];

let store: TestStore;
let env: HostEnv;
let clientDir: string;
let server: RunningServer;
let now = Date.parse("2026-11-09T12:00:00.000Z");
const cleanup: (() => Promise<void>)[] = [];

const config = (auth: Record<string, string | string[] | undefined> = {}) =>
  hostConfig({ allowRepos: [repoName(store.dir)], auth });

async function start(on: HostEnv = env, repoRoot = store.dir) {
  return startServer({
    repoRoot,
    port: 0,
    clientDir,
    configEnv: on.configEnv,
    routes: [...ROUTES, ...PROBE_ROUTES],
    clock: () => now,
    heartbeatMs: 50,
  });
}

/** A fresh host whose `[auth]` table is `text`; a start against it is expected to be refused. */
async function refusedWith(text: string): Promise<string> {
  const other = await hostEnv(text);
  cleanup.push(other.remove);
  try {
    const started = await start(other);
    await started.close();
  } catch (error) {
    if (error instanceof StartRefused) return error.message;
    throw error;
  }
  throw new Error("the server started");
}

const withCookie = (cookie: string, headers: Record<string, string> = {}) => ({
  cookie,
  ...headers,
});

let issue: string;
const priorityWrite = (headers: Record<string, string>, priority = 1) =>
  send(server, `/api/issues/${issue}/priority`, {
    method: "POST",
    headers,
    body: JSON.stringify({ priority, shown: "open" }),
  });

beforeAll(async () => {
  store = await createStore("auth");
  env = await hostEnv();
  clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>beads-ui client</title>");
  await env.write(config());
  server = await start();
  issue = await store.create("Guarded by auth", { priority: 3 });
});

afterAll(async () => {
  await server?.close();
  for (const step of cleanup.splice(0)) await step();
  await store?.remove();
  await env?.remove();
});

describe("the Host allowlist", () => {
  it("should answer a request whose Host is on [auth] hosts", async () => {
    const cookie = await signIn(server);
    expect((await send(server, "/api/board", { headers: { cookie } })).status).toBe(200);
    const local = await send(server, "/api/board", {
      headers: { cookie, host: `localhost:${server.port}` },
    });
    expect(local.status).toBe(200);
  });

  it("should refuse a DNS-rebinding Host on every route, even with a valid session", async () => {
    const cookie = await signIn(server);
    const rebound = { cookie, host: `attacker.example:${server.port}` };
    expect((await send(server, "/api/board", { headers: rebound })).status).toBe(403);
    expect((await send(server, "/", { headers: rebound })).status).toBe(403);
    const write = await priorityWrite({ ...SAME_ORIGIN_WRITE, ...rebound }, 0);
    expect(write.status).toBe(403);
    expect((await store.show(issue)).priority).toBe(3);
  });
});

describe("browser writes", () => {
  it("should refuse a write without the X-Beads-UI header and write nothing", async () => {
    const cookie = await signIn(server);
    const { "x-beads-ui": _marker, ...noMarker } = SAME_ORIGIN_WRITE;
    const reply = await priorityWrite(withCookie(cookie, noMarker), 0);
    expect(reply.status).toBe(403);
    expect(reply.json()).toMatchObject({
      error: { kind: "forbidden", message: expect.stringContaining("X-Beads-UI") },
    });
    expect((await store.show(issue)).priority).toBe(3);
  });

  it("should accept a write with Sec-Fetch-Site same-origin on that check", async () => {
    const cookie = await signIn(server);
    const reply = await priorityWrite(withCookie(cookie, SAME_ORIGIN_WRITE), 2);
    expect(reply.status).toBe(200);
    expect((await store.show(issue)).priority).toBe(2);
    await store.bd("update", issue, "--priority", "3");
  });

  it.each(["cross-site", "same-site", "none"])(
    "should refuse a write with Sec-Fetch-Site %s, even from an allowed Origin",
    async (site) => {
      const cookie = await signIn(server);
      const reply = await priorityWrite(
        withCookie(cookie, {
          ...SAME_ORIGIN_WRITE,
          "sec-fetch-site": site,
          origin: AUTH_DEFAULTS.origins?.[0] as string,
        }),
        0,
      );
      expect(reply.status).toBe(403);
      expect((await store.show(issue)).priority).toBe(3);
    },
  );

  it("should accept a write with no Sec-Fetch-Site only when its Origin exactly equals an allowed origin", async () => {
    const cookie = await signIn(server);
    const { "sec-fetch-site": _site, ...noSite } = SAME_ORIGIN_WRITE;
    const from = (origin?: string) =>
      priorityWrite(withCookie(cookie, origin === undefined ? noSite : { ...noSite, origin }), 0);
    expect((await from("http://127.0.0.1:4810/")).status).toBe(403);
    expect((await from("http://attacker.example")).status).toBe(403);
    expect((await from(undefined)).status).toBe(403);
    expect((await store.show(issue)).priority).toBe(3);
    expect((await from("http://127.0.0.1:4810")).status).toBe(200);
    expect((await store.show(issue)).priority).toBe(0);
    await store.bd("update", issue, "--priority", "3");
  });
});

const IDENTITY = {
  "tailscale-user-login": "owner@example.com",
  "tailscale-user-name": "Owner",
  "tailscale-user-profile-pic": "https://example.com/p.png",
};

describe("the browser session", () => {
  it("should refuse every browser request without a session, whatever identity headers it carries", async () => {
    const api = await send(server, "/api/board", { headers: IDENTITY });
    expect(api.status).toBe(401);
    expect(api.json()).toMatchObject({ error: { kind: "unauthenticated" } });
    const page = await send(server, "/", { headers: IDENTITY });
    expect(page.status).toBe(401);
    expect(page.text).toContain("beads-ui-web login-link");
    expect(page.text).not.toContain("beads-ui client");
    expect((await send(server, "/api/events", { headers: IDENTITY })).status).toBe(401);
    expect((await priorityWrite({ ...SAME_ORIGIN_WRITE, ...IDENTITY }, 0)).status).toBe(401);
    expect((await store.show(issue)).priority).toBe(3);
  });

  it("should refuse a loopback request with Tailscale identity headers and a forged session cookie", async () => {
    const forged = `${server.auth.cookieName}=${randomBytes(32).toString("base64url")}.${randomBytes(32).toString("base64url")}`;
    const reply = await send(server, "/api/board", { headers: { ...IDENTITY, cookie: forged } });
    expect(reply.status).toBe(401);
  });

  it("should record the Tailscale-User-Login identity of each write", async () => {
    const cookie = await signIn(server);
    const reply = await priorityWrite(
      withCookie(cookie, { ...SAME_ORIGIN_WRITE, "tailscale-user-login": "owner@example.com" }),
      3,
    );
    expect(reply.status).toBe(200);
    const lines = (await readFile(join(env.stateDir, "writes.jsonl"), "utf8")).trim().split("\n");
    expect(JSON.parse(lines.at(-1) ?? "{}")).toMatchObject({
      method: "POST",
      path: `/api/issues/${issue}/priority`,
      identity: "owner@example.com",
    });
  });

  it("should refuse a dispatch whose identity is not on [auth] dispatch_identities, in addition to the session", async () => {
    const cookie = await signIn(server);
    const dispatch = (headers: Record<string, string>) =>
      send(server, "/api/probe/dispatch", { method: "POST", headers, body: "{}" });
    const intruder = await dispatch(
      withCookie(cookie, { ...SAME_ORIGIN_WRITE, "tailscale-user-login": "intruder@example.com" }),
    );
    expect(intruder.status).toBe(403);
    expect(intruder.json()).toMatchObject({ error: { source: "[auth] dispatch_identities" } });
    const owner = await dispatch(
      withCookie(cookie, { ...SAME_ORIGIN_WRITE, "tailscale-user-login": "owner@example.com" }),
    );
    expect(owner.status).toBe(200);
    expect(owner.json()).toMatchObject({
      caller: { kind: "browser", identity: "owner@example.com" },
    });
    const noSession = await dispatch({
      ...SAME_ORIGIN_WRITE,
      "tailscale-user-login": "owner@example.com",
    });
    expect(noSession.status).toBe(401);
  });
});

describe("one credential per route class", () => {
  let receiverToken: string;
  let mcpToken: string;

  beforeAll(async () => {
    const issued = await runCli(env, store.dir, ["issue-receiver-token", "host-b"]);
    expect(issued.code).toBe(0);
    receiverToken = issued.stdout.trim();
    mcpToken = (await readFile(join(env.stateDir, "mcp-token"), "utf8")).trim();
  });

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  it("should authorise a receiver route by the receiver token alone, naming its host, and apply no browser check", async () => {
    const reply = await send(server, "/api/receiver/v1/whoami", {
      method: "POST",
      headers: {
        ...bearer(receiverToken),
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
        origin: "http://attacker.example",
      },
      body: "{}",
    });
    expect(reply.status).toBe(200);
    expect(reply.json()).toEqual({ caller: { kind: "receiver", host: "host-b" } });
  });

  it("should answer a receiver route an empty 404 for a missing, unknown or other route's credential", async () => {
    const cookie = await signIn(server);
    const attempts: Record<string, string>[] = [
      {},
      bearer(randomBytes(32).toString("base64url")),
      bearer(mcpToken),
      { cookie },
    ];
    for (const headers of attempts) {
      const reply = await send(server, "/api/receiver/v1/whoami", { headers });
      expect(reply.status).toBe(404);
      expect(reply.text).toBe("");
    }
  });

  it("should refuse a browser route carrying only the receiver token or the MCP token", async () => {
    expect((await send(server, "/api/board", { headers: bearer(receiverToken) })).status).toBe(401);
    expect((await send(server, "/api/board", { headers: bearer(mcpToken) })).status).toBe(401);
  });

  it("should authorise an MCP route by the MCP token and refuse the session cookie or the receiver token", async () => {
    const cookie = await signIn(server);
    const ok = await send(server, "/api/mcp/v1/whoami", { headers: bearer(mcpToken) });
    expect(ok.status).toBe(200);
    expect(ok.json()).toEqual({ caller: { kind: "mcp" } });
    expect((await send(server, "/api/mcp/v1/whoami", { headers: { cookie } })).status).toBe(401);
    const asReceiver = await send(server, "/api/mcp/v1/whoami", { headers: bearer(receiverToken) });
    expect(asReceiver.status).toBe(401);
  });
});

describe("sign-in links", () => {
  it("should print a link from login-link that the server exchanges once for an HttpOnly, SameSite=Strict cookie scoped to the base path", async () => {
    const printed = await runCli(env, store.dir, ["login-link", "--port", String(server.port)]);
    expect(printed.code).toBe(0);
    const link = new URL(printed.stdout.trim());
    expect(link.origin).toBe(AUTH_DEFAULTS.origins?.[0]);
    const reply = await exchange(server, `${link.pathname}${link.search}`);
    expect(reply.status).toBe(303);
    expect(reply.headers.location).toBe("/");
    const setCookie = String(reply.headers["set-cookie"]);
    expect(setCookie).toMatch(/; HttpOnly(;|$)/);
    expect(setCookie).toMatch(/; SameSite=Strict(;|$)/);
    expect(setCookie).toMatch(/; Path=\/(;|$)/);
    expect(setCookie).not.toMatch(/Domain=/i);
    const cookie = sessionCookie(reply) ?? "";
    expect((await send(server, "/api/board", { headers: { cookie } })).status).toBe(200);
  });

  it("should leave no token in the URL after the exchange", async () => {
    const reply = await exchange(server, server.auth.mintCode().path);
    expect(reply.headers.location).toBe("/");
    expect(reply.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("should refuse a code presented a second time and set no cookie", async () => {
    const { path } = server.auth.mintCode();
    expect((await exchange(server, path)).status).toBe(303);
    const again = await exchange(server, path);
    expect(again.status).toBe(401);
    expect(again.headers["set-cookie"]).toBeUndefined();
  });

  it("should accept a code within five minutes and refuse it after, setting no cookie", async () => {
    const early = server.auth.mintCode();
    const late = server.auth.mintCode();
    now += CODE_TTL_MS - 1_000;
    expect((await exchange(server, early.path)).status).toBe(303);
    now += 1_000;
    const expired = await exchange(server, late.path);
    expect(expired.status).toBe(401);
    expect(expired.headers["set-cookie"]).toBeUndefined();
  });

  it("should refuse a sign-in link opened from another site", async () => {
    const { path } = server.auth.mintCode();
    const reply = await send(server, path, { headers: { "sec-fetch-site": "cross-site" } });
    expect(reply.status).toBe(403);
    expect(reply.headers["set-cookie"]).toBeUndefined();
  });
});

/** Opens the SSE stream and resolves with its status and first chunk; `ended` resolves at its end. */
function openStream(cookie?: string) {
  return new Promise<{ status: number; type: string; first: string; ended: Promise<void> }>(
    (resolve, reject) => {
      const call = httpRequest(
        {
          host: "127.0.0.1",
          port: server.port,
          path: "/api/events",
          headers: {
            host: `127.0.0.1:${server.port}`,
            ...(cookie === undefined ? {} : { cookie }),
          },
        },
        (response) => {
          const ended = new Promise<void>((done) => response.on("end", () => done()));
          response.setEncoding("utf8");
          response.once("data", (first: string) =>
            resolve({
              status: response.statusCode ?? 0,
              type: String(response.headers["content-type"]),
              first,
              ended,
            }),
          );
          response.resume();
        },
      );
      call.on("error", reject);
      call.end();
    },
  );
}

describe("the event stream", () => {
  it("should open the SSE stream only for the session cookie", async () => {
    const refused = await openStream();
    expect(refused.status).toBe(401);
    const cookie = await signIn(server);
    const stream = await openStream(cookie);
    expect(stream.status).toBe(200);
    expect(stream.type).toContain("text/event-stream");
    expect(stream.first).toContain("event: ready");
    await send(server, "/api/auth/v1/logout", {
      method: "POST",
      headers: withCookie(cookie, SAME_ORIGIN_WRITE),
    });
    await stream.ended;
  });
});

describe("session lifetime", () => {
  it("should end a session 12 hours after sign-in, however active, and stop its cookie", async () => {
    const cookie = await signIn(server);
    const started = now;
    for (let hour = 1; hour < 12; hour++) {
      now = started + hour * 3_600_000;
      expect((await send(server, "/api/health", { headers: { cookie } })).status).toBe(200);
    }
    now = started + SESSION_MAX_AGE_MS - 1_000;
    expect((await send(server, "/api/health", { headers: { cookie } })).status).toBe(200);
    now = started + SESSION_MAX_AGE_MS;
    const ended = await send(server, "/api/health", { headers: { cookie } });
    expect(ended.status).toBe(401);
    expect(String(ended.headers["set-cookie"])).toContain("Max-Age=0");
    expect((await send(server, "/api/health", { headers: { cookie } })).status).toBe(401);
  });

  it("should end a session idle for 2 hours", async () => {
    const cookie = await signIn(server);
    now += SESSION_IDLE_MS - 1_000;
    expect((await send(server, "/api/health", { headers: { cookie } })).status).toBe(200);
    now += SESSION_IDLE_MS;
    expect((await send(server, "/api/health", { headers: { cookie } })).status).toBe(401);
  });

  it("should revoke the session on the server at logout and clear its cookie", async () => {
    const cookie = await signIn(server);
    const out = await send(server, "/api/auth/v1/logout", {
      method: "POST",
      headers: withCookie(cookie, SAME_ORIGIN_WRITE),
    });
    expect(out.status).toBe(204);
    expect(String(out.headers["set-cookie"])).toMatch(/Max-Age=0/);
    expect((await send(server, "/api/health", { headers: { cookie } })).status).toBe(401);
  });

  it("should refuse a cross-site logout and keep the session", async () => {
    const cookie = await signIn(server);
    const out = await send(server, "/api/auth/v1/logout", {
      method: "POST",
      headers: withCookie(cookie, { ...SAME_ORIGIN_WRITE, "sec-fetch-site": "cross-site" }),
    });
    expect(out.status).toBe(403);
    expect((await send(server, "/api/health", { headers: { cookie } })).status).toBe(200);
  });

  it("should end only the session the host's revoke command names", async () => {
    const as = async (login: string) => {
      const reply = await send(server, server.auth.mintCode().path, {
        headers: { "sec-fetch-site": "none", "tailscale-user-login": login },
      });
      return sessionCookie(reply) ?? "";
    };
    const first = await as("first@example.com");
    const second = await as("second@example.com");
    const listed = await runCli(env, store.dir, ["sessions", "--port", String(server.port)]);
    expect(listed.code).toBe(0);
    const line = listed.stdout.split("\n").find((row) => row.endsWith("first@example.com")) ?? "";
    const id = line.split(" ")[0] ?? "";
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    const revoked = await runCli(env, store.dir, [
      "revoke-session",
      id,
      "--port",
      String(server.port),
    ]);
    expect(revoked.code).toBe(0);
    expect((await send(server, "/api/health", { headers: { cookie: first } })).status).toBe(401);
    expect((await send(server, "/api/health", { headers: { cookie: second } })).status).toBe(200);
  });

  it("should stop every existing session cookie when the per-host secret is rotated", async () => {
    const first = await signIn(server);
    const second = await signIn(server);
    const rotated = await runCli(env, store.dir, ["rotate-secret"]);
    expect(rotated.code).toBe(0);
    expect((await stat(join(env.stateDir, "browser-secret"))).mode & 0o777).toBe(0o600);
    expect((await send(server, "/api/health", { headers: { cookie: first } })).status).toBe(401);
    expect((await send(server, "/api/health", { headers: { cookie: second } })).status).toBe(401);
    const fresh = await signIn(server);
    expect((await send(server, "/api/health", { headers: { cookie: fresh } })).status).toBe(200);
  });
});

const KEYS = Object.keys(AUTH_DEFAULTS);

describe("starting with the [auth] table", () => {
  it.each(KEYS)(
    "should refuse to start on loopback and name [auth] %s when it is missing",
    async (key) => {
      const message = await refusedWith(config({ [key]: undefined }));
      expect(message).toContain(`[auth] ${key} is missing`);
    },
  );

  it.each(KEYS)("should refuse to start and name [auth] %s when it is empty", async (key) => {
    const empty = Array.isArray(AUTH_DEFAULTS[key]) ? [] : "";
    const message = await refusedWith(config({ [key]: empty }));
    expect(message).toContain(`[auth] ${key} is empty`);
  });

  it.each([
    ["hosts", ["http://localhost"]],
    ["hosts", ["localhost:99999"]],
    ["hosts", ["localhost:0"]],
    ["hosts", ["[::1]:65536"]],
    ["origins", ["localhost:4810"]],
    ["origins", ["http://localhost:4810/"]],
    ["browser_secret", "file:browser-secret"],
    ["receiver_token", "state:../receiver"],
    ["mcp_token", "/tmp/mcp-token"],
    ["signing_key", "vault:dispatch-signing-key"],
    ["signing_key_id", "host-a"],
    ["trusted_keys", "secret-store:keys"],
  ] as [string, string | string[]][])(
    "should refuse to start and name [auth] %s when it is malformed (%j)",
    async (key, value) => {
      const message = await refusedWith(config({ [key]: value }));
      expect(message).toContain(`[auth] ${key}:`);
    },
  );

  it("should refuse to start when [auth] is in the repository's file but not the user's", async () => {
    const other = await hostEnv(
      hostConfig({ allowRepos: [repoName(store.dir)] }).replace(/\[auth\][\s\S]*/, ""),
    );
    cleanup.push(other.remove);
    await writeFile(join(store.dir, "beads-ui.toml"), config());
    try {
      await expect(start(other)).rejects.toThrow(/\[auth\] is missing/);
    } finally {
      await rm(join(store.dir, "beads-ui.toml"));
    }
  });

  it("should generate the credentials it reads, mode 0600, in the state directory and never in the repository", async () => {
    const fresh = await hostEnv(config());
    cleanup.push(fresh.remove);
    const before = await readdir(store.dir);
    const started = await start(fresh);
    await started.close();
    for (const file of ["browser-secret", "receiver-tokens.json", "mcp-token"]) {
      expect((await stat(join(fresh.stateDir, file))).mode & 0o777).toBe(0o600);
    }
    expect(await readdir(store.dir)).toEqual(before);
  });

  it.each(["browser_secret", "receiver_token", "mcp_token"])(
    "should refuse to start and name [auth] %s when its file is not mode 0600",
    async (key) => {
      const fresh = await hostEnv(config());
      cleanup.push(fresh.remove);
      await (await start(fresh)).close();
      const file = String(AUTH_DEFAULTS[key]).slice("state:".length);
      await chmod(join(fresh.stateDir, file), 0o644);
      await expect(start(fresh)).rejects.toThrow(
        new RegExp(`\\[auth\\] ${key}: .* is mode 0644, not 0600`),
      );
    },
  );

  it("should refuse to start and name [auth] browser_secret when its file cannot be read", async () => {
    const fresh = await hostEnv(config());
    cleanup.push(async () => {
      await chmod(fresh.stateDir, 0o700);
      await fresh.remove();
    });
    await (await start(fresh)).close();
    await chmod(fresh.stateDir, 0o000);
    await expect(start(fresh)).rejects.toThrow(/\[auth\] browser_secret: .* cannot be read/);
  });

  it("should refuse to start when a credential file does not hold a generated secret", async () => {
    const fresh = await hostEnv(config());
    cleanup.push(fresh.remove);
    await mkdir(fresh.stateDir, { recursive: true });
    await writeFile(join(fresh.stateDir, "mcp-token"), "short\n", { mode: 0o600 });
    await expect(start(fresh)).rejects.toThrow(
      /\[auth\] mcp_token: .* does not hold a generated secret/,
    );
  });

  it("should refuse to bind beyond loopback without the [auth] table, naming the setting", async () => {
    const other = await hostEnv(
      hostConfig({ allowRepos: [repoName(store.dir)] }).replace(/\[auth\][\s\S]*/, ""),
    );
    cleanup.push(other.remove);
    await writeFile(join(store.dir, "beads-ui.toml"), '[web]\nhost = "0.0.0.0"\n');
    try {
      await expect(start(other)).rejects.toThrow(
        /\[web\] host = "0\.0\.0\.0" binds beyond loopback, which needs the whole \[auth\] table: \[auth\] is missing/,
      );
      const valid = await hostEnv(config());
      cleanup.push(valid.remove);
      const wide = await start(valid);
      expect(wide.server.address()).toMatchObject({ address: "0.0.0.0" });
      await wide.close();
    } finally {
      await rm(join(store.dir, "beads-ui.toml"));
    }
  });
});
