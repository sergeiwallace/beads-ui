// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  type Issue,
  mintDisplayId,
  parseBdShow,
  parseIdPolicy,
  planDisplayId,
  slugifyTitle,
  storeUsesDisplayIds,
  takenDisplayIds,
} from "../src/index.ts";
import minted from "./fixtures/bd-show-minted.json.ts";
import { allIssues, byId, unwrap } from "./helpers.ts";

const SUFFIX = /^[abcdefghjkmnpqrstuvwxyz]{4}$/;
// A fixed random source: the surface passes its own, tests pass a sequence.
const sequence = (...draws: number[]) => {
  let i = 0;
  return () => draws[i++ % draws.length] ?? 0;
};

// `bd show BU-mg2.3.1 BU-mg2.3.6 BU-mg2.3 BU-mg2 BU-2zw --json`: ids bd-new minted in this store.
const mintedIssues = unwrap(parseBdShow(minted));

function bodyOf(issue: Issue): string {
  const displayId = issue.displayId ?? "";
  return displayId.slice("BU-".length, displayId.lastIndexOf("-"));
}

describe("slugifyTitle", () => {
  test("should give the body bd-new minted for each issue when ported against this store", () => {
    expect(mintedIssues.map((issue) => [issue.id, issue.displayId])).toEqual([
      ["BU-mg2.3.1", "BU-t-0-1-core-module-gset"],
      ["BU-mg2.3.6", "BU-t-1-2-backlog-tab-vptb"],
      ["BU-mg2.3", "BU-beads-ui-claude-code-aeyb"],
      ["BU-mg2", "BU-epic-beads-ui-beads-task-manager-mg2"],
      ["BU-2zw", "BU-npm-audit-10-dev-only-advisories-2zw"],
    ]);
    for (const issue of mintedIssues) {
      expect(slugifyTitle(issue.title, { child: issue.parent !== undefined })).toBe(bodyOf(issue));
    }
  });

  test("should drop a digit-bearing lead for a top-level issue and keep it for a child", () => {
    const title = "T-1.4: quick-add and display-id minting";

    expect(slugifyTitle(title)).toBe("quick-add-display-id-minting");
    expect(slugifyTitle(title, { child: true })).toBe("t-1-4-quick-add");
  });

  test("should drop a leading verb and a trailing parenthetical when the rest still has words", () => {
    expect(slugifyTitle("Fix the board refresh (seen on tmux)")).toBe("board-refresh");
  });

  test("should fall back to task when the title has nothing to slug", () => {
    expect(slugifyTitle("日本語のタイトル")).toBe("task");
    expect(slugifyTitle("   ")).toBe("task");
  });

  test("should hard-cut a single word longer than the budget", () => {
    expect(slugifyTitle("a".repeat(40))).toBe("a".repeat(32));
  });
});

describe("mintDisplayId", () => {
  test("should mint PREFIX-body-suffix with four letters from bd-new's alphabet", () => {
    for (const issue of mintedIssues) {
      const id = unwrap(
        mintDisplayId({
          prefix: "BU",
          title: issue.title,
          child: issue.parent !== undefined,
          taken: new Set(),
          random: sequence(0, 0.5, 0.999, 0.25),
        }),
      );
      expect(id.slice(0, id.lastIndexOf("-"))).toBe(`BU-${bodyOf(issue)}`);
      expect(id.slice(id.lastIndexOf("-") + 1)).toMatch(SUFFIX);
    }
  });

  test("should re-draw the suffix when the first candidate is already taken", () => {
    const result = mintDisplayId({
      prefix: "BU",
      title: "bands",
      taken: new Set(["BU-bands-aaaa"]),
      random: sequence(0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5),
    });

    expect(result).toEqual({ ok: true, value: "BU-bands-nnnn" });
  });

  test("should return a collision error when every attempt draws a taken id", () => {
    const result = mintDisplayId({
      prefix: "BU",
      title: "bands",
      taken: new Set(["BU-bands-aaaa"]),
      random: () => 0,
    });

    expect(!result.ok && result.error.kind).toBe("collision");
  });

  test("should refuse a random source that draws outside [0, 1)", () => {
    for (const draw of [1, -0.1, Number.NaN]) {
      const result = mintDisplayId({
        prefix: "BU",
        title: "x",
        taken: new Set(),
        random: () => draw,
      });
      expect(!result.ok && result.error.kind).toBe("bad-random");
    }
  });
});

