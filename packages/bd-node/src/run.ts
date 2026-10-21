import { type ExecFileException, execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import type { BdArgv } from "@beads-ui/core";

export const BD_INSTALL_PAGE = "https://github.com/steveyegge/beads";
export const DEFAULT_TIMEOUT_MS = 10_000;
// execFile's default of 1 MiB is smaller than a whole-store `bd list` on a large store.
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}

export type RunOutcome =
  | { kind: "exited"; exitCode: number; stdout: string; stderr: string }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "unrunnable"; exitCode: number | null; stderr: string; message: string };

/** The subcommand a message names, such as `bd list`. */
export function commandName(argv: BdArgv): string {
  return argv.slice(0, 2).join(" ");
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function interpret(
  argv: BdArgv,
  options: RunOptions,
  error: ExecFileException,
  stdout: string,
  stderr: string,
): Promise<RunOutcome> {
  const bin = argv[0] ?? "bd";
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return {
      kind: "unrunnable",
      exitCode: null,
      stderr,
      message: `${commandName(argv)} wrote more than ${MAX_OUTPUT_BYTES} bytes`,
    };
  }
  if (error.killed === true) return { kind: "timeout", timeoutMs: options.timeoutMs };
  if (typeof error.code === "number") {
    return { kind: "exited", exitCode: error.code, stdout, stderr };
  }
  if (error.code === "ENOENT") {
    // spawn reports a missing cwd as ENOENT on the binary, so check the directory first.
    const message = (await isDirectory(options.cwd))
      ? `${bin} is not on PATH. Install Beads from ${BD_INSTALL_PAGE} and put ${bin} on PATH.`
      : `the store directory ${options.cwd} does not exist`;
    return { kind: "unrunnable", exitCode: null, stderr, message };
  }
  if (error.signal) {
    return {
      kind: "unrunnable",
      exitCode: null,
      stderr,
      message: `${commandName(argv)} was killed by ${error.signal}`,
    };
  }
  return {
    kind: "unrunnable",
    exitCode: null,
    stderr,
    message: `${commandName(argv)} could not run: ${String(error.code ?? error.message)}`,
  };
}

/** Runs one bd argv without a shell. Never rejects for a failure of bd itself. */
export function runBd(argv: BdArgv, options: RunOptions): Promise<RunOutcome> {
  const [bin, ...args] = argv;
  if (bin === undefined) throw new RangeError("a bd argv needs the binary as argv[0]");
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      {
        cwd: options.cwd,
        env: options.env ?? process.env,
        timeout: options.timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
        encoding: "utf8",
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ kind: "exited", exitCode: 0, stdout, stderr });
          return;
        }
        interpret(argv, options, error, stdout, stderr).then(resolve);
      },
    );
  });
}
