import { describe, expect, test } from "claude-code/testing";
import {
  detailView,
  editArgv,
  type Issue,
  openDetail,
  parseBdHistoryEvents,
  parseBdShow,
  reduceDetail,
} from "../src/index.ts";
import historyMg22 from "./fixtures/bd-history-BU-mg2.2.json.ts";
import historyMg23 from "./fixtures/bd-history-BU-mg2.3.json.ts";
import historyMg2 from "./fixtures/bd-history-BU-mg2.json.ts";
import show from "./fixtures/bd-show.json.ts";
import { allIssues, byId, unwrap } from "./helpers.ts";

// `bd show BU-mg2.3 --json` and `bd history BU-mg2.3 --events --json`.
const epic = (): Issue => {
  const [issue] = unwrap(parseBdShow(show));
  if (issue === undefined) throw new Error("bd show fixture is empty");
  return issue;
};
const epicEvents = () => unwrap(parseBdHistoryEvents(historyMg23));

describe("detailView", () => {
  test("should show every Issue field the store returned when a card's detail is opened", () => {
    const issue = epic();
    const view = detailView(openDetail(issue, epicEvents()), { issues: allIssues(), width: 200 });

    const shown = new Set([
      ...view.fields.map((field) => field.key),
      ...view.markdown.map((block) => block.key),
    ]);
    const returned = Object.keys(issue).filter((key) => key !== "dependencies");
    for (const key of returned) expect([key, shown.has(key)]).toEqual([key, true]);
    expect(view.dependencies).toHaveLength(issue.dependencies.length);
    expect(view.fields.find((field) => field.key === "displayId")?.value).toBe(
      "BU-beads-ui-claude-code-aeyb",
    );
  });

  test("should list each dependency with its display id and status", () => {
    const view = detailView(openDetail(epic(), []), { issues: allIssues(), width: 40 });

    expect(view.dependencies).toEqual([
      {
        id: "BU-mg2",
        displayId: "BU-epic-beads-ui-beads-task-manager-mg2",
        type: "parent-child",
        status: "in_progress",
        title: "EPIC beads-ui: Beads task manager for t…",
      },
    ]);
  });

  test("should mark a dependency's status unknown when neither bd show nor the board has it", () => {
    const issue = { ...epic(), dependencies: [{ type: "blocks", id: "BU-gone" }] };

    const view = detailView(openDetail(issue, []), { width: 40 });

    expect(view.dependencies[0]?.status).toBe("unknown");
  });

  test("should show the history events with a readable summary when bd history returned them", () => {
    const view = detailView(openDetail(epic(), epicEvents()), { width: 60 });

    expect(view.events).toEqual([
      {
        at: "2026-10-21 05:48",
        actor: "Sergei Wallace",
        type: "status_changed",
        summary: "status → in_progress",
      },
      {
        at: "2026-10-14 23:31",
        actor: "Sergei Wallace",
        type: "updated",
        summary: "metadata.display_id → BU-beads-ui-claude-code-aeyb",
      },
      {
        at: "2026-10-14 23:31",
        actor: "Sergei Wallace",
        type: "label_added",
        summary: "Added label: id:BU-beads-ui-claude-code-aeyb",
      },
      { at: "2026-10-14 23:31", actor: "Sergei Wallace", type: "created", summary: "created" },
    ]);
  });

  test("should keep only the newest ten events when bd history returned more", () => {
    const events = [historyMg2, historyMg22, historyMg23].flatMap((text) =>
      unwrap(parseBdHistoryEvents(text)),
    );
    expect(events).toHaveLength(15);

    const view = detailView(openDetail(epic(), events), { width: 60 });

    expect(view.events).toHaveLength(10);
    const shown = view.events.map((event) => event.at);
    expect(shown[0]).toBe("2026-10-21 05:48");
    expect([...shown].sort().reverse()).toEqual(shown);
  });
});

