import { useState } from "react";
import type { DispatchSummary } from "../composer/types.ts";

// Drafted session prompts (web app design Phase W4): a prompt a model asked for through the MCP
// server waits here, and nothing is sent until the user confirms it, here or in the MCP App.

export interface PromptDraft {
  id: string;
  repo: string;
  task: string;
  text?: string;
  created_at: string;
}

export interface DraftListProps {
  drafts: readonly PromptDraft[];
  confirm(id: string): Promise<{ dispatch: DispatchSummary }>;
}

function DraftRow({ draft, confirm }: { draft: PromptDraft; confirm: DraftListProps["confirm"] }) {
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState<DispatchSummary | undefined>(undefined);
  const send = async () => {
    setWriting(true);
    setError(undefined);
    try {
      setSent((await confirm(draft.id)).dispatch);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setWriting(false);
    }
  };
  return (
    <li className="bu-draft" data-draft={draft.id}>
      <p>
        Prompt for {draft.task} in {draft.repo}, drafted {draft.created_at}
      </p>
      <pre className="bu-draft-text">{draft.text ?? ""}</pre>
      <button
        type="button"
        className="bu-button"
        disabled={writing || sent !== undefined}
        onClick={() => void send()}
      >
        Confirm and send
      </button>
      {error !== undefined && (
        <p className="bu-read-error" role="alert">
          Not sent: {error}
        </p>
      )}
      {sent !== undefined && (
        <p className="bu-dim" role="status">
          Sent as dispatch {sent.id} to {sent.target.session}@{sent.target.host}: {sent.state}
        </p>
      )}
    </li>
  );
}

export function DraftList({ drafts, confirm }: DraftListProps) {
  if (drafts.length === 0) return null;
  return (
    <section className="bu-drafts" aria-labelledby="bu-drafts-heading">
      <h2 id="bu-drafts-heading">Drafts</h2>
      <p className="bu-dim">
        Prompts a model drafted through the MCP server. Nothing is sent until you confirm it.
      </p>
      <ul>
        {drafts.map((draft) => (
          <DraftRow key={draft.id} draft={draft} confirm={confirm} />
        ))}
      </ul>
    </section>
  );
}
