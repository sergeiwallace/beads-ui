import { Children, isValidElement, type ReactNode, useMemo } from "react";
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

/**
 * The only ids a heading may take from the document: lowercase words joined by single hyphens.
 * An id from content could otherwise name a DOM global (`__proto__`) or break out of its
 * attribute; `decision-d-3` and a heading's slug both fit.
 */
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A held document's explicit heading anchor, on its own line: `<a id="decision-d-3"></a>`. */
const EXPLICIT_ANCHOR = /^<a id="([^"]*)"><\/a>$/;
const HEADING_LINE = /^#{1,6}\s+(.+?)\s*#*$/;
const FENCE = /^(```|~~~)/;

/** A heading's text with its inline Markdown dropped, as the rendered heading reads. */
function plainHeading(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

/**
 * A heading's anchor: GitHub's rule, the one the held tool uses (lowercase, punctuation dropped,
 * spaces hyphens), then any run that is not a letter or digit made one hyphen, so it is always a
 * SAFE_ID. A heading with no letter or digit gets `section`.
 */
export function headingSlug(text: string): string {
  const github = text
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .replace(/ /g, "-");
  const safe = github.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return safe === "" ? "section" : safe;
}

/**
 * Each ATX heading's id, by its 1-based source line: the explicit `<a id>` on the line before it
 * when that id is a SAFE_ID, else its slug, a repeat taking `-1`, `-2`. Raw HTML is never
 * rendered, so the anchor line itself is dropped and its id moves to the heading, which keeps a
 * link to `#decision-d-3` (an option card's) landing on its decision.
 */
function headingIds(text: string): Map<number, string> {
  const ids = new Map<number, string>();
  const used = new Map<string, number>();
  let fenced = false;
  let previous = "";
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.trim();
    if (FENCE.test(line)) fenced = !fenced;
    const heading = fenced ? null : HEADING_LINE.exec(line);
    if (heading?.[1] !== undefined) {
      const explicit = EXPLICIT_ANCHOR.exec(previous)?.[1];
      const base =
        explicit !== undefined && SAFE_ID.test(explicit)
          ? explicit
          : headingSlug(plainHeading(heading[1]));
      const seen = used.get(base) ?? 0;
      used.set(base, seen + 1);
      ids.set(index + 1, seen === 0 ? base : `${base}-${seen}`);
    }
    if (line !== "") previous = line;
  }
  return ids;
}

/** The text a rendered heading's children read as. */
function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? textOf(child.props.children)
          : "",
    )
    .join("");
}

const LINKS: Components = {
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

type HeadingProps = {
  children?: ReactNode;
  node?: { position?: { start: { line: number } } | undefined } | undefined;
};

function components(ids: ReadonlyMap<number, string>): Components {
  const heading =
    (Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") =>
    ({ children, node }: HeadingProps) => {
      const line = node?.position?.start.line;
      const id = (line === undefined ? undefined : ids.get(line)) ?? headingSlug(textOf(children));
      return <Tag id={id}>{children}</Tag>;
    };
  return {
    ...LINKS,
    h1: heading("h1"),
    h2: heading("h2"),
    h3: heading("h3"),
    h4: heading("h4"),
    h5: heading("h5"),
    h6: heading("h6"),
  };
}

export interface MarkdownProps {
  /** A task's or held item's Markdown, as the store holds it. */
  text: string;
  className?: string;
}

/**
 * Markdown drawn as React elements, never as HTML: raw HTML in the source is dropped (so a
 * `<script>` or an `onerror` attribute never reaches the page), and a link keeps its href only
 * for http, https, mailto or a same-page heading. Each heading carries an id (headingIds), so a
 * same-page link lands on it.
 */
export function Markdown({ text, className }: MarkdownProps) {
  const rendered = useMemo(() => components(headingIds(text)), [text]);
  return (
    <div className={className === undefined ? "bu-markdown" : `bu-markdown ${className}`}>
      <ReactMarkdown skipHtml urlTransform={(url) => safeHref(url) ?? ""} components={rendered}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
