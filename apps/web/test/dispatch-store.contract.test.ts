import {
  appendFile,
  chmod,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DispatchRecord,
  type DispatchStore,
  DispatchStoreError,
  type DispatchTarget,
} from "@beads-ui/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BODIES_DIR } from "../server/dispatch-store/common.ts";
import { JOURNAL_FILE, openLocalDispatchStore } from "../server/dispatch-store/local.ts";
import {
  CREATED_EVENT,
  openQueueDispatchStore,
  pointerText,
} from "../server/dispatch-store/queue.ts";
import {
  bodyDigest,
  MalformedDispatch,
  signDispatch,
  signingKeySource,
} from "../server/envelope.ts";
import { type FakeQueue, startFakeQueue } from "./fake-queue.ts";

/** RFC 8032 section 7.1 TEST 1, the golden vectors' published test seed; it signs nothing real. */
const TEST_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const source = signingKeySource(async () => ({ keyId: "host-a-20261109", secret: TEST_SEED }));

const TARGET: DispatchTarget = { session: "session-a", host: "host-a" };
const OTHER: DispatchTarget = { session: "session-b", host: "host-a" };
const TASK = { repo: "demo-repo", id: "demo-1" };
const CREATED = "2026-11-09T05:00:00.000Z";
const EXPIRES = "2026-11-09T07:00:00.000Z";

let serial = 0;
const ulid = () => `01JD0${String(++serial).padStart(21, "0")}`;

interface Made {
  record: DispatchRecord;
  body: Uint8Array;
  text: string;
}

async function dispatch(
  options: { target?: DispatchTarget; expires_at?: string; created_at?: string } = {},
): Promise<Made> {
  const id = ulid();
  const text = `Body of dispatch ${id}: pick up the next ready task.\n`;
  const body = new TextEncoder().encode(text);
  const record = await signDispatch(
    {
      id,
      task: TASK,
      target: options.target ?? TARGET,
      kind: "prompt",
      body_ref: `prompt-store:${id}`,
      body_digest: bodyDigest(body),
      arm_goal: true,
      created_by: "sergei",
      created_at: options.created_at ?? CREATED,
      expires_at: options.expires_at ?? EXPIRES,
    },
    source,
  );
  return { record, body, text };
}

const receipt = (state: "taken" | "acted" | "failed", at: string, reason?: string) => ({
  state,
  ...TARGET,
  at,
  ...(reason === undefined ? {} : { reason }),
});

async function filesHolding(dir: string, text: string): Promise<string[]> {
  const holding: string[] = [];
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    if ((await readFile(path, "utf8")).includes(text)) holding.push(path);
  }
  return holding;
}

let queue: FakeQueue;
beforeAll(async () => {
  queue = await startFakeQueue();
});
afterAll(async () => {
  await queue?.close();
});

interface Implementation {
  name: "local" | "queue";
  open(dir: string): Promise<DispatchStore>;
  /** Makes the store's next write fail the way that back end fails. */
  breakWrites(dir: string): Promise<void>;
}

const implementations: Implementation[] = [
  {
    name: "local",
    open: (dir) => openLocalDispatchStore(dir),
    breakWrites: (dir) => chmod(join(dir, JOURNAL_FILE), 0o400),
  },
  {
    name: "queue",
    open: (dir) => openQueueDispatchStore({ url: queue.url, dir }),
    breakWrites: async () => {
      queue.down = true;
    },
  },
];

