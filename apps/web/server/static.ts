import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function sendText(response: ServerResponse, status: number, text: string): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(text);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the built client: a file under `clientDir` when the path names one, else `index.html`
 * for any extensionless path, so `/backlog` and `/issues/<id>` load the app. Never a path outside
 * `clientDir`, and never for `/api/`, which app.ts routes first.
 */
export async function serveClient(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  clientDir: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "only GET and HEAD reach the client");
    return;
  }
  const root = resolve(clientDir);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendText(response, 400, "bad path");
    return;
  }
  const target = resolve(join(root, decoded));
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    sendText(response, 404, "not found");
    return;
  }
  let file = target;
  if (!(await isFile(file))) {
    if (extname(decoded) !== "") {
      sendText(response, 404, "not found");
      return;
    }
    file = join(root, "index.html");
    if (!(await isFile(file))) {
      sendText(response, 503, "the web client is not built; run npm run build -w apps/web");
      return;
    }
  }
  const hashed = file.includes(`${sep}assets${sep}`);
  response.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}
