import {
  commandForPress,
  type DecisionOptionsOutput,
  type Keymap,
  optionCardMode,
  optionsForItem,
  parseDecisionOptions,
  QUEUE_FILTER_KEYS,
  type QueueFilterKey,
  type QueueFilters,
  type ReviewAction,
  type ReviewQueueEntry,
  type ReviewQueueState,
  reviewQueueView,
} from "@beads-ui/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PromptComposer } from "../composer/PromptComposer.tsx";
import { BulkApprove, type BulkItem } from "./BulkApprove.tsx";
import { HeldAnswer } from "./HeldAnswer.tsx";
import type { BodyRead, ReviewActions } from "./types.ts";
import { UnblockForm } from "./UnblockForm.tsx";
import "./review.css";

// The Review queue (web app design § The Review queue, D-1, T-W1.1, T-W1.2, T-W1.6): a split list
// and detail, keyboard first. The list groups every item needing an answer, an unblock or a prompt
// in core's order (priority, impact, age, id); the detail answers a held decision by its option
// card, unblocks a task, or sends a prompt through the composer. Below 600 px it collapses to one
// item at a time with the list a key away. Selection mode approves every recommendation in the
// selected items behind a confirm that lists them.

/** The Review view's own commands, beside core's defaults, for the key map. */
export const REVIEW_SHORTCUTS = [
  { command: "review.list", label: "Back to the list", key: "u" },
  { command: "review.select", label: "Select for approve recommendations", key: "x" },
] as const;

const SECTION_LABELS: Readonly<Record<ReviewAction, string>> = {
  answer: "Answer",
  unblock: "Unblock",
  prompt: "Prompt",
};

const FILTER_LABELS: Readonly<Record<QueueFilterKey, string>> = {
  epic: "Epic",
  goal: "Goal",
  type: "Type",
  size: "Size",
  owner: "Owner",
  repo: "Repository",
};

/** The options command's output as the view reads it. */
export type OptionsRead =
  | { state: "loading" }
  | { state: "ok"; output: DecisionOptionsOutput }
  | { state: "failed"; problem: string };

/**
 * The options command's stdout as the view reads it: output the decision-options model refuses as
 * a whole names the field at fault, and every item then falls back to its Markdown body.
 */
export function readOptionsOutput(stdout: string): OptionsRead {
  const parsed = parseDecisionOptions(stdout);
  return parsed.ok
    ? { state: "ok", output: parsed.value }
    : {
        state: "failed",
        problem: `the options command's ${parsed.error.field}: ${parsed.error.problem}`,
      };
}

export interface ReviewQueueProps {
  state: ReviewQueueState;
  /** The filters chosen; the app writes them into the URL. */
  onFilters(filters: QueueFilters): void;
  options: OptionsRead;
  /** Why held items are not read at all (no `[review] command`), when they are not. */
  heldUnset?: string;
  actions: ReviewActions;
  keymap: Keymap;
  issueHref?: (entry: ReviewQueueEntry) => string | undefined;
  pollMs?: number;
}

function valuesFor(entries: readonly ReviewQueueEntry[], key: QueueFilterKey): string[] {
  const found = new Set<string>();
  for (const entry of entries) {
    if (key === "goal") for (const goal of entry.goals) found.add(goal);
    else {
      const value = key === "size" ? entry.size : entry[key];
      if (value !== undefined) found.add(String(value));
    }
  }
  return [...found].sort();
}

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** The decisions an entry carries as cards, when every one has a recommendation to approve. */
function approvable(entry: ReviewQueueEntry, options: OptionsRead) {
  if (options.state !== "ok" || entry.item === undefined) return undefined;
  const item = optionsForItem(options.output, entry.item.path);
  if (optionCardMode(item) !== "cards" || item === undefined) return undefined;
  return item.cards.every((card) => card.recommended !== null) ? item.cards : undefined;
}

