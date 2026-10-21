import { historyArgv, issueIdArg, showArgv, statusArg } from "../argv.ts";
import type { BdArgv, HistoryEvent, Issue, Result } from "../model.ts";
import { isCalendarDate } from "../quickadd.ts";
import { priorityBadge, truncate } from "./text.ts";

/** The fields R-7 makes editable inline. */
export const EDITABLE_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "type",
  "labels",
  "assignee",
  "due",
  "estimate",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const DETAIL_EVENT_LIMIT = 10;

export interface FieldView {
  key: string;
  label: string;
  value: string;
  editable?: EditableField;
}

export interface MarkdownView {
  key: "description" | "design" | "acceptanceCriteria" | "notes";
  label: string;
  text: string;
}

export interface DependencyView {
  id: string;
  displayId: string;
  type: string;
  status: string;
  title: string;
}

export interface EventView {
  at: string;
  actor: string;
  type: string;
  summary: string;
}

export interface DetailState {
  issue: Issue;
  events: HistoryEvent[];
  /** The field whose write is in flight. */
  saving?: EditableField;
  /** Set once a write succeeded: the surface re-reads the issue before the view redraws it. */
  stale: boolean;
  error?: string;
}

export type DetailEvent =
  | { type: "edit-submitted"; field: EditableField }
  | { type: "edit-succeeded" }
  | { type: "edit-failed"; exitCode: number; message: string }
  | { type: "reread"; issue: Issue; events?: HistoryEvent[] };

export function openDetail(issue: Issue, events: readonly HistoryEvent[]): DetailState {
  return { issue, events: [...events], stale: false };
}

export function reduceDetail(state: DetailState, event: DetailEvent): DetailState {
  switch (event.type) {
    case "edit-submitted": {
      const { error: _cleared, ...rest } = state;
      return { ...rest, saving: event.field };
    }
    case "edit-succeeded": {
      if (state.saving === undefined) return state;
      const { saving: _done, ...rest } = state;
      return { ...rest, stale: true };
    }
    case "edit-failed": {
      if (state.saving === undefined) return state;
      const { saving, ...rest } = state;
      return {
        ...rest,
        error: `saving ${saving} failed (exit ${event.exitCode}): ${event.message}`,
      };
    }
    case "reread":
      if (event.issue.id !== state.issue.id) return state;
      return {
        ...state,
        issue: event.issue,
        events: event.events === undefined ? state.events : [...event.events],
        stale: false,
      };
  }
}

export interface DetailView {
  id: string;
  heading: string;
  fields: FieldView[];
  markdown: MarkdownView[];
  dependencies: DependencyView[];
  /** The newest ten events from `bd history --events`. */
  events: EventView[];
  savingLine?: string;
  errorLine?: string;
  /** Present while a successful write awaits its re-read: run each, then dispatch `reread`. */
  reread?: BdArgv[];
}

function date(value: string): string {
  return value.slice(0, 10);
}

