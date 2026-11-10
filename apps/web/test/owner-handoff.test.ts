import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

// An owner change through the running server (web app design T-W2.2, D-9): the fleet's
// receiver-first handoff. The fleet's liveness check and git-inbox are stand-ins that check the
// server called them with the real tools' arguments (fixtures/fake-fleet-tool.mjs); the holder's
// and the receiver's own steps are played by the test through the receiver API and bd, as the
// sessions would; every assignee and status is read from the real store.

const FAKE_TOOL = fileURLToPath(new URL("./fixtures/fake-fleet-tool.mjs", import.meta.url));
const HOST = "host-b";

let store: TestStore;
let env: HostEnv;
let server: RunningServer;
let cookie: string;
let tools: string;
let token: string;
let count = 0;

const tool = (name: string) => JSON.stringify([process.execPath, FAKE_TOOL, tools, name]);

function config(receivers?: string[]) {
  const name = repoName(store.dir);
  return hostConfig({
    allowRepos: [name],
    auth: { signing_key: "state:dispatch-signing-key", signing_key_id: "host-a-20261109" },
    extra: [
      `[hosts.${HOST}]\nallow_repos = ["${name}"]`,
      `[dispatch]\nhost = "${HOST}"\ncoalesce_window_s = 0`,
      `[dispatch.carriers]\nagent_mail_command = ${tool("agent-mail")}\ngit_inbox_command = ${tool("git-inbox")}`,
      [
        "[handoff]",
        `liveness_command = ${tool("liveness")}`,
        ...(receivers === undefined ? [] : [`receivers = ${JSON.stringify(receivers)}`]),
      ].join("\n"),
    ].join("\n\n"),
  });
}

/** What the fleet's liveness check prints for `identity`. */
const liveness = (identity: string, reading: Record<string, string> | undefined) =>
  writeFile(
    join(tools, "liveness.stdout"),
    JSON.stringify({
      filters: { session: identity },
      identities: reading === undefined ? [] : [{ identity, scope: "session", ...reading }],
    }),
  );

