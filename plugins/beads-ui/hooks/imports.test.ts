import { describe, expect, test } from "claude-code/testing";

import { PANE_PROPS, SESSION, SHOW, VIEWPORT, world } from "./tests/world.ts";

// The import probe (design T-0.1). It imports nothing from the plugin's hooks module, so the
// engine's own load of the plugin is what meets a refused import, and the probe's failure names
// the import it relies on. The core import shows in the help panel's columns line, drawn from
// the core's STATUS_CATEGORIES; the Client's sibling import in the line the Client draws there.
const HOOKS_IMPORT = 'hooks/pane.ts imports "../core/src/index.ts"';
const CLIENT_IMPORT = 'client/hello.ts imports "./greeting.ts"';

const CORE_COLUMNS = "Columns: active, wip, frozen, done";
const SIBLING_GREETING =
  "Pointer drag arrives in a later release; every card's Move to is the keyboard path.";

const messageOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

const refused = (name: string, reason: unknown): Error =>
  new Error(`import refused: ${name}: ${messageOf(reason)}`);

// The engine's load refusal says which file's import it refused: "(from <file>)".
const importOf = (reason: unknown): string => {
  const message = messageOf(reason);
  if (/\(from hooks\/[\w-]+\.ts\)/.test(message)) return HOOKS_IMPORT;
  if (message.includes("(from client/hello.ts)")) return CLIENT_IMPORT;
  return `${HOOKS_IMPORT} or ${CLIENT_IMPORT}`;
};

describe("imports", () => {
  test("should load the hooks module's core import and the Client module's sibling import when the pane mounts", async ($, on) => {
    const w = world(on);
    const ui = await (async () => {
      await $.session.start(SESSION);
      await $.command.run(SHOW);
      await w.clock.settle();
      const mounted = await $.ui.mount({
        plugin: "beads-ui",
        surface: "terminal",
        component: "Pane",
        props: PANE_PROPS,
        requestId: "beads",
        viewport: VIEWPORT,
      });
      await mounted.press({ key: "help" });
      return mounted;
    })().catch((reason: unknown) => {
      throw refused(importOf(reason), reason);
    });

    const columns = await ui.find({ key: "columns" });
    if (columns?.text !== CORE_COLUMNS) {
      throw refused(HOOKS_IMPORT, `the pane drew ${JSON.stringify(columns?.text)}`);
    }

    const greeting = await ui.drawn({ in: "hello" }).catch((reason: unknown) => {
      throw refused(CLIENT_IMPORT, reason);
    });
    expect(JSON.stringify(greeting)).toContain(SIBLING_GREETING);

    await ui.unmount();
  });
});
