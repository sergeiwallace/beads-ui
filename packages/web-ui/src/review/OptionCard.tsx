import type { OptionCard as Card, OptionChoice } from "@beads-ui/core";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

// One held decision as an option card (web app design D-2, D-3, T-W1.2): each option from the
// structured-options command with its label, the recommended one preselected and marked, and the
// card focused when it is shown. Enter chooses the highlighted option (the recommended one until
// the arrows move it), a number key chooses that option, each with that one key. Inside a text
// field neither does anything, so the key types.

export interface OptionCardProps {
  card: Card;
  /** The option chosen for this decision, while the item's answer waits to be written. */
  chosen?: string | undefined;
  /** Gives the card keyboard focus when it is drawn. */
  autoFocus?: boolean;
  onChoose(option: OptionChoice): void;
}

const isTextField = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "submit", "reset"].includes(type);
};

export function OptionCard({ card, chosen, autoFocus = false, onChoose }: OptionCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const recommended = card.options.findIndex((option) => option.recommended);
  const [highlight, setHighlight] = useState(recommended);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target)) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const count = card.options.length;
      setHighlight((current) => (current < 0 ? 0 : (current + step + count) % count));
      return;
    }
    let option: OptionChoice | undefined;
    if (event.key === "Enter") option = card.options[highlight];
    else if (/^[1-9]$/.test(event.key)) {
      option = card.options.find((one) => one.number === Number(event.key));
    }
    if (option === undefined) return;
    event.preventDefault();
    onChoose(option);
  };

  const titleId = `option-card-${card.anchor}`;
  return (
    <div
      ref={ref}
      className="bu-option-card"
      role="radiogroup"
      aria-labelledby={titleId}
      tabIndex={0}
      data-decision={card.id}
      onKeyDown={onKeyDown}
    >
      <p className="bu-option-card-title" id={titleId}>
        {card.id}: {card.title}
      </p>
      <ul className="bu-option-list">
        {card.options.map((option, index) => (
          <li key={option.key}>
            {/* biome-ignore lint/a11y/useSemanticElements: one button holds the number key, the letter and the label as one target. */}
            <button
              type="button"
              role="radio"
              aria-checked={chosen === undefined ? index === highlight : chosen === option.key}
              className="bu-option"
              data-option={option.key}
              data-recommended={option.recommended ? "true" : undefined}
              tabIndex={-1}
              onClick={() => onChoose(option)}
            >
              {option.number !== undefined && <kbd>{option.number}</kbd>} ({option.key}){" "}
              {option.label}
              {option.recommended && <span className="bu-option-recommended"> recommended</span>}
            </button>
          </li>
        ))}
      </ul>
      {card.recommended === null && (
        <p className="bu-dim">No option is recommended: press its number to choose one.</p>
      )}
    </div>
  );
}
