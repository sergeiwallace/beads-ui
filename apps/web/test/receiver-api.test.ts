import { createHash, createPrivateKey, createPublicKey, verify } from "node:crypto";
import { chmod, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DispatchRecord } from "@beads-ui/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DispatchRefused,
  type NewDispatch,
  PUBLISHED_ALLOWLIST_FILE,
  PUBLISHED_KEYS_FILE,
  type PublishedKeys,
  ROTATION_OVERLAP_MS,
} from "../server/dispatch-service.ts";
import { BODIES_DIR } from "../server/dispatch-store/common.ts";
import { JOURNAL_FILE } from "../server/dispatch-store/local.ts";
import { canonicalBytes } from "../server/envelope.ts";
import { type RunningServer, StartRefused, startServer } from "../server/server.ts";
import {
  type HostEnv,
  hostConfig,
  hostEnv,
  type Reply,
  repoName,
  runCli,
  send,
} from "./auth-env.ts";
import { type FakeQueue, startFakeQueue } from "./fake-queue.ts";
import { createStore, type TestStore } from "./store.ts";

// T-W0.3 (the receiver API), T-W0.2's last two criteria and T-W0.4's rotation, server side: each
// criterion through requests to the running server, with receiver tokens the host's CLI issued.

/** RFC 8032 section 7.1 TESTS 1 and 2: published test seeds that sign nothing real. */
const SEED_A = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const SEED_B = "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb";
const KEY_A = "host-a-20261109";
const KEY_B = "host-a-20261110";
const KEY_FILE = "dispatch-signing-key";
const WORK = "work-repo";
const UNLISTED = "private-notes";
const TARGET = { host: "host-b", session: "session-1" };
/** Non-ASCII on purpose: the body route must return the exact bytes the digest names. */
const BODY = "Pick up the next ready task; the résumé is in the notes.\n";

let store: TestStore;
let clientDir: string;
let now = Date.parse("2026-11-09T12:00:00.000Z");
const cleanup: (() => Promise<void>)[] = [];

interface Host {
  env: HostEnv;
  server: RunningServer;
  /** Receiver tokens, by host name, issued by `beads-ui-web issue-receiver-token`. */
  tokens: Record<string, string>;
}

const PUBLISHED = `[hosts.host-b]\nallow_repos = ["${WORK}"]\n\n[hosts.host-c]\nallow_repos = ["${WORK}"]`;

function config(
  options: {
    keyId?: string;
    keyRef?: string;
    /** This host's own `[hosts] allow_repos`; null leaves it out. */
    allowRepos?: string[] | null;
    published?: string;
    extra?: string;
  } = {},
) {
  const published = options.published ?? PUBLISHED;
  return hostConfig({
    allowRepos:
      options.allowRepos === null ? undefined : (options.allowRepos ?? [repoName(store.dir), WORK]),
    auth: {
      signing_key: options.keyRef ?? `state:${KEY_FILE}`,
      signing_key_id: options.keyId ?? KEY_A,
    },
    extra: options.extra === undefined ? published : `${published}\n\n${options.extra}`,
  });
}

async function writeKey(env: HostEnv, seed: string, file = KEY_FILE, mode = 0o600) {
  await mkdir(env.stateDir, { recursive: true, mode: 0o700 });
  const path = join(env.stateDir, file);
  await writeFile(path, `${seed}\n`, { mode });
  await chmod(path, mode);
}

async function start(env: HostEnv, options: { sweepMs?: number } = {}): Promise<RunningServer> {
  const server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: env.configEnv,
    clock: () => now,
    ...(options.sweepMs === undefined ? {} : { sweepMs: options.sweepMs }),
  });
  cleanup.push(server.close);
  return server;
}

async function issueToken(env: HostEnv, host: string): Promise<string> {
  const issued = await runCli(env, store.dir, ["issue-receiver-token", host]);
  expect(issued.code, issued.stderr).toBe(0);
  return issued.stdout.trim();
}

