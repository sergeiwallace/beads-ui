import DOMPurify from "dompurify";

// The server's Content Security Policy requires Trusted Types for every script-capable DOM sink
// (server/csp.ts). The app's own code writes no HTML; the Roadmap's chart library sets innerHTML
// on its own elements, so the default policy passes HTML through DOMPurify and refuses every
// script and script URL outright. This module is imported first, before anything can reach a sink.

interface TrustedTypePolicyFactory {
  createPolicy(
    name: string,
    rules: {
      createHTML?: (input: string) => string;
      createScript?: (input: string) => string | null;
      createScriptURL?: (input: string) => string | null;
    },
  ): unknown;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * The SVG-only elements the chart writes as an SVG element's innerHTML. DOMPurify parses a string
 * as HTML unless told otherwise, and as HTML these are unknown elements it drops, which emptied
 * the chart's grid; a fragment that starts with one is sanitized in the SVG namespace instead.
 */
const SVG_FIRST =
  /^\s*<(g|rect|line|path|text|tspan|circle|polygon|polyline|defs|pattern|clipPath|use|marker)[\s/>]/i;

export function sanitizeHtml(input: string): string {
  return SVG_FIRST.test(input)
    ? DOMPurify.sanitize(input, { NAMESPACE: SVG_NAMESPACE })
    : DOMPurify.sanitize(input);
}

const factory = (globalThis as { trustedTypes?: TrustedTypePolicyFactory }).trustedTypes;

if (factory !== undefined) {
  factory.createPolicy("default", {
    createHTML: sanitizeHtml,
    // Returning null makes the sink throw, so no string ever becomes a script.
    createScript: () => null,
    createScriptURL: () => null,
  });
}
