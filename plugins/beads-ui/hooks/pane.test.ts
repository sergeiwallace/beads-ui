import type { On, RenderSurface } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect, test } from "claude-code/testing";

import {
  asOf,
  clockStamp,
  type Issue,
  parseBdHistoryEvents,
  parseBdList,
  parseBdShow,
  sortIssues,
} from "../core/src/index.ts";
import historyMg23 from "../core/test/fixtures/bd-history-BU-mg2.3.json.ts";
import list from "../core/test/fixtures/bd-list-all-brief.json.ts";
import show from "../core/test/fixtures/bd-show.json.ts";
import minted from "../core/test/fixtures/bd-show-minted.json.ts";
import statusesFixture from "../core/test/fixtures/bd-statuses.json.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import {
  CWD,
  exit,
  HANG,
  Killed,
  ok,
  onBoard,
  PANE_PROPS,
  RUN_OUTPUT_LIMIT,
  SESSION,
  SHOW,
  START_MS,
  SURFACES,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

const issues = (): Issue[] => {
  const parsed = parseBdList(list);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
};
const STAMP = asOf(clockStamp(START_MS, new Date(START_MS).getTimezoneOffset()));
const COLUMN_ORDER = [
  "open 20",
  "in_progress 2",
  "blocked 0",
  "hooked 0",
  "review 0",
  "uat 0",
  "deferred 0",
  "pinned 0",
  "closed 8",
];

/** A session in this repository with the pane opened by /show-beads-ui and drawn on `surface`. */
async function openPane(
  $: Engine,
  on: On,
  options: WorldOptions = {},
  surface: RenderSurface = "terminal",
) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const ui = await $.ui
    .mount({
      plugin: PLUGIN_NAME,
      surface,
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    })
    .then(onBoard);
  return { w, ui };
}

type Mounted = Awaited<ReturnType<typeof openPane>>["ui"];

const keysOf = async (ui: Mounted, prefix: string, type = "Box") =>
  (await ui.findAll({ type }))
    .map((element) => element.key ?? "")
    .filter((key) => key.startsWith(prefix));

// A store of 600 issues, a third each open, in progress and closed, spread over `assignees`:
// bd's own records, renamed, from the first record of `bd list --json --all --brief --limit 0`.
const largeStore = (assignees: number) => {
  const [first] = JSON.parse(list) as Record<string, unknown>[];
  return Array.from({ length: 600 }, (_, i) => ({
    ...first,
    id: `BU-load${i}`,
    title: `issue number ${i} with a title long enough to fill a card`,
    status: ["open", "in_progress", "closed"][i % 3],
    metadata: { display_id: `BU-issue-number-${i}-load` },
    labels: [`id:BU-issue-number-${i}-load`],
    assignee: `aih-ec2-${i % assignees}`,
  }));
};
/** The cards the board draws from a store: each issue not closed, and the newest 25 closed. */
const drawnMoves = (rows: readonly Record<string, unknown>[]) =>
  [
    ...rows.filter((row) => row.status !== "closed"),
    ...rows
      .filter((row) => row.status === "closed")
      .sort((a, b) => String(b.closed_at ?? "").localeCompare(String(a.closed_at ?? "")))
      .slice(0, 25),
  ]
    .map((row) => `move:${String(row.id)}`)
    .sort();

// A walk over every page of a 600-card store: about 0.7 s on an idle host, past the kit's default
// 5,000 ms on a loaded one (measured 2026-10-21), so it gets room that does not depend on load.
const WALK = { timeoutMs: 30_000 };

const openLarge = ($: Engine, on: On, assignees: number) =>
  openPane($, on, {
    script: (key) =>
      key === "bd list --all --brief --limit 0"
        ? ok(JSON.stringify(largeStore(assignees)))
        : undefined,
  });

