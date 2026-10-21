import {
  type DeletePreview,
  type Dependency,
  type HistoryEvent,
  type Issue,
  type Priority,
  STATUS_CATEGORIES,
  type Status,
  type StatusCategory,
} from "./model.ts";

export interface ParseError {
  kind: "parse-error";
  source:
    | "bd list"
    | "bd show"
    | "bd statuses"
    | "bd ready"
    | "bd history"
    | "bd delete"
    | "bd create";
  path: string;
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ParseError };

type Source = ParseError["source"];
type JsonObject = Record<string, unknown>;

class Invalid {
  constructor(
    readonly path: string,
    readonly message: string,
  ) {}
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown, path: string): JsonObject {
  if (!isObject(value)) throw new Invalid(path, "expected an object");
  return value;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Invalid(path, "expected an array");
  return value;
}

function requiredString(obj: JsonObject, key: string, path: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value === "") {
    throw new Invalid(`${path}.${key}`, "expected a non-empty string");
  }
  return value;
}

function optionalString(obj: JsonObject, key: string, path: string): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Invalid(`${path}.${key}`, "expected a string");
  return value;
}

function parsePriority(value: unknown, path: string): Priority {
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4) return value;
  throw new Invalid(path, "expected a priority from 0 to 4");
}

function parseMetadata(value: unknown, path: string): JsonObject {
  if (value === undefined || value === null) return {};
  if (typeof value === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Invalid(path, "expected metadata to be a JSON object");
    }
    return asObject(parsed, path);
  }
  return asObject(value, path);
}

function parseDependency(value: unknown, path: string): Dependency {
  const dep = asObject(value, path);
  if (typeof dep.depends_on_id === "string") {
    return { type: requiredString(dep, "type", path), id: dep.depends_on_id };
  }
  const parsed: Dependency = {
    type: requiredString(dep, "dependency_type", path),
    id: requiredString(dep, "id", path),
  };
  const status = optionalString(dep, "status", path);
  if (status !== undefined) parsed.status = status;
  const title = optionalString(dep, "title", path);
  if (title !== undefined) parsed.title = title;
  return parsed;
}

function parseLabels(value: unknown, path: string): string[] {
  if (value === undefined || value === null) return [];
  return asArray(value, path).map((label, i) => {
    if (typeof label !== "string") throw new Invalid(`${path}[${i}]`, "expected a string");
    return label;
  });
}

function parseIssue(value: unknown, path: string): Issue {
  const raw = asObject(value, path);
  const metadata = parseMetadata(raw.metadata, `${path}.metadata`);
  const dependencies =
    raw.dependencies === undefined || raw.dependencies === null
      ? []
      : asArray(raw.dependencies, `${path}.dependencies`).map((dep, i) =>
          parseDependency(dep, `${path}.dependencies[${i}]`),
        );

  const issue: Issue = {
    id: requiredString(raw, "id", path),
    title: requiredString(raw, "title", path),
    status: requiredString(raw, "status", path),
    priority: parsePriority(raw.priority, `${path}.priority`),
    type: requiredString(raw, "issue_type", path),
    labels: parseLabels(raw.labels, `${path}.labels`),
    dependencies,
    createdAt: requiredString(raw, "created_at", path),
    updatedAt: requiredString(raw, "updated_at", path),
    metadata,
  };

  const displayId = metadata.display_id;
  if (typeof displayId === "string" && displayId !== "") issue.displayId = displayId;

  const optional: [keyof Issue, string][] = [
    ["description", "description"],
    ["design", "design"],
    ["acceptanceCriteria", "acceptance_criteria"],
    ["notes", "notes"],
    ["assignee", "assignee"],
    ["owner", "owner"],
    ["parent", "parent"],
    ["dueAt", "due_at"],
    ["deferUntil", "defer_until"],
    ["startedAt", "started_at"],
    ["closedAt", "closed_at"],
    ["leaseExpiresAt", "lease_expires_at"],
    ["heartbeatAt", "heartbeat_at"],
  ];
  const target = issue as unknown as Record<string, unknown>;
  for (const [field, key] of optional) {
    const text = optionalString(raw, key, path);
    if (text !== undefined) target[field] = text;
  }

  const estimate = raw.estimated_minutes;
  if (estimate !== undefined && estimate !== null) {
    if (typeof estimate !== "number" || !Number.isInteger(estimate) || estimate < 0) {
      throw new Invalid(`${path}.estimated_minutes`, "expected a non-negative integer");
    }
    issue.estimatedMinutes = estimate;
  }

  return issue;
}

