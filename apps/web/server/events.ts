import type { ServerResponse } from "node:http";
import type { AuthLayer } from "./auth.ts";

/** The browser's one Server-Sent Events stream; the change feed (Phase W3) writes into it. */
export const EVENTS_PATH = "/api/events";

/** How often an open stream re-checks its session and sends a keep-alive comment. */
export const HEARTBEAT_MS = 15_000;

export interface StreamOptions {
  auth: AuthLayer;
  /** The session the stream was opened with: it ends when that session ends. */
  sessionId: string;
  heartbeatMs: number;
  /** Every open stream's end, so a server stop can end them all. */
  open: Set<() => void>;
}

/**
 * Serves one SSE stream to a signed-in browser. It ends the moment its session is logged out or
 * revoked, and at the next heartbeat after the session expires or the secret is rotated, so a
 * stream never outlives the cookie that opened it. Resolves when the stream has ended.
 */
export function openEvents(response: ServerResponse, options: StreamOptions): Promise<void> {
  return new Promise((resolve) => {
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      unsubscribe();
      options.open.delete(end);
      response.end();
      resolve();
    };
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    response.write("event: ready\ndata: {}\n\n");
    const timer = setInterval(() => {
      void options.auth.stillValid(options.sessionId).then((valid) => {
        if (!valid) end();
        else if (!ended) response.write(": heartbeat\n\n");
      });
    }, options.heartbeatMs);
    const unsubscribe = options.auth.onEnd(options.sessionId, end);
    options.open.add(end);
    response.on("close", end);
  });
}