function minutes(value: number): string {
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function fieldsOf(issue: Issue): FieldView[] {
  const fields: FieldView[] = [];
  const add = (key: string, label: string, value: string | undefined, editable?: EditableField) => {
    if (value === undefined) return;
    fields.push(editable === undefined ? { key, label, value } : { key, label, value, editable });
  };
  const sprint = issue.labels.find((label) => label.startsWith("sprint:"));

  add("title", "Title", issue.title, "title");
  add("id", "Id", issue.id);
  add("displayId", "Display id", issue.displayId);
  add("status", "Status", issue.status, "status");
  add("priority", "Priority", priorityBadge(issue.priority), "priority");
  add("type", "Type", issue.type, "type");
  add("assignee", "Assignee", issue.assignee ?? "", "assignee");
  add("owner", "Owner", issue.owner);
  add("labels", "Labels", issue.labels.join(", "), "labels");
  add("sprint", "Sprint", sprint?.slice("sprint:".length));
  add("parent", "Parent", issue.parent);
  add("dueAt", "Due", issue.dueAt === undefined ? "" : date(issue.dueAt), "due");
  add(
    "estimatedMinutes",
    "Estimate",
    issue.estimatedMinutes === undefined ? "" : minutes(issue.estimatedMinutes),
    "estimate",
  );
  add("deferUntil", "Deferred until", issue.deferUntil);
  add("createdAt", "Created", issue.createdAt);
  add("updatedAt", "Updated", issue.updatedAt);
  add("startedAt", "Started", issue.startedAt);
  add("closedAt", "Closed", issue.closedAt);
  add("leaseExpiresAt", "Lease expires", issue.leaseExpiresAt);
  add("heartbeatAt", "Heartbeat", issue.heartbeatAt);
  if (Object.keys(issue.metadata).length > 0) {
    add("metadata", "Metadata", JSON.stringify(issue.metadata));
  }
  return fields;
}

function markdownOf(issue: Issue): MarkdownView[] {
  const blocks: MarkdownView[] = [];
  const add = (key: MarkdownView["key"], label: string, text: string | undefined) => {
    if (text !== undefined) blocks.push({ key, label, text });
  };
  add("description", "Description", issue.description);
  add("acceptanceCriteria", "Acceptance criteria", issue.acceptanceCriteria);
  add("design", "Design", issue.design);
  add("notes", "Notes", issue.notes);
  return blocks;
}

function changeSummary(json: string | undefined): string | undefined {
  if (json === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return json;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return json;
  const parts: string[] = [];
  const walk = (prefix: string, object: Record<string, unknown>) => {
    for (const [key, entry] of Object.entries(object)) {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
        walk(path, entry as Record<string, unknown>);
      } else {
        parts.push(`${path} → ${typeof entry === "string" ? entry : JSON.stringify(entry)}`);
      }
    }
  };
  walk("", value as Record<string, unknown>);
  return parts.join(", ");
}

function summarise(event: HistoryEvent): string {
  if (event.comment !== undefined) return event.comment;
  switch (event.type) {
    case "created":
      return "created";
    case "closed":
      return event.newValue === undefined ? "closed" : `closed: ${event.newValue}`;
    case "updated":
    case "status_changed":
      return changeSummary(event.newValue) ?? event.type;
    default:
      return event.newValue ?? event.type;
  }
}

export interface DetailViewOptions {
  /** The board's issues, to show each dependency's display id and, when bd show had none, status. */
  issues?: readonly Issue[];
  width: number;
}

export function detailView(state: DetailState, options: DetailViewOptions): DetailView {
  const { issue } = state;
  const width = options.width;
  const lookup = new Map((options.issues ?? []).map((candidate) => [candidate.id, candidate]));

  const newest = [...state.events]
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const ta = Date.parse(a.event.createdAt);
      const tb = Date.parse(b.event.createdAt);
      return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta) || a.index - b.index;
    })
    .slice(0, DETAIL_EVENT_LIMIT)
    .map(({ event }) => event);

  const view: DetailView = {
    id: issue.id,
    heading: truncate(`${issue.displayId ?? issue.id} ${issue.title}`, width),
    fields: fieldsOf(issue).map((field) => ({ ...field, value: truncate(field.value, width) })),
    markdown: markdownOf(issue),
    dependencies: issue.dependencies.map((dep): DependencyView => {
      const known = lookup.get(dep.id);
      return {
        id: dep.id,
        displayId: truncate(known?.displayId ?? dep.id, width),
        type: dep.type,
        status: dep.status ?? known?.status ?? "unknown",
        title: truncate(dep.title ?? known?.title ?? "", width),
      };
    }),
    events: newest.map(
      (event): EventView => ({
        at: event.createdAt.replace("T", " ").slice(0, 16),
        actor: event.actor,
        type: event.type,
        summary: truncate(summarise(event), width),
      }),
    ),
  };
  if (state.saving !== undefined) view.savingLine = `saving ${state.saving}…`;
  if (state.error !== undefined) view.errorLine = state.error;
  if (state.stale) view.reread = [showArgv(issue.id), historyArgv(issue.id)];
  return view;
}

