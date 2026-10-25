import type { On } from "claude-code";
import type { Engine } from "claude-code/testing";
import { describe, expect } from "claude-code/testing";

import comments from "../core/test/fixtures/bd-comments-BU-mg2.3.json.ts";
import show from "../core/test/fixtures/bd-show.json.ts";
import { ANSWER_KEY, CLOSE_KEY, ISSUE_KEY, SEND_KEY } from "./components/review.ts";
import { PANE_ID, PLUGIN_NAME } from "./register.ts";
import { ANSWERS_DIR } from "./review.ts";
import { test } from "./tests/kit.ts";
import { ME, MINE } from "./tests/mine.ts";
import { render } from "./tests/render.ts";
import {
  BAND_PROPS,
  CWD,
  countScript,
  exit,
  INVENTORY_PATH,
  inventoryOf,
  type Listed,
  listScript,
  ok,
  PANE_PROPS,
  REFRESHER_TOKEN,
  type Script,
  SESSION,
  SHOW,
  START_MS,
  STATE_DIR,
  VIEWPORT,
  world,
} from "./tests/world.ts";

// T-2C.5 (D-37 to D-40): an issue's review items in its Detail, the reader and the answer, at the
// hooks entry point. A host refresher is played running, its review snapshot written under its
// token, and the held store's command is a stub argv the world answers.

const PYTHON = "/opt/fleet/.venv/bin/python";
const HELD = "/opt/fleet/scripts/held_cli.py";
const CONFIG = "/home/me/.config/beads-ui/beads-ui.toml";
/** The install's own form: the whole review call, whose verb the mod replaces with its own. */
const REVIEW_CONFIG = `[review]\ncommand = ["${PYTHON}", "${HELD}", "review", "--scope", "pair", "--json"]\n`;
const SNAPSHOT = `${STATE_DIR}/review-${REFRESHER_TOKEN}.json`;
const STORE = "/home/me/projects/ai-harness";
const DISPLAY = "BU-beads-ui-claude-code-aeyb";

/** A held item as the refresher writes it into the review snapshot. */
const held = (dir: string, file: string, extra: Record<string, unknown>) => ({
  path: `${STORE}/docs/held/${dir}/${file}`,
  store: "ai-harness",
  relpath: `docs/held/${dir}/${file}`,
  kind: "decision",
  status: "open",
  session: "aih-ec2-3@sem-kg-ec2",
  machine: "sem-kg-ec2",
  task: "BU-mg2.3",
  title: "a held item",
  ask: "",
  createdAt: "2026-10-25T09:00:00Z",
  selection: "current",
  ...extra,
});

const DECISION = held("sem-kg-ec2--aih-ec2-3", "2026-10-25-01-decision-d37.md", {
  title: "D-37: where review items come from",
  ask: "Approve (a), the held_cli.py review verb; one word is enough.",
});
const BLOCKER = held("sem-kg-ec2--aih-ec2-firstmate-1", "2026-10-25-02-blocker-install.md", {
  kind: "blocker",
  session: "aih-ec2-firstmate-1@sem-kg-ec2",
  task: DISPLAY,
  title: "the review command is not installed on acn-mac",
  ask: "Run the install on acn-mac, or say to wait.",
  createdAt: "2026-10-25T10:00:00Z",
});
const WAITED = held("sem-kg-ec2--kg-ec2-1", "2026-10-25-01-blocker-owner.md", {
  kind: "blocker",
  session: "kg-ec2-1@sem-kg-ec2",
  task: "none",
  title: "Sergei to approve the Confluence space",
  ask: "Approve the space request.",
  createdAt: "2026-10-25T08:00:00Z",
});
const ELSEWHERE = held("sem-kg-ec2--aih-ec2-3", "2026-10-25-03-decision-other.md", {
  task: "BU-mg2.3.5",
  title: "a decision about another issue",
});

