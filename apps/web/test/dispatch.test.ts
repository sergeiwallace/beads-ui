import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CONTROL_STATEMENT, controlAnswer, FOLLOW_UPS_FILE } from "../server/dispatch.ts";
import { type RunningServer, startServer } from "../server/server.ts";
import {
  type HostEnv,
  hostConfig,
  hostEnv,
  type Reply,
  repoName,
  runCli,
  SAME_ORIGIN_WRITE,
  send,
  signIn,
} from "./auth-env.ts";
import { createStore, type TestStore } from "./store.ts";

// The Review queue's reads and the dispatch routes through the running server (T-W1.1, T-W1.2,
// T-W1.3, T-W1.6, server side): the held store's verbs run as a subprocess (a stand-in tool that
// prints what its directory holds), every dispatch is read back through the receiver API with the
// receiving host's own token, and every bd comment and status from the real store.

const FAKE_HELD = fileURLToPath(new URL("./fixtures/fake-held.mjs", import.meta.url));
const FAKE_UNBLOCK = fileURLToPath(new URL("./fixtures/fake-unblock.mjs", import.meta.url));

let store: TestStore;
let env: HostEnv;
let server: RunningServer;
let cookie: string;
let heldDir: string;
let clientDir: string;
let tokens: Record<string, string>;
const ids = {} as Record<"owned" | "joined" | "blocked" | "orphan" | "open" | "closed", string>;

const itemPath = (name: string) => `/stores/held/docs/held/host-c/holder/2026/11/09/${name}.md`;

function reviewItem(name: string, overrides: Record<string, unknown> = {}) {
  return {
    path: itemPath(name),
    relpath: `docs/held/host-c/holder/2026/11/09/${name}.md`,
    store: repoName(store.dir),
    kind: "decision",
    status: "open",
    selection: "current",
    session: "holder@host-c",
    machine: "host-c",
    task: "none",
    title: `Decide ${name}`,
    ask: `Pick for ${name}`,
    created_at: "2026-11-09T10:00:00Z",
    ...overrides,
  };
}

const DECISIONS = [
  {
    id: "D-3",
    title: "How an answer is recorded",
    options: [
      { key: "a", label: "Name the option and say a control chose it" },
      { key: "b", label: "Fill the composer and require Send" },
    ],
    recommended: "a",
    anchor: "decision-d-3",
  },
];

async function writeHeld(files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(heldDir, name, ".."), { recursive: true });
    await writeFile(join(heldDir, name), text);
  }
}

async function resetHeld() {
  if (existsSync(heldDir)) await rm(heldDir, { recursive: true });
  await mkdir(join(heldDir, "bodies"), { recursive: true });
  await writeHeld({
    "review.json": JSON.stringify({
      schema: 1,
      fingerprint: "f1",
      host: "host-c",
      pair: ["host-c"],
      scope: "pair",
      read_at: "2026-11-09T12:00:00Z",
      stores: {
        [repoName(store.dir)]: { path: "/stores/held/docs/held", status: "ok", error: null },
      },
      items: [
        reviewItem("decide-one", { task: ids.joined }),
        reviewItem("decide-elsewhere", { store: "unlisted-repo" }),
        reviewItem("superseded", { selection: "superseded" }),
      ],
    }),
    "options.json": JSON.stringify({
      version: 1,
      items: [
        { item: itemPath("decide-one"), kind: "decision", decisions: DECISIONS, error: null },
        { item: itemPath("decide-elsewhere"), kind: "decision", decisions: DECISIONS, error: null },
        { item: itemPath("superseded"), kind: "decision", decisions: DECISIONS, error: null },
      ],
    }),
    "bodies/decide-one.md": "# Decide one\n\n## Decision D-3\n",
  });
}

