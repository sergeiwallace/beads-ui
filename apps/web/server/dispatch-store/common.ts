// What both dispatch stores share (web app design T-W0.3, T-W0.5): the body store, the append-only
// line file, the write queue and the check every new dispatch passes. Bodies live one file each in
// the server's state directory, apart from the records, so a backup of the records never holds a
// body; the work queue's prompt row carries a pointer, never the text.

import { mkdir, open, readdir, readFile, rename, truncate, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type DispatchRecord, DispatchStoreError, type StoredDispatch } from "@beads-ui/core";
import { bodyDigest, checkSignedRecord, MalformedDispatch } from "../envelope.ts";

export const BODIES_DIR = "bodies";

export const errorCode = (error: unknown): string =>
  (error as NodeJS.ErrnoException).code ?? String(error);

/** Refuses a record with a malformed shape, or a body that is not the one its digest names. */
export function checkCreate(record: DispatchRecord, body: Uint8Array): DispatchRecord {
  const checked = checkSignedRecord(record);
  if (bodyDigest(body) !== checked.body_digest)
    throw new MalformedDispatch("the body's sha256 differs from body_digest");
  return checked;
}

/** Oldest first by `created_at`, then by id, which is a ULID. */
export function byCreation(a: StoredDispatch, b: StoredDispatch): number {
  const left = `${a.record.created_at} ${a.record.id}`;
  const right = `${b.record.created_at} ${b.record.id}`;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Runs each operation after the one before it, so two writes never interleave. */
export class Serial {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation, operation);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

/**
 * An append-only file of lines. Each append is synced before it returns, so an acknowledged line
 * survives a crash; a crash mid-append can leave a last line with no newline, which was never
 * acknowledged, so it is dropped on read and cut off before the next append.
 */
export class LineFile {
  readonly path: string;
  private tornAt: number | undefined;

  constructor(path: string) {
    this.path = path;
  }

  /** The complete lines, oldest first; none when the file does not exist yet. */
  async read(): Promise<string[]> {
    let bytes: Buffer;
    try {
      bytes = await readFile(this.path);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return [];
      throw new DispatchStoreError(
        `the dispatch store cannot read ${this.path}: ${errorCode(error)}`,
      );
    }
    const end = bytes.lastIndexOf(0x0a) + 1;
    this.tornAt = end < bytes.length ? end : undefined;
    return bytes.subarray(0, end).toString("utf8").split("\n").slice(0, -1);
  }

  async append(lines: readonly string[]): Promise<void> {
    try {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      if (this.tornAt !== undefined) await truncate(this.path, this.tornAt);
      this.tornAt = undefined;
      const handle = await open(this.path, "a", 0o600);
      try {
        await handle.writeFile(`${lines.join("\n")}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      throw new DispatchStoreError(
        `the dispatch store cannot write ${this.path}: ${errorCode(error)}`,
      );
    }
  }
}

export class BodyStore {
  readonly dir: string;

  constructor(stateDir: string) {
    this.dir = join(stateDir, BODIES_DIR);
  }

  private path(id: string): string {
    return join(this.dir, id);
  }

  /** Writes the body whole or not at all: a temporary file, synced, then renamed into place. */
  async write(id: string, body: Uint8Array): Promise<void> {
    const temporary = `${this.path(id)}.tmp`;
    try {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
      const handle = await open(temporary, "w", 0o600);
      try {
        await handle.writeFile(body);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.path(id));
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw new DispatchStoreError(
        `the dispatch store cannot write a body in ${this.dir}: ${errorCode(error)}`,
      );
    }
  }

  async read(id: string): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await readFile(this.path(id)));
    } catch (error) {
      if (errorCode(error) === "ENOENT") return undefined;
      throw error;
    }
  }

  /** Deletes the body; false when it could not, which compaction retries. */
  async delete(id: string): Promise<boolean> {
    try {
      await unlink(this.path(id));
      return true;
    } catch (error) {
      return errorCode(error) === "ENOENT";
    }
  }

  /** The ids that have a body file, including any a crashed write left half-made. */
  async ids(): Promise<string[]> {
    try {
      return [...new Set((await readdir(this.dir)).map((name) => name.replace(/\.tmp$/, "")))];
    } catch (error) {
      if (errorCode(error) === "ENOENT") return [];
      throw error;
    }
  }

  /** Removes the body and any temporary file left for it. */
  async purge(id: string): Promise<void> {
    await this.delete(id);
    await unlink(`${this.path(id)}.tmp`).catch(() => undefined);
  }
}
