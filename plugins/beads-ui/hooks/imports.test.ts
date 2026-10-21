import type { RenderPropsOf } from "claude-code";
import { describe, expect, test } from "claude-code/testing";

// The import probe (design T-0.1). It imports nothing from the plugin itself, so the
// engine's own load of the plugin is what meets a refused import, and the probe's
// failure names the import it relies on.
const HOOKS_IMPORT = 'hooks/register.ts imports "../core/src/index.ts"';
const CLIENT_IMPORT = 'client/hello.ts imports "./greeting.ts"';

const CORE_COLUMNS = "Columns: active, wip, frozen, done";
const SIBLING_GREETING = "The board draws here in a later release.";

const PANE: RenderPropsOf["Pane"] = {
  title: "Beads",
  isFocused: true,
  bodyColumns: 80,
  placement: "dock",
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
};

const messageOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

const refused = (name: string, reason: unknown): Error =>
  new Error(`import refused: ${name}: ${messageOf(reason)}`);

// The engine's load refusal says which file's import it refused: "(from <file>)".
const importOf = (reason: unknown): string => {
  const message = messageOf(reason);
  if (message.includes("(from hooks/register.ts)")) return HOOKS_IMPORT;
  if (message.includes("(from client/hello.ts)")) return CLIENT_IMPORT;
  return `${HOOKS_IMPORT} or ${CLIENT_IMPORT}`;
};

describe("imports", () => {
  test("should load the hooks module's core import and the Client module's sibling import when the pane mounts", async ($) => {
    const ui = await $.ui
      .mount({
        plugin: "beads-ui",
        surface: "terminal",
        component: "Pane",
        props: PANE,
        requestId: "beads",
        viewport: { columns: 160, rows: 40, isFullscreen: true },
      })
      .catch((reason: unknown) => {
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
