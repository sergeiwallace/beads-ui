import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const pluginDir = resolve(import.meta.dirname, "..");
const repoRoot = resolve(pluginDir, "../..");
const gate = join(repoRoot, "scripts/check-plugin-allowlist.mjs");
const allowlist = join(pluginDir, "validate-allowlist.json");
const SKIPPED = new Set(["node_modules", ".turbo"]);

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true });
});

// A copy of the real plugin, edited by `edit`, so each case is the shipped plugin plus one change.
function pluginWith(edit: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "beads-ui-allowlist-"));
  scratch.push(dir);
  cpSync(pluginDir, dir, { recursive: true, filter: (path) => !SKIPPED.has(basename(path)) });
  edit(dir);
  return dir;
}

function editRegister(dir: string, from: string, to: string) {
  const path = join(dir, "hooks/register.ts");
  const source = readFileSync(path, "utf8");
  expect(source).toContain(from);
  writeFileSync(path, source.replace(from, to));
}

const runGate = (dir: string) =>
  spawnSync("node", [gate, dir, allowlist], { cwd: repoRoot, encoding: "utf8" });

const SESSION_START = "for (const spec of COMMAND_SPECS) await $.command.register(spec);";
const IMPORT_ANCHOR = 'import { drawBand } from "./bands.ts";';

