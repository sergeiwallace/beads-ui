import { type ItemOptions, type OptionCard, optionCardMode } from "@beads-ui/core";
import type { ReactNode } from "react";
import { Markdown } from "./Markdown.tsx";

/** A read the held detail was drawn without, named by its command, store and exit code. */
export interface HeldReadFailure {
  source: string;
  store?: string | undefined;
  exitCode?: number | null | undefined;
  message: string;
}

/** The fields of a held item the detail heads its body with, as the review command lists them. */
export interface HeldItemSummary {
  path: string;
  kind: string;
  title: string;
  status: string;
  session: string;
  task: string;
  createdAt?: string;
}

export interface HeldDetailProps {
  loading: boolean;
  item?: HeldItemSummary | undefined;
  /** The repository of the store the item is in. */
  store?: string | undefined;
  /** The item's whole Markdown body, from the held store's show. */
  body?: string | undefined;
  /** Why the body could not be read: said in its place, never an empty detail. */
  bodyError?: HeldReadFailure | undefined;
  /** Why the item itself could not be read. */
  error?: HeldReadFailure | undefined;
  /** The item's structured options, when the options command printed them (D-2). */
  options?: ItemOptions | undefined;
  /** Why the options could not be read; the body still draws, with no card. */
  optionsError?: HeldReadFailure | undefined;
  /** Draws one decision's option card; the read-only summary when absent. */
  renderCard?: ((card: OptionCard) => ReactNode) | undefined;
}

function Failure({ failure }: { failure: HeldReadFailure }) {
  const where = failure.store === undefined ? "" : ` in ${failure.store}`;
  const code =
    failure.exitCode === undefined || failure.exitCode === null
      ? ""
      : ` (exit ${failure.exitCode})`;
  return (
    <p className="bu-read-error" role="alert">
      <strong>{failure.source}</strong> failed{where}
      {code}: {failure.message}
    </p>
  );
}

function CardSummary({ card }: { card: OptionCard }) {
  return (
    <section className="bu-option-card" aria-label={`${card.id} ${card.title}`}>
      <h2 className="bu-option-card-title">
        <a href={`#${card.anchor}`}>{card.id}</a> {card.title}
      </h2>
      <ol className="bu-option-list">
        {card.options.map((option) => (
          <li key={option.key} data-recommended={option.recommended || undefined}>
            {option.number !== undefined && <kbd>{option.number}</kbd>} ({option.key}){" "}
            {option.label}
            {option.recommended && <span className="bu-recommended"> recommended</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * A held item's detail, for every held kind: its option cards first when its structured options
 * parsed, then its whole Markdown body (web app design T-W1.7).
 */
export function HeldDetail(props: HeldDetailProps) {
  if (props.error !== undefined) {
    return (
      <article className="bu-detail bu-held-detail">
        <Failure failure={props.error} />
      </article>
    );
  }
  const { item } = props;
  if (item === undefined) {
    return <article className="bu-detail bu-held-detail" aria-busy={props.loading} />;
  }
  const cards = optionCardMode(props.options) === "cards" ? (props.options?.cards ?? []) : [];
  const fields: [string, string][] = [
    ["Kind", item.kind],
    ["Status", item.status],
    ["Session", item.session],
    ["Task", item.task],
    ...(props.store === undefined ? [] : ([["Store", props.store]] as [string, string][])),
  ];
  return (
    <article className="bu-detail bu-held-detail" aria-labelledby="bu-held-title">
      <p className="bu-id">{item.path}</p>
      <h1 id="bu-held-title" className="bu-detail-title">
        {item.title}
      </h1>
      <dl className="bu-fields">
        {fields.map(([label, value]) => (
          <div key={label} className="bu-field">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {props.optionsError !== undefined && <Failure failure={props.optionsError} />}
      {props.options?.error !== undefined && (
        <p className="bu-read-error" role="alert">
          <strong>held options</strong>: {props.options.error.field} {props.options.error.problem}
          {", so the decision takes a typed answer"}
        </p>
      )}
      {cards.map((card) => (
        <div key={card.id}>
          {props.renderCard === undefined ? <CardSummary card={card} /> : props.renderCard(card)}
        </div>
      ))}
      <section aria-labelledby="bu-held-body">
        <h2 id="bu-held-body">Body</h2>
        {props.bodyError !== undefined ? (
          <Failure failure={props.bodyError} />
        ) : props.body === undefined ? (
          <p className="bu-dim" aria-busy="true">
            Reading the body
          </p>
        ) : (
          <Markdown text={props.body} className="bu-held-body" />
        )}
      </section>
    </article>
  );
}
