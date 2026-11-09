// Cost per closed issue (T-3.3, R-9): Claude Code exports `claude_code.cost.usage` (USD) and
// `claude_code.token.usage` (tokens, by `type`) over OpenTelemetry, each tagged with `session.id`;
// `bd close --session` records the session that closed an issue (`closed_by_session`). Joining the
// two gives cost and tokens per closed issue. The export is read as OTLP JSON Lines, the format an
// OpenTelemetry Collector's file exporter writes. Pure: the server reads the file.

import type { Issue } from "./model.ts";

export const COST_METRIC = "claude_code.cost.usage";
export const TOKEN_METRIC = "claude_code.token.usage";
export const SESSION_ATTRIBUTE = "session.id";

/** Token counts by Claude Code's `type` attribute. */
export interface TokenCounts {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface SessionUsage {
  sessionId: string;
  costUsd: number;
  tokens: TokenCounts;
}

export interface CostExportError {
  kind: "parse-error";
  source: "the cost export";
  /** 1-based line of the export that could not be read. */
  line: number;
  message: string;
}

export type CostExportResult =
  | { ok: true; value: Map<string, SessionUsage> }
  | { ok: false; error: CostExportError };

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** An OTLP attribute list as a plain map of its string values. */
function attributes(value: unknown): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of list(value)) {
    if (!isObject(entry) || typeof entry.key !== "string" || !isObject(entry.value)) continue;
    const inner = entry.value;
    const text = inner.stringValue ?? inner.intValue ?? inner.doubleValue;
    if (typeof text === "string" || typeof text === "number") found.set(entry.key, String(text));
  }
  return found;
}

// OTLP JSON writes an int64 as a string, a double as a number.
function pointValue(point: Json): number | undefined {
  const raw = point.asDouble ?? point.asInt;
  const value = typeof raw === "string" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const CUMULATIVE = 2;
const TOKEN_TYPES: Readonly<Record<string, keyof TokenCounts>> = {
  input: "input",
  output: "output",
  cacheRead: "cacheRead",
  cacheCreation: "cacheCreation",
};

/**
 * Every session's cost and tokens in an OTLP JSON Lines export. A delta series is summed; a
 * cumulative one, as an exporter set to cumulative temporality writes it, gives its last value.
 * A blank line is skipped; a line that is not JSON fails the read and names the line.
 */
export function parseCostExport(text: string): CostExportResult {
  // One series is a metric, a session and its other attributes; a cumulative one keeps its last.
  const cumulative = new Map<string, { at: number; value: number; apply: (v: number) => void }>();
  const usage = new Map<string, SessionUsage>();
  const of = (sessionId: string): SessionUsage => {
    let found = usage.get(sessionId);
    if (found === undefined) {
      found = {
        sessionId,
        costUsd: 0,
        tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      };
      usage.set(sessionId, found);
    }
    return found;
  };
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "not valid JSON";
      return {
        ok: false,
        error: { kind: "parse-error", source: "the cost export", line: index + 1, message },
      };
    }
    if (!isObject(record)) continue;
    for (const resource of list(record.resourceMetrics)) {
      if (!isObject(resource)) continue;
      const resourceAttributes = attributes(
        isObject(resource.resource) ? resource.resource.attributes : undefined,
      );
      for (const scope of list(resource.scopeMetrics)) {
        if (!isObject(scope)) continue;
        for (const metric of list(scope.metrics)) {
          if (!isObject(metric) || (metric.name !== COST_METRIC && metric.name !== TOKEN_METRIC))
            continue;
          const sum = isObject(metric.sum) ? metric.sum : undefined;
          if (sum === undefined) continue;
          const isCumulative =
            sum.aggregationTemporality === CUMULATIVE ||
            sum.aggregationTemporality === "AGGREGATION_TEMPORALITY_CUMULATIVE";
          for (const point of list(sum.dataPoints)) {
            if (!isObject(point)) continue;
            const value = pointValue(point);
            if (value === undefined) continue;
            const pointAttributes = attributes(point.attributes);
            const sessionId =
              pointAttributes.get(SESSION_ATTRIBUTE) ?? resourceAttributes.get(SESSION_ATTRIBUTE);
            if (sessionId === undefined || sessionId === "") continue;
            const session = of(sessionId);
            let apply: (v: number) => void;
            if (metric.name === COST_METRIC) {
              apply = (v) => {
                session.costUsd += v;
              };
            } else {
              const type = TOKEN_TYPES[pointAttributes.get("type") ?? ""];
              if (type === undefined) continue;
              apply = (v) => {
                session.tokens[type] += v;
              };
            }
            if (!isCumulative) {
              apply(value);
              continue;
            }
            const key = `${metric.name}\u0000${[...pointAttributes].sort().join("\u0000")}`;
            const at = Number(point.timeUnixNano ?? 0);
            const previous = cumulative.get(key);
            if (previous === undefined || at >= previous.at)
              cumulative.set(key, { at, value, apply });
          }
        }
      }
    }
  }
  for (const { value, apply } of cumulative.values()) apply(value);
  return { ok: true, value: usage };
}

export interface IssueCost {
  id: string;
  label: string;
  title: string;
  closedAt?: string;
  sessionId: string;
  /** How many closed issues name the same session: its usage is the session's, on each. */
  sessionIssues: number;
  /** Undefined when the export holds nothing for the session. */
  usage?: { costUsd: number; tokens: TokenCounts; totalTokens: number };
}

/** Each closed issue that names the session that closed it, with that session's usage. */
export function costPerIssue(
  issues: readonly Issue[],
  usage: ReadonlyMap<string, SessionUsage>,
): IssueCost[] {
  const perSession = new Map<string, number>();
  for (const issue of issues) {
    if (issue.closedBySession === undefined || issue.closedAt === undefined) continue;
    perSession.set(issue.closedBySession, (perSession.get(issue.closedBySession) ?? 0) + 1);
  }
  const rows: IssueCost[] = [];
  for (const issue of issues) {
    if (issue.closedBySession === undefined || issue.closedAt === undefined) continue;
    const row: IssueCost = {
      id: issue.id,
      label: issue.displayId ?? issue.id,
      title: issue.title,
      closedAt: issue.closedAt,
      sessionId: issue.closedBySession,
      sessionIssues: perSession.get(issue.closedBySession) ?? 1,
    };
    const session = usage.get(issue.closedBySession);
    if (session !== undefined) {
      const { input, output, cacheRead, cacheCreation } = session.tokens;
      row.usage = {
        costUsd: Math.round(session.costUsd * 10_000) / 10_000,
        tokens: { ...session.tokens },
        totalTokens: input + output + cacheRead + cacheCreation,
      };
    }
    rows.push(row);
  }
  return rows.sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
}
