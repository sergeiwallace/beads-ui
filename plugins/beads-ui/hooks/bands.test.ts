import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import {
  asOf,
  BEAT_MS,
  clockStamp,
  LEASE_DEAD_MS,
  LEASE_KEY,
  type StoreSnapshot,
  storeReads,
  storeSnapshotOf,
  wakeFileName,
} from "../core/src/index.ts";
import { BAND_SETTINGS_KEY } from "./bandSettings.ts";
import { NARROW_TEXT, SCOPE_KEY } from "./pane.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { test } from "./tests/kit.ts";
import {
  BAND_PROPS,
  type Counted,
  CWD,
  countOf,
  countScript,
  exit,
  INVENTORY_PATH,
  inventoryOf,
  keyOf,
  OPEN_LIST,
  ok,
  onBoard,
  PANE_PROPS,
  REFRESHER_TOKEN,
  type Script,
  SESSION,
  SHOW,
  START_MS,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

const LIST = OPEN_LIST;
const HOUR = 3_600_000;
const STATE = "/home/me/.local/state/beads-ui";
/** The snapshot of the played refresher's token, the one its lease names. */
const SNAPSHOT = `${STATE}/counts-${REFRESHER_TOKEN}.json`;
/** The last snapshot published, read only when no lease names a refresher. */
const PUBLISHED = `${STATE}/counts.json`;
const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";

const band = ($: Engine, columns = 120, hasSurvey = false) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: { ...BAND_PROPS, bodyColumns: columns, hasSurvey },
    viewport: { ...VIEWPORT, columns },
  });

const line = async ($: Engine, key: string) =>
  (await (await band($)).find({ key: `beads-band:${key}` }))?.text;

const pane = ($: Engine) =>
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

/** A session `ai c` named, so `CLAUDE_CODE_TASK_LIST_ID` holds its name. */
const named = (session: string, options: WorldOptions = {}): WorldOptions => ({
  ...options,
  env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: session },
});

const HARNESS = "/work/ai-harness";
/** Two stores holding issues of three sessions and one with no assignee. */
const STORES: Readonly<Record<string, readonly Counted[]>> = {
  [CWD]: [
    { status: "open", assignee: "aih-ec2-3" },
    { status: "in_progress", assignee: "aih-ec2-3" },
    { status: "closed", assignee: "aih-ec2-3", closedAt: START_MS - HOUR },
    { status: "open", assignee: "kg-ec2-1" },
    { status: "blocked", assignee: "kg-ec2-1" },
    { status: "open" },
  ],
  [HARNESS]: [
    { status: "open", assignee: "aih-ec2-3" },
    { status: "blocked", assignee: "aih-ec2-3" },
    { status: "closed", assignee: "aih-ec2-3", closedAt: START_MS - 72 * HOUR },
    { status: "in_progress", assignee: "aih-ec2-firstmate-1" },
    { status: "closed", assignee: "aih-ec2-firstmate-1", closedAt: START_MS - 2 * HOUR },
    { status: "open", assignee: "kg-ec2-1" },
  ],
};
const INVENTORY = inventoryOf({ BU: { repo: CWD }, AIH: { repo: HARNESS } });

const nameOf = (path: string) => path.split("/").pop() ?? path;

/** One store's snapshot, built as the refresher builds it, from bd's answers over `issues`. */
function storeOf(path: string, issues: readonly Counted[], at: number, windows = ["24h"]) {
  const answers = storeReads(windows, at).map((read) => ({
    key: read.key,
    ok: true as const,
    stdout: countOf(issues, read.argv).stdout,
  }));
  return storeSnapshotOf({ path, name: nameOf(path) }, answers, at);
}

/** The host snapshot as the refresher writes it, its heartbeat `beatAt`. */
function snapshotOf(
  stores: Readonly<Record<string, readonly Counted[]>>,
  options: { beatAt?: number; failed?: string[]; stoppedAt?: number; token?: string } = {},
): string {
  const beatAt = options.beatAt ?? START_MS - 10_000;
  const entries: StoreSnapshot[] = Object.entries(stores).map(([path, issues]) =>
    options.failed?.includes(path)
      ? { path, name: nameOf(path), ok: false, readAt: beatAt, error: "exit 1, database is locked" }
      : storeOf(path, issues, beatAt),
  );
  return JSON.stringify({
    schema: 1,
    token: options.token ?? REFRESHER_TOKEN,
    pid: 4242,
    beatAt,
    ...(options.stoppedAt === undefined ? {} : { stoppedAt: options.stoppedAt }),
    stores: entries,
  });
}

const LIVE = { [INVENTORY_PATH]: INVENTORY, [SNAPSHOT]: snapshotOf(STORES) };

const isCount = (key: string) => key.startsWith("bd count ");
const isStart = (key: string) => key.startsWith("node ") && key.includes(" start ");
/** The refresher's launcher answers with the pid of the refresher it started. */
const starts: Script = (key) => (isStart(key) ? ok('{"pid":4242}\n') : undefined);
const both =
  (...scripts: Script[]): Script =>
  (key, argv, cwd) => {
    for (const script of scripts) {
      const answer = script(key, argv, cwd);
      if (answer !== undefined) return answer;
    }
    return undefined;
  };