describe("the Board tab", () => {
  for (const surface of SURFACES) {
    test(`should render one column per bd status in category order with its count when the pane opens on ${surface}`, async ($, on) => {
      const { ui } = await openPane($, on, {}, surface);

      const headers = await keysOf(ui, "column::");
      const texts = await Promise.all(headers.map(async (key) => (await ui.find({ key }))?.text));

      expect(texts).toEqual(COLUMN_ORDER);
      expect((await ui.find({ key: "header" }))?.text).toContain(STAMP);
      expect((await ui.find({ key: "header" }))?.text).toContain("beads-ui");
    });
  }

  test("should give every card a Move to control when the board is drawn", async ($, on) => {
    const { ui } = await openPane($, on);

    const cards = await keysOf(ui, "card:");
    const moves = await keysOf(ui, "move:", "Select");

    expect(cards.length).toBe(30);
    expect(moves).toEqual(cards.map((key) => key.replace(/^card:/, "move:")));
    const select = await ui.find({ key: "move:BU-2zw" });
    expect(select?.props.label).toBe("Move to");
    expect(select?.props.value).toBe("open");
  });

  test("should run bd update with --if-status on the shown status when a Move to status is picked", async ($, on) => {
    const { w, ui } = await openPane($, on);

    await ui.select({ key: "move:BU-2zw", value: "in_progress" });
    await w.clock.settle();

    const update = w.runs.find((argv) => argv[1] === "update");
    expect(update?.slice(0, 7)).toEqual([
      "bd",
      "update",
      "BU-2zw",
      "--status",
      "in_progress",
      "--if-status",
      "open",
    ]);
  });

  test("should restore the card, show a conflict line and refresh that issue when bd exits 13", async ($, on) => {
    const { w, ui } = await openPane($, on, {
      script: (key) =>
        key.startsWith("bd update BU-mg2.3 --status review")
          ? exit(13, "status changed: expected in_progress")
          : undefined,
    });
    const before = w.keys().length;

    await ui.select({ key: "move:BU-mg2.3", value: "review" });
    await w.clock.settle();

    expect((await ui.find({ key: "move:BU-mg2.3" }))?.props.value).toBe("in_progress");
    // The side nav takes 14 of the 117 columns, so the card's display id is cut in its column.
    expect((await ui.find({ key: "group::wip" }))?.text).toContain("BU-beads-ui-claude-code");
    expect((await ui.find({ key: "conflict-line" }))?.text).toBe(
      "BU-mg2.3 changed elsewhere before the move to review; restored to in_progress and refreshed",
    );
    expect(w.keys().slice(before)).toContain("bd show BU-mg2.3");
  });

  test("should draw one row per distinct assignee plus an unassigned row when the swimlane is assignee", async ($, on) => {
    const { ui } = await openPane($, on);

    await ui.press({ key: "swimlane" });

    expect(await keysOf(ui, "lane:")).toEqual(["lane:aih-3", "lane:aih-ec2-3", "lane:-"]);
    expect((await ui.find({ key: "lane:-" }))?.text).toContain("unassigned");
    expect((await ui.find({ key: "swimlane" }))?.props.label).toBe("Swimlane: assignee");
  });

  test("should keep the last board, show the exit code and retry when bd list fails", async ($, on) => {
    let failing = false;
    const { w, ui } = await openPane($, on, {
      script: (key) =>
        failing && key === "bd list --all --brief --limit 0"
          ? exit(1, "Error: database is locked")
          : undefined,
    });

    failing = true;
    await w.clock.advance(10_000);

    expect((await ui.find({ key: "error-line" }))?.text).toBe(
      `bd list failed (exit 1): Error: database is locked; showing the board ${STAMP}; retrying on the next refresh`,
    );
    expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
    expect(await keysOf(ui, "card:")).toHaveLength(30);

    failing = false;
    await w.clock.advance(10_000);

    expect(await ui.find({ key: "error-line" })).toBeUndefined();
  });

  test("should keep the last board and say it timed out when bd list does not answer", async ($, on) => {
    let hanging = false;
    const { w, ui } = await openPane($, on, {
      script: (key) => (hanging && key === "bd list --all --brief --limit 0" ? HANG : undefined),
    });

    hanging = true;
    await w.clock.advance(10_000);
    await w.clock.advance(8_000);

    expect((await ui.find({ key: "error-line" }))?.text).toBe(
      `bd list did not finish: timed out after 8000 ms; showing the board ${STAMP}; retrying on the next refresh`,
    );
    expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
  });

  test("should name bd statuses, not bd list, when the first bd statuses read fails", async ($, on) => {
    const { ui } = await openPane($, on, {
      script: (key) => (key === "bd statuses" ? exit(1, "Error: database is locked") : undefined),
    });

    expect((await ui.find({ key: "error-line" }))?.text).toBe(
      "bd statuses failed (exit 1): Error: database is locked; retrying on the next refresh",
    );
  });

  test("should keep the last board and name the signal when bd list is killed partway through its output", async ($, on) => {
    let killing = false;
    const { w, ui } = await openPane($, on, {
      script: (key) =>
        killing && key === "bd list --all --brief --limit 0"
          ? new Killed("SIGKILL", ok(list.slice(0, list.length / 2)))
          : undefined,
    });

    killing = true;
    await w.clock.advance(10_000);

    expect((await ui.find({ key: "error-line" }))?.text).toBe(
      `bd list did not finish: stopped by SIGKILL; showing the board ${STAMP}; retrying on the next refresh`,
    );
    expect(await keysOf(ui, "card:")).toHaveLength(30);
  });

  test("should say what bd list wrote cannot be read, not that it failed, when it exits 0 with broken JSON", async ($, on) => {
    const { ui } = await openPane($, on, {
      script: (key) =>
        key === "bd list --all --brief --limit 0" ? ok(list.slice(0, 1000)) : undefined,
    });

    expect((await ui.find({ key: "error-line" }))?.text).toMatch(
      /^bd list gave output beads-ui cannot read: .+ at \$; retrying on the next refresh$/,
    );
  });

  // The store this bug was found on (ai-harness, 2026-10-23): bd list --json --all --brief
  // --limit 0 wrote 7,141,443 bytes for 6964 issues, past the 4194304 $.process.run keeps.
  const STORE_ISSUES = 6964;
  const sevenMegabyteStore = () => {
    const [first] = JSON.parse(list) as Record<string, unknown>[];
    return Array.from({ length: STORE_ISSUES }, (_, i) => ({
      ...first,
      id: `BU-big${i}`,
      title: `issue number ${i} with a title long enough to fill a card`,
      status: ["open", "closed", "closed"][i % 3],
      close_reason: `closed by the run that landed issue ${i}: `.padEnd(2_000, "x"),
      metadata: { display_id: `BU-issue-number-${i}-big` },
      labels: [`id:BU-issue-number-${i}-big`],
    }));
  };

  test(
    "should load the board from the open issues past the 4 MiB $.process.run keeps and the newest closed page, and reach every card it draws",
    { timeoutMs: 300_000 },
    async ($, on) => {
      const rows = sevenMegabyteStore();
      const store = JSON.stringify(rows);
      const open = JSON.stringify(rows.filter((row) => row.status !== "closed"));
      expect(open.length).toBeGreaterThan(RUN_OUTPUT_LIMIT);

      const { ui } = await openPane($, on, {
        script: (key) => (key === "bd list --all --brief --limit 0" ? ok(store) : undefined),
      });

      expect(await ui.find({ key: "error-line" })).toBeUndefined();
      expect((await ui.find({ key: "column::open" }))?.text).toBe("open 2322");
      // 4642 closed in the store: the board reads one done page of them, never all.
      expect((await ui.find({ key: "column::closed" }))?.text).toBe("closed 25");
      const { moves, largest } = await walkBoard(ui);
      expect(moves).toEqual(drawnMoves(rows));
      expect(moves).toHaveLength(2322 + 25);
      expect(largest).toBeLessThan(100_000);
    },
  );

  const everyMove = drawnMoves(largeStore(1));
  const allMoves = Array.from({ length: 600 }, (_, i) => `move:BU-load${i}`).sort();

  /**
   * Walks the board as a person would: on each lane page, steps every paged cell through all of
   * its pages with its more control and back round to the first, then takes the next lane page.
   * Returns every Move to control it met and the largest drawing it saw.
   */
  async function walkBoard(ui: Mounted) {
    const moves = new Set<string>();
    let largest = 0;
    const look = async () => {
      largest = Math.max(largest, JSON.stringify(await ui.drawn()).length);
      for (const key of await keysOf(ui, "move:", "Select")) moves.add(key);
    };
    const firstPage = (await ui.find({ key: "lane-pager" }))?.text;
    for (let lanePage = 0; lanePage < 50; lanePage++) {
      await look();
      for (const pager of await keysOf(ui, "pager:")) {
        const cell = pager.slice("pager:".length);
        const range = /(\d+)-(\d+) of (\d+)/.exec((await ui.find({ key: pager }))?.text ?? "");
        const [from, to, total] = (range ?? []).slice(1).map(Number);
        const pages = Math.ceil((total ?? 0) / ((to ?? 0) - (from ?? 0) + 1));
        for (let step = 1; step < pages; step++) {
          await ui.press({ key: `next:${cell}` });
          await look();
        }
        await ui.press({ key: `next:${cell}` });
        expect((await ui.find({ key: pager }))?.text).toContain(`1-${to} of ${total}`);
      }
      if ((await ui.find({ key: "lanes-next" })) === undefined) break;
      await ui.press({ key: "lanes-next" });
      // Back round to the first lane page: every page's range differs, a column window's too.
      if ((await ui.find({ key: "lane-pager" }))?.text === firstPage) break;
    }
    return { moves: [...moves].sort(), largest };
  }

  test(
    "should reach a Move to control for every card by paging each column when the store is large",
    WALK,
    async ($, on) => {
      const { ui } = await openLarge($, on, 1);

      expect((await ui.find({ key: "column::open" }))?.text).toBe("open 200");
      expect((await ui.find({ key: "pager::open" }))?.text).toContain("1-25 of 200");
      expect((await ui.find({ key: "next::open" }))?.props.label).toBe("+175 more");

      const { moves, largest } = await walkBoard(ui);

      expect(moves).toEqual(everyMove);
      expect(largest).toBeLessThan(100_000);
    },
  );

  test(
    "should reach every card's Move to through lane pages when the assignee lanes outgrow one drawing",
    WALK,
    async ($, on) => {
      // 200 assignees, three cards each: the most lanes, and so the most column headers, per card.
      const { ui } = await openLarge($, on, 200);
      await ui.press({ key: "swimlane" });

      expect((await ui.find({ key: "lane-pager" }))?.text).toMatch(/^back\s*lanes 1-\d+ of 201/);

      const { moves, largest } = await walkBoard(ui);

      expect(moves).toEqual(everyMove);
      expect(largest).toBeLessThan(100_000);
    },
  );

  test(
    "should reach every card's Move to within the drawing limit when the store has 30 custom statuses of 40 characters",
    { timeoutMs: 120_000 },
    async ($, on) => {
      // bd statuses for this store with 30 custom statuses of 40 characters beside its own, and
      // the 600 cards spread over all 30: every card's Move to carries 39 statuses.
      const custom = Array.from({ length: 30 }, (_, i) => ({
        category: ["active", "wip", "done", "frozen"][i % 4],
        name: `custom-status-${String(i).padStart(2, "0")}-`.padEnd(40, "x"),
      }));
      const store = JSON.parse(statusesFixture) as { custom_statuses: unknown[] };
      const withCustom = JSON.stringify({
        ...store,
        custom_statuses: [...store.custom_statuses, ...custom],
      });
      const cards = largeStore(1).map((record, i) => ({
        ...record,
        status: custom[i % 30]?.name,
      }));
      const { ui } = await openPane($, on, {
        script: (key) =>
          key === "bd statuses"
            ? ok(withCustom)
            : key === "bd list --all --brief --limit 0"
              ? ok(JSON.stringify(cards))
              : undefined,
      });

      expect((await ui.find({ key: "lane-pager" }))?.text).toMatch(/lanes 1-1 of 1, columns 1-/);
      const options = (await ui.findAll({ type: "Select" }))[0]?.props.options as unknown[];
      expect(options).toHaveLength(9 + 30);

      const { moves, largest } = await walkBoard(ui);

      expect(moves).toEqual(allMoves);
      expect(largest).toBeLessThan(100_000);
    },
  );

  // The kit answers the mod's own $.ui.focus inside the mounted drawing without raising it to the
  // test's hooks, so the focus ring itself is checked in the live run. This test shows the card p
  // and b act on follows onto the page they open: the second p steps the same column again.
  test("should step the focused card's column with p and b, acting on the new page's card after each step", async ($, on) => {
    const { w, ui } = await openLarge($, on, 1);
    await $.ui.focus({
      component: "Pane",
      requestId: PANE_ID,
      plugin: PLUGIN_NAME,
      element: "move:BU-load0",
      origin: { kind: "person" },
    } as never);
    const pager = async () => (await ui.find({ key: "pager::open" }))?.text ?? "";

    await ui.press({ key: "page-next" });
    await w.clock.settle();
    expect(await pager()).toContain("26-50 of 200");
    expect(await keysOf(ui, "move:", "Select")).not.toContain("move:BU-load0");

    await ui.press({ key: "page-next" });
    await w.clock.settle();
    expect(await pager()).toContain("51-75 of 200");

    await ui.press({ key: "page-back" });
    await ui.press({ key: "page-back" });
    await w.clock.settle();
    expect(await pager()).toContain("1-25 of 200");
    expect(await keysOf(ui, "move:", "Select")).toContain("move:BU-load0");
    expect(await ui.find({ key: "notice" })).toBeUndefined();
  });

  test("should name what to do and step nothing when p is pressed with no card focused", async ($, on) => {
    const { ui } = await openLarge($, on, 1);

    await ui.press({ key: "page-next" });

    expect((await ui.find({ key: "notice" }))?.text).toBe(
      "focus a card first: Tab moves between cards",
    );
    expect((await ui.find({ key: "pager::open" }))?.text).toContain("1-25 of 200");
  });
});

