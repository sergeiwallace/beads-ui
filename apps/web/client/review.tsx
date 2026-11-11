import {
  buildKeymap,
  DEFAULT_KEYMAP_SETTINGS,
  DEFAULT_SHORTCUTS,
  encodeQueueFilters,
  heldEntry,
  INITIAL_REVIEW_QUEUE,
  type Keymap,
  type KeymapSettings,
  type QueueFilters,
  type QueueReadFailure,
  type ReviewQueueEntry,
  reduceReviewQueue,
  taskEntry,
  withQueueFilters,
} from "@beads-ui/core";
import {
  HandoffStatus,
  type HandoffView,
  type OptionsRead,
  PromptComposer,
  REVIEW_SHORTCUTS,
  type ReviewActions,
  ReviewQueue,
  readOptionsOutput,
  type SendOptions,
  ShortcutSettings,
} from "@sergeiwallace/beads-ui-web-ui";
import { useCallback, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { ApiFailure, dispatchApi, type ReviewPayload } from "./api.ts";

// The web app's Review view and the composer on a task (web app design § The Review queue,
// § Composer and dispatch): the page reads the server's review payload into core's queue state,
// carries its filters in the URL, and hands the view its writes. The shortcut setting is kept in
// this browser's storage, never a credential.

const KEYMAP_STORAGE = "beads-ui.keymap";
const SHORTCUTS = [...DEFAULT_SHORTCUTS, ...REVIEW_SHORTCUTS];

function storedSettings(): KeymapSettings {
  try {
    const raw = window.localStorage.getItem(KEYMAP_STORAGE);
    if (raw === null) return DEFAULT_KEYMAP_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<KeymapSettings>;
    return {
      singleKey: parsed.singleKey !== false,
      remaps: typeof parsed.remaps === "object" && parsed.remaps !== null ? parsed.remaps : {},
    };
  } catch {
    return DEFAULT_KEYMAP_SETTINGS;
  }
}

function keymapFrom(settings: KeymapSettings): Keymap {
  const built = buildKeymap(SHORTCUTS, settings);
  if (built.ok) return built.value;
  const fallback = buildKeymap(SHORTCUTS);
  if (!fallback.ok) throw new Error(fallback.error.message);
  return fallback.value;
}

const listeners = new Set<() => void>();
let current = keymapFrom(storedSettings());

/** The key map every view reads, from the setting this browser stores (D-12, T-W1.4). */
export const keymapSetting = {
  get: () => current,
  set(next: Keymap) {
    current = next;
    window.localStorage.setItem(KEYMAP_STORAGE, JSON.stringify(next.settings));
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useKeymap = (): Keymap =>
  useSyncExternalStore(keymapSetting.subscribe, keymapSetting.get, keymapSetting.get);

/** The palette's command for the setting, which D-12 places there. */
export function shortcutCommand(keymap: Keymap) {
  const on = keymap.settings.singleKey;
  return {
    id: "shortcuts:single-key",
    label: on ? "Turn single-key shortcuts off" : "Turn single-key shortcuts on",
    detail: "Ctrl and Cmd shortcuts keep working either way",
    run: () => {
      keymapSetting.set({ ...keymap, settings: { ...keymap.settings, singleKey: !on } });
    },
  };
}

const failureOf = (error: unknown, source: string): Error & { source: string } => {
  const failure = error instanceof ApiFailure ? error : undefined;
  return Object.assign(new Error(failure?.message ?? String(error)), {
    source: failure?.error.source ?? source,
  });
};

function entriesOf(payload: ReviewPayload): {
  entries: ReviewQueueEntry[];
  failures: QueueReadFailure[];
} {
  const goals = new Set(payload.goals);
  const entries: ReviewQueueEntry[] = [];
  const failures: QueueReadFailure[] = [...payload.failures];
  if (payload.held.state === "ok") {
    for (const row of payload.held.rows) entries.push(heldEntry(row.item, row.joined, goals));
  } else if (payload.held.state === "failed") failures.unshift(payload.held.failure);
  for (const task of payload.tasks) entries.push(taskEntry(task, goals));
  return { entries, failures };
}

function optionsOf(payload: ReviewPayload | undefined): OptionsRead {
  if (payload === undefined || payload.options.state === "unset") return { state: "loading" };
  if (payload.options.state === "failed") {
    const { source, exitCode, detail } = payload.options.failure;
    const code = exitCode === null ? "no exit code" : `exit ${exitCode}`;
    return {
      state: "failed",
      problem: `${source} could not be read (${code})${detail ? `: ${detail}` : ""}`,
    };
  }
  return readOptionsOutput(payload.options.stdout);
}

export const reviewActions: ReviewActions = {
  answer: (entry, input) =>
    dispatchApi.answer({ item: entry.item?.path ?? "", ...input }).then((reply) => reply.dispatch),
  prompt: (entry, text, options) =>
    (entry.source === "held"
      ? dispatchApi.prompt({ item: entry.item?.path ?? "", text, ...options })
      : dispatchApi.prompt({ repo: entry.repo ?? "", task: entry.task ?? "", text, ...options })
    ).then((reply) => reply.dispatch),
  deliverNow: (id) => dispatchApi.deliverNow(id),
  unblock: (entry, resolution, followUp) =>
    dispatchApi.unblock({
      repo: entry.repo ?? "",
      task: entry.task ?? "",
      resolution,
      ...(followUp.trim() === "" ? {} : { followUp }),
    }),
  status: (id) => dispatchApi.status(id),
  body: (entry) =>
    dispatchApi.heldBody(entry.item?.path ?? "").then(
      (reply) => reply.body,
      (error: unknown) => {
        throw failureOf(error, "held show");
      },
    ),
  loadSkills: () => dispatchApi.skills().then((reply) => reply.skills),
};

/** The Review view's page: the read, the URL's filters and the shortcut setting. */
export function ReviewPage() {
  const keymap = useKeymap();
  const [state, send] = useReducer(reduceReviewQueue, INITIAL_REVIEW_QUEUE, (initial) =>
    reduceReviewQueue(initial, { type: "open-url", query: window.location.search }),
  );
  const [payload, setPayload] = useState<ReviewPayload | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [reading, setReading] = useState(false);

  const load = useCallback(() => {
    setReading(true);
    dispatchApi.review().then(
      (read) => {
        setPayload(read);
        setError(undefined);
        const { entries, failures } = entriesOf(read);
        send({ type: "loaded", entries, failures });
        setReading(false);
      },
      (failure: unknown) => {
        setError(failureOf(failure, "the beads-ui server").message);
        setReading(false);
      },
    );
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    const onPop = () => send({ type: "open-url", query: window.location.search });
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("popstate", onPop);
    };
  }, [load]);

  const onFilters = useCallback((filters: QueueFilters) => {
    const query = withQueueFilters(window.location.search, filters);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query === "" ? "" : `?${query}`}`,
    );
    send({ type: "open-url", query: encodeQueueFilters(filters) });
  }, []);

  const options = useMemo(() => optionsOf(payload), [payload]);
  return (
    <div className="app-review">
      <div className="app-review-bar">
        <button type="button" className="bu-button" disabled={reading} onClick={load}>
          {reading ? "Reading..." : "Read again"}
        </button>
        {payload !== undefined && <span className="bu-dim">as of {payload.asOf}</span>}
        <details className="app-review-shortcuts">
          <summary>Keyboard shortcuts</summary>
          <ShortcutSettings keymap={keymap} onChange={keymapSetting.set} />
        </details>
      </div>
      {error !== undefined && (
        <p className="bu-read-error" role="alert">
          The review queue could not be read: {error}
        </p>
      )}
      {(payload?.problems ?? []).map((problem) => (
        <p key={problem} className="app-problem">
          beads-ui.toml: {problem}
        </p>
      ))}
      {payload === undefined && error === undefined ? (
        <p className="bu-dim" aria-busy="true">
          Reading the review queue...
        </p>
      ) : (
        <ReviewQueue
          state={state}
          onFilters={onFilters}
          options={options}
          {...(payload?.held.state === "unset" ? { heldUnset: payload.held.message } : {})}
          actions={reviewActions}
          keymap={keymap}
        />
      )}
    </div>
  );
}

/** An owner change's handoff on a task's detail (T-W2.2), when one was started on this host. */
export function TaskHandoff({ id, repository }: { id: string; repository: string }) {
  const read = useCallback(
    () =>
      dispatchApi.handoff(repository, id).then(
        (view): HandoffView | undefined => view,
        (error: unknown) => {
          if (error instanceof ApiFailure && error.status === 404) return undefined;
          throw error;
        },
      ),
    [id, repository],
  );
  return <HandoffStatus read={read} />;
}

/** The composer on a task's detail: a prompt to the task's owning session. */
export function TaskComposer({ id, repository }: { id: string; repository: string }) {
  const send = useCallback(
    (text: string, options?: SendOptions) =>
      dispatchApi
        .prompt({ repo: repository, task: id, text, ...options })
        .then((reply) => reply.dispatch),
    [id, repository],
  );
  return (
    <PromptComposer
      label={`Prompt ${id}`}
      send={send}
      status={reviewActions.status}
      deliverNow={dispatchApi.deliverNow}
      {...(reviewActions.loadSkills === undefined ? {} : { loadSkills: reviewActions.loadSkills })}
    />
  );
}
