import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Markdown, safeHref } from "../../src/index.ts";

afterEach(cleanup);

const HOSTILE = [
  "# Plan",
  "",
  "<script>window.__pwned = 'script'</script>",
  "",
  '<img src="x" onerror="window.__pwned = \'onerror\'">',
  "",
  '<a href="https://example.com" onclick="window.__pwned = \'onclick\'">raw anchor</a>',
  "",
  "[run me](javascript:window.__pwned='link') and [data](data:text/html,<b>x</b>)",
  "",
  "[vb](vbscript:msgbox) [relative](../etc/passwd) [ok](https://example.com/a) [mail](mailto:a@example.com) [plain](http://example.com) [anchor](#d-3)",
  "",
  "![tracker](https://example.com/pixel.png)",
].join("\n");

function draw(text: string) {
  return render(<Markdown text={text} />).container;
}

describe("Markdown", () => {
  it("should render no raw HTML: script tags, event-handler attributes and raw anchors never reach the page", () => {
    const page = draw(HOSTILE);

    expect(page.querySelector("script")).toBeNull();
    expect(page.querySelector("img")).toBeNull();
    expect(page.innerHTML).not.toMatch(/onerror|onclick|<script/i);
    // A raw tag is dropped; the text between its tags stays, as plain text.
    expect([...page.querySelectorAll("a")].some((link) => link.textContent === "raw anchor")).toBe(
      false,
    );
    expect(page.querySelector("h1")?.textContent).toBe("Plan");
    expect((window as { __pwned?: string }).__pwned).toBeUndefined();
  });

  it("should keep only http, https, mailto and same-page links and leave every other link inert", () => {
    const page = draw(HOSTILE);

    const hrefs = [...page.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "https://example.com/a",
      "mailto:a@example.com",
      "http://example.com",
      "#d-3",
    ]);
    for (const text of ["run me", "data", "vb", "relative"]) {
      const inert = [...page.querySelectorAll(".bu-md-inert-link")].find(
        (node) => node.textContent === text,
      );
      expect(inert, text).toBeDefined();
      expect(inert?.closest("a")).toBeNull();
    }
  });

  it("should open an outside link in a new tab without handing it the opener", () => {
    const link = draw("[ok](https://example.com/a)").querySelector("a");

    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer nofollow");
  });
});

describe("safeHref", () => {
  it("should strip every scheme but http, https and mailto, whatever its case or spacing", () => {
    expect(safeHref(" JavaScript:alert(1)")).toBeUndefined();
    expect(safeHref("java\tscript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref("file:///etc/passwd")).toBeUndefined();
    expect(safeHref("//example.com/x")).toBeUndefined();
    expect(safeHref("HTTPS://example.com")).toBe("HTTPS://example.com");
    expect(safeHref("mailto:a@example.com")).toBe("mailto:a@example.com");
  });
});
