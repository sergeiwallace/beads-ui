import type { ParseError } from "@beads-ui/core";

export interface Ok<T> {
  kind: "ok";
  value: T;
}

/** bd exited 13 on a guarded update: the shown status or assignee no longer held, nothing was written. */
export interface StaleWrite {
  kind: "stale";
  id: string;
  exitCode: 13;
  stderr: string;
}

export interface NotFound {
  kind: "notFound";
  id: string;
  stderr: string;
}

export interface Failed {
  kind: "failed";
  /** null when bd never ran or exited on a signal. */
  exitCode: number | null;
  stderr: string;
  message: string;
  /** Set when bd exited 0 but the core's parser refused its output. */
  parseError?: ParseError;
}

export interface Timeout {
  kind: "timeout";
  /** The bd subcommand, such as `bd list`. */
  command: string;
  timeoutMs: number;
}

export type BdResult<T> = Ok<T> | StaleWrite | NotFound | Failed | Timeout;
