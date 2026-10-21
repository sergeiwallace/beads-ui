import { type BdArgv, type Issue, listArgv, type ParseResult, parseBdList } from "@beads-ui/core";
import type { BdResult, Failed } from "./result.ts";
import { commandName, DEFAULT_TIMEOUT_MS, type RunOutcome, runBd } from "./run.ts";

export interface BdClientOptions {
  /** The repo root holding the store's `.beads/`; every bd call runs there. */
  cwd: string;
  /** Per-call default; 10 s unless set. */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface CallOptions {
  timeoutMs?: number;
}

export interface BdClient {
  list(options?: CallOptions): Promise<BdResult<Issue[]>>;
}

type Exited = Extract<RunOutcome, { kind: "exited" }>;

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}

function exitFailure(argv: BdArgv, out: Exited): Failed {
  const detail = firstLine(out.stderr) || firstLine(out.stdout);
  return {
    kind: "failed",
    exitCode: out.exitCode,
    stderr: out.stderr,
    message: `${commandName(argv)} exited ${out.exitCode}${detail === "" ? "" : `: ${detail}`}`,
  };
}

function parsed<T>(
  argv: BdArgv,
  out: Exited,
  parse: (text: string) => ParseResult<T>,
): BdResult<T> {
  if (out.exitCode !== 0) return exitFailure(argv, out);
  const result = parse(out.stdout);
  if (result.ok) return { kind: "ok", value: result.value };
  const { error } = result;
  return {
    kind: "failed",
    exitCode: 0,
    stderr: out.stderr,
    message: `${error.source} returned output the core could not read at ${error.path}: ${error.message}`,
    parseError: error,
  };
}

export function createBdClient(options: BdClientOptions): BdClient {
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call<T>(
    argv: BdArgv,
    callOptions: CallOptions | undefined,
    onExit: (out: Exited) => BdResult<T>,
  ): Promise<BdResult<T>> {
    const timeoutMs = callOptions?.timeoutMs ?? defaultTimeout;
    const run = { cwd: options.cwd, timeoutMs, ...(options.env && { env: options.env }) };
    const outcome = await runBd(argv, run);
    switch (outcome.kind) {
      case "exited":
        return onExit(outcome);
      case "timeout":
        return { kind: "timeout", command: commandName(argv), timeoutMs };
      case "unrunnable":
        return {
          kind: "failed",
          exitCode: outcome.exitCode,
          stderr: outcome.stderr,
          message: outcome.message,
        };
    }
  }

  return {
    list(callOptions) {
      const argv = listArgv();
      return call(argv, callOptions, (out) => parsed(argv, out, parseBdList));
    },
  };
}
