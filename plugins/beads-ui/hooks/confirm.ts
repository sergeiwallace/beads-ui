import type { ProcessRunResult, RenderElement, RenderNode } from "claude-code";

import {
  type ConfirmEvent,
  type ConfirmPhase,
  type ConfirmState,
  confirmView,
  type Issue,
  nextCommand,
  openDeleteConfirm,
  reduceConfirm,
  type UndoClose,
} from "../core/src/index.ts";
import type { Host } from "./host.ts";
import { colorOf, type PaneUi } from "./pane.ts";

export const CONFIRM_ID = "beads-confirm";

const RUN_TIMEOUT_MS = 15_000;

const messageOf = (reason: unknown): string =>
  reason instanceof Error ? reason.message : String(reason);

// The event each phase's bd command answers with.
function answerOf(phase: ConfirmPhase, result: ProcessRunResult): ConfirmEvent | undefined {
  const { exitCode, stdout, stderr } = result;
  const message = stderr.trim() || stdout.trim();
  switch (phase) {
    case "previewing":
      return { type: "preview-loaded", exitCode, stdout, stderr };
    case "loading-cascade":
      return { type: "cascade-preview-loaded", exitCode, stdout };
    case "rechecking":
      return { type: "recheck-loaded", exitCode, stdout, stderr };
    case "closing":
      return { type: "close-finished", exitCode, message };
    case "deleting":
      return { type: "delete-finished", exitCode, message };
    default:
      return undefined;
  }
}

/**
 * The delete confirmation (T-1.5, D-13): a focused pane that holds toasts, drives core's state
 * machine, and runs only the command core names for the phase it is in. `bd delete --force` is
 * reachable only from core's `deleting` phase, which follows the preview, the re-check and, for
 * a cascade, the typed display id; Close instead runs `bd close` and never `bd delete`.
 */
export class DeleteConfirm {
  host: Host | undefined;
  state: ConfirmState | undefined;
  /** Moves on every phase change, so an answer for a phase already left is dropped. */
  private epoch = 0;
  /**
   * The store directory the confirmation opened on: its preview, its re-check and its write all
   * run there, and the write is reported there, whatever the pane re-resolves meanwhile.
   */
  private dir = "";

  constructor(
    /** The confirmation wrote in the store at `store`, or closed with nothing written. */
    private readonly finished: (text: string, undo: UndoClose | undefined, store: string) => void,
    private readonly dismissed: () => void,
    /** The directory of the store the pane reads, where bd runs. */
    private readonly storeDir: () => string,
  ) {}

  async open(issue: Issue, issues: readonly Issue[]): Promise<void> {
    const host = this.host;
    if (host === undefined) return;
    this.state = openDeleteConfirm(issue, issues);
    this.dir = this.storeDir();
    this.epoch++;
    await host.openPane({
      id: CONFIRM_ID,
      title: `Delete ${this.state.confirmToken}?`,
      focus: true,
      closeOnEscape: true,
      holdToasts: true,
    });
    host.invalidate();
    await this.step();
  }

  /** The person closed the pane (Esc, the close mark) before a write: nothing more runs. */
  cancelled(): void {
    const phase = this.state?.phase;
    if (phase === "closing" || phase === "deleting") return;
    this.state = undefined;
    this.dismissed();
  }

  dispatch(event: ConfirmEvent): void {
    const before = this.state;
    if (before === undefined) return;
    this.state = reduceConfirm(before, event);
    this.host?.invalidate();
    if (this.state.phase !== before.phase) {
      this.epoch++;
      void this.step();
    }
  }

  private async step(): Promise<void> {
    const state = this.state;
    const host = this.host;
    if (state === undefined || host === undefined) return;
    const argv = nextCommand(state);
    const epoch = this.epoch;
    if (argv === undefined) {
      await this.settle(state);
      return;
    }
    const result = await host.runIn(this.dir, argv, RUN_TIMEOUT_MS).catch(
      (reason: unknown): ProcessRunResult => ({
        exitCode: -1,
        stdout: "",
        stderr: `timed out or could not start: ${messageOf(reason)}`,
      }),
    );
    if (this.state === undefined || this.epoch !== epoch) return;
    const answer = answerOf(state.phase, result);
    if (answer !== undefined) this.dispatch(answer);
  }

  private async settle(state: ConfirmState): Promise<void> {
    if (state.phase !== "closed" && state.phase !== "deleted") return;
    const view = confirmView(state, 200);
    this.state = undefined;
    await this.host?.closePane(CONFIRM_ID).catch(() => undefined);
    this.finished(view.statusLine ?? "", view.undo, this.dir);
  }

  draw(ui: PaneUi, width: number): RenderElement {
    const { Box, Text, Button, Input, Code } = ui;
    const state = this.state;
    if (state === undefined) {
      return Box({ children: [Text({ dimColor: true, children: "Nothing to delete." })] });
    }
    const view = confirmView(state, width);
    const running =
      state.phase === "previewing" ||
      state.phase === "loading-cascade" ||
      state.phase === "rechecking";
    return Box({
      flexDirection: "column",
      gap: 1,
      children: [
        Box({ key: "confirm-heading", children: [Text({ bold: true, children: view.heading })] }),
        view.preview === ""
          ? Box({
              key: "confirm-preview",
              children: [Text({ dimColor: true, children: "running bd delete --dry-run…" })],
            })
          : Box({ key: "confirm-preview", children: [Code({ source: view.preview })] }),
        ...([
          view.dependentsLine === undefined
            ? undefined
            : Box({
                key: "confirm-dependents",
                children: [Text({ color: colorOf("warning"), children: view.dependentsLine })],
              }),
          view.input === undefined
            ? undefined
            : Input({
                key: "typed-id",
                label: "Type the id",
                placeholder: view.input.placeholder,
                value: view.input.value,
                submitLabel: "confirm",
                onInput: (text) => this.dispatch({ type: "typed", text }),
                onSubmit: (text) => this.dispatch({ type: "typed", text }),
              }),
          view.statusLine === undefined
            ? undefined
            : Box({
                key: "confirm-status",
                children: [Text({ color: colorOf("warning"), children: view.statusLine })],
              }),
        ].filter((node) => node !== undefined) as RenderNode[]),
        Box({
          key: "confirm-actions",
          flexDirection: "row",
          gap: 2,
          children: [
            ...(view.closeInstead.enabled
              ? [
                  Button({
                    key: "close-instead",
                    label: view.closeInstead.label,
                    hotkey: view.closeInstead.hotkey,
                    autoFocus: true as const,
                    onPress: () => this.dispatch({ type: "close-instead" }),
                  }),
                ]
              : []),
            view.delete.enabled
              ? Button({
                  key: "delete",
                  label: view.delete.label,
                  hotkey: view.delete.hotkey,
                  onPress: () => this.dispatch({ type: "delete" }),
                })
              : Text({
                  dimColor: true,
                  children: running
                    ? `${view.delete.label}: waiting for bd`
                    : view.delete.cascade
                      ? `${view.delete.label}: type the id above to enable`
                      : `${view.delete.label}: not available`,
                }),
            Text({ dimColor: true, children: "Esc cancels" }),
          ],
        }),
      ],
    });
  }
}