const snapshotOf = (items: readonly unknown[]) =>
  JSON.stringify({
    schema: 1,
    token: REFRESHER_TOKEN,
    readAt: START_MS - 30_000,
    checkedAt: START_MS - 30_000,
    fingerprint: "fp-1",
    host: "sem-kg-ec2",
    pair: ["acn-mac", "sem-kg-ec2"],
    scope: "pair",
    items,
    joins: [],
  });

/** BU-mg2.3 blocked by an open BU-mg2.3.9, its blocked transition waiting on WAITED. */
const SHOWN = JSON.stringify(
  (JSON.parse(show) as Record<string, unknown>[]).map((row) => ({
    ...row,
    status: "blocked",
    dependencies: [
      ...(row.dependencies as unknown[]),
      {
        id: "BU-mg2.3.9",
        title: "T-1.5: delete confirmation flow",
        status: "open",
        dependency_type: "blocks",
      },
    ],
  })),
);
const TRANSITION = [
  "[blocked 2026-10-25T08:05:00Z] from: in_progress",
  "why: the Confluence space must exist before the pages move.",
  "waits on: owner:ai-harness/docs/held/sem-kg-ec2--kg-ec2-1/2026-10-25-01-blocker-owner.md",
  "to done: the pages are published in the space.",
  "to in_progress: the space is approved; publish from the drafts.",
  "by: kg-ec2-1@sem-kg-ec2",
].join("\n");
const COMMENTED = JSON.stringify([
  ...(JSON.parse(comments) as unknown[]),
  {
    id: "c-blocked",
    issue_id: "BU-mg2.3",
    author: "kg-ec2-1",
    text: TRANSITION,
    created_at: "2026-10-25T08:05:00Z",
  },
]);

const BODY = "## D-37: where review items come from\n\nThe body, byte for byte.\n\n## Answer\n";

const isHeld = (argv: readonly string[], verb: string) =>
  argv[0] === PYTHON && argv[1] === HELD && argv[2] === verb;

interface Options {
  config?: string;
  items?: readonly unknown[];
  body?: string;
  answer?: Script;
}

/** The task panel's session with the review snapshot, the Detail of BU-mg2.3 open. */
async function detail($: Engine, on: On, options: Options = {}) {
  const submitted: string[] = [];
  const w = world(on, {
    ...MINE,
    refresher: true,
    files: {
      [CONFIG]: options.config ?? REVIEW_CONFIG,
      [SNAPSHOT]: snapshotOf(options.items ?? [DECISION, BLOCKER, WAITED, ELSEWHERE]),
    },
    script: (key, argv, cwd) => {
      if (key === "bd show BU-mg2.3") return ok(SHOWN);
      if (key === "bd comments BU-mg2.3") return ok(COMMENTED);
      if (isHeld(argv, "show")) {
        return ok(JSON.stringify({ path: argv[3], frontmatter: {}, body: options.body ?? BODY }));
      }
      if (isHeld(argv, "answer")) return options.answer?.(key, argv, cwd);
      return MINE.script?.(key, argv, cwd);
    },
  });
  on("prompt.submit", (_engine, e) => {
    submitted.push(e.text);
    return { text: e.text };
  });
  await $.session.start(SESSION);
  await $.command.run(SHOW);
  await w.clock.settle();
  const ui = await $.ui.mount({
    plugin: PLUGIN_NAME,
    surface: "terminal",
    component: "Pane",
    props: PANE_PROPS,
    requestId: PANE_ID,
    viewport: VIEWPORT,
  });
  await ui.press({ key: "task:BU-mg2.3" });
  await w.clock.settle();
  return { w, ui, submitted };
}

type Mounted = Awaited<ReturnType<typeof detail>>["ui"];

const keys = async (ui: Mounted) =>
  (await ui.findAll({})).map((element) => element.key ?? "").filter((key) => key !== "");
const rowKeys = async (ui: Mounted) =>
  (await keys(ui)).filter((key) => key.startsWith("review-row:"));
const textOf = async (ui: Mounted, key: string) => (await ui.find({ key }))?.text;