describe.each(implementations)("the $name dispatch store (T-W0.5 contract)", (implementation) => {
  let dir: string;
  let store: DispatchStore;

  beforeEach(async () => {
    queue.reset();
    queue.addTask(TASK.repo, TASK.id);
    dir = await mkdtemp(join(tmpdir(), "beads-ui-dispatch-store-"));
    store = await implementation.open(dir);
  });

  afterEach(async () => {
    queue.down = false;
    await chmod(dir, 0o700);
    for (const entry of await readdir(dir, { recursive: true, withFileTypes: true }))
      await chmod(join(entry.parentPath, entry.name), 0o700);
    await rm(dir, { recursive: true });
  });

  it("should give back the record, its body and a queued state when a dispatch is created and read", async () => {
    const made = await dispatch();
    const created = await store.create(made.record, made.body);
    expect(created.created).toBe(true);
    const read = await store.get(made.record.id);
    expect(read?.record).toEqual(made.record);
    expect(read?.state).toBe("queued");
    expect(read?.receipts).toEqual([]);
    expect(new TextDecoder().decode(await store.body(made.record.id))).toBe(made.text);
    expect((await store.outstanding(TARGET)).map((d) => d.record.id)).toEqual([made.record.id]);
    expect(await store.outstanding(OTHER)).toEqual([]);
  });

  it("should keep one record when the same dispatch id is written twice", async () => {
    const made = await dispatch();
    await store.create(made.record, made.body);
    const again = await store.create(made.record, made.body);
    expect(again.created).toBe(false);
    expect(again.dispatch.record).toEqual(made.record);
    expect(await store.outstanding(TARGET)).toHaveLength(1);
    const reopened = await implementation.open(dir);
    expect(await reopened.outstanding(TARGET)).toHaveLength(1);
  });

  it("should record taken then acted, delete the body and keep the record and receipts when a dispatch is consumed", async () => {
    const made = await dispatch();
    await store.create(made.record, made.body);
    const taken = await store.receipt(made.record.id, receipt("taken", "2026-11-09T05:01:00.000Z"));
    expect(taken.ok && taken.dispatch.state).toBe("taken");
    const acted = await store.receipt(made.record.id, receipt("acted", "2026-11-09T05:02:00.000Z"));
    expect(acted.ok && acted.dispatch.state).toBe("acted");
    const read = await store.get(made.record.id);
    expect(read?.record).toEqual(made.record);
    expect(read?.receipts.map((r) => r.state)).toEqual(["taken", "acted"]);
    expect(read?.tombstone).toEqual({ at: "2026-11-09T05:02:00.000Z", cause: "acted" });
    expect(await store.body(made.record.id)).toBeUndefined();
    expect(await filesHolding(dir, made.text)).toEqual([]);
    expect(await store.outstanding(TARGET)).toEqual([]);
  });

  it("should record the reason and delete the body when the receiver marks a dispatch failed", async () => {
    const made = await dispatch();
    await store.create(made.record, made.body);
    await store.receipt(made.record.id, receipt("taken", "2026-11-09T05:01:00.000Z"));
    const failed = await store.receipt(
      made.record.id,
      receipt("failed", "2026-11-09T05:02:00.000Z", "body-digest-mismatch"),
    );
    expect(failed.ok && failed.dispatch.state).toBe("failed");
    const read = await store.get(made.record.id);
    expect(read?.machine.reason).toBe("body-digest-mismatch");
    expect(read?.tombstone?.cause).toBe("failed");
    expect(await store.body(made.record.id)).toBeUndefined();
  });

  it("should refuse a receipt from a session the dispatch is not addressed to", async () => {
    const made = await dispatch();
    await store.create(made.record, made.body);
    for (const wrong of [OTHER, { session: TARGET.session, host: "host-b" }]) {
      const refused = await store.receipt(made.record.id, {
        state: "taken",
        ...wrong,
        at: "2026-11-09T05:01:00.000Z",
      });
      expect(refused).toMatchObject({ ok: false, problem: "wrong-target" });
    }
    expect((await store.get(made.record.id))?.state).toBe("queued");
  });

  it("should refuse a receipt the delivery states do not allow, and one for an unknown id", async () => {
    const made = await dispatch();
    await store.create(made.record, made.body);
    const early = await store.receipt(made.record.id, receipt("acted", "2026-11-09T05:01:00.000Z"));
    expect(early).toMatchObject({ ok: false, problem: "rejected" });
    expect((await store.get(made.record.id))?.state).toBe("queued");
    expect(await store.body(made.record.id)).toBeDefined();
    const unknown = await store.receipt(ulid(), receipt("taken", "2026-11-09T05:01:00.000Z"));
    expect(unknown).toMatchObject({ ok: false, problem: "unknown-dispatch" });
  });

  it("should expire a dispatch past its expires_at, delete its body and leave one not yet due", async () => {
    const due = await dispatch({ expires_at: "2026-11-09T05:30:00.000Z" });
    const later = await dispatch();
    await store.create(due.record, due.body);
    await store.create(later.record, later.body);
    expect(await store.expire("2026-11-09T05:30:00.000Z")).toEqual([due.record.id]);
    const read = await store.get(due.record.id);
    expect(read?.state).toBe("expired");
    expect(read?.tombstone?.cause).toBe("expired");
    expect(await store.body(due.record.id)).toBeUndefined();
    expect(await filesHolding(dir, due.text)).toEqual([]);
    expect((await store.outstanding(TARGET)).map((d) => d.record.id)).toEqual([later.record.id]);
    const late = await store.receipt(due.record.id, receipt("taken", "2026-11-09T05:31:00.000Z"));
    expect(late).toMatchObject({ ok: false, problem: "rejected" });
    expect(await store.expire("2026-11-09T05:30:00.000Z")).toEqual([]);
  });

  it("should recover every outstanding dispatch and its receipts when the server restarts", async () => {
    const first = await dispatch({ created_at: "2026-11-09T05:00:00.000Z" });
    const second = await dispatch({ created_at: "2026-11-09T05:00:01.000Z" });
    await store.create(first.record, first.body);
    await store.create(second.record, second.body);
    await store.receipt(first.record.id, receipt("taken", "2026-11-09T05:01:00.000Z"));
    const restarted = await implementation.open(dir);
    const outstanding = await restarted.outstanding(TARGET);
    expect(outstanding.map((d) => d.record.id)).toEqual([first.record.id, second.record.id]);
    expect(outstanding.map((d) => d.state)).toEqual(["taken", "queued"]);
    expect(outstanding[0]?.receipts.map((r) => r.state)).toEqual(["taken"]);
    expect(new TextDecoder().decode(await restarted.body(second.record.id))).toBe(second.text);
    const acted = await restarted.receipt(
      first.record.id,
      receipt("acted", "2026-11-09T05:02:00.000Z"),
    );
    expect(acted.ok).toBe(true);
  });

  it("should refuse a new dispatch, say why and store nothing when its writes fail", async () => {
    const before = await dispatch();
    await store.create(before.record, before.body);
    await implementation.breakWrites(dir);
    const made = await dispatch();
    const attempt = store.create(made.record, made.body);
    await expect(attempt).rejects.toThrow(DispatchStoreError);
    await expect(attempt).rejects.toThrow(/cannot write|refused|answered|reached/);
    queue.down = false;
    expect(await store.get(made.record.id)).toBeUndefined();
    expect(await filesHolding(dir, made.text)).toEqual([]);
    expect((await store.outstanding(TARGET)).map((d) => d.record.id)).toEqual([before.record.id]);
  });

  it("should refuse a malformed record and a body that does not match its digest", async () => {
    const made = await dispatch();
    const unsigned = { ...made.record, envelope: { ...made.record.envelope, version: 2 } };
    await expect(store.create(unsigned as unknown as DispatchRecord, made.body)).rejects.toThrow(
      MalformedDispatch,
    );
    await expect(
      store.create(made.record, new TextEncoder().encode("another body")),
    ).rejects.toThrow("differs from body_digest");
    expect(await store.get(made.record.id)).toBeUndefined();
  });

  it("should drop a tombstoned body at compaction when deleting it at consumption failed", async () => {
    const made = await dispatch();
    await store.create(made.record, made.body);
    await store.receipt(made.record.id, receipt("taken", "2026-11-09T05:01:00.000Z"));
    await chmod(join(dir, BODIES_DIR), 0o500);
    await store.receipt(made.record.id, receipt("acted", "2026-11-09T05:02:00.000Z"));
    expect(await store.body(made.record.id)).toBeUndefined();
    expect(await filesHolding(dir, made.text)).toHaveLength(1);
    await chmod(join(dir, BODIES_DIR), 0o700);
    await store.compact();
    expect(await filesHolding(dir, made.text)).toEqual([]);
    expect((await store.get(made.record.id))?.receipts.map((r) => r.state)).toEqual([
      "taken",
      "acted",
    ]);
  });

  it("should keep an outstanding body through compaction", async () => {
    const made = await dispatch();
    await store.create(made.record, made.body);
    await store.compact();
    expect(new TextDecoder().decode(await store.body(made.record.id))).toBe(made.text);
  });

  it("should back up records and receipts and never a body", async () => {
    const made = await dispatch();
    await store.create(made.record, made.body);
    await store.receipt(made.record.id, receipt("taken", "2026-11-09T05:01:00.000Z"));
    const destination = join(dir, "backup");
    const written = await store.backup(destination);
    expect(written.length).toBeGreaterThan(0);
    const copied = (await Promise.all(written.map((path) => readFile(path, "utf8")))).join("\n");
    expect(copied).toContain(made.record.id);
    expect(await filesHolding(destination, made.text)).toEqual([]);
  });

  it("should keep its state files private to the server's user", async () => {
    const made = await dispatch();
    await store.create(made.record, made.body);
    for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
      const mode = (await stat(join(entry.parentPath, entry.name))).mode & 0o777;
      expect(mode & 0o077).toBe(0);
    }
  });
});

