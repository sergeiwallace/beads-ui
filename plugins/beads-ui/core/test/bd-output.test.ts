import { describe, expect, test } from "claude-code/testing";
import {
  parseBdCreatedId,
  parseBdDeletePreview,
  parseBdHistoryEvents,
  parseBdReady,
  parseBdShow,
} from "../src/index.ts";
import cascadePreview from "./fixtures/bd/delete-cascade-dry-run-json.ts";
import refusedPreview from "./fixtures/bd/delete-dry-run-dependents-json.ts";
import historyMg22 from "./fixtures/bd/history-BU-mg2.2.ts";
import ready from "./fixtures/bd/ready.ts";
import show5 from "./fixtures/bd/show-BU-mg2.3.5.ts";
import { unwrap } from "./helpers.ts";

function errorOf(result: { ok: boolean; error?: { source: string; path: string } }) {
  expect(result.ok).toBe(false);
  return result.error;
}

describe("parseBdShow dependency records", () => {
  test("should keep each dependency's status and title when bd show embeds the record", () => {
    const [issue] = unwrap(parseBdShow(show5));

    expect(issue?.dependencies).toEqual([
      {
        type: "parent-child",
        id: "BU-mg2.3",
        status: "in_progress",
        title:
          "beads-ui Claude Code mod: the task manager inside the Claude Code TUI, with mouse control",
      },
    ]);
  });

  test("should return a parse error when an embedded dependency's status is not a string", () => {
    const records = JSON.parse(show5) as { dependencies: Record<string, unknown>[] }[];
    (records[0]?.dependencies[0] as Record<string, unknown>).status = 3;

    const error = errorOf(parseBdShow(JSON.stringify(records)));

    expect(error?.path).toBe("$[0].dependencies[0].status");
  });
});

describe("parseBdReady", () => {
  test("should return the ready issues when given real bd ready --json output", () => {
    const issues = unwrap(parseBdReady(ready));

    expect(issues.map((issue) => issue.id)).toContain("BU-mg2.3.5");
    expect(issues).toHaveLength(20);
  });

  test("should return a typed parse error naming bd ready when the output is not JSON", () => {
    const error = errorOf(parseBdReady("Error: database locked\n"));

    expect([error?.source, error?.path]).toEqual(["bd ready", "$"]);
  });
});

describe("parseBdHistoryEvents", () => {
  test("should map every event when given real bd history --events --json output", () => {
    const events = unwrap(parseBdHistoryEvents(historyMg22));

    expect(events.map((event) => event.type)).toEqual([
      "closed",
      "updated",
      "status_changed",
      "created",
      "updated",
      "label_added",
    ]);
    expect(events[0]).toEqual({
      id: "bc4d6413-9fae-5eeb-9237-dd1f34761fae",
      issueId: "BU-mg2.2",
      type: "closed",
      actor: "aih-ec2-3",
      createdAt: "2026-10-21T04:26:53Z",
      newValue: "Design approved by Sergei 2026-10-21; decisions recorded in beads-ui #14",
    });
    expect(events[5]?.comment).toBe("Added label: id:BU-doc-beads-ui-prd-fnzx");
  });

  test("should name the field when an event has no event_type", () => {
    const records = JSON.parse(historyMg22) as Record<string, unknown>[];
    delete (records[1] as Record<string, unknown>).event_type;

    const error = errorOf(parseBdHistoryEvents(JSON.stringify(records)));

    expect([error?.source, error?.path]).toEqual(["bd history", "$[1].event_type"]);
  });
});

describe("parseBdDeletePreview", () => {
  test("should read the cascade counts when given real bd delete --cascade --dry-run --json output", () => {
    expect(unwrap(parseBdDeletePreview(cascadePreview))).toEqual({
      issueIds: ["BU-mg2.3"],
      cascade: true,
      wouldDelete: 11,
      wouldOrphan: 0,
      wouldRemoveDependencies: 11,
      wouldRemoveEvents: 34,
      wouldRemoveLabels: 11,
    });
  });

  test("should return bd's refusal text when the dry run found dependents outside the set", () => {
    const result = parseBdDeletePreview(refusedPreview);

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "parse-error",
        source: "bd delete",
        path: "$.error",
        message:
          "issue BU-mg2.3 has dependents not in deletion set; use --cascade to delete them or --force to orphan them",
      },
    });
  });
});

describe("parseBdCreatedId", () => {
  test("should return the new hash id when bd create --json returns the issue", () => {
    const [record] = JSON.parse(show5) as object[];

    expect(unwrap(parseBdCreatedId(JSON.stringify(record)))).toBe("BU-mg2.3.5");
  });

  test("should return a parse error when the create output carries no id", () => {
    const error = errorOf(parseBdCreatedId('{"title":"x"}'));

    expect([error?.source, error?.path]).toEqual(["bd create", "$.id"]);
  });
});
