import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { canonicalBytes } from "../../../apps/web/server/envelope.ts";
import { repoName, SAME_ORIGIN_WRITE, send } from "../../../apps/web/test/auth-env.ts";
import { CONFIRM_TOOL, DRAFT_TOOL, newRequestId, SEND_TOOL } from "../src/tools/dispatch.ts";
import {
  type Connected,
  calls,
  connect,
  flag,
  HOST,
  startWorld,
  textOf,
  type World,
} from "./harness.ts";

// Web app design Phase W4, its six criteria, through the MCP server started over stdio and the
// running web server: every dispatch is read back through the receiver API with the receiving
// host's own token, and every carrier the ladder runs is a stand-in that records its call.

let world: World;
let app: Connected;
let text: Connected;
let session = 0;

interface Listed {
  id: string;
  task: { repo: string; id: string };
  created_by: string;
  envelope: { signing_key_id: string; signature: string };
}

const receiver = (path: string) =>
  send(world.server, `/api/receiver/v1${path}`, {
    headers: { authorization: `Bearer ${world.receiverToken}` },
  });

const listed = async (owner: string): Promise<Listed[]> =>
  ((await receiver(`/dispatches?session=${owner}`)).json() as { dispatches: Listed[] }).dispatches;

/** A task owned by a session no other test uses. */
async function ownedTask(): Promise<{ id: string; owner: string; repo: string }> {
  session += 1;
  const owner = `mcp-worker-${session}`;
  const id = await world.store.create(`Task for ${owner}`, { status: "in_progress" });
  await world.store.bd("update", id, "--assignee", owner);
  return { id, owner, repo: repoName(world.store.dir) };
}

const call = (connected: Connected, name: string, args: Record<string, unknown>) =>
  connected.client.callTool({ name, arguments: args });

const waitFor = <T>(check: () => Promise<T>) =>
  vi.waitFor(check, { timeout: 20_000, interval: 100 });

/** Verifies a record as a receiver does: against the key the web server published for its id. */
async function signedByWebServer(record: Listed): Promise<boolean> {
  const published = JSON.parse(
    await readFile(join(world.env.stateDir, "published-dispatch-keys.json"), "utf8"),
  ) as { keys: { key_id: string; public_key: string }[] };
  const key = published.keys.find((entry) => entry.key_id === record.envelope.signing_key_id);
  if (key === undefined) return false;
  const publicKey = createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: key.public_key },
    format: "jwk",
  });
  return verify(
    null,
    canonicalBytes(record),
    publicKey,
    Buffer.from(record.envelope.signature, "base64url"),
  );
}

beforeAll(async () => {
  world = await startWorld();
  app = await connect(world, { app: true });
  text = await connect(world, { app: false });
});

afterAll(async () => {
  await app?.close();
  await text?.close();
  await world?.close();
});

describe("a prompt the MCP App's user sends (W4)", () => {
  it("should submit it to the web server with the MCP token, and the web server shall sign it while the MCP server holds no signing key", async () => {
    const alone = await connect(world, { app: true, isolated: true });
    try {
      const { id, owner, repo } = await ownedTask();
      const result = await call(alone, SEND_TOOL, {
        id: newRequestId(),
        repo,
        task: id,
        text: "Look at the flaky test",
      });
      expect(result.isError, textOf(result)).toBeFalsy();
      const [record] = await listed(owner);
      expect(record?.task).toEqual({ repo, id });
      expect(record?.created_by).toBe("owner");
      expect(record?.envelope.signing_key_id).toBe("host-a-20261110");
      expect(record === undefined ? false : await signedByWebServer(record)).toBe(true);
    } finally {
      await alone.close();
    }
  });
});

describe("a prompt a model asks for (W4)", () => {
  it("should create a draft and send nothing until the user confirms it in the app", async () => {
    const { id, owner, repo } = await ownedTask();
    const drafted = await call(app, DRAFT_TOOL, { repo, task: id, text: "Rebase onto main" });
    expect(drafted.isError, textOf(drafted)).toBeFalsy();
    const draft = (drafted.structuredContent as { draft: { id: string; state: string } }).draft;
    expect(draft.state).toBe("draft");
    expect(textOf(drafted)).toContain(draft.id);
    await world.server.ladder.idle();
    expect(await listed(owner)).toEqual([]);
    expect((await calls(world, "agent-mail")).map((one) => flag(one, "--to"))).not.toContain(
      `${owner}@${HOST}`,
    );

    const confirmed = await call(app, CONFIRM_TOOL, { draft: draft.id });
    expect(confirmed.isError, textOf(confirmed)).toBeFalsy();
    const [record] = await listed(owner);
    expect(record?.task).toEqual({ repo, id });
  });

  it("should refuse a second confirm of the same draft and send it only once", async () => {
    const { id, owner, repo } = await ownedTask();
    const drafted = await call(app, DRAFT_TOOL, { repo, task: id, text: "Once only" });
    const draft = (drafted.structuredContent as { draft: { id: string } }).draft;
    expect((await call(app, CONFIRM_TOOL, { draft: draft.id })).isError).toBeFalsy();
    const again = await call(app, CONFIRM_TOOL, { draft: draft.id });
    expect(again.isError).toBe(true);
    expect(textOf(again)).toMatch(/already confirmed/);
    expect(await listed(owner)).toHaveLength(1);
  });

  it("should offer the model no tool that sends: the app's Send and Confirm are app-only", async () => {
    const { tools } = await app.client.listTools();
    for (const name of [SEND_TOOL, CONFIRM_TOOL]) {
      const tool = tools.find((one) => one.name === name);
      expect((tool?._meta as { ui?: { visibility?: string[] } })?.ui?.visibility).toEqual(["app"]);
    }
    const draft = tools.find((one) => one.name === DRAFT_TOOL);
    expect((draft?._meta as { ui?: { visibility?: string[] } })?.ui?.visibility).toBeUndefined();
  });
});