async function started($: Engine, on: On, options: WorldOptions = {}) {
  const w = world(on, options);
  await $.session.start(SESSION);
  await w.clock.settle();
  return w;
}

const OWN = "[bd] 5 tasks (1 in progress, 1 blocked, 2 open, 1 done last 24h)";
const ALL = "[bd][all] 11 tasks (2 in progress, 2 blocked, 5 open, 2 done last 24h)";
const FM = "     [fm] 2 tasks (1 in progress, 0 blocked, 0 open, 1 done last 24h)";

describe("the band's format (T-1B.10)", () => {
  test("should read [bd] and the session's own counts with no session name or store count when a non-firstmate session draws", async ($, on) => {
    const w = await started($, on, named("aih-ec2-3", { refresher: true, files: LIVE }));

    expect(await line($, "own")).toBe(OWN);
    expect(await line($, "all")).toBeUndefined();
    expect(w.keys().filter(isCount)).toEqual([]);
  });

  test("should draw the snapshot of the token the lease names, never one an ousted refresher wrote", async ($, on) => {
    const OUSTED: Readonly<Record<string, readonly Counted[]>> = {
      [CWD]: [{ status: "open", assignee: "aih-ec2-3" }],
      [HARNESS]: [],
    };
    const files = {
      ...LIVE,
      [PUBLISHED]: snapshotOf(OUSTED, { beatAt: START_MS - 1_000, token: "ousted-token-1" }),
    };
    const w = await started($, on, named("aih-ec2-3", { refresher: true, files }));

    expect(await line($, "own")).toBe(OWN);
    expect(w.keys().filter(isCount)).toEqual([]);
  });

  test("should draw [bd][all] over every owner and [fm] right-aligned beneath it when the firstmate draws", async ($, on) => {
    await started($, on, named("aih-ec2-firstmate-1", { refresher: true, files: LIVE }));

    const all = await line($, "all");
    const fm = await line($, "own");

    expect(all).toBe(ALL);
    expect(fm).toBe(FM);
    expect(all?.indexOf(" 11 tasks")).toBe(fm?.indexOf(" 2 tasks"));
    const text = (await (await band($)).find({ key: "beads-band" }))?.text ?? "";
    expect(text.indexOf("[bd][all]")).toBeLessThan(text.indexOf("[fm]"));
  });

  test("should end the firstmate's first line with the unsynced count and name the stores in the pane header when a store is out of step", async ($, on) => {
    const files = {
      ...LIVE,
      [INVENTORY_PATH]: inventoryOf({ BU: { repo: CWD }, AIH: { repo: HARNESS, synced: false } }),
    };
    await started($, on, named("aih-ec2-firstmate-1", { refresher: true, files }));
    await $.command.run(SHOW);

    expect(await line($, "all")).toBe(`${ALL} 1 unsynced`);
    expect(await line($, "own")).toBe(FM);
    expect((await (await pane($)).find({ key: "header" }))?.text).toContain(
      "unsynced with the pair: AIH",
    );
  });

  test("should show no drift marker when every store is in step", async ($, on) => {
    await started($, on, named("aih-ec2-firstmate-1", { refresher: true, files: LIVE }));

    expect(await line($, "all")).not.toContain("unsynced");
  });

  test("should draw from the stores that answered and end the line with ~ when a store cannot be read", async ($, on) => {
    const files = { ...LIVE, [SNAPSHOT]: snapshotOf(STORES, { failed: [HARNESS] }) };
    await started($, on, named("aih-ec2-firstmate-1", { refresher: true, files }));

    expect(await line($, "all")).toBe(
      "[bd][all] 6 tasks (1 in progress, 1 blocked, 3 open, 1 done last 24h) ~",
    );
    expect(await line($, "own")).toBe(
      "     [fm] 0 tasks (0 in progress, 0 blocked, 0 open, 0 done last 24h) ~",
    );
  });

  test("should count every owner's issues in the session's store when the session has no name", async ($, on) => {
    await started($, on, { refresher: true, files: LIVE });

    expect(await line($, "store")).toBe(
      "[bd] 6 tasks (1 in progress, 1 blocked, 3 open, 1 done last 24h)",
    );
    expect(await line($, "own")).toBeUndefined();
  });

  test("should explain the band's glyphs in the pane's help", async ($, on) => {
    await started($, on, named("aih-ec2-3", { refresher: true, files: LIVE }));
    await $.command.run(SHOW);
    const ui = await pane($);

    await ui.press({ key: "help" });

    const help = (await ui.findAll({ type: "Box" })).find((element) => element.key === "help");
    expect(help?.text).toContain("A line ending ~ is partial: a store could not be read.");
    expect(help?.text).toContain("* means this session read the counts itself");
    expect(help?.text).toContain("g: Band settings");
  });

  test("should yield the band when a survey holds it", async ($, on) => {
    await started($, on, named("aih-ec2-3", { refresher: true, files: LIVE }));

    expect(await (await band($, 120, true)).find({ key: "beads-band" })).toBeUndefined();
  });
});

