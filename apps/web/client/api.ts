import type {
  AnalyticsView,
  Comment,
  Issue,
  ItemOptions,
  Priority,
  ReviewItem,
  RoadmapView,
  SessionsView,
  Status,
} from "@beads-ui/core";
import type {
  CostSection,
  DispatchStatus,
  DispatchSummary,
  // A held item's detail read failure (server/held-detail.ts); the Review read's own failure
  // shape, from server/dispatch.ts, is HeldReadFailure below.
  HeldReadFailure as HeldDetailFailure,
  HeldItemSummary,
  QueueOrderView,
  QueueRowView,
  Skill,
  UnblockResult,
} from "@sergeiwallace/beads-ui-web-ui";
import { base } from "./base.ts";

/** The server's error body (server/routes.ts ApiError). */
export interface ApiErrorBody {
  kind: string;
  message: string;
  source?: string;
  exitCode?: number | null;
}

/** How one store's read went in a board read: its issue count, or the error it failed with. */
export type StoreRead =
  | { repository: string; ok: true; count: number }
  | { repository: string; ok: false; error: ApiErrorBody };

export class ApiFailure extends Error {
  readonly status: number;
  readonly error: ApiErrorBody;
  /** A board read over several stores that all failed names each store's failure. */
  readonly reads: StoreRead[];
  constructor(status: number, error: ApiErrorBody, reads: StoreRead[] = []) {
    super(error.message);
    this.status = status;
    this.error = error;
    this.reads = reads;
  }

  /** bd's exit status for the reducers: 13 for a stale guard, null when bd never ran. */
  get exitCode(): number | null {
    if (this.error.kind === "stale") return 13;
    return this.error.exitCode ?? null;
  }
}

/** An issue as the board read returns it: with the repository of the store it is in. */
export type StoredIssue = Issue & { repository: string };

export interface BoardPayload {
  /** The store the read covers, or "every open store". */
  store: string;
  /** The store `?store=` named, or null for every open store. */
  chosen: string | null;
  /** Every store open on the host, each by the repository the allowlist opened it as. */
  repositories: string[];
  reads: StoreRead[];
  statuses: Status[];
  issues: StoredIssue[];
  rank: boolean;
  softWipLimit: Record<string, number>;
  refreshSeconds: number;
  asOf: string;
  problems: string[];
  /** Counts of stores and rows the host's allowlist hid, never naming their repositories. */
  health: string[];
}

export interface IssuePayload {
  issue: Issue;
  comments: Comment[] | null;
  commentsError?: ApiErrorBody;
  repository: string;
}

