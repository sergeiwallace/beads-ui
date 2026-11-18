/** Codex companion host controller: shared board transitions, same-store bd-node writes. */
import { type BoardState, INITIAL_BOARD_STATE, planMove, reduceBoard } from "@beads-ui/core";
import type { BdClient } from "../../../packages/bd-node/src/index.ts";

type BoardClient = Pick<BdClient, "board" | "statuses" | "update" | "show">;

export class SessionBoard {
  private current: BoardState = { ...INITIAL_BOARD_STATE };
  private readonly client: BoardClient;
  private serial: Promise<void> = Promise.resolve();
  readonly session: string;

  constructor(client: BoardClient, session: string) {
    if (!session || session.trim() !== session || /\s/.test(session)) {
      throw new Error("an explicit session assignee is required");
    }
    this.client = client;
    this.session = session;
  }

  get state(): BoardState {
    return this.current;
  }

  // A read started before a move must finish before that move begins. Otherwise its old
  // snapshot could land after move-succeeded has cleared the shared core's pending overlay.
  // Keep failures visible to their caller while allowing the next user action to proceed.
  private enqueue(action: () => Promise<void>): Promise<void> {
    const result = this.serial.then(action);
    this.serial = result.catch(() => undefined);
    return result;
  }

  refresh(at: string): Promise<void> {
    return this.enqueue(() => this.read(at));
  }

  private async read(at: string): Promise<void> {
    const issues = await this.client.board();
    if (issues.kind !== "ok") {
      this.current = reduceBoard(this.current, {
        type: "load-failed",
        command: "bd list",
        exitCode: "exitCode" in issues ? issues.exitCode : null,
        message: "Could not refresh session tasks",
      });
      return;
    }
    const statuses = await this.client.statuses();
    if (statuses.kind !== "ok") {
      this.current = reduceBoard(this.current, {
        type: "load-failed",
        command: "bd statuses",
        exitCode: "exitCode" in statuses ? statuses.exitCode : null,
        message: "Could not refresh task statuses",
      });
      return;
    }
    this.current = reduceBoard(this.current, {
      type: "load-succeeded",
      issues: issues.value.filter((issue) => issue.assignee === this.session),
      statuses: statuses.value,
      at,
    });
  }

  move(id: string, to: string): Promise<void> {
    return this.enqueue(() => this.writeMove(id, to));
  }

  private async writeMove(id: string, to: string): Promise<void> {
    const plan = planMove(this.current, id, to);
    if (!plan.ok) throw new Error(plan.error.message);
    const issue = this.current.issues.find((one) => one.id === id);
    if (issue === undefined || issue.assignee !== this.session) {
      throw new Error("the session no longer owns this issue");
    }
    this.current = reduceBoard(this.current, plan.value.event);
    const result = await this.client.update(
      id,
      { status: to },
      {
        ifStatus: issue.status,
        ifAssignee: this.session,
      },
    );
    if (result.kind === "ok") {
      this.current = reduceBoard(this.current, { type: "move-succeeded", id });
      return;
    }
    const exitCode = "exitCode" in result ? (result.exitCode ?? 1) : 1;
    this.current = reduceBoard(this.current, {
      type: "move-failed",
      id,
      exitCode,
      message: "Task update was not applied",
    });
    if (result.kind === "stale") {
      // Re-read once after a refused CAS. Never retry the write against a newer claim.
      const fresh = await this.client.show(id);
      if (fresh.kind === "ok") {
        this.current = reduceBoard(this.current, { type: "issue-refreshed", issue: fresh.value });
        this.current = {
          ...this.current,
          issues: this.current.issues.filter((one) => one.assignee === this.session),
        };
      }
    }
  }
}