async function calls(name: string): Promise<{ args: string[] }[]> {
  const path = join(tools, `${name}.jsonl`);
  if (!existsSync(path)) return [];
  return (await readFile(path, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { args: string[] });
}
const flag = (call: { args: string[] } | undefined, name: string) =>
  call?.args[call.args.indexOf(name) + 1];

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

const ownerChange = (id: string, to: string, shown: string, status: string, extra = {}) =>
  post(
    `/api/issues/${encodeURIComponent(id)}/owner?store=${encodeURIComponent(repoName(store.dir))}`,
    {
      to,
      shown,
      status,
      ...extra,
    },
  );
const handoff = async (id: string) =>
  (
    await get(
      `/api/handoff?store=${encodeURIComponent(repoName(store.dir))}&id=${encodeURIComponent(id)}`,
    )
  ).json() as {
    state: string;
    source: string;
    final: boolean;
  };
const listed = async (session: string) =>
  (
    (await receiver(`/dispatches?session=${session}`)).json() as {
      dispatches: { id: string; kind: string; arm_goal: boolean }[];
    }
  ).dispatches;

/** A task claimed by a new holder, and a receiver the store's assignees offer. */
async function claimed(): Promise<{ id: string; holder: string; receiver: string }> {
  count += 1;
  const holder = `holder-${count}`;
  const target = `receiver-${count}`;
  const id = await store.create(`Claimed ${count}`, { status: "in_progress" });
  await store.bd("update", id, "--assignee", holder);
  const other = await store.create(`Owned by ${target}`);
  await store.bd("update", other, "--assignee", target);
  return { id, holder, receiver: target };
}

const show = async (id: string) =>
  (await store.show(id)) as unknown as { assignee?: string; status: string };

beforeAll(async () => {
  store = await createStore("handoff");
  env = await hostEnv();
  tools = join(env.configHome, "tools");
  await mkdir(tools, { recursive: true });
  await env.write(config());
  const clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>client</title>");
  token = (await runCli(env, store.dir, ["issue-receiver-token", HOST])).stdout.trim();
  server = await startServer({ repoRoot: store.dir, port: 0, clientDir, configEnv: env.configEnv });
  cookie = await signIn(server);
});

beforeEach(async () => {
  await server.ladder.idle();
  await rm(tools, { recursive: true });
  await mkdir(tools);
  await env.write(config());
});

afterAll(async () => {
  await server?.close();
  await env?.remove();
  await store?.remove();
});

describe("the receiver the handoff rules allow (T-W2.2)", () => {
  it("should refuse a receiver the handoff rules do not allow, naming the rule, before anything is sent", async () => {
    await env.write(config(["ops-*"]));
    const { id, holder, receiver: target } = await claimed();
    await liveness(`${holder}@${HOST}`, { liveness: "live" });
    const reply = await ownerChange(id, target, holder, "in_progress");
    expect(reply.status).toBe(400);
    expect(reply.text).toContain(`[handoff] receivers = [\\"ops-*\\"]`);
    expect(await calls("liveness")).toEqual([]);
    expect(await listed(holder)).toEqual([]);
    expect((await show(id)).assignee).toBe(holder);
  });
});

describe("an unclaimed task (T-W2.2)", () => {
  it("should write the assignee through a guarded bd write and dispatch the typed prompt to the new owner", async () => {
    count += 1;
    const target = `receiver-${count}`;
    const id = await store.create(`Unclaimed ${count}`);
    const other = await store.create("Gives the picker a receiver");
    await store.bd("update", other, "--assignee", target);
    const reply = await ownerChange(id, target, "", "open", { prompt: "Pick this up next" });
    expect(reply.status, reply.text).toBe(200);
    expect((await show(id)).assignee).toBe(target);
    const sent = await listed(target);
    expect(sent.map((one) => one.kind)).toEqual(["prompt"]);
    expect(sent[0]?.arm_goal).toBe(true);
    expect(await calls("liveness")).toEqual([]);
  });

  it("should write nothing when the assignee changed since the page drew it", async () => {
    count += 1;
    const target = `receiver-${count}`;
    const id = await store.create(`Moved ${count}`);
    const other = await store.create("Gives the picker a receiver");
    await store.bd("update", other, "--assignee", target);
    await store.bd("update", id, "--assignee", "someone-else");
    const reply = await ownerChange(id, target, "", "open", { prompt: "Too late" });
    expect(reply.status).toBe(409);
    expect((await show(id)).assignee).toBe("someone-else");
    expect(await listed(target)).toEqual([]);
  });
});

describe("a task a live session holds (T-W2.2)", () => {
  it("should send the holder a handoff-request naming the receiver and leave the assignee alone", async () => {
    const { id, holder, receiver: target } = await claimed();
    await liveness(`${holder}@${HOST}`, { liveness: "live" });
    const reply = await ownerChange(id, target, holder, "in_progress");
    expect(reply.status, reply.text).toBe(202);
    expect(flag((await calls("liveness"))[0], "--session")).toBe(`${holder}@${HOST}`);
    const [request] = await listed(holder);
    expect(request?.kind).toBe("handoff-request");
    const body = await receiver(`/dispatches/${request?.id}/body?session=${holder}`);
    expect(JSON.parse(body.text)).toMatchObject({ receiver: `${target}@${HOST}`, task: { id } });
    expect((await show(id)).assignee).toBe(holder);
    expect((await handoff(id)).state).toBe(`handoff pending to ${target}`);
  });

  it("should show handoff sent, then taken, then complete, each from its own record, as the holder and the receiver run /handoff", async () => {
    const { id, holder, receiver: target } = await claimed();
    await liveness(`${holder}@${HOST}`, { liveness: "live" });
    await ownerChange(id, target, holder, "in_progress");
    const [request] = await listed(holder);
    const receipt = (body: Record<string, unknown>) =>
      receiver(`/dispatches/${request?.id}/receipts`, { session: holder, ...body });
    expect((await receipt({ state: "taken" })).status).toBe(204);
    // The holder reassigns its claim and publishes the store (session-handoff Step 2).
    await store.bd("update", id, "--assignee", target, "--actor", holder);
    const sent = await handoff(id);
    expect(sent.state).toBe("handoff sent");
    expect(sent.source).toMatch(new RegExp(`^the published store: bd show ${id} names ${target}`));
    // The receiver replies taken; the holder records the reply.
    const progress = await receiver(`/dispatches/${request?.id}/progress`, {
      session: holder,
      step: "taken",
      reason: `taken ${id}, store published`,
    });
    expect(progress.status).toBe(204);
    const taken = await handoff(id);
    expect(taken.state).toBe("taken");
    expect(taken.source).toMatch(new RegExp(`progress receipt from ${holder}@${HOST}`));
    expect(taken.source).toContain(`taken ${id}, store published`);
    // The holder's verify exits 0 and it lets go.
    const verified = await receiver(`/dispatches/${request?.id}/progress`, {
      session: holder,
      step: "verified",
      exit_code: 0,
      reason: "handoff.py verify exited 0; rows dropped",
    });
    expect(verified.status).toBe(204);
    const done = await handoff(id);
    expect(done).toMatchObject({ state: "handoff complete", final: true });
    expect(done.source).toMatch(new RegExp(`^progress receipt from ${holder}@${HOST}`));
    expect(done.source).toContain("verified exit 0: handoff.py verify exited 0; rows dropped");
    expect((await receipt({ state: "acted" })).status).toBe(204);
  });
});

describe("the holder's verify step (T-W2.2)", () => {
  async function requested() {
    const task = await claimed();
    await liveness(`${task.holder}@${HOST}`, { liveness: "live" });
    await ownerChange(task.id, task.receiver, task.holder, "in_progress");
    const [request] = await listed(task.holder);
    const progress = (body: Record<string, unknown>) =>
      receiver(`/dispatches/${request?.id}/progress`, { session: task.holder, ...body });
    const receipt = (body: Record<string, unknown>) =>
      receiver(`/dispatches/${request?.id}/receipts`, { session: task.holder, ...body });
    return { ...task, progress, receipt };
  }

  it("should not show the handoff complete on an acted receipt with no verify receipt", async () => {
    const { id, progress, receipt } = await requested();
    expect((await receipt({ state: "taken" })).status).toBe(204);
    expect((await progress({ step: "taken", reason: "the receiver replied" })).status).toBe(204);
    expect((await receipt({ state: "acted", reason: "done with the request" })).status).toBe(204);
    const read = await handoff(id);
    expect(read.state).toBe("taken");
    expect(read.final).toBe(false);
  });

  it("should show verify failed, not complete, when the verify step exits nonzero", async () => {
    const { id, progress } = await requested();
    const reply = await progress({
      step: "verified",
      exit_code: 1,
      reason: "BU-1 names the sender",
    });
    expect(reply.status).toBe(204);
    const read = await handoff(id);
    expect(read).toMatchObject({
      state: "handoff verify failed: BU-1 names the sender",
      final: false,
    });
  });

  it("should refuse an exit code on another step, and a verify receipt without an integer exit code", async () => {
    const { id, progress } = await requested();
    for (const body of [
      { step: "sent", exit_code: 0 },
      { step: "verified" },
      { step: "verified", exit_code: "0" },
      { step: "verified", exit_code: 1.5 },
    ]) {
      const reply = await progress(body);
      expect(reply.status, JSON.stringify(body)).toBe(404);
      expect(reply.text).toBe("");
    }
    expect((await handoff(id)).state).toMatch(/^handoff pending to /);
  });
});

describe("a holder the fleet's liveness check proves gone (T-W2.2)", () => {
  it("should release the abandoned claim through the force path, send the receiver a git-inbox action carrying a pointer only, and show owner not running until confirm records the take", async () => {
    const { id, holder, receiver: target } = await claimed();
    await liveness(`${holder}@${HOST}`, { liveness: "gone", reason: "ended-per-publisher 300 s" });
    await writeFile(
      join(tools, "git-inbox.send.stdout"),
      JSON.stringify({ sent: true, id: "msg-1" }),
    );
    const reply = await ownerChange(id, target, holder, "in_progress", {
      prompt: "do not carry me",
    });
    expect(reply.status, reply.text).toBe(202);
    const released = await show(id);
    expect(released.assignee ?? "").toBe("");
    expect(released.status).toBe("open");
    const [sendCall] = await calls("git-inbox");
    expect(sendCall?.args[0]).toBe("send");
    expect(flag(sendCall, "--to")).toBe(`${target}@${HOST}`);
    expect(flag(sendCall, "--action")).toBe(`${id}@${repoName(store.dir)}`);
    expect(flag(sendCall, "--body")).toBe(
      `beads-ui handoff of ${id} in ${repoName(store.dir)} from ${holder}@${HOST}, which is not running, to ${target}@${HOST}`,
    );
    expect(JSON.stringify(sendCall)).not.toContain("do not carry me");
    expect(await listed(holder)).toEqual([]);
    await writeFile(
      join(tools, "git-inbox.status.stdout"),
      JSON.stringify({
        message_id: "msg-1",
        recipients: [{ recipient: `${target}@${HOST}`, state: "read" }],
      }),
    );
    expect((await handoff(id)).state).toBe("owner not running");
    await writeFile(
      join(tools, "git-inbox.status.stdout"),
      JSON.stringify({
        message_id: "msg-1",
        recipients: [{ recipient: `${target}@${HOST}`, state: "taken" }],
      }),
    );
    const taken = await handoff(id);
    expect(taken).toMatchObject({ state: "taken", source: "git-inbox confirm msg-1", final: true });
    expect((await calls("git-inbox")).map((call) => call.args.slice(0, 2).join(" "))).toEqual([
      "send --to",
      "status msg-1",
      "status msg-1",
      "confirm msg-1",
    ]);
  });
});

describe("a holder whose liveness cannot be established (T-W2.2)", () => {
  it("should not reassign, show owner state unknown and offer a retry, when the reading is undetermined or the check fails", async () => {
    for (const setup of [
      async (identity: string) => liveness(identity, { liveness: "undetermined" }),
      async (identity: string) => liveness(identity, undefined),
      async () => {
        await writeFile(join(tools, "liveness.exit"), "1");
        await writeFile(join(tools, "liveness.stderr"), "heartbeat ref unreadable\n");
      },
    ]) {
      const { id, holder, receiver: target } = await claimed();
      await setup(`${holder}@${HOST}`);
      const reply = await ownerChange(id, target, holder, "in_progress");
      expect(reply.status, reply.text).toBe(409);
      const error = (reply.json() as { error: { kind: string; message: string; retry?: boolean } })
        .error;
      expect(error.kind).toBe("owner-unknown");
      expect(error.message).toMatch(/^owner state unknown: /);
      expect(error.retry).toBe(true);
      expect((await show(id)).assignee).toBe(holder);
      expect(await listed(holder)).toEqual([]);
      expect(await calls("git-inbox")).toEqual([]);
      await rm(join(tools, "liveness.exit"), { force: true });
      await rm(join(tools, "liveness.stderr"), { force: true });
    }
  });
});
