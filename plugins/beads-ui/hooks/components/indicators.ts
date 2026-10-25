import type { RenderElement, RenderNode } from "claude-code";

import {
  type GutterCell,
  gutterOf,
  INDICATORS,
  type Indicator,
  type IndicatorRead,
  type Issue,
  legendOf,
  legendText,
  type TaskClientSpan,
} from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";
import { colorOf } from "./look.ts";

// The row indicators both surfaces draw (D-41, D-42, T-2C.3): the switches `[indicators]` and
// Settings set, the sessions the host's registry holds live, the gutter every task row starts
// with, and the legend the help and Settings draw. Like the look, one module holds the state, so
// the band and the pane draw the same gutter from the same redraw.

let switches: Readonly<Record<string, boolean>> = {};
let live: ReadonlySet<string> | undefined;

/** Takes the switches just read and set; true when they differ from those drawn. */
export function setIndicatorSwitches(next: Readonly<Record<string, boolean>>): boolean {
  const changed = JSON.stringify(next) !== JSON.stringify(switches);
  switches = { ...next };
  return changed;
}

/**
 * Takes the sessions the host refresher's snapshot names live (D-26, D-42), with this session's
 * own; undefined when no live snapshot named them, so no agent glyph is dimmed on a guess.
 */
export function setLiveSessions(next: ReadonlySet<string> | undefined): boolean {
  const before = live === undefined ? undefined : [...live].sort().join("\n");
  const after = next === undefined ? undefined : [...next].sort().join("\n");
  live = next === undefined ? undefined : new Set(next);
  return before !== after;
}

/** The indicators drawn now, in registry order: every built one not switched off. */
export const enabledIndicators = (): Indicator[] => INDICATORS.enabled(switches);

/** Whether `id` is on now, as Settings shows it. */
export const indicatorOn = (id: string): boolean => switches[id] !== false;

/** `issue`'s gutter at `columns`, from the read it came from. */
export const gutterFor = (issue: Issue, read: IndicatorRead, columns: number): GutterCell[] =>
  gutterOf({ issue, read, live }, enabledIndicators(), columns);

/**
 * A gutter (D-41): one Text, its blanks as spaces and each glyph a nested Text in its token,
 * dimmed where its indicator says so, and with `trail` the space after it, where the row sets
 * no gap. Undefined when no indicator is enabled.
 */
export function gutter(
  ui: Pick<Surface["ui"], "Text">,
  cells: readonly GutterCell[],
  trail = false,
): RenderElement | undefined {
  if (cells.length === 0) return undefined;
  const { Text } = ui;
  const children: RenderNode[] = [];
  let blanks = "";
  for (const cell of cells) {
    if (cell.id === undefined) {
      blanks += cell.text;
      continue;
    }
    if (blanks !== "") children.push(blanks);
    blanks = "";
    children.push(
      Text({
        ...(cell.token === undefined ? {} : { color: colorOf(cell.token) }),
        ...(cell.dim === true ? { dimColor: true } : {}),
        children: cell.text,
      }),
    );
  }
  if (trail) blanks += " ";
  if (blanks !== "") children.push(blanks);
  return Text({ children: children.length === 1 ? (children[0] as RenderNode) : children });
}

/**
 * The gutter as the Client draws it (T-2B.5): spans of text, each with the colour the hooks
 * resolved, since the Client has no token map.
 */
export const gutterSpans = (cells: readonly GutterCell[]): TaskClientSpan[] =>
  cells.map((cell) => ({
    text: cell.text,
    ...(cell.token === undefined ? {} : { color: colorOf(cell.token) }),
    ...(cell.dim === true ? { dim: true } : {}),
  }));

/** The legend's heading, in the help and in Settings. */
export const LEGEND_TITLE = "Row indicators";

/** The legend (D-41): one line per built indicator, its glyph, ASCII form and meaning. */
export function legendLines(): string[] {
  return legendOf(INDICATORS.built()).map(legendText);
}
