import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

// An in-process stand-in for the work queue's `/api/queue` routes the queue-backed dispatch store
// calls, answering with the request and response shapes of the queue's own models (PromptIn,
// PromptOut, EventIn, TaskDetailOut with PromptSummaryOut and QueueEventOut rows): uuid4-hex ids,
// ISO timestamps with a +00:00 offset, FastAPI's `{"detail": ...}` refusals, and task detail's
// cap of the 200 most recent events.

const PROMPT_KINDS = ["start", "next", "unblock", "review", "custom", "continue", "reconcile"];
const TASK_EVENT_LIMIT = 200;

export interface QueuePrompt {
  id: string;
  repo: string;
  task_id: string;
  kind: string;
  text: string;
  autonomy: string;
  target_session: string | null;
  created_by: string;
  created_at: string;
  status: string;
}

export interface QueueEvent {
  id: string;
  ts: string;
  kind: string;
  actor: string | null;
  repo: string | null;
  task_id: string | null;
  session_id: string | null;
  payload: Record<string, unknown> | null;
}

export interface FakeQueue {
  url: string;
  prompts: QueuePrompt[];
  events: QueueEvent[];
  /** Every request body the queue received, as sent. */
  requests: string[];
  /** Adds a task to the queue's projection, so its detail can be read. */
  addTask(repo: string, taskId: string): void;
  /** While set, a new prompt is refused with 409 and this reason, as the queue's state machine does. */
  refusePrompts: string | undefined;
  /** While true, every route answers 503. */
  down: boolean;
  reset(): void;
  close(): Promise<void>;
}

const hex = () => randomUUID().replaceAll("-", "");

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const missing = (body: Record<string, unknown>, fields: readonly string[]) =>
  fields
    .filter((field) => typeof body[field] !== "string")
    .map((field) => ({ type: "missing", loc: ["body", field], msg: "Field required" }));

export async function startFakeQueue(): Promise<FakeQueue> {
  const tasks = new Set<string>();
  let clock = Date.UTC(2026, 10, 9, 5, 0, 0);
  const now = () => {
    clock += 1;
    return new Date(clock).toISOString().replace("Z", "000+00:00");
  };
  const taskKey = (repo: string, taskId: string) => JSON.stringify([repo, taskId]);

  const queue: FakeQueue = {
    url: "",
    prompts: [],
    events: [],
    requests: [],
    refusePrompts: undefined,
    down: false,
    addTask: (repo, taskId) => void tasks.add(taskKey(repo, taskId)),
    reset() {
      tasks.clear();
      queue.prompts.length = 0;
      queue.events.length = 0;
      queue.requests.length = 0;
      queue.refusePrompts = undefined;
      queue.down = false;
    },
    close: async () => undefined,
  };

  const server = createServer(async (request, response) => {
    const text = await readBody(request);
    queue.requests.push(text);
    if (queue.down) return send(response, 503, { detail: "unavailable" });
    const path = new URL(request.url ?? "/", "http://queue").pathname;
    const body = (text === "" ? {} : JSON.parse(text)) as Record<string, unknown>;

    if (request.method === "POST" && path === "/api/queue/prompts") {
      const problems = missing(body, ["task_id", "repo", "kind", "text", "created_by"]);
      if (problems.length > 0) return send(response, 422, { detail: problems });
      if (!PROMPT_KINDS.includes(body.kind as string))
        return send(response, 422, { detail: [{ type: "literal_error", loc: ["body", "kind"] }] });
      if (queue.refusePrompts !== undefined)
        return send(response, 409, { detail: { reason: queue.refusePrompts } });
      const prompt: QueuePrompt = {
        id: hex(),
        repo: body.repo as string,
        task_id: body.task_id as string,
        kind: body.kind as string,
        text: body.text as string,
        autonomy: (body.autonomy as string | undefined) ?? "gated",
        target_session: (body.target_session as string | undefined) ?? null,
        created_by: body.created_by as string,
        created_at: now(),
        status: "queued",
      };
      queue.prompts.push(prompt);
      return send(response, 201, { id: prompt.id, status: prompt.status });
    }

    const promptMove = /^\/api\/queue\/prompts\/([^/]+)\/(ack|consumed)$/.exec(path);
    if (request.method === "POST" && promptMove !== null) {
      const prompt = queue.prompts.find((row) => row.id === promptMove[1]);
      if (prompt === undefined) return send(response, 404, { detail: "unknown prompt" });
      prompt.status = promptMove[2] === "ack" ? "acknowledged" : "consumed";
      return send(response, 200, { id: prompt.id, status: prompt.status });
    }

    if (request.method === "POST" && path === "/api/queue/events") {
      if (typeof body.kind !== "string")
        return send(response, 422, { detail: missing(body, ["kind"]) });
      const event: QueueEvent = {
        id: hex(),
        ts: now(),
        kind: body.kind,
        actor: null,
        repo: (body.repo as string | undefined) ?? null,
        task_id: (body.task_id as string | undefined) ?? null,
        session_id: (body.session_id as string | undefined) ?? null,
        payload: (body.payload as Record<string, unknown> | undefined) ?? null,
      };
      queue.events.push(event);
      return send(response, 201, { id: event.id });
    }

    const detail = /^\/api\/queue\/tasks\/([^/]+)\/([^/]+)$/.exec(path);
    if (request.method === "GET" && detail !== null) {
      const repo = decodeURIComponent(detail[1] as string);
      const taskId = decodeURIComponent(detail[2] as string);
      if (!tasks.has(taskKey(repo, taskId))) return send(response, 404, { detail: "unknown task" });
      const prompts = queue.prompts
        .filter((row) => row.repo === repo && row.task_id === taskId)
        .map(({ repo: _r, task_id: _t, ...summary }) => summary);
      const events = queue.events
        .filter((row) => row.repo === repo && row.task_id === taskId)
        .slice(-TASK_EVENT_LIMIT)
        .map(({ repo: _r, task_id: _t, ...row }) => row);
      return send(response, 200, {
        task: { repo, task_id: taskId, queue_state: "ready" },
        briefing: null,
        playbook: null,
        links: [],
        prompts,
        events,
      });
    }

    send(response, 404, { detail: "Not Found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  queue.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  queue.close = () => new Promise((resolve) => server.close(() => resolve()));
  return queue;
}