const DECISION_ROW = "sem-kg-ec2--aih-ec2-3/2026-10-25-01-decision-d37.md";
const BLOCKER_ROW = "sem-kg-ec2--aih-ec2-firstmate-1/2026-10-25-02-blocker-install.md";
const WAITED_ROW = "sem-kg-ec2--kg-ec2-1/2026-10-25-01-blocker-owner.md";

/** Opens the decision in the reader. */
async function reader($: Engine, on: On, options: Options = {}) {
  const opened = await detail($, on, options);
  await opened.ui.press({ key: `review:${DECISION_ROW}` });
  await opened.w.clock.settle();
  return opened;
}

describe("an issue's review items in its Detail (T-2C.5, D-40)", () => {
  test("should draw a Review section above the description, unasked, with the held items about the issue by bd id, by display id and by its blocked transition's wait, and its bd blockers", async ($, on) => {
    const { ui } = await detail($, on);

    const drawn = await keys(ui);
    expect(drawn.indexOf("review")).toBeGreaterThan(-1);
    expect(drawn.indexOf("review")).toBeLessThan(drawn.indexOf("detail-fields"));
    expect(drawn.indexOf("review")).toBeLessThan(drawn.indexOf("detail-text"));
    expect(drawn.indexOf("detail-heading")).toBeLessThan(drawn.indexOf("review"));
    expect(await textOf(ui, "review-heading")).toBe("Review (9)");
    expect(await rowKeys(ui)).toEqual([
      `review-row:${DECISION_ROW}`,
      `review-row:${BLOCKER_ROW}`,
      `review-row:${WAITED_ROW}`,
    ]);
    expect(await textOf(ui, `review-row:${DECISION_ROW}`)).toContain(
      "decision: D-37: where review items come from",
    );
    expect(await textOf(ui, `review-ask:${DECISION_ROW}`)).toBe(
      "  Approve (a), the held_cli.py review verb; one word is enough.",
    );
    expect(await textOf(ui, `review-meta:${DECISION_ROW}`)).toBe(
      "  open, aih-ec2-3@sem-kg-ec2, held 2026-10-25 09:00",
    );
    expect(await textOf(ui, `review-meta:${WAITED_ROW}`)).toBe(
      "  open, kg-ec2-1@sem-kg-ec2, held 2026-10-25 08:00; the blocked transition waits on it",
    );
    expect(await textOf(ui, "review-blocked-by:BU-mg2.3.9")).toBe(
      "  blocked by BU-mg2.3.9: T-1.5: delete confirmation flow (open)",
    );
    expect(await textOf(ui, "review-blocked:since")).toBe(
      "  blocked 2026-10-25 08:05 from in_progress by kg-ec2-1@sem-kg-ec2",
    );
    expect(await textOf(ui, "review-blocked:why")).toBe(
      "  why: the Confluence space must exist before the pages move.",
    );
    expect(await textOf(ui, "review-blocked:waits on")).toContain("owner:ai-harness/docs/held/");
    expect(await textOf(ui, "review-blocked:to done")).toBe(
      "  to done: the pages are published in the space.",
    );
    expect(await textOf(ui, "review-blocked:to in_progress")).toBe(
      "  to in_progress: the space is approved; publish from the drafts.",
    );
    expect((await keys(ui)).some((key) => key.includes("decision-other"))).toBe(false);
  });

  test("should list a pair item about the issue held by another session, in a session that neither holds it nor owns it (D-38)", async ($, on) => {
    const { ui } = await detail($, on, { items: [BLOCKER, ELSEWHERE] });

    expect(await rowKeys(ui)).toEqual([`review-row:${BLOCKER_ROW}`]);
    expect(await textOf(ui, `review-meta:${BLOCKER_ROW}`)).toContain(
      "aih-ec2-firstmate-1@sem-kg-ec2",
    );
  });

  test("should draw the bd blockers alone, say how to set the command and run no held command while [review] command is unset", async ($, on) => {
    const { w, ui } = await detail($, on, { config: `[sync]\ncommand = ["publish"]\n` });

    expect(await rowKeys(ui)).toEqual([]);
    expect(await textOf(ui, "review-heading")).toBe("Review (6)");
    expect(await textOf(ui, "review-blocked-by:BU-mg2.3.9")).toContain("blocked by BU-mg2.3.9");
    expect(await textOf(ui, "review-unset")).toBe(
      'Held items are not read: set [review] command in your own beads-ui.toml, such as command = ["held_cli.py"].',
    );
    expect(w.runs.some((argv) => argv[0] === PYTHON)).toBe(false);
  });

  test("should read [review] command from the user's file alone, never the repository's", async ($, on) => {
    const w = world(on, {
      ...MINE,
      refresher: true,
      files: { [`${CWD}/beads-ui.toml`]: REVIEW_CONFIG, [SNAPSHOT]: snapshotOf([DECISION]) },
      script: (key, argv, cwd) =>
        key === "bd show BU-mg2.3" ? ok(SHOWN) : MINE.script?.(key, argv, cwd),
    });
    await $.session.start(SESSION);
    await $.command.run(SHOW);
    await w.clock.settle();
    const ui = await $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    });
    await ui.press({ key: "task:BU-mg2.3" });
    await w.clock.settle();

    expect(await rowKeys(ui)).toEqual([]);
    expect(await ui.find({ key: "review-unset" })).toBeDefined();
  });
});

