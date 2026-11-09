// The Roadmap view (T-3.2): the store's epics and milestones placed by due date, each a bar from
// its start to its due date, and the blocks and parent-child dependencies between them as lines.
// Pure: the web app draws it with Frappe Gantt (D-10); the placement is the Timeline's (T-2B.9).

import type { Issue, Status, StatusCategory } from "./model.ts";
import { milestoneSprintOf, sprintLabelsOf, startsAtOf } from "./sprint-view.ts";
import { statusToken, type Token } from "./tokens.ts";
import {
  dayOf,
  isTimelineIssue,
  statusCategory,
  type TimelineAxis,
  timelineView,
} from "./views/timeline.ts";

/** The dependency types the Roadmap draws as lines, as bd names them. */
export type RoadmapLinkKind = "blocks" | "parent-child";
export const ROADMAP_LINK_KINDS: readonly RoadmapLinkKind[] = ["blocks", "parent-child"];

export interface RoadmapItem {
  id: string;
  /** The display id, or the hash id when the issue has none. */
  label: string;
  title: string;
  type: string;
  status: string;
  category: StatusCategory;
  token: Token;
}

export interface RoadmapBar extends RoadmapItem {
  /** The bar's first day, `YYYY-MM-DD`: a sprint's start, else when work started, else created. */
  start: string;
  /** The due date, `YYYY-MM-DD`, where the bar ends. */
  due: string;
  /** Percent done: 100 once done, else the share of its children (a sprint's members) done. */
  progress: number;
  /** The bars with a line drawn into this one. */
  dependsOn: string[];
}

/** A line from `from` to `to`: `from` blocks `to`, or `from` is `to`'s parent. */
export interface RoadmapLink {
  from: string;
  to: string;
  kind: RoadmapLinkKind;
}

export interface RoadmapView {
  /** The dated epics and milestones, by due date, then priority, then age. */
  bars: RoadmapBar[];
  /** Every blocks and parent-child dependency between two bars. */
  links: RoadmapLink[];
  /** The epics and milestones with no due date, listed after the chart. */
  undated: RoadmapItem[];
  /** Dependencies with an end on an undated item: listed by count, not drawn. */
  unplacedLinks: number;
  axis: TimelineAxis | undefined;
}

const DAY_MS = 86_400_000;
const dateOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

function doneShare(members: readonly Issue[], statuses: readonly Status[]): number {
  if (members.length === 0) return 0;
  const done = members.filter((m) => statusCategory(m.status, statuses) === "done").length;
  return Math.round((done / members.length) * 100);
}

/** The links into `issue` from its `blocks` and `parent-child` dependencies and its parent. */
function linksInto(issue: Issue): RoadmapLink[] {
  const links: RoadmapLink[] = [];
  for (const dependency of issue.dependencies) {
    if (dependency.type === "blocks" || dependency.type === "parent-child") {
      links.push({ from: dependency.id, to: issue.id, kind: dependency.type });
    }
  }
  if (issue.parent !== undefined)
    links.push({ from: issue.parent, to: issue.id, kind: "parent-child" });
  return links;
}

/**
 * The Roadmap of `issues`: their epics and milestones, each placed by its due date as a bar from
 * its start, and the dependencies between two of them as lines. `issues` holds the rest of the
 * store too, for each bar's progress. `today` starts the axis when every due date is after it.
 */
export function roadmapView(
  issues: readonly Issue[],
  options: { statuses: readonly Status[]; today?: string },
): RoadmapView {
  const timeline = timelineView(issues, options);
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const itemOf = (issue: Issue): RoadmapItem => {
    const category = statusCategory(issue.status, options.statuses);
    return {
      id: issue.id,
      label: issue.displayId ?? issue.id,
      title: issue.title,
      type: issue.type,
      status: issue.status,
      category,
      token: statusToken(category),
    };
  };
  const placed = new Set(timeline.items.map((item) => item.id));
  const roadmapIds = new Set(issues.filter(isTimelineIssue).map((issue) => issue.id));

  const seen = new Set<string>();
  const links: RoadmapLink[] = [];
  let unplacedLinks = 0;
  for (const issue of issues) {
    if (!roadmapIds.has(issue.id)) continue;
    for (const link of linksInto(issue)) {
      const key = `${link.kind} ${link.from} ${link.to}`;
      if (seen.has(key) || !roadmapIds.has(link.from)) continue;
      seen.add(key);
      if (placed.has(link.from) && placed.has(link.to)) links.push(link);
      else unplacedLinks++;
    }
  }

  const bars = timeline.items.flatMap((item): RoadmapBar[] => {
    const issue = byId.get(item.id);
    if (issue === undefined) return [];
    const sprint = milestoneSprintOf(issue);
    const members =
      sprint === undefined
        ? issues.filter((other) => other.parent === issue.id)
        : issues.filter((other) => sprintLabelsOf(other).includes(sprint));
    const startStamp =
      (sprint === undefined ? undefined : startsAtOf(issue)) ?? issue.startedAt ?? issue.createdAt;
    const startDay = dayOf(startStamp);
    const start = startDay === undefined || startDay > item.day ? item.day : startDay;
    const category = itemOf(issue).category;
    return [
      {
        ...itemOf(issue),
        start: dateOf(start),
        due: item.due,
        progress: category === "done" ? 100 : doneShare(members, options.statuses),
        dependsOn: links.filter((link) => link.to === issue.id).map((link) => link.from),
      },
    ];
  });
  const undated = timeline.undated.flatMap((entry) => {
    const issue = byId.get(entry.id);
    return issue === undefined ? [] : [itemOf(issue)];
  });
  return { bars, links, undated, unplacedLinks, axis: timeline.axis };
}
