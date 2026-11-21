import type { DispatchStatus, Indicator } from "./types.ts";

const NAMES = [
  ["liveness", "Session"],
  ["delivery", "Delivery"],
  ["response", "Response"],
] as const;

function One({ id, name, indicator }: { id: string; name: string; indicator: Indicator }) {
  return (
    <span
      className="bu-indicator"
      data-indicator={id}
      data-tone={indicator.tone}
      title={`${name}: ${indicator.text} (from ${indicator.source})`}
    >
      <span className="bu-indicator-name">{name}</span>{" "}
      <span className="bu-indicator-text">{indicator.text}</span>{" "}
      <span className="bu-indicator-source">from {indicator.source}</span>
    </span>
  );
}

export interface StatusIndicatorsProps {
  status: DispatchStatus;
}

export function StatusIndicators({ status }: StatusIndicatorsProps) {
  return (
    <output
      className="bu-indicators"
      aria-live="polite"
      aria-label={`Dispatch ${status.id} to ${status.target.session}@${status.target.host}`}
    >
      {NAMES.map(([key, name]) => (
        <One key={key} id={key} name={name} indicator={status[key]} />
      ))}
    </output>
  );
}
