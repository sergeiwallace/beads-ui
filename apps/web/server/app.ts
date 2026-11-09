import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { type ApiContext, failure, matchRoute, ROUTES, type Route } from "./routes.ts";
import { serveClient } from "./static.ts";

/** The most a request body may hold; every API body is a few fields of JSON. */
export const MAX_BODY_BYTES = 64 * 1024;

export interface AppOptions {
  context: ApiContext;
  /** The built client (`dist/client`); every path outside `/api/` is served from it. */
  clientDir: string;
  routes?: readonly Route[];
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text),
  });
  response.end(text);
}

class BodyError {
  readonly status: number;
  readonly message: string;
  constructor(status: number, message: string) {
    this.status = status;
    this.message = message;
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const type = request.headers["content-type"] ?? "";
  if (!type.startsWith("application/json")) {
    throw new BodyError(415, "a write takes a JSON body (content-type: application/json)");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES)
      throw new BodyError(413, `a body holds at most ${MAX_BODY_BYTES} bytes`);
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BodyError(400, "the body is not JSON");
  }
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  options: AppOptions,
): Promise<void> {
  const match = matchRoute(request.method ?? "GET", pathname, options.routes ?? ROUTES);
  if (match === undefined) {
    const reply = failure({
      kind: "unknown-route",
      message: `no API route ${request.method} ${pathname}`,
    });
    sendJson(response, reply.status, reply.body);
    return;
  }
  let body: unknown;
  if (match.route.method === "POST") {
    try {
      body = await readJson(request);
    } catch (error) {
      if (!(error instanceof BodyError)) throw error;
      sendJson(response, error.status, { error: { kind: "invalid", message: error.message } });
      return;
    }
  }
  const reply = await match.route.handle({ params: match.params, body }, options.context);
  sendJson(response, reply.status, reply.body);
}

/**
 * The server's one request handler: every `/api/` path goes to the route table and nothing else,
 * every other GET to the built client. A later layer (authentication, a Host allowlist, a base
 * path) wraps this handler and so stands in front of every route.
 */
export function createApp(options: AppOptions): RequestListener {
  return (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    const work = isApi
      ? handleApi(request, response, url.pathname, options)
      : serveClient(request, response, url.pathname, options.clientDir);
    work.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendJson(response, 500, { error: { kind: "failed", source: "server", message } });
    });
  };
}
