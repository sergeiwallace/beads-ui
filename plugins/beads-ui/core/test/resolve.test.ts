// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  directoryStores,
  parseBdWhere,
  parseToml,
  resolveStore,
  type StoreFacts,
  sessionPrefix,
} from "../src/index.ts";

const FACTS: StoreFacts = {
  cwd: "/work/bms-semantic-knowledge-graph",
  config: { path: undefined, text: undefined, checked: ["/work/x/beads-ui.toml"] },
  fixFile: "/home/me/.config/beads-ui/beads-ui.toml",
  home: "/home/me",
  cwdHasStore: false,
  session: "kg-ec2-3",
  inventory: {
    ok: true,
    value: [
      { name: "KG", path: "/work/sw-bms-workspace", synced: true },
      { name: "BU", path: "/work/beads-ui", synced: true },
    ],
  },
  inventoryPath: "/home/me/.beads/shared-server/publish-sweep.json",
};

describe("sessionPrefix", () => {
  test("should drop the host and number and upper-case the rest when given a fleet session name", () => {
    expect(sessionPrefix("kg-ec2-3")).toBe("KG");
    expect(sessionPrefix("aih-ec2-3")).toBe("AIH");
    expect(sessionPrefix("aih-ec2-firstmate-1")).toBe("AIH");
    expect(sessionPrefix("ai-cli-ec2-1")).toBe("AI_CLI");
    expect(sessionPrefix("laptop")).toBeUndefined();
  });
});

describe("resolveStore", () => {
  test("should prefer a mapping over the directory's own store when both apply", () => {
    const text = '[directory_stores]\nbms-semantic-knowledge-graph = "~/kg"\n';
    const resolved = resolveStore({
      ...FACTS,
      cwdHasStore: true,
      config: { path: "/x/beads-ui.toml", text, checked: [] },
    });

    expect(resolved).toEqual({ ok: true, path: "/home/me/kg", via: "mapping" });
  });

  test("should map a worktree inside a mapped directory to the same store when its name is not mapped", () => {
    const text = '[directory_stores]\nbms-semantic-knowledge-graph = "/work/sw-bms-workspace"\n';
    const resolved = resolveStore({
      ...FACTS,
      cwd: "/work/bms-semantic-knowledge-graph/.worktrees/feature",
      config: { path: "/x/beads-ui.toml", text, checked: [] },
    });

    expect(resolved).toEqual({
      ok: true,
      path: "/work/sw-bms-workspace",
      prefix: "KG",
      via: "mapping",
    });
  });

  test("should accept only an exact inventory key when the prefix is close to one", () => {
    const resolved = resolveStore({ ...FACTS, session: "kgx-ec2-3" });

    expect(resolved.ok).toBe(false);
  });

  test("should say the session has no name when it cannot take a prefix from one", () => {
    const resolved = resolveStore({ ...FACTS, session: undefined });

    expect(resolved.ok === false && resolved.tried[2]).toContain("the session has no name");
  });
});

describe("directoryStores", () => {
  test("should read a quoted directory name and refuse a relative store path", () => {
    const text = '[directory_stores]\n"my.repo" = "/work/store"\nother = "relative/dir"\n';

    expect(directoryStores(text, "/home/me")).toEqual({
      stores: { "my.repo": "/work/store" },
      problems: ["directory_stores.other must be an absolute path or start with ~/; ignored"],
    });
  });

  test("should still refuse an unquoted key with a dot when the TOML is parsed", () => {
    expect(parseToml("my.repo = 1\n").ok).toBe(false);
  });
});

describe("parseBdWhere", () => {
  test("should tell a store, no store and a non-answer apart from bd where's output", () => {
    expect(parseBdWhere(0, '{"path": "/work/beads-ui/.beads", "schema_version": 1}')).toBe(true);
    expect(parseBdWhere(1, '{"error": "no_beads_directory", "schema_version": 1}')).toBe(false);
    expect(parseBdWhere(null, "")).toBeUndefined();
  });
});
