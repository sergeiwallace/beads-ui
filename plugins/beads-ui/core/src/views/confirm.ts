import {
  cascadePreviewArgv,
  closeArgv,
  deleteArgv,
  deletePreviewArgv,
  reopenArgv,
} from "../argv.ts";
import type { BdArgv, DeletePreview, Issue } from "../model.ts";
import { parseBdDeletePreview } from "../parsers.ts";
import { truncate } from "./text.ts";

/**
 * The delete ladder (D-13) as a state machine. `previewing` runs `bd delete <id> --dry-run`; a
 * clean preview is `ready`; a preview bd refused for dependents outside the set loads the cascade
 * preview and then needs the display id typed before Delete runs with `--cascade`. Delete then
 * re-runs the same preview (`rechecking`) and writes only while it still holds: a leaf that gained
 * a dependent goes to the typed-id cascade path, and a cascade whose set changed asks for the id
 * again over the new preview. Close instead is open from every phase before a write, and runs
 * `bd close`, never `bd delete`.
 */
export type ConfirmPhase =
  | "previewing"
  | "loading-cascade"
  | "ready"
  | "needs-typed-id"
  | "preview-failed"
  | "rechecking"
  | "closing"
  | "closed"
  | "deleting"
  | "deleted"
  | "failed";

export interface DependentView {
  id: string;
  displayId: string;
  title: string;
}

export interface ConfirmState {
  phase: ConfirmPhase;
  issueId: string;
  /** What the confirmation Input must equal: the display id, else the hash id. */
  confirmToken: string;
  title: string;
  /** `bd delete --dry-run` output, shown verbatim. */
  previewText: string;
  /** The store's issues that depend on this one, directly or through others. */
  dependents: DependentView[];
  cascadeRequired: boolean;
  cascade?: DeletePreview;
  typed: string;
  message?: string;
}

export type ConfirmEvent =
  | { type: "preview-loaded"; exitCode: number; stdout: string; stderr: string }
  | { type: "cascade-preview-loaded"; exitCode: number; stdout: string }
  | { type: "recheck-loaded"; exitCode: number; stdout: string; stderr: string }
  | { type: "typed"; text: string }
  | { type: "close-instead" }
  | { type: "delete" }
  | { type: "close-finished"; exitCode: number; message: string }
  | { type: "delete-finished"; exitCode: number; message: string };

const DEPENDENTS_REFUSAL = "has dependents not in deletion set";
const BEFORE_WRITE: readonly ConfirmPhase[] = [
  "previewing",
  "loading-cascade",
  "ready",
  "needs-typed-id",
  "preview-failed",
  "rechecking",
];

function dependentsOf(id: string, issues: readonly Issue[]): DependentView[] {
  const found = new Map<string, Issue>();
  const queue = [id];
  while (queue.length > 0) {
    const target = queue.shift();
    for (const issue of issues) {
      if (issue.id === id || found.has(issue.id)) continue;
      if (issue.dependencies.some((dep) => dep.id === target)) {
        found.set(issue.id, issue);
        queue.push(issue.id);
      }
    }
  }
  return [...found.values()].map((issue) => ({
    id: issue.id,
    displayId: issue.displayId ?? issue.id,
    title: issue.title,
  }));
}

export function openDeleteConfirm(issue: Issue, issues: readonly Issue[]): ConfirmState {
  return {
    phase: "previewing",
    issueId: issue.id,
    confirmToken: issue.displayId ?? issue.id,
    title: issue.title,
    previewText: "",
    dependents: dependentsOf(issue.id, issues),
    cascadeRequired: false,
    typed: "",
  };
}

export function deleteEnabled(state: ConfirmState): boolean {
  if (state.phase === "ready") return true;
  return state.phase === "needs-typed-id" && state.typed.trim() === state.confirmToken;
}

type RecheckEvent = Extract<ConfirmEvent, { type: "recheck-loaded" }>;

function recheckLeaf(state: ConfirmState, event: RecheckEvent): ConfirmState {
  const { message: _cleared, ...rest } = state;
  if (event.exitCode === 0) return { ...rest, phase: "deleting", previewText: event.stdout };
  if (`${event.stdout}\n${event.stderr}`.includes(DEPENDENTS_REFUSAL)) {
    return {
      ...rest,
      phase: "loading-cascade",
      previewText: event.stdout,
      cascadeRequired: true,
      typed: "",
      message: "a dependent was added since the preview; nothing was deleted",
    };
  }
  const message = event.stderr.trim() || `bd delete --dry-run failed (exit ${event.exitCode})`;
  return { ...rest, phase: "preview-failed", previewText: event.stdout, message };
}

const sameCascade = (a: DeletePreview, b: DeletePreview): boolean =>
  a.wouldDelete === b.wouldDelete &&
  a.wouldOrphan === b.wouldOrphan &&
  a.wouldRemoveDependencies === b.wouldRemoveDependencies &&
  a.issueIds.join("\n") === b.issueIds.join("\n");

function recheckCascade(state: ConfirmState, event: RecheckEvent): ConfirmState {
  const parsed = event.exitCode === 0 ? parseBdDeletePreview(event.stdout) : undefined;
  if (parsed?.ok !== true) {
    const message =
      parsed?.ok === false
        ? parsed.error.message
        : `bd delete --cascade --dry-run failed (exit ${event.exitCode})`;
    return { ...state, phase: "preview-failed", message };
  }
  if (state.cascade !== undefined && sameCascade(state.cascade, parsed.value)) {
    const { message: _cleared, ...rest } = state;
    return { ...rest, phase: "deleting" };
  }
  return {
    ...state,
    phase: "needs-typed-id",
    cascade: parsed.value,
    typed: "",
    message: "the cascade changed since the preview; nothing was deleted, type the id again",
  };
}

