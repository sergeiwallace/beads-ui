import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_IDLE_MS, SESSION_MAX_AGE_MS, sha256Hex } from "../server/auth.ts";
import { type RunningServer, startServer } from "../server/server.ts";
import {
  type HostEnv,
  hostConfig,
  hostEnv,
  runCli,
  SAME_ORIGIN_WRITE,
  send,
  sessionCookie,
  signIn,
} from "./auth-env.ts";

describe("browser sessions across server restarts", () => {
  let env: HostEnv;
  let server: RunningServer | undefined;
  let stateFile: string;
  let now: number;

  const start = (port: number) =>
    startServer({
      repoRoot: env.configHome,
      clientDir: env.configHome,
      configEnv: env.configEnv,
      port,
      clock: () => now,
      heartbeatMs: 50,
    });

  async function restart() {
    if (server === undefined) throw new Error("no server to restart");
    const { port } = server;
    await server.close();
    server = undefined;
    server = await start(port);
    return server;
  }

  const status = async (running: RunningServer, cookie: string) =>
    (await send(running, "/api/health", { headers: { cookie } })).status;

  const savedCount = async () => Object.keys(JSON.parse(await readFile(stateFile, "utf8"))).length;

  beforeEach(async () => {
    now = Date.parse("2026-11-09T12:00:00.000Z");
    env = await hostEnv(hostConfig({}));
    stateFile = join(env.stateDir, "browser-sessions.json");
    server = await start(0);
    return async () => env.remove();
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  function running() {
    if (server === undefined) throw new Error("server did not start");
    return server;
  }

  it("should accept the same browser cookie after a restart", async () => {
    const cookie = await signIn(running());
    expect(await status(running(), cookie)).toBe(200);
    expect(await status(await restart(), cookie)).toBe(200);
  });

  it("should save only hashed cookie IDs in a mode 0600 file", async () => {
    const cookie = await signIn(running());
    const id = cookie.split("=")[1]?.split(".")[0];
    if (id === undefined) throw new Error("the session cookie has no ID");
    expect((await stat(stateFile)).mode & 0o777).toBe(0o600);
    const contents = await readFile(stateFile, "utf8");
    expect(contents.includes(id)).toBe(false);
    const entries = JSON.parse(contents);
    expect(Object.hasOwn(entries, sha256Hex(id))).toBe(true);
    expect(Object.keys(entries[sha256Hex(id)]).sort()).toEqual([
      "createdAt",
      "identity",
      "mac",
      "publicId",
      "seenAt",
    ]);
  });

  it.each(["idle", "absolute"])(
    "should drop a session past its %s limit at startup",
    async (limit) => {
      const cookie = await signIn(running());
      const created = now;
      if (limit === "absolute") {
        while (now < created + SESSION_MAX_AGE_MS - 3_600_000) {
          now += 3_600_000;
          expect(await status(running(), cookie)).toBe(200);
        }
        now = created + SESSION_MAX_AGE_MS;
      } else {
        now += SESSION_IDLE_MS;
      }
      const restored = await restart();
      expect(await savedCount()).toBe(0);
      expect(await status(restored, cookie)).toBe(401);
    },
  );

  it("should list and revoke a restored session through the host commands", async () => {
    const reply = await send(running(), running().auth.mintCode().path, {
      headers: { "sec-fetch-site": "none", "tailscale-user-login": "owner@example.com" },
    });
    expect(reply.status).toBe(303);
    const cookie = sessionCookie(reply) ?? "";
    const other = await signIn(running());
    const restored = await restart();
    const port = ["--port", String(restored.port)];
    const listed = await runCli(env, env.configHome, ["sessions", ...port]);
    expect(listed.code).toBe(0);
    const row = listed.stdout.split("\n").find((line) => line.endsWith("owner@example.com"));
    const id = row?.split(" ")[0];
    if (!id) throw new Error("the restored session was not listed");
    const revoked = await runCli(env, env.configHome, ["revoke-session", id, ...port]);
    expect(revoked.code).toBe(0);
    const restarted = await restart();
    expect(await status(restarted, cookie)).toBe(401);
    expect(await status(restarted, other)).toBe(200);
  });

  it("should keep a logged-out session ended after a restart", async () => {
    const cookie = await signIn(running());
    const restored = await restart();
    const logout = await send(restored, "/api/auth/v1/logout", {
      method: "POST",
      headers: { ...SAME_ORIGIN_WRITE, cookie },
    });
    expect(logout.status).toBe(204);
    expect(await savedCount()).toBe(0);
    expect(await status(await restart(), cookie)).toBe(401);
  });

  it("should refuse a restored session and close its stream after browser secret rotation", async () => {
    const cookie = await signIn(running());
    const restored = await restart();
    expect(await status(restored, cookie)).toBe(200);
    const stream = await fetch(new URL("api/events", restored.url), {
      headers: { cookie },
      signal: AbortSignal.timeout(15_000),
    });
    expect(stream.status).toBe(200);
    const [events, rotated] = await Promise.all([
      stream.text(),
      runCli(env, env.configHome, ["rotate-secret"]),
    ]);
    expect(rotated.code).toBe(0);
    expect(events).toContain("event: ready");
    expect(await status(await restart(), cookie)).toBe(401);
    expect(await savedCount()).toBe(0);
  });

  it.each(["corrupt", "malformed", "unreadable"])(
    "should warn once and restore no sessions from a %s file",
    async (problem) => {
      const cookie = await signIn(running());
      const saved = await readFile(stateFile, "utf8");
      if (problem === "corrupt") await writeFile(stateFile, "{broken JSON");
      if (problem === "malformed") {
        await writeFile(stateFile, JSON.stringify({ ...JSON.parse(saved), malformed: {} }));
      }
      if (problem === "unreadable") await chmod(stateFile, 0o000);
      const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const restored = await restart();
        expect(warning).toHaveBeenCalledTimes(1);
        const message = String(warning.mock.calls[0]?.[0]);
        expect(message.includes("browser-sessions.json") && !message.includes("\n")).toBe(true);
        expect(await status(restored, cookie)).toBe(401);
      } finally {
        warning.mockRestore();
      }
    },
  );

  it("should replace the file at most once a minute for session activity", async () => {
    const cookie = await signIn(running());
    // An atomic replacement changes the inode, even if the file size and mtime match.
    let inode = (await stat(stateFile)).ino;
    let writes = 0;
    for (const seconds of [10, 20, 59, 60, 61, 119, 120]) {
      now = Date.parse("2026-11-09T12:00:00.000Z") + seconds * 1000;
      expect(await status(running(), cookie)).toBe(200);
      const next = (await stat(stateFile)).ino;
      if (next !== inode) writes++;
      inode = next;
      expect(writes).toBe(Math.floor(seconds / 60));
    }
    now += SESSION_IDLE_MS - 1;
    expect(await status(await restart(), cookie)).toBe(200);
  });
});
