import {
  type AnalyticsView,
  FLOW_ORDER,
  type IssueCost,
  ROLLING_WINDOW,
  type StatusCategory,
  statusToken,
} from "@beads-ui/core";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { tokenVar } from "./tokens.ts";

/** What the Analytics read reports besides the charts: the cost section and the event reads. */
export type CostSection =
  | { configured: false }
  | { configured: true; source: string; rows: IssueCost[] }
  | { configured: true; source: string; error: { message: string; line?: number } };

export interface AnalyticsProps {
  view: AnalyticsView;
  /** The sprints the store names, open ones first; the burndown draws `sprint`. */
  sprints: readonly string[];
  sprint?: string | undefined;
  weeks: number;
  cost: CostSection;
  /** Issues whose `bd history --events` read failed; their own dates stood in. */
  historyFailures: readonly { id: string; message: string }[];
  issueHref(id: string): string;
  onWeeks(weeks: number): void;
  onSprint(sprint: string): void;
}

export const WEEK_CHOICES: readonly number[] = [4, 8, 12, 26, 52];

const CATEGORY_NAMES: Readonly<Record<StatusCategory, string>> = {
  active: "To do",
  wip: "In progress",
  frozen: "On hold",
  done: "Done",
};

const colour = (category: StatusCategory) => tokenVar(statusToken(category));
const axis = { stroke: "var(--bu-text-dim)", fontSize: 11 };

function Chart(props: {
  id: string;
  title: string;
  summary: string;
  /** A Recharts chart, drawn in a responsive box. */
  chart?: ReactNode;
  /** A plot drawn as plain markup. */
  plot?: ReactNode;
  table: ReactNode;
}) {
  return (
    <figure className="bu-chart" data-chart={props.id} aria-labelledby={`bu-chart-${props.id}`}>
      <figcaption>
        <h2 id={`bu-chart-${props.id}`} className="bu-view-subtitle">
          {props.title}
        </h2>
        <p className="bu-dim">{props.summary}</p>
      </figcaption>
      {props.chart !== undefined && (
        <div className="bu-chart-plot">
          <ResponsiveContainer width="100%" height="100%">
            {props.chart}
          </ResponsiveContainer>
        </div>
      )}
      {props.plot}
      <details className="bu-chart-data">
        <summary>Data</summary>
        {props.table}
      </details>
    </figure>
  );
}

