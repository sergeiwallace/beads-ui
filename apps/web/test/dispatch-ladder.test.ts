import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

// The dispatch ladder through the running server (web app design T-W2.1 and T-W2.3, server and
// composer side; D-6, D-7, D-10). Every carrier and local rung is a stand-in for the real fleet
// tool that checks the server called it with that tool's own arguments (fixtures/fake-fleet-tool
// .mjs) and records the call; the wake policy is the idle wake's own file; each dispatch's state
// and rungs are read back through the status route, and what a receiver sees through the
// receiver API with the receiving host's own token. No test sends a real message.

const FAKE_TOOL = fileURLToPath(new URL("./fixtures/fake-fleet-tool.mjs", import.meta.url));
const FAKE_HELD = fileURLToPath(new URL("./fixtures/fake-held.mjs", import.meta.url));
const FAKE_UNBLOCK = fileURLToPath(new URL("./fixtures/fake-unblock.mjs", import.meta.url));
const HOST = "host-b";

let store: TestStore;
let env: HostEnv;
let server: RunningServer;
let cookie: string;
let tools: string;
let heldDir: string;
let token: string;
let session = 0;

const tool = (name: string) => JSON.stringify([process.execPath, FAKE_TOOL, tools, name]);

interface Settings {
  coalesce?: number;
  shownWithin?: number;
  max?: number;
  dispatch?: string;
  local?: string;
}

function config(settings: Settings = {}) {
  const name = repoName(store.dir);
  return hostConfig({
    allowRepos: [name],
    auth: { signing_key: "state:dispatch-signing-key", signing_key_id: "host-a-20261109" },
    extra: [
      `[hosts.${HOST}]\nallow_repos = ["${name}"]`,
      `[review]\ncommand = ${JSON.stringify([process.execPath, FAKE_HELD, heldDir])}`,
      [
        "[dispatch]",
        `host = "${HOST}"`,
        `unblock_command = ${JSON.stringify([process.execPath, FAKE_UNBLOCK, heldDir])}`,
        `coalesce_window_s = ${settings.coalesce ?? 0}`,
        `shown_within_s = ${settings.shownWithin ?? 1}`,
        `max_per_session_per_hour = ${settings.max ?? 30}`,
        settings.dispatch ?? "",
      ].join("\n"),
      [
        "[dispatch.carriers]",
        `agent_mail_command = ${tool("agent-mail")}`,
        `buzz_command = ${tool("buzz")}`,
        `git_inbox_command = ${tool("git-inbox")}`,
      ].join("\n"),
      [
        "[dispatch.local]",
        `prompt_injection_command = ${tool("prompt-injection")}`,
        `mod_submit_command = ${tool("mod-submit")}`,
        settings.local ?? "",
      ].join("\n"),
    ].join("\n\n"),
  });
}

const wakeFile = () => join(env.configHome, "ai-harness", "idle-wake.json");
async function wakes(on: boolean | "missing" | "malformed") {
  await mkdir(join(env.configHome, "ai-harness"), { recursive: true });
  if (on === "missing") {
    if (existsSync(wakeFile())) await rm(wakeFile());
    return;
  }
  await writeFile(
    wakeFile(),
    on === "malformed" ? "{automatic_wakes" : JSON.stringify({ schema: 1, automatic_wakes: on }),
  );
}

/** Makes `name` exit `code` with `stderr`, for every call until reset. */
const failing = (name: string, code: number, stderr: string) =>
  Promise.all([
    writeFile(join(tools, `${name}.exit`), String(code)),
    writeFile(join(tools, `${name}.stderr`), `${stderr}\n`),
  ]);

interface Call {
  args: string[];
  text?: string;
}
async function calls(name: string): Promise<Call[]> {
  const path = join(tools, `${name}.jsonl`);
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as Call);
}
const flag = (call: Call | undefined, name: string) => call?.args[call.args.indexOf(name) + 1];