function config(extra = "") {
  const name = repoName(store.dir);
  return hostConfig({
    allowRepos: [name],
    auth: { signing_key: "state:dispatch-signing-key", signing_key_id: "host-a-20261109" },
    extra: [
      `[hosts.host-b]\nallow_repos = ["${name}"]`,
      `[hosts.host-c]\nallow_repos = ["${name}"]`,
      `[review]\ncommand = ${JSON.stringify([process.execPath, FAKE_HELD, heldDir])}`,
      `[dispatch]\nhost = "host-b"\nunblock_command = ${JSON.stringify([process.execPath, FAKE_UNBLOCK, heldDir])}`,
      extra,
    ].join("\n\n"),
  });
}

const get = (path: string): Promise<Reply> => send(server, path, { headers: { cookie } });
const post = (path: string, body: unknown): Promise<Reply> =>
  send(server, path, {
    method: "POST",
    headers: { ...SAME_ORIGIN_WRITE, cookie },
    body: JSON.stringify(body),
  });

const receiver = (host: string, path: string, body?: unknown) =>
  send(server, `/api/receiver/v1${path}`, {
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    headers: {
      authorization: `Bearer ${tokens[host]}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  });

const comments = async (id: string) =>
  (JSON.parse(await store.bd("comments", id, "--json")) as { text: string }[] | null) ?? [];

type Indicators = Record<"liveness" | "delivery" | "response", { text: string; source: string }>;

interface Written {
  dispatch: { id: string; kind: string; target: { session: string; host: string }; state: string };
}

beforeAll(async () => {
  store = await createStore("work");
  ids.owned = await store.create("Owned task", { status: "in_progress" });
  await store.bd("update", ids.owned, "--assignee", "worker");
  ids.joined = await store.create("Joined task", { status: "in_progress" });
  ids.blocked = await store.create("Blocked task", { status: "blocked" });
  await store.bd("update", ids.blocked, "--assignee", "worker@host-c");
  ids.orphan = await store.create("Blocked and unowned", { status: "blocked" });
  ids.open = await store.create("Open task");
  ids.closed = await store.create("Done task", { status: "closed" });
  env = await hostEnv();
  heldDir = join(env.configHome, "held");
  await resetHeld();
  await env.write(config());
  clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
  tokens = {};
  for (const host of ["host-b", "host-c"]) {
    const issued = await runCli(env, store.dir, ["issue-receiver-token", host]);
    tokens[host] = issued.stdout.trim();
  }
  server = await startServer({ repoRoot: store.dir, port: 0, clientDir, configEnv: env.configEnv });
  cookie = await signIn(server);
});

afterAll(async () => {
  await server?.close();
  await env?.remove();
  await store?.remove();
});

describe("GET /api/review (T-W1.1)", () => {
  it("should list the allowlisted open held items, joined to their issue, and the blocked and in-progress tasks", async () => {
    const reply = await get("/api/review");
    expect(reply.status).toBe(200);
    const body = reply.json() as {
      held: {
        state: string;
        rows: { item: { path: string }; joined?: { issue: { id: string } } }[];
      };
      options: { state: string; stdout: string };
      tasks: { repo: string; issue: { id: string; status: string } }[];
      health: string[];
    };
    expect(body.held.state).toBe("ok");
    expect(body.held.rows.map((row) => row.item.path)).toEqual([itemPath("decide-one")]);
    expect(body.held.rows[0]?.joined?.issue.id).toBe(ids.joined);
    expect(JSON.parse(body.options.stdout).items.map((row: { item: string }) => row.item)).toEqual([
      itemPath("decide-one"),
    ]);
    expect(body.tasks.map((task) => task.issue.id).sort()).toEqual(
      [ids.owned, ids.joined, ids.blocked, ids.orphan].sort(),
    );
    expect(body.tasks.every((task) => task.repo === repoName(store.dir))).toBe(true);
    expect(body.health.join("\n")).toMatch(
      /1 row from repositories not on this host's allowlist is hidden/,
    );
    expect(JSON.stringify(body)).not.toContain("unlisted-repo");
  });

  it("should still list the tasks and name the failed held read with its exit code when the review command fails", async () => {
    await writeHeld({
      "review.exit": "3",
      "review.stderr": "held: store ai: unreadable\n",
      "review.json": "",
    });
    try {
      const body = (await get("/api/review")).json() as {
        held: { state: string; failure: { source: string; exitCode: number; detail: string } };
        tasks: unknown[];
      };
      expect(body.held).toEqual({
        state: "failed",
        failure: { source: "held review", exitCode: 3, detail: "held: store ai: unreadable" },
      });
      expect(body.tasks).toHaveLength(4);
    } finally {
      await resetHeld();
    }
  });

  it("should name the options read as failed, and pass none of its output on, when the options command prints malformed output", async () => {
    const leak = `unlisted-repo ${itemPath("decide-elsewhere")}`;
    for (const printed of [
      `not JSON: ${leak}`,
      JSON.stringify({ version: 1, items: leak }),
      JSON.stringify([{ item: itemPath("decide-elsewhere"), store: "unlisted-repo" }]),
    ]) {
      await writeHeld({ "options.json": printed });
      try {
        const reply = await get("/api/review");
        expect(reply.status).toBe(200);
        const body = reply.json() as {
          held: { state: string };
          options: { state: string; failure?: { source: string; detail?: string } };
        };
        expect(body.held.state).toBe("ok");
        expect(body.options.state, printed).toBe("failed");
        expect(body.options.failure?.source).toBe("held options");
        expect(body.options.failure?.detail).toMatch(/not the options JSON/);
        expect(reply.text, printed).not.toContain("unlisted-repo");
        expect(reply.text, printed).not.toContain("decide-elsewhere");
      } finally {
        await resetHeld();
      }
    }
  });

  it("should say held items are not read when no review command is set", async () => {
    await env.write(config().replace(/\[review\]\ncommand = .*\n/, ""));
    try {
      const body = (await get("/api/review")).json() as {
        held: { state: string; message: string };
      };
      expect(body.held.state).toBe("unset");
      expect(body.held.message).toMatch(/set \[review\] command/);
    } finally {
      await env.write(config());
    }
  });

  it("should return a listed held item's body and refuse a path the queue does not hold", async () => {
    const shown = await get(`/api/review/body?path=${encodeURIComponent(itemPath("decide-one"))}`);
    expect(shown.json()).toEqual({
      path: itemPath("decide-one"),
      body: "# Decide one\n\n## Decision D-3\n",
    });
    const other = await get(`/api/review/body?path=${encodeURIComponent("/etc/passwd")}`);
    expect(other.status).toBe(404);
  });
});

describe("POST /api/dispatch/prompt (T-W1.3)", () => {
  it("should write one dispatch with a new id each time, queued for the owner, and mirror a bd comment naming it", async () => {
    const first = await post("/api/dispatch/prompt", {
      repo: repoName(store.dir),
      task: ids.owned,
      text: "Pick it up",
    });
    const second = await post("/api/dispatch/prompt", {
      repo: repoName(store.dir),
      task: ids.owned,
      text: "Then report",
    });
    expect(first.status).toBe(201);
    const a = (first.json() as Written).dispatch;
    const b = (second.json() as Written).dispatch;
    expect(a).toMatchObject({
      kind: "prompt",
      target: { session: "worker", host: "host-b" },
      state: "queued",
    });
    expect(a.id).not.toBe(b.id);
    const texts = (await comments(ids.owned)).map((comment) => comment.text);
    expect(texts.filter((text) => text.includes(a.id))).toHaveLength(1);
    expect(texts.filter((text) => text.includes(b.id))).toHaveLength(1);
    const listed = (await receiver("host-b", "/dispatches?session=worker")).json() as {
      dispatches: { id: string }[];
    };
    expect(listed.dispatches.map((one) => one.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    const bytes = await receiver("host-b", `/dispatches/${a.id}/body?session=worker`);
    expect(bytes.text).toBe("Pick it up");
  });

  it("should refuse a prompt on a task no session owns and write nothing", async () => {
    const reply = await post("/api/dispatch/prompt", {
      repo: repoName(store.dir),
      task: ids.open,
      text: "hello",
    });
    expect(reply.status).toBe(403);
    expect((reply.json() as { error: { message: string } }).error.message).toMatch(
      /has no owning session/,
    );
    expect(await comments(ids.open)).toEqual([]);
  });

  it("should send a prompt on a held item to the session holding it", async () => {
    const reply = await post("/api/dispatch/prompt", {
      item: itemPath("decide-one"),
      text: "Say more about D-3",
    });
    expect((reply.json() as Written).dispatch.target).toEqual({
      session: "holder",
      host: "host-c",
    });
  });
});

describe("GET /api/dispatch/:id (T-W1.3, D-5)", () => {
  it("should show liveness, delivery and the response as three indicators, each naming its source, as receipts arrive", async () => {
    const { dispatch } = (
      await post("/api/dispatch/prompt", {
        repo: repoName(store.dir),
        task: ids.owned,
        text: "Status?",
      })
    ).json() as Written;
    const before = (await get(`/api/dispatch/${dispatch.id}`)).json() as Record<
      string,
      { text: string; source: string }
    >;
    expect(before.liveness).toEqual({
      text: "unknown",
      source: "no work queue is configured ([queue] url)",
      tone: "idle",
    });
    expect(before.delivery).toMatchObject({ text: "queued", source: "dispatch record" });
    expect(before.response).toMatchObject({
      text: "none yet",
      source: "receipts from the target session",
    });
    const taken = await receiver("host-b", `/dispatches/${dispatch.id}/receipts`, {
      session: "worker",
      state: "taken",
    });
    expect(taken.status).toBe(204);
    const after = (await get(`/api/dispatch/${dispatch.id}`)).json() as Indicators;
    expect(after.delivery).toMatchObject({ text: "taken", source: "receipt from worker@host-b" });
    expect(after.response.text).toBe("working on it");
    expect(after.response.source).toMatch(/^receipt from worker@host-b at /);
  });
});

describe("POST /api/dispatch/answer (T-W1.2)", () => {
  it("should write an answer of the option letter and the control statement to the session holding the item", async () => {
    const reply = await post("/api/dispatch/answer", {
      item: itemPath("decide-one"),
      choices: [{ decision: "D-3", key: "a" }],
    });
    expect(reply.status).toBe(201);
    const { dispatch, answer } = reply.json() as Written & { answer: string };
    expect(dispatch).toMatchObject({
      kind: "answer",
      target: { session: "holder", host: "host-c" },
    });
    expect(answer).toBe(
      controlAnswer([{ decision: "D-3", key: "a", label: DECISIONS[0]?.options[0]?.label ?? "" }]),
    );
    expect(answer).toContain("D-3: (a)");
    expect(answer).toContain(CONTROL_STATEMENT);
    const body = await receiver("host-c", `/dispatches/${dispatch.id}/body?session=holder`);
    expect(JSON.parse(body.text)).toEqual({
      version: 1,
      item: {
        store: repoName(store.dir),
        relpath: "docs/held/host-c/holder/2026/11/09/decide-one.md",
        path: itemPath("decide-one"),
      },
      answer,
    });
    const texts = (await comments(ids.joined)).map((comment) => comment.text);
    expect(texts.some((text) => text.includes(dispatch.id))).toBe(true);
  });

  it("should record a typed answer exactly as typed", async () => {
    const typed = "(b), but only for the bulk path.\n\nThe rest stays (a).";
    const { dispatch } = (
      await post("/api/dispatch/answer", { item: itemPath("decide-one"), text: typed })
    ).json() as Written;
    const body = await receiver("host-c", `/dispatches/${dispatch.id}/body?session=holder`);
    expect((JSON.parse(body.text) as { answer: string }).answer).toBe(typed);
  });

  it("should refuse a choice that is not one of the decision's options, and an item the queue does not hold", async () => {
    const wrong = await post("/api/dispatch/answer", {
      item: itemPath("decide-one"),
      choices: [{ decision: "D-3", key: "z" }],
    });
    expect(wrong.status).toBe(400);
    const elsewhere = await post("/api/dispatch/answer", {
      item: itemPath("decide-elsewhere"),
      choices: [{ decision: "D-3", key: "a" }],
    });
    expect(elsewhere.status).toBe(403);
  });

  it("should refuse a control-chosen answer, naming the options read, when the options command fails", async () => {
    await writeHeld({ "options.exit": "2", "options.json": "" });
    try {
      const reply = await post("/api/dispatch/answer", {
        item: itemPath("decide-one"),
        choices: [{ decision: "D-3", key: "a" }],
      });
      expect(reply.status).toBe(403);
      expect((reply.json() as { error: { source: string; message: string } }).error).toMatchObject({
        source: "held options",
        message: expect.stringMatching(/exit 2/),
      });
    } finally {
      await resetHeld();
    }
  });

  it("should pass item paths after --, and refuse one that starts with - without running the options command", async () => {
    const dashed = "-rf.md";
    await writeHeld({
      "review.json": JSON.stringify({
        schema: 1,
        fingerprint: "f2",
        host: "host-c",
        pair: ["host-c"],
        scope: "pair",
        read_at: "2026-11-09T12:00:00Z",
        stores: {
          [repoName(store.dir)]: { path: "/stores/held/docs/held", status: "ok", error: null },
        },
        items: [
          reviewItem("decide-one", { task: ids.joined }),
          { ...reviewItem("dashed"), path: dashed },
        ],
      }),
      "options.json": JSON.stringify({
        version: 1,
        items: [
          { item: itemPath("decide-one"), kind: "decision", decisions: DECISIONS, error: null },
          { item: dashed, kind: "decision", decisions: DECISIONS, error: null },
        ],
      }),
    });
    try {
      expect((await get("/api/review")).status).toBe(200);
      await writeFile(join(heldDir, "calls.jsonl"), "");
      const refusedReply = await post("/api/dispatch/answer", {
        item: dashed,
        choices: [{ decision: "D-3", key: "a" }],
      });
      expect(refusedReply.status).toBe(403);
      expect(
        (refusedReply.json() as { error: { source: string; message: string } }).error,
      ).toMatchObject({
        source: "held options",
        message: expect.stringMatching(/starts with "-"/),
      });
      const answered = await post("/api/dispatch/answer", {
        item: itemPath("decide-one"),
        choices: [{ decision: "D-3", key: "a" }],
      });
      expect(answered.status).toBe(201);
      const calls = (await readFile(join(heldDir, "calls.jsonl"), "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[])
        .filter((call) => call[0] === "options");
      expect(calls).toEqual([["options", "--scope", "pair", "--", itemPath("decide-one")]]);
    } finally {
      await resetHeld();
    }
  });
});

describe("POST /api/dispatch/unblock (T-W1.6)", () => {
  const unblockOf = (body: Record<string, unknown>) =>
    post("/api/dispatch/unblock", { repo: repoName(store.dir), task: ids.blocked, ...body });

  it("should write an unblock carrying the resolution to the owning session, then send the next-step prompt once it is acted on", async () => {
    const reply = await unblockOf({
      resolution: "The space is approved.",
      followUp: "Publish the drafts.",
    });
    expect(reply.status).toBe(201);
    const { dispatch } = reply.json() as Written;
    expect(dispatch).toMatchObject({
      kind: "unblock",
      target: { session: "worker", host: "host-c" },
    });
    const body = await receiver("host-c", `/dispatches/${dispatch.id}/body?session=worker`);
    expect(JSON.parse(body.text)).toEqual({
      version: 1,
      resolution: "The space is approved.",
      to: "in_progress",
    });
    const pending = (await get(`/api/dispatch/${dispatch.id}`)).json() as {
      followUp: { state: string };
    };
    expect(pending.followUp).toEqual({ state: "pending" });
    for (const state of ["taken", "acted"]) {
      await receiver("host-c", `/dispatches/${dispatch.id}/receipts`, { session: "worker", state });
    }
    const sent = (await get(`/api/dispatch/${dispatch.id}`)).json() as {
      followUp: { state: string; prompt: string };
    };
    expect(sent.followUp.state).toBe("sent");
    const prompt = await receiver(
      "host-c",
      `/dispatches/${sent.followUp.prompt}/body?session=worker`,
    );
    expect(prompt.text).toBe("Publish the drafts.");
    const saved = await readFile(join(env.stateDir, FOLLOW_UPS_FILE), "utf8");
    expect(saved).not.toContain("Publish the drafts.");
  });

  it("should drop the next-step prompt and say why when the unblock fails", async () => {
    const { dispatch } = (
      await unblockOf({ resolution: "Go.", followUp: "Then this." })
    ).json() as Written;
    await receiver("host-c", `/dispatches/${dispatch.id}/receipts`, {
      session: "worker",
      state: "failed",
      reason: "bd-unblock refused: not blocked",
    });
    const shown = (await get(`/api/dispatch/${dispatch.id}`)).json() as {
      delivery: { text: string };
      followUp: { state: string; reason: string };
    };
    expect(shown.delivery.text).toBe("failed: bd-unblock refused: not blocked");
    expect(shown.followUp).toEqual({
      state: "dropped",
      reason: "the unblock failed: bd-unblock refused: not blocked",
    });
  });

  it("should refuse to unblock a task that is not blocked", async () => {
    const reply = await post("/api/dispatch/unblock", {
      repo: repoName(store.dir),
      task: ids.owned,
      resolution: "Go.",
    });
    expect(reply.status).toBe(403);
    expect((reply.json() as { error: { message: string } }).error.message).toMatch(/not blocked/);
  });

  it("should write the resolution comment and run the unblock itself for a task no session owns", async () => {
    const reply = await post("/api/dispatch/unblock", {
      repo: repoName(store.dir),
      task: ids.orphan,
      resolution: "Nothing waits on this now.",
    });
    expect(reply.status).toBe(200);
    expect((reply.json() as { via: string }).via).toBe("server");
    expect((await store.show(ids.orphan)).status).toBe("in_progress");
    const texts = (await comments(ids.orphan)).map((comment) => comment.text);
    expect(texts.some((text) => text.includes("Nothing waits on this now."))).toBe(true);
    const calls = (await readFile(join(heldDir, "unblock.jsonl"), "utf8")).trim().split("\n");
    expect(JSON.parse(calls.at(-1) ?? "[]")).toEqual([
      ids.orphan,
      "--to",
      "in_progress",
      "--why",
      "Nothing waits on this now.",
    ]);
  });

  it("should keep a multi-line resolution whole in the comment and pass it to the unblock command as one line", async () => {
    const id = await store.create("Unowned blocker with a long resolution", { status: "blocked" });
    const resolution = "The upstream fix landed.\n\n  Retry the import,\tthen close it.";
    const reply = await post("/api/dispatch/unblock", {
      repo: repoName(store.dir),
      task: id,
      resolution,
    });
    expect(reply.status).toBe(200);
    expect((await store.show(id)).status).toBe("in_progress");
    const texts = (await comments(id)).map((comment) => comment.text);
    expect(texts.some((text) => text.includes(resolution))).toBe(true);
    const calls = (await readFile(join(heldDir, "unblock.jsonl"), "utf8")).trim().split("\n");
    expect(JSON.parse(calls.at(-1) ?? "[]")).toEqual([
      id,
      "--to",
      "in_progress",
      "--why",
      "The upstream fix landed. Retry the import, then close it.",
    ]);
  });

  it("should name the unblock command's refusal and exit code and leave the task blocked", async () => {
    const id = await store.create("Another unowned blocker", { status: "blocked" });
    await writeFile(join(heldDir, "unblock.exit"), "1");
    try {
      const reply = await post("/api/dispatch/unblock", {
        repo: repoName(store.dir),
        task: id,
        resolution: "Go.",
      });
      expect(reply.status).toBe(502);
      expect(
        (reply.json() as { error: { exitCode: number; message: string } }).error,
      ).toMatchObject({
        exitCode: 1,
        message: expect.stringMatching(/REFUSED/),
      });
      expect((await store.show(id)).status).toBe("blocked");
    } finally {
      await rm(join(heldDir, "unblock.exit"));
    }
  });
});
