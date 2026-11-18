import type { Issue, Status } from "@beads-ui/core";
import { describe, expect, it, vi } from "vitest";
import { SessionBoard } from "../server/session-board.ts";

const issue: Issue = {
  id: "BU-one",
  title: "Keep the session claim",
  status: "in_progress",
  priority: 1,
  type: "task",
  assignee: "aih-fw-cole",
  labels: [],
  dependencies: [],
  metadata: {},
  createdAt: "2026-11-15T00:00:00Z",
  updatedAt: "2026-11-15T00:00:00Z",
};
const statuses: Status[] = [
  { name: "in_progress", category: "wip", builtin: true },
  { name: "blocked", category: "frozen", builtin: true },
];
function client() {
  return {
    board: vi.fn(async () => ({
      kind: "ok" as const,
      value: [issue, { ...issue, id: "BU-peer", assignee: "peer" }],
    })),
    statuses: vi.fn(async () => ({ kind: "ok" as const, value: statuses })),
    update: vi.fn(async (..._args: unknown[]) => ({
      kind: "stale" as const,
      id: issue.id,
      exitCode: 13 as const,
      stderr: "claim changed",
    })),
    show: vi.fn(async () => ({ kind: "ok" as const, value: { ...issue, assignee: "peer" } })),
  };
}

describe("terminal session board", () => {
  // This boundary owns claim-race orchestration between the shared core and bd-node. Checking
  // only rendered text cannot prove that a stale write was guarded and never retried.
  it("should guard both owner and status and refresh without retry when a claim changes", async () => {
    const bd = client();
    const board = new SessionBoard(bd, "aih-fw-cole");
    await board.refresh("2026-11-15T01:00:00Z");
    expect(board.state.issues.map((one) => one.id)).toEqual(["BU-one"]);
    await board.move(issue.id, "blocked");
    expect(bd.update).toHaveBeenCalledExactlyOnceWith(
      issue.id,
      { status: "blocked" },
      {
        ifStatus: "in_progress",
        ifAssignee: "aih-fw-cole",
      },
    );
    expect(bd.show).toHaveBeenCalledExactlyOnceWith(issue.id);
    expect(board.state.issues).toEqual([]);
    expect(board.state.conflict?.id).toBe(issue.id);
  });

  it("should make no write when a peer issue or unknown status is requested", async () => {
    const bd = client();
    const board = new SessionBoard(bd, "aih-fw-cole");
    await board.refresh("2026-11-15T01:00:00Z");
    await expect(board.move("BU-peer", "blocked")).rejects.toThrow("not on the board");
    await expect(board.move(issue.id, "invented")).rejects.toThrow("not a bd status");
    expect(bd.update).not.toHaveBeenCalled();
  });
});

it("should retain the last good tasks and mark the read failure when refresh fails", async () => {
  const bd = client();
  let failed = false;
  const board = new SessionBoard(
    {
      ...bd,
      board: async () =>
        failed ? { kind: "timeout", command: "bd list", timeoutMs: 10 } : bd.board(),
    },
    "aih-fw-cole",
  );
  await board.refresh("2026-11-15T01:00:00Z");
  failed = true;
  await board.refresh("2026-11-15T02:00:00Z");
  expect(board.state.issues.map((one) => one.id)).toEqual([issue.id]);
  expect(board.state.loadedAt).toBe("2026-11-15T01:00:00Z");
  expect(board.state.loadError?.command).toBe("bd list");
});

it("should confirm the shared optimistic transition when the guarded update succeeds", async () => {
  const bd = client();
  const update = vi.fn(async () => ({ kind: "ok" as const, value: undefined }));
  const board = new SessionBoard({ ...bd, update }, "aih-fw-cole");
  await board.refresh("2026-11-15T01:00:00Z");
  await board.move(issue.id, "blocked");
  expect(board.state.issues[0]?.status).toBe("blocked");
  expect(board.state.pending).toEqual({});
  expect(bd.show).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledTimes(1);
});

// The controller owns this scheduling boundary: a delayed read must not overwrite a
// successful move, regardless of whether the host's refresh timer overlaps user input.
it("should serialize a move after an unfinished refresh and retain the confirmed status", async () => {
  const bd = client();
  const update = vi.fn(async () => ({ kind: "ok" as const, value: undefined }));
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const started = new Promise<void>((done) => {
    entered = done;
  });
  const waiting = new Promise<void>((done) => {
    release = done;
  });
  const board = new SessionBoard({ ...bd, update }, "aih-fw-cole");
  await board.refresh("2026-11-15T01:00:00Z");
  bd.statuses.mockImplementationOnce(async () => {
    entered?.();
    await waiting;
    return { kind: "ok" as const, value: statuses };
  });
  const reading = board.refresh("2026-11-15T02:00:00Z");
  await started;
  const moving = board.move(issue.id, "blocked");
  try {
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();
  } finally {
    release?.();
    await Promise.all([reading, moving]);
  }
  expect(update).toHaveBeenCalledTimes(1);
  expect(board.state.issues[0]?.status).toBe("blocked");
  expect(board.state.pending).toEqual({});
});
