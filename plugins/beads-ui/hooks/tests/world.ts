import type { Args, On, ProcessRunResult, RenderPropsOf } from "claude-code";
import { mock } from "claude-code/testing";

import commentsMg23 from "../../core/test/fixtures/bd-comments-BU-mg2.3.json.ts";
import cascadePreview from "../../core/test/fixtures/bd-delete-cascade-dry-run.json.ts";
import dependentsText from "../../core/test/fixtures/bd-delete-dry-run-dependents.txt.ts";
import leafText from "../../core/test/fixtures/bd-delete-dry-run-leaf.txt.ts";
import historyMg23 from "../../core/test/fixtures/bd-history-BU-mg2.3.json.ts";
import list from "../../core/test/fixtures/bd-list-all-brief.json.ts";
import ready from "../../core/test/fixtures/bd-ready.json.ts";
import show from "../../core/test/fixtures/bd-show.json.ts";
import show5 from "../../core/test/fixtures/bd-show-BU-mg2.3.5.json.ts";
import statuses from "../../core/test/fixtures/bd-statuses.json.ts";
import { UNASKED_COLUMNS } from "../pane.ts";

// The world beneath the mod in the hooks tests: a session in this repository, whose bd answers
// from the real output of its own Beads store (the core's fixtures, each captured read-only with
// bd 1.3.1), and an engine that keeps what the mod asked of it.

export const CWD = "/work/beads-ui";
export const SESSION = { surface: "terminal", isInteractive: true, cwd: CWD } as const;
export const SHOW = { command: "show-beads-ui", args: "", origin: { kind: "composer" } } as const;
export const BU = { command: "bu", args: "", origin: { kind: "composer" } } as const;
/** 2026-10-21 01:12:04 UTC, the clock's start. */
export const START_MS = Date.UTC(2026, 9, 21, 1, 12, 4);
export const SURFACES = ["terminal", "desktop"] as const;

export const ok = (stdout: string): ProcessRunResult => ({ exitCode: 0, stdout, stderr: "" });
export const exit = (exitCode: number, stderr: string, stdout = ""): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
});

/** bd's refusal of `bd delete BU-mg2.3 --dry-run`, captured with the dependents fixture. */
export const DEPENDENTS_STDERR =
  "Error: previewing deletion: issue BU-mg2.3 has dependents not in deletion set; use --cascade to delete them or --force to orphan them\n";

/** An argv as the scripts key it: `--json` dropped, so a write builder gaining it keeps its key. */
export const keyOf = (argv: readonly string[]): string =>
  argv.filter((arg) => arg !== "--json").join(" ");

/**
 * `bd where --json` as bd 1.3.1 answers it (measured 2026-10-24): the store's `.beads` directory,
 * exit 0, in a directory with a store; exit 1 and `no_beads_directory` on stdout without one.
 */
export const whereOf = (repo: string): ProcessRunResult =>
  ok(
    `${JSON.stringify({ database_path: `${repo}/.beads/dolt`, path: `${repo}/.beads`, schema_version: 1 }, null, 2)}\n`,
  );
export const NO_STORE_WHERE: ProcessRunResult = exit(
  1,
  "",
  `${JSON.stringify(
    {
      error: "no_beads_directory",
      hint: "check BEADS_DIR/worktree setup, or run 'bd init' to create a new database",
      message: "No active beads workspace found.",
      schema_version: 1,
    },
    null,
    2,
  )}\n`,
);
/** bd's refusal of a read in a directory with no store, as the pane showed it (ylx A004). */
export const NO_STORE_STDERR =
  "Error: no beads database found\nHint: run 'bd where' to inspect the resolved workspace, or 'bd init' to create a new database\n      or set BEADS_DIR to point to your .beads directory\n";

/**
 * The board's two reads (D-29): the open issues, and the newest page of closed ones. A script
 * answers either by its own key, or once for both by STORE_LIST, a list of every issue in the
 * store, `bd list --all`'s shape: the world then answers each read with its part of that list,
 * as bd would, and passes a failure, a hang or output that is not a list to both.
 */
export const OPEN_LIST = "bd list --brief --limit 0";
export const CLOSED_PAGE = "bd list --brief --status closed --sort closed --limit 25";
export const STORE_LIST = "bd list --all --brief --limit 0";
/** The Timeline's read of every closed issue of one type (T-2B.9), answered from STORE_LIST too. */
export const timelineList = (type: string) =>
  `bd list --brief --status closed --type ${type} --limit 0`;