describe("the queue-backed dispatch store against the queue's routes", () => {
  let dir: string;

  beforeEach(async () => {
    queue.reset();
    queue.addTask(TASK.repo, TASK.id);
    dir = await mkdtemp(join(tmpdir(), "beads-ui-dispatch-queue-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("should file a pointer prompt for the target session and send the queue no body", async () => {
    const store = await openQueueDispatchStore({ url: queue.url, dir });
    const made = await dispatch();
    await store.create(made.record, made.body);
    expect(queue.prompts).toHaveLength(1);
    expect(queue.prompts[0]).toMatchObject({
      repo: TASK.repo,
      task_id: TASK.id,
      kind: "custom",
      text: pointerText(made.record),
      target_session: TARGET.session,
      created_by: "sergei",
      status: "queued",
    });
    expect(queue.events.find((e) => e.kind === CREATED_EVENT)?.payload?.record).toEqual(
      made.record,
    );
    expect(queue.requests.some((text) => text.includes(made.text.trim()))).toBe(false);
  });

  it("should move the queue's prompt to acknowledged when taken and consumed when acted on", async () => {
    const store = await openQueueDispatchStore({ url: queue.url, dir });
    const made = await dispatch();
    await store.create(made.record, made.body);
    await store.receipt(made.record.id, receipt("taken", "2026-11-09T05:01:00.000Z"));
    expect(queue.prompts[0]?.status).toBe("acknowledged");
    await store.receipt(made.record.id, receipt("acted", "2026-11-09T05:02:00.000Z"));
    expect(queue.prompts[0]?.status).toBe("consumed");
  });

  it("should consume the queue's prompt when the dispatch expires", async () => {
    const store = await openQueueDispatchStore({ url: queue.url, dir });
    const made = await dispatch({ expires_at: "2026-11-09T05:30:00.000Z" });
    await store.create(made.record, made.body);
    await store.expire("2026-11-09T06:00:00.000Z");
    expect(queue.prompts[0]?.status).toBe("consumed");
  });

  it("should refuse the dispatch with the queue's reason when the queue refuses the prompt", async () => {
    const store = await openQueueDispatchStore({ url: queue.url, dir });
    queue.refusePrompts = "invalid_transition";
    const made = await dispatch();
    await expect(store.create(made.record, made.body)).rejects.toThrow(
      "the work queue refused /api/queue/prompts with 409: invalid_transition",
    );
    expect(await store.get(made.record.id)).toBeUndefined();
    expect(await filesHolding(dir, made.text)).toEqual([]);
  });

  it("should refuse a dispatch for a task the queue does not hold", async () => {
    const store = await openQueueDispatchStore({ url: queue.url, dir });
    const made = await dispatch();
    queue.reset();
    await expect(store.create(made.record, made.body)).rejects.toThrow(
      `the work queue holds no task ${TASK.repo}/${TASK.id}`,
    );
    expect(queue.prompts).toEqual([]);
  });

  it("should keep one record when a dispatch is written again after the local index is lost", async () => {
    const made = await dispatch();
    await (await openQueueDispatchStore({ url: queue.url, dir })).create(made.record, made.body);
    const freshDir = await mkdtemp(join(tmpdir(), "beads-ui-dispatch-queue-"));
    try {
      const fresh = await openQueueDispatchStore({ url: queue.url, dir: freshDir });
      const again = await fresh.create(made.record, made.body);
      expect(again.created).toBe(false);
      expect(queue.prompts).toHaveLength(1);
      expect((await fresh.get(made.record.id))?.record).toEqual(made.record);
    } finally {
      await rm(freshDir, { recursive: true });
    }
  });
});

describe("the local dispatch store's journal", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "beads-ui-dispatch-local-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("should recover the whole lines and keep appending when a crash tore the last line", async () => {
    const store = await openLocalDispatchStore(dir);
    const first = await dispatch();
    await store.create(first.record, first.body);
    await appendFile(join(dir, JOURNAL_FILE), '{"op":"receipt","id":"');
    const reopened = await openLocalDispatchStore(dir);
    expect((await reopened.get(first.record.id))?.state).toBe("queued");
    const second = await dispatch();
    await reopened.create(second.record, second.body);
    const again = await openLocalDispatchStore(dir);
    expect((await again.outstanding(TARGET)).map((d) => d.record.id)).toEqual([
      first.record.id,
      second.record.id,
    ]);
  });

  it("should refuse to open when a line before the last cannot be read", async () => {
    const store = await openLocalDispatchStore(dir);
    const made = await dispatch();
    await store.create(made.record, made.body);
    const journal = join(dir, JOURNAL_FILE);
    await writeFile(journal, `not json\n${await readFile(journal, "utf8")}`);
    await expect(openLocalDispatchStore(dir)).rejects.toThrow(
      `the dispatch store's ${JOURNAL_FILE} line 1 is unreadable`,
    );
  });
});
