// Phase 3's remaining views (T-3.2 to T-3.4): the Roadmap, Analytics and Sessions reads, and the
// status write a leased task takes through the work queue. Every model is core's; each route reads
// the store (and the queue, where `[queue] url` is set) and returns the view the page draws.

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  ANALYTICS_DEFAULT_WEEKS,
  ANALYTICS_MAX_WEEKS,
  analyticsReadArgvs,
  analyticsView,
  beadsSessionsView,
  closedBeforeCountArgv,
  costPerIssue,
  currentSprint,
  DAY_MS,
  type HistoryEvent,
  type Issue,
  type IssueCost,
  type IssueFlow,
  LEASED_QUEUE_STATES,
  labelledArgv,
  parseCostExport,
  queueSessionsView,
  roadmapView,
  SPRINT_LABEL_PREFIX,
  type SprintInfo,
  type Status,
  sprintsOf,
  statusChanges,
  storeName,
} from "@beads-ui/core";
import type { BdClient, BdResult } from "@sergeiwallace/beads-ui-bd-node";
import { filterAllowed, repositoryOf } from "./allowlist.ts";
import type { WebConfig } from "./config.ts";
import { claimTimes, leasedTasks, QueueClient, type QueueFailure } from "./queue.ts";
import { type ApiContext, type ApiReply, type ApiRequest, bdFailure, failure } from "./routes.ts";

/** How many `bd history` reads Analytics runs at once. */
export const HISTORY_CONCURRENCY = 4;

type Unwrapped<T> = { value: T } | { reply: ApiReply };

function unwrap<T>(source: string, result: BdResult<T>): Unwrapped<T> {
  return result.kind === "ok" ? { value: result.value } : { reply: bdFailure(source, result) };
}

const nowOf = (context: ApiContext): number => Date.parse(context.now());

async function readStatuses(context: ApiContext): Promise<Unwrapped<Status[]>> {
  return unwrap("bd statuses", await context.bd.statuses());
}

// ── Roadmap (T-3.2) ──────────────────────────────────────────────────────────

export async function roadmapRoute(_request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const statuses = await readStatuses(context);
  if ("reply" in statuses) return statuses.reply;
  // The whole store, brief: a bar's progress counts every child, closed ones too.
  const issues = unwrap("bd list", await context.bd.list());
  if ("reply" in issues) return issues.reply;
  const asOf = context.now();
  return {
    status: 200,
    body: {
      store: storeName(context.repoRoot),
      asOf,
      view: roadmapView(issues.value, { statuses: statuses.value, today: asOf }),
    },
  };
}

// ── Analytics (T-3.3) ────────────────────────────────────────────────────────

interface CachedHistory {
  updatedAt: string;
  events: HistoryEvent[];
}

// One cache a store client: an issue's events change only with a write, which moves updated_at.
const historyCaches = new WeakMap<BdClient, Map<string, CachedHistory>>();

interface HistoryRead {
  flows: IssueFlow[];
  failed: { id: string; message: string }[];
}

async function flowsOf(bd: BdClient, issues: readonly Issue[]): Promise<HistoryRead> {
  let cache = historyCaches.get(bd);
  if (cache === undefined) {
    cache = new Map();
    historyCaches.set(bd, cache);
  }
  const store = cache;
  const flows = new Map<string, IssueFlow>();
  const failed: HistoryRead["failed"] = [];
  const queued = [...issues];
  const worker = async () => {
    for (let issue = queued.shift(); issue !== undefined; issue = queued.shift()) {
      const cached = store.get(issue.id);
      let events = cached?.updatedAt === issue.updatedAt ? cached.events : undefined;
      if (events === undefined) {
        const read = await bd.history(issue.id);
        if (read.kind === "ok") {
          events = read.value;
          store.set(issue.id, { updatedAt: issue.updatedAt, events });
        } else {
          failed.push({
            id: issue.id,
            message: read.kind === "failed" ? read.message : `bd history: ${read.kind}`,
          });
        }
      }
      flows.set(issue.id, { issue, changes: statusChanges(issue, events ?? []) });
    }
  };
  await Promise.all(Array.from({ length: HISTORY_CONCURRENCY }, worker));
  // In the issues' own order, whichever worker read each.
  return { flows: issues.flatMap((issue) => flows.get(issue.id) ?? []), failed };
}

const dedupe = (issues: readonly Issue[]): Issue[] => [
  ...new Map(issues.map((issue) => [issue.id, issue])).values(),
];

