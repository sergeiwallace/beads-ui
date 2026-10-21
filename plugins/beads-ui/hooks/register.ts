import type { On } from "claude-code";

import { STATUS_CATEGORIES } from "../core/src/index.ts";

export const PLUGIN_NAME = "beads-ui";
export const COMMAND_NAME = "beads";
export const PANE_ID = "beads";
const COLUMNS_TEXT = `Columns: ${STATUS_CATEGORIES.join(", ")}`;
export const OPEN_FAILED_TEXT = "beads-ui could not open its pane";

const COMMAND_SPEC = {
  name: COMMAND_NAME,
  description: "Open the beads-ui pane for this repository's Beads store",
} as const;

/**
 * Registers `/beads` and the hello pane it opens. Every `$` call of the plugin
 * sits in this file; a helper in another file gets plain closures, never `$`.
 *
 * @param on the engine's registrar
 */
export function register(on: On) {
  on("session.start", async ($, e, next) => {
    await $.command.register(COMMAND_SPEC);

    return next(e);
  });

  on("command.run", { command: COMMAND_NAME }, async ($) => {
    await $.ui.open({ id: PANE_ID, title: "Beads", focus: true, closeOnEscape: true });

    return {};
  }).catch(() => ({ text: OPEN_FAILED_TEXT }));

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) {
      return next(e);
    }

    const { Box, Text, Client } = await $.ui.resolve(e);

    return Box({
      flexDirection: "column",
      children: [
        Box({ key: "name", children: Text({ bold: true, children: PLUGIN_NAME }) }),
        Box({ key: "columns", children: Text({ children: COLUMNS_TEXT }) }),
        Client({ key: "hello", module: "../client/hello.ts" }),
      ],
    });
  });
}
