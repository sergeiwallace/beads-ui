import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ConfigEnv } from "../server/config.ts";
import type { RunningServer } from "../server/server.ts";

const exec = promisify(execFile);

export const BIN = fileURLToPath(new URL("../bin/beads-ui-web.mjs", import.meta.url));

/** The `[auth]` table every suite starts from; a test overrides or drops (undefined) one key. */
export const AUTH_DEFAULTS: Readonly<Record<string, string | string[]>> = {
  hosts: ["127.0.0.1", "localhost"],
  origins: ["http://127.0.0.1:4810"],
  dispatch_identities: ["owner@example.com"],
  browser_secret: "state:browser-secret",
  receiver_token: "state:receiver-tokens.json",
  mcp_token: "state:mcp-token",
  configured_user: "owner",
  signing_key: "secret-store:dispatch-signing-key",
  signing_key_id: "host-a-20261109",
  trusted_keys: "state:trusted-dispatch-keys.json",
};

const tomlValue = (value: string | string[]) =>
  Array.isArray(value)
    ? `[${value.map((item) => JSON.stringify(item)).join(", ")}]`
    : JSON.stringify(value);

/** A user `beads-ui.toml` with `[hosts] allow_repos` and the `[auth]` table, overrides applied. */
export function hostConfig(options: {
  allowRepos?: string[] | undefined;
  auth?: Record<string, string | string[] | undefined>;
  extra?: string;
}): string {
  const auth = { ...AUTH_DEFAULTS, ...options.auth };
  const lines: string[] = [];
  if (options.allowRepos !== undefined) {
    lines.push("[hosts]", `allow_repos = ${tomlValue(options.allowRepos)}`, "");
  }
  lines.push("[auth]");
  for (const [key, value] of Object.entries(auth)) {
    if (value !== undefined) lines.push(`${key} = ${tomlValue(value)}`);
  }
  if (options.extra !== undefined) lines.push("", options.extra);
  return `${lines.join("\n")}\n`;
}

/** A private config home and state home, so a suite never reads the user's own settings. */
export interface HostEnv {
  configHome: string;
  stateHome: string;
  configEnv: ConfigEnv;
  /** The server's state directory, where its credentials are generated. */
  stateDir: string;
  /** The user's beads-ui.toml. */
  configFile: string;
  write(text: string): Promise<void>;
  /** The variables a child process (the CLI, the served command) runs with. */
  processEnv(): NodeJS.ProcessEnv;
  remove(): Promise<void>;
}

export async function hostEnv(text?: string): Promise<HostEnv> {
  const root = await mkdtemp(join(tmpdir(), "beads-ui-web-host-"));
  const configHome = join(root, "config");
  const stateHome = join(root, "state");
  await mkdir(join(configHome, "beads-ui"), { recursive: true });
  const configFile = join(configHome, "beads-ui", "beads-ui.toml");
  const env: HostEnv = {
    configHome,
    stateHome,
    configEnv: { xdgConfigHome: configHome, xdgStateHome: stateHome },
    stateDir: join(stateHome, "beads-ui", "web"),
    configFile,
    write: (content) => writeFile(configFile, content),
    processEnv: () => ({ ...process.env, XDG_CONFIG_HOME: configHome, XDG_STATE_HOME: stateHome }),
    remove: () => rm(root, { recursive: true }),
  };
  if (text !== undefined) await env.write(text);
  return env;
}

/** The repository name the allowlist knows a store directory outside git by. */
export const repoName = (dir: string) => basename(dir);

export interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
  json(): unknown;
}

/**
 * One HTTP request with every header as given, Host included, so a test can send what a browser
 * would not (a forged Host, identity headers) and what it would (Sec-Fetch-Site, Origin).
 */
export function send(
  server: RunningServer,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const call = httpRequest(
      {
        host: "127.0.0.1",
        port: server.port,
        path,
        method: options.method ?? "GET",
        headers: { host: `127.0.0.1:${server.port}`, ...options.headers },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text,
            json: () => JSON.parse(text),
          }),
        );
      },
    );
    call.on("error", reject);
    call.end(options.body);
  });
}

/** The headers a same-origin page's write carries. */
export const SAME_ORIGIN_WRITE = {
  "content-type": "application/json",
  "x-beads-ui": "1",
  "sec-fetch-site": "same-origin",
};

/** The `name=value` of a reply's session cookie, from its Set-Cookie. */
export function sessionCookie(reply: Reply): string | undefined {
  const raw = reply.headers["set-cookie"];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first?.split(";")[0];
}

/** Exchanges `path` (a sign-in link's path) and returns the session cookie it sets. */
export async function exchange(server: RunningServer, path: string): Promise<Reply> {
  return send(server, path, { headers: { "sec-fetch-site": "none" } });
}

/** Signs in through a code the server mints, and returns the `Cookie` header value. */
export async function signIn(server: RunningServer): Promise<string> {
  const reply = await exchange(server, server.auth.mintCode().path);
  const cookie = sessionCookie(reply);
  if (reply.status !== 303 || cookie === undefined) {
    throw new Error(`sign-in failed: ${reply.status} ${reply.text}`);
  }
  return cookie;
}

/** Runs the beads-ui-web command with `args` in `cwd` and the host env; never throws on exit. */
export async function runCli(
  env: HostEnv,
  cwd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec(process.execPath, [BIN, ...args], {
      cwd,
      env: env.processEnv(),
      encoding: "utf8",
      timeout: 60_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failed.code === "number" ? failed.code : -1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}