describe("the focus hint", () => {
  const HINT = "focus a card first: Tab moves between cards";

  test("should clear the focus hint when a card's detail then opens", async ($, on) => {
    const { w, ui } = await openPane($, on);

    await ui.press({ key: "detail" });
    expect((await ui.find({ key: "notice" }))?.text).toBe(HINT);

    await ui.press({ key: "open:BU-mg2.3" });
    await w.clock.settle();

    expect(await ui.find({ key: "edit:title" })).toBeDefined();
    expect(await ui.find({ key: "notice" })).toBeUndefined();
  });

  test("should clear the focus hint when the tab switches to the Backlog or the Board", async ($, on) => {
    const { ui } = await openPane($, on);

    await ui.press({ key: "delete" });
    expect((await ui.find({ key: "notice" }))?.text).toBe(HINT);
    await ui.press({ key: "tab:backlog" });
    expect(await ui.find({ key: "notice" })).toBeUndefined();

    await ui.press({ key: "tab:detail" });
    await ui.press({ key: "move" });
    expect((await ui.find({ key: "notice" }))?.text).toBe(HINT);
    await ui.press({ key: "tab:board" });
    expect(await ui.find({ key: "notice" })).toBeUndefined();
  });
});

describe("the Backlog tab", () => {
  const openIds = () =>
    sortIssues(issues().filter((issue) => issue.status === "open")).map((issue) => issue.id);

  test(
    "should reach the last open issue by paging the list when the store has more than a page",
    WALK,
    async ($, on) => {
      const parsed = parseBdList(JSON.stringify(largeStore(1)));
      const open = sortIssues(
        (parsed.ok ? parsed.value : []).filter((issue) => issue.status === "open"),
      ).map((issue) => `row:${issue.id}`);
      const { ui } = await openLarge($, on, 1);
      await ui.press({ key: "tab:backlog" });
      const seen: string[] = [];
      let largest = 0;

      expect((await ui.find({ key: "backlog-count" }))?.text).toContain("200 of 200 open issues");
      expect((await ui.find({ key: "backlog-pager" }))?.text).toContain("rows 1-60 of 200");
      for (let page = 0; page < 4; page++) {
        largest = Math.max(largest, JSON.stringify(await ui.drawn()).length);
        seen.push(...(await keysOf(ui, "row:")));
        await ui.press({ key: "backlog-next" });
      }

      expect(seen).toEqual(open);
      expect(seen.at(-1)).toBe(open.at(-1));
      expect(largest).toBeLessThan(100_000);
      expect((await ui.find({ key: "backlog-pager" }))?.text).toContain("rows 1-60 of 200");
    },
  );

  test("should step the list with p and b on the Backlog tab", async ($, on) => {
    const { w, ui } = await openLarge($, on, 1);
    await ui.press({ key: "tab:backlog" });

    await ui.press({ key: "page-back" });
    await w.clock.settle();
    expect((await ui.find({ key: "backlog-pager" }))?.text).toContain("rows 181-200 of 200");

    await ui.press({ key: "page-next" });
    await w.clock.settle();
    expect((await ui.find({ key: "backlog-pager" }))?.text).toContain("rows 1-60 of 200");
  });

  test("should list open issues by priority then created date when the Backlog tab renders", async ($, on) => {
    const { ui } = await openPane($, on);

    await ui.press({ key: "tab:backlog" });

    expect(await keysOf(ui, "row:")).toEqual(openIds().map((id) => `row:${id}`));
  });

  test("should honour the type, label, assignee and ready predicates when a filter is entered", async ($, on) => {
    const { ui } = await openPane($, on);
    await ui.press({ key: "tab:backlog" });
    const rows = async (text: string) => {
      await ui.input({ key: "filter", text });
      return (await keysOf(ui, "row:")).map((key) => key.slice(4));
    };

    expect(await rows("type:bug ready:true")).toEqual(["BU-2zw"]);
    expect(await rows("label:id:BU-t-1-2-backlog-tab-vptb")).toEqual(["BU-mg2.3.6"]);
    expect(await rows("assignee:aih-3")).toEqual([]);
    expect(await rows("type:epic")).toEqual(
      sortIssues(issues().filter((issue) => issue.status === "open" && issue.type === "epic")).map(
        (issue) => issue.id,
      ),
    );
  });

  test("should keep exactly the open issues assigned to that person when an assignee filter is entered", async ($, on) => {
    // The store with two open issues claimed by aih-ec2-3; the fixture's open issues have no assignee.
    const claimed = new Set(["BU-2zw", "BU-mg2.3.6"]);
    const assigned = (JSON.parse(list) as Record<string, unknown>[]).map((record) =>
      claimed.has(String(record.id)) ? { ...record, assignee: "aih-ec2-3" } : record,
    );
    const { ui } = await openPane($, on, {
      script: (key) =>
        key === "bd list --all --brief --limit 0" ? ok(JSON.stringify(assigned)) : undefined,
    });
    await ui.press({ key: "tab:backlog" });

    await ui.input({ key: "filter", text: "assignee:aih-ec2-3" });

    expect((await keysOf(ui, "row:")).map((key) => key.slice(4))).toEqual(
      sortIssues(issues().filter((issue) => claimed.has(issue.id))).map((issue) => issue.id),
    );
    expect((await ui.find({ key: "backlog-count" }))?.text).toContain("2 of 20 open issues");
  });

  test("should show the accepted keys and keep the list when the filter has an unknown key", async ($, on) => {
    const { ui } = await openPane($, on);
    await ui.press({ key: "tab:backlog" });
    await ui.input({ key: "filter", text: "type:bug" });
    const before = await keysOf(ui, "row:");

    await ui.input({ key: "filter", text: "kind:epic" });

    expect((await ui.find({ key: "filter-line" }))?.text).toBe(
      'unknown filter key "kind"; accepted keys: type, label, assignee, sprint, ready',
    );
    expect(await keysOf(ui, "row:")).toEqual(before);
  });

  test("should reorder the rows when the sort is stepped with o", async ($, on) => {
    const { ui } = await openPane($, on);
    await ui.press({ key: "tab:backlog" });

    await ui.press({ key: "sort" });

    const byCreated = sortIssues(
      issues().filter((issue) => issue.status === "open"),
      { key: "created", direction: "desc" },
    ).map((issue) => `row:${issue.id}`);
    expect(await keysOf(ui, "row:")).toEqual(byCreated);
    expect((await ui.find({ key: "sort" }))?.props.label).toBe("Sort: created:desc");
  });
});

