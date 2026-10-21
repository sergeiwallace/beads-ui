// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import { undoArgv, undoClose, undoForMove, undoView } from "../src/index.ts";
import { storeStatuses } from "./helpers.ts";

const move = (from: string, to: string) =>
  undoForMove(storeStatuses(), { id: "BU-2zw", label: "BU-npm-audit-2zw", from, to });

describe("undo for a close", () => {
  test("should restore the previous status through the guarded write when a move closed the issue", () => {
    const undo = move("in_progress", "closed");

    expect(undo && undoArgv(undo)).toEqual([
      "bd",
      "update",
      "BU-2zw",
      "--status",
      "in_progress",
      "--if-status",
      "closed",
      "--json",
    ]);
    expect(undo && undoView(undo, 80)).toEqual({
      line: "BU-npm-audit-2zw is closed; u puts it back to in_progress",
      label: "Undo close",
      hotkey: "u",
    });
  });

  test("should offer no undo when the move stays outside the done category", () => {
    expect(move("open", "in_progress")).toBeUndefined();
    expect(move("closed", "open")).toBeUndefined();
  });

  test("should offer no undo when the issue was already in the closed status", () => {
    expect(
      undoClose({ id: "BU-2zw", label: "BU-2zw", previous: "closed", closed: "closed" }),
    ).toBeUndefined();
  });
});