describe("the store a session sums (T-1B.1)", () => {
  const KG_CWD = "/work/bms-semantic-knowledge-graph";
  const MAPPED = "/home/me/kg-store";
  const MAPPING = '[directory_stores]\n"bms-semantic-knowledge-graph" = "~/kg-store"\n';
  const KG_STORE: readonly Counted[] = [
    { status: "open", assignee: "kg-ec2-3" },
    { status: "blocked", assignee: "kg-ec2-3" },
  ];

  test("should add the mapped store to its sum and register it for the refresher when the inventory does not list it", async ($, on) => {
    const w = world(
      on,
      named("kg-ec2-3", {
        refresher: true,
        files: {
          [USER_CONFIG]: MAPPING,
          [INVENTORY_PATH]: INVENTORY,
          [SNAPSHOT]: snapshotOf({ ...STORES, [MAPPED]: KG_STORE }),
        },
      }),
    );
    await $.session.start({ ...SESSION, cwd: KG_CWD });
    await w.clock.settle();

    expect(await line($, "own")).toBe(
      "[bd] 2 tasks (0 in progress, 1 blocked, 1 open, 0 done last 24h)",
    );
    const entry = JSON.parse(w.files.get(`${STATE}/sessions/kg-ec2-3.json`) ?? "{}");
    expect(entry).toEqual({
      id: "kg-ec2-3",
      seenAt: START_MS,
      windows: ["24h"],
      stores: [{ name: "kg-store", path: MAPPED }],
      // The store its pane reads, whose board snapshot the refresher keeps (T-1B.8).
      boards: [{ name: "kg-store", path: MAPPED }],
    });
  });

  test("should read the mapped store too when it reads its own counts", async ($, on) => {
    const w = world(
      on,
      named("kg-ec2-3", {
        files: { [USER_CONFIG]: MAPPING, [INVENTORY_PATH]: INVENTORY },
        script: countScript({ ...STORES, [MAPPED]: KG_STORE }),
      }),
    );
    await $.session.start({ ...SESSION, cwd: KG_CWD });
    await w.clock.settle();

    expect(await line($, "own")).toBe(
      "[bd] 2 tasks (0 in progress, 1 blocked, 1 open, 0 done last 24h) *",
    );
    expect(new Set(w.keys().flatMap((key, i) => (isCount(key) ? [w.cwds[i]] : [])))).toEqual(
      new Set([CWD, HARNESS, MAPPED]),
    );
  });
});

describe("a store reached through a linked worktree (BU-beads-ui-band-double-dzwp)", () => {
  const OWN_TREE = `${HARNESS}/.worktrees/aih-ec2-3`;
  const FM_TREE = `${HARNESS}/.worktrees/aih-ec2-firstmate-1`;
  /** bd where in a linked worktree: its own `.beads` directory, the main tree's database. */
  const worktrees: Script = (key, _argv, cwd) =>
    key === "bd where" && cwd !== undefined && cwd.startsWith(`${HARNESS}/.worktrees/`)
      ? ok(
          `${JSON.stringify({ database_path: `${cwd}/.beads/dolt`, path: `${cwd}/.beads`, prefix: "AIH", schema_version: 1 })}\n`,
        )
      : undefined;
  /** Each worktree answers bd with the main tree's issues, as one database does. */
  const SAME = { ...STORES, [OWN_TREE]: STORES[HARNESS] ?? [], [FM_TREE]: STORES[HARNESS] ?? [] };

  test("should count the main tree's database once in a worktree session's band and register no store of its own", async ($, on) => {
    const files = { [INVENTORY_PATH]: INVENTORY, [SNAPSHOT]: snapshotOf(SAME) };
    const w = world(on, named("aih-ec2-3", { refresher: true, files, script: worktrees }));
    await $.session.start({ ...SESSION, cwd: OWN_TREE });
    await w.clock.settle();

    expect(await line($, "own")).toBe(OWN);
    const entry = JSON.parse(w.files.get(`${STATE}/sessions/aih-ec2-3.json`) ?? "{}");
    expect(entry.stores).toEqual([]);
  });

  test("should read the main tree's database once when a worktree session reads its own counts", async ($, on) => {
    const w = world(
      on,
      named("aih-ec2-3", {
        files: { [INVENTORY_PATH]: INVENTORY },
        script: both(worktrees, countScript(SAME)),
      }),
    );
    await $.session.start({ ...SESSION, cwd: OWN_TREE });
    await w.clock.settle();

    expect(await line($, "own")).toBe(`${OWN} *`);
    expect(new Set(w.keys().flatMap((key, i) => (isCount(key) ? [w.cwds[i]] : [])))).toEqual(
      new Set([CWD, HARNESS]),
    );
  });

  test("should count the main tree's database once in the firstmate's [bd][all] totals and [fm] line from a worktree", async ($, on) => {
    const files = { [INVENTORY_PATH]: INVENTORY, [SNAPSHOT]: snapshotOf(SAME) };
    const w = world(
      on,
      named("aih-ec2-firstmate-1", { refresher: true, files, script: worktrees }),
    );
    await $.session.start({ ...SESSION, cwd: FM_TREE });
    await w.clock.settle();

    expect(await line($, "all")).toBe(ALL);
    expect(await line($, "own")).toBe(FM);
  });
});

