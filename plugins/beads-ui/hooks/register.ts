import type { On } from "claude-code";

import { isTaskPanelRetired } from "../core/src/index.ts";
import { BandSettingsPanel } from "./bandSettings.ts";
import { drawBand } from "./bands.ts";
import { CONFIRM_ID, DeleteConfirm } from "./confirm.ts";
import type { Host } from "./host.ts";
import { BeadsPane, PANE_ID, type TasksRegion } from "./pane.ts";
import { TASKS_CLIENT_KEY } from "./panel.ts";
import { StoreResolver } from "./store.ts";
import { readStream } from "./stream.ts";
import { BandTally, EditSync } from "./tally.ts";

export const PLUGIN_NAME = "beads-ui";
export const COMMAND_NAME = "show-beads-ui";
/** D-7 (a): the short alias. The command spec has no alias field, so it is a second command. */
export const ALIAS_NAME = "bu";
export { CONFIRM_ID, PANE_ID };
export const OPEN_FAILED_TEXT = "beads-ui could not open its pane";

const COMMAND_SPECS = [
  {
    name: COMMAND_NAME,
    description: "Open or close the beads-ui board for this session's Beads store",
  },
  { name: ALIAS_NAME, description: "Open or close the beads-ui board (short for /show-beads-ui)" },
] as const;

