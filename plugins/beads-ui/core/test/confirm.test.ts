// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  type ConfirmEvent,
  type ConfirmState,
  confirmView,
  deleteEnabled,
  nextCommand,
  openDeleteConfirm,
  reduceConfirm,
} from "../src/index.ts";
import cascadePreview from "./fixtures/bd-delete-cascade-dry-run.json.ts";
import refusedJson from "./fixtures/bd-delete-dry-run-dependents.json.ts";
import refusedText from "./fixtures/bd-delete-dry-run-dependents.txt.ts";
import leafText from "./fixtures/bd-delete-dry-run-leaf.txt.ts";
import { allIssues, byId } from "./helpers.ts";

const run = (state: ConfirmState, ...events: ConfirmEvent[]) => events.reduce(reduceConfirm, state);
const openFor = (id: string) => openDeleteConfirm(byId(allIssues(), id), allIssues());
// `bd delete BU-mg2.3 --dry-run` exits 1 and prints the refusal on stdout and stderr alike.
const refused: ConfirmEvent = {
  type: "preview-loaded",
  exitCode: 1,
  stdout: refusedText,
  stderr: "",
};
const cascadeLoaded: ConfirmEvent = {
  type: "cascade-preview-loaded",
  exitCode: 0,
  stdout: cascadePreview,
};
const atTypedId = () => run(openFor("BU-mg2.3"), refused, cascadeLoaded);

describe("the delete confirmation", () => {
  test("should run bd delete --dry-run first and offer Close instead before any write", () => {
    const opened = openFor("BU-2zw");

    expect(nextCommand(opened)).toEqual(["bd", "delete", "BU-2zw", "--dry-run"]);
    const view = confirmView(opened, 80);
    expect([view.closeInstead.enabled, view.delete.enabled]).toEqual([true, false]);
  });

  test("should show bd's preview and enable a plain Delete when the dry run is clean", () => {
    const ready = run(openFor("BU-2zw"), {
      type: "preview-loaded",
      exitCode: 0,
      stdout: leafText,
      stderr: "",
    });

    const view = confirmView(ready, 80);
    expect(view.preview).toBe(leafText);
    expect(view.delete).toEqual({ label: "Delete", hotkey: "x", enabled: true, cascade: false });
    expect(view.input).toBeUndefined();
    expect(nextCommand(reduceConfirm(ready, { type: "delete" }))).toEqual([
      "bd",
      "delete",
      "BU-2zw",
      "--force",
    ]);
  });

  test("should load the cascade preview when the dry run finds dependents outside the selection", () => {
    const state = run(openFor("BU-mg2.3"), refused);

    expect(state.phase).toBe("loading-cascade");
    expect(nextCommand(state)).toEqual([
      "bd",
      "delete",
      "BU-mg2.3",
      "--cascade",
      "--dry-run",
      "--json",
    ]);
    expect(deleteEnabled(state)).toBe(false);
  });

  test("should require the display id typed before enabling Delete with --cascade", () => {
    const state = atTypedId();

    const view = confirmView(state, 400);
    expect(view.delete).toEqual({
      label: "Delete with --cascade",
      hotkey: "x",
      enabled: false,
      cascade: true,
    });
    expect(view.input).toEqual({
      placeholder: "type BU-beads-ui-claude-code-aeyb to enable Delete",
      value: "",
      matches: false,
    });
    expect(view.dependentsLine).toMatch(
      /^10 dependents would be deleted with --cascade \(bd would delete 11 issues, 11 dependencies, 34 events, 11 labels\): BU-t-1-6-bands-beads-tqpj, /,
    );

    const wrong = run(state, { type: "typed", text: "BU-mg2.3" }, { type: "delete" });
    expect(wrong.phase).toBe("needs-typed-id");
    expect(nextCommand(wrong)).toBeUndefined();

    const typed = run(state, { type: "typed", text: " BU-beads-ui-claude-code-aeyb " });
    expect(confirmView(typed, 80).input?.matches).toBe(true);
    expect(nextCommand(reduceConfirm(typed, { type: "delete" }))).toEqual([
      "bd",
      "delete",
      "BU-mg2.3",
      "--cascade",
      "--force",
    ]);
  });

  test("should run bd close and never bd delete when Close instead is chosen", () => {
    const closing = reduceConfirm(atTypedId(), { type: "close-instead" });

    expect(nextCommand(closing)).toEqual(["bd", "close", "BU-mg2.3"]);
    const closed = run(
      closing,
      { type: "close-finished", exitCode: 0, message: "" },
      { type: "typed", text: "BU-beads-ui-claude-code-aeyb" },
      { type: "delete" },
    );
    expect(closed.phase).toBe("closed");
    expect(nextCommand(closed)).toBeUndefined();
    const view = confirmView(closed, 80);
    expect(view.undo).toEqual(["bd", "reopen", "BU-mg2.3"]);
    expect([view.closeInstead.enabled, view.delete.enabled]).toEqual([false, false]);
  });

  test("should allow Close instead before the preview has loaded", () => {
    expect(nextCommand(reduceConfirm(openFor("BU-2zw"), { type: "close-instead" }))).toEqual([
      "bd",
      "close",
      "BU-2zw",
    ]);
  });

  test("should keep Delete disabled and Close instead open when the dry run fails otherwise", () => {
    const failed = run(openFor("BU-2zw"), {
      type: "preview-loaded",
      exitCode: 1,
      stdout: "",
      stderr: "Error: database is locked\n",
    });

    const view = confirmView(failed, 80);
    expect(failed.phase).toBe("preview-failed");
    expect(view.statusLine).toBe("Error: database is locked");
    expect([view.closeInstead.enabled, view.delete.enabled]).toEqual([true, false]);
    expect(reduceConfirm(failed, { type: "delete" })).toBe(failed);
  });

  test("should refuse the cascade when its own preview is refused", () => {
    const failed = run(openFor("BU-mg2.3"), refused, {
      type: "cascade-preview-loaded",
      exitCode: 0,
      stdout: refusedJson,
    });

    expect(failed.phase).toBe("preview-failed");
    expect(
      deleteEnabled(run(failed, { type: "typed", text: "BU-beads-ui-claude-code-aeyb" })),
    ).toBe(false);
  });

  test("should name bd's exit code when the delete itself fails", () => {
    const failed = run(
      atTypedId(),
      { type: "typed", text: "BU-beads-ui-claude-code-aeyb" },
      { type: "delete" },
      { type: "delete-finished", exitCode: 1, message: "lock held" },
    );

    expect([failed.phase, confirmView(failed, 80).statusLine]).toEqual([
      "failed",
      "bd delete failed (exit 1): lock held",
    ]);
    expect(nextCommand(failed)).toBeUndefined();
  });

  test("should list the store's transitive dependents when the issue has children", () => {
    expect(
      atTypedId()
        .dependents.map((dependent) => dependent.id)
        .sort(),
    ).toEqual(
      allIssues()
        .filter((issue) => issue.parent === "BU-mg2.3")
        .map((issue) => issue.id)
        .sort(),
    );
    expect(openFor("BU-mg2").dependents).toHaveLength(28);
  });
});
