// The local append-only dispatch store (web app design D-14, T-W0.5), used where no `queue.url` is
// set. Records, receipts and tombstones are lines appended to one journal in the server's state
// directory; bodies live apart in the body store, so a backup of the journal holds no body.

import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type AnnotateResult,
  type CreateResult,
  type DispatchEntry,
  type DispatchRecord,
  type DispatchStore,
  DispatchStoreError,
  type DispatchTarget,
  foldDispatch,
  isOutstanding,
  LADDER_OPS,
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

export const JOURNAL_FILE = "dispatches.jsonl";

type JournalLine = { op: "create"; record: DispatchRecord } | DispatchEntry;

interface Held {
  record: DispatchRecord;
  entries: DispatchEntry[];
}

function parseLine(text: string, number: number): JournalLine {
  try {
    const line = JSON.parse(text) as JournalLine;
    if (line.op === "create") return { op: "create", record: checkSignedRecord(line.record) };
    if (line.op === "receipt" || line.op === "expired" || line.op === "tombstone") return line;
    if (LADDER_OPS.includes(line.op)) return line;
  } catch {
    // Falls through to the refusal below.
  }
  throw new DispatchStoreError(`the dispatch store's ${JOURNAL_FILE} line ${number} is unreadable`);
}

export class LocalDispatchStore implements DispatchStore {
  readonly kind = "local" as const;
  private readonly journal: LineFile;
  private readonly bodies: BodyStore;
  private readonly held = new Map<string, Held>();
  private readonly serial = new Serial();

  private constructor(dir: string) {
    this.journal = new LineFile(join(dir, JOURNAL_FILE));
    this.bodies = new BodyStore(dir);
  }

  /** Opens the store in `dir`, recovering every dispatch, receipt and tombstone it holds. */
  static async open(dir: string): Promise<LocalDispatchStore> {
    const store = new LocalDispatchStore(dir);
    (await store.journal.read()).forEach((line, index) => {
      if (line !== "") store.apply(parseLine(line, index + 1));
    });
    return store;
  }

  private apply(line: JournalLine): void {
    if (line.op === "create") {
      if (!this.held.has(line.record.id))
        this.held.set(line.record.id, { record: line.record, entries: [] });
      return;
    }
    this.held.get(line.id)?.entries.push(line);
  }

  private async append(lines: readonly JournalLine[]): Promise<void> {
    await this.journal.append(lines.map((line) => JSON.stringify(line)));
    for (const line of lines) this.apply(line);
  }

  private stored(id: string): StoredDispatch | undefined {
    const held = this.held.get(id);
    return held === undefined ? undefined : foldDispatch(held.record, held.entries);
  }

  create(record: DispatchRecord, body: Uint8Array): Promise<CreateResult> {
    return this.serial.run(async () => {
      const checked = checkCreate(record, body);
      const existing = this.stored(checked.id);
      if (existing !== undefined) return { created: false, dispatch: existing };
      await this.bodies.write(checked.id, body);
      try {
        await this.append([{ op: "create", record: checked }]);
      } catch (error) {
        await this.bodies.purge(checked.id);
        throw error;
      }
      return { created: true, dispatch: this.stored(checked.id) as StoredDispatch };
    });
  }

  async get(id: string): Promise<StoredDispatch | undefined> {
    return this.stored(id);
  }

  async body(id: string): Promise<Uint8Array | undefined> {
    const dispatch = this.stored(id);
    if (dispatch === undefined || !isOutstanding(dispatch)) return undefined;
    return this.bodies.read(id);
  }

  async outstanding(target: DispatchTarget): Promise<StoredDispatch[]> {
    return [...this.held.keys()]
      .map((id) => this.stored(id) as StoredDispatch)
      .filter(
        (dispatch) =>
          isOutstanding(dispatch) &&
          dispatch.record.target.session === target.session &&
          dispatch.record.target.host === target.host,
      )
      .sort(byCreation);
  }

  receipt(id: string, receipt: ReceiptInput): Promise<ReceiptResult> {
    return this.serial.run(async () => {
      const held = this.held.get(id);
      if (held === undefined)
        return { ok: false, problem: "unknown-dispatch", detail: `no dispatch ${id}` };
      const plan = planReceipt(held.record, held.entries, receipt);
      if (!plan.ok) return plan;
      await this.append(plan.entries);
      await this.dropBodyIfDone(id);
      return { ok: true, dispatch: this.stored(id) as StoredDispatch };
    });
  }

  annotate(id: string, entry: LadderEntry): Promise<AnnotateResult> {
    return this.serial.run(async () => {
      const held = this.held.get(id);
      if (held === undefined)
        return { ok: false, problem: "unknown-dispatch", detail: `no dispatch ${id}` };
      const plan = planAnnotate(held.record, held.entries, entry);
      if (!plan.ok) return plan;
      await this.append(plan.entries);
      return { ok: true, dispatch: this.stored(id) as StoredDispatch };
    });
  }

  expire(now: string): Promise<string[]> {
    return this.serial.run(async () => {
      const expired: string[] = [];
      for (const [id, held] of this.held) {
        const entries = planExpiry(held.record, held.entries, now);
        if (entries.length === 0) continue;
        await this.append(entries);
        await this.dropBodyIfDone(id);
        expired.push(id);
      }
      return expired;
    });
  }

  /** Deletes a finished dispatch's body; a failed delete is left for compaction. */
  private async dropBodyIfDone(id: string): Promise<void> {
    const dispatch = this.stored(id);
    if (dispatch !== undefined && !isOutstanding(dispatch)) await this.bodies.delete(id);
  }

  compact(): Promise<void> {
    return this.serial.run(async () => {
      for (const id of await this.bodies.ids()) {
        const dispatch = this.stored(id);
        if (dispatch === undefined || !isOutstanding(dispatch)) await this.bodies.purge(id);
      }
    });
  }

  backup(destination: string): Promise<string[]> {
    return this.serial.run(async () => {
      await mkdir(destination, { recursive: true, mode: 0o700 });
      const copy = join(destination, JOURNAL_FILE);
      try {
        await copyFile(this.journal.path, copy);
      } catch (error) {
        if (errorCode(error) === "ENOENT") return [];
        throw error;
      }
      return [copy];
    });
  }
}

export const openLocalDispatchStore = (dir: string): Promise<LocalDispatchStore> =>
  LocalDispatchStore.open(dir);