describe("the validate allow-list gate", () => {
  it("should pass when run on the real plugin", () => {
    const result = runGate(pluginDir);

    expect(result.stdout).toContain(
      "check-plugin-allowlist: plugins/beads-ui matches plugins/beads-ui/validate-allowlist.json",
    );
    expect(result.status).toBe(0);
  });

  it("should fail naming the call when the hooks module makes a $ call the allow-list lacks", () => {
    const dir = pluginWith((d) =>
      editRegister(d, SESSION_START, `${SESSION_START}\n    await $.store.delete("view");`),
    );

    const result = runGate(dir);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "check-plugin-allowlist: ./register.ts calls: $.store.delete is not in the allow-list",
    );
  });

  it("should fail naming the hook when the hooks module registers a hook the allow-list lacks", () => {
    const dir = pluginWith((d) =>
      editRegister(
        d,
        '  on("ui.render",',
        '  on("tool.call", async ($, e, next) => next(e));\n\n  on("ui.render",',
      ),
    );

    const result = runGate(dir);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "check-plugin-allowlist: ./register.ts hooks: tool.call is not in the allow-list",
    );
  });

  // Validate files both of these calls under ./register.ts: the first under a call name
  // register.ts already makes, the second with no mark at all. Only the file scan sees them.
  it("should fail naming the file and line when the hooks module hands $ to a helper in another file", () => {
    const dir = pluginWith((d) => {
      writeFileSync(
        join(d, "hooks/helper.ts"),
        'import type { EngineInterface } from "claude-code";\n\nexport async function view($: EngineInterface) {\n  return $.ui.open({ id: "other" });\n}\n',
      );
      editRegister(d, IMPORT_ANCHOR, `${IMPORT_ANCHOR}\nimport { view } from "./helper.ts";`);
      editRegister(d, SESSION_START, `${SESSION_START}\n    await view($);`);
    });

    const result = runGate(dir);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "check-plugin-allowlist: hooks/helper.ts:4: a $ call outside the hooks module (./register.ts)",
    );
  });

  it("should fail naming the file and line when the hooks module hands on to a helper in another file", () => {
    const dir = pluginWith((d) => {
      mkdirSync(join(d, "lib"));
      writeFileSync(
        join(d, "lib/extra.ts"),
        'import type { On } from "claude-code";\n\nexport function extra(on: On) {\n  on("ui.close", async ($, e, next) => {\n    await $.ui.open({ id: "other" });\n    return next(e);\n  });\n}\n',
      );
      editRegister(d, IMPORT_ANCHOR, `${IMPORT_ANCHOR}\nimport { extra } from "../lib/extra.ts";`);
      editRegister(
        d,
        "export function register(on: On) {",
        "export function register(on: On) {\n  extra(on);",
      );
    });

    const result = runGate(dir);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "check-plugin-allowlist: lib/extra.ts:5: a $ call outside the hooks module (./register.ts)",
    );
  });

  // The helper never writes `$.`, so the `$.` scan cannot see it; only the hooks module's
  // hand-off is visible.
  it("should fail naming the hooks module line when it passes $ to a helper with an untyped parameter", () => {
    const dir = pluginWith((d) => {
      writeFileSync(
        join(d, "hooks/helper.ts"),
        'export async function view(engine) {\n  return engine.ui.open({ id: "other" });\n}\n',
      );
      editRegister(d, IMPORT_ANCHOR, `${IMPORT_ANCHOR}\nimport { view } from "./helper.ts";`);
      editRegister(d, SESSION_START, `${SESSION_START}\n    await view($);`);
    });

    const result = runGate(dir);
    const handOff =
      readFileSync(join(dir, "hooks/register.ts"), "utf8")
        .split("\n")
        .indexOf("    await view($);") + 1;

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      `check-plugin-allowlist: hooks/register.ts:${handOff}: $ handed on rather than called, in the hooks module`,
    );
  });

  // validate --strict refuses this one itself, before the source scan runs.
  it("should fail naming the line when the hooks module aliases $ before handing it on", () => {
    const dir = pluginWith((d) => {
      writeFileSync(
        join(d, "hooks/helper.ts"),
        'export async function view(engine) {\n  return engine.ui.open({ id: "other" });\n}\n',
      );
      editRegister(d, IMPORT_ANCHOR, `${IMPORT_ANCHOR}\nimport { view } from "./helper.ts";`);
      editRegister(
        d,
        SESSION_START,
        `${SESSION_START}\n    const engine = $;\n    await view(engine);`,
      );
    });

    const result = runGate(dir);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("`const engine = $;`: $ itself is bound to a name");
  });

  it("should fail naming the file and line when a helper takes the engine by an aliased type", () => {
    const dir = pluginWith((d) =>
      writeFileSync(
        join(d, "hooks/helper.ts"),
        'import type { EngineInterface as Engine } from "claude-code";\n\nexport async function view(engine: Engine) {\n  return engine.ui.open({ id: "other" });\n}\n',
      ),
    );

    const result = runGate(dir);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "check-plugin-allowlist: hooks/helper.ts:1: the engine type EngineInterface outside the hooks module (./register.ts)",
    );
  });

  it("should fail on a namespace or inline engine type and pass a surface type, outside the hooks module", () => {
    const dir = pluginWith((d) => {
      mkdirSync(join(d, "lib"));
      writeFileSync(
        join(d, "lib/types.ts"),
        [
          'import type * as CC from "claude-code";',
          'import type { ClientSurface } from "claude-code";',
          "",
          "export type Engine = CC.EngineInterface;",
          'export type Start = import("claude-code").Hook<"session.start">;',
          "export type Surface = ClientSurface;",
          "",
        ].join("\n"),
      );
    });

    const result = runGate(dir);

    expect(result.status).toBe(1);
    const lines = result.stdout.split("\n").filter((line) => line.includes("lib/types.ts"));
    expect(lines).toEqual([
      "check-plugin-allowlist: lib/types.ts:4: the engine type EngineInterface outside the hooks module (./register.ts)",
      "check-plugin-allowlist: lib/types.ts:5: the engine type Hook outside the hooks module (./register.ts)",
    ]);
  });

  it("should fail naming the entry when an allow-listed call is no longer reported", () => {
    const dir = pluginWith((d) => editRegister(d, SESSION_START, "await Promise.resolve();"));

    const result = runGate(dir);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "check-plugin-allowlist: ./register.ts calls: $.command.register is allow-listed but not reported",
    );
  });
});