describe("the reader (T-2C.5, D-39)", () => {
  test("should show the item's full body from the show command, with Answer, Send to session, Go to issue and Close", async ($, on) => {
    const { w, ui } = await reader($, on);

    expect(w.runs.filter((argv) => isHeld(argv, "show"))).toEqual([
      [PYTHON, HELD, "show", `${STORE}/docs/held/${DECISION_ROW}`, "--json"],
    ]);
    expect(await textOf(ui, "reader-title")).toBe("decision: D-37: where review items come from");
    expect(await textOf(ui, "reader-path")).toBe(`${STORE}/docs/held/${DECISION_ROW}`);
    expect((await ui.find({ key: "reader-body:0" }))?.props.text).toBe(BODY);
    for (const key of [ANSWER_KEY, SEND_KEY, ISSUE_KEY, CLOSE_KEY]) {
      expect(await ui.find({ key }), key).toBeDefined();
    }
    expect(await ui.find({ key: "review" })).toBeUndefined();
  });

  test("should page a long body so that no drawing passes the 100,000-character tree limit and every page together is the body", async ($, on) => {
    const line = (i: number) => `line ${i}: ${"a decision's reasoning, ".repeat(6)}\n`;
    const body = Array.from({ length: 2_000 }, (_, i) => line(i)).join("");
    expect(body.length).toBeGreaterThan(250_000);
    const { w, ui } = await reader($, on, { body });

    const pages: string[] = [];
    let largest = 0;
    for (;;) {
      largest = Math.max(largest, JSON.stringify(await ui.drawn()).length);
      const shown = (await ui.findAll({ type: "Markdown" })).find((one) =>
        (one.key ?? "").startsWith("reader-body:"),
      );
      pages.push(String(shown?.props.text ?? ""));
      if ((await ui.find({ key: "reader:later" })) === undefined) break;
      await ui.press({ key: "reader:later" });
      await w.clock.settle();
    }

    expect(pages.length).toBeGreaterThan(10);
    expect(pages.join("")).toBe(body);
    expect(largest).toBeLessThan(100_000);
    expect(await textOf(ui, "reader-pages")).toContain(`page ${pages.length} of ${pages.length}`);
  });

  test("should close onto the Detail, and Go to issue should close onto the issue's Detail", async ($, on) => {
    const { w, ui } = await reader($, on);

    await ui.press({ key: CLOSE_KEY });
    await w.clock.settle();
    expect(await ui.find({ key: "reader" })).toBeUndefined();
    expect(await ui.find({ key: "review" })).toBeDefined();

    await ui.press({ key: `review:${BLOCKER_ROW}` });
    await w.clock.settle();
    await ui.press({ key: ISSUE_KEY });
    await w.clock.settle();
    expect(await ui.find({ key: "reader" })).toBeUndefined();
    expect(await textOf(ui, "detail-heading")).toContain(DISPLAY);
  });
});

