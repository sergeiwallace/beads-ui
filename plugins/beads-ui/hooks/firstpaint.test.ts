import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import { asOf, type BoardEntry, boardFileName, boardRow, clockStamp } from "../core/src/index.ts";
import list from "../core/test/fixtures/bd-list-all-brief.json.ts";
import statuses from "../core/test/fixtures/bd-statuses.json.ts";
import { NO_NAME_TEXT, PREFS_KEY, SCOPE_KEY } from "./pane.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import {
  BU,
  CLOSED_PAGE,
  CWD,
  HANG,
  keyOf,
  OPEN_LIST,
  onBoard,
  PANE_PROPS,
  REFRESHER_TOKEN,
  type Script,
  SESSION,
  START_MS,
  STATE_DIR,
  STORE_LIST,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

// T-1B.8 and D-29: the first paint from the host refresher's board snapshot, the Mine and All
// default and its memory, and the board's bounded read.

const ROWS = JSON.parse(list) as Record<string, unknown>[];
const boardFile = (token: string) => `${STATE_DIR}/boards/${token}/${boardFileName(CWD)}`;
const COUNTS = `${STATE_DIR}/counts.json`;
const countsOf = (token: string) => `${STATE_DIR}/counts-${token}.json`;
const READ_AT = START_MS - 50_000;
const CHECKED_AT = START_MS - 20_000;
const stamp = (ms: number) => asOf(clockStamp(ms, new Date(ms).getTimezoneOffset()));

/** The files the refresher writes for this store: its board snapshot and its counts' index. */
function snapshotFiles(
  options: {
    rows?: Record<string, unknown>[];
    entry?: Partial<BoardEntry> & { ok?: boolean };
    token?: string;
  } = {},
): Record<string, string> {
  const rows = options.rows ?? ROWS;
  const board = {
    schema: 1,
    path: CWD,
    name: "beads-ui",
    head: "head-1",
    readAt: READ_AT,
    statuses: JSON.parse(statuses),
    issues: rows.map(boardRow),
  };
  const entry = {
    path: CWD,
    ok: true,
    file: boardFileName(CWD),
    head: "head-1",
    readAt: READ_AT,
    checkedAt: CHECKED_AT,
    bytes: JSON.stringify(board).length,
    ...options.entry,
  };
  const token = options.token ?? REFRESHER_TOKEN;
  const counts = {
    schema: 1,
    token,
    pid: 4242,
    beatAt: CHECKED_AT,
    stores: [],
    boards: [entry],
  };
  // The refresher writes its own token's files, and publishes the same counts as counts.json.
  return {
    [boardFile(token)]: JSON.stringify(board),
    [countsOf(token)]: JSON.stringify(counts),
    [COUNTS]: JSON.stringify(counts),
  };
}

const named = (session: string, options: WorldOptions = {}): WorldOptions => ({
  ...options,
  env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: session },
});

/** Every bd list read hangs: only a snapshot can put a card on the board. */
const listsHang: Script = (key) => (key.startsWith("bd list ") ? HANG : undefined);

const mount = ($: Engine) =>
  $.ui
    .mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    })
    .then(onBoard);

async function opened($: Engine, on: On, options: WorldOptions) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await w.clock.settle();
  await $.command.run(BU);
  const ui = await mount($);
  return { w, ui };
}

const cards = async (ui: Awaited<ReturnType<typeof mount>>) =>
  (await ui.findAll({ type: "Box" }))
    .map((element) => element.key ?? "")
    .filter((key) => key.startsWith("card:"));
const lists = (w: ReturnType<typeof world>) => w.keys().filter((key) => key.startsWith("bd list "));

