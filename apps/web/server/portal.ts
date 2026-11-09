import type { ServerResponse } from "node:http";
import type { Allowlist } from "./allowlist.ts";
import type { FeedStatus } from "./heads-feed.ts";
import type { RegistryReading } from "./registry.ts";

// The duties app-portal's member helper (`attach_portal()`) performs for a FastAPI member, done
// here by beads-ui's own Node server (web app design D-15 (a), T-W3.2): the base path, the app
// shell for every other path below it without shadowing /api or /healthz, /healthz, the header
// set, and a manifest with no service worker (the manifest is the client build's).

/**
 * The header set app-portal's member helper sends (`app_portal.portal.SECURITY_HEADERS`) on every
 * response, Content-Security-Policy aside: the CSP module sets that one. A hashed asset sets its
 * own Cache-Control over this one; the shell and the API keep `no-store`.
 */
export const MEMBER_HEADERS: Readonly<Record<string, string>> = {
  "cache-control": "no-store",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
};

/** The member's health route, answered on the upstream, unprefixed, without a session. */
export const HEALTH_PATH = "/healthz";

/** Sets the member header set on a response before anything writes its head. */
export function setMemberHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(MEMBER_HEADERS)) response.setHeader(name, value);
}

/**
 * The path the server routes: a request under the base path (`/beads/x` for `/beads/`) has it
 * removed, and any other request is routed as it came, since `tailscale serve` strips the mount
 * path before proxying (app-portal's architecture, § Re-measured, item 3).
 */
export function mountedPath(pathname: string, basePath: string): string {
  if (basePath === "/") return pathname;
  if (pathname === basePath.slice(0, -1)) return "/";
  return pathname.startsWith(basePath) ? pathname.slice(basePath.length - 1) : pathname;
}

/** The app shell with its base path, so every relative asset and API URL resolves under it. */
export function shellHtml(html: string, basePath: string): string {
  const escaped = basePath.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}<base href="${escaped}" />`);
}

export interface HealthInputs {
  allowlist: Allowlist;
  stores: RegistryReading;
  feed: FeedStatus | undefined;
}

/**
 * Whether the member is healthy: its allowlist reads, at least one store is open, and the change
 * feed's last poll read every head. The answer says only that, never a store or a count.
 */
export function healthy(inputs: HealthInputs): boolean {
  return inputs.allowlist.ok && inputs.stores.open.length > 0 && inputs.feed?.stale === undefined;
}

export function sendHealth(response: ServerResponse, ok: boolean, head: boolean): void {
  const body = JSON.stringify({ status: ok ? "ok" : "unavailable" });
  response.writeHead(ok ? 200 : 503, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(head ? undefined : body);
}