const TIMELINE_LIST = /^bd list --brief --status closed --type (\S+) --limit 0$/;

/** A board read's part of a STORE_LIST answer: the open issues, or the newest closed page. */
const boardPart = (answer: ReturnType<Script>, closed: boolean): ReturnType<Script> =>
  partOf(answer, (rows) => {
    const status = (row: unknown) => (row as { status?: unknown }).status;
    const at = (row: unknown) => String((row as { closed_at?: unknown }).closed_at ?? "");
    return closed
      ? rows
          .filter((row) => status(row) === "closed")
          .sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : 0))
          .slice(0, 25)
      : rows.filter((row) => status(row) !== "closed");
  });

function partOf(
  answer: ReturnType<Script>,
  part: (rows: readonly unknown[]) => unknown[],
): ReturnType<Script> {
  if (answer === undefined || answer instanceof Error || answer === HANG) return answer;
  if (answer instanceof Killed || answer.exitCode !== 0) return answer;
  let rows: unknown;
  try {
    rows = JSON.parse(answer.stdout);
  } catch {
    return answer;
  }
  if (!Array.isArray(rows)) return answer;
  return { ...answer, stdout: JSON.stringify(part(rows)) };
}

const READS: Readonly<Record<string, ProcessRunResult>> = {
  "bd where": whereOf(CWD),
  "bd statuses": ok(statuses),
  [STORE_LIST]: ok(list),
  "bd ready --brief --limit 0": ok(ready),
  "bd show BU-mg2.3": ok(show),
  "bd show BU-mg2.3.5": ok(show5),
  "bd history BU-mg2.3 --events": ok(historyMg23),
  "bd comments BU-mg2.3": ok(commentsMg23),
  "bd delete BU-2zw --dry-run": ok(leafText),
  "bd delete BU-mg2.3 --dry-run": exit(1, DEPENDENTS_STDERR, dependentsText),
  "bd delete BU-mg2.3 --cascade --dry-run": ok(cascadePreview),
};

const WRITES = ["bd update ", "bd close ", "bd create ", "bd reopen ", "bd comments add "];

/**
 * What a script answers: a result, an Error to reject the call, `HANG` for a child that never
 * finishes (a streamed read then meets its deadline), a `Killed` child, or undefined to defer.
 * `cwd` is the directory bd was run in.
 */
export type Script = (
  key: string,
  argv: readonly string[],
  cwd: string | undefined,
) => ProcessRunResult | Error | typeof HANG | Killed | undefined;

/** A child that writes nothing and never exits. */
export const HANG = "hang" as const;

/** A child a signal ends after it `wrote` part of its output. */
export class Killed {
  constructor(
    readonly signal: string,
    readonly wrote: ProcessRunResult,
  ) {}
}

/**
 * What `$.process.run` keeps of each pipe (Claude Code 2.1.309's declaration of
 * ProcessRunResult): the first 4194304 bytes, the rest dropped and `isStdoutTruncated` set.
 */
export const RUN_OUTPUT_LIMIT = 4_194_304;

function asRunAnswers(result: ProcessRunResult): ProcessRunResult {
  const bytes = new TextEncoder().encode(result.stdout);
  if (bytes.length <= RUN_OUTPUT_LIMIT) return { ...result, isStdoutTruncated: false };
  const kept = new TextDecoder().decode(bytes.subarray(0, RUN_OUTPUT_LIMIT));
  return { ...result, stdout: kept, isStdoutTruncated: true };
}

/** The pieces a spawned child's output arrives in: 64 KiB, as a pipe's reads are. */
const PIECE = 65_536;

export interface WorldOptions {
  script?: Script;
  stored?: Readonly<Record<string, unknown>>;
  files?: Readonly<Record<string, string>>;
  env?: Readonly<Record<string, string>>;
  /**
   * What `$.ui.open` answers; an Error makes the open throw. When not given, the world answers
   * as Claude Code 2.1.310 does: an open the person asked for (the mod passes `focus: true` on
   * exactly those) is placed, and one nobody asked for is held unplaced below UNASKED_COLUMNS.
   */
  openAnswer?: unknown;
  /** The terminal's width the engine places panes by: VIEWPORT's 120 columns when not given. */
  columns?: number;
  /** The merged settings `$.settings.read` answers: none when not given. */
  settings?: Readonly<Record<string, unknown>>;
  /** Runs after each `$.store.set`, so a test can play another session writing meanwhile. */
  afterStoreSet?: (key: string, store: Map<string, unknown>) => void;
  /**
   * Plays a host refresher that is running: its file lease, `REFRESHER_LEASE`, renewed every
   * RENEW_MS on the clock until the test calls `killRefresher`, after which it goes stale.
   */
  refresher?: boolean;
  /** The build the played refresher's lease records; none, as builds before 0.9.4 wrote. */
  refresherBuild?: string;
  /** The version the plugin's manifest names, read under `$.plugin.root`; no manifest when not given. */
  build?: string;
}

