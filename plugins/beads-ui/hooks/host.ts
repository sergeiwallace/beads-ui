import type { PaneOpenArgs, ProcessRunResult, Timer } from "claude-code";

import type { Streamed } from "./stream.ts";

/**
 * The engine as `session.start` bound it from its `$`: plain closures, each one `$` call in
 * register.ts, so no helper file ever holds `$` (the pattern Claude Code's own `diff` mod uses).
 */
export interface Host {
  /**
   * The session's directory: where `bd where` asks for a store and beads-ui.toml is looked for
   * first. The store the pane reads can be another directory (D-24, hooks/store.ts).
   */
  cwd: string;
  /** `$.process.run` in `cwd`; rejects when bd cannot start or outlives `timeoutMs`. */
  run: (argv: readonly string[], timeoutMs: number) => Promise<ProcessRunResult>;
  /** `$.process.run` in a store's directory `cwd`: the pane's store and the band's every store. */
  runIn: (cwd: string, argv: readonly string[], timeoutMs: number) => Promise<ProcessRunResult>;
  /** `$.env.get` of the session's name, which `ai c` pins in `CLAUDE_CODE_TASK_LIST_ID`. */
  sessionName: () => Promise<string | undefined>;
  /**
   * `$.process.spawn` in the store directory `cwd`, read to its end: the whole output, past
   * `$.process.run`'s 4 MiB. Rejects when bd cannot start, is ended by a signal or outlives
   * `timeoutMs`.
   */
  stream: (cwd: string, argv: readonly string[], timeoutMs: number) => Promise<Streamed>;
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
  /** `$.fs.write`, creating the file and its directories; not atomic. */
  writeFile: (path: string, text: string) => Promise<void>;
  /** `$.plugin.root`: the plugin's directory, which holds the host refresher. */
  pluginRoot: string;
  /** `$.env.get("XDG_STATE_HOME")`, which places the host refresher's state directory. */
  stateHome: () => Promise<string | undefined>;
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