/** An issue by its store and id: the same id in two stores is two issues. */
export interface IssueRef {
  id: string;
  /** The store's repository; with none the server reads its only open store. */
  repository?: string | undefined;
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

// Every API path is relative to the app's base, so the server's base path moves them all at once.

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
    | { error?: ApiErrorBody; reads?: StoreRead[] }
    | undefined;
  if (!response.ok) {
    throw new ApiFailure(
      response.status,
      body?.error ?? {
        kind: "failed",
        source: "the beads-ui server",
        message: `answered ${response.status}`,
      },
      body?.reads ?? [],
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

const storeQuery = (repository: string | undefined) =>
  repository === undefined ? "" : `?store=${encodeURIComponent(repository)}`;

const issuePath = (ref: IssueRef, action = "") =>
  `issues/${encodeURIComponent(ref.id)}${action}${storeQuery(ref.repository)}`;

export const api = {
  board: (store?: string) => call<BoardPayload>(`board${storeQuery(store)}`),
  issue: (ref: IssueRef) => call<IssuePayload>(issuePath(ref)),
  move: (ref: IssueRef, to: string, shown: string) =>
    post<MovePayload>(issuePath(ref, "/status"), { to, shown }),
  priority: (ref: IssueRef, priority: Priority, shown: string) =>
    post<{ id: string; priority: Priority }>(issuePath(ref, "/priority"), { priority, shown }),
  rank: (ref: IssueRef, shown: string, above?: IssueRef, below?: IssueRef) =>
    post<{ id: string; rank: string }>(issuePath(ref, "/rank"), {
      shown,
      above: above?.id,
      below: below?.id,
      aboveStore: above?.repository,
      belowStore: below?.repository,
    }),
  // Phase 3's remaining views read one store: the one chosen, or the only one open.
  roadmap: (store?: string) => call<RoadmapPayload>(`roadmap${storeQuery(store)}`),
  analytics: (weeks: number, sprint?: string, store?: string) =>
    call<AnalyticsPayload>(
      `analytics?${new URLSearchParams({
        weeks: String(weeks),
        ...(sprint ? { sprint } : {}),
        ...(store === undefined ? {} : { store }),
      })}`,
    ),
  sessions: (store?: string) => call<SessionsPayload>(`sessions${storeQuery(store)}`),
  // Phase W1: sprint moves, the owner picker, list reorder, the Queue view and held-item detail.
  sprint: (ref: IssueRef, to: string, from: string, shown: string) =>
    post<{ id: string; sprint: string }>(issuePath(ref, "/sprint"), { to, from, shown }),
  owner: (ref: IssueRef, to: string, shown: string, status: string) =>
    post<{ id: string; assignee: string }>(issuePath(ref, "/owner"), { to, shown, status }),
  listRank: (ref: IssueRef, shown: string, priority: number, above?: IssueRef, below?: IssueRef) =>
    post<{ id: string; rank: string }>(issuePath(ref, "/list-rank"), {
      shown,
      priority,
      above: above?.id,
      below: below?.id,
      aboveStore: above?.repository,
      belowStore: below?.repository,
    }),
  owners: (store?: string) => call<OwnersPayload>(`owners${storeQuery(store)}`),
  queueView: (blocked: boolean) =>
    call<QueueViewPayload>(`queue-view${blocked ? "?blocked=1" : ""}`),
  heldItem: (path: string) => call<HeldItemPayload>(`held/item?path=${encodeURIComponent(path)}`),
};

// The Review queue's and the composer's routes (server/dispatch.ts), in their own block.

/** A held read that did not succeed, named with its exit code. */
export interface HeldReadFailure {
  source: string;
  exitCode: number | null;
  detail?: string;
}

export interface ReviewPayload {
  asOf: string;
  held:
    | { state: "unset"; message: string }
    | { state: "failed"; failure: HeldReadFailure }
    | {
        state: "ok";
        rows: { item: ReviewItem; repository: string; joined?: { repo: string; issue: Issue } }[];
      };
  options:
    | { state: "unset" }
    | { state: "ok"; stdout: string }
    | { state: "failed"; failure: HeldReadFailure };
  tasks: { repo: string; issue: Issue }[];
  /** Every goal issue's id, for the goal filter. */
  goals: string[];
  failures: HeldReadFailure[];
  problems: string[];
  health: string[];
}

interface Written {
  dispatch: DispatchSummary;
}

export const dispatchApi = {
  review: () => call<ReviewPayload>("review"),
  heldBody: (path: string) =>
    call<{ path: string; body: string }>(`review/body?path=${encodeURIComponent(path)}`),
  prompt: (body: { repo: string; task: string; text: string } | { item: string; text: string }) =>
    post<Written>("dispatch/prompt", body),
  answer: (
    body: { item: string } & ({ choices: { decision: string; key: string }[] } | { text: string }),
  ) => post<Written & { answer: string }>("dispatch/answer", body),
  unblock: (body: { repo: string; task: string; resolution: string; followUp?: string }) =>
    post<UnblockResult>("dispatch/unblock", body),
  status: (id: string) => call<DispatchStatus>(`dispatch/${encodeURIComponent(id)}`),
  skills: () => call<{ skills: Skill[] }>("dispatch/skills"),
};
/** The owner picker's candidates for a store (server/edits.ts OwnerCandidates). */
export interface OwnersPayload {
  store: string;
  candidates: { name: string; state?: string; machine?: string }[];
  source: string;
  rule?: string[];
  queueError?: { source: string; message: string };
}

/** The Queue view's read (server/queue-view.ts). */
export interface QueueViewPayload {
  asOf: string;
  blocked: boolean;
  order: QueueOrderView;
  reads: StoreRead[];
  rows: QueueRowView[];
}

/** A held item's detail (server/held-detail.ts). */
export interface HeldItemPayload {
  item: HeldItemSummary & { store: string };
  store: string;
  body?: string;
  bodyError?: HeldDetailFailure;
  options?: ItemOptions;
  optionsError?: HeldDetailFailure;
}