/** The host refresher's state directory under the world's HOME, and the files in it. */
export const STATE_DIR = "/home/me/.local/state/beads-ui";
export const REFRESHER_LEASE = `${STATE_DIR}/lease.json`;
export const REFRESHER_TOKEN = "refresher-token-1";
const RENEW_EVERY_MS = 20_000;

export function world(on: On, options: WorldOptions = {}) {
  const runs: string[][] = [];
  /** The directory each of `runs` ran in, by index. */
  const cwds: (string | undefined)[] = [];
  const registered: string[] = [];
  const opened: Args<"ui.open">[] = [];
  const closed: string[] = [];
  const toasts: string[] = [];
  const focused: Args<"ui.focus">[] = [];

  on("session.start", (_engine, e) => ({ cwd: e.cwd }));
  on("command.register", (_engine, e) => {
    registered.push(e.name);
    return { value: { command: e.name } };
  });
  const clock = mock.clock(on, { now: START_MS });
  // The plugin store in memory, as mock.store keeps it, but readable by the test: what a pane
  // reopened in a later session would read back. A value is kept as its JSON, as the engine's is.
  const store = new Map<string, unknown>(Object.entries(options.stored ?? {}));
  on("store.get", (_engine, e) => ({ value: store.get(e.key) }));
  on("store.set", (_engine, e) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)));
    options.afterStoreSet?.(e.key, store);
    return { value: undefined };
  });
  on("store.delete", (_engine, e) => {
    store.delete(e.key);
    return { value: undefined };
  });
  on("store.keys", () => ({ value: [...store.keys()] }));
  mock.env(on, options.env ?? { HOME: "/home/me" });
  // The files the session reads and writes, by absolute path; a write is read back.
  const files = new Map<string, string>(Object.entries(options.files ?? {}));
  // The refresher renews at START_MS and every RENEW_EVERY_MS after, until it is killed.
  let killedAt: number | undefined;
  const renewedAt = (now: number) => {
    const until = killedAt ?? now;
    return START_MS + Math.floor((until - START_MS) / RENEW_EVERY_MS) * RENEW_EVERY_MS;
  };
  on("fs.read", async (_engine, e) => {
    if (options.refresher === true && e.path === REFRESHER_LEASE && !files.has(e.path)) {
      const beatAt = renewedAt(await clock.now());
      const version =
        options.refresherBuild === undefined ? {} : { version: options.refresherBuild };
      return { value: JSON.stringify({ token: REFRESHER_TOKEN, pid: 4242, beatAt, ...version }) };
    }
    if (options.build !== undefined && e.path.endsWith("/.claude-plugin/plugin.json")) {
      return { value: JSON.stringify({ name: "beads-ui", version: options.build }) };
    }
    const text = files.get(e.path);
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text };
  });
  on("fs.write", (_engine, e) => {
    files.set(e.path, e.text);
    return { value: undefined };
  });
  const answerFor = (argv: readonly string[], cwd: string | undefined) => {
    runs.push([...argv]);
    cwds.push(cwd);
    const key = keyOf(argv);
    if (key === OPEN_LIST || key === CLOSED_PAGE) {
      return (
        options.script?.(key, argv, cwd) ??
        boardPart(options.script?.(STORE_LIST, argv, cwd) ?? READS[STORE_LIST], key === CLOSED_PAGE)
      );
    }
    const typed = TIMELINE_LIST.exec(key)?.[1];
    if (typed !== undefined) {
      return (
        options.script?.(key, argv, cwd) ??
        partOf(options.script?.(STORE_LIST, argv, cwd) ?? READS[STORE_LIST], (rows) =>
          rows.filter((row) => {
            const { status, issue_type } = row as { status?: unknown; issue_type?: unknown };
            return status === "closed" && issue_type === typed;
          }),
        )
      );
    }
    return (
      options.script?.(key, argv, cwd) ??
      READS[key] ??
      (WRITES.some((prefix) => key.startsWith(prefix)) || key.endsWith(" --force")
        ? ok("{}")
        : exit(1, `unscripted: ${key}`))
    );
  };
  on("process.run", (_engine, e) => {
    const answer = answerFor(e.argv, e.init?.cwd);
    if (answer instanceof Error) return { deny: answer.message };
    if (answer === HANG) return { deny: "aborted: still running" };
    if (answer instanceof Killed) return { value: asRunAnswers({ ...answer.wrote, exitCode: 1 }) };
    return { value: asRunAnswers(answer) };
  });
  on("process.spawn", async function* (_engine, e) {
    const answer = answerFor(e.argv, e.cwd);
    if (answer instanceof Error) throw answer;
    if (answer === HANG) return await new Promise<never>(() => undefined);
    const result = answer instanceof Killed ? answer.wrote : answer;
    for (let at = 0; at < result.stdout.length; at += PIECE) {
      yield { stream: "stdout" as const, text: result.stdout.slice(at, at + PIECE) };
    }
    if (result.stderr !== "") yield { stream: "stderr" as const, text: result.stderr };
    if (answer instanceof Killed) return { value: { code: null, signal: answer.signal } };
    return { value: { code: result.exitCode, signal: null } };
  });
  on("settings.read", () => ({ value: { ...options.settings } }));
  on("ui.open", (_engine, e) => {
    opened.push(e);
    if (options.openAnswer instanceof Error) throw options.openAnswer;
    if (options.openAnswer !== undefined) return { value: options.openAnswer as undefined };
    const columns = options.columns ?? VIEWPORT.columns;
    if (e.focus !== true && columns < UNASKED_COLUMNS) {
      // Claude Code 2.1.310's own answer, read from its binary.
      const reason = `unasked below ${UNASKED_COLUMNS} columns (${columns} now): placed when the person opens it, or when the terminal is widened to ${UNASKED_COLUMNS} columns`;
      return { value: { isPlaced: false, reason } as unknown as undefined };
    }
    return { value: undefined };
  });
  on("ui.close", (_engine, e) => {
    closed.push(e.id);
    return { value: undefined };
  });
  on("ui.toast", (_engine, e) => {
    toasts.push(e.text);
    return { value: undefined };
  });
  on("ui.focus", (_engine, e) => {
    focused.push(e);
    return {};
  });
  on("ui.render", { component: "AbovePrompt" }, () => ({ type: "Box", children: [] }));

  const keys = () => runs.map(keyOf);
  /** The played refresher dies now: its lease keeps its last renewal and goes stale. */
  const killRefresher = async () => {
    killedAt = await clock.now();
  };
  return {
    runs,
    cwds,
    keys,
    registered,
    opened,
    closed,
    toasts,
    focused,
    clock,
    store,
    files,
    killRefresher,
  };
}

