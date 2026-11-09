import { createPrivateKey, createPublicKey } from "node:crypto";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PUBLISHED_KEYS_FILE, type PublishedKeys } from "../server/dispatch-service.ts";
import { type RunningServer, startServer } from "../server/server.ts";
import { type HostEnv, hostConfig, hostEnv, repoName } from "./auth-env.ts";
import { createStore, type TestStore } from "./store.ts";

// The build decision on the signing key's source: a `state:` file absent at server start is
// generated there as an Ed25519 key of mode 0600 and published under `[auth] signing_key_id`;
// a file that exists is never overwritten, whatever is wrong with it. Each case through a start.

const KEY_FILE = "dispatch-signing-key";
const KEY_ID = "host-a-20261109";

let store: TestStore;
let clientDir: string;
const cleanup: (() => Promise<void>)[] = [];

beforeAll(async () => {
  store = await createStore("sign");
  const holder = await hostEnv();
  cleanup.push(holder.remove);
  clientDir = join(holder.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
});

afterAll(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
  await store?.remove();
});

async function host(): Promise<HostEnv> {
  const env = await hostEnv(
    hostConfig({
      allowRepos: [repoName(store.dir)],
      auth: { signing_key: `state:${KEY_FILE}`, signing_key_id: KEY_ID },
    }),
  );
  cleanup.push(env.remove);
  return env;
}

async function start(env: HostEnv): Promise<RunningServer> {
  const server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: env.configEnv,
  });
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= server.close();
    return closing;
  };
  cleanup.push(close);
  return { ...server, close };
}

const published = async (env: HostEnv): Promise<PublishedKeys | undefined> =>
  readFile(join(env.stateDir, PUBLISHED_KEYS_FILE), "utf8").then(
    (text) => JSON.parse(text) as PublishedKeys,
    () => undefined,
  );

describe("the signing key at server start", () => {
  it("should generate an absent key with mode 0600, publish it under the key id and log one line without the key", async () => {
    const env = await host();
    const server = await start(env);
    const path = join(env.stateDir, KEY_FILE);
    const info = await stat(path);
    expect(Number(info.mode) & 0o777).toBe(0o600);
    const pem = await readFile(path, "utf8");
    const key = createPrivateKey(pem);
    expect(key.asymmetricKeyType).toBe("ed25519");
    const keys = await published(env);
    expect(keys?.keys).toEqual([
      expect.objectContaining({
        key_id: KEY_ID,
        public_key: String(createPublicKey(key).export({ format: "jwk" }).x),
        revoked: false,
      }),
    ]);
    expect(server.dispatchNotices).toHaveLength(1);
    expect(server.dispatchNotices[0]).toContain(KEY_ID);
    const body = pem.split("\n").filter((line) => line !== "" && !line.startsWith("-----"));
    for (const line of body) expect(server.dispatchNotices[0]).not.toContain(line);
    expect(server.dispatchProblems).toEqual([]);
  });

  it("should keep the key it generated across a restart and generate nothing the second time", async () => {
    const env = await host();
    const first = await start(env);
    const pem = await readFile(join(env.stateDir, KEY_FILE), "utf8");
    await first.close();
    const second = await start(env);
    expect(second.dispatchNotices).toEqual([]);
    expect(await readFile(join(env.stateDir, KEY_FILE), "utf8")).toBe(pem);
  });

  it("should refuse to sign and leave the file as it is when the key file has a mode wider than 0600", async () => {
    const env = await host();
    await mkdir(env.stateDir, { recursive: true, mode: 0o700 });
    const path = join(env.stateDir, KEY_FILE);
    await writeFile(path, "kept as written\n", { mode: 0o644 });
    await chmod(path, 0o644);
    const server = await start(env);
    expect(server.dispatchNotices).toEqual([]);
    expect(server.dispatchProblems).toEqual([expect.stringMatching(/is mode 0644, not 0600/)]);
    expect(await readFile(path, "utf8")).toBe("kept as written\n");
    expect(await published(env)).toBeUndefined();
  });

  it("should refuse to sign and leave the file as it is when the key file does not parse", async () => {
    const env = await host();
    await mkdir(env.stateDir, { recursive: true, mode: 0o700 });
    const path = join(env.stateDir, KEY_FILE);
    await writeFile(path, "not a key\n", { mode: 0o600 });
    const server = await start(env);
    expect(server.dispatchNotices).toEqual([]);
    expect(server.dispatchProblems).toEqual([
      expect.stringMatching(/neither a PKCS #8 PEM nor a 32-byte hex seed/),
    ]);
    expect(await readFile(path, "utf8")).toBe("not a key\n");
  });

  it("should refuse to sign and leave the file as it is when the key file cannot be read", async () => {
    const env = await host();
    await mkdir(env.stateDir, { recursive: true, mode: 0o700 });
    const path = join(env.stateDir, KEY_FILE);
    await writeFile(path, "unreadable\n", { mode: 0o600 });
    await chmod(path, 0o000);
    try {
      const server = await start(env);
      expect(server.dispatchNotices).toEqual([]);
      expect(server.dispatchProblems).toEqual([
        expect.stringMatching(/\[auth\] signing_key: .*(mode 0000|cannot be read)/),
      ]);
    } finally {
      await chmod(path, 0o600);
    }
    expect(await readFile(path, "utf8")).toBe("unreadable\n");
  });
});
