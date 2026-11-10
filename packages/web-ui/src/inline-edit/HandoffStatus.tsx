import { useEffect, useState } from "react";

// An owner change's handoff on a task's detail (web app design T-W2.2, D-9): where the handoff
// stands and the record that says so (the published store, the holder's or git-inbox's receipt).
// It is read again until the handoff can no longer change; a task with no handoff draws nothing.

/** What the server's handoff route answers (apps/web/server/owner-handoff.ts). */
export interface HandoffView {
  state: string;
  source: string;
  final: boolean;
  /** What this server reads in the store, which is not proof that anything was published. */
  observation?: string;
  holder: { session: string; host: string };
  receiver: { session: string; host: string };
}

export const HANDOFF_POLL_MS = 3_000;

export interface HandoffStatusProps {
  /** The task's handoff, or undefined when none was started here. */
  read(): Promise<HandoffView | undefined>;
  pollMs?: number;
}

export function HandoffStatus({ read, pollMs = HANDOFF_POLL_MS }: HandoffStatusProps) {
  const [view, setView] = useState<HandoffView | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      read().then(
        (next) => {
          if (!live) return;
          setView(next);
          setError(undefined);
          if (next !== undefined && !next.final) timer = setTimeout(load, pollMs);
        },
        (failure: unknown) => {
          if (!live) return;
          setError((failure as Error).message);
          timer = setTimeout(load, pollMs);
        },
      );
    };
    load();
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [read, pollMs]);
  if (error !== undefined) {
    return <p className="bu-read-error">The handoff's state could not be read: {error}</p>;
  }
  if (view === undefined) return null;
  return (
    <output className="bu-handoff" aria-live="polite" aria-label="Owner handoff">
      <span className="bu-indicator-name">Handoff</span>{" "}
      <span className="bu-indicator-text">{view.state}</span>{" "}
      <span className="bu-indicator-source">
        from {view.source}; {view.holder.session}@{view.holder.host} to {view.receiver.session}@
        {view.receiver.host}
      </span>
      {view.observation !== undefined && (
        <span className="bu-dim bu-handoff-observation"> ({view.observation})</span>
      )}
    </output>
  );
}
