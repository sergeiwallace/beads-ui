import type { RenderElement, RenderNode } from "claude-code";

import {
  DEFAULT_REVIEW_FILTER,
  type ReviewListView,
  type ReviewSection,
  stampText,
  truncate,
} from "../../core/src/index.ts";
import type { ReaderState } from "../review.ts";
import { has, type Surface } from "./adapters.ts";
import { field, markdown } from "./elements.ts";
import { colorOf } from "./look.ts";

// The Review section of a Detail and the reader of one held item (D-40, T-2C.5), drawn once for
// both surfaces: the pane's Detail draws the section and the reader, the band's overview the
// section's rows within its row budget.

export const REVIEW_SECTION_KEY = "review";
/** A held item's row button: pressing it opens the item in the reader. */
export const reviewRowKey = (key: string): string => `review:${key}`;
export const READER_KEY = "reader";
export const ANSWER_KEY = "reader:answer";
export const SEND_KEY = "reader:send";
export const ISSUE_KEY = "reader:issue";
export const CLOSE_KEY = "reader:close";
/** How many rows the Answer field is drawn: Enter submits, Shift+Enter types a line break. */
export const ANSWER_ROWS = 3;

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

export interface SectionActions {
  /** Opens the held item at `path` in the reader. */
  open: (path: string) => void;
  /** Steps the section's page of held items. */
  page: (delta: number) => void;
}

/**
 * The section's rows, one element a line, so the band can take as many as its rows allow: the
 * heading; per held item its `kind: title` button, its ask and its status, session and times;
 * the page controls; and each bd blocker's line.
 */
export function reviewRows(
  surface: Surface,
  section: ReviewSection,
  actions: SectionActions,
): RenderNode[] {
  const { Box, Text, Button } = surface.ui;
  const dim = (key: string, text: string) =>
    Box({ key, children: [Text({ dimColor: true, children: text })] });
  const rows: RenderNode[] = [
    Box({
      key: "review-heading",
      children: [Text({ bold: true, color: colorOf("accent"), children: section.heading })],
    }),
  ];
  for (const row of section.rows) {
    rows.push(
      Box({
        key: `review-row:${row.key}`,
        flexDirection: "row",
        children: [
          Button({
            key: reviewRowKey(row.key),
            label: row.label,
            onPress: () => actions.open(row.path),
          }),
        ],
      }),
    );
    if (row.ask !== "") {
      rows.push(
        Box({ key: `review-ask:${row.key}`, children: [Text({ children: `  ${row.ask}` })] }),
      );
    }
    rows.push(
      dim(
        `review-meta:${row.key}`,
        `  ${row.meta}${row.waitedOn ? "; the blocked transition waits on it" : ""}`,
      ),
    );
  }
  if (section.pages > 1) {
    rows.push(
      Box({
        key: "review-pages",
        flexDirection: "row",
        columnGap: 1,
        children: present<RenderNode>([
          section.page > 0
            ? Button({
                key: "review:earlier",
                label: "earlier items",
                onPress: () => actions.page(-1),
              })
            : undefined,
          Text({ dimColor: true, children: `items page ${section.page + 1} of ${section.pages}` }),
          section.page < section.pages - 1
            ? Button({ key: "review:later", label: "later items", onPress: () => actions.page(1) })
            : undefined,
        ]),
      }),
    );
  }
  if (section.blockers.length > 0) {
    rows.push(
      Box({ key: "review-blockers", children: [Text({ bold: true, children: "bd blockers" })] }),
    );
    for (const blocker of section.blockers) {
      rows.push(
        Box({ key: `review-${blocker.key}`, children: [Text({ children: `  ${blocker.line}` })] }),
      );
    }
  }
  if (section.unset !== undefined) rows.push(dim("review-unset", section.unset));
  if (section.note !== undefined) rows.push(dim("review-note", section.note));
  return rows;
}

/** The section as one block, for the pane's Detail. */
export function reviewBlock(
  surface: Surface,
  section: ReviewSection,
  actions: SectionActions,
): RenderElement {
  return surface.ui.Box({
    key: REVIEW_SECTION_KEY,
    flexDirection: "column",
    children: reviewRows(surface, section, actions),
  });
}

export const REVIEW_VIEW_KEY = "review-view";
export const REVIEW_FILTER_KEY = "review-filter";
/** A Review view row's button: pressing it opens the item in the reader. */
export const reviewItemKey = (key: string): string => `review-item:${key}`;

export interface ReviewListActions {
  open: (path: string) => void;
  filter: (text: string) => void;
  /** Absent for a session without the scope control: only the firstmate switches. */
  scope?: () => void;
  sort: () => void;
  group: () => void;
  page: (delta: number) => void;
  /** The button form's way to type a filter: it opens the Review view in the pane. */
  elsewhere?: () => void;
}

