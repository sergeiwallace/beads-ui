import type { ServerResponse } from "node:http";

/**
 * The Trusted Types policies the client may create: `default`, the client's own policy
 * (client/trusted-types.ts), which passes HTML through DOMPurify and refuses every script and
 * script URL, and `dompurify`, the policy DOMPurify makes for its own parsing.
 */
export const TRUSTED_TYPES_POLICIES = ["default", "dompurify"] as const;

/**
 * The Content Security Policy every response carries (web app design T-W1.7): scripts only from
 * the server's own origin, so no inline script, eval or remote script runs; Trusted Types
 * required for every script-capable DOM sink. Inline styles stay allowed: React and the Roadmap's
 * chart set element styles, and a style cannot run script.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  // 'self', not 'none': the shell carries `<base href="/beads/">` when the app is mounted under a
  // base path (portal.ts), and the browser drops a <base> the policy refuses. app-portal's member
  // helper sends `base-uri 'self'` too.
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  `trusted-types ${TRUSTED_TYPES_POLICIES.join(" ")}`,
].join("; ");

/** Sets the policy on `response` before any handler writes its head, which keeps it. */
export function applyContentSecurityPolicy(response: ServerResponse): void {
  response.setHeader("content-security-policy", CONTENT_SECURITY_POLICY);
}
