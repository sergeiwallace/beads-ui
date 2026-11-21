import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminKey } from "../server/auth.ts";
import { type RunningServer, startServer } from "../server/server.ts";
import {
  exchange,
  type HostEnv,
  hostConfig,
  hostEnv,
  runCli,
  send,
  sessionCookie,
  signIn,
} from "./auth-env.ts";

// T-1.8 (frontend test harness design): a scripted run signs in with a run-unique label that the
// session keeps, and signs out by that label alone, so it never ends a session someone else holds.

describe("labelled browser sessions", () => {
  let env: HostEnv;
  let server: RunningServer | undefined;

  const start = (port: number) =>
    startServer({
      repoRoot: env.configHome,
      clientDir: env.configHome,
      configEnv: env.configEnv,
      port,
    });

  function running(): RunningServer {
    if (server === undefined) throw new Error("server did not start");
    return server;
  }

  const port = () => ["--port", String(running().port)];

  /** Mints a labelled link with the host command and opens it; returns the session cookie. */
  async function labelled(label: string): Promise<string> {
    const printed = await runCli(env, env.configHome, ["login-link", "--label", label, ...port()]);
    expect(printed.code, printed.stderr).toBe(0);
    const path = new URL(printed.stdout.trim()).pathname + new URL(printed.stdout.trim()).search;
    const cookie = sessionCookie(await exchange(running(), path));
    if (cookie === undefined) throw new Error("the labelled link set no cookie");
    return cookie;
  }

  const status = async (cookie: string) =>
    (await send(running(), "/api/health", { headers: { cookie } })).status;

  beforeEach(async () => {
    env = await hostEnv(hostConfig({}));
    server = await start(0);
    return async () => env.remove();
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("should keep the label a link was minted with on its session, print it in sessions and return it from the admin session list", async () => {
    await labelled("fth-live-smoke-7q2k");
    const listed = await runCli(env, env.configHome, ["sessions", ...port()]);
    expect(listed.code).toBe(0);
    expect(listed.stdout).toMatch(/^[0-9a-f]{12} {2}signed in .* label fth-live-smoke-7q2k$/m);
    const secret = (await readFile(join(env.stateDir, "browser-secret"), "utf8")).trim();
    const reply = await send(running(), "/api/admin/v1/sessions", {
      headers: { authorization: `Bearer ${adminKey(secret)}` },
    });
    const { sessions } = reply.json() as { sessions: { label?: string | null }[] };
    expect(sessions.map((session) => session.label)).toEqual(["fth-live-smoke-7q2k"]);

    // The label survives a restart with the session it belongs to.
    const { port: same } = running();
    await running().close();
    server = await start(same);
    const after = await runCli(env, env.configHome, ["sessions", ...port()]);
    expect(after.stdout).toContain("label fth-live-smoke-7q2k");
  });

  it("should end every session carrying exactly the label and no other, and print how many it ended", async () => {
    const first = await labelled("fth-run-a");
    const second = await labelled("fth-run-a");
    const longer = await labelled("fth-run-a.2");
    const unlabelled = await signIn(running());
    const revoked = await runCli(env, env.configHome, [
      "revoke-session",
      "--label",
      "fth-run-a",
      ...port(),
    ]);
    expect(revoked.code, revoked.stderr).toBe(0);
    expect(revoked.stdout.trim()).toBe("ended 2 sessions labelled fth-run-a");
    expect(await status(first)).toBe(401);
    expect(await status(second)).toBe(401);
    expect(await status(longer)).toBe(200);
    expect(await status(unlabelled)).toBe(200);
  });

  it("should exit non-zero saying so when no session carries the label", async () => {
    const kept = await labelled("fth-run-b");
    const revoked = await runCli(env, env.configHome, [
      "revoke-session",
      "--label",
      "fth-run-none",
      ...port(),
    ]);
    expect(revoked.code).not.toBe(0);
    expect(revoked.stderr).toContain("no session carries the label fth-run-none");
    expect(await status(kept)).toBe(200);
  });

  it.each([
    ["empty", ""],
    ["longer than 64 characters", "x".repeat(65)],
    ["holding a space", "fth run"],
    ["holding a slash", "fth/run"],
  ])("should refuse a label %s in login-link and mint no link", async (_case, label) => {
    const printed = await runCli(env, env.configHome, ["login-link", "--label", label, ...port()]);
    expect(printed.code).not.toBe(0);
    expect(printed.stdout).toBe("");
    expect(printed.stderr).toContain("--label takes 1 to 64 of A-Z, a-z, 0-9, '.', '_' and '-'");
  });

  it("should accept a 64-character label", async () => {
    await labelled("a".repeat(64));
    const listed = await runCli(env, env.configHome, ["sessions", ...port()]);
    expect(listed.stdout).toContain(`label ${"a".repeat(64)}`);
  });
});
