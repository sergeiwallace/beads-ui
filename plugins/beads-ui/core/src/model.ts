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
