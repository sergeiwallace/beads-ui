import type { LexicalEditor } from "lexical";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { StatusIndicators } from "./StatusIndicators.tsx";
import { describeRefusal, findSecrets } from "./secrets.ts";
import type { Skill } from "./skills.ts";
import type { DispatchStatus, DispatchSummary, SendOptions } from "./types.ts";

// The composer on a task or a Review item (web app design § Composer and dispatch, D-4, D-5,
// T-W1.3). Lexical is the heaviest thing the app loads, so the editor is its own chunk, fetched
// the first time the launcher is focused (D-4's mitigation). The secret guard runs on the exact
// Markdown that would be sent, and a refusal sends nothing. A sent dispatch shows its three
// indicators until it can no longer change. Every prompt asks the receiver to arm a goal unless
// the user clears that for the one dispatch, and a dispatch waiting on a paused goal offers
// "Deliver now" (T-W2.3, D-10).

const Composer = lazy(() => import("./Composer.tsx"));

/** How often an outstanding dispatch's indicators are read again. */
export const STATUS_POLL_MS = 3_000;

export interface PromptComposerProps {
  /**
   * Writes one dispatch with `text` and answers what was written; throws with the server's reason.
   * `options` is passed only when the user cleared arm-goal for this dispatch.
   */
  send(text: string, options?: SendOptions): Promise<DispatchSummary>;
  /** Reads a dispatch's three indicators. */
  status(id: string): Promise<DispatchStatus>;
  /** Releases a dispatch waiting on a paused goal at once; without it no "Deliver now" is drawn. */
  deliverNow?: (id: string) => Promise<unknown>;
  loadSkills?: () => Promise<Skill[]>;
  /** What the region is called, for a screen reader: `Prompt BU-12`. */
  label: string;
  submitLabel?: string;
  pollMs?: number;
}

/** Reads a sent dispatch's indicators, again every `pollMs` until it can no longer change. */
export function useDispatchStatus(
  sent: DispatchSummary | undefined,
  read: (id: string) => Promise<DispatchStatus>,
  pollMs: number = STATUS_POLL_MS,
): { status?: DispatchStatus; error?: string } {
  const [state, setState] = useState<{ id?: string; status?: DispatchStatus; error?: string }>({});
  const id = sent?.id;
  useEffect(() => {
    if (id === undefined) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      read(id).then(
        (status) => {
          if (!live) return;
          setState({ id, status });
          if (!status.final) timer = setTimeout(load, pollMs);
        },
        (error: unknown) => {
          if (!live) return;
          setState((current) => ({ ...current, id, error: (error as Error).message }));
          timer = setTimeout(load, pollMs);
        },
      );
    };
    load();
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [id, read, pollMs]);
  return state.id === id ? state : {};
}

export function PromptComposer({
  send,
  status,
  deliverNow,
  loadSkills,
  label,
  submitLabel,
  pollMs = STATUS_POLL_MS,
}: PromptComposerProps) {
  const [opened, setOpened] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [sent, setSent] = useState<DispatchSummary | undefined>(undefined);
  const [armGoal, setArmGoal] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const shown = useDispatchStatus(sent, status, pollMs);
  const focusEditor = useCallback((editor: LexicalEditor) => editor.focus(), []);

  const submit = async (draft: string) => {
    // Nothing to send; the action stays enabled so it is still a visible target.
    if (!draft.trim()) return;
    const [finding] = findSecrets(draft);
    if (finding !== undefined) {
      setRefusal(describeRefusal(finding));
      return;
    }
    setRefusal(null);
    setSubmitting(true);
    try {
      const written = armGoal ? await send(draft) : await send(draft, { armGoal: false });
      setSent(written);
      // Cleared for one dispatch only: the next prompt arms a goal again.
      setArmGoal(true);
      // The editor holds its own document, so it is remounted to empty it with the draft.
      setComposerKey((value) => value + 1);
    } catch (error) {
      // The draft is the author's text and is kept on any failure.
      setRefusal(`This prompt was not sent: ${(error as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bu-prompt-composer" aria-label={label}>
      {opened ? (
        <Suspense fallback={<p role="status">Loading the composer...</p>}>
          <Composer
            key={composerKey}
            onChange={() => setRefusal(null)}
            onSubmit={(markdown) => void submit(markdown)}
            submitting={submitting}
            refusal={refusal}
            onEditorReady={focusEditor}
            {...(loadSkills === undefined ? {} : { loadSkills })}
            {...(submitLabel === undefined ? {} : { submitLabel })}
          />
        </Suspense>
      ) : (
        <button
          type="button"
          className="bu-button composer-launch"
          onFocus={() => setOpened(true)}
          onClick={() => setOpened(true)}
        >
          Write a prompt
        </button>
      )}
      <label className="bu-composer-option">
        <input
          type="checkbox"
          checked={armGoal}
          onChange={(event) => setArmGoal(event.currentTarget.checked)}
        />{" "}
        Arm a goal if none is active
      </label>
      {sent !== undefined && shown.status === undefined && (
        <p className="bu-dim" role="status">
          Dispatch {sent.id}: {sent.state}
        </p>
      )}
      {sent?.mirrorError !== undefined && (
        <p className="bu-read-error">
          The bd comment mirroring dispatch {sent.id} was not written: {sent.mirrorError}
        </p>
      )}
      {shown.status !== undefined && <StatusIndicators status={shown.status} />}
      {shown.status?.deliverNow === true && deliverNow !== undefined && (
        <button
          type="button"
          className="bu-button"
          onClick={() => {
            const id = shown.status?.id;
            if (id === undefined) return;
            setReleasing(null);
            deliverNow(id).catch((error: unknown) =>
              setReleasing(`Not delivered: ${(error as Error).message}`),
            );
          }}
        >
          Deliver now
        </button>
      )}
      {releasing !== null && <p className="bu-read-error">{releasing}</p>}
      {shown.error !== undefined && (
        <p className="bu-read-error">The dispatch's state could not be read: {shown.error}</p>
      )}
    </section>
  );
}
