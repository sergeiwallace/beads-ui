import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// An in-process stand-in for ai-core's work queue, answering the routes the queue adapter calls
// with the shapes ai-core's router returns (src/ai_core/queue/router.py and models.py):
// GET /api/queue/sessions (SessionOut[]), GET /api/queue/tasks?queue_state= (TaskOut[]),
// GET /api/queue/tasks/{repo}/{task_id} (TaskDetailOut) and
// POST /api/queue/tasks/{repo}/{task_id}/status (202 TaskStatusOut, 409 on a stale
// expected_status, 422 for a status outside BeadsStatus, 404 for an unknown task).

export interface FakeSession {
  id: string;
  machine: string;
  state: string;
  last_heartbeat_at?: string | null;
}

export interface FakeTask {
  repo: string;
  task_id: string;
  queue_state: string;
  owner_session?: string | null;
  status?: string | null;
  title?: string | null;
  display_id?: string | null;
  /** Its timeline's rows (QueueEventOut). */
  events?: { kind: string; ts: string; session_id?: string | null }[];
}

export interface StatusRequest {
  repo: string;
  taskId: string;
  body: { status: string; actor: string; expected_status?: string };
}

export interface FakeQueue {
  url: string;
  sessions: FakeSession[];
  tasks: FakeTask[];
  /** Every status change requested, in order. */
  requests: StatusRequest[];
  close(): Promise<void>;
}

const BEADS_STATUSES = ["open", "in_progress", "blocked", "closed", "deferred"];

function sessionOut(session: FakeSession) {
  return {
    id: session.id,
    machine: session.machine,
    name: session.id.split("/", 2)[1] ?? session.id,
    harness: "claude-code",
    repo: null,
    worktree: null,
    tmux_target: null,
    transcript_path: null,
    pid: null,
    task_list_id: null,
    capacity: null,
    state: session.state,
    goal_state: null,
    ctx_pct: null,
    quota_pct: null,
    started_at: null,
    last_heartbeat_at: session.last_heartbeat_at ?? null,
    ended_at: null,
  };
}

function taskOut(task: FakeTask) {
  return {
    repo: task.repo,
    task_id: task.task_id,
    display_id: task.display_id ?? task.task_id,
    title: task.title ?? null,
    status: task.status ?? null,
    priority: 2,
    issue_type: "task",
    parent_id: null,
    labels: [],
    queue_state: task.queue_state,
    owner_session: task.owner_session ?? null,
    blocked_by: null,
    autonomous_eligible: null,
    requires_approval: null,
    source_commit: null,
    exported_at: null,
  };
}

export async function startFakeQueue(): Promise<FakeQueue> {
  const state = {
    sessions: [] as FakeSession[],
    tasks: [] as FakeTask[],
    requests: [] as StatusRequest[],
  };
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    const parts = url.pathname.split("/").map(decodeURIComponent);
    // ["", "api", "queue", "tasks", repo, task_id, "status"]
    const find = () => state.tasks.find((t) => t.repo === parts[4] && t.task_id === parts[5]);
    if (request.method === "GET" && url.pathname === "/api/queue/sessions") {
      send(200, state.sessions.map(sessionOut));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/queue/tasks") {
      const wanted = url.searchParams.get("queue_state");
      send(
        200,
        state.tasks.filter((t) => wanted === null || t.queue_state === wanted).map(taskOut),
      );
      return;
    }
    if (request.method === "GET" && parts[3] === "tasks" && parts.length === 6) {
      const task = find();
      if (task === undefined) {
        send(404, { detail: "unknown task" });
        return;
      }
      send(200, {
        task: taskOut(task),
        briefing: null,
        playbook: null,
        links: [],
        prompts: [],
        events: (task.events ?? []).map((event, i) => ({
          id: `ev-${i}`,
          ts: event.ts,
          kind: event.kind,
          actor: null,
          session_id: event.session_id ?? null,
          payload: null,
        })),
      });
      return;
    }
    if (request.method === "POST" && parts[3] === "tasks" && parts[6] === "status") {
      let text = "";
      request.on("data", (chunk: Buffer) => {
        text += chunk.toString();
      });
      request.on("end", () => {
        const body = JSON.parse(text) as StatusRequest["body"];
        const task = find();
        if (!BEADS_STATUSES.includes(body.status)) {
          send(422, {
            detail: [{ loc: ["body", "status"], msg: "Input should be a Beads status" }],
          });
          return;
        }
        if (task === undefined) {
          send(404, { detail: "unknown task" });
          return;
        }
        state.requests.push({ repo: task.repo, taskId: task.task_id, body });
        if (body.expected_status !== undefined && body.expected_status !== task.status) {
          send(409, {
            detail: {
              reason: "status_conflict",
              current_status: task.status,
              requested_status: body.status,
            },
          });
          return;
        }
        send(202, {
          repo: task.repo,
          task_id: task.task_id,
          requested_status: body.status,
          generation: 1,
          bridge_command_ids: ["bc-1"],
          event_id: "ev-status",
        });
      });
      return;
    }
    send(404, { detail: "Not Found" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    get sessions() {
      return state.sessions;
    },
    set sessions(value) {
      state.sessions = value;
    },
    get tasks() {
      return state.tasks;
    },
    set tasks(value) {
      state.tasks = value;
    },
    requests: state.requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