const get = (path: string): Promise<Reply> => send(server, path, { headers: { cookie } });
const post = (path: string, body: unknown): Promise<Reply> =>
  send(server, path, {
    method: "POST",
    headers: { ...SAME_ORIGIN_WRITE, cookie },
    body: JSON.stringify(body),
  });
const receiver = (path: string, body?: unknown) =>
  send(server, `/api/receiver/v1${path}`, {
    ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  });

interface Status {
  id: string;
  state: string;
  delivery: { text: string; source: string };
  deliverNow?: boolean;
  ladder: {
    rungs: { rung: string; outcome: string; detail: string }[];
    summary?: string;
    notes: { source: string; text: string }[];
    hold?: { reason: string; until?: string };
  };
}
const status = async (id: string) => (await get(`/api/dispatch/${id}`)).json() as Status;

/** A new task owned by a session no other test uses, so the hourly counts never mix. */
async function ownedTask(): Promise<{ id: string; owner: string }> {
  session += 1;
  const owner = `worker-${session}`;
  const id = await store.create(`Task for ${owner}`, { status: "in_progress" });
  await store.bd("update", id, "--assignee", owner);
  return { id, owner };
}

async function prompt(task: string, text: string, extra: Record<string, unknown> = {}) {
  const reply = await post("/api/dispatch/prompt", {
    repo: repoName(store.dir),
    task,
    text,
    ...extra,
  });
  expect(reply.status, reply.text).toBe(201);
  return (reply.json() as { dispatch: { id: string } }).dispatch.id;
}

const listed = async (owner: string) =>
  (
    (await receiver(`/dispatches?session=${owner}`)).json() as {
      dispatches: { id: string; arm_goal: boolean; body_digest: string }[];
    }
  ).dispatches;

const settle = () => server.ladder.idle();
const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
const waitFor = <T>(check: () => Promise<T>) =>
  vi.waitFor(check, { timeout: 20_000, interval: 100 });

beforeAll(async () => {
  store = await createStore("ladder");
  env = await hostEnv();
  heldDir = join(env.configHome, "held");
  tools = join(env.configHome, "tools");
  await mkdir(join(heldDir, "bodies"), { recursive: true });
  await mkdir(tools, { recursive: true });
  await env.write(config());
  const clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
  token = (await runCli(env, store.dir, ["issue-receiver-token", HOST])).stdout.trim();
  server = await startServer({
    repoRoot: store.dir,
    port: 0,
    clientDir,
    configEnv: env.configEnv,
    sweepMs: 200,
  });
  cookie = await signIn(server);
});

beforeEach(async () => {
  await settle();
  await rm(tools, { recursive: true });
  await mkdir(tools);
  await wakes(true);
  await env.write(config());
});

afterAll(async () => {
  await server?.close();
  await env?.remove();
  await store?.remove();
});