describe("the first paint (T-1B.8)", () => {
  test("should draw the board from the store's snapshot, with its read time, in the first render after /bu while bd has not answered", async ($, on) => {
    const opening = START_MS;
    const { w, ui } = await opened($, on, { files: snapshotFiles(), script: listsHang });

    // No bd list has answered: every card on the board came from the snapshot.
    expect(await cards(ui)).toHaveLength(30);
    expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
    expect((await ui.find({ key: "header" }))?.text).toContain(stamp(CHECKED_AT));
    expect((await ui.find({ key: "header" }))?.text).not.toContain("loading");
    // Drawn at the moment /bu ran, on the test clock.
    expect(await w.clock.now()).toBe(opening);
    // And then it reads bd: the open issues and one closed page.
    expect(lists(w)).toContain(OPEN_LIST);
    expect(lists(w)).toContain(CLOSED_PAGE);
  });

  test("should draw no snapshot and wait for bd when the store has none", async ($, on) => {
    const { ui } = await opened($, on, { script: listsHang });

    expect(await cards(ui)).toEqual([]);
    expect((await ui.find({ key: "header" }))?.text).toContain("loading⋯");
  });

  test("should run no bd list of its own while the refresher's snapshot is current", async ($, on) => {
    const w = world(on, { refresher: true, files: snapshotFiles() });
    await $.session.start(SESSION);
    await w.clock.settle();
    for (let tick = 0; tick < 3; tick++) await w.clock.advance(10_000);

    expect(lists(w)).toEqual([]);
    await $.command.run(BU);
    const ui = await mount($);
    expect(await cards(ui)).toHaveLength(30);
  });

  test("should read bd itself when the refresher is not running, though a snapshot is there", async ($, on) => {
    const w = world(on, { files: snapshotFiles() });
    await $.session.start(SESSION);
    await w.clock.settle();

    expect(lists(w).sort()).toEqual([OPEN_LIST, CLOSED_PAGE].sort());
  });

  test("should draw the board of the token the lease names, never one an ousted refresher wrote", async ($, on) => {
    const ousted = snapshotFiles({ rows: ROWS.slice(0, 5), token: "ousted-token-1" });
    const files = {
      ...snapshotFiles(),
      // The ousted refresher replaced counts.json, and the board file it names, after the holder.
      [COUNTS]: ousted[COUNTS] ?? "",
      [`${STATE_DIR}/boards/${boardFileName(CWD)}`]: ousted[boardFile("ousted-token-1")] ?? "",
      [boardFile("ousted-token-1")]: ousted[boardFile("ousted-token-1")] ?? "",
    };
    const { ui } = await opened($, on, { refresher: true, files, script: listsHang });

    expect(await cards(ui)).toHaveLength(30);
  });

  test("should name a store the refresher skipped for its size and read it from bd", async ($, on) => {
    const error =
      "its board snapshot would be 5.0 MiB, past the 4 MiB a session can read; the pane reads this store itself";
    const files = snapshotFiles({ entry: { ok: false, error } });
    const { w, ui } = await opened($, on, { refresher: true, files });

    expect((await ui.find({ key: "board-skipped" }))?.text).toBe(
      `Read from bd, not the host snapshot: ${error}`,
    );
    expect(lists(w)).toContain(OPEN_LIST);
    expect(await cards(ui)).toHaveLength(30);
  });
});

describe("the board's bounded read (T-1B.8)", () => {
  test("should read the open issues and the newest closed page, never every closed issue", async ($, on) => {
    const { w } = await opened($, on, {});

    const reads = w.runs.filter((argv) => argv[1] === "list");
    expect(reads.length).toBeGreaterThan(0);
    for (const argv of reads) expect(argv).not.toContain("--all");
    expect(new Set(reads.map(keyOf))).toEqual(new Set([OPEN_LIST, CLOSED_PAGE]));
    expect(reads.find((argv) => argv.includes("closed"))).toEqual([
      "bd",
      "list",
      "--json",
      "--brief",
      "--status",
      "closed",
      "--sort",
      "closed",
      "--limit",
      "25",
    ]);
    expect(w.keys()).not.toContain(STORE_LIST);
  });
});

describe("Mine and All (D-29)", () => {
  test("should open a non-firstmate session's board on its own issues, and show every issue after a", async ($, on) => {
    const { w, ui } = await opened($, on, named("ops-vm-3"));

    expect((await cards(ui)).sort()).toEqual(["card:BU-mg2", "card:BU-mg2.2"]);
    expect((await ui.find({ key: "scope" }))?.props.label).toBe("Showing: mine");

    await ui.press({ key: "scope" });

    expect(await cards(ui)).toHaveLength(30);
    expect((await ui.find({ key: "scope" }))?.props.label).toBe("Showing: all");
    expect(w.store.get(SCOPE_KEY)).toEqual({ "ops-vm-3": "all" });
  });

  test("should open on the choice $.store keeps for the session, and leave another session's alone", async ($, on) => {
    const stored = { [SCOPE_KEY]: { "ops-vm-3": "all", "qa-vm-1": "mine" } };
    const { w, ui } = await opened($, on, named("ops-vm-3", { stored }));

    expect(await cards(ui)).toHaveLength(30);
    await ui.press({ key: "scope" });
    expect(w.store.get(SCOPE_KEY)).toEqual({ "ops-vm-3": "mine", "qa-vm-1": "mine" });
    // The view key the other preferences live in carries no scope.
    expect(Object.keys((w.store.get(PREFS_KEY) as object | undefined) ?? {})).not.toContain(
      "scope",
    );
  });

  test("should open the firstmate's board on every issue", async ($, on) => {
    const { ui } = await opened($, on, named("ops-vm-firstmate-1"));

    expect(await cards(ui)).toHaveLength(30);
    expect((await ui.find({ key: "scope" }))?.props.label).toBe("Showing: all");
  });

  test("should say how to see every issue when the session owns no open one", async ($, on) => {
    const { ui } = await opened($, on, named("ops-3"));

    // ops-3's seven issues are all closed: the board draws them and says so.
    expect((await ui.find({ key: "mine-empty" }))?.text).toBe(
      "No open issues are assigned to ops-3; a shows all 22 open.",
    );
  });

  test("should show every issue and say why Mine is not offered when the session has no name", async ($, on) => {
    const { ui } = await opened($, on, {});

    expect(await cards(ui)).toHaveLength(30);
    await ui.press({ key: "scope" });

    expect(await cards(ui)).toHaveLength(30);
    expect((await ui.find({ key: "notice" }))?.text).toBe(NO_NAME_TEXT);
  });
});
