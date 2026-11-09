/// <reference path="./frappe-gantt.d.ts" />
import type { RoadmapBar, RoadmapLink, RoadmapView } from "@beads-ui/core";
import Gantt, { type GanttTask } from "frappe-gantt";
import { useEffect, useRef } from "react";

export interface RoadmapProps {
  /** Core's Roadmap view (roadmapView): epics and milestones by due date, and their links. */
  view: RoadmapView;
  issueHref(id: string): string;
  onOpen(id: string): void;
}

const LINK_WORDS: Readonly<Record<RoadmapLink["kind"], string>> = {
  blocks: "blocks",
  "parent-child": "is the parent of",
};

// Frappe builds CSS selectors from a task id unescaped (`.highlight-${id}`), so a hierarchical
// issue id such as `BU-a.1` breaks it. Each bar gets its index as Frappe's id instead, and the
// issue id goes on the drawn bar and its lines as data attributes.
const ganttId = (index: number) => `bar-${index}`;

function tasksOf(bars: readonly RoadmapBar[]): GanttTask[] {
  const index = new Map(bars.map((bar, i) => [bar.id, i]));
  return bars.map((bar, i) => ({
    id: ganttId(i),
    name: `${bar.label} ${bar.title}`,
    start: bar.start,
    end: bar.due,
    progress: bar.progress,
    dependencies: bar.dependsOn
      .flatMap((id) => {
        const at = index.get(id);
        return at === undefined ? [] : [ganttId(at)];
      })
      .join(","),
    // Frappe adds this with classList.add, so it must be one class.
    custom_class: `bu-roadmap-${bar.category}`,
  }));
}

/**
 * Frappe Gantt (D-10) over the dated bars, read-only: dates are edited on the issue. Each bar is
 * marked with its issue id, and each line Frappe draws with its two issues and its dependency
 * kind, so parent-child lines draw dashed.
 */
function Chart({ view, onOpen }: { view: RoadmapView; onOpen(id: string): void }) {
  const host = useRef<HTMLDivElement>(null);
  const open = useRef(onOpen);
  open.current = onOpen;
  useEffect(() => {
    const element = host.current;
    if (element === null || view.bars.length === 0) return;
    element.replaceChildren();
    const index = new Map(view.bars.map((bar, i) => [bar.id, i]));
    new Gantt(element, tasksOf(view.bars), {
      view_mode: "Week",
      readonly: true,
      popup_on: "hover",
      today_button: false,
      scroll_to: "start",
      on_click: (task) => {
        const bar = view.bars[Number(task.id.slice("bar-".length))];
        if (bar !== undefined) open.current(bar.id);
      },
    });
    view.bars.forEach((bar, i) => {
      element
        .querySelector(`.bar-wrapper[data-id="${ganttId(i)}"]`)
        ?.setAttribute("data-issue-id", bar.id);
    });
    for (const link of view.links) {
      const from = index.get(link.from);
      const to = index.get(link.to);
      if (from === undefined || to === undefined) continue;
      const selector = `path[data-from="${ganttId(from)}"][data-to="${ganttId(to)}"]`;
      for (const path of element.querySelectorAll(selector)) {
        path.setAttribute("data-kind", link.kind);
        path.setAttribute("data-from-issue", link.from);
        path.setAttribute("data-to-issue", link.to);
      }
    }
    return () => element.replaceChildren();
  }, [view]);
  return <div ref={host} className="bu-roadmap-chart" />;
}

/** The Roadmap (T-3.2): epics and milestones placed by due date, with their dependency lines. */
export function Roadmap(props: RoadmapProps) {
  const { view } = props;
  const byId = new Map(view.bars.map((bar) => [bar.id, bar]));
  const name = (id: string) => byId.get(id)?.label ?? id;
  return (
    <section className="bu-roadmap" aria-labelledby="bu-roadmap-title">
      <h1 id="bu-roadmap-title" className="bu-view-title">
        Roadmap
      </h1>
      <p className="bu-dim" role="status">
        {view.bars.length === 0
          ? view.undated.length === 0
            ? "The store holds no epic or milestone."
            : "No epic or milestone has a due date: set one with its Due field."
          : `${view.bars.length} with a due date, ${view.axis?.start} to ${view.axis?.end}; ${view.links.length} dependency line${view.links.length === 1 ? "" : "s"}.`}
      </p>
      {view.bars.length > 0 && <Chart view={view} onOpen={props.onOpen} />}
      {view.links.length > 0 && (
        <details className="bu-roadmap-links">
          <summary>Dependencies drawn</summary>
          <ul>
            {view.links.map((link) => (
              <li key={`${link.kind} ${link.from} ${link.to}`} data-kind={link.kind}>
                <a href={props.issueHref(link.from)}>{name(link.from)}</a> {LINK_WORDS[link.kind]}{" "}
                <a href={props.issueHref(link.to)}>{name(link.to)}</a>
              </li>
            ))}
          </ul>
        </details>
      )}
      {view.unplacedLinks > 0 && (
        <p className="bu-dim">
          {view.unplacedLinks} dependenc{view.unplacedLinks === 1 ? "y has" : "ies have"} an end
          with no due date and {view.unplacedLinks === 1 ? "is" : "are"} not drawn.
        </p>
      )}
      {view.undated.length > 0 && (
        <>
          <h2 className="bu-view-subtitle">No due date ({view.undated.length})</h2>
          <ul className="bu-roadmap-undated">
            {view.undated.map((item) => (
              <li key={item.id} data-undated-id={item.id}>
                <a href={props.issueHref(item.id)}>
                  <span className="bu-id">{item.label}</span> {item.title}
                </a>{" "}
                <span className="bu-dim">
                  {item.type}, {item.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