describe("answering from the reader (T-2C.5, D-39)", () => {
  const ANSWERED = (argv: readonly string[]) =>
    ok(
      JSON.stringify({
        status: "ok",
        path: argv[3],
        commit: "abc1234",
        answered_at: "2026-10-21T01:13:00Z",
        beads_notes_update: [],
      }),
    );
  const TYPED = "a, with one change:\nkeep the verb read-only.  ";

  test("should record the text exactly as typed with the answer command and start the fixed-template turn", async ($, on) => {
    const { w, ui, submitted } = await reader($, on, {
      answer: (_key, argv) => ANSWERED(argv),
    });

    await ui.input({ key: ANSWER_KEY, text: TYPED });
    await w.clock.settle();

    const [argv, ...more] = w.runs.filter((one) => isHeld(one, "answer"));
    expect(more).toEqual([]);
    const file = argv?.[5] ?? "";
    expect(argv).toEqual([
      PYTHON,
      HELD,
      "answer",
      `${STORE}/docs/held/${DECISION_ROW}`,
      "--text-file",
      file,
      "--json",
    ]);
    expect(file.startsWith(`${STATE_DIR}/${ANSWERS_DIR}/`)).toBe(true);
    expect(w.files.get(file)).toBe(TYPED);
    expect(submitted).toEqual([
      [
        "beads-ui recorded Sergei's answer to a held item, typed in the pane's reader.",
        "",
        `- Item: ${STORE}/docs/held/${DECISION_ROW}`,
        "- Kind: decision",
        "- Title: D-37: where review items come from",
        "- Owner session: aih-ec2-3@sem-kg-ec2",
        "- Answer commit: abc1234",
        "",
        "The text below is Sergei's answer, verbatim. held_cli.py answer wrote it under the item's ## Answer.",
        "",
        "```text sergei-answer",
        TYPED,
        "```",
        "",
        "This session holds the item. Record the answer in its durable home (a bd comment on its task, or the decision in its design or plan doc), ship that, act on the answer, then retire the item with held_cli.py retire naming that home.",
      ].join("\n"),
    ]);
    expect(await textOf(ui, "reader-outcome")).toBe(
      "answered in commit abc1234; the session was handed the follow-through",
    );
    expect(await textOf(ui, "reader-status")).toContain("answered 2026-10-21 01:13");
    // The refresher runs the review verb again at once (D-37).
    expect(JSON.parse(w.files.get(`${STATE_DIR}/wake/review.json`) ?? "{}").path).toBe(
      `${STORE}/docs/held/${DECISION_ROW}`,
    );
  });

  test("should ask the session to tell the owner session when another session holds the answered item", async ($, on) => {
    const { w, ui, submitted } = await detail($, on, { answer: (_key, argv) => ANSWERED(argv) });
    await ui.press({ key: `review:${BLOCKER_ROW}` });
    await w.clock.settle();

    await ui.input({ key: ANSWER_KEY, text: "wait for Monday" });
    await w.clock.settle();

    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toContain("- Owner session: aih-ec2-firstmate-1@sem-kg-ec2");
    expect(submitted[0]).toContain(
      "aih-ec2-firstmate-1@sem-kg-ec2 holds the item, not this session. Tell aih-ec2-firstmate-1@sem-kg-ec2 through the fleet's messaging ladder that Sergei answered it, with the item's path and the answer commit, so that it records the answer, records its durable home and ships it. Do not record or retire the item from this session.",
    );
  });

  test("should show the refusal, keep the typed text, start no turn, and Send to session should start the turn with no answer commit", async ($, on) => {
    const refusal = {
      status: "error",
      key: "clean",
      detail: "answer refused: the landing pad has uncommitted changes",
    };
    const { w, ui, submitted } = await reader($, on, {
      answer: () => exit(4, `held: clean: ${refusal.detail}\n`, JSON.stringify(refusal)),
    });

    await ui.input({ key: ANSWER_KEY, text: TYPED });
    await w.clock.settle();

    expect(await textOf(ui, "reader-outcome")).toBe(
      "the answer was not recorded: the answer command exited 4: answer refused: the landing pad has uncommitted changes. The text is kept: Send to session hands it to the session.",
    );
    expect((await ui.find({ key: ANSWER_KEY }))?.props.value).toBe(TYPED);
    expect(submitted).toEqual([]);

    await ui.press({ key: SEND_KEY });
    await w.clock.settle();

    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toContain("- Answer commit: none");
    expect(submitted[0]).toContain(
      "The text below is Sergei's answer, verbatim. It is not yet written under the item's ## Answer.",
    );
    expect(submitted[0]).toContain(`\`\`\`text sergei-answer\n${TYPED}\n\`\`\``);
    expect(submitted[0]).toContain(
      "This session holds the item. Record the text with held_cli.py answer from a file holding it byte for byte",
    );
    expect(w.runs.filter((argv) => isHeld(argv, "answer"))).toHaveLength(1);
    expect(await textOf(ui, "reader-outcome")).toBe(
      "sent to the session with no answer commit: it records the answer",
    );
  });
});