/**
 * The Review view (T-2C.6, D-40) on any surface: its heading and read time, the scope, sort and
 * group controls, the filter line, then the items, group headers with their counts between them,
 * a page at a time. The pane draws an item as its button, its ask and its status line; a short
 * surface (the band) as its button and its status on one line. On the pane the controls carry
 * their keys (a, o, s, p and b); the band's buttons carry none, since a band key fires from the
 * prompt.
 */
export function reviewList(
  surface: Surface,
  view: ReviewListView,
  filterText: string,
  actions: ReviewListActions,
): RenderElement {
  const { Box, Text, Button } = surface.ui;
  const pane = surface.id === "pane";
  const compact = surface.short;
  const width = surface.columns;
  const key = (hotkey: string) => (pane ? { hotkey } : {});
  // A short surface cuts each line at its columns, since a wrapped line takes a row it lacks.
  const dim = (k: string, text: string) =>
    Box({
      key: k,
      children: [
        compact
          ? Text({ dimColor: true, wrap: "truncate-end", children: truncate(text, width) })
          : Text({ dimColor: true, children: text }),
      ],
    });
  const pressable = (k: string, label: string, hotkey: string, press: () => void) =>
    Button({ key: k, label, plain: true, ...key(hotkey), onPress: press });
  const scope = actions.scope;
  const rows: RenderNode[] = [
    Box({
      key: "review-view:heading",
      flexDirection: "row",
      columnGap: 2,
      children: present<RenderNode>([
        Text({
          bold: true,
          color: colorOf("accent"),
          wrap: "truncate-end",
          children: view.heading,
        }),
        view.read === undefined || compact
          ? undefined
          : Text({ dimColor: true, children: view.read }),
      ]),
    }),
    Box({
      key: "review-view:controls",
      flexDirection: "row",
      flexWrap: "wrap",
      columnGap: 2,
      children: present<RenderNode>([
        view.scope === undefined || scope === undefined
          ? undefined
          : pressable("review:scope", view.scope.label, "a", scope),
        pressable("review:sort", `Sort: ${view.sort}`, "o", actions.sort),
        pressable("review:group", `Group: ${view.group}`, "s", actions.group),
      ]),
    }),
    Box({
      key: "review-view:filter",
      flexDirection: "row",
      gap: 1,
      children: [
        Box({
          key: "label:review-filter",
          flexShrink: 0,
          children: [Text({ children: "Filter:" })],
        }),
        field(surface, {
          key: REVIEW_FILTER_KEY,
          value: filterText,
          submitLabel: "filter",
          onSubmit: (value) => actions.filter(value),
          presets: [DEFAULT_REVIEW_FILTER, "selection:all"],
          ...(actions.elsewhere === undefined
            ? {}
            : { elsewhere: { label: "type a filter in the pane", press: actions.elsewhere } }),
        }),
      ],
    }),
  ];
  if (view.filterError !== undefined) {
    rows.push(
      Box({
        key: "review-view:filter-error",
        children: [Text({ color: colorOf("warning"), children: view.filterError })],
      }),
    );
  }
  if (view.unset !== undefined) rows.push(dim("review-view:unset", view.unset));
  if (view.note !== undefined) rows.push(dim("review-view:note", view.note));
  if (view.empty !== undefined) rows.push(dim("review-view:empty", view.empty));
  for (const entry of view.entries) {
    if (entry.kind === "group") {
      rows.push(
        Box({
          key: `review-group:${entry.key}`,
          children: [
            Text({
              bold: true,
              wrap: "truncate-end",
              children: truncate(`${entry.label} (${entry.count})`, width),
            }),
          ],
        }),
      );
      continue;
    }
    const row = entry.row;
    const open = Button({
      key: reviewItemKey(row.key),
      label: truncate(row.label, compact ? Math.max(8, Math.floor(width / 2)) : width - 2),
      onPress: () => actions.open(row.path),
    });
    if (compact) {
      rows.push(
        Box({
          key: `review-line:${row.key}`,
          flexDirection: "row",
          columnGap: 1,
          children: [open, Text({ dimColor: true, wrap: "truncate-end", children: row.meta })],
        }),
      );
      continue;
    }
    rows.push(Box({ key: `review-line:${row.key}`, flexDirection: "row", children: [open] }));
    if (row.ask !== "") {
      rows.push(
        Box({
          key: `review-line-ask:${row.key}`,
          children: [Text({ wrap: "truncate-end", children: `  ${truncate(row.ask, width - 2)}` })],
        }),
      );
    }
    rows.push(dim(`review-line-meta:${row.key}`, `  ${row.meta}`));
  }
  if (view.pages > 1) {
    rows.push(
      Box({
        key: "review-view:pages",
        flexDirection: "row",
        columnGap: 1,
        children: [
          pressable("review:earlier", "earlier items", "b", () => actions.page(-1)),
          Text({ dimColor: true, children: `page ${view.page + 1} of ${view.pages}` }),
          pressable("review:later", "later items", "p", () => actions.page(1)),
        ],
      }),
    );
  }
  return Box({ key: REVIEW_VIEW_KEY, flexDirection: "column", children: rows });
}

