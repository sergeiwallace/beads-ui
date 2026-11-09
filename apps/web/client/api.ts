import type { Comment, Issue, Priority, Status } from "@beads-ui/core";

/** The server's error body (server/routes.ts ApiError). */
export interface ApiErrorBody {
  kind: string;
  message: string;
  source?: string;
  exitCode?: number | null;
}

export class ApiFailure extends Error {
  readonly status: number;
  readonly error: ApiErrorBody;
  constructor(status: number, error: ApiErrorBody) {
    super(error.message);
    this.status = status;
    this.error = error;
  }

  /** bd's exit status for the reducers: 13 for a stale guard, null when bd never ran. */
  get exitCode(): number | null {
    if (this.error.kind === "stale") return 13;
    return this.error.exitCode ?? null;
  }
}

export interface BoardPayload {
  store: string;
  statuses: Status[];
  issues: Issue[];
  rank: boolean;
  softWipLimit: Record<string, number>;
  refreshSeconds: number;
  asOf: string;
  problems: string[];
}

export interface IssuePayload {
  issue: Issue;
  comments: Comment[] | null;
  commentsError?: ApiErrorBody;
}

// Every API path is relative to the app's base, so a later base path moves them all at once.
const base = import.meta.env.BASE_URL;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}api/${path}`, init);
  } catch (error) {
    throw new ApiFailure(0, {
      kind: "failed",
      source: "the beads-ui server",
      message: `could not reach it: ${(error as Error).message}`,
    });
  }
  const body = (await response.json().catch(() => undefined)) as
    | { error?: ApiErrorBody }
    | undefined;
  if (!response.ok) {
    throw new ApiFailure(
      response.status,
      body?.error ?? {
        kind: "failed",
        source: "the beads-ui server",
        message: `answered ${response.status}`,
      },
    );
  }
  return body as T;
}

const post = <T>(path: string, body: unknown): Promise<T> =>
  call<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const issuePath = (id: string) => `issues/${encodeURIComponent(id)}`;

export const api = {
  board: () => call<BoardPayload>("board"),
  issue: (id: string) => call<IssuePayload>(issuePath(id)),
  move: (id: string, to: string, shown: string) =>
    post<{ id: string; status: string }>(`${issuePath(id)}/status`, { to, shown }),
  priority: (id: string, priority: Priority, shown: string) =>
    post<{ id: string; priority: Priority }>(`${issuePath(id)}/priority`, { priority, shown }),
  rank: (id: string, shown: string, above?: string, below?: string) =>
    post<{ id: string; rank: string }>(`${issuePath(id)}/rank`, { shown, above, below }),
};
