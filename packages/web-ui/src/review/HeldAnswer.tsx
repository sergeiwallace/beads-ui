import { type ItemOptions, type OptionChoice, optionCardMode } from "@beads-ui/core";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useDispatchStatus } from "../composer/PromptComposer.tsx";
import { StatusIndicators } from "../composer/StatusIndicators.tsx";
import { describeRefusal, findSecrets } from "../composer/secrets.ts";
import type { DispatchStatus, DispatchSummary } from "../composer/types.ts";
import { Markdown } from "../detail/Markdown.tsx";
import { OptionCard } from "./OptionCard.tsx";
import type { AnswerInput, BodyRead } from "./types.ts";

// A held item's answer (web app design D-2, D-3, T-W1.2). With option cards, one key chooses an
// option; once every decision on the item has one, a five-second undo window starts, and Escape
// or Undo inside it cancels and writes nothing. When the window closes the answer is written as a
// dispatch of kind answer to the session holding the item. Without cards (the options command is
// unavailable, printed none, or reported an error) the item's Markdown body is shown and only a
// typed answer is taken. The body is drawn below the card either way.

/** How long a one-key answer can be taken back before it is written. */
export const UNDO_MS = 5_000;

export interface HeldAnswerProps {
  /** The item's options as the command printed them; undefined when it printed none for it. */
  options: ItemOptions | undefined;
  /** Why no options could be read at all: the command failed, or its output did not parse. */
  optionsProblem?: string;
  body: BodyRead;
  answer(input: AnswerInput): Promise<DispatchSummary>;
  status(id: string): Promise<DispatchStatus>;
  pollMs?: number;
  /** Focuses the first card when the item is shown. */
  autoFocus?: boolean;
}

interface Pending {
  choices: { decision: string; key: string; label: string }[];
}

function fallbackLine(options: ItemOptions | undefined, problem: string | undefined): string {
  if (problem !== undefined) return `No option cards: ${problem}. Type an answer below.`;
  if (options?.error !== undefined) {
    return `No option cards: ${options.error.field} ${options.error.problem}. Type an answer below.`;
  }
  return "No option cards: the options command printed no options for this item. Type an answer below.";
}

function Body({ body }: { body: BodyRead }) {
  if (body.state === "loading") {
    return (
      <p className="bu-dim" aria-busy="true">
        Reading the item...
      </p>
    );
  }
  if (body.state === "error") {
    return (
      <p className="bu-read-error" role="alert">
        <strong>{body.source}</strong> failed: {body.message}
      </p>
    );
  }
  // The same sanitizing renderer as the held item's detail (T-W1.2, T-W1.7): headings, safe links
  // and an option card's `#` anchor work, and raw HTML never reaches the page.
  return (
    <div data-testid="held-body">
      <Markdown text={body.text} className="bu-held-body" />
    </div>
  );
}

export function HeldAnswer({
  options,
  optionsProblem,
  body,
  answer,
  status,
  pollMs,
  autoFocus = true,
}: HeldAnswerProps) {
  const mode = optionsProblem === undefined ? optionCardMode(options) : "markdown";
  const cards = mode === "cards" ? (options?.cards ?? []) : [];
  const [chosen, setChosen] = useState<Record<string, OptionChoice>>({});
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const [sent, setSent] = useState<DispatchSummary | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [typed, setTyped] = useState("");
  const [writing, setWriting] = useState(false);
  const shown = useDispatchStatus(sent, status, pollMs);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(answer);
  latest.current = answer;

  const write = async (input: AnswerInput) => {
    setWriting(true);
    setError(undefined);
    try {
      setSent(await latest.current(input));
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setWriting(false);
    }
  };

  const cancel = useCallback(() => {
    if (timer.current !== undefined) clearTimeout(timer.current);
    timer.current = undefined;
    setPending(undefined);
    setChosen({});
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (pending === undefined) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, cancel]);

  const choose = (decision: string, option: OptionChoice) => {
    if (pending !== undefined || sent !== undefined || writing) return;
    const next = { ...chosen, [decision]: option };
    setChosen(next);
    if (!cards.every((card) => next[card.id] !== undefined)) return;
    const choices = cards.map((card) => {
      const one = next[card.id] as OptionChoice;
      return { decision: card.id, key: one.key, label: one.label };
    });
    setPending({ choices });
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setPending(undefined);
      void write({ choices: choices.map(({ decision: id, key }) => ({ decision: id, key })) });
    }, UNDO_MS);
  };

  const sendTyped = () => {
    if (!typed.trim()) return;
    const [finding] = findSecrets(typed);
    if (finding !== undefined) {
      setError(describeRefusal(finding));
      return;
    }
    void write({ text: typed });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && pending !== undefined) {
      event.preventDefault();
      cancel();
    }
  };

  const nextCard = cards.find((card) => chosen[card.id] === undefined);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape inside the answer cancels its undo window.
    <div className="bu-held-answer" onKeyDown={onKeyDown}>
      {mode === "cards" ? (
        cards.map((card) => (
          <OptionCard
            key={card.id}
            card={card}
            chosen={chosen[card.id]?.key}
            autoFocus={autoFocus && card === nextCard}
            onChoose={(option) => choose(card.id, option)}
          />
        ))
      ) : (
        <div className="bu-typed-answer">
          <p className="bu-dim">{fallbackLine(options, optionsProblem)}</p>
          <label className="bu-field">
            <span>Your answer</span>
            <textarea
              className="bu-textarea"
              value={typed}
              rows={4}
              onChange={(event) => {
                setTyped(event.target.value);
                setError(undefined);
              }}
            />
          </label>
          <button
            type="button"
            className="bu-button"
            disabled={writing || sent !== undefined}
            onClick={sendTyped}
          >
            Send answer
          </button>
        </div>
      )}
      {pending !== undefined && (
        <div className="bu-undo" role="status">
          <span>
            Answering{" "}
            {pending.choices
              .map((choice) => `${choice.decision} (${choice.key}) ${choice.label}`)
              .join("; ")}{" "}
            in {UNDO_MS / 1000} seconds.
          </span>{" "}
          <button type="button" className="bu-button" onClick={cancel}>
            Undo <kbd>Esc</kbd>
          </button>
        </div>
      )}
      {sent !== undefined && shown.status === undefined && (
        <p className="bu-dim" role="status">
          Answer dispatch {sent.id}: {sent.state}
        </p>
      )}
      {shown.status !== undefined && <StatusIndicators status={shown.status} />}
      {error !== undefined && (
        <p className="bu-read-error" role="alert">
          The answer was not sent: {error}
        </p>
      )}
      <Body body={body} />
    </div>
  );
}
