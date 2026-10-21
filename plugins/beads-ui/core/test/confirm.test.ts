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
  undoArgv,
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
const leafRecheck: ConfirmEvent = {
  type: "recheck-loaded",
  exitCode: 0,
  stdout: leafText,
  stderr: "",
};
const cascadeRecheck: ConfirmEvent = {
  type: "recheck-loaded",
  exitCode: 0,
  stdout: cascadePreview,
  stderr: "",
};
const leafReady = () =>
  run(openFor("BU-2zw"), { type: "preview-loaded", exitCode: 0, stdout: leafText, stderr: "" });

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
    const rechecking = reduceConfirm(ready, { type: "delete" });
    expect(nextCommand(rechecking)).toEqual(["bd", "delete", "BU-2zw", "--dry-run"]);
    expect(nextCommand(reduceConfirm(rechecking, leafRecheck))).toEqual([
      "bd",
      "delete",
      "BU-2zw",
      "--force",
      "--json",
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
    const rechecking = reduceConfirm(typed, { type: "delete" });
    expect(nextCommand(rechecking)).toEqual([
      "bd",
      "delete",
      "BU-mg2.3",
      "--cascade",
      "--dry-run",
      "--json",
    ]);
    expect(nextCommand(reduceConfirm(rechecking, cascadeRecheck))).toEqual([
      "bd",
      "delete",
      "BU-mg2.3",
      "--cascade",
      "--force",
      "--json",
    ]);
  });

  test("should run bd close and never bd delete when Close instead is chosen", () => {
    const closing = reduceConfirm(atTypedId(), { type: "close-instead" });

    expect(nextCommand(closing)).toEqual(["bd", "close", "BU-mg2.3", "--json"]);
    const closed = run(
      closing,
      { type: "close-finished", exitCode: 0, message: "" },
      { type: "typed", text: "BU-beads-ui-claude-code-aeyb" },
      { type: "delete" },
    );
    expect(closed.phase).toBe("closed");
    expect(nextCommand(closed)).toBeUndefined();
    const view = confirmView(closed, 80);
    expect(view.undo).toEqual({
      id: "BU-mg2.3",
      label: "BU-beads-ui-claude-code-aeyb",
      previous: "in_progress",
      closed: "closed",
    });
    expect(view.undo && undoArgv(view.undo)).toEqual([
      "bd",
      "update",
      "BU-mg2.3",
      "--status",
      "in_progress",
      "--if-status",
      "closed",
      "--json",
    ]);
    expect([view.closeInstead.enabled, view.delete.enabled]).toEqual([false, false]);
  });

  test("should allow Close instead before the preview has loaded", () => {
    expect(nextCommand(reduceConfirm(openFor("BU-2zw"), { type: "close-instead" }))).toEqual([
      "bd",
      "close",
      "BU-2zw",
      "--json",
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
      cascadeRecheck,
      { type: "delete-finished", exitCode: 1, message: "lock held" },
    );

    expect([failed.phase, confirmView(failed, 80).statusLine]).toEqual([
      "failed",
      "bd delete failed (exit 1): lock held",
    ]);
    expect(nextCommand(failed)).toBeUndefined();
  });

  test("should re-run the dry run before a leaf delete and write only when it still holds", () => {
    const rechecking = reduceConfirm(leafReady(), { type: "delete" });

    expect(rechecking.phase).toBe("rechecking");
    expect(confirmView(rechecking, 80).delete.enabled).toBe(false);
    expect(nextCommand(rechecking)).toEqual(["bd", "delete", "BU-2zw", "--dry-run"]);
    expect(reduceConfirm(rechecking, leafRecheck).phase).toBe("deleting");
  });

  test("should go to the typed-id cascade path when the re-check finds a new dependent", () => {
    const rechecked = run(leafReady(), { type: "delete" }, { ...refused, type: "recheck-loaded" });

    expect(rechecked.phase).toBe("loading-cascade");
    expect(rechecked.cascadeRequired).toBe(true);
    expect(confirmView(rechecked, 80).statusLine).toBe(
      "a dependent was added since the preview; nothing was deleted",
    );
    expect(nextCommand(rechecked)).toEqual([
      "bd",
      "delete",
      "BU-2zw",
      "--cascade",
      "--dry-run",
      "--json",
    ]);
    const atCascade = run(rechecked, cascadeLoaded, { type: "delete" });
    expect(atCascade.phase).toBe("needs-typed-id");
    expect(nextCommand(atCascade)).toBeUndefined();
  });

  test("should ask for the id again when the cascade's set changed since its preview", () => {
    const grown = JSON.stringify({ ...JSON.parse(cascadePreview), would_delete: 12 });

    const rechecked = run(
      atTypedId(),
      { type: "typed", text: "BU-beads-ui-claude-code-aeyb" },
      { type: "delete" },
      { type: "recheck-loaded", exitCode: 0, stdout: grown, stderr: "" },
    );

    expect([rechecked.phase, rechecked.typed, rechecked.cascade?.wouldDelete]).toEqual([
      "needs-typed-id",
      "",
      12,
    ]);
    expect(deleteEnabled(rechecked)).toBe(false);
    expect(nextCommand(rechecked)).toBeUndefined();
  });

  test("should refuse the delete when the re-check itself fails", () => {
    const failed = run(
      leafReady(),
      { type: "delete" },
      { type: "recheck-loaded", exitCode: 1, stdout: "", stderr: "Error: database is locked\n" },
    );

    expect([failed.phase, failed.message]).toEqual(["preview-failed", "Error: database is locked"]);
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
