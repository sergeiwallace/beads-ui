// The queue-backed dispatch store (web app design D-14, T-W0.5), used where `queue.url` is set. A
// dispatch is a prompt in the work queue's prompt store, its signed record and every later entry
// are queue events on the task, and both are read back through the queue's task detail. The prompt
// row carries a pointer and the body stays in this host's body store, so a body can be deleted when
// the dispatch ends and no backup of the queue holds one. A small local index maps each dispatch
// id to its task, since the queue reads dispatches by task.

import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type AnnotateResult,
  type CreateResult,
  type DispatchEntry,
  type DispatchKind,
  type DispatchRecord,
  type DispatchStore,
  DispatchStoreError,
  type DispatchTarget,
  foldDispatch,
  isOutstanding,
  type LadderEntry,
  planAnnotate,
  planExpiry,
  planReceipt,
  type ReceiptInput,
  type ReceiptResult,
  type StoredDispatch,
} from "@beads-ui/core";
import { checkSignedRecord } from "../envelope.ts";
import { BodyStore, byCreation, checkCreate, errorCode, LineFile, Serial } from "./common.ts";

export const INDEX_FILE = "queue-index.jsonl";
export const CREATED_EVENT = "beads-ui.dispatch.created";
export const ENTRY_EVENT = "beads-ui.dispatch.entry";

/** The queue's prompt kinds (ai-core `PromptKind`) a dispatch kind is filed as. */
export const QUEUE_PROMPT_KIND: Readonly<Record<DispatchKind, string>> = {
  prompt: "custom",
  answer: "custom",
  unblock: "unblock",
  "handoff-request": "custom",
};

/** The prompt row's text: where the dispatch is, never what it says. */
export const pointerText = (record: DispatchRecord): string =>
  `beads-ui dispatch ${record.id} for ${record.task.repo}/${record.task.id}: fetch it through ` +
  "the receiver API and verify its envelope before acting.";

interface IndexLine {
  id: string;
  repo: string;
  task_id: string;
}

/** One `QueueEventOut` row of the queue's task detail. */
interface QueueEvent {
  id: string;
  ts: string;
  kind: string;
  payload?: Record<string, unknown> | null;
}

interface TaskDetail {
  events: QueueEvent[];
}

interface Found {
  record: DispatchRecord;
  entries: DispatchEntry[];
  promptId: string;
}

export interface QueueStoreOptions {
  /** `queue.url`: the work queue's base URL. */
  url: string;
  /** The server's state directory: the body store and the dispatch index. */
  dir: string;
  fetch?: typeof fetch;
}

export class QueueDispatchStore implements DispatchStore {
  readonly kind = "queue" as const;
  private readonly url: string;
  private readonly index: LineFile;
  private readonly bodies: BodyStore;
  private readonly fetch: typeof fetch;
  private readonly located = new Map<string, IndexLine>();
  /** Dispatches seen acted on, failed or expired; final states never reopen, so they are skipped. */
  private readonly closed = new Set<string>();
  private readonly serial = new Serial();

  private constructor(options: QueueStoreOptions) {
    this.url = options.url;
    this.index = new LineFile(join(options.dir, INDEX_FILE));
    this.bodies = new BodyStore(options.dir);
    this.fetch = options.fetch ?? fetch;
  }