function parseCategory(value: unknown, path: string): StatusCategory {
  const match = STATUS_CATEGORIES.find((category) => category === value);
  if (match === undefined) {
    throw new Invalid(path, `expected one of ${STATUS_CATEGORIES.join(", ")}`);
  }
  return match;
}

function parseStatusList(value: unknown, path: string, builtin: boolean): Status[] {
  if (value === undefined || value === null) return [];
  return asArray(value, path).map((entry, i) => {
    const at = `${path}[${i}]`;
    const raw = asObject(entry, at);
    return {
      name: requiredString(raw, "name", at),
      category: parseCategory(raw.category, `${at}.category`),
      builtin,
    };
  });
}

function run<T>(source: Source, text: string, parse: (json: unknown) => T): ParseResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "not valid JSON";
    return { ok: false, error: { kind: "parse-error", source, path: "$", message } };
  }
  try {
    return { ok: true, value: parse(json) };
  } catch (cause) {
    if (cause instanceof Invalid) {
      return {
        ok: false,
        error: { kind: "parse-error", source, path: cause.path, message: cause.message },
      };
    }
    throw cause;
  }
}

function parseIssues(json: unknown): Issue[] {
  return asArray(json, "$").map((entry, i) => parseIssue(entry, `$[${i}]`));
}

export function parseBdList(text: string): ParseResult<Issue[]> {
  return run("bd list", text, parseIssues);
}

export function parseBdShow(text: string): ParseResult<Issue[]> {
  return run("bd show", text, parseIssues);
}

export function parseBdStatuses(text: string): ParseResult<Status[]> {
  return run("bd statuses", text, (json) => {
    const root = asObject(json, "$");
    return [
      ...parseStatusList(root.built_in_statuses, "$.built_in_statuses", true),
      ...parseStatusList(root.custom_statuses, "$.custom_statuses", false),
    ];
  });
}

export function parseBdReady(text: string): ParseResult<Issue[]> {
  return run("bd ready", text, parseIssues);
}

function parseEvent(value: unknown, path: string): HistoryEvent {
  const raw = asObject(value, path);
  const event: HistoryEvent = {
    id: requiredString(raw, "id", path),
    issueId: requiredString(raw, "issue_id", path),
    type: requiredString(raw, "event_type", path),
    actor: requiredString(raw, "actor", path),
    createdAt: requiredString(raw, "created_at", path),
  };
  const oldValue = optionalString(raw, "old_value", path);
  if (oldValue !== undefined) event.oldValue = oldValue;
  const newValue = optionalString(raw, "new_value", path);
  if (newValue !== undefined) event.newValue = newValue;
  const comment = optionalString(raw, "comment", path);
  if (comment !== undefined) event.comment = comment;
  return event;
}

/** Reads `bd history <id> --events --json`. */
export function parseBdHistoryEvents(text: string): ParseResult<HistoryEvent[]> {
  return run("bd history", text, (json) =>
    asArray(json, "$").map((entry, i) => parseEvent(entry, `$[${i}]`)),
  );
}

function nonNegativeInteger(obj: JsonObject, key: string): number {
  const value = obj[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Invalid(`$.${key}`, "expected a non-negative integer");
  }
  return value;
}

/**
 * Reads `bd delete <id> --dry-run --json`, with or without `--cascade`. A preview bd refused,
 * such as one with dependents outside the deletion set, carries bd's `error` text and no counts;
 * it parses to a parse error at `$.error` whose message is bd's text.
 */
export function parseBdDeletePreview(text: string): ParseResult<DeletePreview> {
  return run("bd delete", text, (json) => {
    const root = asObject(json, "$");
    if (typeof root.error === "string" && root.error !== "") {
      throw new Invalid("$.error", root.error);
    }
    const issueIds = asArray(root.issue_ids, "$.issue_ids").map((id, i) => {
      if (typeof id !== "string" || id === "") {
        throw new Invalid(`$.issue_ids[${i}]`, "expected a non-empty string");
      }
      return id;
    });
    return {
      issueIds,
      cascade: root.cascade === true,
      wouldDelete: nonNegativeInteger(root, "would_delete"),
      wouldOrphan: nonNegativeInteger(root, "would_orphan"),
      wouldRemoveDependencies: nonNegativeInteger(root, "would_remove_dependencies"),
      wouldRemoveEvents: nonNegativeInteger(root, "would_remove_events"),
      wouldRemoveLabels: nonNegativeInteger(root, "would_remove_labels"),
    };
  });
}

/** Reads the new issue's hash id from `bd create --json`, as bd-new does. */
export function parseBdCreatedId(text: string): ParseResult<string> {
  return run("bd create", text, (json) => requiredString(asObject(json, "$"), "id", "$"));
}