describe("one refresher for the host (T-1B.4)", () => {
  const STALE = {
    [INVENTORY_PATH]: INVENTORY,
    [SNAPSHOT]: snapshotOf(STORES, { beatAt: START_MS - 4 * 60_000 }),
    [PUBLISHED]: snapshotOf(STORES, { beatAt: START_MS - 4 * 60_000 }),
  };
  const spawned = (w: ReturnType<typeof world>) => w.runs.filter((argv) => isStart(keyOf(argv)));

  test("should start the refresher under a lease it took when the snapshot is older than three minutes and no lease is held", async ($, on) => {
    const w = await started($, on, named("aih-ec2-3", { files: STALE, script: starts }));

    const [argv, ...more] = spawned(w);
    expect(more).toEqual([]);
    expect(argv?.[0]).toBe("node");
    expect(argv?.[1]).toMatch(/\/refresher\/refresher\.mjs$/);
    const token = argv?.[argv.indexOf("--token") + 1];
    expect(token).toMatch(/^[0-9a-z]{28}$/);
    expect(argv?.slice(2)).toEqual([
      "start",
      "--state-dir",
      STATE,
      "--home",
      "/home/me",
      "--token",
      token,
    ]);
    expect(w.store.get(LEASE_KEY)).toEqual({ token, at: START_MS });
    // The last snapshot draws while the new refresher starts; the session reads nothing itself.
    expect(await line($, "own")).toBe(OWN);
    expect(w.keys().filter(isCount)).toEqual([]);
  });

  test("should start nothing and read nothing itself when another session holds a live lease", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", {
        files: STALE,
        script: starts,
        stored: { [LEASE_KEY]: { token: "other-session", at: START_MS - 10_000 } },
      }),
    );

    expect(spawned(w)).toEqual([]);
    expect(w.keys().filter(isCount)).toEqual([]);
    expect(await line($, "own")).toBe(OWN);
  });

  test("should start nothing when another session's token wins the lease between its write and its read back", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", {
        files: STALE,
        script: starts,
        afterStoreSet: (key, store) => {
          const held = store.get(LEASE_KEY) as { token?: string } | undefined;
          if (key === LEASE_KEY && held?.token !== "rival") {
            store.set(LEASE_KEY, { token: "rival", at: START_MS });
          }
        },
      }),
    );

    expect(spawned(w)).toEqual([]);
    expect(w.store.get(LEASE_KEY)).toEqual({ token: "rival", at: START_MS });
  });

  test("should start a refresher within two minutes when the lease holder's refresher never wrote", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", {
        files: STALE,
        script: starts,
        stored: { [LEASE_KEY]: { token: "other-session", at: START_MS } },
      }),
    );

    await w.clock.advance(BEAT_MS);
    expect(spawned(w)).toEqual([]);

    await w.clock.advance(BEAT_MS);
    expect(spawned(w)).toHaveLength(1);
  });

  test("should start a new refresher within two minutes when the running one is killed before its snapshot is three minutes old", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", {
        refresher: true,
        files: LIVE,
        script: starts,
        // The session that started the killed refresher took the lease 30 s ago, with its token.
        stored: { [LEASE_KEY]: { token: REFRESHER_TOKEN, at: START_MS - 30_000 } },
      }),
    );
    expect(spawned(w)).toEqual([]);

    await w.clock.advance(5_000);
    await w.killRefresher();
    await w.clock.advance(BEAT_MS - 5_000);
    // Its lease was last renewed at the clock's start, 60 s ago: past LEASE_DEAD_MS.
    expect(BEAT_MS).toBeGreaterThan(LEASE_DEAD_MS);
    expect(spawned(w)).toHaveLength(1);
    // The snapshot is 70 s old, under three minutes: the band still draws it, unmarked.
    expect(await line($, "own")).toBe(OWN);
    expect(w.keys().filter(isCount)).toEqual([]);
  });

  for (const offset of [0, 20_001, 59_999]) {
    test(`should start a new refresher within two minutes when the running one is killed ${offset} ms into the session`, async ($, on) => {
      const w = await started(
        $,
        on,
        named("aih-ec2-3", { refresher: true, files: LIVE, script: starts }),
      );
      await w.clock.advance(offset);
      await w.killRefresher();
      let waited = 0;
      while (spawned(w).length === 0 && waited < 3 * BEAT_MS) {
        await w.clock.advance(1_000);
        waited += 1_000;
      }

      expect(spawned(w)).toHaveLength(1);
      expect(waited).toBeLessThanOrEqual(120_000);
    });
  }

  test("should mark the counts as read by this session when the refresher runs but its snapshot is older than three minutes", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", { refresher: true, files: STALE, script: countScript(STORES) }),
    );

    expect(await line($, "own")).toBe(`${OWN} *`);
    expect(spawned(w)).toEqual([]);
  });

  test("should start the next refresher at its next minute check when the last one stopped on purpose", async ($, on) => {
    const files = {
      [INVENTORY_PATH]: INVENTORY,
      [SNAPSHOT]: snapshotOf(STORES, { stoppedAt: START_MS - 1_000 }),
    };
    const w = await started($, on, named("aih-ec2-3", { files, script: starts }));

    expect(spawned(w)).toHaveLength(1);
  });

  test("should read its own counts and mark the line * when the refresher cannot be started", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", {
        files: STALE,
        script: both(
          (key) => (isStart(key) ? exit(1, "node: not found\n") : undefined),
          countScript(STORES),
        ),
      }),
    );

    expect(await line($, "own")).toBe(`${OWN} *`);
    expect(new Set(w.keys().filter(isCount))).toEqual(
      new Set([
        "bd count --by-assignee --status=in_progress",
        "bd count --by-assignee --status=blocked",
        "bd count --by-assignee --status=open",
        `bd count --by-assignee --status=closed --closed-after=${new Date(START_MS - 24 * HOUR).toISOString()}`,
      ]),
    );
  });

  test("should read its own counts once a minute, no sooner, while no refresher runs", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", {
        files: STALE,
        script: both((key) => (isStart(key) ? exit(1, "") : undefined), countScript(STORES)),
      }),
    );
    const counts = () => w.keys().filter(isCount).length;
    const first = counts();
    expect(first).toBe(8);

    await w.clock.advance(BEAT_MS - 1);
    expect(counts()).toBe(first);

    await w.clock.advance(1);
    expect(counts()).toBe(first * 2);
  });

  test("should run no bd count of its own across five minutes while the refresher's snapshot is live", async ($, on) => {
    const w = world(on, named("aih-ec2-3", { refresher: true, files: LIVE, script: starts }));
    await $.session.start(SESSION);
    await w.clock.settle();

    for (let minute = 1; minute <= 5; minute++) {
      w.files.set(SNAPSHOT, snapshotOf(STORES, { beatAt: START_MS + minute * BEAT_MS - 5_000 }));
      await w.clock.advance(BEAT_MS);
    }

    expect(w.keys().filter(isCount)).toEqual([]);
    expect(spawned(w)).toEqual([]);
  });
});