describe("the review section in the band's overview (T-2C.5, D-35)", () => {
  const TASKS: readonly Listed[] = [
    { id: "BU-1", status: "in_progress", assignee: ME, priority: 1, title: "reviewed work" },
  ];

  test("should draw the same held item rows in a task's detail on the band, and open the reader in the pane", async ($, on) => {
    const item = { ...DECISION, task: "BU-1" };
    const w = world(on, {
      env: { HOME: "/home/me", CLAUDE_CODE_TASK_LIST_ID: ME },
      refresher: true,
      files: {
        [CONFIG]: REVIEW_CONFIG,
        [SNAPSHOT]: snapshotOf([item]),
        [INVENTORY_PATH]: inventoryOf({ BU: { repo: CWD } }),
      },
      script: (key, argv, cwd) =>
        isHeld(argv, "show")
          ? ok(JSON.stringify({ path: argv[3], frontmatter: {}, body: BODY }))
          : (listScript({ [CWD]: TASKS })(key, argv, cwd) ??
            countScript({ [CWD]: TASKS })(key, argv, cwd)),
    });
    await $.session.start(SESSION);
    await w.clock.settle();
    const band = () =>
      $.ui.mount({
        plugin: PLUGIN_NAME,
        surface: "terminal",
        component: "AbovePrompt",
        props: { ...BAND_PROPS, maxRows: 12 },
        viewport: VIEWPORT,
      });
    for (const key of ["band-count:own:in_progress", "band-open:BU-1"]) {
      await (await band()).press({ key });
      await w.clock.settle();
    }

    const shown = await band();
    expect((await shown.find({ key: "review-heading" }))?.text).toBe("Review (1)");
    expect((await shown.find({ key: `review-row:${DECISION_ROW}` }))?.text).toContain(
      "decision: D-37: where review items come from",
    );
    expect(render(await shown.drawn(), 120).length).toBeLessThanOrEqual(12);

    await shown.press({ key: `review:${DECISION_ROW}` });
    await w.clock.settle();
    const pane = await $.ui.mount({
      plugin: PLUGIN_NAME,
      surface: "terminal",
      component: "Pane",
      props: PANE_PROPS,
      requestId: PANE_ID,
      viewport: VIEWPORT,
    });
    expect((await pane.find({ key: "reader-title" }))?.text).toBe(
      "decision: D-37: where review items come from",
    );
  });
});