describe("the Detail tab", () => {
  const epic = (): Issue => {
    const parsed = parseBdShow(show);
    const issue = parsed.ok ? parsed.value[0] : undefined;
    if (issue === undefined) throw new Error("no bd show fixture");
    return issue;
  };

  for (const surface of SURFACES) {
    test(`should show the issue's fields, dependencies and last ten events when a card's detail opens on ${surface}`, async ($, on) => {
      const { w, ui } = await openPane($, on, {}, surface);

      await ui.press({ key: "open:BU-mg2.3" });
      await w.clock.settle();

      const issue = epic();
      expect((await ui.find({ key: "edit:title" }))?.props.value).toBe(issue.title);
      expect((await ui.find({ key: "field:displayId" }))?.text).toBe(
        "Display id: BU-beads-ui-claude-code-aeyb",
      );
      expect((await ui.find({ key: "field:createdAt" }))?.text).toBe(`Created: ${issue.createdAt}`);
      expect((await ui.find({ key: "md:description" }))?.text).toContain("The first surfa");
      expect(await keysOf(ui, "dep:")).toHaveLength(issue.dependencies.length);
      expect((await ui.find({ key: `dep:${issue.dependencies[0]?.id}` }))?.text).toContain(
        issue.dependencies[0]?.status ?? "",
      );
      const events = parseBdHistoryEvents(historyMg23);
      expect((await keysOf(ui, "event:")).length).toBe(
        Math.min(10, events.ok ? events.value.length : -1),
      );
      expect(w.keys()).toContain("bd history BU-mg2.3 --events");
    });
  }

  test("should name the 4 MiB cut when an issue's history passes what $.process.run keeps", async ($, on) => {
    const { w, ui } = await openPane($, on, {
      script: (key) =>
        key === "bd history BU-mg2.3 --events"
          ? ok(`[${'{"kind":"x"},'.repeat(RUN_OUTPUT_LIMIT / 10)}]`)
          : undefined,
    });

    await ui.press({ key: "open:BU-mg2.3" });
    await w.clock.settle();

    expect((await ui.find({ key: "detail-error" }))?.text).toBe(
      "bd history BU-mg2.3 failed: its output passed the 4 MiB $.process.run keeps and was cut short",
    );
  });

  test("should write an edited field with bd update and re-read the issue before redrawing", async ($, on) => {
    const { w, ui } = await openPane($, on);
    await ui.press({ key: "open:BU-mg2.3" });
    await w.clock.settle();
    const before = w.keys().length;

    await ui.input({ key: "edit:title", text: "beads-ui Claude Code mod" });
    await w.clock.settle();

    const after = w.keys().slice(before);
    const write = after.indexOf("bd update BU-mg2.3 --title=beads-ui Claude Code mod");
    expect(write).toBeGreaterThanOrEqual(0);
    expect(after.slice(write + 1)).toContain("bd show BU-mg2.3");
    expect(after.slice(write + 1)).toContain("bd history BU-mg2.3 --events");
  });

  test("should edit a multi-line description through its one-line control and write it back exactly", async ($, on) => {
    const description =
      "Board, backlog and detail.\n\n- keyboard Move to\n- C:\\new is not a break\n";
    const [record] = JSON.parse(show) as Record<string, unknown>[];
    const { w, ui } = await openPane($, on, {
      script: (key) =>
        key === "bd show BU-mg2.3" ? ok(JSON.stringify([{ ...record, description }])) : undefined,
    });
    await ui.press({ key: "open:BU-mg2.3" });
    await w.clock.settle();
    const control = await ui.find({ key: "edit:description" });
    const shown = String(control?.props.value);
    const before = w.keys().length;

    expect((await ui.find({ key: "label:description" }))?.text).toBe("Description:");
    expect(shown).toBe(
      "Board, backlog and detail.\\n\\n- keyboard Move to\\n- C:\\\\new is not a break\\n",
    );
    expect((await ui.find({ key: "md:description" }))?.text).toContain("keyboard Move to");

    await ui.input({ key: "edit:description", text: shown });
    await w.clock.settle();
    expect(w.runs.slice(before).some((argv) => argv[1] === "update")).toBe(false);
    expect((await ui.find({ key: "detail-error" }))?.text).toBe("description is unchanged");

    await ui.input({ key: "edit:description", text: `${shown}- inline edit` });
    await w.clock.settle();

    const runs = w.runs.slice(before);
    const write = runs.findIndex((argv) => argv[1] === "update");
    expect(runs[write]).toEqual([
      "bd",
      "update",
      "BU-mg2.3",
      `--description=${description}- inline edit`,
      "--json",
    ]);
    expect(runs.slice(write + 1).map((argv) => argv.join(" "))).toContain(
      "bd show BU-mg2.3 --json",
    );
  });

  test("should show the reason and write nothing when an edit cannot be read", async ($, on) => {
    const { w, ui } = await openPane($, on);
    await ui.press({ key: "open:BU-mg2.3" });
    await w.clock.settle();
    const before = w.keys().length;

    await ui.input({ key: "edit:estimate", text: "soon" });

    expect((await ui.find({ key: "detail-error" }))?.text).toBe(
      "an estimate is minutes, such as 90 or 1h 30m",
    );
    expect(
      w
        .keys()
        .slice(before)
        .some((key) => key.startsWith("bd update")),
    ).toBe(false);
  });
});

