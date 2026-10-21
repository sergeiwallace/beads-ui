import type { Issue } from "../model.ts";
import type { Token } from "../tokens.ts";
import { asOf, truncate } from "./text.ts";

export interface BandCount {
  status: string;
  label: string;
  count: number;
  token: Token;
}

export interface BandView {
  /** `beads <store>`, the band's lead. */
  title: string;
  counts: BandCount[];
  asOf?: string;
  /** The whole band as one line, cut to the width, for a surface that draws a single Text. */
  line: string;
}

// T-1.6: the band names open, in-progress and blocked work, by bd's built-in status names.
const BAND_STATUSES: readonly { status: string; label: string; token: Token }[] = [
  { status: "open", label: "open", token: "status.active" },
  { status: "in_progress", label: "in progress", token: "status.wip" },
  { status: "blocked", label: "blocked", token: "warning" },
];

export function bandView(
  issues: readonly Issue[],
  options: { store: string; loadedAt?: string; width: number },
): BandView {
  const counts = BAND_STATUSES.map(({ status, label, token }) => ({
    status,
    label,
    count: issues.filter((issue) => issue.status === status).length,
    token,
  }));
  const title = `beads ${options.store}`;
  const stamp = options.loadedAt === undefined ? undefined : asOf(options.loadedAt);
  const parts = [title, ...counts.map((count) => `${count.count} ${count.label}`)];
  if (stamp !== undefined) parts.push(stamp);
  const view: BandView = { title, counts, line: truncate(parts.join(" | "), options.width) };
  if (stamp !== undefined) view.asOf = stamp;
  return view;
}