export function reduceConfirm(state: ConfirmState, event: ConfirmEvent): ConfirmState {
  switch (event.type) {
    case "preview-loaded": {
      if (state.phase !== "previewing") return state;
      const previewText = event.stdout;
      if (event.exitCode === 0) return { ...state, phase: "ready", previewText };
      if (`${event.stdout}\n${event.stderr}`.includes(DEPENDENTS_REFUSAL)) {
        return { ...state, phase: "loading-cascade", previewText, cascadeRequired: true };
      }
      const message = event.stderr.trim() || `bd delete --dry-run failed (exit ${event.exitCode})`;
      return { ...state, phase: "preview-failed", previewText, message };
    }
    case "cascade-preview-loaded": {
      if (state.phase !== "loading-cascade") return state;
      const parsed = event.exitCode === 0 ? parseBdDeletePreview(event.stdout) : undefined;
      if (parsed?.ok === true) return { ...state, phase: "needs-typed-id", cascade: parsed.value };
      const message =
        parsed?.ok === false
          ? parsed.error.message
          : `bd delete --cascade --dry-run failed (exit ${event.exitCode})`;
      return { ...state, phase: "preview-failed", message };
    }
    case "recheck-loaded":
      if (state.phase !== "rechecking") return state;
      return state.cascadeRequired ? recheckCascade(state, event) : recheckLeaf(state, event);
    case "typed":
      if (state.phase !== "needs-typed-id") return state;
      return { ...state, typed: event.text };
    case "close-instead":
      if (!BEFORE_WRITE.includes(state.phase)) return state;
      return { ...state, phase: "closing" };
    case "delete":
      if (!deleteEnabled(state)) return state;
      return { ...state, phase: "rechecking" };
    case "close-finished":
      if (state.phase !== "closing") return state;
      return event.exitCode === 0
        ? { ...state, phase: "closed", message: `${state.confirmToken} closed; reopen to undo` }
        : {
            ...state,
            phase: "failed",
            message: `bd close failed (exit ${event.exitCode}): ${event.message}`,
          };
    case "delete-finished":
      if (state.phase !== "deleting") return state;
      return event.exitCode === 0
        ? { ...state, phase: "deleted", message: `${state.confirmToken} deleted` }
        : {
            ...state,
            phase: "failed",
            message: `bd delete failed (exit ${event.exitCode}): ${event.message}`,
          };
  }
}

/** The bd command the surface runs for the current phase, if any. */
export function nextCommand(state: ConfirmState): BdArgv | undefined {
  switch (state.phase) {
    case "previewing":
      return deletePreviewArgv(state.issueId);
    case "loading-cascade":
      return cascadePreviewArgv(state.issueId);
    case "rechecking":
      return state.cascadeRequired
        ? cascadePreviewArgv(state.issueId)
        : deletePreviewArgv(state.issueId);
    case "closing":
      return closeArgv(state.issueId);
    case "deleting":
      return deleteArgv(state.issueId, { cascade: state.cascadeRequired });
    default:
      return undefined;
  }
}

export interface ConfirmView {
  heading: string;
  /** Rendered with `Code`. */
  preview: string;
  dependentsLine?: string;
  /** Present when a cascade needs the typed id. */
  input?: { placeholder: string; value: string; matches: boolean };
  closeInstead: { label: string; hotkey: string; enabled: boolean };
  delete: { label: string; hotkey: string; enabled: boolean; cascade: boolean };
  statusLine?: string;
  /** After Close instead: the reopen that undoes it (D-13). */
  undo?: BdArgv;
}

export function confirmView(state: ConfirmState, width: number): ConfirmView {
  const view: ConfirmView = {
    heading: truncate(`Delete ${state.confirmToken}? ${state.title}`, width),
    preview: state.previewText,
    closeInstead: {
      label: "Close instead",
      hotkey: "c",
      enabled: BEFORE_WRITE.includes(state.phase),
    },
    delete: {
      label: state.cascadeRequired ? "Delete with --cascade" : "Delete",
      hotkey: "x",
      enabled: deleteEnabled(state),
      cascade: state.cascadeRequired,
    },
  };

  if (state.cascadeRequired) {
    const names = state.dependents.map((dependent) => dependent.displayId).join(", ");
    const counts =
      state.cascade === undefined
        ? ""
        : ` (bd would delete ${state.cascade.wouldDelete} issues, ${state.cascade.wouldRemoveDependencies} dependencies, ${state.cascade.wouldRemoveEvents} events, ${state.cascade.wouldRemoveLabels} labels)`;
    view.dependentsLine = truncate(
      `${state.dependents.length} dependents would be deleted with --cascade${counts}: ${names}`,
      width,
    );
  }
  if (state.phase === "needs-typed-id") {
    view.input = {
      placeholder: `type ${state.confirmToken} to enable Delete`,
      value: state.typed,
      matches: state.typed.trim() === state.confirmToken,
    };
  }
  if (state.message !== undefined) view.statusLine = truncate(state.message, width);
  if (state.phase === "closed") view.undo = reopenArgv(state.issueId);
  return view;
}
