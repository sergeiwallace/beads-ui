import {
  type BdArgv,
  closeArgv,
  createArgv,
  type Issue,
  listArgv,
  type ParseResult,
  parseBdCreatedId,
  parseBdList,
  parseBdReady,
  parseBdShow,
  parseBdStatuses,
  type QuickAdd,
  readyArgv,
  STALE_WRITE_EXIT,
  type Status,
  showArgv,
  statusesArgv,
} from "@beads-ui/core";
import type { BdResult, Failed, NotFound } from "./result.ts";
import { commandName, DEFAULT_TIMEOUT_MS, type RunOutcome, runBd } from "./run.ts";
import { type UpdateFields, type UpdateGuard, updateArgv } from "./update.ts";

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

export interface UpdateOptions extends CallOptions, UpdateGuard {}

export interface CreateOptions extends CallOptions {
  parent?: string;
}

export interface BdClient {
  list(options?: CallOptions): Promise<BdResult<Issue[]>>;
  show(id: string, options?: CallOptions): Promise<BdResult<Issue>>;
  statuses(options?: CallOptions): Promise<BdResult<Status[]>>;
  ready(options?: CallOptions): Promise<BdResult<Issue[]>>;
  /** One bd call; a stale guard returns `stale` and is never retried. */
  update(id: string, fields: UpdateFields, options?: UpdateOptions): Promise<BdResult<void>>;
  /** Returns the new issue's hash id; display-id minting is a later step over it (D-9). */
  create(quickAdd: QuickAdd, options?: CreateOptions): Promise<BdResult<string>>;
  close(id: string, options?: CallOptions): Promise<BdResult<void>>;
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

// bd 1.3.1 on a missing id: exit 1, `Issue <id> not found` on stderr, and with --json
// `{"error": "no issues found matching the provided IDs"}` on stdout.
const NOT_FOUND = /\bnot found\b|no issues? found/i;

function notFound(id: string, out: Exited): NotFound | undefined {
  if (out.exitCode === 0 || !(NOT_FOUND.test(out.stderr) || NOT_FOUND.test(out.stdout))) {
    return undefined;
  }
  return { kind: "notFound", id, stderr: out.stderr };
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

// Node's timer ceiling. execFile reads 0 as no timeout, throws on a negative, fractional or
// non-finite value, and turns one above this into 1 ms.
const MAX_TIMEOUT_MS = 2_147_483_647;

function invalidTimeout(owner: string, value: number | undefined): Failed | undefined {
  if (value === undefined || (Number.isInteger(value) && value > 0 && value <= MAX_TIMEOUT_MS)) {
    return undefined;
  }
  return {
    kind: "failed",
    exitCode: null,
    stderr: "",
    message: `${owner} timeoutMs must be a whole number of milliseconds from 1 to ${MAX_TIMEOUT_MS}, got ${value}`,
  };
}

export function createBdClient(options: BdClientOptions): BdClient {
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function call<T>(
    argv: BdArgv,
    callOptions: CallOptions | undefined,
    onExit: (out: Exited) => BdResult<T>,
  ): Promise<BdResult<T>> {
    const invalid =
      invalidTimeout("the client's", options.timeoutMs) ??
      invalidTimeout("the call's", callOptions?.timeoutMs);
    if (invalid !== undefined) return invalid;
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
    show(id, callOptions) {
      const argv = showArgv(id);
      return call(argv, callOptions, (out) => {
        const missing = notFound(id, out);
        if (missing !== undefined) return missing;
        const result = parsed(argv, out, parseBdShow);
        if (result.kind !== "ok") return result;
        const [issue] = result.value;
        return issue === undefined
          ? { kind: "notFound", id, stderr: out.stderr }
          : { kind: "ok", value: issue };
      });
    },
    statuses(callOptions) {
      const argv = statusesArgv();
      return call(argv, callOptions, (out) => parsed(argv, out, parseBdStatuses));
    },
    ready(callOptions) {
      const argv = readyArgv();
      return call(argv, callOptions, (out) => parsed(argv, out, parseBdReady));
    },
    update(id, fields, updateOptions = {}) {
      const guarded =
        updateOptions.ifStatus !== undefined || updateOptions.ifAssignee !== undefined;
      const argv = updateArgv(id, fields, updateOptions);
      return call(argv, updateOptions, (out) => {
        if (out.exitCode === 0) return { kind: "ok", value: undefined };
        if (guarded && out.exitCode === STALE_WRITE_EXIT) {
          return { kind: "stale", id, exitCode: STALE_WRITE_EXIT, stderr: out.stderr };
        }
        return notFound(id, out) ?? exitFailure(argv, out);
      });
    },
    create(quickAdd, createOptions = {}) {
      const { parent } = createOptions;
      const argv = createArgv(quickAdd, parent === undefined ? {} : { parent });
      return call(argv, createOptions, (out) => parsed(argv, out, parseBdCreatedId));
    },
    close(id, callOptions) {
      const argv = closeArgv(id);
      return call(argv, callOptions, (out) => {
        if (out.exitCode === 0) return { kind: "ok", value: undefined };
        return notFound(id, out) ?? exitFailure(argv, out);
      });
    },
  };
}
