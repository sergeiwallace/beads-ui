// The web server's `/api/mcp/v1/` routes, called with the MCP token (web app design D-17). Every
// failure comes back as a reply the tool can answer with: an unreachable server is a reply too.

import { connection, type McpEnv, NotConfigured } from "./config.ts";

export const MCP_API = "api/mcp/v1/";
/** How long one call to the web server may take. */
export const REQUEST_TIMEOUT_MS = 30_000;

export interface WebReply {
  status: number;
  body: unknown;
}

export interface WebClient {
  get(path: string): Promise<WebReply>;
  post(path: string, body: Record<string, unknown>): Promise<WebReply>;
  /** A dispatch request: `body` naming, as `user`, the user this host is configured for. */
  postAsUser(path: string, body: Record<string, unknown>): Promise<WebReply>;
}

/** The message of an `{ error: { message } }` reply, or a line naming the status. */
export function errorMessage(reply: WebReply): string {
  const error = (reply.body as { error?: { message?: unknown } } | undefined)?.error;
  return typeof error?.message === "string" && error.message !== ""
    ? error.message
    : `the web server answered ${reply.status}`;
}

const failed = (message: string): WebReply => ({ status: 0, body: { error: { message } } });

export function webClient(env: McpEnv): WebClient {
  async function call(
    method: "GET" | "POST",
    path: string,
    payload?: Record<string, unknown>,
    asUser = false,
  ): Promise<WebReply> {
    let target: Awaited<ReturnType<typeof connection>>;
    try {
      target = await connection(env);
    } catch (error) {
      if (error instanceof NotConfigured) return failed(error.message);
      throw error;
    }
    const body = payload === undefined || !asUser ? payload : { ...payload, user: target.user };
    const base = target.url.endsWith("/") ? target.url : `${target.url}/`;
    let response: Response;
    try {
      response = await fetch(new URL(`${MCP_API}${path}`, base), {
        method,
        headers: {
          authorization: `Bearer ${target.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      return failed(
        `the beads-ui web server at ${base} cannot be reached (${code ?? (error as Error).message})`,
      );
    }
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // A body that is not JSON is passed on as its text.
    }
    return { status: response.status, body: parsed };
  }
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    postAsUser: (path, body) => call("POST", path, body, true),
  };
}
