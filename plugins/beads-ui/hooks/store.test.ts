import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect, test } from "claude-code/testing";
import { BEAT_MS } from "../core/src/index.ts";
import { SCOPE_KEY, SPRINT_PLANNED_TEXT } from "./pane.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import {
  BAND_PROPS,
  CWD,
  countOf,
  exit,
  INVENTORY_PATH,
  inventoryOf,
  NO_STORE_STDERR,
  NO_STORE_WHERE,
  OPEN_LIST,
  onBoard,
  PANE_PROPS,
  type Script,
  SESSION,
  SHOW,
  VIEWPORT,
  type WorldOptions,
  world,
} from "./tests/world.ts";

const LIST = OPEN_LIST;
/** A kg session's directory: a repository that holds no Beads store, and must never get one. */
const KG_CWD = "/work/bms-semantic-knowledge-graph";
/** The repository whose store holds the kg sessions' work. */
const KG_STORE = "/work/sw-bms-workspace";
const HARNESS = "/work/ai-harness";
const CLI = "/work/ai-cli-utils";
/** A directory with no store whose name maps to nothing: where a prefix is the only lead. */
const SCRATCH = "/work/scratch";
const USER_CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";
const ALL_STORES = [KG_STORE, CWD, HARNESS, CLI];
const INVENTORY = {
  [INVENTORY_PATH]: inventoryOf({
    BU: { repo: CWD },
    KG: { repo: KG_STORE },
    AIH: { repo: HARNESS },
    AI_CLI: { repo: CLI },
  }),
};

/** bd as it answers on the machine: every read runs against the store of the directory it ran in. */
const stores =
  (withStore: readonly string[]): Script =>
  (key, argv, cwd) => {
    const has = cwd !== undefined && withStore.includes(cwd);
    if (key === "bd where") return has ? undefined : NO_STORE_WHERE;
    if (!has) return exit(1, NO_STORE_STDERR);
    return key.startsWith("bd count ")
      ? countOf([{ status: "open", assignee: "kg-ec2-3" }], argv)
      : undefined;
  };

async function openIn($: Engine, on: On, cwd: string, options: WorldOptions) {
  const w = world(on, options);
  await $.session.start({ ...SESSION, cwd });
  await $.command.run(SHOW);
  await w.clock.settle();
  const ui = await $.ui
    .mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    })
    .then(onBoard);
  return { w, ui };
}

const band = ($: Engine) =>
  $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "AbovePrompt",
    props: BAND_PROPS,
    viewport: VIEWPORT,
  });

/** A named session whose board shows All, as these tests count the whole store it reads. */
const named = (session: string, options: WorldOptions): WorldOptions => ({
  ...options,
  stored: { ...options.stored, [SCOPE_KEY]: { [session]: "all" } },
  env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: session },
});

const cwdsOf = (w: ReturnType<typeof world>, prefix: string) =>
  w.keys().flatMap((key, i) => (key.startsWith(prefix) ? [w.cwds[i]] : []));

