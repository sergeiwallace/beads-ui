// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  boardReadArgvs,
  cascadePreviewArgv,
  closeArgv,
  deleteArgv,
  deletePreviewArgv,
  headArgv,
  historyArgv,
  moveArgv,
  readyArgv,
  reopenArgv,
  showArgv,
  statusesArgv,
} from "../src/index.ts";

describe("bd argv builders", () => {
  test("should build the read commands with --json when asked for the board's inputs", () => {
    expect(boardReadArgvs()).toEqual([
      ["bd", "list", "--json", "--brief", "--limit", "0"],
      [
        "bd",
        "list",
        "--json",
        "--brief",
        "--status",
        "closed",
        "--sort",
        "closed",
        "--limit",
        "25",
      ],
    ]);
    expect(headArgv()).toEqual(["bd", "vc", "status", "--json"]);
    expect(statusesArgv()).toEqual(["bd", "statuses", "--json"]);
    expect(readyArgv()).toEqual(["bd", "ready", "--json", "--brief", "--limit", "0"]);
    expect(showArgv("BU-mg2.3.5")).toEqual(["bd", "show", "BU-mg2.3.5", "--json"]);
    expect(historyArgv("BU-mg2.3.5")).toEqual([
      "bd",
      "history",
      "BU-mg2.3.5",
      "--events",
      "--json",
    ]);
  });

  test("should guard a status write on the shown status when building a move", () => {
    expect(moveArgv("BU-mg2.3.5", "in_progress", "open")).toEqual([
      "bd",
      "update",
      "BU-mg2.3.5",
      "--status",
      "in_progress",
      "--if-status",
      "open",
      "--json",
    ]);
  });

  test("should ask bd for JSON on every write, as D-4 requires for reads and writes", () => {
    const writes = [
      moveArgv("BU-2zw", "in_progress", "open"),
      closeArgv("BU-2zw"),
      reopenArgv("BU-2zw"),
      deleteArgv("BU-2zw", { cascade: false }),
      deleteArgv("BU-2zw", { cascade: true }),
    ];

    for (const argv of writes) expect(argv).toContain("--json");
  });

  test("should build the delete ladder's commands when given an issue id", () => {
    expect(deletePreviewArgv("BU-2zw")).toEqual(["bd", "delete", "BU-2zw", "--dry-run"]);
    expect(cascadePreviewArgv("BU-mg2.3")).toEqual([
      "bd",
      "delete",
      "BU-mg2.3",
      "--cascade",
      "--dry-run",
      "--json",
    ]);
    expect(deleteArgv("BU-2zw", { cascade: false })).toEqual([
      "bd",
      "delete",
      "BU-2zw",
      "--force",
      "--json",
    ]);
    expect(deleteArgv("BU-mg2.3", { cascade: true })).toEqual([
      "bd",
      "delete",
      "BU-mg2.3",
      "--cascade",
      "--force",
      "--json",
    ]);
    expect(closeArgv("BU-2zw")).toEqual(["bd", "close", "BU-2zw", "--json"]);
    expect(reopenArgv("BU-2zw")).toEqual(["bd", "reopen", "BU-2zw", "--json"]);
  });

  test("should refuse an id or status that bd would read as a flag or split", () => {
    expect(() => showArgv("--all")).toThrow(RangeError);
    expect(() => deleteArgv("", { cascade: false })).toThrow(RangeError);
    expect(() => closeArgv("BU-1 BU-2")).toThrow(RangeError);
    expect(() => moveArgv("BU-2zw", "-s", "open")).toThrow(RangeError);
  });
});
