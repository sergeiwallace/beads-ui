import type { RenderElement, RenderNode } from "claude-code";

import {
  type CommentsView,
  type DetailView,
  type EditableField,
  glyphOf,
  type ReviewSection,
  SPACE,
  textWidth,
} from "../../core/src/index.ts";
import type { Surface } from "./adapters.ts";
import { choice, field, markdown } from "./elements.ts";
import { emptyState, errorState } from "./frame.ts";
import { colorOf, weight } from "./look.ts";
import { reviewBlock, reviewRows, type SectionActions } from "./review.ts";
import { fitted, lineWindow, textLine, textLines, windowed } from "./window.ts";

// The Detail view (T-1.3, BU-mg2.3.14, BU-mg2.3.15, T-2C.5, D-35, T-2C.8), drawn from core's
// DetailView, CommentsView and ReviewSection on either surface: its heading, the Review section
// above the description, the fields with a control each, the description and notes, the
// dependencies, the history and the comments with the control a new one is typed into. On a
// windowed surface (the band) each is one line or more of one row, in the surface's window.

const MORE = glyphOf("text.more");
/** What a one-line control holds where it takes a line break or a backslash. */
const ONE_LINE_HINT = "one line: \\n is a line break, \\\\ a backslash";
export const DETAIL_EMPTY_TEXT =
  "No issue open: Tab to a card's detail button and press Enter, or focus a card and press d.";

const present = <T>(items: readonly (T | undefined | false)[]): T[] =>
  items.filter((item): item is T => item !== undefined && item !== false);

export interface DetailHandlers {
  edit: (field: EditableField, value: string) => void;
  comment: (text: string) => void;
}

/** What the Detail draws: nothing open, an issue being read, or an issue read. */
export interface DetailModel {
  id: string | undefined;
  /** The issue as read; undefined while it is read. */
  view: DetailView | undefined;
  /** The read's failure. */
  error?: string;
  /** The Status control's options, and the Type control's. */
  statuses: readonly string[];
  types: readonly string[];
  /** The fields' column on the pane's wide tier; the band draws one column. */
  wide: boolean;
  fieldColumns: number;
  review?: { section: ReviewSection; actions: SectionActions };
  comments: CommentsView;
  commentsError?: string;
  commentDraft: string;
  commentSaving: boolean;
  commentError?: string;
  handlers: DetailHandlers;
}

/**
 * A field's control: Status, Type and Priority a list, every other editable field a line typed
 * into, each beside its label in a Box that never shrinks. A control's own label shares its row
 * with the value, and on a narrow pane a long value squeezes it and cuts it in two (Claude Code
 * 2.1.306, 53 columns), so the label is drawn beside the control and the control carries none.
 */
function fieldRow(
  surface: Surface,
  model: DetailModel,
  item: DetailView["fields"][number],
): RenderElement {
  const { Box, Text } = surface.ui;
  const raw = item.raw ?? item.value;
  const editable = item.editable;
  const used = textWidth(`${item.label}:`) + SPACE.tight;
  const labelled = (key: EditableField, control: RenderElement) =>
    Box({
      key: `edit-row:${key}`,
      flexDirection: "row",
      gap: SPACE.tight,
      children: [
        Box({
          key: `label:${key}`,
          flexShrink: 0,
          children: [Text({ children: `${item.label}:` })],
        }),
        fitted(surface, used, control),
      ],
    });
  const list = (key: EditableField, options: readonly { value: string; label?: string }[]) =>
    labelled(
      key,
      choice(surface, {
        key: `edit:${key}`,
        options,
        value: raw,
        onSelect: (value) => model.handlers.edit(key, value),
      }),
    );
  if (editable === "status" && model.statuses.length > 0) {
    const statuses = model.statuses.map((value) => ({ value }));
    return list(
      editable,
      statuses.some((option) => option.value === raw) ? statuses : [{ value: raw }, ...statuses],
    );
  }
  if (editable === "type") {
    const types = [...new Set([raw, ...model.types])].filter((type) => type !== "");
    return list(
      editable,
      types.map((value) => ({ value })),
    );
  }
  if (editable === "priority") {
    return list(
      editable,
      [0, 1, 2, 3, 4].map((p) => ({ value: String(p), label: `P${p}` })),
    );
  }
  if (editable !== undefined) {
    return labelled(
      editable,
      field(surface, {
        key: `edit:${editable}`,
        value: raw,
        ...(editable === "description" ? { placeholder: ONE_LINE_HINT } : {}),
        submitLabel: "save",
        onSubmit: (value) => model.handlers.edit(editable, value),
      }),
    );
  }
  if (windowed(surface)) {
    return textLine(surface, `field:${item.key}`, `${item.label}: ${item.value}`);
  }
  return Box({
    key: `field:${item.key}`,
    children: [Text({ children: `${item.label}: ${item.value}` })],
  });
}

/** The comment control, beside its label. */
function commentRow(surface: Surface, model: DetailModel): RenderElement {
  const { Box, Text } = surface.ui;
  return Box({
    key: "comment-row",
    flexDirection: "row",
    gap: SPACE.tight,
    children: [
      Box({ key: "label:comment", flexShrink: 0, children: [Text({ children: "Comment:" })] }),
      fitted(
        surface,
        textWidth("Comment:") + SPACE.tight,
        field(surface, {
          key: "comment-add",
          value: model.commentDraft,
          placeholder: ONE_LINE_HINT,
          submitLabel: "add",
          onSubmit: (value) => model.handlers.comment(value),
        }),
      ),
    ],
  });
}

