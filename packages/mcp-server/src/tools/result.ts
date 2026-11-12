import { errorMessage, type WebReply } from "../web.ts";

/** A tool's answer: always text, so a host with no app capability reads every result. */
export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export const textResult = (text: string, structured?: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text }],
  ...(structured === undefined ? {} : { structuredContent: structured }),
});

export const errorResult = (text: string): ToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

/** The error result for a reply that did not succeed, naming what the web server said. */
export const refusal = (what: string, reply: WebReply): ToolResult =>
  errorResult(`${what}: ${errorMessage(reply)}`);

export const ok = (reply: WebReply): boolean => reply.status >= 200 && reply.status < 300;

/** The `?store=` query naming one open store, or none. */
export const storeQuery = (store: string | undefined): string =>
  store === undefined || store === "" ? "" : `?store=${encodeURIComponent(store)}`;