describe("the band's cadence and stamp (T-1B.5)", () => {
  const MORE: Readonly<Record<string, readonly Counted[]>> = {
    ...STORES,
    [CWD]: [...(STORES[CWD] ?? []), { status: "open", assignee: "aih-ec2-3" }],
  };

  test("should redraw from the newest snapshot at the next minute and not sooner", async ($, on) => {
    const w = await started($, on, named("aih-ec2-3", { refresher: true, files: LIVE }));

    w.files.set(SNAPSHOT, snapshotOf(MORE, { beatAt: START_MS + 20_000 }));
    await w.clock.advance(BEAT_MS - 1);
    expect(await line($, "own")).toBe(OWN);

    await w.clock.advance(1);
    expect(await line($, "own")).toBe(
      "[bd] 6 tasks (1 in progress, 1 blocked, 3 open, 1 done last 24h)",
    );
  });

  test("should redraw once after a write the session makes", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", {
        refresher: true,
        files: LIVE,
        stored: { [SCOPE_KEY]: { "aih-ec2-3": "all" } },
      }),
    );
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await pane($);
    w.files.set(SNAPSHOT, snapshotOf(MORE, { beatAt: START_MS + 5_000 }));

    await ui.select({ key: "move:BU-2zw", value: "in_progress" });
    await w.clock.settle();

    expect(await line($, "own")).toBe(
      "[bd] 6 tasks (1 in progress, 1 blocked, 3 open, 1 done last 24h)",
    );
  });

  const ALL_VIEW = { [SCOPE_KEY]: { "aih-ec2-3": "all" } };
  const MORE_LINE = "[bd] 6 tasks (1 in progress, 1 blocked, 3 open, 1 done last 24h)";

  test("should drop a wake marker for its store after a write and draw the refresher's read of it within 10 seconds", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", { refresher: true, files: LIVE, stored: ALL_VIEW }),
    );
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await pane($);

    await ui.select({ key: "move:BU-2zw", value: "in_progress" });
    await w.clock.settle();

    const marker = JSON.parse(w.files.get(`${STATE}/wake/${wakeFileName(CWD)}`) ?? "{}");
    expect(marker).toEqual({ path: CWD, at: START_MS });
    // The snapshot holds no read of the store since the write yet: the band keeps its line.
    expect(await line($, "own")).toBe(OWN);
    // The refresher answers the marker two seconds on.
    await w.clock.advance(2_000);
    w.files.set(SNAPSHOT, snapshotOf(MORE, { beatAt: START_MS + 2_000 }));
    await w.clock.advance(1_000);

    expect(await line($, "own")).toBe(MORE_LINE);
    expect(w.keys().filter(isCount)).toEqual([]);
  });

  test("should read its store's counts itself 9 seconds after a write the refresher has not read", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", {
        refresher: true,
        files: LIVE,
        stored: ALL_VIEW,
        script: countScript(MORE),
      }),
    );
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await pane($);

    await ui.select({ key: "move:BU-2zw", value: "in_progress" });
    await w.clock.advance(8_999);
    expect(w.keys().filter(isCount)).toEqual([]);
    expect(await line($, "own")).toBe(OWN);

    await w.clock.advance(1);

    expect(await line($, "own")).toBe(MORE_LINE);
    expect(new Set(w.keys().flatMap((key, i) => (isCount(key) ? [w.cwds[i]] : [])))).toEqual(
      new Set([CWD]),
    );
  });

  test("should read bd for the pane at once after its own write, not wait for the snapshot", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", { refresher: true, files: LIVE, stored: ALL_VIEW }),
    );
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await pane($);
    const before = w.keys().length;

    await ui.select({ key: "move:BU-2zw", value: "in_progress" });
    await w.clock.settle();

    expect(w.keys().slice(before)).toContain(LIST);
  });

  test("should show no read time when debug mode is off", async ($, on) => {
    await started($, on, named("aih-ec2-3", { refresher: true, files: LIVE }));

    expect(await line($, "own")).not.toContain("as of");
  });

  test("should end each line with the read time to the second when beads-ui.toml sets debug on", async ($, on) => {
    const files = { ...LIVE, [USER_CONFIG]: "[band]\ndebug = true\n" };
    await started($, on, named("aih-ec2-firstmate-1", { refresher: true, files }));
    const at = START_MS - 10_000;
    const stamp = asOf(clockStamp(at, new Date(at).getTimezoneOffset()));

    expect(await line($, "all")).toBe(`${ALL} ${stamp}`);
    expect(await line($, "own")).toBe(`${FM} ${stamp}`);
    expect(stamp).toMatch(/^as of \d{2}:\d{2}:\d{2}$/);
  });
});