  /** Opens the store, reading the dispatch index from the state directory. */
  static async open(options: QueueStoreOptions): Promise<QueueDispatchStore> {
    const store = new QueueDispatchStore(options);
    (await store.index.read()).forEach((line, index) => {
      if (line === "") return;
      try {
        const located = JSON.parse(line) as IndexLine;
        store.located.set(located.id, located);
      } catch {
        throw new DispatchStoreError(
          `the dispatch store's ${INDEX_FILE} line ${index + 1} is unreadable`,
        );
      }
    });
    return store;
  }

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<Response> {
    let response: Response;
    try {
      const init: RequestInit = { method, headers: { accept: "application/json" } };
      if (body !== undefined) {
        init.headers = { accept: "application/json", "content-type": "application/json" };
        init.body = JSON.stringify(body);
      }
      response = await this.fetch(new URL(path, this.url), init);
    } catch (error) {
      throw new DispatchStoreError(
        `the work queue cannot be reached: ${(error as Error).cause ?? error}`,
      );
    }
    return response;
  }

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await this.call("POST", path, body);
    const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const detail = answer.detail as { reason?: string } | string | undefined;
      const reason = typeof detail === "object" ? detail?.reason : detail;
      throw new DispatchStoreError(
        `the work queue refused ${path} with ${response.status}${reason ? `: ${reason}` : ""}`,
      );
    }
    return answer;
  }

  private async taskDetail(repo: string, taskId: string): Promise<TaskDetail | undefined> {
    const path = `/api/queue/tasks/${encodeURIComponent(repo)}/${encodeURIComponent(taskId)}`;
    const response = await this.call("GET", path);
    if (response.status === 404) return undefined;
    if (!response.ok)
      throw new DispatchStoreError(`the work queue answered ${response.status} for ${path}`);
    return (await response.json()) as TaskDetail;
  }

  private static find(detail: TaskDetail, id: string): Found | undefined {
    let found: Found | undefined;
    for (const event of detail.events) {
      const payload = event.payload ?? {};
      if (found === undefined && event.kind === CREATED_EVENT) {
        const record = payload.record as DispatchRecord | undefined;
        if (record?.id !== id) continue;
        found = {
          record: checkSignedRecord(record),
          entries: [],
          promptId: String(payload.prompt_id),
        };
      } else if (found !== undefined && event.kind === ENTRY_EVENT) {
        const entry = payload.entry as DispatchEntry | undefined;
        if (entry?.id === id) found.entries.push(entry);
      }
    }
    return found;
  }

  private async load(id: string): Promise<Found | undefined> {
    const located = this.located.get(id);
    if (located === undefined) return undefined;
    const detail = await this.taskDetail(located.repo, located.task_id);
    return detail === undefined ? undefined : QueueDispatchStore.find(detail, id);
  }

  private fold(found: Found): StoredDispatch {
    const dispatch = foldDispatch(found.record, found.entries);
    if (!isOutstanding(dispatch)) this.closed.add(found.record.id);
    return dispatch;
  }

  private async remember(line: IndexLine): Promise<void> {
    await this.index.append([JSON.stringify(line)]);
    this.located.set(line.id, line);
  }

  private async appendEntries(found: Found, entries: readonly DispatchEntry[]): Promise<void> {
    const { record } = found;
    for (const entry of entries) {
      await this.post("/api/queue/events", {
        kind: ENTRY_EVENT,
        repo: record.task.repo,
        task_id: record.task.id,
        session_id: record.target.session,
        payload: { entry },
      });
      found.entries.push(entry);
    }
  }

  create(record: DispatchRecord, body: Uint8Array): Promise<CreateResult> {
    return this.serial.run(async () => {
      const checked = checkCreate(record, body);
      const { repo, id: taskId } = checked.task;
      const detail = await this.taskDetail(repo, taskId);
      if (detail === undefined)
        throw new DispatchStoreError(`the work queue holds no task ${repo}/${taskId}`);
      const existing = QueueDispatchStore.find(detail, checked.id);
      if (existing !== undefined) {
        if (!this.located.has(checked.id))
          await this.remember({ id: checked.id, repo, task_id: taskId });
        return { created: false, dispatch: this.fold(existing) };
      }
      await this.bodies.write(checked.id, body);
      let promptId: string | undefined;
      try {
        await this.remember({ id: checked.id, repo, task_id: taskId });
        const prompt = await this.post("/api/queue/prompts", {
          task_id: taskId,
          repo,
          kind: QUEUE_PROMPT_KIND[checked.kind],
          text: pointerText(checked),
          target_session: checked.target.session,
          created_by: checked.created_by,
          autonomy: "gated",
        });
        promptId = String(prompt.id);
        await this.post("/api/queue/events", {
          kind: CREATED_EVENT,
          repo,
          task_id: taskId,
          session_id: checked.target.session,
          payload: { record: checked, prompt_id: promptId },
        });
      } catch (error) {
        await this.bodies.purge(checked.id);
        if (promptId !== undefined)
          await this.post(`/api/queue/prompts/${promptId}/consumed`, {}).catch(() => undefined);
        throw error;
      }
      return {
        created: true,
        dispatch: this.fold({ record: checked, entries: [], promptId }),
      };
    });
  }

  async get(id: string): Promise<StoredDispatch | undefined> {
    const found = await this.load(id);
    return found === undefined ? undefined : this.fold(found);
  }

  async body(id: string): Promise<Uint8Array | undefined> {
    const dispatch = await this.get(id);
    if (dispatch === undefined || !isOutstanding(dispatch)) return undefined;
    return this.bodies.read(id);
  }

  /** Every open dispatch the index knows, each task's detail read once. */
  private async open(): Promise<Found[]> {
    const byTask = new Map<string, IndexLine[]>();
    for (const line of this.located.values()) {
      if (this.closed.has(line.id)) continue;
      const key = JSON.stringify([line.repo, line.task_id]);
      byTask.set(key, [...(byTask.get(key) ?? []), line]);
    }
    const found: Found[] = [];
    for (const lines of byTask.values()) {
      const first = lines[0] as IndexLine;
      const detail = await this.taskDetail(first.repo, first.task_id);
      if (detail === undefined) continue;
      for (const line of lines) {
        const one = QueueDispatchStore.find(detail, line.id);
        if (one !== undefined && isOutstanding(this.fold(one))) found.push(one);
      }
    }
    return found;
  }

  async outstanding(target: DispatchTarget): Promise<StoredDispatch[]> {
    return (await this.open())
      .filter(
        ({ record }) =>
          record.target.session === target.session && record.target.host === target.host,
      )
      .map((found) => this.fold(found))
      .sort(byCreation);
  }

  receipt(id: string, receipt: ReceiptInput): Promise<ReceiptResult> {
    return this.serial.run(async () => {
      const found = await this.load(id);
      if (found === undefined)
        return { ok: false, problem: "unknown-dispatch", detail: `no dispatch ${id}` };
      const plan = planReceipt(found.record, found.entries, receipt);
      if (!plan.ok) return plan;
      if (receipt.state === "taken")
        await this.post(`/api/queue/prompts/${found.promptId}/ack`, {});
      else await this.post(`/api/queue/prompts/${found.promptId}/consumed`, {});
      await this.appendEntries(found, plan.entries);
      return { ok: true, dispatch: await this.finish(found) };
    });
  }

  annotate(id: string, entry: LadderEntry): Promise<AnnotateResult> {
    return this.serial.run(async () => {
      const found = await this.load(id);
      if (found === undefined)
        return { ok: false, problem: "unknown-dispatch", detail: `no dispatch ${id}` };
      const plan = planAnnotate(found.record, found.entries, entry);
      if (!plan.ok) return plan;
      await this.appendEntries(found, plan.entries);
      return { ok: true, dispatch: this.fold(found) };
    });
  }

  expire(now: string): Promise<string[]> {
    return this.serial.run(async () => {
      const expired: string[] = [];
      for (const found of await this.open()) {
        const entries = planExpiry(found.record, found.entries, now);
        if (entries.length === 0) continue;
        await this.post(`/api/queue/prompts/${found.promptId}/consumed`, {});
        await this.appendEntries(found, entries);
        await this.finish(found);
        expired.push(found.record.id);
      }
      return expired;
    });
  }

  /** The dispatch after its new entries; a finished one's body is deleted, or left to compaction. */
  private async finish(found: Found): Promise<StoredDispatch> {
    const dispatch = this.fold(found);
    if (!isOutstanding(dispatch)) await this.bodies.delete(found.record.id);
    return dispatch;
  }

  compact(): Promise<void> {
    return this.serial.run(async () => {
      for (const id of await this.bodies.ids()) {
        const dispatch = await this.get(id);
        if (dispatch === undefined || !isOutstanding(dispatch)) await this.bodies.purge(id);
      }
    });
  }

  backup(destination: string): Promise<string[]> {
    return this.serial.run(async () => {
      await mkdir(destination, { recursive: true, mode: 0o700 });
      const copy = join(destination, INDEX_FILE);
      try {
        await copyFile(this.index.path, copy);
      } catch (error) {
        if (errorCode(error) === "ENOENT") return [];
        throw error;
      }
      return [copy];
    });
  }
}

export const openQueueDispatchStore = (options: QueueStoreOptions): Promise<QueueDispatchStore> =>
  QueueDispatchStore.open(options);
