// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  configCandidates,
  DEFAULT_CONFIG,
  parseToml,
  resolveConfig,
  resolveRank,
  resolveWeb,
} from "../src/index.ts";

// The example from the design's Configuration section, verbatim.
const DESIGN_EXAMPLE = `[stores.default]
path = "/data/projects/beads-ui"          # a repo with a .beads/ store
id_policy = "auto"                         # auto | fleet-slug | off
refresh_seconds = 10

[queue]
url = ""                                   # empty: no queue adapter; else http://127.0.0.1:8400
events = true

[views]
rank = false                                # manual rank off until enabled
soft_wip_limit = { in_progress = 5 }

[theme]
preset = "claude"                          # claude | plain | custom
`;

describe("parseToml", () => {
  test("should read the design's example when the file holds it", () => {
    const parsed = parseToml(DESIGN_EXAMPLE);

    expect(parsed).toEqual({
      ok: true,
      value: {
        stores: {
          default: { path: "/data/projects/beads-ui", id_policy: "auto", refresh_seconds: 10 },
        },
        queue: { url: "", events: true },
        views: { rank: false, soft_wip_limit: { in_progress: 5 } },
        theme: { preset: "claude" },
      },
    });
  });

  test("should keep a # inside a string and read escapes when a value is quoted", () => {
    expect(parseToml(`a = "x # y"\nb = 'c:\\\\d'\nc = "tab\\there"`)).toEqual({
      ok: true,
      value: { a: "x # y", b: "c:\\\\d", c: "tab\there" },
    });
  });

  test("should name the line when the file holds something outside the subset", () => {
    for (const [text, line, message] of [
      ["a = 1\nb = [1, 2]", 2, "arrays hold strings only, on one line"],
      ["[[stores]]", 1, "arrays of tables are not supported"],
      ["a = 1\na = 2", 2, "duplicate key a"],
      ['a = "open', 1, "unterminated string"],
      ["a = soon", 1, 'unsupported value "soon"'],
      ["just text", 1, "expected key = value"],
    ] as const) {
      expect(parseToml(text)).toEqual({ ok: false, error: { kind: "toml-error", line, message } });
    }
  });
});

describe("resolveConfig", () => {
  test("should use the design's defaults when no file exists", () => {
    expect(resolveConfig(undefined, "/work")).toEqual({
      config: { idPolicy: "auto", refreshSeconds: 10, softWipLimit: { in_progress: 5 } },
      problems: [],
    });
  });

  test("should read a store's settings by its path before the default store", () => {
    const text = `[stores.default]
id_policy = "fleet-slug"
refresh_seconds = 30

[stores.here]
path = "/work/"
id_policy = "off"

[views]
soft_wip_limit = { in_progress = 3, review = 2 }
`;

    expect(resolveConfig(text, "/work").config).toEqual({
      idPolicy: "off",
      refreshSeconds: 10,
      softWipLimit: { in_progress: 3, review: 2 },
    });
    expect(resolveConfig(text, "/elsewhere").config.idPolicy).toBe("fleet-slug");
    expect(resolveConfig(text, "/elsewhere").config.refreshSeconds).toBe(30);
  });

  test("should keep the default and name the problem when a setting is invalid", () => {
    const resolved = resolveConfig(
      `[stores.default]\nid_policy = "always"\nrefresh_seconds = 2\n`,
      "/work",
    );

    expect(resolved.config).toEqual({ ...DEFAULT_CONFIG, refreshSeconds: 10 });
    expect(resolved.problems).toEqual([
      'id_policy "always" is not one of auto, fleet-slug, off; using auto',
      "refresh_seconds 2 is below 10; using 10",
    ]);
  });

  test("should fall back to every default and name the line when the file does not parse", () => {
    expect(resolveConfig("[stores.default\n", "/work")).toEqual({
      config: DEFAULT_CONFIG,
      problems: ["beads-ui.toml line 1: expected ] to end the table header; using the defaults"],
    });
  });
});

describe("configCandidates", () => {
  test("should look in the repository root before the user's config directory", () => {
    expect(configCandidates("/work/", { home: "/home/me" })).toEqual([
      "/work/beads-ui.toml",
      "/home/me/.config/beads-ui/beads-ui.toml",
    ]);
    expect(configCandidates("/work", { xdgConfigHome: "/cfg", home: "/home/me" })).toEqual([
      "/work/beads-ui.toml",
      "/cfg/beads-ui/beads-ui.toml",
    ]);
    expect(configCandidates("/work", {})).toEqual(["/work/beads-ui.toml"]);
  });
});

describe("resolveWeb", () => {
  test("should read the web server's host and port when the file sets them", () => {
    expect(resolveWeb('[web]\nhost = "127.0.0.1"\nport = 4900\n')).toEqual({
      host: "127.0.0.1",
      port: 4900,
      problems: [],
    });
    expect(resolveWeb(undefined)).toEqual({ problems: [] });
  });

  test("should leave a port outside 0 to 65535 unset and name it", () => {
    expect(resolveWeb("[web]\nport = 70000\n")).toEqual({
      problems: ["web.port must be a whole number from 0 to 65535, not 70000"],
    });
  });

  test("should read base_path with a leading and a trailing slash when the file sets one", () => {
    expect(resolveWeb('[web]\nbase_path = "/beads"\n')).toEqual({
      basePath: "/beads/",
      problems: [],
    });
    expect(resolveWeb('[web]\nbase_path = "/"\n')).toEqual({ basePath: "/", problems: [] });
  });

  test("should leave a base_path that is not a plain path unset and name it", () => {
    for (const value of ['"beads"', '"/a/../b"', '"/a b"', "3"]) {
      const resolved = resolveWeb(`[web]\nbase_path = ${value}\n`);
      expect(resolved.basePath).toBeUndefined();
      expect(resolved.problems).toEqual([
        `web.base_path must be a path such as "/beads", not ${value}`,
      ]);
    }
  });
});

describe("resolveRank on the design's example", () => {
  test("should read the example's views.rank = false as off whatever the surface's default", () => {
    expect(resolveRank(DESIGN_EXAMPLE, true).rank).toBe(false);
  });
});