/** A host with a signing key, its config, and tokens for host-b and host-c. */
async function newHost(
  options: { text?: string; sweepMs?: number; seed?: string } = {},
): Promise<Host> {
  const env = await hostEnv(options.text ?? config());
  cleanup.push(env.remove);
  await writeKey(env, options.seed ?? SEED_A);
  const tokens = {
    "host-b": await issueToken(env, "host-b"),
    "host-c": await issueToken(env, "host-c"),
  };
  const server = await start(
    env,
    options.sweepMs === undefined ? {} : { sweepMs: options.sweepMs },
  );
  return { env, server, tokens };
}

const bearer = (token: string | undefined): Record<string, string> =>
  token === undefined ? {} : { authorization: `Bearer ${token}` };

const dispatchTo = (overrides: Partial<NewDispatch> = {}): NewDispatch => ({
  task: { repo: WORK, id: "work-1" },
  target: TARGET,
  kind: "prompt",
  body: BODY,
  arm_goal: true,
  ...overrides,
});

const list = (host: Host, token: string | undefined, session = TARGET.session) =>
  send(host.server, `/api/receiver/v1/dispatches?session=${encodeURIComponent(session)}`, {
    headers: bearer(token),
  });

const body = (host: Host, id: string, token: string | undefined, session = TARGET.session) =>
  send(
    host.server,
    `/api/receiver/v1/dispatches/${id}/body?session=${encodeURIComponent(session)}`,
    {
      headers: bearer(token),
    },
  );

const receipt = (
  host: Host,
  id: string,
  token: string | undefined,
  payload: unknown,
  contentType = "application/json",
) =>
  send(host.server, `/api/receiver/v1/dispatches/${id}/receipts`, {
    method: "POST",
    headers: { ...bearer(token), "content-type": contentType },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });

/** Status, headers (but the clock's `date`) and body: what a caller can tell two answers apart by. */
const observable = (reply: Reply) => {
  const { date: _date, ...headers } = reply.headers;
  return { status: reply.status, headers, text: reply.text };
};

const listed = (reply: Reply) => (reply.json() as { dispatches: DispatchRecord[] }).dispatches;

async function bodyBytes(host: Host, id: string, token: string): Promise<Response> {
  return fetch(
    new URL(`/api/receiver/v1/dispatches/${id}/body?session=${TARGET.session}`, host.server.url),
    { headers: bearer(token) },
  );
}

const journal = async (host: Host) =>
  (await readFile(join(host.env.stateDir, JOURNAL_FILE), "utf8"))
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as { op: string; id?: string; cause?: string });

const bodyFiles = async (host: Host) =>
  readdir(join(host.env.stateDir, BODIES_DIR)).catch(() => [] as string[]);

async function filesHolding(dir: string, text: string): Promise<string[]> {
  const holding: string[] = [];
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    if ((await readFile(path, "utf8")).includes(text)) holding.push(path);
  }
  return holding;
}

const published = async (host: Host): Promise<PublishedKeys> =>
  JSON.parse(await readFile(join(host.env.stateDir, PUBLISHED_KEYS_FILE), "utf8"));

/** The raw public key of a seed, as a trusted-keys map carries it. */
function publicKeyOf(seed: string): string {
  const der = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    Buffer.from(seed, "hex"),
  ]);
  const key = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  return String(createPublicKey(key).export({ format: "jwk" }).x);
}

/** Verifies a record as a receiver does: by its key id, against a published public key. */
function verifiesWith(record: DispatchRecord, keys: PublishedKeys): boolean {
  const key = keys.keys.find((entry) => entry.key_id === record.envelope.signing_key_id);
  if (key === undefined) return false;
  const publicKey = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: key.public_key },
    format: "jwk",
  });
  return verify(
    null,
    canonicalBytes(record),
    publicKey,
    Buffer.from(record.envelope.signature, "base64url"),
  );
}

/** Waits, within a bound, for the server's sweep timer to make `check` true. */
async function until(check: () => Promise<boolean>, ms = 5_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
}