function Filters({
  state,
  onFilters,
}: {
  state: ReviewQueueState;
  onFilters: ReviewQueueProps["onFilters"];
}) {
  const active = QUEUE_FILTER_KEYS.some((key) => (state.filters[key] ?? []).length > 0);
  return (
    <fieldset className="bu-review-filters">
      <legend className="bu-dim">Filters</legend>
      {QUEUE_FILTER_KEYS.map((key) => {
        const values = valuesFor(state.entries, key);
        const chosen = state.filters[key] ?? [];
        for (const value of chosen) if (!values.includes(value)) values.push(value);
        return (
          <label key={key} className="bu-review-filter">
            <span>{FILTER_LABELS[key]}</span>
            <select
              className="bu-select"
              value={chosen[0] ?? ""}
              onChange={(event) =>
                onFilters({
                  ...state.filters,
                  [key]: event.target.value === "" ? [] : [event.target.value],
                })
              }
            >
              <option value="">any</option>
              {values.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {active && (
        <button type="button" className="bu-button" onClick={() => onFilters({})}>
          Clear filters
        </button>
      )}
    </fieldset>
  );
}

function useBody(
  entry: ReviewQueueEntry | undefined,
  read: ReviewActions["body"],
): BodyRead | undefined {
  const [state, setState] = useState<{ key: string; body: BodyRead } | undefined>(undefined);
  const key = entry?.source === "held" ? entry.key : undefined;
  // The entry object changes on every re-read; its key names the item, so only the key re-reads.
  const latest = useRef(entry);
  latest.current = entry;
  useEffect(() => {
    const shown = latest.current;
    if (key === undefined || shown === undefined) return;
    let live = true;
    setState({ key, body: { state: "loading" } });
    read(shown).then(
      (text) => live && setState({ key, body: { state: "ok", text } }),
      (error: unknown) => {
        if (!live) return;
        const failure = error as Error & { source?: string };
        setState({
          key,
          body: {
            state: "error",
            source: failure.source ?? "held show",
            message: failure.message,
          },
        });
      },
    );
    return () => {
      live = false;
    };
  }, [key, read]);
  return state?.key === key ? state?.body : undefined;
}

interface BulkResult {
  key: string;
  title: string;
  text: string;
  ok: boolean;
}

export function ReviewQueue({
  state,
  onFilters,
  options,
  heldUnset,
  actions,
  keymap,
  issueHref,
  pollMs,
}: ReviewQueueProps) {
  const view = useMemo(() => reviewQueueView(state), [state]);
  const ordered = useMemo(() => view.sections.flatMap((section) => section.entries), [view]);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  // Below 600 px one item shows at a time, the first in order until another is chosen (D-1).
  const [showing, setShowing] = useState<"list" | "detail">("detail");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const selected = ordered.find((entry) => entry.key === selectedKey) ?? ordered[0];
  const body = useBody(selected, actions.body);

  const select = useCallback((entry: ReviewQueueEntry | undefined) => {
    if (entry === undefined) return;
    setSelectedKey(entry.key);
    setShowing("detail");
  }, []);

  const togglePick = useCallback(
    (entry: ReviewQueueEntry) => {
      if (approvable(entry, options) === undefined) return;
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(entry.key)) next.delete(entry.key);
        else next.add(entry.key);
        return next;
      });
    },
    [options],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = commandForPress(keymap, event, { inTextField: isTextField(event.target) });
      if (command === undefined) return;
      const at = ordered.findIndex((entry) => entry.key === selected?.key);
      if (command === "review.next") select(ordered[Math.min(ordered.length - 1, at + 1)]);
      else if (command === "review.previous") select(ordered[Math.max(0, at - 1)]);
      else if (command === "review.list") setShowing("list");
      else if (command === "review.select" && selected !== undefined) togglePick(selected);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keymap, ordered, selected, select, togglePick]);

  const bulkItems: BulkItem[] = ordered.flatMap((entry) => {
    if (!picked.has(entry.key)) return [];
    const cards = approvable(entry, options);
    return cards === undefined ? [] : [{ key: entry.key, title: entry.title, cards }];
  });

  const approveAll = async () => {
    setConfirming(false);
    const results: BulkResult[] = [];
    for (const item of bulkItems) {
      const entry = ordered.find((one) => one.key === item.key);
      if (entry === undefined) continue;
      const choices = item.cards.map((card) => ({
        decision: card.id,
        key: card.recommended ?? "",
      }));
      try {
        const sent = await actions.answer(entry, { choices });
        results.push({
          key: item.key,
          title: item.title,
          ok: true,
          text: `answer dispatch ${sent.id}: ${sent.state}`,
        });
      } catch (error) {
        results.push({
          key: item.key,
          title: item.title,
          ok: false,
          text: `not sent: ${(error as Error).message}`,
        });
      }
      setBulkResults([...results]);
    }
    setPicked(new Set());
  };

  const optionsProblem = options.state === "failed" ? options.problem : undefined;
  const heldOptions =
    options.state === "ok" && selected?.item !== undefined
      ? optionsForItem(options.output, selected.item.path)
      : undefined;
  const href = selected === undefined ? undefined : issueHref?.(selected);

  return (
    <div className="bu-review" data-showing={showing}>
      <div className="bu-review-list">
        <Filters state={state} onFilters={onFilters} />
        {heldUnset !== undefined && <p className="bu-dim">{heldUnset}</p>}
        {view.failureLines.map((line) => (
          <p key={line} className="bu-read-error" role="alert">
            {line}
          </p>
        ))}
        <div className="bu-review-bulk">
          <button
            type="button"
            className="bu-button"
            disabled={bulkItems.length === 0}
            onClick={() => setConfirming(true)}
          >
            Approve recommendations ({bulkItems.length})
          </button>
        </div>
        {bulkResults.length > 0 && (
          <ul className="bu-bulk-results" aria-label="Approve recommendations results">
            {bulkResults.map((result) => (
              <li key={result.key} data-ok={result.ok ? "true" : "false"}>
                {result.title}: {result.text}
              </li>
            ))}
          </ul>
        )}
        {view.emptyText !== undefined && (
          <p className="bu-dim" role="status">
            {view.emptyText}
          </p>
        )}
        {view.sections.map((section) => (
          <section
            key={section.action}
            className="bu-review-section"
            aria-label={SECTION_LABELS[section.action]}
          >
            <h2 className="bu-review-heading">
              {SECTION_LABELS[section.action]} ({section.entries.length})
            </h2>
            <ul className="bu-review-rows">
              {section.entries.map((entry) => {
                const canPick = approvable(entry, options) !== undefined;
                return (
                  <li
                    key={entry.key}
                    className="bu-review-row"
                    aria-current={entry.key === selected?.key ? "true" : undefined}
                  >
                    {section.action === "answer" && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${entry.title} for approve recommendations`}
                        disabled={!canPick}
                        checked={picked.has(entry.key)}
                        onChange={() => togglePick(entry)}
                      />
                    )}
                    <button
                      type="button"
                      className="bu-review-open"
                      data-entry={entry.key}
                      onClick={() => select(entry)}
                    >
                      <span className="bu-review-priority">
                        {entry.priority === undefined ? "P-" : `P${entry.priority}`}
                      </span>{" "}
                      <span className="bu-review-kind">{entry.kind}</span>{" "}
                      <span className="bu-review-title">{entry.title}</span>{" "}
                      <span className="bu-dim">{entry.id}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <section className="bu-review-detail" aria-label="Review item">
        <button
          type="button"
          className="bu-button bu-review-back"
          onClick={() => setShowing("list")}
        >
          Back to the list <kbd>u</kbd>
        </button>
        {selected === undefined ? (
          <p className="bu-dim">Nothing selected.</p>
        ) : (
          <article key={selected.key} data-entry={selected.key}>
            <h2 className="bu-review-item-title">{selected.title}</h2>
            <p className="bu-dim">
              {selected.kind}
              {selected.owner === undefined ? "" : `, held by ${selected.owner}`}
              {selected.repo === undefined ? "" : `, ${selected.repo}`}
              {selected.task === undefined ? "" : `, task ${selected.task}`}
              {href === undefined ? null : (
                <>
                  {" "}
                  <a href={href}>Open the task</a>
                </>
              )}
            </p>
            {selected.item !== undefined && selected.item.ask !== "" && (
              <p className="bu-review-ask">{selected.item.ask}</p>
            )}
            {selected.action === "answer" && (
              <HeldAnswer
                options={heldOptions}
                {...(optionsProblem === undefined ? {} : { optionsProblem })}
                body={body ?? { state: "loading" }}
                answer={(input) => actions.answer(selected, input)}
                status={actions.status}
                {...(pollMs === undefined ? {} : { pollMs })}
              />
            )}
            {selected.action === "unblock" && (
              <UnblockForm
                unblock={(resolution, followUp) => actions.unblock(selected, resolution, followUp)}
                status={actions.status}
                {...(pollMs === undefined ? {} : { pollMs })}
              />
            )}
            <PromptComposer
              label={`Prompt ${selected.id}`}
              send={(text, options) => actions.prompt(selected, text, options)}
              status={actions.status}
              {...(actions.deliverNow === undefined ? {} : { deliverNow: actions.deliverNow })}
              {...(actions.loadSkills === undefined ? {} : { loadSkills: actions.loadSkills })}
              {...(pollMs === undefined ? {} : { pollMs })}
            />
          </article>
        )}
      </section>
      <BulkApprove
        open={confirming}
        items={bulkItems}
        onOpenChange={setConfirming}
        onConfirm={() => void approveAll()}
      />
    </div>
  );
}
