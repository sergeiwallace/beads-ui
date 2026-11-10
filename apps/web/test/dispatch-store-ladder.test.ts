import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DispatchRecord, type DispatchStore, isHeld } from "@beads-ui/core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openLocalDispatchStore } from "../server/dispatch-store/local.ts";
import { openQueueDispatchStore } from "../server/dispatch-store/queue.ts";
import { bodyDigest, signDispatch, signingKeySource } from "../server/envelope.ts";
import { type FakeQueue, startFakeQueue } from "./fake-queue.ts";

// The dispatch ladder's entries in both dispatch stores (web app design T-W2.1, T-W2.3, D-14):
// a delivery move with the record that proves it, a hold the receiver API does not serve, each
// rung's attempt and a note, all kept across a reopen, and a move the dispatch's state forbids
// refused with nothing written. The queue store runs against the fake built from the live API.

/** RFC 8032 section 7.1 TEST 1, the golden vectors' published test seed; it signs nothing real. */
const TEST_SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const source = signingKeySource(async () => ({ keyId: "host-a-20261109", secret: TEST_SEED }));
const TARGET = { session: "session-a", host: "host-a" };
const TASK = { repo: "demo-repo", id: "demo-1" };
const AT = "2026-11-09T05:00:01.000Z";

let serial = 0;
async function dispatch(): Promise<{ record: DispatchRecord; body: Uint8Array }> {
  const id = `01JD1${String(++serial).padStart(21, "0")}`;
  const body = new TextEncoder().encode(`Body of ${id}\n`);
  const record = await signDispatch(
    {
      id,
      task: TASK,
      target: TARGET,
      kind: "prompt",
      body_ref: `body-store:${id}`,
      body_digest: bodyDigest(body),
      arm_goal: true,
      created_by: "sergei",
      created_at: "2026-11-09T05:00:00.000Z",
      expires_at: "2026-11-09T07:00:00.000Z",
    },
    source,
  );
  return { record, body };
}

let queue: FakeQueue;
beforeAll(async () => {
  queue = await startFakeQueue();
});
afterAll(async () => {
  await queue?.close();
});

const implementations = [
  { name: "local", open: (dir: string) => openLocalDispatchStore(dir) },
  { name: "queue", open: (dir: string) => openQueueDispatchStore({ url: queue.url, dir }) },
] as const;

describe.each(implementations)("the $name dispatch store's ladder entries", (implementation) => {
  let dir: string;
  let store: DispatchStore;

  beforeEach(async () => {
    queue.reset();
    queue.addTask(TASK.repo, TASK.id);
    dir = await mkdtemp(join(tmpdir(), "beads-ui-dispatch-ladder-store-"));
    store = await implementation.open(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("should record shown with its source, and each rung and note, and keep them across a reopen", async () => {
    const made = await dispatch();
    const { id } = made.record;
    await store.create(made.record, made.body);
    await store.annotate(id, {
      op: "rung",
      id,
      at: AT,
      rung: "agent-mail",
      outcome: "sent",
      detail: "exit 0",
    });
    await store.annotate(id, { op: "note", id, at: AT, source: "the composer", text: "cleared" });
    const shown = await store.annotate(id, {
      op: "delivery",
      id,
      at: AT,
      to: "shown",
      source: "shown receipt from session-a@host-a",
    });
    expect(shown.ok).toBe(true);
    const reopened = await (await implementation.open(dir)).get(id);
    expect(reopened?.state).toBe("shown");
    expect(reopened?.machine.source).toBe("shown receipt from session-a@host-a");
    expect(reopened?.rungs).toEqual([
      { rung: "agent-mail", outcome: "sent", detail: "exit 0", at: AT },
    ]);
    expect(reopened?.notes).toEqual([{ at: AT, source: "the composer", text: "cleared" }]);
  });

  it("should mark a held wait as held until it is released to queued", async () => {
    const made = await dispatch();
    const { id } = made.record;
    await store.create(made.record, made.body);
    const held = await store.annotate(id, {
      op: "delivery",
      id,
      at: AT,
      to: "waiting",
      source: "goal state reported",
      reason: "goal paused",
      hold: true,
      until: "2026-11-09T06:00:00.000Z",
    });
    expect(held.ok && isHeld(held.dispatch)).toBe(true);
    expect((await store.get(id))?.hold).toEqual({
      reason: "goal paused",
      source: "goal state reported",
      until: "2026-11-09T06:00:00.000Z",
    });
    await store.annotate(id, { op: "delivery", id, at: AT, to: "queued", source: "deliver now" });
    const released = await store.get(id);
    expect(released?.state).toBe("queued");
    expect(released?.hold).toBeUndefined();
  });

  it("should refuse a delivery move the state forbids, and an unknown dispatch, writing nothing", async () => {
    const made = await dispatch();
    const { id } = made.record;
    await store.create(made.record, made.body);
    await store.receipt(id, { state: "taken", ...TARGET, at: AT });
    const late = await store.annotate(id, {
      op: "delivery",
      id,
      at: AT,
      to: "shown",
      source: "late",
    });
    expect(late).toMatchObject({ ok: false, problem: "rejected" });
    expect((await store.get(id))?.state).toBe("taken");
    const unknown = await store.annotate("01JD1999999999999999999999", {
      op: "note",
      id: "01JD1999999999999999999999",
      at: AT,
      source: "x",
      text: "y",
    });
    expect(unknown).toMatchObject({ ok: false, problem: "unknown-dispatch" });
  });
});
