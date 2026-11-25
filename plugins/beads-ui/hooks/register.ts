import type { On } from "claude-code";

import { isTaskPanelRetired, pictureForm } from "../core/src/index.js";
import { BandSettingsPanel } from "./bandSettings.js";
import { drawBand } from "./bands.js";
import type { SurfacePicture } from "./components/adapters.js";
import { CONFIRM_ID, DeleteConfirm } from "./confirm.js";
import type { Host } from "./host.js";
import { BandLevels } from "./levels.js";
import { BeadsPane, PANE_ID, type TasksRegion } from "./pane.js";
import { TASKS_CLIENT_KEY } from "./panel.js";
import { StoreResolver } from "./store.js";
import { readStream } from "./stream.js";
import { BandTally, EditSync } from "./tally.js";
import { readTerminal } from "./terminal.js";

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
  const levels = new BandLevels(tally, pane, () => stores.sessionName);
  const sync = new EditSync(stores);
  tally.sync = sync.state;
  sync.onChange = () => tally.syncChanged();
  bandSettings.onChange = () => void tally.settingsChanged();
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
        configDir: await $.env.get("CLAUDE_CONFIG_DIR"),
        userProfile: await $.env.get("USERPROFILE"),
      }),
      transcriptPath: async () => (await $.session.info()).transcriptPath,
      listDir: async (path) => (await $.fs.list(path)).map((entry) => entry.name),
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
      terminalEnv: async () => ({
        term: await $.env.get("TERM"),
        termProgram: await $.env.get("TERM_PROGRAM"),
        termProgramVersion: await $.env.get("TERM_PROGRAM_VERSION"),
        tmux: await $.env.get("TMUX"),
      }),
    };
    for (const spec of COMMAND_SPECS) await $.command.register(spec);
    confirm.host = host;
    await stores.bind(host);
    await bandSettings.bind(host);
    await pane.bind(host);
    await tally.bind(host);
    await levels.bind(host);
    sync.bind(host);
    void readTerminal(host)
      .then((verdict) => {
        pane.images = verdict;
        host.invalidate();
      })
      .catch(() => undefined);
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
    if ((e.surface !== "terminal" && e.surface !== "desktop") || e.props.hasSurvey) {
      return next(e);
    }
    const { Box, Text, Button, Input, Select, Markdown } = await $.ui.resolve(e);
    const band = drawBand(
      { Box, Text, Button, Input, Select, Markdown },
      levels,
      { columns: e.props.bodyColumns, maxRows: e.props.maxRows },
      {
        open: pane.isOpen,
        onOpen: () => void pane.openOrFocus(),
        onClose: () => void pane.close(),
      },
    );
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

    const Client =
      e.surface === "terminal" || e.surface === "desktop"
        ? (await $.ui.resolve(e)).Client
        : undefined;
    const Raster = e.surface === "terminal" ? (await $.ui.resolve(e)).Raster : undefined;
    const elements = await $.ui.resolve(e);
    const form = pictureForm(e.surface, pane.images.images);
    const picture: SurfacePicture =
      form === "image" && "Image" in elements
        ? { form, Image: elements.Image }
        : form === "svg" && "Svg" in elements
          ? { form, Svg: elements.Svg }
          : { form: "alt" };
    const help = Client?.({ key: "hello", module: "../client/hello.ts" });
    const tasks: TasksRegion | undefined =
      Client === undefined
        ? undefined
        : (props, width, height) =>
            Client({ key: TASKS_CLIENT_KEY, module: "../client/tasks.ts", props, width, height });
    const frame = {
      width,
      bodyColumns: e.props.bodyColumns,
      placement: e.props.placement,
      ...(e.props.scroll === undefined ? {} : { bodyRows: e.props.scroll.bodyRows }),
    };
    return pane.draw(ui, frame, help, tasks, Raster, picture);
  });

  on("ui.message", { requestId: "beads" }, async (_$, e, next) => {
    if (e.element === TASKS_CLIENT_KEY) await pane.clientMessage(e.data);

    return next(e);
  });

  on("ui.fault", { requestId: "beads" }, (_$, e, next) => {
    pane.clientFault(e.element);

    return next(e);
  });
}
