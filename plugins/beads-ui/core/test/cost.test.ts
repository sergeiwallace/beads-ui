// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import { costPerIssue, type Issue, parseCostExport } from "../src/index.ts";

// T-3.3: "Where a Claude Code cost export is configured, when an issue closed with a session id
// the system shall show cost and tokens per closed issue." The export is OTLP JSON Lines as an
// OpenTelemetry Collector's file exporter writes Claude Code's metrics.

const attr = (key: string, value: string) => ({ key, value: { stringValue: value } });

function line(
  temporality: 1 | 2,
  points: { metric: string; session?: string; type?: string; value: number; at?: number }[],
  resourceSession?: string,
): string {
  const byMetric = new Map<string, unknown[]>();
  for (const point of points) {
    const attributes = [attr("user.id", "user-a"), attr("model", "a-model")];
    if (point.session !== undefined) attributes.push(attr("session.id", point.session));
    if (point.type !== undefined) attributes.push(attr("type", point.type));
    const data =
      point.metric === "claude_code.cost.usage"
        ? { attributes, asDouble: point.value, timeUnixNano: String(point.at ?? 1) }
        : { attributes, asInt: String(point.value), timeUnixNano: String(point.at ?? 1) };
    byMetric.set(point.metric, [...(byMetric.get(point.metric) ?? []), data]);
  }
  return JSON.stringify({
    resourceMetrics: [
      {
        resource: {
          attributes: [
            attr("service.name", "claude-code"),
            ...(resourceSession === undefined ? [] : [attr("session.id", resourceSession)]),
          ],
        },
        scopeMetrics: [
          {
            scope: { name: "com.anthropic.claude_code" },
            metrics: [...byMetric].map(([name, dataPoints]) => ({
              name,
              unit: name === "claude_code.cost.usage" ? "USD" : "tokens",
              sum: { aggregationTemporality: temporality, isMonotonic: true, dataPoints },
            })),
          },
        ],
      },
    ],
  });
}

const issue = (id: string, fields: Partial<Issue> = {}): Issue => ({
  id,
  title: `title of ${id}`,
  status: "closed",
  priority: 2,
  type: "task",
  labels: [],
  dependencies: [],
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-02T00:00:00Z",
  metadata: {},
  ...fields,
});

describe("the Claude Code cost export", () => {
  test("should sum a delta export's cost and tokens by session, a session on its resource too", () => {
    const text = [
      line(1, [
        { metric: "claude_code.cost.usage", session: "s-1", value: 0.25 },
        { metric: "claude_code.token.usage", session: "s-1", type: "input", value: 1000 },
        { metric: "claude_code.token.usage", session: "s-1", type: "output", value: 200 },
      ]),
      "",
      line(1, [
        { metric: "claude_code.cost.usage", session: "s-1", value: 0.5 },
        { metric: "claude_code.token.usage", session: "s-1", type: "cacheRead", value: 4000 },
        { metric: "claude_code.lines_of_code.count", session: "s-1", value: 9 },
      ]),
      line(1, [{ metric: "claude_code.cost.usage", value: 1.5 }], "s-2"),
    ].join("\n");

    const parsed = parseCostExport(text);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.get("s-1")).toEqual({
      sessionId: "s-1",
      costUsd: 0.75,
      tokens: { input: 1000, output: 200, cacheRead: 4000, cacheCreation: 0 },
    });
    expect(parsed.value.get("s-2")?.costUsd).toBe(1.5);
  });

  test("should take a cumulative series' last value rather than its sum", () => {
    const text = [
      line(2, [{ metric: "claude_code.cost.usage", session: "s-1", value: 0.2, at: 10 }]),
      line(2, [{ metric: "claude_code.cost.usage", session: "s-1", value: 0.9, at: 30 }]),
      line(2, [{ metric: "claude_code.cost.usage", session: "s-1", value: 0.5, at: 20 }]),
    ].join("\n");

    const parsed = parseCostExport(text);

    expect(parsed.ok && parsed.value.get("s-1")?.costUsd).toBe(0.9);
  });

  test("should name the line it could not read rather than show a partial cost", () => {
    const text = `${line(1, [{ metric: "claude_code.cost.usage", session: "s-1", value: 1 }])}\n{not json`;

    const parsed = parseCostExport(text);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.source).toBe("the cost export");
    expect(parsed.error.line).toBe(2);
  });

  test("should give each issue closed with a session id its session's cost and tokens", () => {
    const usage = parseCostExport(
      line(1, [
        { metric: "claude_code.cost.usage", session: "s-1", value: 0.12346 },
        { metric: "claude_code.token.usage", session: "s-1", type: "input", value: 300 },
        { metric: "claude_code.token.usage", session: "s-1", type: "cacheCreation", value: 50 },
      ]),
    );
    if (!usage.ok) throw new Error("export did not parse");

    const rows = costPerIssue(
      [
        issue("BU-1", { closedAt: "2026-11-03T00:00:00Z", closedBySession: "s-1" }),
        issue("BU-2", { closedAt: "2026-11-04T00:00:00Z", closedBySession: "s-gone" }),
        issue("BU-3", { closedAt: "2026-11-05T00:00:00Z" }),
        issue("BU-4", { status: "open", closedBySession: "s-1" }),
      ],
      usage.value,
    );

    expect(rows).toEqual([
      {
        id: "BU-2",
        label: "BU-2",
        title: "title of BU-2",
        closedAt: "2026-11-04T00:00:00Z",
        sessionId: "s-gone",
        sessionIssues: 1,
      },
      {
        id: "BU-1",
        label: "BU-1",
        title: "title of BU-1",
        closedAt: "2026-11-03T00:00:00Z",
        sessionId: "s-1",
        sessionIssues: 1,
        usage: {
          costUsd: 0.1235,
          tokens: { input: 300, output: 0, cacheRead: 0, cacheCreation: 50 },
          totalTokens: 350,
        },
      },
    ]);
  });
});