/**
 * Registers `/show-beads-ui` and `/bu`, the pane they toggle, its delete confirmation, the band above
 * the prompt and the publish after each edit (T-2B.6). Every `$` call of the plugin sits in this file; the helpers get a Host of plain
 * closures, never `$`.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  const stores = new StoreResolver();
  const bandSettings = new BandSettingsPanel(stores);
  const pane = new BeadsPane(stores, bandSettings);
  const tally = new BandTally(stores, bandSettings);
  const sync = new EditSync(stores);
  tally.sync = sync.state;
  sync.onChange = () => tally.syncChanged();
  bandSettings.onChange = () => void tally.settingsChanged();
  // Each write the pane or the confirmation makes names the store it ran in: that store is
  // woken and published, even when the pane has re-resolved its store since.
  const wrote = (store: string) => {
    tally.afterWrite(store);
    sync.wrote(store);
  };
  pane.onWrite = wrote;
  const confirm = new DeleteConfirm(
    (text, undo, store) => {
      pane.afterConfirm(text, undo);
      wrote(store);
    },
    () => void pane.resume(),
    () => pane.storePath(),
  );
  pane.onDelete = (issue, issues) => {
    void pane
      .suspend()
      .then(() => confirm.open(issue, issues))
      .catch(() => undefined);
  };

  on("session.start", async ($, e, next) => {
    const host: Host = {
      cwd: e.cwd,
      run: (argv, timeoutMs) =>
        $.process.run(argv, { cwd: e.cwd, timeoutMs, env: { NO_COLOR: "1" } }),
      runIn: (cwd, argv, timeoutMs) =>
        $.process.run(argv, { cwd, timeoutMs, env: { NO_COLOR: "1" } }),
      sessionEnv: async () => ({
        taskListId: await $.env.get("CLAUDE_CODE_TASK_LIST_ID"),
        kind: await $.env.get("CLAUDE_CODE_SESSION_KIND"),
        backend: await $.env.get("CLAUDE_BG_BACKEND"),
        name: await $.env.get("CLAUDE_CODE_SESSION_NAME"),
      }),
      stream: (cwd, argv, timeoutMs) =>
        readStream($.process.spawn({ argv, cwd, env: { NO_COLOR: "1" } }), timeoutMs, (ms, fn) =>
          $.clock.after(ms, fn),
        ),
      now: () => $.clock.now(),
      every: (ms, fn) => $.clock.every(ms, fn),
      after: (ms, fn) => $.clock.after(ms, fn),
      storeGet: (key) => $.store.get(key),
      storeSet: (key, value) => $.store.set(key, value),
      readFile: (path) => $.fs.read(path),
      writeFile: (path, text) => $.fs.write(path, text),
      pluginRoot: $.plugin.root,
      stateHome: () => $.env.get("XDG_STATE_HOME"),
      configEnv: async () => ({
        xdgConfigHome: await $.env.get("XDG_CONFIG_HOME"),
        home: await $.env.get("HOME"),
      }),
      slugBudgetEnv: async () => ({
        body: await $.env.get("AIH_SLUG_BODY_MAX_CHARS"),
        child: await $.env.get("AIH_SLUG_BODY_MAX_CHARS_CHILD"),
      }),
      invalidate: () => $.ui.invalidate("ui.render"),
      toast: (text) => $.ui.toast(text),
      notify: (text) => $.ui.notify(text),
      submit: (text) => $.prompt.submit({ text }),
      openPane: (args) => $.ui.open(args),
      closePane: (id) => $.ui.close({ id }),
      focus: (requestId, key) => $.ui.focus({ requestId, key }),
    };
    for (const spec of COMMAND_SPECS) await $.command.register(spec);
    confirm.host = host;
    await stores.bind(host);
    await bandSettings.bind(host);
    await pane.bind(host);
    await tally.bind(host);
    sync.bind(host);
    // T-2B.7: the task panel opens at session start under panel.mode. Claude Code's own task
    // panel is retired when the settings deny TaskCreate by name, as ai-harness's switch does (D-21).
    if (e.isInteractive) {
      void $.settings
        .read({ key: "permissions" })
        .catch(() => undefined)
        .then((permissions) => pane.start(isTaskPanelRetired(permissions)))
        .catch(() => undefined);
    }

    return next(e);
  });

  on("command.run", { command: ["show-beads-ui", "bu"] }, async () => {
    await pane.toggle();

    return {};
  }).catch(() => ({ text: OPEN_FAILED_TEXT }));

  // A turn the session refused or dropped is sent again once a turn ends (T-2B.6).
  on("turn.complete", ($, e, next) => {
    sync.turnComplete((text) => $.prompt.submit({ text }));

    return next(e);
  });

  on("ui.close", { id: ["beads", "beads-confirm"] }, async (_$, e, next) => {
    const result = await next(e);
    if (result.deny === undefined && e.origin.kind !== "plugin") {
      if (e.id === PANE_ID) pane.closed();
      else confirm.cancelled();
    }

    return result;
  }).catch((_$, e, next) => next(e));

  on("ui.focus", { requestId: "beads" }, (_$, e, next) => {
    pane.focused(e.element);

    return next(e);
  }).catch((_$, e, next) => next(e));

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.props.hasSurvey) return next(e);
    const { Box, Text, Button } = await $.ui.resolve(e);
    const band = drawBand({ Box, Text, Button }, tally, () => void pane.openOrFocus());
    if (band === undefined) return next(e);

    return Box({ flexDirection: "column", children: [band, await next(e)] });
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE_ID && e.requestId !== CONFIRM_ID) {
      return next(e);
    }
    if (e.surface === "mobile") {
      const { Box, Text } = await $.ui.resolve(e);
      return Box({
        children: [Text({ children: "beads-ui draws its board on the terminal and desktop." })],
      });
    }

    const { Box, Text, Button, Input, Select, Markdown, Code } = await $.ui.resolve(e);
    const ui = { Box, Text, Button, Input, Select, Markdown, Code };
    const width = Math.max(20, e.props.bodyColumns - 1);
    if (e.requestId === CONFIRM_ID) return confirm.draw(ui, width);

    // A Client draws in the terminal and the desktop; VS Code draws none (D-31). Only the
    // terminal draws a Raster, the Timeline's bars (T-2B.9).
    const Client =
      e.surface === "terminal" || e.surface === "desktop"
        ? (await $.ui.resolve(e)).Client
        : undefined;
    const Raster = e.surface === "terminal" ? (await $.ui.resolve(e)).Raster : undefined;
    const help = Client?.({ key: "hello", module: "../client/hello.ts" });
    const tasks: TasksRegion | undefined =
      Client === undefined
        ? undefined
        : (props, width, height) =>
            Client({ key: TASKS_CLIENT_KEY, module: "../client/tasks.ts", props, width, height });
    // The tier and the short-height rule come from the props, which Claude Code redraws with on
    // every resize (T-1B.9).
    const frame = {
      width,
      bodyColumns: e.props.bodyColumns,
      placement: e.props.placement,
      ...(e.props.scroll === undefined ? {} : { bodyRows: e.props.scroll.bodyRows }),
    };
    return pane.draw(ui, frame, help, tasks, Raster);
  });

  // The task list's Client (T-2B.5): what it posts runs the pane's own actions, and a fault drops
  // it for the rest of the session, the element tree drawing the list in its place.
  on("ui.message", { requestId: "beads" }, async (_$, e, next) => {
    if (e.element === TASKS_CLIENT_KEY) await pane.clientMessage(e.data);

    return next(e);
  });

  on("ui.fault", { requestId: "beads" }, (_$, e, next) => {
    pane.clientFault(e.element);

    return next(e);
  });
}
