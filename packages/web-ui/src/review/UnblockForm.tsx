import { useState } from "react";
import { useDispatchStatus } from "../composer/PromptComposer.tsx";
import { StatusIndicators } from "../composer/StatusIndicators.tsx";
import { describeRefusal, findSecrets } from "../composer/secrets.ts";
import type { DispatchStatus, DispatchSummary } from "../composer/types.ts";
import type { UnblockResult } from "./types.ts";

// Unblocking a task from the Review queue (web app design T-W1.6): the resolution goes to the
// task's owning session as a dispatch of kind unblock, and an optional next-step prompt follows it
// to the same session once the unblock is acted on. With no owning session the server unblocks
// the task itself. Either way the item stays in the queue until a re-read shows it unblocked.

export interface UnblockFormProps {
  unblock(resolution: string, followUp: string): Promise<UnblockResult>;
  status(id: string): Promise<DispatchStatus>;
  pollMs?: number;
}

export function UnblockForm({ unblock, status, pollMs }: UnblockFormProps) {
  const [resolution, setResolution] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState<DispatchSummary | undefined>(undefined);
  const shown = useDispatchStatus(sent, status, pollMs);

  const submit = async () => {
    if (!resolution.trim()) {
      setError("write the resolution the session should act on");
      return;
    }
    const [finding] = findSecrets(`${resolution}\n${followUp}`);
    if (finding !== undefined) {
      setError(describeRefusal(finding));
      return;
    }
    setWriting(true);
    setError(undefined);
    try {
      const result = await unblock(resolution, followUp);
      if (result.via === "dispatch") setSent(result.dispatch);
      else setDone(result.message);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setWriting(false);
    }
  };

  const followUpState = shown.status?.followUp;
  return (
    <div className="bu-unblock">
      <label className="bu-field">
        <span>Resolution</span>
        <textarea
          className="bu-textarea"
          rows={3}
          value={resolution}
          onChange={(event) => setResolution(event.target.value)}
        />
      </label>
      <label className="bu-field">
        <span>Next-step prompt (optional), sent once the unblock is acted on</span>
        <textarea
          className="bu-textarea"
          rows={3}
          value={followUp}
          onChange={(event) => setFollowUp(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="bu-button"
        disabled={writing || sent !== undefined || done !== undefined}
        onClick={() => void submit()}
      >
        Unblock
      </button>
      {error !== undefined && (
        <p className="bu-read-error" role="alert">
          Not unblocked: {error}
        </p>
      )}
      {done !== undefined && (
        <p className="bu-dim" role="status">
          {done}
        </p>
      )}
      {sent !== undefined && shown.status === undefined && (
        <p className="bu-dim" role="status">
          Unblock dispatch {sent.id}: {sent.state}
        </p>
      )}
      {shown.status !== undefined && <StatusIndicators status={shown.status} />}
      {followUpState !== undefined && (
        <p className="bu-dim" data-follow-up={followUpState.state}>
          Next-step prompt:{" "}
          {followUpState.state === "pending"
            ? "waits for the unblock to be acted on"
            : followUpState.state === "sent"
              ? `sent as dispatch ${followUpState.prompt ?? ""}`
              : `not sent: ${followUpState.reason ?? "the unblock did not succeed"}`}
        </p>
      )}
    </div>
  );
}