/** The Detail's lines on a windowed surface: every part, each line one row. */
function detailLines(surface: Surface, model: DetailModel, view: DetailView): RenderNode[] {
  const line = textLine;
  const comments = model.comments;
  return present<RenderNode>([
    line(surface, "detail-heading", view.heading, { role: "title" }),
    view.savingLine === undefined
      ? undefined
      : line(surface, "detail-saving", view.savingLine, { token: "text.dim" }),
    view.errorLine === undefined
      ? undefined
      : line(surface, "detail-save-error", view.errorLine, { token: "error" }),
    model.error === undefined
      ? undefined
      : line(surface, "detail-error", model.error, { token: "error" }),
    ...(model.review === undefined
      ? []
      : reviewRows(surface, model.review.section, model.review.actions)),
    ...view.fields.map((item) => fieldRow(surface, model, item)),
    ...view.markdown.flatMap((block) => [
      line(surface, `md-heading:${block.key}`, block.label, { role: "heading" }),
      ...textLines(surface, `md:${block.key}`, block.text),
    ]),
    line(surface, "dependencies-heading", `Dependencies (${view.dependencies.length})`, {
      role: "heading",
    }),
    ...view.dependencies.map((dep) => line(surface, `dep:${dep.id}`, dep.line)),
    line(surface, "history-heading", `History, last ${view.events.length}`, { role: "heading" }),
    ...view.events.map((event, i) => line(surface, `event:${i}`, event.line, { role: "meta" })),
    line(surface, "comments-heading", comments.heading, { role: "heading" }),
    model.commentsError === undefined
      ? undefined
      : line(surface, "comments-error", model.commentsError, { token: "error" }),
    ...comments.rows.flatMap((row) => [
      line(surface, `comment:${row.id}`, row.line, { role: "meta" }),
      ...textLines(surface, `comment-md:${row.id}`, row.text),
    ]),
    model.commentSaving
      ? line(surface, "comment-saving", `adding the comment${MORE}`, { token: "text.dim" })
      : undefined,
    model.commentError === undefined
      ? undefined
      : line(surface, "comment-error", model.commentError, { token: "error" }),
    commentRow(surface, model),
  ]);
}

/** The Detail on either surface. */
export function detail(surface: Surface, model: DetailModel): RenderElement {
  const { Box, Text } = surface.ui;
  const lined = windowed(surface);
  if (model.id === undefined) {
    return Box({
      key: "detail",
      flexDirection: "column",
      children: [emptyState(surface, "detail-empty", DETAIL_EMPTY_TEXT)],
    });
  }
  const errorLine =
    model.error === undefined ? undefined : errorState(surface, "detail-error", model.error);
  const view = model.view;
  if (view === undefined) {
    return Box({
      key: "detail",
      flexDirection: "column",
      children: present([
        errorLine ?? Text({ ...weight("meta"), children: `reading ${model.id}${MORE}` }),
      ]),
    });
  }
  if (lined) return lineWindow(surface, "detail", detailLines(surface, model, view));
  const line = (key: string, text: string, token: "text.dim" | "error") =>
    Box({ key, children: [Text({ color: colorOf(token), children: text })] });
  // Each part of the Detail under its heading on the weight scale, a `tight` row above it.
  const heading = (key: string, text: string) =>
    Box({
      key,
      marginTop: SPACE.tight,
      children: [Text({ ...weight("heading"), children: text })],
    });
  const comments = model.comments;
  return Box({
    key: "detail",
    flexDirection: "column",
    children: present<RenderNode>([
      Box({
        key: "detail-heading",
        children: [Text({ ...weight("title"), children: view.heading })],
      }),
      view.savingLine === undefined
        ? undefined
        : line("detail-saving", view.savingLine, "text.dim"),
      view.errorLine === undefined ? undefined : line("detail-save-error", view.errorLine, "error"),
      errorLine,
      model.review === undefined
        ? undefined
        : reviewBlock(surface, model.review.section, model.review.actions),
      Box({
        flexDirection: model.wide ? "row" : "column",
        gap: model.wide ? SPACE.loose : SPACE.tight,
        children: [
          Box({
            key: "detail-fields",
            flexDirection: "column",
            width: model.fieldColumns,
            children: view.fields.map((item) => fieldRow(surface, model, item)),
          }),
          Box({
            key: "detail-text",
            flexDirection: "column",
            flexGrow: 1,
            children: view.markdown.flatMap((block) => [
              Text({ ...weight("heading"), children: block.label }),
              markdown(surface, { key: `md:${block.key}`, text: block.text }),
            ]),
          }),
        ],
      }),
      heading("dependencies-heading", `Dependencies (${view.dependencies.length})`),
      ...view.dependencies.map((dep) =>
        Box({ key: `dep:${dep.id}`, children: [Text({ children: dep.line })] }),
      ),
      heading("history-heading", `History, last ${view.events.length}`),
      ...view.events.map((event, i) =>
        Box({ key: `event:${i}`, children: [Text({ ...weight("meta"), children: event.line })] }),
      ),
      Box({
        key: "comments-heading",
        marginTop: SPACE.tight,
        children: [Text({ ...weight("heading"), children: comments.heading })],
      }),
      model.commentsError === undefined
        ? undefined
        : line("comments-error", model.commentsError, "error"),
      ...comments.rows.map((row) =>
        Box({
          key: `comment:${row.id}`,
          flexDirection: "column",
          children: [
            Text({ ...weight("meta"), children: row.line }),
            markdown(surface, { key: `comment-md:${row.id}`, text: row.text }),
          ],
        }),
      ),
      model.commentSaving
        ? line("comment-saving", `adding the comment${MORE}`, "text.dim")
        : undefined,
      model.commentError === undefined
        ? undefined
        : line("comment-error", model.commentError, "error"),
      commentRow(surface, model),
    ]),
  });
}