describe("the store a session reads", () => {
  test("should read the KG store from the inventory when a kg-ec2-3 session's directory has no store", async ($, on) => {
    const { w, ui } = await openIn(
      $,
      on,
      KG_CWD,
      named("kg-ec2-3", { files: INVENTORY, script: stores(ALL_STORES) }),
    );

    expect(await ui.find({ key: "error-line" })).toBeUndefined();
    expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
    expect(cwdsOf(w, LIST).length).toBeGreaterThan(0);
    expect(new Set(cwdsOf(w, LIST))).toEqual(new Set([KG_STORE]));
    expect((await ui.find({ key: "header" }))?.text).toContain("KG (sw-bms-workspace)");
  });

  test("should read the store beads-ui.toml maps the directory's name to in the pane and the band", async ($, on) => {
    const mapped = "/home/me/kg-store";
    const { w, ui } = await openIn(
      $,
      on,
      KG_CWD,
      named("kg-ec2-3", {
        files: {
          [USER_CONFIG]: '[directory_stores]\n"bms-semantic-knowledge-graph" = "~/kg-store"\n',
        },
        script: stores([mapped]),
      }),
    );

    expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
    expect(new Set(cwdsOf(w, LIST))).toEqual(new Set([mapped]));
    expect(new Set(cwdsOf(w, "bd count "))).toEqual(new Set([mapped]));
    expect((await ui.find({ key: "header" }))?.text).toContain("kg-store");
    expect((await (await band($)).find({ key: "beads-band:own" }))?.text).toBe(
      "[bd] 1 task (0 in progress, 0 blocked, 1 open, 0 done last 24h) *",
    );
  });

  test("should read the session directory's own store as before when it has one", async ($, on) => {
    const { w, ui } = await openIn(
      $,
      on,
      CWD,
      named("aih-ec2-3", { files: INVENTORY, script: stores(ALL_STORES) }),
    );

    expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
    expect(new Set(cwdsOf(w, LIST))).toEqual(new Set([CWD]));
    expect((await ui.find({ key: "header" }))?.text).toContain("BU (beads-ui)");
  });

  for (const [session, store, label] of [
    ["aih-ec2-3", HARNESS, "AIH (ai-harness)"],
    ["aih-ec2-firstmate-1", HARNESS, "AIH (ai-harness)"],
    ["ai-cli-ec2-1", CLI, "AI_CLI (ai-cli-utils)"],
  ] as const) {
    test(`should read the ${label} store from the session name's prefix when ${session}'s directory has no store`, async ($, on) => {
      const { w, ui } = await openIn(
        $,
        on,
        SCRATCH,
        named(session, { files: INVENTORY, script: stores(ALL_STORES) }),
      );

      expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
      expect(new Set(cwdsOf(w, LIST))).toEqual(new Set([store]));
      expect((await ui.find({ key: "header" }))?.text).toContain(label);
    });
  }

  test("should name what it tried and how to add a mapping, and run no bd retry, when no store resolves", async ($, on) => {
    const inventory = { [INVENTORY_PATH]: inventoryOf({ AIH: { repo: HARNESS } }) };
    const { w, ui } = await openIn(
      $,
      on,
      KG_CWD,
      named("kg-ec2-3", { files: inventory, script: stores([HARNESS]) }),
    );

    const text = (await ui.find({ key: "no-store" }))?.text ?? "";
    expect(text).toContain("beads-ui found no Beads store for this session.");
    expect(text).toContain(`the session's directory ${KG_CWD} has no Beads store`);
    expect(text).toContain(`${KG_CWD}/beads-ui.toml`);
    expect(text).toContain(USER_CONFIG);
    expect(text).toContain(
      `the store inventory ${INVENTORY_PATH} has no store with the prefix KG (from the session name kg-ec2-3)`,
    );
    expect(text).toContain(`add this to ${USER_CONFIG}`);
    expect(text).toContain("[directory_stores]");
    expect(text).toContain("bms-semantic-knowledge-graph = ");
    expect((await ui.find({ key: "header" }))?.text).toContain("no store");
    expect(await ui.find({ key: "error-line" })).toBeUndefined();
    expect(text).not.toContain("retrying");

    // The band's own reads and its refresher start are not the pane's.
    const paneReads = () =>
      w.keys().filter((key) => !key.startsWith("bd count ") && !key.startsWith("node ")).length;
    const before = paneReads();
    await w.clock.advance(BEAT_MS * 3);

    expect(paneReads()).toBe(before);
    expect(w.keys().filter((key) => key === "bd where")).toHaveLength(1);
    expect(w.keys().some((key) => key === LIST || key === "bd statuses")).toBe(false);
  });

  test("should draw no band when an unnamed session's store does not resolve", async ($, on) => {
    const w = world(on, { script: stores([]) });
    await $.session.start({ ...SESSION, cwd: KG_CWD });
    await w.clock.settle();

    expect(await (await band($)).find({ key: "beads-band" })).toBeUndefined();
    expect(w.keys().some((key) => key.startsWith("bd count "))).toBe(false);
  });
});

describe("tab 3", () => {
  test("should draw 3 Sprint dimmed and say it is planned without leaving the tab when it is pressed", async ($, on) => {
    const { ui } = await openIn($, on, CWD, { script: stores([CWD]) });

    const sprint = await ui.find({ key: "tab:sprint" });
    expect(sprint?.props).toMatchObject({ hotkey: "3", dimColor: true, label: "Sprint" });

    await ui.press({ key: "tab:sprint" });

    expect((await ui.find({ key: "notice" }))?.text).toBe(SPRINT_PLANNED_TEXT);
    expect((await ui.find({ key: "column::open" }))?.text).toBe("open 20");
    expect((await ui.find({ key: "tab:board" }))?.props).not.toHaveProperty("dimColor");
  });

  test("should list 3 for the planned Sprint view in the help when it is open", async ($, on) => {
    const { ui } = await openIn($, on, CWD, { script: stores([CWD]) });

    await ui.press({ key: "help" });

    const help = (await ui.findAll({ type: "Box" })).find((element) => element.key === "help");
    expect(help?.text).toContain("3: Sprint (planned, not built yet)");
  });
});