describe("rung 1, Agent Mail through the notifier (T-W2.1)", () => {
  it("should send addressed Agent Mail to the target session at its host naming the dispatch id when automatic wakes are on", async () => {
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Look at the failing test");
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
    const [mail] = await calls("agent-mail");
    expect(flag(mail, "--to")).toBe(`${owner}@${HOST}`);
    expect(flag(mail, "--subject")).toBe(`beads-ui dispatch ${dispatch}`);
    expect(flag(mail, "--body")).toContain(dispatch);
    expect(JSON.stringify(mail)).not.toContain("failing test");
    await settle();
    const read = await status(dispatch);
    expect(read.ladder.rungs[0]).toMatchObject({ rung: "agent-mail", outcome: "sent" });
    expect(read.ladder.summary).toMatch(/^delivered by agent-mail/);
  });

  it("should record the state shown with the receipt as its source when the shown receipt arrives", async () => {
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Shown soon");
    await settle();
    const reply = await receiver(`/dispatches/${dispatch}/shown`, { session: owner });
    expect(reply.status).toBe(204);
    const read = await status(dispatch);
    expect(read.state).toBe("shown");
    expect(read.delivery.source).toBe(`shown receipt from ${owner}@${HOST}`);
  });

  it("should show every dispatch of a coalesced event, and try no rung 3 for any, when the shown receipt names only the first id", async () => {
    await env.write(config({ coalesce: 10, shownWithin: 5 }));
    const { id, owner } = await ownedTask();
    const first = await prompt(id, "One");
    // The window opens when the first is admitted, as its request returns; its own bd work
    // before that is not inside the window.
    const started = Date.now();
    const second = await prompt(id, "Two");
    const third = await prompt(id, "Three");
    expect(Date.now() - started).toBeLessThan(10_000);
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
    // The board cuts a subject at 60 characters, so the receiving host knows the first id only.
    const reply = await receiver(`/dispatches/${first}/shown`, { session: owner });
    expect(reply.status).toBe(204);
    await settle();
    for (const one of [first, second, third]) {
      const read = await status(one);
      expect(read.state, one).toBe("shown");
      expect(read.delivery.source, one).toBe(`shown receipt from ${owner}@${HOST}`);
    }
    expect(await calls("prompt-injection")).toEqual([]);
    expect(await calls("mod-submit")).toEqual([]);
  });

  it("should show every dispatch of a coalesced event when the shown receipt arrives while its carrier is still running", async () => {
    await env.write(config({ coalesce: 10, shownWithin: 5 }));
    // The carrier has delivered and records its call, then takes 3 s to exit.
    await writeFile(join(tools, "agent-mail.delay-ms"), "3000");
    const { id, owner } = await ownedTask();
    const first = await prompt(id, "One");
    const started = Date.now();
    const second = await prompt(id, "Two");
    expect(Date.now() - started).toBeLessThan(10_000);
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
    const reply = await receiver(`/dispatches/${first}/shown`, { session: owner });
    expect(reply.status).toBe(204);
    await settle();
    for (const one of [first, second]) expect((await status(one)).state, one).toBe("shown");
    expect(await calls("prompt-injection")).toEqual([]);
  });

  it("should show no dispatch of a coalesced event when the shown receipt comes from another session", async () => {
    await env.write(config({ coalesce: 10 }));
    const { id } = await ownedTask();
    const first = await prompt(id, "One");
    // The window opens when the first is admitted, as its request returns.
    const started = Date.now();
    const second = await prompt(id, "Two");
    expect(Date.now() - started).toBeLessThan(10_000);
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
    const reply = await receiver(`/dispatches/${first}/shown`, { session: "someone-else" });
    expect(reply.status).toBe(404);
    await settle();
    for (const one of [first, second]) expect((await status(one)).state, one).toBe("queued");
  });

  it("should refuse a shown receipt from another session and leave the state as it was", async () => {
    const { id } = await ownedTask();
    const dispatch = await prompt(id, "Not yours");
    await settle();
    const reply = await receiver(`/dispatches/${dispatch}/shown`, { session: "someone-else" });
    expect(reply.status).toBe(404);
    expect((await status(dispatch)).state).toBe("queued");
  });
});

