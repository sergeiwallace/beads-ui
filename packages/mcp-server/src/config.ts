// Where the MCP server finds the web server and its own credential (web app design D-17, Phase
// W4). Read again on every call, so an edit to `beads-ui.toml` or a rotated token applies to the
// next tool call. The server holds no signing key: it reads only the MCP token and the
// configured user, and the web server signs every dispatch.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseToml, stateDirOf, type TomlValue, userConfigPath } from "@beads-ui/core";

/** The web server's own default address (apps/web, `[web] port`). */
export const DEFAULT_URL = "http://127.0.0.1:4810/";

export interface McpEnv {
  /** BEADS_UI_URL: the web server's base URL, its base path included. */
  url?: string | undefined;
  /** BEADS_UI_MCP_TOKEN_FILE: the file holding the MCP token, in place of `[auth] mcp_token`. */
  tokenFile?: string | undefined;
  /** BEADS_UI_USER: the user to name, in place of `[auth] configured_user`. */
  user?: string | undefined;
  xdgConfigHome?: string | undefined;
  xdgStateHome?: string | undefined;
  home?: string | undefined;
}

export const envFromProcess = (env: NodeJS.ProcessEnv = process.env): McpEnv => ({
  url: env.BEADS_UI_URL,
  tokenFile: env.BEADS_UI_MCP_TOKEN_FILE,
  user: env.BEADS_UI_USER,
  xdgConfigHome: env.XDG_CONFIG_HOME,
  xdgStateHome: env.XDG_STATE_HOME,
  home: env.HOME,
});

export interface Connection {
  url: string;
  token: string;
  user: string;
}

/** Why the server cannot reach the web server; the tool answers with it as text. */
export class NotConfigured extends Error {}

const STATE_REF = /^state:([A-Za-z0-9][A-Za-z0-9._-]*)$/;
const nonEmpty = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

async function authTable(env: McpEnv): Promise<Record<string, TomlValue> | undefined> {
  const path = userConfigPath(env);
  if (path === undefined) return undefined;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  const parsed = parseToml(text);
  if (!parsed.ok) throw new NotConfigured(`${path} line ${parsed.error.line} cannot be read`);
  const auth = parsed.value.auth;
  return typeof auth === "object" && auth !== null && !Array.isArray(auth) ? auth : undefined;
}

/** The web server's URL, the MCP token and the user every request names, read now. */
export async function connection(env: McpEnv): Promise<Connection> {
  const url = nonEmpty(env.url) ? env.url.trim() : DEFAULT_URL;
  const auth = nonEmpty(env.tokenFile) && nonEmpty(env.user) ? undefined : await authTable(env);
  let tokenFile = nonEmpty(env.tokenFile) ? env.tokenFile : undefined;
  if (tokenFile === undefined) {
    const ref =
      typeof auth?.mcp_token === "string" ? STATE_REF.exec(auth.mcp_token)?.[1] : undefined;
    const dir = stateDirOf(env);
    if (ref === undefined || dir === undefined) {
      throw new NotConfigured(
        "no MCP token: set [auth] mcp_token in your beads-ui.toml, or BEADS_UI_MCP_TOKEN_FILE",
      );
    }
    tokenFile = join(dir, "web", ref);
  }
  let token: string;
  try {
    token = (await readFile(tokenFile, "utf8")).trim();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? String(error);
    throw new NotConfigured(
      `the MCP token file cannot be read (${code}); start the web server once to create it`,
    );
  }
  const user = nonEmpty(env.user)
    ? env.user.trim()
    : typeof auth?.configured_user === "string"
      ? auth.configured_user
      : undefined;
  if (!nonEmpty(user)) {
    throw new NotConfigured(
      "no user: set [auth] configured_user in your beads-ui.toml, or BEADS_UI_USER",
    );
  }
  return { url, token, user };
}
