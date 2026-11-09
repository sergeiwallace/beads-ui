import ReactMarkdown, { type Components } from "react-markdown";

/** The only URL schemes a rendered link keeps (web app design T-W1.7). */
export const LINK_SCHEMES = ["http:", "https:", "mailto:"] as const;

/**
 * The href a Markdown link keeps: an http, https or mailto URL as written, or a link to a heading
 * on the same page (`#d-3`), which names no scheme. Every other URL, a relative path or any other
 * scheme (`javascript:`, `data:`, `vbscript:`) included, is stripped, so its link is inert text.
 */
export function safeHref(url: string): string | undefined {
  const value = url.trim();
  if (/^#[\w.:-]*$/.test(value)) return value;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return undefined;
  }
  return (LINK_SCHEMES as readonly string[]).includes(parsed.protocol.toLowerCase())
    ? value
    : undefined;
}

const COMPONENTS: Components = {
  a: ({ href, children }) =>
    href === undefined || href === "" ? (
      <span className="bu-md-inert-link">{children}</span>
    ) : (
      <a
        href={href}
        {...(href.startsWith("#") ? {} : { target: "_blank", rel: "noopener noreferrer nofollow" })}
      >
        {children}
      </a>
    ),
  // An image would fetch from wherever its source points; its alt text stands in for it.
  img: ({ alt }) => (alt === undefined || alt === "" ? null : <span>{alt}</span>),
};

export interface MarkdownProps {
  /** A task's or held item's Markdown, as the store holds it. */
  text: string;
  className?: string;
}

/**
 * Markdown drawn as React elements, never as HTML: raw HTML in the source is dropped (so a
 * `<script>` or an `onerror` attribute never reaches the page), and a link keeps its href only
 * for http, https, mailto or a same-page heading.
 */
export function Markdown({ text, className }: MarkdownProps) {
  return (
    <div className={className === undefined ? "bu-markdown" : `bu-markdown ${className}`}>
      <ReactMarkdown skipHtml urlTransform={(url) => safeHref(url) ?? ""} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
