import type { Args, On, ProcessRunResult, RenderPropsOf } from "claude-code";
import { mock } from "claude-code/testing";

import cascadePreview from "../../core/test/fixtures/bd-delete-cascade-dry-run.json.ts";
import dependentsText from "../../core/test/fixtures/bd-delete-dry-run-dependents.txt.ts";
import leafText from "../../core/test/fixtures/bd-delete-dry-run-leaf.txt.ts";
import historyMg23 from "../../core/test/fixtures/bd-history-BU-mg2.3.json.ts";
import list from "../../core/test/fixtures/bd-list-all-brief.json.ts";
import ready from "../../core/test/fixtures/bd-ready.json.ts";
import show from "../../core/test/fixtures/bd-show.json.ts";
import show5 from "../../core/test/fixtures/bd-show-BU-mg2.3.5.json.ts";
import statuses from "../../core/test/fixtures/bd-statuses.json.ts";

// The world beneath the mod in the hooks tests: a session in this repository, whose bd answers
// from the real output of its own Beads store (the core's fixtures, each captured read-only with
// bd 1.3.1), and an engine that keeps what the mod asked of it.

export const CWD = "/work/beads-ui";
export const SESSION = { surface: "terminal", isInteractive: true, cwd: CWD } as const;
export const BEADS = { command: "beads", args: "", origin: { kind: "composer" } } as const;
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

const READS: Readonly<Record<string, ProcessRunResult>> = {
  "bd statuses": ok(statuses),
  "bd list --all --brief --limit 0": ok(list),
  "bd ready --brief --limit 0": ok(ready),
  "bd show BU-mg2.3": ok(show),
  "bd show BU-mg2.3.5": ok(show5),
  "bd history BU-mg2.3 --events": ok(historyMg23),
  "bd delete BU-2zw --dry-run": ok(leafText),
  "bd delete BU-mg2.3 --dry-run": exit(1, DEPENDENTS_STDERR, dependentsText),
  "bd delete BU-mg2.3 --cascade --dry-run": ok(cascadePreview),
};

const WRITES = ["bd update ", "bd close ", "bd create ", "bd reopen "];

/** What a script answers: a result, an Error to reject the run (a timeout), or undefined to defer. */
export type Script = (key: string, argv: readonly string[]) => ProcessRunResult | Error | undefined;

export interface WorldOptions {
  script?: Script;
  stored?: Readonly<Record<string, unknown>>;
  files?: Readonly<Record<string, string>>;
  env?: Readonly<Record<string, string>>;
  /** What `$.ui.open` answers, nothing (placed) when not given; an Error makes the open throw. */
  openAnswer?: unknown;
}

export function world(on: On, options: WorldOptions = {}) {
  const runs: string[][] = [];
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
    return { value: undefined };
  });
  on("store.delete", (_engine, e) => {
    store.delete(e.key);
    return { value: undefined };
  });
  on("store.keys", () => ({ value: [...store.keys()] }));
  mock.env(on, options.env ?? { HOME: "/home/me" });
  on("fs.read", (_engine, e) => {
    const text = options.files?.[e.path];
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text };
  });
  on("process.run", (_engine, e) => {
    runs.push([...e.argv]);
    const key = keyOf(e.argv);
    const answer =
      options.script?.(key, e.argv) ??
      READS[key] ??
      (WRITES.some((prefix) => key.startsWith(prefix)) || key.endsWith(" --force")
        ? ok("{}")
        : exit(1, `unscripted: ${key}`));
    if (answer instanceof Error) return { deny: answer.message };
    return { value: answer };
  });
  on("ui.open", (_engine, e) => {
    opened.push(e);
    if (options.openAnswer instanceof Error) throw options.openAnswer;
    return { value: options.openAnswer as undefined };
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
  return { runs, keys, registered, opened, closed, toasts, focused, clock, store };
}

export const PANE_PROPS: RenderPropsOf["Pane"] = {
  title: "Beads",
  isFocused: true,
  bodyColumns: 118,
  placement: "inline",
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