describe("reduceDetail", () => {
  test("should re-read the issue before redrawing when a field write succeeds", () => {
    const opened = openDetail(epic(), epicEvents());

    const saving = reduceDetail(opened, { type: "edit-submitted", field: "title" });
    expect(detailView(saving, { width: 80 }).savingLine).toBe("saving title…");

    const saved = reduceDetail(saving, { type: "edit-succeeded" });
    const waiting = detailView(saved, { width: 80 });
    expect(waiting.reread).toEqual([
      ["bd", "show", "BU-mg2.3", "--json"],
      ["bd", "history", "BU-mg2.3", "--events", "--json"],
    ]);
    expect(waiting.fields[0]?.value).toBe(detailView(opened, { width: 80 }).fields[0]?.value);

    const reread = reduceDetail(saved, {
      type: "reread",
      issue: { ...epic(), title: "beads-ui mod" },
    });
    const redrawn = detailView(reread, { width: 80 });
    expect(redrawn.reread).toBeUndefined();
    expect(redrawn.fields[0]?.value).toBe("beads-ui mod");
  });

  test("should show the exit code and skip the re-read when a field write fails", () => {
    const saving = reduceDetail(openDetail(epic(), []), {
      type: "edit-submitted",
      field: "status",
    });

    const failed = reduceDetail(saving, { type: "edit-failed", exitCode: 13, message: "stale" });

    const view = detailView(failed, { width: 80 });
    expect(view.errorLine).toBe("saving status failed (exit 13): stale");
    expect(view.reread).toBeUndefined();
  });

  test("should ignore a re-read of another issue", () => {
    const opened = openDetail(epic(), []);

    expect(reduceDetail(opened, { type: "reread", issue: byId(allIssues(), "BU-2zw") })).toBe(
      opened,
    );
  });
});

describe("editArgv", () => {
  const task = () => byId(allIssues(), "BU-mg2.3.5");

  test("should write each editable field with bd update in --flag=value form", () => {
    const argv = (edit: Parameters<typeof editArgv>[1]) => unwrap(editArgv(task(), edit)).slice(3);

    expect(argv({ field: "title", value: "Board tab" })).toEqual(["--title=Board tab"]);
    expect(argv({ field: "description", value: "-x" })).toEqual(["--description=-x"]);
    expect(argv({ field: "priority", value: 0 })).toEqual(["--priority=0"]);
    expect(argv({ field: "type", value: "feature" })).toEqual(["--type=feature"]);
    expect(argv({ field: "due", value: "2026-11-02" })).toEqual(["--due=2026-11-02"]);
    expect(argv({ field: "estimate", value: 90 })).toEqual(["--estimate=90"]);
    expect(unwrap(editArgv(task(), { field: "title", value: "x" })).slice(0, 3)).toEqual([
      "bd",
      "update",
      "BU-mg2.3.5",
    ]);
  });

  test("should guard status and assignee writes on the shown value", () => {
    expect(unwrap(editArgv(task(), { field: "status", value: "in_progress" }))).toEqual([
      "bd",
      "update",
      "BU-mg2.3.5",
      "--status",
      "in_progress",
      "--if-status",
      "open",
    ]);
    expect(unwrap(editArgv(task(), { field: "assignee", value: "aih-ec2-3" })).slice(3)).toEqual([
      "--assignee=aih-ec2-3",
      "--if-assignee=",
    ]);
  });

  test("should add and remove labels without touching the id label", () => {
    const issue = task();

    expect(
      unwrap(editArgv(issue, { field: "labels", value: [...issue.labels, "ui"] })).slice(3),
    ).toEqual(["--add-label=ui"]);
  });

  test("should refuse an edit that would add or remove an id label", () => {
    const issue = task();
    for (const value of [[], [...issue.labels, "id:BU-other-abcd"]]) {
      const result = editArgv(issue, { field: "labels", value });
      expect(!result.ok && result.error.kind).toBe("display-id-label");
    }
  });

  test("should refuse an unchanged or invalid value instead of writing it", () => {
    const issue = task();
    const kinds = [
      editArgv(issue, { field: "title", value: issue.title }),
      editArgv(issue, { field: "status", value: "open" }),
      editArgv(issue, { field: "title", value: "  " }),
      editArgv(issue, { field: "priority", value: 7 }),
      editArgv(issue, { field: "due", value: "next week" }),
      editArgv(issue, { field: "estimate", value: -5 }),
      editArgv(issue, { field: "status", value: "-s" }),
    ].map((result) => !result.ok && result.error.kind);

    expect(kinds).toEqual([
      "no-change",
      "no-change",
      "invalid-value",
      "invalid-value",
      "invalid-value",
      "invalid-value",
      "invalid-value",
    ]);
  });
});