beforeAll(async () => {
  store = await createStore("recv");
  const holder = await hostEnv();
  cleanup.push(holder.remove);
  clientDir = join(holder.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>beads-ui client</title>");
});

afterAll(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
  await store?.remove();
});

describe("fetching a dispatch (T-W0.3)", () => {
  let host: Host;
  beforeAll(async () => {
    host = await newHost();
  });

  it("should list the record without its body, then return the exact body, only to the target host's token for the target session", async () => {
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    const shown = await list(host, host.tokens["host-b"]);
    expect(shown.status).toBe(200);
    expect(listed(shown)).toEqual([dispatch.record]);
    expect(shown.text).not.toContain("résumé");

    const fetched = await bodyBytes(host, dispatch.record.id, host.tokens["host-b"] as string);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const bytes = Buffer.from(await fetched.arrayBuffer());
    expect(bytes.equals(Buffer.from(BODY, "utf8"))).toBe(true);
    expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
      dispatch.record.body_digest,
    );

    // Another host's token, or another session on the target host, sees no such dispatch.
    expect(listed(await list(host, host.tokens["host-c"]))).toEqual([]);
    expect(listed(await list(host, host.tokens["host-b"], "session-2"))).toEqual([]);
    expect((await body(host, dispatch.record.id, host.tokens["host-c"])).status).toBe(404);
    expect((await body(host, dispatch.record.id, host.tokens["host-b"], "session-2")).status).toBe(
      404,
    );
  });

  it("should refuse a missing token, an unknown token, another host's token, another session and an unknown id identically, by status, headers and body", async () => {
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    const id = dispatch.record.id;
    const unknownId = "01JD0000000000000000000000";
    const bodies = [
      await body(host, id, undefined),
      await body(host, id, "not-a-token-this-host-ever-issued-000000000"),
      await body(host, id, host.tokens["host-c"]),
      await body(host, id, host.tokens["host-b"], "session-2"),
      await body(host, unknownId, host.tokens["host-b"]),
    ].map(observable);
    for (const reply of bodies) {
      expect(reply).toEqual(bodies[0]);
      expect(reply.status).toBe(404);
      expect(reply.text).toBe("");
    }
    const taken = { session: TARGET.session, state: "taken" };
    const receipts = [
      await receipt(host, id, undefined, taken),
      await receipt(host, id, "not-a-token-this-host-ever-issued-000000000", taken),
      await receipt(host, id, host.tokens["host-c"], taken),
      await receipt(host, id, host.tokens["host-b"], { ...taken, session: "session-2" }),
      await receipt(host, unknownId, host.tokens["host-b"], taken),
    ].map(observable);
    for (const reply of receipts) expect(reply).toEqual(bodies[0]);
    // The refused list call is the same answer too.
    expect(observable(await list(host, undefined))).toEqual(bodies[0]);

    // None of them touched the dispatch: its target still gets it, untaken.
    expect((await body(host, id, host.tokens["host-b"])).status).toBe(200);
    expect((await host.server.dispatches.store.get(id))?.state).toBe("queued");
  });
});

