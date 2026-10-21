import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface StubReply {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  /** Replace the stub process with a long sleep, so only a timeout ends it. */
  hang?: boolean;
}

export interface StubBd {
  dir: string;
  /** PATH holding the stub first, then the system dirs its shell script needs. */
  env: NodeJS.ProcessEnv;
  /** One entry per invocation: the argv after `bd`, space-joined. */
  calls(): Promise<string[]>;
  remove(): Promise<void>;
}

const quote = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

/** A fake `bd` in its own temp directory that logs each call and answers with `reply`. */
export async function stubBd(reply: StubReply): Promise<StubBd> {
  const dir = await mkdtemp(join(tmpdir(), "bd-node-stub-"));
  const log = join(dir, "calls.log");
  const stdout = join(dir, "stdout.txt");
  const stderr = join(dir, "stderr.txt");
  await writeFile(stdout, reply.stdout ?? "");
  await writeFile(stderr, reply.stderr ?? "");
  const body = reply.hang
    ? "exec sleep 30"
    : [`cat ${quote(stdout)}`, `cat ${quote(stderr)} >&2`, `exit ${reply.exitCode ?? 0}`].join(
        "\n",
      );
  const script = ["#!/bin/sh", `printf '%s\\n' "$*" >> ${quote(log)}`, body, ""].join("\n");
  const bin = join(dir, "bd");
  await writeFile(bin, script);
  await chmod(bin, 0o755);
  return {
    dir,
    env: { ...process.env, PATH: `${dir}:/usr/bin:/bin` },
    async calls() {
      try {
        return (await readFile(log, "utf8")).split("\n").filter((line) => line !== "");
      } catch {
        return [];
      }
    },
    remove: () => rm(dir, { recursive: true }),
  };
}
