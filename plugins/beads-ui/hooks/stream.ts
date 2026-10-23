import type { HookStream, ProcessSpawnChunk, ProcessSpawnResult, Timer } from "claude-code";

/** What a whole streamed read came to once the child exited on its own. */
export interface Streamed {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Reads a `$.process.spawn` stream to its end. Unlike `$.process.run`, which keeps only the first
 * 4 MiB of each pipe, a spawned child's output arrives whole, so a large store's `bd list` is
 * never cut. Rejects, naming why, when the child cannot start, is ended by a signal or is still
 * running after `timeoutMs`; the deadline ends the loop, which kills the child.
 *
 * @param stream the spawned child's output, as `$.process.spawn` returns it
 * @param timeoutMs how long the child may run
 * @param after `$.clock.after`, for the deadline
 */
export async function readStream(
  stream: HookStream<ProcessSpawnChunk, ProcessSpawnResult>,
  timeoutMs: number,
  after: (ms: number, fn: () => void) => Timer,
): Promise<Streamed> {
  let timedOut = false;
  let expire: (reason: Error) => void = () => undefined;
  const deadline = new Promise<never>((_, reject) => {
    expire = reject;
  });
  const timer = after(timeoutMs, () => {
    timedOut = true;
    expire(new Error(`timed out after ${timeoutMs} ms`));
    void stream.return(undefined as never).catch(() => undefined);
  });
  const read = (async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    for (;;) {
      const step = await stream.next();
      if (timedOut) throw new Error(`timed out after ${timeoutMs} ms`);
      if (step.done === true) return { end: step.value, stdout, stderr };
      (step.value.stream === "stdout" ? stdout : stderr).push(step.value.text);
    }
  })();
  try {
    const { end, stdout, stderr } = await Promise.race([read, deadline]);
    if (end.code === null) throw new Error(`stopped by ${end.signal ?? "a signal"}`);
    return { exitCode: end.code, stdout: stdout.join(""), stderr: stderr.join("") };
  } finally {
    timer.cancel();
    read.catch(() => undefined);
  }
}