describe("the band's parts (T-1B.11)", () => {
  test("should draw the parts in the order beads-ui.toml sets, at the next redraw without a restart", async ($, on) => {
    const w = await started($, on, named("aih-ec2-3", { refresher: true, files: LIVE }));
    expect(await line($, "own")).toBe(OWN);

    w.files.set(USER_CONFIG, '[band]\nparts = ["total", "open", "done", "in_progress"]\n');
    await w.clock.advance(BEAT_MS);

    expect(await line($, "own")).toBe("[bd] 4 tasks (2 open, 1 done last 24h, 1 in progress)");
  });

  test("should draw the counts alone when the file removes the total", async ($, on) => {
    const files = { ...LIVE, [USER_CONFIG]: '[band]\nparts = ["blocked", "in_progress"]\n' };
    await started($, on, named("aih-ec2-3", { refresher: true, files }));

    expect(await line($, "own")).toBe("[bd] 1 blocked, 1 in progress");
  });

  test("should count the done window beads-ui.toml sets, reading it itself until the snapshot holds it", async ($, on) => {
    const files = { ...LIVE, [USER_CONFIG]: '[band]\ndone_window = "7d"\n' };
    const w = await started(
      $,
      on,
      named("aih-ec2-3", { refresher: true, files, script: countScript(STORES) }),
    );

    expect(await line($, "own")).toBe(
      "[bd] 6 tasks (1 in progress, 1 blocked, 2 open, 2 done last 7d)",
    );
    expect(w.keys().filter(isCount)).toEqual([
      `bd count --by-assignee --status=closed --closed-after=${new Date(START_MS - 7 * 24 * HOUR).toISOString()}`,
      `bd count --by-assignee --status=closed --closed-after=${new Date(START_MS - 7 * 24 * HOUR).toISOString()}`,
    ]);
    expect(JSON.parse(w.files.get(`${STATE}/sessions/aih-ec2-3.json`) ?? "{}").windows).toEqual([
      "7d",
    ]);
  });

  test("should name a part the file gets wrong in the band settings and draw the rest", async ($, on) => {
    const files = { ...LIVE, [USER_CONFIG]: '[band]\nparts = ["total", "sparkline"]\n' };
    await started($, on, named("aih-ec2-3", { refresher: true, files }));
    await $.command.run(SHOW);
    const ui = await pane($);

    await ui.press({ key: "band-settings" });

    expect(await line($, "own")).toBe("[bd] 0 tasks");
    expect((await ui.find({ key: "band:settings" }))?.text).toContain(
      'band.parts: "sparkline" is not one of total, in_progress, blocked, open, done, drift, unpublished; ignored',
    );
  });

  test("should offer every part, the four counts, the total, the done count, the drift marker and the unpublished-edit count, each addable and removable", async ($, on) => {
    const files = { ...LIVE, [USER_CONFIG]: '[band]\nparts = ["open"]\n' };
    await started($, on, named("aih-ec2-3", { refresher: true, files }));
    await $.command.run(SHOW);
    const ui = await pane($);

    await ui.press({ key: "band-settings" });

    for (const part of [
      "total",
      "in_progress",
      "blocked",
      "open",
      "done",
      "drift",
      "unpublished",
    ]) {
      const toggle = await ui.find({ key: `band:toggle:${part}` });
      expect(toggle?.props.label).toBe(part === "open" ? "remove" : "add");
    }
  });

  test("should apply a part removed, added or moved in the pane at once and keep it in $.store", async ($, on) => {
    const w = await started($, on, named("aih-ec2-3", { refresher: true, files: LIVE }));
    await $.command.run(SHOW);
    const ui = await pane($);
    await ui.press({ key: "band-settings" });

    await ui.press({ key: "band:toggle:open" });
    expect(await line($, "own")).toBe("[bd] 3 tasks (1 in progress, 1 blocked, 1 done last 24h)");

    await ui.press({ key: "band:toggle:open" });
    expect(await line($, "own")).toBe(
      "[bd] 5 tasks (1 in progress, 1 blocked, 1 done last 24h, 2 open)",
    );

    await ui.press({ key: "band:left:blocked" });
    expect(await line($, "own")).toBe(
      "[bd] 5 tasks (1 blocked, 1 in progress, 1 done last 24h, 2 open)",
    );
    expect(w.store.get(BAND_SETTINGS_KEY)).toEqual({
      parts: ["total", "blocked", "in_progress", "done", "drift", "unpublished", "open"],
    });
  });

  test("should apply a done window set in the pane at once and refuse one it cannot read", async ($, on) => {
    const w = await started(
      $,
      on,
      named("aih-ec2-3", { refresher: true, files: LIVE, script: countScript(STORES) }),
    );
    await $.command.run(SHOW);
    const ui = await pane($);
    await ui.press({ key: "band-settings" });

    await ui.input({ key: "band:window", text: "7d" });
    await w.clock.settle();
    expect(await line($, "own")).toBe(
      "[bd] 6 tasks (1 in progress, 1 blocked, 2 open, 2 done last 7d)",
    );
    expect(w.store.get(BAND_SETTINGS_KEY)).toEqual({ doneWindow: "7d" });

    await ui.input({ key: "band:window", text: "soon" });
    expect((await ui.find({ key: "band:notice" }))?.text).toBe(
      '"soon" is not a window such as 24h, 90m, 7d or 2w',
    );
    expect(w.store.get(BAND_SETTINGS_KEY)).toEqual({ doneWindow: "7d" });
  });

  test("should write the band's settings into beads-ui.toml, keeping its other lines, when Save to file is pressed", async ($, on) => {
    const kept = '[directory_stores]\nscratch = "/work/beads-ui"\n';
    const w = await started(
      $,
      on,
      named("aih-ec2-3", {
        refresher: true,
        files: { ...LIVE, [USER_CONFIG]: kept },
        script: countScript(STORES),
      }),
    );
    await $.command.run(SHOW);
    const ui = await pane($);
    await ui.press({ key: "band-settings" });
    await ui.press({ key: "band:toggle:drift" });
    await ui.input({ key: "band:window", text: "48h" });

    await ui.press({ key: "band:save" });

    expect(w.files.get(USER_CONFIG)).toBe(
      `${kept}\n[band]\ndone_window = "48h"\nparts = ["total", "in_progress", "blocked", "open", "done", "unpublished"]\ndebug = false\n`,
    );
    expect(w.store.get(BAND_SETTINGS_KEY)).toEqual({});
    expect((await ui.find({ key: "band:notice" }))?.text).toBe(
      `saved the band settings to ${USER_CONFIG}`,
    );
    await w.clock.advance(BEAT_MS);
    expect(await line($, "own")).toContain("done last 48h");
  });
});

