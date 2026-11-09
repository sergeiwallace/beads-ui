import {
  buildKeymap,
  DEFAULT_SHORTCUTS,
  heldEntry,
  INITIAL_REVIEW_QUEUE,
  type Issue,
  type Keymap,
  type QueueFilters,
  type ReviewItem,
  type ReviewQueueEntry,
  type ReviewQueueState,
  reduceReviewQueue,
  taskEntry,
} from "@beads-ui/core";
import { render } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";
import type { DispatchStatus, DispatchSummary } from "../../src/composer/types.ts";
import {
  type OptionsRead,
  REVIEW_SHORTCUTS,
  ReviewQueue,
  readOptionsOutput,
} from "../../src/review/ReviewQueue.tsx";
import type { ReviewActions } from "../../src/review/types.ts";

export function issue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    title: `Task ${id}`,
    status: "in_progress",
    priority: 2,
    type: "task",
    labels: [],
    dependencies: [],
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
    ...overrides,
  } as Issue;
}

export function item(name: string, overrides: Partial<ReviewItem> = {}): ReviewItem {
  const relpath = `docs/held/host-c/session-1/2026/11/09/${name}.md`;
  return {
    path: `/stores/held-repo/${relpath}`,
    store: "held-repo",
    relpath,
    kind: "decision",
    status: "open",
    session: "session-1@host-c",
    machine: "host-c",
    task: "none",
    title: `Decide ${name}`,
    ask: `Pick an option for ${name}`,
    createdAt: "2026-11-02T10:00:00Z",
    selection: "current",
    ...overrides,
  };
}

export interface DecisionFixture {
  id: string;
  title: string;
  options: [string, string][];
  recommended: string | null;
}

/** The structured-options command's stdout for these items. */
export function optionsStdout(
  items: { path: string; decisions: DecisionFixture[]; error?: unknown }[],
): string {
  return JSON.stringify({
    version: 1,
    items: items.map((one) => ({
      item: one.path,
      kind: "decision",
      decisions:
        one.error === undefined
          ? one.decisions.map((decision) => ({
              id: decision.id,
              title: decision.title,
              options: decision.options.map(([key, label]) => ({ key, label })),
              recommended: decision.recommended,
              anchor: `decision-${decision.id.toLowerCase()}`,
            }))
          : [],
      error: one.error ?? null,
    })),
  });
}

export const DECISION: DecisionFixture = {
  id: "D-3",
  title: "How an answer is recorded",
  options: [
    ["a", "Name the option and say a control chose it"],
    ["b", "Fill the composer and require Send"],
    ["c", "Both, by a setting"],
  ],
  recommended: "a",
};

export const SENT: DispatchSummary = {
  id: "01JD0000000000000000000001",
  kind: "answer",
  target: { session: "session-1", host: "host-c" },
  state: "queued",
};

export function status(overrides: Partial<DispatchStatus> = {}): DispatchStatus {
  return {
    id: SENT.id,
    kind: SENT.kind,
    target: SENT.target,
    state: "queued",
    final: false,
    liveness: {
      text: "unknown",
      source: "no work queue is configured ([queue] url)",
      tone: "idle",
    },
    delivery: { text: "queued", source: "dispatch record", tone: "idle" },
    response: { text: "none yet", source: "receipts from the target session", tone: "idle" },
    ...overrides,
  };
}

export function actions(overrides: Partial<ReviewActions> = {}) {
  return {
    answer: vi.fn(() => Promise.resolve(SENT)),
    unblock: vi.fn(() =>
      Promise.resolve({ via: "dispatch" as const, dispatch: { ...SENT, kind: "unblock" } }),
    ),
    prompt: vi.fn(() => Promise.resolve({ ...SENT, kind: "prompt" })),
    status: vi.fn(() => new Promise<DispatchStatus>(() => undefined)),
    body: vi.fn((entry: ReviewQueueEntry) => Promise.resolve(`# ${entry.title}\n\nThe body.`)),
    ...overrides,
  };
}

export function keymapOf(): Keymap {
  const built = buildKeymap([...DEFAULT_SHORTCUTS, ...REVIEW_SHORTCUTS]);
  if (!built.ok) throw new Error(built.error.message);
  return built.value;
}

export const heldOf = (one: ReviewItem): ReviewQueueEntry => heldEntry(one);
export const taskOf = (one: Issue, repo = "work-repo"): ReviewQueueEntry =>
  taskEntry({ issue: one, repo });

export function loaded(
  entries: ReviewQueueEntry[],
  failures: ReviewQueueState["failures"] = [],
): ReviewQueueState {
  return reduceReviewQueue(INITIAL_REVIEW_QUEUE, { type: "loaded", entries, failures });
}

/** The Review view with its filters held as the app holds them, and the key map's setting. */
export function renderReview(options: {
  state: ReviewQueueState;
  optionsRead?: OptionsRead;
  stdout?: string;
  actions?: ReviewActions;
  keymap?: Keymap;
  onFilters?: (filters: QueueFilters) => void;
}) {
  const done = options.actions ?? actions();
  const optionsRead: OptionsRead =
    options.optionsRead ??
    (options.stdout === undefined
      ? { state: "ok", output: { version: 1, items: [] } }
      : readOptionsOutput(options.stdout));
  function Page() {
    const [state, setState] = useState(options.state);
    return (
      <ReviewQueue
        state={state}
        onFilters={(filters) => {
          options.onFilters?.(filters);
          setState((current) => ({ ...current, filters }));
        }}
        options={optionsRead}
        actions={done}
        keymap={options.keymap ?? keymapOf()}
        pollMs={20}
      />
    );
  }
  return { ...render(<Page />), actions: done };
}
