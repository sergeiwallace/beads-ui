// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import {
  COMMENTS_MAX_CHARS,
  type Comment,
  commentAddArgv,
  commentsView,
  parseBdComments,
  parseCommentDraft,
} from "../src/index.ts";
import comments from "./fixtures/bd-comments-BU-mg2.3.json.ts";
import { unwrap } from "./helpers.ts";

const comment = (n: number, text: string): Comment => ({
  id: `c-${n}`,
  issueId: "BU-x",
  author: "aih-ec2-3",
  text,
  createdAt: `2026-10-${String(10 + n).padStart(2, "0")}T08:00:00Z`,
});

describe("commentsView", () => {
  test("should list every comment bd comments returned, oldest first, with its author and time", () => {
    const parsed = unwrap(parseBdComments(comments));
    const view = commentsView("BU-mg2.3", [...parsed].reverse(), { width: 80 });

    expect(view.heading).toBe(`Comments (${parsed.length})`);
    expect(view.rows.map((row) => row.id)).toEqual(parsed.map((one) => one.id));
    expect(view.rows[0]?.line).toBe("aih-ec2-3 2026-10-21 10:01");
    expect(view.rows.map((row) => row.text)).toEqual(parsed.map((one) => one.text));
  });

  test("should keep every comment and cut the oldest bodies, saying how to read them, when they pass the budget together", () => {
    const big = "x".repeat(9_000);
    const many = Array.from({ length: 6 }, (_, n) => comment(n, big));

    const view = commentsView("BU-x", many, { width: 80 });

    expect(view.rows).toHaveLength(6);
    const total = view.rows.reduce((sum, row) => sum + row.text.length, 0);
    // Past the budget, a body is only its note: about 60 characters for each of the two oldest.
    expect(total).toBeLessThanOrEqual(COMMENTS_MAX_CHARS + 200);
    expect(view.rows[5]?.text).toBe(big);
    expect(view.rows[0]?.text).toContain("[9000 characters; read it whole with bd comments BU-x]");
  });
});

describe("adding a comment", () => {
  test("should read the control's escapes back into line breaks and refuse an empty comment", () => {
    expect(unwrap(parseCommentDraft("first\\nsecond"))).toBe("first\nsecond");
    expect(parseCommentDraft(" \\n ")).toEqual({ ok: false, error: "a comment cannot be empty" });
  });

  test("should pass the text after -- so a comment that starts with a dash is never a flag", () => {
    expect(commentAddArgv("BU-x", "--force is not a flag here", "aih-ec2-3")).toEqual([
      "bd",
      "comments",
      "add",
      "BU-x",
      "--actor=aih-ec2-3",
      "--json",
      "--",
      "--force is not a flag here",
    ]);
    expect(commentAddArgv("BU-x", "text")).toEqual([
      "bd",
      "comments",
      "add",
      "BU-x",
      "--json",
      "--",
      "text",
    ]);
  });
});