export type FieldEdit =
  | { field: "title" | "description" | "status" | "type" | "assignee" | "due"; value: string }
  | { field: "priority" | "estimate"; value: number }
  | { field: "labels"; value: readonly string[] };

export type EditError =
  | { kind: "no-change"; message: string }
  | { kind: "invalid-value"; message: string }
  | { kind: "display-id-label"; message: string };

const invalid = (message: string): { ok: false; error: EditError } => ({
  ok: false,
  error: { kind: "invalid-value", message },
});
const unchanged = (field: string): { ok: false; error: EditError } => ({
  ok: false,
  error: { kind: "no-change", message: `${field} is unchanged` },
});

/**
 * The `bd update` for one edited field. Status and assignee writes carry bd's guard on the shown
 * value, so a stale edit exits 13 instead of overwriting. No edit touches `metadata.display_id`
 * or an `id:` label: a published display id is immutable (D-9).
 */
export function editArgv(issue: Issue, edit: FieldEdit): Result<BdArgv, EditError> {
  const id = issueIdArg(issue.id);
  const ok = (...flags: string[]): Result<BdArgv, EditError> => ({
    ok: true,
    value: ["bd", "update", id, ...flags],
  });

  switch (edit.field) {
    case "title": {
      const title = edit.value.trim();
      if (title === "") return invalid("a title cannot be empty");
      if (title === issue.title) return unchanged("title");
      return ok(`--title=${title}`);
    }
    case "description":
      if (edit.value === (issue.description ?? "")) return unchanged("description");
      return ok(`--description=${edit.value}`);
    case "status": {
      if (edit.value === issue.status) return unchanged("status");
      try {
        return ok("--status", statusArg(edit.value), "--if-status", statusArg(issue.status));
      } catch {
        return invalid(`${edit.value} is not a status bd can take`);
      }
    }
    case "type":
      if (edit.value.trim() === "") return invalid("a type cannot be empty");
      if (edit.value.trim() === issue.type) return unchanged("type");
      return ok(`--type=${edit.value.trim()}`);
    case "assignee": {
      const assignee = edit.value.trim();
      if (assignee === (issue.assignee ?? "")) return unchanged("assignee");
      return ok(`--assignee=${assignee}`, `--if-assignee=${issue.assignee ?? ""}`);
    }
    case "due": {
      const due = edit.value.trim();
      if (due !== "" && !isCalendarDate(due)) return invalid("due takes a date as YYYY-MM-DD");
      if (due === (issue.dueAt === undefined ? "" : date(issue.dueAt))) return unchanged("due");
      return ok(`--due=${due}`);
    }
    case "priority":
      if (!Number.isInteger(edit.value) || edit.value < 0 || edit.value > 4) {
        return invalid("priority takes 0 to 4");
      }
      if (edit.value === issue.priority) return unchanged("priority");
      return ok(`--priority=${edit.value}`);
    case "estimate":
      if (!Number.isInteger(edit.value) || edit.value < 0) {
        return invalid("an estimate is a whole number of minutes");
      }
      if (edit.value === issue.estimatedMinutes) return unchanged("estimate");
      return ok(`--estimate=${edit.value}`);
    case "labels": {
      const wanted = [...new Set(edit.value.map((label) => label.trim()).filter((l) => l !== ""))];
      if (wanted.some((label) => label.includes(",")))
        return invalid("a label cannot hold a comma");
      const added = wanted.filter((label) => !issue.labels.includes(label));
      const removed = issue.labels.filter((label) => !wanted.includes(label));
      const idLabel = [...added, ...removed].find((label) => label.startsWith("id:"));
      if (idLabel !== undefined) {
        return {
          ok: false,
          error: {
            kind: "display-id-label",
            message: `${idLabel} carries the display id, which never changes`,
          },
        };
      }
      if (added.length === 0 && removed.length === 0) return unchanged("labels");
      return ok(
        ...added.map((label) => `--add-label=${label}`),
        ...removed.map((label) => `--remove-label=${label}`),
      );
    }
  }
}
