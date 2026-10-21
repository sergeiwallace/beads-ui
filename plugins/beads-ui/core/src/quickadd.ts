import { issueIdArg } from "./argv.ts";
import type { BdArgv, Priority, Result } from "./model.ts";

/** A parsed quick-add line (D-23). `sprint` also appears in `labels` as `sprint:<name>`. */
export interface QuickAdd {
  title: string;
  priority?: Priority;
  type?: string;
  assignee?: string;
  labels: string[];
  due?: string;
  sprint?: string;
}

export type QuickAddError =
  | { kind: "empty-title"; message: string }
  | { kind: "duplicate-token"; token: string; message: string }
  | { kind: "invalid-value"; token: string; message: string };

type Slot = "type" | "assignee" | "label" | "due" | "sprint";

// Checked in order; `+` and `@` take the rest of the token, the others what follows the colon.
const PREFIXES: readonly (readonly [string, Slot])[] = [
  ["type:", "type"],
  ["due:", "due"],
  ["sprint:", "sprint"],
  ["@", "assignee"],
  ["+", "label"],
];
const PRIORITY = /^p([0-4])$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(text: string): boolean {
  const match = DATE.exec(text);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Tokens: `p0`..`p4`, `type:<t>`, `@<assignee>`, `+<label>`, `due:<YYYY-MM-DD>`, `sprint:<name>`;
 * every other token joins the title in order. Each token but `+<label>` may appear once.
 */
export function parseQuickAdd(line: string): Result<QuickAdd, QuickAddError> {
  const title: string[] = [];
  const labels: string[] = [];
  const parsed: QuickAdd = { title: "", labels };
  const seen = new Set<string>();
  const fail = (kind: "duplicate-token" | "invalid-value", token: string, message: string) => ({
    ok: false as const,
    error: { kind, token, message },
  });

  for (const token of line.split(/\s+/).filter((part) => part !== "")) {
    const priority = PRIORITY.exec(token);
    if (priority !== null) {
      if (seen.has("priority")) return fail("duplicate-token", token, "priority is given twice");
      seen.add("priority");
      parsed.priority = Number(priority[1]) as Priority;
      continue;
    }

    const prefix = PREFIXES.find(([text]) => token.startsWith(text));
    if (prefix === undefined) {
      title.push(token);
      continue;
    }
    const [text, slot] = prefix;
    const value = token.slice(text.length);
    if (value === "") return fail("invalid-value", token, `${token} needs a value`);
    if (slot !== "label") {
      if (seen.has(slot)) return fail("duplicate-token", token, `${slot} is given twice`);
      seen.add(slot);
    }

    switch (slot) {
      case "type":
        parsed.type = value;
        break;
      case "assignee":
        parsed.assignee = value;
        break;
      case "due":
        if (!isCalendarDate(value)) {
          return fail("invalid-value", token, `due: takes a date as YYYY-MM-DD, got ${value}`);
        }
        parsed.due = value;
        break;
      case "sprint":
        parsed.sprint = value;
        if (!labels.includes(`sprint:${value}`)) labels.push(`sprint:${value}`);
        break;
      case "label":
        if (value.includes(",")) return fail("invalid-value", token, "a label cannot hold a comma");
        if (!labels.includes(value)) labels.push(value);
        break;
    }
  }

  parsed.title = title.join(" ");
  if (parsed.title === "") {
    return { ok: false, error: { kind: "empty-title", message: "a new issue needs a title" } };
  }
  return { ok: true, value: parsed };
}

/** The `bd create` argv for a parsed line, with `--json` so the new id can be read back. */
export function createArgv(quickAdd: QuickAdd, options: { parent?: string } = {}): BdArgv {
  const argv = ["bd", "create", `--title=${quickAdd.title}`];
  if (quickAdd.priority !== undefined) argv.push(`--priority=${quickAdd.priority}`);
  if (quickAdd.type !== undefined) argv.push(`--type=${quickAdd.type}`);
  if (quickAdd.assignee !== undefined) argv.push(`--assignee=${quickAdd.assignee}`);
  if (quickAdd.labels.length > 0) argv.push(`--labels=${quickAdd.labels.join(",")}`);
  if (quickAdd.due !== undefined) argv.push(`--due=${quickAdd.due}`);
  if (options.parent !== undefined) argv.push(`--parent=${issueIdArg(options.parent)}`);
  argv.push("--json");
  return argv;
}