/**
 * The pane opens on the Tasks view (T-2B.2); the Board's own suites press its nav entry first,
 * as a person does, then test the board.
 */
export async function onBoard<T extends { press: (target: { key: string }) => Promise<unknown> }>(
  ui: T,
): Promise<T> {
  await ui.press({ key: "tab:board" });
  return ui;
}

export const PANE_PROPS: RenderPropsOf["Pane"] = {
  title: "Beads",
  isFocused: true,
  bodyColumns: 118,
  placement: "dock",
  scroll: { offset: 0, bodyRows: 28 },
  view: {},
};

export const BAND_PROPS: RenderPropsOf["AbovePrompt"] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
};

/** A 120 by 30 terminal on the main screen, as tmux runs it by default. */
export const VIEWPORT = { columns: 120, rows: 30, isFullscreen: false } as const;

/**
 * An issue as the band's `bd count` reads see it: its status, the session it is assigned and,
 * when closed, when.
 */
export interface Counted {
  status: string;
  assignee?: string;
  closedAt?: number;
}

const flagOf = (argv: readonly string[], flag: string) =>
  argv.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);

/**
 * `bd count [--assignee=<name>] [--status=<s>] [--closed-after=<time>] --by-status|--by-assignee
 * --json` over `issues`, in bd 1.3.1's shape (the core's bd-count fixtures are real captures of
 * it, and `--by-assignee` was measured on 1.3.2): one group per status or owner, sorted by name,
 * `(unassigned)` for no owner, a group nothing holds left out.
 */
