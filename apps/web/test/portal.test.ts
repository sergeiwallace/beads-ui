import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../server/server.ts";
import { type HostEnv, hostConfig, hostEnv, repoName, send, signIn } from "./auth-env.ts";
import { createStore, type TestStore } from "./store.ts";

// The app-portal member duties the Node server performs itself (web app design D-15 (a), T-W3.2).

const SHELL =
  '<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>shell</title></head><body></body></html>';

let store: TestStore;
let host: HostEnv;
let clientDir: string;
let server: RunningServer;
let cookie: string;

const config = (extra?: string) =>
  hostConfig({
    allowRepos: [repoName(store.dir)],
    extra: `[web]\nbase_path = "/beads"\n${extra ?? ""}`,
  });

beforeAll(async () => {
  store = await createStore("portal");
  host = await hostEnv();
  await host.write(config());
  clientDir = await mkdtemp(join(tmpdir(), "beads-ui-web-portal-client-"));
  await writeFile(join(clientDir, "index.html"), SHELL);
  await mkdir(join(clientDir, "assets"));
  await writeFile(join(clientDir, "assets", "app-1234.js"), "console.log('app');");
  server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: host.configEnv,
    feedIntervalMs: 1_000,
  });
  cookie = await signIn(server);
});

afterAll(async () => {
  await server?.close();
  await store?.remove();
  await host?.remove();
  if (clientDir !== undefined) await rm(clientDir, { recursive: true });
});

const get = (path: string, headers: Record<string, string> = { cookie }) =>
  send(server, path, { headers });

describe("the base path", () => {
  it("should serve every asset and API route under /beads, as it does with the prefix stripped", async () => {
    for (const prefix of ["/beads", ""]) {
      const asset = await get(`${prefix}/assets/app-1234.js`);
      expect(asset.status).toBe(200);
      expect(asset.text).toBe("console.log('app');");
      const board = await get(`${prefix}/api/board`);
      expect(board.status).toBe(200);
      expect(board.json()).toMatchObject({ store: repoName(store.dir) });
    }
  });

  it("should serve the app shell, its base path set, for any other path below /beads", async () => {
    for (const path of [
      "/beads",
      "/beads/",
      "/beads/backlog",
      "/beads/issues/portal-1",
      "/sessions",
    ]) {
      const reply = await get(path);
      expect(reply.status, path).toBe(200);
      expect(reply.headers["content-type"]).toMatch(/^text\/html/);
      expect(reply.text).toContain('<base href="/beads/" />');
    }
  });

  it("should answer an unknown /api path under /beads with the API's JSON 404, never the shell", async () => {
    const reply = await get("/beads/api/no-such-route");
    expect(reply.status).toBe(404);
    expect(reply.headers["content-type"]).toMatch(/^application\/json/);
    expect(reply.text).not.toContain("<base");
  });

  it("should sign in through a link under the base path and scope the session cookie to it", async () => {
    const { path } = server.auth.mintCode();
    expect(path.startsWith("/beads/api/auth/")).toBe(true);
    const reply = await send(server, path, { headers: { "sec-fetch-site": "none" } });
    expect(reply.status).toBe(303);
    expect(reply.headers.location).toBe("/beads/");
    const set = String(reply.headers["set-cookie"]);
    expect(set).toContain("Path=/beads/;");
  });
});

describe("/healthz", () => {
  it("should answer 200 without a session while the stores and allowlist read, naming no store or count", async () => {
    for (const path of ["/healthz", "/beads/healthz"]) {
      const reply = await send(server, path);
      expect(reply.status, path).toBe(200);
      expect(reply.json()).toEqual({ status: "ok" });
      expect(reply.text).not.toContain(repoName(store.dir));
    }
  });

  it("should answer 503 while the allowlist cannot be read", async () => {
    await host.write(config().replace(/allow_repos = .*/, "allow_repos = 3"));
    try {
      const reply = await send(server, "/healthz");
      expect(reply.status).toBe(503);
      expect(reply.json()).toEqual({ status: "unavailable" });
    } finally {
      await host.write(config());
    }
    expect((await send(server, "/healthz")).status).toBe(200);
  });

  it("should answer 503 while no store is open", async () => {
    await host.write(
      hostConfig({ allowRepos: ["not-this-store"], extra: '[web]\nbase_path = "/beads"\n' }),
    );
    try {
      const reply = await send(server, "/healthz");
      expect(reply.status).toBe(503);
      expect(reply.json()).toEqual({ status: "unavailable" });
    } finally {
      await host.write(config());
    }
  });

  it("should keep the Host allowlist on /healthz", async () => {
    const reply = await send(server, "/healthz", { headers: { host: "attacker.example" } });
    expect(reply.status).toBe(403);
    expect(reply.text).not.toContain('"ok"');
  });

  it("should not shadow /healthz with the shell, nor open any other path without a session", async () => {
    const shell = await send(server, "/beads/backlog");
    expect(shell.status).toBe(401);
    const api = await send(server, "/beads/api/board");
    expect(api.status).toBe(401);
  });
});

describe("the shell's headers", () => {
  it("should send app-portal's member header set on the shell, no-store and its referrer policy included", async () => {
    const reply = await get("/beads/");
    expect(reply.headers["cache-control"]).toBe("no-store");
    expect(reply.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(reply.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("should send the same header set on an API reply and on /healthz", async () => {
    for (const reply of [await get("/beads/api/board"), await send(server, "/healthz")]) {
      expect(reply.headers["cache-control"]).toBe("no-store");
      expect(reply.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(reply.headers["x-content-type-options"]).toBe("nosniff");
    }
  });
});

describe("the client build", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), "beads-ui-web-build-"));
    await build({
      configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
      logLevel: "warn",
      build: { outDir, emptyOutDir: true },
    });
  }, 300_000);

  afterAll(async () => {
    if (outDir !== undefined) await rm(outDir, { recursive: true });
  });

  it("should emit a web app manifest the shell links, scoped to wherever the app is mounted", async () => {
    const manifest = JSON.parse(await readFile(join(outDir, "manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({ name: "beads-ui", start_url: ".", scope: "." });
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toMatch(/<link rel="manifest" href="\.\/manifest\.webmanifest"/);
    // Relative URLs, so the base the server writes into the shell places every asset under it.
    expect(html).not.toMatch(/(src|href)="\/assets\//);
  });

  it("should register no service worker", async () => {
    const files = await readdir(outDir, { recursive: true });
    expect(files.filter((file) => /(^|\/)(sw|service-?worker)[^/]*\.js$/i.test(file))).toEqual([]);
    for (const file of files.filter((name) => name.endsWith(".js") || name.endsWith(".html"))) {
      const text = await readFile(join(outDir, file), "utf8");
      expect(text, file).not.toMatch(/serviceWorker\s*\.\s*register/);
    }
  });
});
