import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shellHtml } from "../server/portal.ts";

const clientFile = (name: string) => fileURLToPath(new URL(`../client/${name}`, import.meta.url));

describe("favicon assets and mount paths", () => {
  it("links relative favicon and manifest URLs in both root and /beads/ shells", async () => {
    const html = await readFile(clientFile("index.html"), "utf8");
    for (const mount of ["/", "/beads/"]) {
      const shell = shellHtml(html, mount);
      const base = new URL(mount, "https://example.test");
      expect(shell).toContain(`<base href="${mount}" />`);
      for (const name of ["icon.svg", "icon-32.png", "manifest.webmanifest"]) {
        expect(shell).toContain(`href="./${name}"`);
        expect(new URL(`./${name}`, base).pathname).toBe(`${mount}${name}`);
      }
    }
  });

  it("keeps the installable icons aligned with shipped nonempty assets", async () => {
    const manifest = JSON.parse(await readFile(clientFile("public/manifest.webmanifest"), "utf8"));
    expect(manifest.start_url).toBe(".");
    expect(manifest.scope).toBe(".");
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith("/")).toBe(false);
      expect((await stat(clientFile(`public/${icon.src}`))).size).toBeGreaterThan(100);
    }
    const png = await readFile(clientFile("public/icon-32.png"));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const svg = await readFile(clientFile("public/icon.svg"), "utf8");
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).not.toMatch(/<rect[^>]+(?:width="64"|height="64")/);
  });
});