describe("planDisplayId", () => {
  const plan = (overrides: Partial<Parameters<typeof planDisplayId>[0]>) =>
    planDisplayId({
      policy: "auto",
      issues: allIssues(),
      createdId: "BU-mg2.3.11",
      title: "T-1.7: something new to build",
      child: true,
      random: sequence(0.1, 0.2, 0.3, 0.4),
      ...overrides,
    });

  test("should write metadata.display_id and the id label when the store already uses display ids", () => {
    expect(plan({})).toEqual({
      ok: true,
      value: {
        kind: "attach",
        displayId: "BU-t-1-7-something-new-cegk",
        argv: [
          "bd",
          "update",
          "BU-mg2.3.11",
          "--set-metadata",
          "display_id=BU-t-1-7-something-new-cegk",
          "--add-label",
          "id:BU-t-1-7-something-new-cegk",
          "--json",
        ],
      },
    });
  });

  test("should skip minting under auto when no issue in the store carries a display id", () => {
    const bare = allIssues().map((issue) => {
      const { displayId: _drop, ...rest } = issue;
      return rest;
    });

    const result = plan({ issues: bare });

    expect(result.ok && result.value.kind).toBe("skip");
  });

  test("should mint under fleet-slug even when the store carries no display id", () => {
    const result = plan({ policy: "fleet-slug", issues: [] });

    expect(result.ok && result.value.kind).toBe("attach");
  });

  test("should never touch metadata or labels when the policy is off", () => {
    expect(plan({ policy: "off" })).toEqual({
      ok: true,
      value: { kind: "skip", reason: "id_policy is off" },
    });
  });

  test("should keep an existing display id when the issue already carries one", () => {
    const result = plan({ createdId: "BU-mg2.3.5" });

    expect(result).toEqual({
      ok: true,
      value: { kind: "skip", reason: "BU-mg2.3.5 already carries BU-t-1-1-board-tab-nxdt" },
    });
  });

  test("should return an invalid-id error when the created id has no prefix", () => {
    const result = plan({ createdId: "mg2" });

    expect(!result.ok && result.error.kind).toBe("invalid-id");
  });

  // BU-2zw is a top-level issue bd-new minted in this store: `bd show BU-2zw --json` reads
  // title "npm audit: 10 dev-only advisories under markdownlint-cli2" and display id
  // BU-npm-audit-10-dev-only-advisories-2zw. Planned as if just created, it must get that id.
  const withoutOwnId = (id: string) => allIssues().filter((issue) => issue.id !== id);

  test("should copy the hash suffix bd-new copies when a top-level issue is created", () => {
    const top = byId(mintedIssues, "BU-2zw");

    const result = plan({
      createdId: top.id,
      title: top.title,
      child: false,
      issues: withoutOwnId(top.id),
      random: () => {
        throw new Error("a top-level suffix is copied, never drawn");
      },
    });

    expect(result.ok && result.value.kind === "attach" && result.value.displayId).toBe(
      top.displayId,
    );
  });

  test("should draw four letters when a child ordinal has no hash suffix of its own", () => {
    const child = byId(mintedIssues, "BU-mg2.3.6");

    const result = plan({
      createdId: child.id,
      title: child.title,
      child: true,
      issues: withoutOwnId(child.id),
      random: sequence(0, 0.5, 0.999, 0.25),
    });

    expect(result.ok && result.value.kind === "attach" && result.value.displayId).toBe(
      "BU-t-1-2-backlog-tab-anzf",
    );
  });

  test("should draw four letters when the hash suffix would trip the fleet task-id rule", () => {
    const result = plan({
      policy: "fleet-slug",
      createdId: "KG-0000",
      title: "fix the band",
      child: false,
      issues: [],
      random: sequence(0, 0, 0, 0),
    });

    expect(result.ok && result.value.kind === "attach" && result.value.displayId).toBe(
      "KG-band-aaaa",
    );
  });

  test("should copy a suffix with a letter even under a prefix the task-id rule names", () => {
    const result = plan({
      policy: "fleet-slug",
      createdId: "KG-g0000",
      title: "fix the band",
      child: false,
      issues: [],
    });

    expect(result.ok && result.value.kind === "attach" && result.value.displayId).toBe(
      "KG-band-g0000",
    );
  });

  test("should return an invalid-id error when the suffix is not one bd mints", () => {
    const result = plan({ createdId: "BU-Mg2_x", child: false });

    expect(!result.ok && result.error.kind).toBe("invalid-id");
  });
});

describe("storeUsesDisplayIds and takenDisplayIds", () => {
  test("should read display ids from metadata and from id labels", () => {
    const issues = allIssues();
    const labelOnly = { ...byId(issues, "BU-2zw"), labels: ["id:BU-legacy-only-qqqq"] };

    expect(storeUsesDisplayIds(issues)).toBe(true);
    expect(storeUsesDisplayIds([])).toBe(false);
    expect(takenDisplayIds([labelOnly]).has("BU-legacy-only-qqqq")).toBe(true);
    expect(takenDisplayIds(issues).size).toBe(30);
  });
});

describe("parseIdPolicy", () => {
  test("should accept auto, fleet-slug and off", () => {
    expect(["auto", "fleet-slug", "off"].map((text) => unwrap(parseIdPolicy(text)))).toEqual([
      "auto",
      "fleet-slug",
      "off",
    ]);
  });

  test("should return the accepted policies when the value is unknown", () => {
    expect(parseIdPolicy("always")).toEqual({
      ok: false,
      error: { kind: "unknown-id-policy", text: "always", accepted: ["auto", "fleet-slug", "off"] },
    });
  });
});
