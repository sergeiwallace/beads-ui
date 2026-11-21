import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mountedPath, shellHtml } from "../server/portal.ts";
import { serveClient } from "../server/static.ts";

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

  it("serves each linked icon with the right type under both mounts, as a browser resolves it", async () => {
    // vite copies public/ into the root of the built client, so mirror that layout.
    const clientDir = await mkdtemp(join(tmpdir(), "favicon-client-"));
    await cp(clientFile("public"), clientDir, { recursive: true });
    await cp(clientFile("index.html"), join(clientDir, "index.html"));
    const expected: Record<string, string> = {
      "icon.svg": "image/svg+xml",
      "icon-32.png": "image/png",
      "icon-192.png": "image/png",
      "manifest.webmanifest": "application/manifest+json",
    };
    try {
      for (const mount of ["/", "/beads/"]) {
        const server = createServer((request, response) => {
          const url = new URL(request.url ?? "/", "http://127.0.0.1");
          void serveClient(request, response, mountedPath(url.pathname, mount), clientDir, mount);
        });
        await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
        try {
          const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
          const page = await fetch(`${origin}${mount}`);
          const shell = await page.text();
          const base = new URL(/<base href="([^"]+)"/.exec(shell)?.[1] ?? "", `${origin}${mount}`);
          for (const [name, type] of Object.entries(expected)) {
            const res = await fetch(new URL(`./${name}`, base));
            expect(res.status, `${mount}${name}`).toBe(200);
            expect(res.headers.get("content-type")).toBe(type);
            expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
          }
        } finally {
          await new Promise((done) => server.close(done));
        }
      }
    } finally {
      await rm(clientDir, { recursive: true, force: true });
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
    // The shipped mark is FAV-01 dark-tile, an opaque rounded tile (docs/design-assets/favicon).
    expect(svg).toContain('data-favicon="FAV-01 dark-tile@1.1.0"');
  });
});
