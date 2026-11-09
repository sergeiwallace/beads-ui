import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../server/server.ts";
import { type HostEnv, hostConfig, hostEnv, repoName, signIn } from "./auth-env.ts";
import { createStore, type TestStore } from "./store.ts";

// T-W1.7: "When the server serves the app, it shall send a Content Security Policy with no inline
// script and enforce Trusted Types for DOM sinks."

let store: TestStore;
let host: HostEnv;
let clientDir: string;
let server: RunningServer;
let cookie: string;

beforeAll(async () => {
  store = await createStore("csp");
  host = await hostEnv();
  await host.write(hostConfig({ allowRepos: [repoName(store.dir)] }));
  clientDir = await mkdtemp(join(tmpdir(), "beads-ui-web-client-"));
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
  server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: host.configEnv,
  });
  cookie = await signIn(server);
});

afterAll(async () => {
  await server?.close();
  await store?.remove();
  await host?.remove();
  if (clientDir !== undefined) await rm(clientDir, { recursive: true });
});

/** The policy's directives by name. */
function directives(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name !== undefined && name !== "") map.set(name, values);
  }
  return map;
}

describe("the Content Security Policy", () => {
  it.each(["/", "/backlog", "/api/health", "/api/nope"])(
    "should allow no inline script and require Trusted Types on %s",
    async (path) => {
      const response = await fetch(new URL(path, server.url), { headers: { cookie } });
      await response.arrayBuffer();
      const policy = directives(response.headers.get("content-security-policy") ?? "");

      expect(policy.get("script-src")).toEqual(["'self'"]);
      expect(policy.get("default-src")).toEqual(["'self'"]);
      expect(policy.get("object-src")).toEqual(["'none'"]);
      expect(policy.get("require-trusted-types-for")).toEqual(["'script'"]);
      expect(policy.get("trusted-types")).toEqual(["default", "dompurify"]);
    },
  );

  it("should be sent on the sign-in refusal too, before any session exists", async () => {
    const response = await fetch(new URL("/", server.url));
    await response.arrayBuffer();

    expect(response.headers.get("content-security-policy")).toContain("script-src 'self'");
  });
});