describe("receipts (T-W0.3)", () => {
  let host: Host;
  beforeAll(async () => {
    host = await newHost();
  });

  it("should record taken and then acted from the target, and refuse any receipt from another host or session", async () => {
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    const id = dispatch.record.id;
    const other = await receipt(host, id, host.tokens["host-c"], {
      session: TARGET.session,
      state: "taken",
    });
    const wrongSession = await receipt(host, id, host.tokens["host-b"], {
      session: "session-2",
      state: "taken",
    });
    expect([other.status, wrongSession.status]).toEqual([404, 404]);
    expect((await host.server.dispatches.store.get(id))?.receipts).toEqual([]);

    const taken = await receipt(host, id, host.tokens["host-b"], {
      session: TARGET.session,
      state: "taken",
    });
    expect(taken.status).toBe(204);
    expect(taken.text).toBe("");
    const acted = await receipt(host, id, host.tokens["host-b"], {
      session: TARGET.session,
      state: "acted",
    });
    expect(acted.status).toBe(204);
    const stored = await host.server.dispatches.store.get(id);
    expect(stored?.state).toBe("acted");
    expect(stored?.receipts.map((entry) => [entry.state, entry.host, entry.session])).toEqual([
      ["taken", "host-b", "session-1"],
      ["acted", "host-b", "session-1"],
    ]);
  });

  it("should refuse a receipt that is malformed or a move the delivery state does not allow, recording nothing", async () => {
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    const id = dispatch.record.id;
    const token = host.tokens["host-b"];
    const refused = [
      await receipt(host, id, token, { session: TARGET.session, state: "shown" }),
      await receipt(host, id, token, { state: "taken" }),
      await receipt(host, id, token, { session: TARGET.session, state: "failed", reason: 7 }),
      await receipt(host, id, token, "{not json"),
      await receipt(host, id, token, { session: TARGET.session, state: "taken" }, "text/plain"),
      // acted needs taken first.
      await receipt(host, id, token, { session: TARGET.session, state: "acted" }),
    ];
    for (const reply of refused) expect(observable(reply)).toMatchObject({ status: 404, text: "" });
    expect((await host.server.dispatches.store.get(id))?.receipts).toEqual([]);
  });
});

describe("bodies are tombstoned on consume or expiry (T-W0.3)", () => {
  let host: Host;
  beforeAll(async () => {
    host = await newHost();
  });

  it("should delete the body and append a tombstone when the dispatch is acted on, keeping the record and its receipts", async () => {
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    const id = dispatch.record.id;
    expect(await bodyFiles(host)).toContain(id);
    for (const state of ["taken", "acted"]) {
      expect(
        (await receipt(host, id, host.tokens["host-b"], { session: TARGET.session, state })).status,
      ).toBe(204);
    }
    expect(await bodyFiles(host)).not.toContain(id);
    expect(await journal(host)).toContainEqual(
      expect.objectContaining({ op: "tombstone", id, cause: "acted" }),
    );
    const stored = await host.server.dispatches.store.get(id);
    expect(stored?.record).toEqual(dispatch.record);
    expect(stored?.receipts).toHaveLength(2);
    expect(stored?.tombstone?.cause).toBe("acted");
    expect((await body(host, id, host.tokens["host-b"])).status).toBe(404);
    expect(
      listed(await list(host, host.tokens["host-b"])).map((record) => record.id),
    ).not.toContain(id);
  });

  it("should delete the body and append a tombstone when the dispatch fails, keeping the reason", async () => {
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    const id = dispatch.record.id;
    const failed = await receipt(host, id, host.tokens["host-b"], {
      session: TARGET.session,
      state: "failed",
      reason: "bad-signature",
    });
    expect(failed.status).toBe(204);
    expect(await bodyFiles(host)).not.toContain(id);
    const stored = await host.server.dispatches.store.get(id);
    expect(stored?.tombstone?.cause).toBe("failed");
    expect(stored?.receipts[0]?.reason).toBe("bad-signature");
  });

  it("should expire a dispatch past its expires_at at the next receiver request, deleting its body", async () => {
    const { dispatch } = await host.server.dispatches.create(dispatchTo({ ttlMs: 60_000 }));
    const id = dispatch.record.id;
    expect((await body(host, id, host.tokens["host-b"])).status).toBe(200);
    now += 61_000;
    expect(
      listed(await list(host, host.tokens["host-b"])).map((record) => record.id),
    ).not.toContain(id);
    expect((await body(host, id, host.tokens["host-b"])).status).toBe(404);
    expect(await bodyFiles(host)).not.toContain(id);
    expect(await journal(host)).toContainEqual(
      expect.objectContaining({ op: "tombstone", id, cause: "expired" }),
    );
    expect((await host.server.dispatches.store.get(id))?.state).toBe("expired");
  });

  it("should expire a dispatch nobody fetches on the server's own sweep", async () => {
    const swept = await newHost({ sweepMs: 20 });
    const { dispatch } = await swept.server.dispatches.create(dispatchTo({ ttlMs: 60_000 }));
    const id = dispatch.record.id;
    expect(await bodyFiles(swept)).toContain(id);
    now += 61_000;
    expect(await until(async () => !(await bodyFiles(swept)).includes(id))).toBe(true);
    expect((await swept.server.dispatches.store.get(id))?.tombstone?.cause).toBe("expired");
  });

  it("should keep every body out of a backup of the running server's store", async () => {
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    const destination = join(host.env.configHome, "backup");
    const written = await host.server.dispatches.store.backup(destination);
    expect(written.length).toBeGreaterThan(0);
    expect(await filesHolding(destination, dispatch.record.id)).not.toEqual([]);
    expect(await filesHolding(destination, "résumé")).toEqual([]);
  });
});

