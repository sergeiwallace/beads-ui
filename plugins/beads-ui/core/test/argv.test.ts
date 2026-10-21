import { describe, expect, test } from "claude-code/testing";
import {
  cascadePreviewArgv,
  closeArgv,
  deleteArgv,
  deletePreviewArgv,
  historyArgv,
  listArgv,
  moveArgv,
  readyArgv,
  reopenArgv,
  showArgv,
  statusesArgv,
} from "../src/index.ts";

describe("bd argv builders", () => {
  test("should build the read commands with --json when asked for the board's inputs", () => {
    expect(listArgv()).toEqual(["bd", "list", "--json", "--all", "--brief", "--limit", "0"]);
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
    ]);
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
    expect(deleteArgv("BU-2zw", { cascade: false })).toEqual(["bd", "delete", "BU-2zw", "--force"]);
    expect(deleteArgv("BU-mg2.3", { cascade: true })).toEqual([
      "bd",
      "delete",
      "BU-mg2.3",
      "--cascade",
      "--force",
    ]);
    expect(closeArgv("BU-2zw")).toEqual(["bd", "close", "BU-2zw"]);
    expect(reopenArgv("BU-2zw")).toEqual(["bd", "reopen", "BU-2zw"]);
  });

  test("should refuse an id or status that bd would read as a flag or split", () => {
    expect(() => showArgv("--all")).toThrow(RangeError);
    expect(() => deleteArgv("", { cascade: false })).toThrow(RangeError);
    expect(() => closeArgv("BU-1 BU-2")).toThrow(RangeError);
    expect(() => moveArgv("BU-2zw", "-s", "open")).toThrow(RangeError);
  });
});