export function countOf(issues: readonly Counted[], argv: readonly string[]): ProcessRunResult {
  const assignee = flagOf(argv, "--assignee");
  const status = flagOf(argv, "--status");
  const after = flagOf(argv, "--closed-after");
  const since = after === undefined ? undefined : Date.parse(after);
  const held = issues.filter(
    (issue) =>
      (assignee === undefined || issue.assignee === assignee) &&
      (status === undefined || issue.status === status) &&
      (since === undefined || (issue.closedAt !== undefined && issue.closedAt > since)),
  );
  const byOwner = argv.includes("--by-assignee");
  const by = new Map<string, number>();
  for (const issue of held) {
    const group = byOwner ? (issue.assignee ?? "(unassigned)") : issue.status;
    by.set(group, (by.get(group) ?? 0) + 1);
  }
  const groups = [...by.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([group, count]) => ({ count, group }));
  return ok(`${JSON.stringify({ groups, schema_version: 1, total: held.length }, null, 2)}\n`);
}

/** Each store answers `bd count` from its own issues, chosen by the directory bd runs in. */
export const countScript =
  (stores: Readonly<Record<string, readonly Counted[]>>): Script =>
  (key, argv, cwd) => {
    if (!key.startsWith("bd count ")) return undefined;
    const issues = cwd === undefined ? undefined : stores[cwd];
    return issues === undefined
      ? exit(1, "Error: no beads database found\n")
      : countOf(issues, argv);
  };

/**
 * A band line's text with each count button read as the count it draws (D-36): `◒[1 in
 * progress]` as `1 in progress`, the status glyph before it and the button's brackets dropped.
 * The format tests read the counts through it; levels.test.ts pins the buttons themselves.
 */
export const plainLine = (text: string | undefined): string | undefined =>
  text?.replace(/[◒◉◦✓]?\[(\d+ [^\]]*)\]/g, "$1");

/** An issue a band count's rows list (D-36): `Counted`, with the id, title and priority bd lists. */
export interface Listed extends Counted {
  id: string;
  title?: string;
  priority?: number;
}

/** `listed` as `bd list --json --brief` rows, in bd 1.3's shape (the core's fixtures). */
export function listRowsOf(listed: readonly Listed[]): Record<string, unknown>[] {
  return listed.map((one, i) => ({
    id: one.id,
    title: one.title ?? `task ${one.id}`,
    status: one.status,
    priority: one.priority ?? 2,
    issue_type: "task",
    ...(one.assignee === undefined ? {} : { assignee: one.assignee }),
    created_at: new Date(START_MS - (1_000 - i) * 60_000).toISOString(),
    updated_at: new Date(START_MS - (1_000 - i) * 60_000).toISOString(),
    ...(one.closedAt === undefined ? {} : { closed_at: new Date(one.closedAt).toISOString() }),
    labels: [],
    dependencies: [],
  }));
}

/**
 * `bd list --brief --limit 0 --status=<s> [--assignee=<a>] [--closed-after=<t>]`, the band's
 * row reads (core's countTasksArgv), over each store's `listed` issues by the directory bd runs in.
 */
export const listScript =
  (stores: Readonly<Record<string, readonly Listed[]>>): Script =>
  (key, argv, cwd) => {
    if (!key.startsWith("bd list ") || flagOf(argv, "--status") === undefined) return undefined;
    const issues = cwd === undefined ? undefined : stores[cwd];
    if (issues === undefined) return exit(1, "Error: no beads database found\n");
    const assignee = flagOf(argv, "--assignee");
    const status = flagOf(argv, "--status");
    const after = flagOf(argv, "--closed-after");
    const since = after === undefined ? undefined : Date.parse(after);
    const held = issues.filter(
      (issue) =>
        (assignee === undefined || issue.assignee === assignee) &&
        issue.status === status &&
        (since === undefined || (issue.closedAt !== undefined && issue.closedAt > since)),
    );
    return ok(JSON.stringify(listRowsOf(held)));
  };

/** The store inventory under the world's HOME. */
export const INVENTORY_PATH = "/home/me/.beads/shared-server/publish-sweep.json";

/**
 * The store inventory as ai-harness's bd_publish_sweep.py writes it (schema 1, trimmed to the
 * fields the band reads): each store's directory and whether it matched the shared remote.
 */
export function inventoryOf(
  stores: Readonly<Record<string, { repo: string; synced?: boolean }>>,
): string {
  const entries = Object.fromEntries(
    Object.entries(stores).map(([name, { repo, synced = true }]) => [
      name,
      {
        repo,
        code: 0,
        step: "push",
        attestation: { verdict: "shared", sync_state: synced ? "converged" : "local_ahead" },
      },
    ]),
  );
  return JSON.stringify({ schema: 1, exit_code: 0, stores: entries, skipped: [] }, null, 2);
}