// The web server's own refusals (no token, another user, a repeated id) are pinned at its routes
// in apps/web/test/mcp.test.ts; these are the ones the MCP server's callers meet.
describe("an MCP dispatch request the web server refuses (W4)", () => {
  it("should answer a Send that repeats its request id with the web server's refusal, and send it once", async () => {
    const { id, owner, repo } = await ownedTask();
    const args = { id: newRequestId(), repo, task: id, text: "Exactly once" };
    expect((await call(app, SEND_TOOL, args)).isError).toBeFalsy();
    const again = await call(app, SEND_TOOL, args);
    expect(again.isError).toBe(true);
    expect(textOf(again)).toMatch(/already used/);
    expect(await listed(owner)).toHaveLength(1);
  });

  it("should answer with the web server's refusal when the MCP token is not this host's", async () => {
    const forged = await connect(world, { app: true, isolated: true, token: "x".repeat(43) });
    try {
      const { id, owner, repo } = await ownedTask();
      const result = await call(forged, SEND_TOOL, {
        id: newRequestId(),
        repo,
        task: id,
        text: "Hi",
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/MCP token/);
      expect(await listed(owner)).toEqual([]);
    } finally {
      await forged.close();
    }
  });
});

describe("delivery of an MCP dispatch (W4)", () => {
  it("should follow the same ladder as a web dispatch: addressed Agent Mail naming the dispatch id", async () => {
    const { id, owner, repo } = await ownedTask();
    const result = await call(app, SEND_TOOL, {
      id: newRequestId(),
      repo,
      task: id,
      text: "Carried by the ladder",
    });
    const dispatch = (result.structuredContent as { dispatch: { id: string } }).dispatch.id;
    await waitFor(async () => {
      const mail = (await calls(world, "agent-mail")).find(
        (one) => flag(one, "--to") === `${owner}@${HOST}`,
      );
      expect(flag(mail, "--subject")).toBe(`beads-ui dispatch ${dispatch}`);
    });
    const status = (
      await send(world.server, `/api/dispatch/${dispatch}`, { headers: { cookie: world.cookie } })
    ).json() as { ladder: { rungs: { rung: string; outcome: string }[] } };
    expect(status.ladder.rungs[0]).toMatchObject({ rung: "agent-mail", outcome: "sent" });
  });
});

describe("a host that does not advertise the app capability (W4)", () => {
  it("should accept a text call only as a draft, return its id, and send it once the user confirms it in the web app", async () => {
    const { id, owner, repo } = await ownedTask();
    const drafted = await call(text, DRAFT_TOOL, { repo, task: id, text: "From a text host" });
    expect(drafted.isError, textOf(drafted)).toBeFalsy();
    const draftId = (drafted.structuredContent as { draft: { id: string } }).draft.id;
    expect(textOf(drafted)).toContain(draftId);
    await world.server.ladder.idle();
    expect(await listed(owner)).toEqual([]);

    await expect(
      call(text, SEND_TOOL, { id: newRequestId(), repo, task: id, text: "Sneaked past the draft" }),
    ).rejects.toThrow(/disabled/);
    expect(await listed(owner)).toEqual([]);

    const waiting = (
      await send(world.server, "/api/drafts", { headers: { cookie: world.cookie } })
    ).json() as { drafts: { id: string; text: string }[] };
    expect(waiting.drafts.find((one) => one.id === draftId)?.text).toBe("From a text host");
    const confirmed = await send(world.server, `/api/drafts/${draftId}/confirm`, {
      method: "POST",
      headers: { ...SAME_ORIGIN_WRITE, cookie: world.cookie },
      body: "{}",
    });
    expect(confirmed.status, confirmed.text).toBe(201);
    expect((await listed(owner)).map((record) => record.task.id)).toEqual([id]);
  });

  it("should refuse a confirm from the web app without the browser session's write headers", async () => {
    const { id, repo } = await ownedTask();
    const drafted = await call(text, DRAFT_TOOL, { repo, task: id, text: "Needs the session" });
    const draftId = (drafted.structuredContent as { draft: { id: string } }).draft.id;
    const forged = await send(world.server, `/api/drafts/${draftId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: world.cookie },
      body: "{}",
    });
    expect(forged.status).toBe(403);
  });
});

describe("a task outside the host's allowlist (W4)", () => {
  it("should refuse the dispatch tool's call without naming the repository", async () => {
    const hidden = "private-notes-repo";
    for (const [connected, name, args] of [
      [app, DRAFT_TOOL, { repo: hidden, task: "x-1", text: "Hi" }],
      [text, DRAFT_TOOL, { repo: hidden, task: "x-1", text: "Hi" }],
      [app, SEND_TOOL, { id: newRequestId(), repo: hidden, task: "x-1", text: "Hi" }],
    ] as const) {
      const result = await call(connected, name, args);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/allowlist/);
      expect(JSON.stringify(result)).not.toContain(hidden);
    }
  });
});
