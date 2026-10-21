import { historyArgv, issueIdArg, showArgv, statusArg } from "../argv.ts";
import type { BdArgv, HistoryEvent, Issue, Result } from "../model.ts";
import { isCalendarDate } from "../quickadd.ts";
import { fitBlock, priorityBadge, truncate } from "./text.ts";

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
  /** The value as drawn, cut to the width. */
  value: string;
  editable?: EditableField;
  /**
   * For an editable field, the whole value an edit control starts from, in the form
   * `parseFieldEdit` reads back: never the cut `value`, which would write a shortened title.
   */
  raw?: string;
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

const ESCAPES: Readonly<Record<string, string>> = { "\\": "\\", n: "\n", r: "\r", t: "\t" };
const ESCAPED: Readonly<Record<string, string>> = {
  "\\": "\\\\",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

/**
 * A multi-line text on one line, for a one-line edit control: a line break is `\n` (a carriage
 * return `\r`, a tab `\t`) and a backslash is `\\`. `fromOneLine` reverses it exactly.
 */
export function toOneLine(text: string): string {
  return text.replace(/[\\\n\r\t]/g, (ch) => ESCAPED[ch] ?? ch);
}

/** Reads `toOneLine`'s escapes back; a backslash before any other character stays as typed. */
export function fromOneLine(text: string): string {
  return text.replace(/\\([\\nrt])/g, (_match, ch: string) => ESCAPES[ch] ?? ch);
}

/**
 * The longest description, in its one-line form, the Detail tab edits inline: an edit control
 * holds the whole text, and a mod tree is cut off past 100,000 serialized characters.
 */
export const DESCRIPTION_EDIT_MAX_CHARS = 20_000;

function fieldsOf(issue: Issue): FieldView[] {
  const fields: FieldView[] = [];
  const add = (
    key: string,
    label: string,
    value: string | undefined,
    editable?: EditableField,
    raw: string | undefined = value,
  ) => {
    if (value === undefined) return;
    fields.push(
      editable === undefined
        ? { key, label, value }
        : { key, label, value, editable, raw: raw ?? value },
    );
  };
  const sprint = issue.labels.find((label) => label.startsWith("sprint:"));

  add("title", "Title", issue.title, "title");
  const description = toOneLine(issue.description ?? "");
  if (description.length <= DESCRIPTION_EDIT_MAX_CHARS) {
    add("editDescription", "Description", description, "description");
  } else {
    add(
      "editDescription",
      "Description",
      `${description.length} characters, more than the ${DESCRIPTION_EDIT_MAX_CHARS} the inline editor holds; edit it with bd update ${issue.id} --description`,
    );
  }
  add("id", "Id", issue.id);
  add("displayId", "Display id", issue.displayId);
  add("status", "Status", issue.status, "status");
  add("priority", "Priority", priorityBadge(issue.priority), "priority", String(issue.priority));
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
    issue.estimatedMinutes === undefined ? "" : String(issue.estimatedMinutes),
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
    if (text !== undefined) blocks.push({ key, label, text: fitBlock(text) });
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
 * or an `id:` label: a published display id is immutable (D-9). Every write carries `--json`
 * (D-4); the surface reads its outcome from the exit code.
 */
const DURATION = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m?)?$/i;

/**
 * Reads what an edit control holds back into a FieldEdit: the inverse of each field's `raw`.
 * Priority takes `1` or `P1`; an estimate takes minutes (`90`) or the drawn form (`1h 30m`);
 * labels are comma-separated; a description reads `toOneLine`'s escapes back (`\n` a line break).
 */
export function parseFieldEdit(field: EditableField, text: string): Result<FieldEdit, EditError> {
  switch (field) {
    case "priority": {
      const match = /^[pP]?([0-4])$/.exec(text.trim());
      if (match === null) return invalid("priority takes 0 to 4");
      return { ok: true, value: { field, value: Number(match[1]) } };
    }
    case "estimate": {
      const match = DURATION.exec(text.trim());
      if (text.trim() === "" || match === null) {
        return invalid("an estimate is minutes, such as 90 or 1h 30m");
      }
      const value = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
      return { ok: true, value: { field, value } };
    }
    case "labels":
      return {
        ok: true,
        value: {
          field,
          value: text
            .split(",")
            .map((label) => label.trim())
            .filter((label) => label !== ""),
        },
      };
    case "description":
      return { ok: true, value: { field, value: fromOneLine(text) } };
    default:
      return { ok: true, value: { field, value: text } };
  }
}

export function editArgv(issue: Issue, edit: FieldEdit): Result<BdArgv, EditError> {
  const id = issueIdArg(issue.id);
  const ok = (...flags: string[]): Result<BdArgv, EditError> => ({
    ok: true,
    value: ["bd", "update", id, ...flags, "--json"],
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
