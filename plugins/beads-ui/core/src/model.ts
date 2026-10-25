export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** A full bd argument vector, `argv[0]` being `bd`. */
export type BdArgv = readonly string[];

/** A surface-supplied random draw in [0, 1), so core never reads a global for randomness. */
export type RandomSource = () => number;

export type StatusCategory = "active" | "wip" | "frozen" | "done";

export const STATUS_CATEGORIES: readonly StatusCategory[] = ["active", "wip", "frozen", "done"];

export interface Status {
  name: string;
  category: StatusCategory;
  builtin: boolean;
}

export type Priority = 0 | 1 | 2 | 3 | 4;

export interface Dependency {
  type: string;
  id: string;
  /** Present when bd show embeds the dependency's own record. */
  status?: string;
  title?: string;
}

export interface Issue {
  id: string;
  displayId?: string;
  title: string;
  description?: string;
  design?: string;
  acceptanceCriteria?: string;
  notes?: string;
  status: string;
  priority: Priority;
  type: string;
  assignee?: string;
  owner?: string;
  labels: string[];
  parent?: string;
  dependencies: Dependency[];
  estimatedMinutes?: number;
  dueAt?: string;
  deferUntil?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  closedAt?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  metadata: Record<string, unknown>;
}

export interface HistoryEvent {
  id: string;
  issueId: string;
  type: string;
  actor: string;
  createdAt: string;
  oldValue?: string;
  newValue?: string;
  comment?: string;
}

/** One comment on an issue, as `bd comments <id> --json` returns it. */
export interface Comment {
  id: string;
  issueId: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface DeletePreview {
  issueIds: string[];
  cascade: boolean;
  wouldDelete: number;
  wouldOrphan: number;
  wouldRemoveDependencies: number;
  wouldRemoveEvents: number;
  wouldRemoveLabels: number;
}

export interface Sprint {
  name: string;
  milestoneId?: string;
  startsAt?: string;
  dueAt?: string;
}

export type SessionState = "idle" | "busy" | "compacting" | "gone";

export interface Session {
  id: string;
  machine: string;
  name: string;
  state: SessionState;
  currentTask?: string;
  lastHeartbeatAt?: string;
}