// The open nobody asked for, at session start, is panelmode.test.ts's (T-2B.7).
describe("the pane's width rule", () => {
  test("should open the pane the person asked for whatever the width", async ($, on) => {
    // At 80 columns Claude Code held the session-start open unplaced, and the mod said so.
    const w = await started($, on, { columns: 80 });
    expect(w.toasts).toEqual([NARROW_TEXT]);
    await band($, 80);

    await $.command.run(SHOW);

    expect(w.opened.map((open) => [open.id, open.focus])).toEqual([
      [PANE_ID, undefined],
      [PANE_ID, true],
    ]);
    expect(w.toasts).toEqual([NARROW_TEXT]);
  });
});

describe("the pane's refresh", () => {
  test("should refresh at most every 10 seconds when the pane is closed", async ($, on) => {
    const w = await started($, on);
    const lists = () => w.keys().filter((key) => key === LIST).length;
    const first = lists();

    await w.clock.advance(9_999);
    expect(lists()).toBe(first);

    await w.clock.advance(1);
    expect(lists()).toBe(first + 1);
  });

  test("should keep the 10-second floor when beads-ui.toml asks for a faster refresh", async ($, on) => {
    const w = await started($, on, {
      files: { [`${CWD}/beads-ui.toml`]: "[stores.default]\nrefresh_seconds = 2\n" },
    });
    const lists = () => w.keys().filter((key) => key === LIST).length;
    const first = lists();

    await w.clock.advance(9_999);

    expect(lists()).toBe(first);
  });

  test("should draw no band when no store can be read", async ($, on) => {
    await started($, on, {
      script: (key) => (key === LIST || isCount(key) ? exit(1, "no beads database") : undefined),
    });

    expect(await (await band($)).find({ key: "beads-band" })).toBeUndefined();
  });
});