describe("the local rungs and the fallbacks (T-W2.1)", () => {
  it("should request the prompt-injection library's one-line pointer under the dispatch's claim, and record the rung, when nothing is shown within shown_within_s", async () => {
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Wake up and look");
    await waitFor(async () => expect(await calls("prompt-injection")).toHaveLength(1));
    const [inject] = await calls("prompt-injection");
    expect(flag(inject, "--target")).toBe(`session:${owner}`);
    expect(flag(inject, "--key")).toBe(`beads-ui-dispatch-${dispatch}`);
    expect(inject?.text?.trim().split("\n")).toHaveLength(1);
    expect(inject?.text).toContain(dispatch);
    expect(inject?.text).not.toContain("Wake up");
    await settle();
    const rungs = (await status(dispatch)).ladder.rungs.map(
      (rung) => `${rung.rung}:${rung.outcome}`,
    );
    expect(rungs).toEqual(["agent-mail:sent", "prompt-injection:sent"]);
  });

  it("should not inject when the shown receipt arrives within shown_within_s", async () => {
    await env.write(config({ shownWithin: 5 }));
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Seen in time");
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
    await receiver(`/dispatches/${dispatch}/shown`, { session: owner });
    await settle();
    expect(await calls("prompt-injection")).toEqual([]);
  });

  it("should try the mod's submit, and record that rung, when the prompt-injection library cannot resolve the target's pane", async () => {
    await failing("prompt-injection", 3, "REFUSED: no pane resolves for session");
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Try the mod");
    await waitFor(async () => expect(await calls("mod-submit")).toHaveLength(1));
    expect(flag((await calls("mod-submit"))[0], "--session")).toBe(owner);
    await settle();
    const rungs = (await status(dispatch)).ladder.rungs;
    expect(rungs.map((rung) => `${rung.rung}:${rung.outcome}`)).toEqual([
      "agent-mail:sent",
      "prompt-injection:failed",
      "mod-submit:sent",
    ]);
    expect(rungs[1]?.detail).toMatch(/exit 3: REFUSED: no pane resolves/);
  });

  it("should carry the dispatch by Buzz and record that rung when Agent Mail cannot be delivered", async () => {
    await failing("agent-mail", 1, "the board cannot be reached");
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "By Buzz");
    await waitFor(async () => expect(await calls("buzz")).toHaveLength(1));
    const [buzz] = await calls("buzz");
    expect(flag(buzz, "--to")).toBe(`${owner}@${HOST}`);
    expect(buzz?.args).toContain("--dm-only");
    await settle();
    const rungs = (await status(dispatch)).ladder.rungs;
    expect(rungs.slice(0, 2).map((rung) => `${rung.rung}:${rung.outcome}`)).toEqual([
      "agent-mail:failed",
      "buzz:sent",
    ]);
    expect(rungs[0]?.detail).toBe("exit 1: the board cannot be reached");
    expect(await calls("git-inbox")).toEqual([]);
  });

  it("should send a git-inbox action carrying only the dispatch id and digest, and record that rung, when Buzz cannot carry it either", async () => {
    await failing("agent-mail", 1, "the board cannot be reached");
    await failing("buzz", 2, "no relay");
    const { id, owner } = await ownedTask();
    const secret = "the private body of this prompt";
    const dispatch = await prompt(id, secret);
    await waitFor(async () => expect(await calls("git-inbox")).toHaveLength(1));
    const [inbox] = await calls("git-inbox");
    const [record] = (await listed(owner)).filter((one) => one.id === dispatch);
    expect(flag(inbox, "--to")).toBe(`${owner}@${HOST}`);
    expect(flag(inbox, "--body")).toBe(`beads-ui dispatch ${dispatch} ${record?.body_digest}`);
    expect(flag(inbox, "--re")).toBe(`beads-ui dispatch ${dispatch}`);
    expect(JSON.stringify(inbox)).not.toContain(secret);
    await settle();
    const rungs = (await status(dispatch)).ladder.rungs.map(
      (rung) => `${rung.rung}:${rung.outcome}`,
    );
    expect(rungs.slice(0, 3)).toEqual(["agent-mail:failed", "buzz:failed", "git-inbox:sent"]);
  });

  it("should leave the dispatch for turn-end pickup and show which rungs failed and why when every active rung fails", async () => {
    for (const name of ["agent-mail", "buzz", "git-inbox"])
      await failing(name, 1, `${name} is down`);
    await failing("prompt-injection", 3, "no pane");
    await failing("mod-submit", 1, "the mod is not loaded");
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Nobody hears this now");
    await waitFor(async () =>
      expect((await status(dispatch)).ladder.rungs.at(-1)?.rung).toBe("turn-end"),
    );
    const read = await status(dispatch);
    expect(read.state).toBe("queued");
    expect(read.ladder.summary).toBe(
      "left for turn-end pickup; agent-mail failed (exit 1: agent-mail is down); buzz failed (exit 1: buzz is down); git-inbox failed (exit 1: git-inbox is down); prompt-injection failed (exit 3: no pane); mod-submit failed (exit 1: the mod is not loaded)",
    );
    expect(read.delivery.text).toContain(read.ladder.summary as string);
    expect((await listed(owner)).map((one) => one.id)).toContain(dispatch);
  });
});

