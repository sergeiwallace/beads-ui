import type {
  AnalyticsView,
  Comment,
  Issue,
  Priority,
  RoadmapView,
  SessionsView,
  Status,
} from "@beads-ui/core";
import type { CostSection } from "@sergeiwallace/beads-ui-web-ui";

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
  /** Counts of rows the host's allowlist hid, never naming their repositories. */
  health: string[];
}

export interface IssuePayload {
  issue: Issue;
  comments: Comment[] | null;
  commentsError?: ApiErrorBody;
}

export interface RoadmapPayload {
  store: string;
  asOf: string;
  view: RoadmapView;
}

export interface AnalyticsPayload {
  store: string;
  asOf: string;
  view: AnalyticsView;
  sprints: string[];
  sprint?: string;
  histories: { read: number; failed: { id: string; message: string }[] };
  cost: CostSection;
}

export interface SessionsPayload {
  store: string;
  asOf: string;
  view: SessionsView;
  /** The work queue read that failed; the view then holds the store's assignees. */
  queueError?: ApiErrorBody;
}

/** A status move's answer: written through bd, or requested through the work queue (202). */
export interface MovePayload {
  id: string;
  status: string;
  via?: "queue";
  holder?: string;
  notice?: string;
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

// Every write carries X-Beads-UI, which a cross-site form cannot send (web app design D-17).
const WRITE_HEADERS = { "content-type": "application/json", "x-beads-ui": "1" };

const post = <T>(path: string, body: unknown): Promise<T> =>
  call<T>(path, { method: "POST", headers: WRITE_HEADERS, body: JSON.stringify(body) });

/** Ends this browser's session on the server; the server clears its cookie. */
export async function signOut(): Promise<void> {
  await fetch(`${base}api/auth/v1/logout`, { method: "POST", headers: WRITE_HEADERS, body: "{}" });
}

const issuePath = (id: string) => `issues/${encodeURIComponent(id)}`;

export const api = {
  board: () => call<BoardPayload>("board"),
  issue: (id: string) => call<IssuePayload>(issuePath(id)),
  move: (id: string, to: string, shown: string) =>
    post<MovePayload>(`${issuePath(id)}/status`, { to, shown }),
  roadmap: () => call<RoadmapPayload>("roadmap"),
  analytics: (weeks: number, sprint?: string) =>
    call<AnalyticsPayload>(
      `analytics?${new URLSearchParams({ weeks: String(weeks), ...(sprint ? { sprint } : {}) })}`,
    ),
  sessions: () => call<SessionsPayload>("sessions"),
  priority: (id: string, priority: Priority, shown: string) =>
    post<{ id: string; priority: Priority }>(`${issuePath(id)}/priority`, { priority, shown }),
  rank: (id: string, shown: string, above?: string, below?: string) =>
    post<{ id: string; rank: string }>(`${issuePath(id)}/rank`, { shown, above, below }),
};
