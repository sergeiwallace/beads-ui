import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { StoreClosed } from "./allowlist.ts";
import { type AuthLayer, type Caller, routeClass } from "./auth.ts";
import { EVENTS_PATH, HEARTBEAT_MS, openEvents } from "./events.ts";
import { type ApiContext, failure, matchRoute, ROUTES, type Route } from "./routes.ts";
import { serveClient } from "./static.ts";

/** The most a request body may hold; every API body is a few fields of JSON. */
export const MAX_BODY_BYTES = 64 * 1024;

export interface AppOptions {
  context: ApiContext;
  /** The authentication layer: every request passes it before any route or file. */
  auth: AuthLayer;
  /** The built client (`dist/client`); every path outside `/api/` is served from it. */
  clientDir: string;
  routes?: readonly Route[];
  /** How often an open event stream re-checks its session; HEARTBEAT_MS unless a test sets it. */
  heartbeatMs?: number;
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

/**
 * A receiver route's only non-success answers (Receiver API): 404 for every refusal, whatever its
 * cause, and a 5xx when the server cannot answer, which the receiving client retries; never a body.
 */
function sendEmpty(response: ServerResponse, status = 404): void {
  response.writeHead(status, { "cache-control": "no-store", "content-length": 0 });
  response.end();
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
  url: URL,
  caller: Caller,
  options: AppOptions,
): Promise<void> {
  const pathname = url.pathname;
  const match = matchRoute(request.method ?? "GET", pathname, options.routes ?? ROUTES);
  if (match === undefined) {
    if (caller.kind === "receiver") {
      sendEmpty(response);
      return;
    }
    const reply = failure({
      kind: "unknown-route",
      message: `no API route ${request.method} ${pathname}`,
    });
    sendJson(response, reply.status, reply.body);
    return;
  }
  if (match.route.dispatch === true) {
    const refusal = options.auth.dispatchRefusal(request, caller);
    if (refusal !== undefined) {
      const reply = failure({
        kind: "forbidden",
        source: "[auth] dispatch_identities",
        message: refusal,
      });
      sendJson(response, reply.status, reply.body);
      return;
    }
  }
  let body: unknown;
  if (match.route.method === "POST") {
    try {
      body = await readJson(request);
    } catch (error) {
      if (!(error instanceof BodyError)) throw error;
      if (caller.kind === "receiver") sendEmpty(response);
      else sendJson(response, error.status, { error: { kind: "invalid", message: error.message } });
      return;
    }
  }
  // A write moves its store's head before the next poll sees it, so no kept read survives it.
  if (match.route.method === "POST") options.context.feed?.forget();
  let reply: Awaited<ReturnType<Route["handle"]>>;
  try {
    reply = await match.route.handle(
      { params: match.params, query: url.searchParams, body, caller },
      options.context,
    );
  } catch (error) {
    if (!(error instanceof StoreClosed)) throw error;
    reply = failure({
      kind: "store-closed",
      source: "[hosts] allow_repos",
      message: error.message,
    });
  }
  // And after it: a board read that ran beside the write may have kept the state before it.
  if (match.route.method === "POST") options.context.feed?.forget();
  if (caller.kind === "receiver" && reply.status >= 400) {
    sendEmpty(response, reply.status >= 500 ? reply.status : 404);
    return;
  }
  if (reply.status === 204) {
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }
  if (typeof reply.body === "string" || reply.body instanceof Uint8Array) {
    const bytes = typeof reply.body === "string" ? Buffer.from(reply.body, "utf8") : reply.body;
    response.writeHead(reply.status, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "content-length": bytes.byteLength,
    });
    response.end(bytes);
    return;
  }
  sendJson(response, reply.status, reply.body);
}

export interface App {
  /** The server's one request handler. */
  handle: RequestListener;
  /**
   * Resolves once no request is being handled. A handler runs on, its bd call with it, after
   * its client has gone, so a stop waits for this as well as for the connections to close.
   */
  settled(): Promise<void>;
  /** Ends every open event stream, so a stop does not wait on them. */
  closeStreams(): void;
}

/**
 * The server's one request handler: the authentication layer first, then every `/api/` path to
 * the route table and nothing else, the event stream, and every other GET to the built client.
 */
export function createApp(options: AppOptions): App {
  const handling = new Set<Promise<void>>();
  const streams = new Set<() => void>();
  const serve = async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const caller = await options.auth.admit(request, response, url);
    if (caller === undefined) return;
    if (url.pathname === EVENTS_PATH && request.method === "GET") {
      const sessionId = options.auth.sessionIdOf(caller);
      if (sessionId === undefined) {
        sendJson(response, 401, { error: { kind: "unauthenticated", message: "not signed in" } });
        return;
      }
      await openEvents(response, {
        auth: options.auth,
        sessionId,
        heartbeatMs: options.heartbeatMs ?? HEARTBEAT_MS,
        open: streams,
        ...(options.context.feed === undefined ? {} : { feed: options.context.feed }),
      });
      return;
    }
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    if (isApi) await handleApi(request, response, url, caller, options);
    else await serveClient(request, response, url.pathname, options.clientDir);
  };
  const handle: RequestListener = (request, response) => {
    const done: Promise<void> = serve(request, response)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (response.headersSent) {
          response.destroy();
          return;
        }
        const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
        if (routeClass(path) === "receiver") sendEmpty(response, 500);
        else sendJson(response, 500, { error: { kind: "failed", source: "server", message } });
      })
      .finally(() => handling.delete(done));
    handling.add(done);
  };
  return {
    handle,
    async settled() {
      while (handling.size > 0) await Promise.allSettled([...handling]);
    },
    closeStreams() {
      for (const end of [...streams]) end();
    },
  };
}