describe("the kill switch and an unreadable policy (T-W2.1)", () => {
  it("should still send the addressed Agent Mail, use no rung 3 or 4, and show waiting: automatic wakes off, while the target host's automatic wakes are off", async () => {
    await wakes(false);
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Wait for the turn end");
    await waitFor(async () => expect((await status(dispatch)).state).toBe("waiting"));
    expect(await calls("agent-mail")).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await settle();
    expect(await calls("prompt-injection")).toEqual([]);
    expect(await calls("mod-submit")).toEqual([]);
    const read = await status(dispatch);
    expect(read.delivery.text).toMatch(/^waiting: automatic wakes off/);
    expect(read.delivery.source).toBe("the target host's wake policy");
    expect((await listed(owner)).map((one) => one.id)).toContain(dispatch);
  });

  it("should deliver at the next turn end only and show the reason when the dispatch policy is unreadable", async () => {
    await env.write(config({ shownWithin: 0 }));
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Policy broken");
    await waitFor(async () => expect((await status(dispatch)).state).toBe("waiting"));
    await settle();
    const read = await status(dispatch);
    expect(read.delivery.text).toMatch(
      /^waiting: turn-end pickup only: the dispatch policy is unreadable: dispatch.shown_within_s/,
    );
    for (const name of ["agent-mail", "buzz", "git-inbox", "prompt-injection", "mod-submit"]) {
      expect(await calls(name), name).toEqual([]);
    }
    expect((await listed(owner)).map((one) => one.id)).toContain(dispatch);
  });

  it("should deliver at the next turn end only and show the reason when the target host's wake policy cannot be read", async () => {
    await wakes("malformed");
    const { id } = await ownedTask();
    const dispatch = await prompt(id, "Wake policy broken");
    await waitFor(async () => expect((await status(dispatch)).state).toBe("waiting"));
    expect((await status(dispatch)).delivery.text).toMatch(
      /wake policy is unreadable: the wake policy is not JSON/,
    );
    expect(await calls("agent-mail")).toEqual([]);
  });
});

describe("coalescing and the rate cap (T-W2.1)", () => {
  it("should deliver two dispatches to one session written within coalesce_window_s as one event", async () => {
    await env.write(config({ coalesce: 10 }));
    const { id, owner } = await ownedTask();
    const started = Date.now();
    const first = await prompt(id, "One");
    const second = await prompt(id, "Two");
    // The criterion's precondition: both were written within the window.
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(await calls("agent-mail")).toEqual([]);
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
    await settle();
    const mail = await calls("agent-mail");
    expect(mail).toHaveLength(1);
    expect(flag(mail[0], "--to")).toBe(`${owner}@${HOST}`);
    expect(flag(mail[0], "--subject")).toBe(`beads-ui dispatches ${first}, ${second}`);
  });

  it("should hold further dispatches to a session past max_per_session_per_hour and say so", async () => {
    await env.write(config({ max: 2 }));
    const { id, owner } = await ownedTask();
    await prompt(id, "One");
    await prompt(id, "Two");
    const third = await prompt(id, "Three");
    await settle();
    const read = await status(third);
    expect(read.state).toBe("waiting");
    expect(read.delivery.text).toMatch(
      /^waiting: held: 2 dispatches to this session in the last hour reached max_per_session_per_hour = 2/,
    );
    expect((await listed(owner)).map((one) => one.id)).not.toContain(third);
    expect(await calls("agent-mail")).toHaveLength(2);
  });
});