describe("the target and requesting host's allowlist (T-W0.2)", () => {
  let host: Host;
  beforeAll(async () => {
    host = await newHost();
  });

  it("should refuse a dispatch whose repository is not on the target host's published allowlist, storing nothing", async () => {
    await expect(
      host.server.dispatches.create(dispatchTo({ task: { repo: UNLISTED, id: "notes-1" } })),
    ).rejects.toThrow(new DispatchRefused(`${UNLISTED} is not on host-b's published allowlist`));
    await expect(
      host.server.dispatches.create(
        dispatchTo({ target: { host: "host-d", session: TARGET.session } }),
      ),
    ).rejects.toThrow(/host-d's published allowlist: \[hosts\.host-d\] allow_repos is missing/);
    expect(listed(await list(host, host.tokens["host-b"]))).toEqual([]);
    expect(await bodyFiles(host)).toEqual([]);
  });

  it("should return no body, and list nothing, once the task's repository leaves the requesting host's allowlist", async () => {
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    const id = dispatch.record.id;
    expect((await body(host, id, host.tokens["host-b"])).status).toBe(200);
    await host.env.write(config({ published: `[hosts.host-b]\nallow_repos = ["other-repo"]` }));
    try {
      expect(observable(await body(host, id, host.tokens["host-b"]))).toMatchObject({
        status: 404,
        text: "",
      });
      expect(listed(await list(host, host.tokens["host-b"]))).toEqual([]);
    } finally {
      await host.env.write(config());
    }
    expect((await body(host, id, host.tokens["host-b"])).status).toBe(200);
  });
});

describe("the signing key (D-20)", () => {
  it("should refuse to sign, storing nothing, when the key file is missing, not mode 0600, not a file or not a key", async () => {
    const host = await newHost();
    const path = join(host.env.stateDir, KEY_FILE);
    await rename(path, `${path}.away`);
    await expect(host.server.dispatches.create(dispatchTo())).rejects.toThrow(
      /\[auth\] signing_key: .* cannot be read \(ENOENT\), so nothing can be signed/,
    );
    await rename(`${path}.away`, path);
    await chmod(path, 0o644);
    await expect(host.server.dispatches.create(dispatchTo())).rejects.toThrow(
      /is mode 0644, not 0600/,
    );
    await chmod(path, 0o600);
    await writeFile(path, "not a key\n");
    await expect(host.server.dispatches.create(dispatchTo())).rejects.toThrow(
      /\[auth\] signing_key: the signing key is neither a PKCS #8 PEM nor a 32-byte hex seed/,
    );
    await rename(path, `${path}.away`);
    await mkdir(path);
    await expect(host.server.dispatches.create(dispatchTo())).rejects.toThrow(/is not a file/);
    expect(listed(await list(host, host.tokens["host-b"]))).toEqual([]);
    expect(await bodyFiles(host)).toEqual([]);
  });

  it("should start, serve and say why when [auth] signing_key names no state file it can read", async () => {
    const env = await hostEnv(config({ keyRef: "secret-store:dispatch-signing-key" }));
    cleanup.push(env.remove);
    const server = await start(env);
    expect(server.dispatchProblems).toEqual([
      expect.stringMatching(
        /^dispatches cannot be signed: \[auth\] signing_key = "secret-store:dispatch-signing-key": .*state:<file>/,
      ),
    ]);
    await expect(server.dispatches.create(dispatchTo())).rejects.toThrow(DispatchRefused);
    const token = await issueToken(env, "host-b");
    const reply = await send(server, `/api/receiver/v1/dispatches?session=${TARGET.session}`, {
      headers: bearer(token),
    });
    expect(reply.json()).toEqual({ dispatches: [] });
  });
});

describe("published keys and rotation (T-W0.4, server side)", () => {
  it("should publish its public key as a trusted-keys map, against which every listed record verifies", async () => {
    const host = await newHost();
    expect(await published(host)).toEqual({
      version: 1,
      keys: [
        {
          key_id: KEY_A,
          public_key: publicKeyOf(SEED_A),
          not_before: new Date(now).toISOString(),
          not_after: null,
          revoked: false,
        },
      ],
    });
    await host.server.dispatches.create(dispatchTo());
    const [record] = listed(await list(host, host.tokens["host-b"]));
    expect(record?.envelope.signing_key_id).toBe(KEY_A);
    expect(verifiesWith(record as DispatchRecord, await published(host))).toBe(true);
  });

  it("should publish a rotated key before it signs with it, keep the old key valid for 24 hours, then drop it", async () => {
    const host = await newHost();
    const first = (await host.server.dispatches.create(dispatchTo())).dispatch.record;
    now += 3_600_000;
    await writeKey(host.env, SEED_B, `${KEY_FILE}-2`);
    await host.env.write(config({ keyId: KEY_B, keyRef: `state:${KEY_FILE}-2` }));
    const second = (await host.server.dispatches.create(dispatchTo())).dispatch.record;
    const keys = await published(host);
    const rotatedAt = new Date(now).toISOString();
    expect(keys.keys).toEqual([
      expect.objectContaining({
        key_id: KEY_A,
        public_key: publicKeyOf(SEED_A),
        not_after: new Date(now + ROTATION_OVERLAP_MS).toISOString(),
      }),
      {
        key_id: KEY_B,
        public_key: publicKeyOf(SEED_B),
        not_before: rotatedAt,
        not_after: null,
        revoked: false,
      },
    ]);
    expect(second.envelope.signing_key_id).toBe(KEY_B);
    // Published at the moment of its first signature, never after it.
    expect(rotatedAt <= second.created_at).toBe(true);
    // Both still outstanding: the one signed before the rotation verifies with the old key.
    const records = listed(await list(host, host.tokens["host-b"]));
    expect(records.map((record) => record.id)).toEqual([first.id, second.id]);
    for (const record of records) expect(verifiesWith(record, keys)).toBe(true);

    now += ROTATION_OVERLAP_MS + 1;
    await host.server.dispatches.create(dispatchTo());
    expect((await published(host)).keys.map((key) => key.key_id)).toEqual([KEY_B]);
  });

  it("should publish a rotated key on its sweep, with no dispatch signed", async () => {
    const host = await newHost({ sweepMs: 20 });
    await writeKey(host.env, SEED_B, `${KEY_FILE}-2`);
    await host.env.write(config({ keyId: KEY_B, keyRef: `state:${KEY_FILE}-2` }));
    expect(
      await until(async () => (await published(host)).keys.some((key) => key.key_id === KEY_B)),
    ).toBe(true);
    expect(await bodyFiles(host)).toEqual([]);
  });

  it("should refuse to sign with a key id already published for another key", async () => {
    const host = await newHost();
    await writeKey(host.env, SEED_B);
    await expect(host.server.dispatches.create(dispatchTo())).rejects.toThrow(
      `[auth] signing_key_id ${KEY_A} is already published for another key; give a new key a new signing_key_id`,
    );
    expect((await published(host)).keys).toEqual([
      expect.objectContaining({ key_id: KEY_A, public_key: publicKeyOf(SEED_A) }),
    ]);
  });
});

describe("the published allowlist (T-W0.2)", () => {
  it("should publish this host's allowlist and republish an edit on its sweep", async () => {
    const host = await newHost({ sweepMs: 20 });
    const file = join(host.env.stateDir, PUBLISHED_ALLOWLIST_FILE);
    const read = async () => JSON.parse(await readFile(file, "utf8"));
    expect(await read()).toEqual({ version: 1, allow_repos: [repoName(store.dir), WORK].sort() });
    await host.env.write(config({ allowRepos: [repoName(store.dir), WORK, "third-repo"] }));
    expect(await until(async () => (await read()).allow_repos.includes("third-repo"))).toBe(true);
    await host.env.write(config({ allowRepos: null }));
    expect(await until(async () => (await read()).allow_repos.length === 0)).toBe(true);
    expect((await read()).unreadable).toContain("[hosts] allow_repos is missing");
  });
});

describe("the work queue's prompt store (T-W0.3)", () => {
  let queue: FakeQueue;
  beforeAll(async () => {
    queue = await startFakeQueue();
    cleanup.push(() => queue.close());
  });

  it("should serve the queue's prompt store through the same endpoints where [queue] url is set", async () => {
    queue.addTask(WORK, "work-1");
    const host = await newHost({ text: config({ extra: `[queue]\nurl = "${queue.url}"` }) });
    expect(host.server.dispatches.store.kind).toBe("queue");
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    const id = dispatch.record.id;
    expect(queue.prompts).toHaveLength(1);
    expect(queue.prompts[0]?.text).toContain(id);
    expect(JSON.stringify(queue.requests)).not.toContain("résumé");

    expect(listed(await list(host, host.tokens["host-b"]))).toEqual([dispatch.record]);
    const fetched = await bodyBytes(host, id, host.tokens["host-b"] as string);
    expect(Buffer.from(await fetched.arrayBuffer()).equals(Buffer.from(BODY, "utf8"))).toBe(true);
    expect((await body(host, id, host.tokens["host-c"])).status).toBe(404);

    const post = (state: string) =>
      receipt(host, id, host.tokens["host-b"], { session: TARGET.session, state });
    expect((await post("taken")).status).toBe(204);
    expect(queue.prompts[0]?.status).toBe("acknowledged");
    expect((await post("acted")).status).toBe(204);
    expect(queue.prompts[0]?.status).toBe("consumed");
    expect(await bodyFiles(host)).not.toContain(id);
    expect((await host.server.dispatches.store.get(id))?.tombstone?.cause).toBe("acted");
  });

  it("should answer an empty 503, not a refusal, while the queue cannot be reached", async () => {
    queue.addTask(WORK, "work-1");
    const host = await newHost({ text: config({ extra: `[queue]\nurl = "${queue.url}"` }) });
    const { dispatch } = await host.server.dispatches.create(dispatchTo());
    queue.down = true;
    try {
      const reply = await receipt(host, dispatch.record.id, host.tokens["host-b"], {
        session: TARGET.session,
        state: "taken",
      });
      expect(observable(reply)).toMatchObject({ status: 503, text: "" });
    } finally {
      queue.down = false;
    }
    expect((await host.server.dispatches.store.get(dispatch.record.id))?.state).toBe("queued");
  });

  it("should refuse to start when [dispatch] record asks for the queue and no [queue] url is set", async () => {
    const env = await hostEnv(config({ extra: `[dispatch]\nrecord = "queue"` }));
    cleanup.push(env.remove);
    await expect(start(env)).rejects.toThrow(
      new StartRefused(
        `the dispatch store cannot open: [dispatch] record = "queue" in ${env.configFile} needs [queue] url`,
      ),
    );
  });
});
