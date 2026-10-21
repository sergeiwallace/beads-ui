import type { PaneOpenArgs, ProcessRunResult, Timer } from "claude-code";

/**
 * The engine as `session.start` bound it from its `$`: plain closures, each one `$` call in
 * register.ts, so no helper file ever holds `$` (the pattern Claude Code's own `diff` mod uses).
 */
export interface Host {
  /** The session's directory: where bd runs and where beads-ui.toml is looked for first. */
  cwd: string;
  /** `$.process.run` in `cwd`; rejects when bd cannot start or outlives `timeoutMs`. */
  run: (argv: readonly string[], timeoutMs: number) => Promise<ProcessRunResult>;
  /** `$.clock.now`. */
  now: () => Promise<number>;
  /** `$.clock.every`. */
  every: (ms: number, fn: () => void) => Timer;
  /** `$.store.get`: view preferences only, never issue data. */
  storeGet: (key: string) => Promise<unknown>;
  /** `$.store.set`. */
  storeSet: (key: string, value: unknown) => Promise<void>;
  /** `$.fs.read`; rejects when the file is missing. */
  readFile: (path: string) => Promise<string>;
  /** `$.env.get` of the two variables that place the user's config directory. */
  configEnv: () => Promise<{ xdgConfigHome: string | undefined; home: string | undefined }>;
  /** `$.env.get` of bd-new's two slug budget overrides, read when an issue is created. */
  slugBudgetEnv: () => Promise<{ body: string | undefined; child: string | undefined }>;
  /** `$.ui.invalidate("ui.render")`: the pane, the confirmation and the band draw again. */
  invalidate: () => void;
  /** `$.ui.toast`. */
  toast: (text: string) => void;
  /** `$.ui.open`; resolves what the engine answered, `{ isPlaced: false }` when it held the pane. */
  openPane: (pane: PaneOpenArgs) => Promise<unknown>;
  /** `$.ui.close`. */
  closePane: (id: string) => Promise<void>;
  /** `$.ui.focus`: moves the pane's focus ring onto one of its elements. */
  focus: (requestId: string, key: string) => Promise<unknown>;
}