describe("goal arming (T-W2.3)", () => {
  it("should set arm_goal on a prompt the composer writes", async () => {
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Arm it");
    expect((await listed(owner)).find((one) => one.id === dispatch)?.arm_goal).toBe(true);
  });

  it("should send without arm_goal, and record that the user cleared it, when the arm-goal control is cleared", async () => {
    const { id, owner } = await ownedTask();
    const dispatch = await prompt(id, "Do not arm", { armGoal: false });
    expect((await listed(owner)).find((one) => one.id === dispatch)?.arm_goal).toBe(false);
    const notes = (await status(dispatch)).ladder.notes;
    expect(notes).toEqual([
      {
        source: "the composer",
        text: "the user cleared arm-goal for this dispatch",
        at: expect.any(String),
      },
    ]);
    const comments = JSON.parse(await store.bd("comments", id, "--json")) as { text: string }[];
    expect(
      comments.some(
        (comment) =>
          comment.text.includes(dispatch) && comment.text.includes("arm-goal cleared by the user"),
      ),
    ).toBe(true);
  });

  it("should set arm_goal on an unblock that carries next-step text, and not on one without", async () => {
    const plain = await ownedTask();
    const next = await ownedTask();
    for (const task of [plain, next]) await store.bd("update", task.id, "--status", "blocked");
    const send = (task: string, followUp?: string) =>
      post("/api/dispatch/unblock", {
        repo: repoName(store.dir),
        task,
        resolution: "The key is in the vault now",
        ...(followUp === undefined ? {} : { followUp }),
      });
    const withNext = (await send(next.id, "Then rerun the deploy")).json() as {
      dispatch: { id: string };
    };
    const without = (await send(plain.id)).json() as { dispatch: { id: string } };
    expect(
      (await listed(next.owner)).find((one) => one.id === withNext.dispatch.id)?.arm_goal,
    ).toBe(true);
    expect(
      (await listed(plain.owner)).find((one) => one.id === without.dispatch.id)?.arm_goal,
    ).toBe(false);
  });

  it("should set arm_goal on an answer that carries next-step text, and not on one without", async () => {
    const item = (name: string) => ({
      path: `/stores/held/docs/held/${HOST}/answerer/2026/11/09/${name}.md`,
      relpath: `docs/held/${HOST}/answerer/2026/11/09/${name}.md`,
      store: repoName(store.dir),
      kind: "question",
      status: "open",
      selection: "current",
      session: `answerer@${HOST}`,
      machine: HOST,
      task: "none",
      title: `Question ${name}`,
      ask: "Which one?",
      created_at: "2026-11-09T10:00:00Z",
    });
    await writeFile(
      join(heldDir, "review.json"),
      JSON.stringify({
        schema: 1,
        fingerprint: "f1",
        host: HOST,
        pair: [HOST],
        scope: "pair",
        read_at: "2026-11-09T12:00:00Z",
        stores: {
          [repoName(store.dir)]: { path: "/stores/held/docs/held", status: "ok", error: null },
        },
        items: [item("with-next"), item("plain")],
      }),
    );
    await writeFile(join(heldDir, "options.json"), JSON.stringify({ version: 1, items: [] }));
    expect((await get("/api/review")).status).toBe(200);
    const answer = (name: string, followUp?: string) =>
      post("/api/dispatch/answer", {
        item: item(name).path,
        text: "The second one",
        ...(followUp === undefined ? {} : { followUp }),
      });
    const withNext = await answer("with-next", "Then ship it");
    const plain = await answer("plain");
    expect(withNext.status, withNext.text).toBe(201);
    const ids = [withNext, plain].map(
      (reply) => (reply.json() as { dispatch: { id: string } }).dispatch.id,
    );
    const sent = await listed("answerer");
    expect(sent.find((one) => one.id === ids[0])?.arm_goal).toBe(true);
    expect(sent.find((one) => one.id === ids[1])?.arm_goal).toBe(false);
  });

  it("should show waiting: goal paused and hold the dispatch back while the receiving session reports its goal paused", async () => {
    const { id, owner } = await ownedTask();
    const reported = await receiver("/sessions/goal", {
      session: owner,
      state: "paused",
      until: inAnHour(),
      reason: "usage limit",
    });
    expect(reported.status).toBe(204);
    const dispatch = await prompt(id, "After the limit");
    await settle();
    const read = await status(dispatch);
    expect(read.delivery.text).toBe("waiting: goal paused");
    expect(read.deliverNow).toBe(true);
    expect((await listed(owner)).map((one) => one.id)).not.toContain(dispatch);
    expect(await calls("agent-mail")).toEqual([]);
  });

  it("should release a dispatch waiting on a paused goal when the receiver reports the goal active", async () => {
    const { id, owner } = await ownedTask();
    await receiver("/sessions/goal", { session: owner, state: "paused", until: inAnHour() });
    const dispatch = await prompt(id, "Released by the goal");
    await settle();
    expect((await status(dispatch)).state).toBe("waiting");
    expect((await receiver("/sessions/goal", { session: owner, state: "active" })).status).toBe(
      204,
    );
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
    expect(flag((await calls("agent-mail"))[0], "--subject")).toBe(`beads-ui dispatch ${dispatch}`);
    expect((await listed(owner)).map((one) => one.id)).toContain(dispatch);
  });

  it("should release a dispatch waiting on a paused goal when the recorded pause window ends", async () => {
    const { id, owner } = await ownedTask();
    await receiver("/sessions/goal", { session: owner, state: "paused", until: inAnHour() });
    const dispatch = await prompt(id, "Released by the clock");
    await settle();
    expect((await status(dispatch)).state).toBe("waiting");
    // The window ends only once the dispatch is seen waiting: a window set before the prompt can
    // end before a loaded host has made and held the dispatch.
    const until = new Date(Date.now() + 500).toISOString();
    expect(
      (await receiver("/sessions/goal", { session: owner, state: "paused", until })).status,
    ).toBe(204);
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
    const read = await status(dispatch);
    expect(read.ladder.hold).toBeUndefined();
  });

  it("should deliver a dispatch waiting on a paused goal at once when the user presses deliver now", async () => {
    await env.write(config({ coalesce: 30 }));
    const { id, owner } = await ownedTask();
    await receiver("/sessions/goal", { session: owner, state: "paused", until: inAnHour() });
    const dispatch = await prompt(id, "Now, please");
    await settle();
    const reply = await post(`/api/dispatch/${dispatch}/deliver-now`, {});
    expect(reply.status, reply.text).toBe(200);
    await settle();
    expect(await calls("agent-mail")).toHaveLength(1);
    expect((await listed(owner)).map((one) => one.id)).toContain(dispatch);
  });

  it("should refuse deliver now on a dispatch that is not waiting on a paused goal", async () => {
    const { id } = await ownedTask();
    const dispatch = await prompt(id, "Already going");
    const reply = await post(`/api/dispatch/${dispatch}/deliver-now`, {});
    expect(reply.status).toBe(409);
    expect(reply.text).toMatch(/not waiting on a paused goal/);
  });

  it("should hold a dispatch on a paused report with no until, then release it when the receiver reports the goal active", async () => {
    const { id, owner } = await ownedTask();
    const reported = await receiver("/sessions/goal", {
      session: owner,
      state: "paused",
      reason: "usage limit",
    });
    expect(reported.status).toBe(204);
    const dispatch = await prompt(id, "After a pause with no known end");
    await settle();
    const read = await status(dispatch);
    expect(read.delivery.text).toBe("waiting: goal paused");
    expect(read.deliverNow).toBe(true);
    expect(read.ladder.hold?.until).toBeUndefined();
    expect((await listed(owner)).map((one) => one.id)).not.toContain(dispatch);
    expect(await calls("agent-mail")).toEqual([]);
    expect((await receiver("/sessions/goal", { session: owner, state: "active" })).status).toBe(
      204,
    );
    await waitFor(async () => expect(await calls("agent-mail")).toHaveLength(1));
    expect(flag((await calls("agent-mail"))[0], "--subject")).toBe(`beads-ui dispatch ${dispatch}`);
    expect((await listed(owner)).map((one) => one.id)).toContain(dispatch);
  });

  it("should refuse a goal report that is not one", async () => {
    const reply = await receiver("/sessions/goal", { session: "worker-x", state: "sleepy" });
    expect(reply.status).toBe(404);
  });
});