export interface ReaderActions {
  step: (delta: number) => void;
  answer: (text: string) => void;
  type: (text: string) => void;
  send: () => void;
  issue: () => void;
  close: () => void;
}

const outcomeLine = (
  state: ReaderState,
): { text: string; token: "success" | "warning" | "error" } | undefined => {
  const outcome = state.outcome;
  if (state.busy) return { text: "recording the answer", token: "warning" };
  if (outcome === undefined) return undefined;
  switch (outcome.kind) {
    case "answered":
      return {
        text: `answered in commit ${outcome.commit}; the session was handed the follow-through`,
        token: "success",
      };
    case "refused":
      return {
        text: `${outcome.message}. The text is kept: Send to session hands it to the session.`,
        token: "error",
      };
    case "sent":
      return {
        text: "sent to the session with no answer commit: it records the answer",
        token: "success",
      };
    case "empty":
      return { text: "type the answer first", token: "warning" };
  }
};

/**
 * One held item in the reader: its title, path, status and ask, its body a page at a time, the
 * Answer field and Send to session, Go to issue and Close. The Answer field keeps what was typed
 * when the answer is refused.
 */
export function reviewReader(
  surface: Surface,
  state: ReaderState,
  actions: ReaderActions,
): RenderElement {
  const { Box, Text, Button, Input } = surface.ui;
  const { item } = state;
  const pages = state.pages;
  const page = pages?.[state.page];
  const dim = (key: string, text: string) =>
    Box({ key, children: [Text({ dimColor: true, children: text })] });
  const outcome = outcomeLine(state);
  const status = [
    item.status,
    item.selection === "current" ? undefined : item.selection,
    item.session,
    `held ${stampText(item.createdAt)}`,
    item.answeredAt === undefined || item.answeredAt === ""
      ? undefined
      : `answered ${stampText(item.answeredAt)}`,
  ]
    .filter((part) => part !== undefined)
    .join(", ");
  return Box({
    key: READER_KEY,
    flexDirection: "column",
    children: present<RenderNode>([
      Box({
        key: "reader-title",
        children: [Text({ bold: true, children: `${item.kind}: ${item.title}` })],
      }),
      dim("reader-path", item.path),
      dim("reader-status", status),
      item.ask === ""
        ? undefined
        : Box({ key: "reader-ask", children: [Text({ children: `Ask: ${item.ask}` })] }),
      state.error === undefined
        ? undefined
        : Box({
            key: "reader-error",
            children: [Text({ color: colorOf("error"), children: state.error })],
          }),
      pages === undefined && state.error === undefined
        ? dim("reader-reading", "reading the item")
        : undefined,
      pages !== undefined && pages.length > 1
        ? Box({
            key: "reader-pages",
            flexDirection: "row",
            columnGap: 1,
            children: present<RenderNode>([
              state.page > 0
                ? Button({
                    key: "reader:earlier",
                    label: "earlier page",
                    onPress: () => actions.step(-1),
                  })
                : undefined,
              Text({ dimColor: true, children: `page ${state.page + 1} of ${pages.length}` }),
              state.page < pages.length - 1
                ? Button({
                    key: "reader:later",
                    label: "later page",
                    onPress: () => actions.step(1),
                  })
                : undefined,
            ]),
          })
        : undefined,
      page === undefined
        ? undefined
        : markdown(surface, { key: `reader-body:${state.page}`, text: page }),
      Box({
        key: "reader-answer-row",
        flexDirection: "row",
        gap: 1,
        children: [
          Box({ key: "label:answer", flexShrink: 0, children: [Text({ children: "Answer:" })] }),
          has(surface, "Input") && Input !== undefined
            ? Input({
                key: ANSWER_KEY,
                value: state.draft,
                rows: ANSWER_ROWS,
                placeholder: "your answer, exactly as it is recorded",
                submitLabel: "answer",
                onInput: (value: string) => actions.type(value),
                onSubmit: (value: string) => actions.answer(value),
              })
            : Text({ dimColor: true, children: "answer in the pane" }),
        ],
      }),
      outcome === undefined
        ? undefined
        : Box({
            key: "reader-outcome",
            children: [Text({ color: colorOf(outcome.token), children: outcome.text })],
          }),
      Box({
        key: "reader-actions",
        flexDirection: "row",
        columnGap: 1,
        children: [
          Button({ key: SEND_KEY, label: "Send to session", onPress: () => actions.send() }),
          Button({ key: ISSUE_KEY, label: "Go to issue", onPress: () => actions.issue() }),
          Button({ key: CLOSE_KEY, label: "Close", onPress: () => actions.close() }),
        ],
      }),
    ]),
  });
}
