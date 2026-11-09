import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { parseArgs } from "node:util";
import {
  AuthRefused,
  type AuthSettings,
  adminKey,
  loadAuth,
  parseReceiverMap,
  replaceCredential,
  rotatedSecret,
  sha256Hex,
} from "./auth.ts";
import { type ConfigEnv, DEFAULT_PORT, readWebConfig } from "./config.ts";

// The host's own commands: each runs on the server's host, as its user, and proves it by
// reading the browser secret from the state directory.

export const ADMIN_COMMANDS = [
  "login-link",
  "sessions",
  "revoke-session",
  "rotate-secret",
  "issue-receiver-token",
] as const;
export type AdminCommand = (typeof ADMIN_COMMANDS)[number];

export const isAdminCommand = (name: string | undefined): name is AdminCommand =>
  (ADMIN_COMMANDS as readonly string[]).includes(name ?? "");

export const ADMIN_USAGE = `       beads-ui-web login-link [--port <n>] [--origin <url>]
       beads-ui-web sessions [--port <n>]
       beads-ui-web revoke-session <id> [--port <n>]
       beads-ui-web rotate-secret
       beads-ui-web issue-receiver-token <host>

  login-link            print a sign-in link for the running server; it works once, for five minutes
  sessions              list the running server's browser sessions
  revoke-session <id>   end one browser session, by the id sessions lists
  rotate-secret         replace the browser secret, which ends every browser session
  issue-receiver-token  issue <host>'s receiver token, printed once; it replaces any earlier one`;

const HOST_NAME = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;

class CommandFailed extends Error {}

/** The address the server listens on, as this host reaches it. */
function serverAddress(host: string | undefined): string {
  return host === undefined || host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}

/** Calls one of the running server's admin routes over loopback with the host's admin key. */
async function callServer(
  settings: AuthSettings,
  address: string,
  port: number,
  method: "GET" | "POST",
  path: string,
): Promise<{ status: number; body: string }> {
  const secret = await readFile(settings.browserSecret, "utf8");
  const first = settings.hosts[0] ?? "127.0.0.1";
  const hostHeader = /:\d+$/.test(first) && !first.endsWith("]") ? first : `${first}:${port}`;
  return new Promise((resolve, reject) => {
    const call = httpRequest(
      {
        host: address,
        port,
        method,
        path,
        headers: { host: hostHeader, authorization: `Bearer ${adminKey(secret)}` },
        timeout: 10_000,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
      },
    );
    call.on("timeout", () => call.destroy(new Error("no answer within 10 seconds")));
    call.on("error", (error) =>
      reject(
        new CommandFailed(
          `cannot reach the beads-ui server at ${address}:${port}: ${error.message}; is it running, and on this port (--port)?`,
        ),
      ),
    );
    call.end();
  });
}

function refusal(reply: { status: number; body: string }): CommandFailed {
  let message = `the server answered ${reply.status}`;
  try {
    const parsed = JSON.parse(reply.body) as { error?: { message?: string } };
    if (parsed.error?.message !== undefined) message += `: ${parsed.error.message}`;
  } catch {
    // The status alone says it.
  }
  return new CommandFailed(message);
}

/** Runs one host command; prints its result on stdout and anything wrong on stderr. */
export async function adminMain(
  command: AdminCommand,
  argv: readonly string[],
  env: ConfigEnv,
  cwd: string,
): Promise<number> {
  let values: { port?: string | undefined; origin?: string | undefined };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      options: { port: { type: "string" }, origin: { type: "string" } },
      allowPositionals: true,
    }));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\nusage: ${ADMIN_USAGE.trimStart()}\n`);
    return 2;
  }
  try {
    const settings = await loadAuth(env);
    const config = await readWebConfig(cwd, env);
    const port = values.port === undefined ? (config.port ?? DEFAULT_PORT) : Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new CommandFailed(`--port takes a whole number from 1 to 65535, not ${values.port}`);
    }
    const address = serverAddress(config.host);
    switch (command) {
      case "login-link": {
        const origin = values.origin ?? settings.origins[0] ?? `http://127.0.0.1:${port}`;
        const reply = await callServer(
          settings,
          address,
          port,
          "POST",
          "/api/admin/v1/login-codes",
        );
        if (reply.status !== 200) throw refusal(reply);
        const { path, expiresAt } = JSON.parse(reply.body) as { path: string; expiresAt: string };
        process.stdout.write(`${origin.replace(/\/+$/, "")}${path}\n`);
        process.stderr.write(`beads-ui web: the link works once, until ${expiresAt}\n`);
        return 0;
      }
      case "sessions": {
        const reply = await callServer(settings, address, port, "GET", "/api/admin/v1/sessions");
        if (reply.status !== 200) throw refusal(reply);
        const { sessions } = JSON.parse(reply.body) as {
          sessions: { id: string; createdAt: string; seenAt: string; identity: string | null }[];
        };
        if (sessions.length === 0) process.stdout.write("no browser sessions\n");
        for (const session of sessions) {
          const identity = session.identity === null ? "" : `  ${session.identity}`;
          process.stdout.write(
            `${session.id}  signed in ${session.createdAt}  last seen ${session.seenAt}${identity}\n`,
          );
        }
        return 0;
      }
      case "revoke-session": {
        const id = positionals[0];
        if (id === undefined) throw new CommandFailed("revoke-session takes the session's id");
        const reply = await callServer(
          settings,
          address,
          port,
          "POST",
          `/api/admin/v1/sessions/${encodeURIComponent(id)}/revoke`,
        );
        if (reply.status !== 204) throw refusal(reply);
        process.stdout.write(`ended session ${id}\n`);
        return 0;
      }
      case "rotate-secret": {
        await replaceCredential(settings.browserSecret, rotatedSecret());
        process.stdout.write("rotated [auth] browser_secret: every browser session has ended\n");
        return 0;
      }
      case "issue-receiver-token": {
        const host = positionals[0];
        if (host === undefined || !HOST_NAME.test(host)) {
          throw new CommandFailed("issue-receiver-token takes the receiving host's name");
        }
        const map = parseReceiverMap(await readFile(settings.receiverToken, "utf8"));
        if (map === undefined) {
          throw new CommandFailed(`[auth] receiver_token: ${settings.receiverToken} is malformed`);
        }
        const token = randomBytes(32).toString("base64url");
        map.tokens[host] = sha256Hex(token);
        await replaceCredential(settings.receiverToken, `${JSON.stringify(map, null, 2)}\n`);
        process.stdout.write(`${token}\n`);
        process.stderr.write(
          `beads-ui web: ${host}'s receiver token, shown once; it replaces any earlier one for ${host}\n`,
        );
        return 0;
      }
    }
  } catch (error) {
    if (error instanceof AuthRefused || error instanceof CommandFailed) {
      process.stderr.write(`beads-ui web: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