describe("the unpublished-edit count (T-2B.6)", () => {
  const PUBLISH = "/opt/fleet/bin/publish-store";
  const SYNC = `[sync]\ncommand = ["${PUBLISH}", "--repo", "{store}"]\n`;
  const ALL_VIEW = { [SCOPE_KEY]: { "aih-ec2-3": "all" } };

  /** A named session with the pane open on the board, `sync.command` set, and a publish answering `code`. */
  async function editing($: Engine, on: On, code: () => number) {
    const w = world(
      on,
      named("aih-ec2-3", {
        refresher: true,
        files: { ...LIVE, [USER_CONFIG]: SYNC },
        stored: ALL_VIEW,
        script: (_key, argv) =>
          argv[0] === PUBLISH ? exit(code(), code() === 0 ? "" : "conflict\n") : undefined,
      }),
    );
    on("ui.notify", () => ({ value: { isSent: true, channel: "terminal_bell" } }));
    on("prompt.submit", () => ({
      drop: "the session was stopped and nobody has sent input since",
    }));
    on("turn.complete", (_engine, e) => ({ text: e.answer }));
    await $.session.start(SESSION);
    await w.clock.settle();
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await pane($);
    const write = async () => {
      await ui.select({ key: "move:BU-2zw", value: "in_progress" });
      await w.clock.settle();
    };
    const turnEnds = async () => {
      await $.turn.complete({ answer: "done", durationMs: 1, isAborted: false, turnId: "t" });
      await w.clock.settle();
    };
    return { w, write, turnEnds };
  }

  test("should count each write until its publish succeeds, then draw no count", async ($, on) => {
    const { w, write } = await editing($, on, () => 0);

    await write();
    expect(await line($, "own")).toBe(`${OWN} 1 unpublished`);
    await w.clock.advance(2_000);
    await write();
    expect(await line($, "own")).toBe(`${OWN} 2 unpublished`);

    await w.clock.advance(10_000);
    await w.clock.settle();

    expect(await line($, "own")).toBe(OWN);
  });

  test("should keep the count after a failed publish, and mark the failure once its turn was refused 3 more times", async ($, on) => {
    let code = 5;
    const { w, write, turnEnds } = await editing($, on, () => code);

    await write();
    await w.clock.advance(10_000);
    await w.clock.settle();
    expect(await line($, "own")).toBe(`${OWN} 1 unpublished`);
    await turnEnds();
    await turnEnds();
    expect(await line($, "own")).toBe(`${OWN} 1 unpublished`);

    await turnEnds();

    expect(await line($, "own")).toBe(`${OWN} 1 unpublished publish failed`);

    code = 0;
    await write();
    expect(await line($, "own")).toBe(`${OWN} 2 unpublished publish failed`);
    await w.clock.advance(10_000);
    await w.clock.settle();

    expect(await line($, "own")).toBe(OWN);
  });
});

describe("the session a daemon-hosted session draws for (BU-ylx.6.9)", () => {
  // A session Claude Code's daemon hosts runs in a worker whose environment is the daemon's, so
  // CLAUDE_CODE_TASK_LIST_ID names whoever started the daemon, here the firstmate; Claude Code
  // names the worker's own session in CLAUDE_CODE_SESSION_NAME.
  const DAEMON_STORES: Readonly<Record<string, readonly Counted[]>> = {
    ...STORES,
    [CWD]: [
      ...(STORES[CWD] ?? []),
      { status: "open", assignee: "aih-ec2-2" },
      { status: "in_progress", assignee: "aih-ec2-2" },
    ],
  };
  const DAEMON_LIVE = { [INVENTORY_PATH]: INVENTORY, [SNAPSHOT]: snapshotOf(DAEMON_STORES) };
  const DAEMON_ALL = "[bd][all] 13 tasks (3 in progress, 2 blocked, 6 open, 2 done last 24h)";
  const hosted = (sessionName?: string): WorldOptions => ({
    refresher: true,
    files: DAEMON_LIVE,
    env: {
      HOME: "/home/me",
      CLAUDE_CODE_TASK_LIST_ID: "aih-ec2-firstmate-1",
      CLAUDE_CODE_SESSION_KIND: "bg",
      CLAUDE_BG_BACKEND: "daemon",
      ...(sessionName === undefined ? {} : { CLAUDE_CODE_SESSION_NAME: sessionName }),
    },
  });
  const registry = (id: string) => `${STATE}/sessions/${id}.json`;

  test("should draw its own single [bd] line and register under its own name when a daemon the firstmate started hosts aih-ec2-2", async ($, on) => {
    const w = await started($, on, hosted("aih-ec2-2"));

    expect(await line($, "all")).toBeUndefined();
    expect(await line($, "own")).toBe(
      "[bd] 2 tasks (1 in progress, 0 blocked, 1 open, 0 done last 24h)",
    );
    expect(w.files.has(registry("aih-ec2-2"))).toBe(true);
    expect(w.files.has(registry("aih-ec2-firstmate-1"))).toBe(false);
  });

  test("should count for aih-ec2-2 when Claude Code numbered its background copy aih-ec2-2 (2)", async ($, on) => {
    const w = await started($, on, hosted("aih-ec2-2 (2)"));

    expect(await line($, "all")).toBeUndefined();
    expect(await line($, "own")).toBe(
      "[bd] 2 tasks (1 in progress, 0 blocked, 1 open, 0 done last 24h)",
    );
    expect(w.files.has(registry("aih-ec2-2"))).toBe(true);
  });

  test("should draw the single [bd] line and never the firstmate's form when a daemon-hosted session has no name of its own", async ($, on) => {
    await started($, on, hosted());

    expect(await line($, "all")).toBeUndefined();
    expect(await line($, "own")).toBeUndefined();
    expect(await line($, "store")).toMatch(/^\[bd\] \d+ tasks /);
  });

  test("should draw [bd][all] over [fm] when the daemon hosts the firstmate itself", async ($, on) => {
    await started($, on, hosted("aih-ec2-firstmate-1"));

    expect(await line($, "all")).toBe(DAEMON_ALL);
    expect(await line($, "own")).toBe(FM);
  });

  test("should draw [bd][all] over [fm] when the firstmate runs in its own process", async ($, on) => {
    await started($, on, named("aih-ec2-firstmate-1", { refresher: true, files: DAEMON_LIVE }));

    expect(await line($, "all")).toBe(DAEMON_ALL);
    expect(await line($, "own")).toBe(FM);
  });
});