function Table(props: { head: readonly string[]; rows: readonly (readonly ReactNode[])[] }) {
  return (
    <table className="bu-table">
      <thead>
        <tr>
          {props.head.map((cell) => (
            <th key={cell} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a data row has no identity beyond its place.
          <tr key={i}>
            {row.map((cell, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional.
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Cost({ cost, issueHref }: { cost: CostSection; issueHref(id: string): string }) {
  if (!cost.configured) return null;
  if ("error" in cost) {
    return (
      <section className="bu-chart" data-chart="cost" aria-label="Cost per closed issue">
        <h2 className="bu-view-subtitle">Cost per closed issue</h2>
        <p className="bu-read-error" role="alert">
          <strong>{cost.source}</strong>: {cost.error.message}
          {cost.error.line === undefined ? "" : ` (line ${cost.error.line})`}
        </p>
      </section>
    );
  }
  return (
    <section className="bu-chart" data-chart="cost" aria-labelledby="bu-chart-cost">
      <h2 id="bu-chart-cost" className="bu-view-subtitle">
        Cost per closed issue
      </h2>
      <p className="bu-dim">
        {cost.rows.length === 0
          ? "No issue closed in this window names the session that closed it (bd close --session)."
          : `${plural(cost.rows.length, "closed issue")} with a session id, from ${cost.source}.`}
      </p>
      {cost.rows.length > 0 && (
        <Table
          head={["Issue", "Closed", "Session", "Cost (USD)", "Tokens"]}
          rows={cost.rows.map((row) => [
            <a key="i" href={issueHref(row.id)} data-cost-id={row.id}>
              {row.label}
            </a>,
            row.closedAt?.slice(0, 10) ?? "",
            <span key="s" className="bu-id">
              {row.sessionId}
              {row.sessionIssues > 1 ? ` (closed ${row.sessionIssues})` : ""}
            </span>,
            row.usage === undefined ? "not in the export" : `$${row.usage.costUsd.toFixed(4)}`,
            row.usage === undefined ? (
              ""
            ) : (
              <span
                key="t"
                title={`input ${row.usage.tokens.input}, output ${row.usage.tokens.output}, cache read ${row.usage.tokens.cacheRead}, cache creation ${row.usage.tokens.cacheCreation}`}
              >
                {row.usage.totalTokens.toLocaleString("en-US")}
              </span>
            ),
          ])}
        />
      )}
    </section>
  );
}

/**
 * Analytics (T-3.3): throughput, cycle time with its rolling average, cumulative flow, the sprint
 * burndown and aging work in progress, each drawn from core's model of `bd history --events`, with
 * its numbers in a table beside it; and cost per closed issue where an export is configured.
 */
export function Analytics(props: AnalyticsProps) {
  const { view } = props;
  const flow = view.cumulativeFlow.map((day) => ({ day: day.day, ...day.counts }));
  const closed = view.throughput.reduce((sum, week) => sum + week.closed, 0);
  const oldest = view.aging[0];
  return (
    <section className="bu-analytics" aria-labelledby="bu-analytics-title">
      <h1 id="bu-analytics-title" className="bu-view-title">
        Analytics
      </h1>
      <div className="bu-analytics-controls">
        <label>
          Weeks{" "}
          <select
            className="bu-select"
            value={props.weeks}
            onChange={(event) => props.onWeeks(Number(event.target.value))}
          >
            {WEEK_CHOICES.map((weeks) => (
              <option key={weeks} value={weeks}>
                {weeks}
              </option>
            ))}
          </select>
        </label>
        {props.sprints.length > 0 && (
          <label>
            Sprint{" "}
            <select
              className="bu-select"
              value={props.sprint ?? ""}
              onChange={(event) => props.onSprint(event.target.value)}
            >
              {props.sprint === undefined && <option value="">none</option>}
              {props.sprints.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="bu-dim">
          {view.range.start} to {view.range.end}
        </span>
      </div>
      {props.historyFailures.length > 0 && (
        <p className="bu-read-error" role="alert">
          <strong>bd history</strong> failed for {plural(props.historyFailures.length, "issue")} (
          {props.historyFailures
            .slice(0, 3)
            .map((failure) => failure.id)
            .join(", ")}
          {props.historyFailures.length > 3 ? ", ..." : ""}): their own dates stand in.
        </p>
      )}
      <div className="bu-charts">
        <Chart
          id="throughput"
          title="Throughput"
          summary={`${plural(closed, "issue")} done in ${plural(view.range.weeks, "week")}.`}
          chart={
            <BarChart data={view.throughput}>
              <CartesianGrid stroke="var(--bu-border)" vertical={false} />
              <XAxis dataKey="start" tick={axis} />
              <YAxis allowDecimals={false} tick={axis} width={32} />
              <Tooltip />
              <Bar dataKey="closed" name="Done" fill={colour("done")} isAnimationActive={false} />
            </BarChart>
          }
          table={
            <Table
              head={["Week of", "Done"]}
              rows={view.throughput.map((w) => [w.start, w.closed])}
            />
          }
        />
        <Chart
          id="cycle-time"
          title="Cycle time"
          summary={
            view.cycleTime.length === 0
              ? "No issue went from in progress to done in this window."
              : `Days from in progress to done; the line is the average of the last ${Math.min(ROLLING_WINDOW, view.cycleTime.length)} done.${view.closedWithoutStart > 0 ? ` ${plural(view.closedWithoutStart, "issue")} done without being started are left out.` : ""}`
          }
          chart={
            view.cycleTime.length === 0 ? undefined : (
              <ComposedChart data={view.cycleTime}>
                <CartesianGrid stroke="var(--bu-border)" vertical={false} />
                <XAxis dataKey="closed" tick={axis} />
                <YAxis tick={axis} width={32} />
                <Tooltip />
                <Legend />
                <Scatter
                  dataKey="days"
                  name="Days"
                  fill={colour("wip")}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="rollingAverage"
                  name="Rolling average"
                  stroke={colour("active")}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            )
          }
          table={
            <Table
              head={["Issue", "Done", "Days", "Rolling average"]}
              rows={view.cycleTime.map((point) => [
                <a key="i" href={props.issueHref(point.id)}>
                  {point.label}
                </a>,
                point.closed,
                point.days,
                point.rollingAverage,
              ])}
            />
          }
        />
        <Chart
          id="cumulative-flow"
          title="Cumulative flow"
          summary="Issues in each status category at the end of each day."
          chart={
            <AreaChart data={flow}>
              <CartesianGrid stroke="var(--bu-border)" vertical={false} />
              <XAxis dataKey="day" tick={axis} minTickGap={24} />
              <YAxis allowDecimals={false} tick={axis} width={32} />
              <Tooltip />
              <Legend />
              {FLOW_ORDER.map((category) => (
                <Area
                  key={category}
                  type="stepAfter"
                  dataKey={category}
                  name={CATEGORY_NAMES[category]}
                  stackId="flow"
                  stroke={colour(category)}
                  fill={colour(category)}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          }
          table={
            <Table
              head={["Day", ...FLOW_ORDER.map((category) => CATEGORY_NAMES[category])]}
              rows={view.cumulativeFlow.map((day) => [
                day.day,
                ...FLOW_ORDER.map((c) => day.counts[c]),
              ])}
            />
          }
        />
        <Chart
          id="burndown"
          title={
            view.burndown.kind === "drawn"
              ? `Sprint ${view.burndown.sprint} burndown`
              : "Sprint burndown"
          }
          summary={
            view.burndown.kind === "drawn"
              ? `${plural(view.burndown.members, "member")} not done each day, against an even line to the due date.`
              : view.burndown.message
          }
          chart={
            view.burndown.kind === "drawn" ? (
              <LineChart data={view.burndown.days}>
                <CartesianGrid stroke="var(--bu-border)" vertical={false} />
                <XAxis dataKey="day" tick={axis} minTickGap={24} />
                <YAxis allowDecimals={false} tick={axis} width={32} />
                <Tooltip />
                <Legend />
                <Line
                  dataKey="remaining"
                  name="Not done"
                  stroke={colour("wip")}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="ideal"
                  name="Even pace"
                  stroke={colour("frozen")}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            ) : undefined
          }
          table={
            <Table
              head={["Day", "Not done", "Even pace"]}
              rows={
                view.burndown.kind === "drawn"
                  ? view.burndown.days.map((day) => [day.day, day.remaining ?? "", day.ideal])
                  : []
              }
            />
          }
        />
        <Chart
          id="aging"
          title="Aging work in progress"
          summary={
            oldest === undefined
              ? "Nothing is in progress."
              : `${plural(view.aging.length, "issue")} in progress; the oldest has been for ${oldest.days} days.`
          }
          plot={
            oldest === undefined ? undefined : (
              <ol className="bu-aging" aria-label="Work in progress by age">
                {view.aging.map((item) => (
                  <li key={item.id} data-aging-id={item.id}>
                    <span
                      className="bu-aging-bar"
                      style={{
                        inlineSize: `${Math.max(4, (item.days / Math.max(1, oldest.days)) * 100)}%`,
                        background: colour("wip"),
                      }}
                    />
                    <span className="bu-id">{item.label}</span> {item.days} d
                  </li>
                ))}
              </ol>
            )
          }
          table={
            <Table
              head={["Issue", "Status", "Assignee", "Days in progress"]}
              rows={view.aging.map((item) => [
                <a key="i" href={props.issueHref(item.id)} data-aging-id={item.id}>
                  {item.label} {item.title}
                </a>,
                item.status,
                item.assignee ?? "",
                item.days,
              ])}
            />
          }
        />
        <Cost cost={props.cost} issueHref={props.issueHref} />
      </div>
    </section>
  );
}