describe("quick-add", () => {
  // BU-2zw as bd create --json would return it: its record from `bd show ... BU-2zw --json`.
  const created = () =>
    JSON.stringify((JSON.parse(minted) as { id: string }[]).find((one) => one.id === "BU-2zw"));
  // The store as it stood before BU-2zw existed: the list without it.
  const before = () =>
    JSON.stringify((JSON.parse(list) as { id: string }[]).filter((one) => one.id !== "BU-2zw"));
  const LINE =
    "npm audit: 10 dev-only advisories under markdownlint-cli2 p3 type:bug @aih-3 +ci due:2026-11-01 sprint:s1";
  const script = (key: string) =>
    key === "bd list --all --brief --limit 0"
      ? ok(before())
      : key.startsWith("bd create ")
        ? ok(created())
        : undefined;

  test("should create the issue with the bd create flags each token names when a line is submitted", async ($, on) => {
    const { w, ui } = await openPane($, on, { script });

    await ui.input({ key: "quickadd", text: LINE });
    await w.clock.settle();

    expect(w.runs.find((argv) => argv[1] === "create")).toEqual([
      "bd",
      "create",
      "--title=npm audit: 10 dev-only advisories under markdownlint-cli2",
      "--priority=3",
      "--type=bug",
      "--assignee=aih-3",
      "--labels=ci,sprint:s1",
      "--due=2026-11-01",
      "--json",
    ]);
  });

  test("should mint the display id bd-new minted and write it when the store uses display ids", async ($, on) => {
    const { w, ui } = await openPane($, on, { script });

    await ui.input({ key: "quickadd", text: LINE });
    await w.clock.settle();

    expect(w.runs.find((argv) => argv[1] === "update")).toEqual([
      "bd",
      "update",
      "BU-2zw",
      "--set-metadata",
      "display_id=BU-npm-audit-10-dev-only-advisories-2zw",
      "--add-label",
      "id:BU-npm-audit-10-dev-only-advisories-2zw",
      "--json",
    ]);
    expect((await ui.find({ key: "notice" }))?.text).toBe(
      "created BU-2zw as BU-npm-audit-10-dev-only-advisories-2zw",
    );
  });

  test("should mint under bd-new's slug budget override when the session sets one", async ($, on) => {
    const { w, ui } = await openPane($, on, {
      script,
      env: { HOME: "/home/me", AIH_SLUG_BODY_MAX_CHARS: "12", AIH_SLUG_BODY_MAX_CHARS_CHILD: "8" },
    });

    await ui.input({ key: "quickadd", text: LINE });
    await w.clock.settle();

    expect(w.keys()).toContain(
      "bd update BU-2zw --set-metadata display_id=BU-npm-audit-10-2zw --add-label id:BU-npm-audit-10-2zw",
    );
    expect((await ui.find({ key: "notice" }))?.text).toBe("created BU-2zw as BU-npm-audit-10-2zw");
  });

  // The store once bd create has run and before the display id is written: BU-2zw as bd lists it,
  // without its metadata.display_id and id: label.
  const MINTED = "BU-npm-audit-10-dev-only-advisories-2zw";
  const ATTACH = `bd update BU-2zw --set-metadata display_id=${MINTED} --add-label id:${MINTED}`;
  const unattached = () =>
    JSON.stringify(
      (JSON.parse(list) as Record<string, unknown>[]).map((record) =>
        record.id === "BU-2zw" ? { ...record, metadata: {}, labels: [] } : record,
      ),
    );
  // `bd show BU-2zw --json` as the retry re-reads it just before its write, with `change` applied.
  const SHOW = "bd show BU-2zw";
  const shownWith = (change: Record<string, unknown>) =>
    JSON.stringify([
      {
        ...(JSON.parse(minted) as Record<string, unknown>[]).find((one) => one.id === "BU-2zw"),
        ...change,
      },
    ]);
  const UNATTACHED_SHOW = shownWith({ metadata: {}, labels: [] });

  test("should keep a failed display id write pending and retry the same id on each refresh until it succeeds", async ($, on) => {
    let made = false;
    let attaching = "failing";
    const { w, ui } = await openPane($, on, {
      script: (key) => {
        if (key.startsWith("bd create ")) {
          made = true;
          return ok(created());
        }
        if (key === "bd list --all --brief --limit 0") {
          if (!made) return ok(before());
          return attaching === "done" ? ok(list) : ok(unattached());
        }
        if (key === SHOW) return ok(UNATTACHED_SHOW);
        if (key === ATTACH) {
          if (attaching === "failing") return exit(1, "Error: database is locked");
          attaching = "done";
        }
        return undefined;
      },
    });

    await ui.input({ key: "quickadd", text: LINE });
    await w.clock.settle();

    expect((await ui.find({ key: "notice" }))?.text).toBe(
      "created BU-2zw; writing its display id failed (exit 1): Error: database is locked",
    );
    expect((await ui.find({ key: "pending-id:BU-2zw" }))?.text).toBe(
      `BU-2zw has no display id yet (writing its display id failed (exit 1): Error: database is locked); writing ${MINTED} again on the next refresh`,
    );
    const failedTries = w.keys().filter((key) => key === ATTACH).length;
    // What a pane reopened in a later session reads back from the plugin store.
    expect(w.store.get("pending-display-ids")).toEqual([{ id: "BU-2zw", displayId: MINTED }]);

    await w.clock.advance(10_000);
    expect(w.keys().filter((key) => key === ATTACH).length).toBe(failedTries + 1);
    expect(await ui.find({ key: "pending-id:BU-2zw" })).toBeDefined();

    attaching = "working";
    await w.clock.advance(10_000);

    expect(await ui.find({ key: "pending-id:BU-2zw" })).toBeUndefined();
    expect((await ui.find({ key: "notice" }))?.text).toBe(`wrote ${MINTED} for BU-2zw`);
    const writes = w.keys().filter((key) => key.startsWith("bd update BU-2zw"));
    expect(new Set(writes)).toEqual(new Set([ATTACH]));
    expect(w.store.get("pending-display-ids")).toEqual([]);

    await w.clock.advance(10_000);
    expect(w.keys().filter((key) => key === ATTACH).length).toBe(failedTries + 2);
  });

  test("should retry a display id left pending by an earlier session without minting another", async ($, on) => {
    let attached = false;
    const { w, ui } = await openPane($, on, {
      stored: { "pending-display-ids": [{ id: "BU-2zw", displayId: MINTED }] },
      script: (key) => {
        if (key === ATTACH) attached = true;
        if (key === SHOW) return ok(UNATTACHED_SHOW);
        return key === "bd list --all --brief --limit 0" && !attached
          ? ok(unattached())
          : undefined;
      },
    });

    expect(w.keys().filter((key) => key.startsWith("bd update"))).toEqual([ATTACH]);
    expect(w.keys().some((key) => key.startsWith("bd create"))).toBe(false);
    expect(await ui.find({ key: "pending-id:BU-2zw" })).toBeUndefined();
  });

  test("should write nothing and drop the pending id when the re-read just before the write shows another id", async ($, on) => {
    const OTHER = "BU-written-elsewhere-2zw";
    const { w, ui } = await openPane($, on, {
      stored: { "pending-display-ids": [{ id: "BU-2zw", displayId: MINTED }] },
      script: (key) =>
        key === "bd list --all --brief --limit 0"
          ? ok(unattached())
          : key === SHOW
            ? ok(shownWith({ metadata: { display_id: OTHER }, labels: [`id:${OTHER}`] }))
            : undefined,
    });

    expect(w.keys()).toContain(SHOW);
    expect(w.keys().some((key) => key.startsWith("bd update"))).toBe(false);
    expect(await ui.find({ key: "pending-id:BU-2zw" })).toBeUndefined();
    expect(w.store.get("pending-display-ids")).toEqual([]);
    expect((await ui.find({ key: "notice" }))?.text).toBe(
      `BU-2zw already carries ${OTHER}; ${MINTED} was not written`,
    );
  });

  test("should write nothing and keep the id pending when the re-read before the write fails", async ($, on) => {
    const { w, ui } = await openPane($, on, {
      stored: { "pending-display-ids": [{ id: "BU-2zw", displayId: MINTED }] },
      script: (key) =>
        key === "bd list --all --brief --limit 0"
          ? ok(unattached())
          : key === SHOW
            ? exit(1, "Error: database is locked")
            : undefined,
    });

    expect(w.keys().some((key) => key.startsWith("bd update"))).toBe(false);
    expect((await ui.find({ key: "pending-id:BU-2zw" }))?.text).toBe(
      `BU-2zw has no display id yet (re-reading it failed (exit 1): Error: database is locked); writing ${MINTED} again on the next refresh`,
    );
    expect(w.store.get("pending-display-ids")).toEqual([{ id: "BU-2zw", displayId: MINTED }]);
  });

  test("should drop a pending display id without writing when the issue already carries another", async ($, on) => {
    const { w, ui } = await openPane($, on, {
      stored: { "pending-display-ids": [{ id: "BU-2zw", displayId: "BU-something-else-2zw" }] },
    });

    expect(w.keys().some((key) => key.startsWith("bd update"))).toBe(false);
    expect(await ui.find({ key: "pending-id:BU-2zw" })).toBeUndefined();
    expect((await ui.find({ key: "notice" }))?.text).toBe(
      `BU-2zw already carries ${MINTED}; BU-something-else-2zw was not written`,
    );
  });

  test("should create the issue without a display id when id_policy is off", async ($, on) => {
    const { w, ui } = await openPane($, on, {
      script,
      files: { [`${CWD}/beads-ui.toml`]: '[stores.default]\nid_policy = "off"\n' },
    });

    await ui.input({ key: "quickadd", text: LINE });
    await w.clock.settle();

    expect(w.runs.some((argv) => argv[1] === "create")).toBe(true);
    expect(w.runs.some((argv) => argv[1] === "update")).toBe(false);
    expect((await ui.find({ key: "notice" }))?.text).toBe("created BU-2zw");
  });

  test("should name the problem and create nothing when the line has no title", async ($, on) => {
    const { w, ui } = await openPane($, on, { script });

    await ui.input({ key: "quickadd", text: "p1 type:task" });
    await w.clock.settle();

    expect(w.runs.some((argv) => argv[1] === "create")).toBe(false);
    expect((await ui.find({ key: "notice" }))?.text).toBe("a new issue needs a title");
  });
});
