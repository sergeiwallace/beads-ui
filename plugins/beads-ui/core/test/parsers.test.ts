// Runners: both. `claude plugin test` runs it in the mod environment, and Vitest maps
// claude-code/testing to vitest (plugins/beads-ui/vitest.config.ts). See CONTRIBUTING.md, Tests.
import { describe, expect, test } from "claude-code/testing";
import { parseBdList, parseBdShow, parseBdStatuses } from "../src/index.ts";
import BD_LIST from "./fixtures/bd-list.json.ts";
import BD_SHOW from "./fixtures/bd-show.json.ts";
import BD_STATUSES from "./fixtures/bd-statuses.json.ts";

// Fixtures are real bd 1.3.1 output captured from this repository's own Beads store.
const FIXTURES: Record<string, string> = {
  "bd-list.json": BD_LIST,
  "bd-show.json": BD_SHOW,
  "bd-statuses.json": BD_STATUSES,
};
const fixture = (name: string): string => {
  const text = FIXTURES[name];
  if (text === undefined) throw new Error(`no fixture ${name}`);
  return text;
};

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("parseBdList", () => {
  test("should return one Issue per record when given real bd list --json output", () => {
    const text = fixture("bd-list.json");
    const raw = JSON.parse(text) as { id: string }[];

    const issues = unwrap(parseBdList(text));

    expect(issues.map((issue) => issue.id)).toEqual(raw.map((record) => record.id));
  });

  test("should map bd field names onto the core model when a record carries them", () => {
    const issues = unwrap(parseBdList(fixture("bd-list.json")));

    const task = issues.find((issue) => issue.id === "BU-mg2.3.10");
    expect(task).toMatchObject({
      displayId: "BU-t-1-6-bands-beads-tqpj",
      title: "T-1.6: bands and the beads command",
      status: "open",
      priority: 1,
      type: "task",
      labels: ["id:BU-t-1-6-bands-beads-tqpj"],
      parent: "BU-mg2.3",
      dependencies: [{ type: "parent-child", id: "BU-mg2.3" }],
      createdAt: "2026-10-21T05:48:48Z",
      metadata: { display_id: "BU-t-1-6-bands-beads-tqpj" },
    });
    expect(task?.assignee).toBeUndefined();
    expect(task?.closedAt).toBeUndefined();

    const closed = issues.find((issue) => issue.id === "BU-mg2.2.2");
    expect(closed).toMatchObject({
      status: "closed",
      assignee: "aih-3",
      closedAt: "2026-10-15T01:49:28Z",
    });
    expect(closed?.startedAt).toEqual(expect.any(String));
  });

  test("should read the human owner from metadata.owner and not from bd's owner field", () => {
    const records = JSON.parse(fixture("bd-list.json")) as Record<string, unknown>[];
    const first = records[0] as Record<string, unknown>;
    const second = records[1] as Record<string, unknown>;
    expect(typeof first.owner).toBe("string");
    expect(typeof second.owner).toBe("string");
    first.metadata = { ...(first.metadata as object), owner: "Sergei Wallace" };

    const [withOwner, withoutOwner] = unwrap(parseBdList(JSON.stringify(records)));

    expect(withOwner?.owner).toBe("Sergei Wallace");
    expect(withoutOwner?.owner).toBeUndefined();
  });

  test("should name metadata.owner when it is not a string", () => {
    const records = JSON.parse(fixture("bd-list.json")) as Record<string, unknown>[];
    const first = records[0] as Record<string, unknown>;
    first.metadata = { ...(first.metadata as object), owner: 42 };

    const result = parseBdList(JSON.stringify(records));

    expect(!result.ok && result.error).toMatchObject({ path: "$[0].metadata.owner" });
  });

  test("should return a typed parse error when the output is not JSON", () => {
    const result = parseBdList("Error: no beads database found\n");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatchObject({
      kind: "parse-error",
      source: "bd list",
      path: "$",
    });
  });

  test("should name the field when a record has an out-of-range priority", () => {
    const records = JSON.parse(fixture("bd-list.json")) as Record<string, unknown>[];
    const first = records[0] as Record<string, unknown>;
    first.priority = 7;

    const result = parseBdList(JSON.stringify(records));

    expect(!result.ok && result.error).toMatchObject({ path: "$[0].priority" });
  });

  test("should name the field when a record has no title", () => {
    const records = JSON.parse(fixture("bd-list.json")) as Record<string, unknown>[];
    delete (records[2] as Record<string, unknown>).title;

    const result = parseBdList(JSON.stringify(records));

    expect(!result.ok && result.error).toMatchObject({ path: "$[2].title" });
  });

  test("should return a parse error when the output is an object instead of an array", () => {
    const result = parseBdList('{"error":"boom"}');

    expect(!result.ok && result.error).toMatchObject({ path: "$", message: "expected an array" });
  });
});

describe("parseBdShow", () => {
  test("should map embedded dependency records when given real bd show --json output", () => {
    const issues = unwrap(parseBdShow(fixture("bd-show.json")));

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: "BU-mg2.3",
      displayId: "BU-beads-ui-claude-code-aeyb",
      type: "epic",
      status: "in_progress",
      parent: "BU-mg2",
      dependencies: [{ type: "parent-child", id: "BU-mg2" }],
    });
  });

  test("should return a parse error naming the dependency when its type is missing", () => {
    const records = JSON.parse(fixture("bd-show.json")) as { dependencies: object[] }[];
    const dep = records[0]?.dependencies[0] as Record<string, unknown>;
    delete dep.dependency_type;

    const result = parseBdShow(JSON.stringify(records));

    expect(!result.ok && result.error).toMatchObject({
      source: "bd show",
      path: "$[0].dependencies[0].dependency_type",
    });
  });
});

describe("parseBdStatuses", () => {
  test("should list built-in then custom statuses when given real bd statuses --json output", () => {
    const statuses = unwrap(parseBdStatuses(fixture("bd-statuses.json")));

    expect(statuses).toEqual([
      { name: "open", category: "active", builtin: true },
      { name: "in_progress", category: "wip", builtin: true },
      { name: "blocked", category: "wip", builtin: true },
      { name: "deferred", category: "frozen", builtin: true },
      { name: "closed", category: "done", builtin: true },
      { name: "pinned", category: "frozen", builtin: true },
      { name: "hooked", category: "wip", builtin: true },
      { name: "review", category: "wip", builtin: false },
      { name: "uat", category: "wip", builtin: false },
    ]);
  });

  test("should return a parse error when a status has an unknown category", () => {
    const root = JSON.parse(fixture("bd-statuses.json")) as {
      custom_statuses: { category: string }[];
    };
    (root.custom_statuses[1] as { category: string }).category = "someday";

    const result = parseBdStatuses(JSON.stringify(root));

    expect(!result.ok && result.error).toMatchObject({
      source: "bd statuses",
      path: "$.custom_statuses[1].category",
    });
  });
});
