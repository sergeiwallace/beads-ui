import { describe, expect } from "claude-code/testing";
import { test } from "./tests/kit.js";
import { PANE_PROPS, SESSION, SHOW, VIEWPORT, world } from "./tests/world.js";

const HOOKS_IMPORT = 'hooks/pane.ts imports "../core/src/index.js"';
const CLIENT_IMPORT = 'client/hello.ts imports "./greeting.js"';

const CORE_COLUMNS = "Columns: active, wip, frozen, done";
const SIBLING_GREETING =
  "Pointer drag arrives in a later release; every card's Move to is the keyboard path.";

const messageOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

const refused = (name: string, reason: unknown): Error =>
  new Error(`import refused: ${name}: ${messageOf(reason)}`);

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