const utcStamp = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}Z`;

function parseWeeks(text: string | undefined): number | ApiReply {
  if (text === undefined || text === "") return ANALYTICS_DEFAULT_WEEKS;
  const weeks = Number(text);
  if (!/^\d+$/.test(text) || weeks < 1 || weeks > ANALYTICS_MAX_WEEKS) {
    return failure({
      kind: "invalid",
      source: "weeks",
      message: `weeks takes a whole number from 1 to ${ANALYTICS_MAX_WEEKS}, not ${text}`,
    });
  }
  return weeks;
}

type CostSection =
  | { configured: false }
  | { configured: true; source: string; rows: IssueCost[] }
  | { configured: true; source: string; error: { message: string; line?: number } };

/** The configured export's path: absolute, or relative to the beads-ui.toml that names it. */
function exportPath(config: WebConfig, path: string): string {
  if (isAbsolute(path)) return path;
  return resolve(config.source === undefined ? "." : dirname(config.source), path);
}

async function costSection(config: WebConfig, closed: readonly Issue[]): Promise<CostSection> {
  if (config.costExport === undefined) return { configured: false };
  const source = exportPath(config, config.costExport);
  let text: string;
  try {
    text = await readFile(source, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      configured: true,
      source,
      error: { message: `cannot read the cost export${code === undefined ? "" : ` (${code})`}` },
    };
  }
  const usage = parseCostExport(text);
  if (!usage.ok) {
    return {
      configured: true,
      source,
      error: {
        message: `the cost export is not OTLP JSON Lines: ${usage.error.message}`,
        line: usage.error.line,
      },
    };
  }
  return { configured: true, source, rows: costPerIssue(closed, usage.value) };
}

const sprintOrder = (a: SprintInfo, b: SprintInfo) =>
  Number(b.open) - Number(a.open) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export async function analyticsRoute(request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const weeks = parseWeeks(request.query.get("weeks") ?? undefined);
  if (typeof weeks !== "number") return weeks;
  const config = await context.config();
  const now = nowOf(context);
  const windowStart = Math.floor(now / DAY_MS) * DAY_MS - (weeks * 7 - 1) * DAY_MS;

  const statuses = await readStatuses(context);
  if ("reply" in statuses) return statuses.reply;
  const [openArgv, closedArgv] = analyticsReadArgvs(utcStamp(windowStart - 1000));
  const open = unwrap("bd list", await context.bd.listBy(openArgv));
  if ("reply" in open) return open.reply;
  const closedRead = unwrap("bd list", await context.bd.listBy(closedArgv));
  if ("reply" in closedRead) return closedRead.reply;
  const closed = closedRead.value.filter(
    (issue) => issue.closedAt !== undefined && Date.parse(issue.closedAt) >= windowStart,
  );
  const counted = unwrap(
    "bd count",
    await context.bd.count(closedBeforeCountArgv(utcStamp(windowStart))),
  );
  if ("reply" in counted) return counted.reply;
  const issues = dedupe([...open.value, ...closed]);

  const sprints = sprintsOf(issues, statuses.value).sort(sprintOrder);
  const asked = request.query.get("sprint") ?? undefined;
  const sprint =
    asked === undefined || asked === ""
      ? currentSprint(sprints, now)
      : sprints.find((s) => s.name === asked);
  if (asked !== undefined && asked !== "" && sprint === undefined) {
    return failure({
      kind: "not-found",
      source: "sprint",
      message: `no sprint named ${asked} in this store`,
    });
  }
  let members: Issue[] = [];
  if (sprint !== undefined) {
    const read = unwrap(
      "bd list",
      await context.bd.listBy(labelledArgv(`${SPRINT_LABEL_PREFIX}${sprint.name}`)),
    );
    if ("reply" in read) return read.reply;
    members = read.value;
  }

  const read = await flowsOf(context.bd, dedupe([...issues, ...members]));
  const byId = new Map(read.flows.map((flow) => [flow.issue.id, flow]));
  const pick = (list: readonly Issue[]) => list.flatMap((issue) => byId.get(issue.id) ?? []);
  const options = {
    statuses: statuses.value,
    now,
    weeks,
    doneBefore: counted.value.closed ?? 0,
    members: pick(members),
    ...(sprint === undefined ? {} : { sprint }),
  };
  return {
    status: 200,
    body: {
      store: storeName(context.repoRoot),
      asOf: context.now(),
      view: analyticsView(pick(issues), options),
      sprints: sprints.map((s) => s.name),
      ...(sprint === undefined ? {} : { sprint: sprint.name }),
      histories: { read: read.flows.length - read.failed.length, failed: read.failed },
      cost: await costSection(config, closed),
    },
  };
}

// ── Sessions and the queue adapter (T-3.4) ───────────────────────────────────

/**
 * This store's name in the work queue: `[queue] repo`, else the name the allowlist knows the
 * repository by, its main working tree's directory, so a linked worktree names its repository.
 */
const queueRepo = async (config: WebConfig, context: ApiContext): Promise<string> =>
  config.queueRepo ?? (await repositoryOf(context.repoRoot));

/** The allowlist's health line counts each kind of queue row it hides under this name. */
const QUEUE_SOURCE = "the work queue";

export async function sessionsRoute(_request: ApiRequest, context: ApiContext): Promise<ApiReply> {
  const config = await context.config();
  const statuses = await readStatuses(context);
  if ("reply" in statuses) return statuses.reply;
  const issues = unwrap("bd list", await context.bd.board());
  if ("reply" in issues) return issues.reply;
  const now = nowOf(context);
  const base = { store: storeName(context.repoRoot), asOf: context.now() };
  const fromBeads = () => beadsSessionsView(issues.value, { statuses: statuses.value, now });
  if (config.queueUrl === undefined) {
    return { status: 200, body: { ...base, view: fromBeads() } };
  }
  const queue = new QueueClient(config.queueUrl);
  const sessions = await queue.sessions();
  const tasks = sessions.ok ? await leasedTasks(queue) : sessions;
  if (!sessions.ok || !tasks.ok) {
    // The registry is the only source of liveness; without it the store's assignees still show.
    const queueError = (
      !sessions.ok ? sessions.failure : tasks.ok ? undefined : tasks.failure
    ) as QueueFailure;
    return { status: 200, body: { ...base, view: fromBeads(), queueError } };
  }
  // Every queue row passes the host's allowlist before it is shown (web app design D-18).
  const allowlist = await context.allowlist();
  const shownSessions = filterAllowed(
    sessions.value,
    (session) => session.repo,
    allowlist,
    context.health,
    `${QUEUE_SOURCE} sessions`,
  );
  const shownTasks = filterAllowed(
    tasks.value,
    (task) => task.repo,
    allowlist,
    context.health,
    `${QUEUE_SOURCE} tasks`,
  );
  const live = new Set(shownSessions.filter((s) => s.state !== "gone").map((s) => s.id));
  const claims = await claimTimes(
    queue,
    shownTasks.filter((task) => task.ownerSession !== undefined && live.has(task.ownerSession)),
  );
  const view = queueSessionsView({
    sessions: shownSessions,
    tasks: shownTasks,
    claims,
    issues: issues.value,
    store: await queueRepo(config, context),
    statuses: statuses.value,
    now,
  });
  return { status: 200, body: { ...base, view } };
}

const QUEUE_REPLY_KIND: Readonly<
  Record<QueueFailure["kind"], "stale" | "invalid" | "timeout" | "failed" | "not-found">
> = {
  conflict: "stale",
  invalid: "invalid",
  timeout: "timeout",
  failed: "failed",
  "not-found": "not-found",
};

/** What a status move does where the queue is configured: its reply, or bd's write with a notice. */
export type QueueWrite = { reply: ApiReply } | { notice?: string };

/**
 * A status move on a task the queue holds a lease on goes through the queue, never straight to
 * bd: `POST /api/queue/tasks/{repo}/{task_id}/status` with the drawn status as `expected_status`,
 * so a stale one is the queue's 409. Any other task, or no `[queue] url`, writes through bd; so
 * does a queue that cannot be read, with a notice saying the lease could not be checked.
 */
export async function queueStatusWrite(
  context: ApiContext,
  id: string,
  to: string,
  shown: string,
): Promise<QueueWrite> {
  const config = await context.config();
  if (config.queueUrl === undefined) return {};
  const queue = new QueueClient(config.queueUrl);
  const repo = await queueRepo(config, context);
  const task = await queue.task(repo, id);
  if (!task.ok) {
    if (task.failure.kind === "not-found") return {};
    return {
      notice: `the work queue could not be read, so ${id} was written through bd: ${task.failure.message}`,
    };
  }
  if (
    task.value.ownerSession === undefined ||
    !LEASED_QUEUE_STATES.includes(task.value.queueState)
  ) {
    return {};
  }
  const requested = await queue.requestStatus(repo, id, to, shown);
  if (!requested.ok) {
    const { kind, source, message } = requested.failure;
    return { reply: failure({ kind: QUEUE_REPLY_KIND[kind], source, message }) };
  }
  return {
    reply: {
      status: 202,
      body: { id, status: to, via: "queue", holder: task.value.ownerSession },
    },
  };
}
