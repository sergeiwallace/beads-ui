import {
  claimedAt,
  parseQueueSessions,
  parseQueueTaskEvents,
  parseQueueTasks,
  type QueueParseResult,
  type QueueSession,
  type QueueTask,
} from "@beads-ui/core";

/** How long one call to the work queue may take; it answers on loopback in milliseconds. */
export const QUEUE_TIMEOUT_MS = 5_000;
/** The actor a status change requested through the queue names. */
export const QUEUE_ACTOR = "beads-ui-web";
/** How many task details the Sessions view reads at once for claim times. */
const DETAIL_CONCURRENCY = 8;

/** A queue call that did not give what was asked, named by the route it called. */
export interface QueueFailure {
  kind: "failed" | "timeout" | "not-found" | "conflict" | "invalid";
  /** `GET /api/queue/sessions`, `POST /api/queue/tasks/{repo}/{task_id}/status`. */
  source: string;
  message: string;
  status?: number;
  /** On a 409: the status the queue holds now. */
  currentStatus?: string;
}

export type QueueResult<T> = { ok: true; value: T } | { ok: false; failure: QueueFailure };

const segment = encodeURIComponent;

/** The work queue's HTTP API at `url` (`[queue] url`), read-only but for the status request. */
export class QueueClient {
  readonly url: string;
  constructor(url: string) {
    this.url = url.replace(/\/+$/, "");
  }

  private async call(
    method: "GET" | "POST",
    path: string,
    source: string,
    body?: unknown,
  ): Promise<QueueResult<{ status: number; json: unknown }>> {
    let response: Response;
    try {
      response = await fetch(`${this.url}${path}`, {
        method,
        signal: AbortSignal.timeout(QUEUE_TIMEOUT_MS),
        ...(body === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        failure: {
          kind: timedOut ? "timeout" : "failed",
          source,
          message: timedOut
            ? `the work queue at ${this.url} did not answer within ${QUEUE_TIMEOUT_MS} ms`
            : `could not reach the work queue at ${this.url}: ${(error as Error).message}`,
        },
      };
    }
    const json: unknown = await response.json().catch(() => undefined);
    return { ok: true, value: { status: response.status, json } };
  }

  private async read<T>(
    path: string,
    parse: (json: unknown) => QueueParseResult<T>,
  ): Promise<QueueResult<T>> {
    const source = `GET /api${path.split("?")[0]}`;
    const reply = await this.call("GET", `/api${path}`, source);
    if (!reply.ok) return reply;
    if (reply.value.status === 404) {
      return {
        ok: false,
        failure: { kind: "not-found", source, status: 404, message: "unknown task" },
      };
    }
    if (reply.value.status !== 200) {
      return {
        ok: false,
        failure: {
          kind: "failed",
          source,
          status: reply.value.status,
          message: `the work queue answered ${reply.value.status}`,
        },
      };
    }
    const parsed = parse(reply.value.json);
    if (parsed.ok) return { ok: true, value: parsed.value };
    return {
      ok: false,
      failure: {
        kind: "failed",
        source,
        message: `the work queue returned a row beads-ui could not read at ${parsed.error.path}: ${parsed.error.message}`,
      },
    };
  }

  sessions(): Promise<QueueResult<QueueSession[]>> {
    return this.read("/queue/sessions", parseQueueSessions);
  }

  tasks(queueState: string): Promise<QueueResult<QueueTask[]>> {
    return this.read(`/queue/tasks?queue_state=${segment(queueState)}`, parseQueueTasks);
  }

  async task(repo: string, taskId: string): Promise<QueueResult<QueueTask>> {
    const read = await this.read(`/queue/tasks/${segment(repo)}/${segment(taskId)}`, (json) =>
      parseQueueTasks([(json as { task?: unknown } | undefined)?.task]),
    );
    if (!read.ok) return read;
    const [task] = read.value;
    return task === undefined
      ? {
          ok: false,
          failure: { kind: "not-found", source: "GET /api/queue/tasks", message: "unknown task" },
        }
      : { ok: true, value: task };
  }

  /** When the task's newest claim was granted, from its queue events; undefined for none. */
  async claimTime(repo: string, taskId: string): Promise<QueueResult<string | undefined>> {
    const read = await this.read(
      `/queue/tasks/${segment(repo)}/${segment(taskId)}`,
      parseQueueTaskEvents,
    );
    return read.ok ? { ok: true, value: claimedAt(read.value) } : read;
  }

  /**
   * `POST /api/queue/tasks/{repo}/{task_id}/status` with `expected_status`, so a status the
   * queue no longer holds is a 409 with the one it does. The queue answers 202: requested, not
   * yet written to Beads.
   */
  async requestStatus(
    repo: string,
    taskId: string,
    status: string,
    expected: string,
  ): Promise<QueueResult<{ requestedStatus: string }>> {
    const source = "POST /api/queue/tasks/{repo}/{task_id}/status";
    const reply = await this.call(
      "POST",
      `/api/queue/tasks/${segment(repo)}/${segment(taskId)}/status`,
      source,
      { status, actor: QUEUE_ACTOR, expected_status: expected },
    );
    if (!reply.ok) return reply;
    const { status: code, json } = reply.value;
    if (code === 202 || code === 200) return { ok: true, value: { requestedStatus: status } };
    const detail = (json as { detail?: unknown } | undefined)?.detail;
    if (code === 409) {
      const current =
        typeof detail === "object" && detail !== null
          ? (detail as { current_status?: unknown }).current_status
          : undefined;
      const failure: QueueFailure = {
        kind: "conflict",
        source,
        status: 409,
        message:
          typeof current === "string"
            ? `the work queue holds ${taskId} as ${current}, not ${expected}; nothing was written`
            : `the work queue's status for ${taskId} is no longer ${expected}; nothing was written`,
      };
      if (typeof current === "string") failure.currentStatus = current;
      return { ok: false, failure };
    }
    if (code === 404) {
      return {
        ok: false,
        failure: {
          kind: "not-found",
          source,
          status: 404,
          message: `the work queue has no task ${taskId}`,
        },
      };
    }
    if (code === 422) {
      return {
        ok: false,
        failure: {
          kind: "invalid",
          source,
          status: 422,
          message: `the work queue does not take the status ${status}`,
        },
      };
    }
    return {
      ok: false,
      failure: { kind: "failed", source, status: code, message: `the work queue answered ${code}` },
    };
  }
}

/** Every leased task the queue holds, assigned and active, in two reads. */
export async function leasedTasks(queue: QueueClient): Promise<QueueResult<QueueTask[]>> {
  const assigned = await queue.tasks("assigned");
  if (!assigned.ok) return assigned;
  const active = await queue.tasks("active");
  if (!active.ok) return active;
  return { ok: true, value: [...assigned.value, ...active.value] };
}

/** The claim times of `tasks` by `<repo>/<task_id>`, read a few at a time; a failed read is skipped. */
export async function claimTimes(
  queue: QueueClient,
  tasks: readonly QueueTask[],
): Promise<Record<string, string>> {
  const claims: Record<string, string> = {};
  const queued = [...tasks];
  const worker = async () => {
    for (let task = queued.shift(); task !== undefined; task = queued.shift()) {
      const read = await queue.claimTime(task.repo, task.taskId);
      if (read.ok && read.value !== undefined) claims[`${task.repo}/${task.taskId}`] = read.value;
    }
  };
  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker));
  return claims;
}
