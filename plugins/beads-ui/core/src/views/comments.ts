// An issue's comments (BU-mg2.3.15): every comment `bd comments <id> --json` returned, oldest
// first and newest last, each with its author and time, and the draft a new comment is typed
// into. Pure: the Detail view draws it, and the task panel opens a task into that view.

import type { Comment, Result } from "../model.ts";
import { fromOneLine } from "./detail.ts";
import { BLOCK_MAX_CHARS, truncate } from "./text.ts";

/**
 * The most characters the comment bodies take together: a mod tree is cut off past 100,000
 * serialized characters, and the Detail view draws the issue's own fields and text besides.
 */
export const COMMENTS_MAX_CHARS = 30_000;

export interface CommentRow {
  id: string;
  author: string;
  /** `YYYY-MM-DD HH:MM`. */
  at: string;
  /** The author and time as drawn, cut only past the view's width. */
  line: string;
  /** The body as a Markdown block holds it; one cut to the budget ends in a line that says so. */
  text: string;
}

export interface CommentsView {
  heading: string;
  rows: CommentRow[];
}

/**
 * Every comment, newest last. The bodies share COMMENTS_MAX_CHARS, newest first, each at most
 * BLOCK_MAX_CHARS; a body past what is left says how to read it whole, so no comment is dropped.
 */
export function commentsView(
  issueId: string,
  comments: readonly Comment[],
  options: { width: number },
): CommentsView {
  const ordered = comments
    .map((comment, index) => ({ comment, index }))
    .sort((a, b) => {
      const ta = Date.parse(a.comment.createdAt);
      const tb = Date.parse(b.comment.createdAt);
      return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb) || a.index - b.index;
    })
    .map(({ comment }) => comment);
  let left = COMMENTS_MAX_CHARS;
  const bodies = new Map<string, string>();
  for (const comment of [...ordered].reverse()) {
    const room = Math.min(left, BLOCK_MAX_CHARS);
    const whole = comment.text.length <= room;
    const note = `\n\n[${comment.text.length} characters; read it whole with bd comments ${issueId}]`;
    const body = whole
      ? comment.text
      : `${comment.text.slice(0, Math.max(0, room - note.length))}${note}`;
    bodies.set(comment.id, body);
    left = Math.max(0, left - body.length);
  }
  return {
    heading: `Comments (${ordered.length})`,
    rows: ordered.map((comment): CommentRow => {
      const at = comment.createdAt.replace("T", " ").slice(0, 16);
      return {
        id: comment.id,
        author: comment.author,
        at,
        line: truncate(`${comment.author}  ${at}`, options.width),
        text: bodies.get(comment.id) ?? "",
      };
    }),
  };
}

/**
 * Reads what the comment control holds into the text `bd comments add` writes: `\n` is a line
 * break and `\\` a backslash, as in the description's one-line control. Refuses an empty one.
 */
export function parseCommentDraft(text: string): Result<string, string> {
  const body = fromOneLine(text);
  if (body.trim() === "") return { ok: false, error: "a comment cannot be empty" };
  return { ok: true, value: body };
}
