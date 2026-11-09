import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type RunningServer, startServer } from "../server/server.ts";
import { type HostEnv, hostConfig, hostEnv, SAME_ORIGIN_WRITE, send, signIn } from "./auth-env.ts";
import {
  type RepoStore,
  repoStore,
  type StoreHost,
  scriptedBd,
  shQuote,
  storeHost,
} from "./host-stores.ts";

// The web server's store registry: every store on the host whose repository is on the host's
// allowlist (web app design T-W0.2, D-18), through requests to the running server.

let host: StoreHost;
let env: HostEnv;
let clientDir: string;
const stores: Record<string, RepoStore> = {};
/** A directory that holds no store and is on no allowlist. */
let elsewhere: string;
const cleanup: (() => Promise<void>)[] = [];

/** Every fixture store, made at once: a name, its directory under the root, and its options. */
const FIXTURES: [string, string, Parameters<typeof repoStore>[1]][] = [
  ["alpha", "alpha", { prefix: "alpha" }],
  ["beta", "beta", { prefix: "beta" }],
  ["gamma", "gamma", { prefix: "gamma" }],
  ["outside", "outside", { prefix: "outside" }],
  // One prefix, one id, two stores.
  ["left", "left", { prefix: "dup" }],
  ["right", "right", { prefix: "dup" }],
  // Two repositories named `proj` under different owners.
  ["ours", "ours/proj", { prefix: "ours", remote: "https://git.host-a.invalid/owner-a/proj.git" }],
  [
    "theirs",
    "theirs/proj",
    { prefix: "theirs", remote: "git@git.host-a.invalid:owner-b/proj.git" },
  ],
  ["twinA", "one/twin", { prefix: "twina", remote: "https://git.host-a.invalid/owner-a/twin.git" }],
  ["twinB", "two/twin", { prefix: "twinb", remote: "https://git.host-a.invalid/owner-b/twin.git" }],
];

const store = (name: string): RepoStore => {
  const found = stores[name];
  if (found === undefined) throw new Error(`no fixture store ${name}`);
  return found;
};

interface Started {
  server: RunningServer;
  cookie: string;
}

async function start(
  repoRoot: string,
  options: { bdEnv?: NodeJS.ProcessEnv; home?: string | undefined } = {},
): Promise<Started> {
  const server = await startServer({
    repoRoot,
    port: 0,
    clientDir,
    configEnv: { ...env.configEnv, home: "home" in options ? options.home : host.home },
    ...(options.bdEnv === undefined ? {} : { bdEnv: options.bdEnv }),
  });
  cleanup.push(server.close);
  return { server, cookie: await signIn(server) };
}

const get = async ({ server, cookie }: Started, path: string) => {
  const reply = await send(server, path, { headers: { cookie } });
  return { status: reply.status, text: reply.text, body: JSON.parse(reply.text) };
};

const post = async ({ server, cookie }: Started, path: string, body: unknown) => {
  const reply = await send(server, path, {
    method: "POST",
    headers: { ...SAME_ORIGIN_WRITE, cookie },
    body: JSON.stringify(body),
  });
  return { status: reply.status, body: JSON.parse(reply.text) };
};

const allow = (repos: string[]) => env.write(hostConfig({ allowRepos: repos }));

const inventoryOf = (...names: string[]) =>
  host.inventory(
    names.map((name) => ({
      prefix: FIXTURES.find(([n]) => n === name)?.[2].prefix ?? name,
      dir: store(name).dir,
    })),
  );

const idsOf = (body: { issues: { id: string }[] }) => body.issues.map((issue) => issue.id);

beforeAll(async () => {
  host = await storeHost();
  env = await hostEnv();
  clientDir = join(env.configHome, "client");
  await mkdir(clientDir);
  await writeFile(join(clientDir, "index.html"), "<!doctype html><title>beads-ui client</title>");
  const made = await Promise.all(
    FIXTURES.map(([, dir, options]) => repoStore(join(host.root, dir), options)),
  );
  FIXTURES.forEach(([name], i) => {
    const made_ = made[i];
    if (made_ !== undefined) stores[name] = made_;
  });
  elsewhere = join(host.root, "elsewhere");
  await mkdir(elsewhere);
}, 300_000);

beforeEach(() => inventoryOf("alpha", "beta", "gamma"));

afterAll(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
  await env?.remove();
  await host?.remove();
});

describe("opening the host's stores", () => {
  it("should open every store whose repository is on the allowlist, and only those, whatever directory it started in", async () => {
    await allow(["alpha", "beta"]);
    const a = await store("alpha").create("Alpha task");
    const b = await store("beta").create("Beta task");
    const g = await store("gamma").create("Gamma task");
    const started = await start(elsewhere);
    expect(started.server.stores).toEqual(["alpha", "beta"]);
    expect(started.server.storeClosed).toBeUndefined();

    const board = await get(started, "/api/board");
    expect(board.status).toBe(200);
    expect(idsOf(board.body)).toEqual(expect.arrayContaining([a, b]));
    expect(idsOf(board.body)).not.toContain(g);
    expect(board.text).not.toContain("gamma");
    // gamma and the start directory stay closed, counted and never named.
    expect(board.body.health).toEqual([
      "2 stores from repositories not on this host's allowlist are hidden",
    ]);
  });

  it("should open the store of the directory it started in as one of the registry's stores", async () => {
    await allow(["alpha", "beta"]);
    const started = await start(store("alpha").dir);
    expect(started.server.stores).toEqual(["alpha", "beta"]);
    expect((await get(started, "/api/health")).body.stores).toEqual(["alpha", "beta"]);
  });

  it("should open a listed store it started in beside the inventory's stores", async () => {
    await allow(["outside", "beta"]);
    const started = await start(store("outside").dir);
    expect(started.server.stores).toEqual(["outside", "beta"]);
  });

  it("should open no store and say why when none of the host's repositories is listed", async () => {
    await allow(["some-other-repo"]);
    const started = await start(elsewhere);
    expect(started.server.storeClosed).toContain("not on [hosts] allow_repos");
    const board = await get(started, "/api/board");
    expect(board.status).toBe(503);
    expect(board.body.error).toMatchObject({ kind: "store-closed" });
    for (const name of ["alpha", "beta", "gamma"]) expect(board.text).not.toContain(name);
  });
});

describe("reading every open store", () => {
  it("should name each issue's repository with no store chosen, and narrow to the store ?store= names", async () => {
    await allow(["alpha", "beta"]);
    const a = await store("alpha").create("Named alpha");
    const b = await store("beta").create("Named beta");
    const started = await start(elsewhere);

    const every = await get(started, "/api/board");
    expect(every.body.chosen).toBeNull();
    expect(every.body.repositories).toEqual(["alpha", "beta"]);
    const repositoryOf = (id: string) =>
      every.body.issues.find((issue: { id: string }) => issue.id === id)?.repository;
    expect(repositoryOf(a)).toBe("alpha");
    expect(repositoryOf(b)).toBe("beta");

    const narrowed = await get(started, "/api/board?store=beta");
    expect(narrowed.body.chosen).toBe("beta");
    expect(narrowed.body.repositories).toEqual(["alpha", "beta"]);
    expect(idsOf(narrowed.body)).toContain(b);
    expect(idsOf(narrowed.body)).not.toContain(a);
    expect(narrowed.body.reads).toEqual([
      { repository: "beta", ok: true, count: narrowed.body.issues.length },
    ]);
  });

  it("should refuse a board read narrowed to a store that is not open", async () => {
    await allow(["alpha", "beta"]);
    const started = await start(elsewhere);
    const closed = await get(started, "/api/board?store=gamma");
    expect(closed.status).toBe(404);
    expect(closed.body.error).toMatchObject({ kind: "not-found", source: "store" });
    expect(closed.body.issues).toBeUndefined();
  });

  it("should still return the other stores and name the failed one with its error when one store cannot be read", async () => {
    await allow(["alpha", "beta"]);
    const a = await store("alpha").create("Still read");
    const failing = await scriptedBd(
      `[ "$DIR" = ${shQuote(store("beta").dir)} ] && { echo "Error: database is locked" >&2; exit 1; }`,
    );
    cleanup.push(failing.remove);
    const started = await start(elsewhere, { bdEnv: failing.env });

    const board = await get(started, "/api/board");
    expect(board.status).toBe(200);
    expect(idsOf(board.body)).toContain(a);
    expect(board.body.reads).toEqual([
      { repository: "alpha", ok: true, count: board.body.issues.length },
      {
        repository: "beta",
        ok: false,
        error: {
          kind: "failed",
          source: "bd statuses",
          exitCode: 1,
          message: "bd statuses exited 1: Error: database is locked",
        },
      },
    ]);
    expect(
      board.body.issues.filter((issue: { repository: string }) => issue.repository === "beta"),
    ).toEqual([]);
  });

  it("should fail the read and name every store when every open store fails", async () => {
    await allow(["alpha", "beta"]);
    const failing = await scriptedBd(`echo "Error: database is locked" >&2; exit 1`);
    cleanup.push(failing.remove);
    const started = await start(elsewhere, { bdEnv: failing.env });
    const board = await get(started, "/api/board");
    expect(board.status).toBe(502);
    expect(board.body.issues).toBeUndefined();
    expect(board.body.reads).toEqual([
      expect.objectContaining({ repository: "alpha", ok: false }),
      expect.objectContaining({ repository: "beta", ok: false }),
    ]);
  });
});

describe("writing to an issue's own store", () => {
  it("should send status, priority and rank writes to the store ?store= names, and nowhere else", async () => {
    await allow(["alpha", "beta"]);
    const a = await store("alpha").create("Alpha untouched", { priority: 3 });
    const b = await store("beta").create("Beta written", { priority: 3 });
    const started = await start(elsewhere);

    const status = await post(started, `/api/issues/${b}/status?store=beta`, {
      to: "in_progress",
      shown: "open",
    });
    expect(status).toEqual({ status: 200, body: { id: b, status: "in_progress" } });
    const priority = await post(started, `/api/issues/${b}/priority?store=beta`, {
      priority: 0,
      shown: "in_progress",
    });
    expect(priority.status).toBe(200);
    const rank = await post(started, `/api/issues/${b}/rank?store=beta`, { shown: "in_progress" });
    expect(rank.status).toBe(200);
    expect(await store("beta").show(b)).toMatchObject({
      status: "in_progress",
      priority: 0,
      metadata: { rank: rank.body.rank },
    });

    // The same write addressed to alpha does not find beta's issue there.
    const wrongStore = await post(started, `/api/issues/${b}/status?store=alpha`, {
      to: "blocked",
      shown: "in_progress",
    });
    expect(wrongStore.status).toBe(404);
    expect((await store("beta").show(b)).status).toBe("in_progress");
    expect(await store("alpha").show(a)).toMatchObject({ status: "open", priority: 3 });
  });

  it("should refuse a write naming a store that is not open, and write nothing", async () => {
    await allow(["alpha", "beta"]);
    const g = await store("gamma").create("Gamma closed");
    const started = await start(elsewhere);
    const bodies = {
      status: { to: "in_progress", shown: "open" },
      priority: { priority: 0, shown: "open" },
      rank: { shown: "open" },
    };
    for (const [kind, body] of Object.entries(bodies)) {
      const refused = await post(started, `/api/issues/${g}/${kind}?store=gamma`, body);
      expect(refused.status).toBe(404);
      expect(refused.body.error).toMatchObject({ kind: "not-found", source: "store" });
    }
    const after = await store("gamma").show(g);
    expect(after).toMatchObject({ status: "open", priority: 2 });
    expect(after.metadata?.rank).toBeUndefined();
  });

  it("should refuse an issue read or write that names no store while several are open", async () => {
    await allow(["alpha", "beta"]);
    const a = await store("alpha").create("Unaddressed");
    const started = await start(elsewhere);
    expect((await get(started, `/api/issues/${a}`)).status).toBe(400);
    const write = await post(started, `/api/issues/${a}/status`, { to: "blocked", shown: "open" });
    expect(write.status).toBe(400);
    expect((await store("alpha").show(a)).status).toBe("open");
  });
});

describe("one id in two stores", () => {
  it("should address each issue by repository and id, so neither shadows the other", async () => {
    await store("left").create("The left one", { id: "dup-1" });
    await store("right").create("The right one", { id: "dup-1" });
    await inventoryOf("left");
    await allow(["left", "right"]);
    // right is the start directory, left the inventory's store of the same prefix.
    const started = await start(store("right").dir);
    expect(started.server.stores).toEqual(["left", "right"]);

    const board = await get(started, "/api/board");
    const both = board.body.issues.filter((issue: { id: string }) => issue.id === "dup-1");
    expect(
      both.map((issue: { repository: string; title: string }) => [issue.repository, issue.title]),
    ).toEqual([
      ["left", "The left one"],
      ["right", "The right one"],
    ]);
    expect((await get(started, "/api/issues/dup-1?store=left")).body).toMatchObject({
      repository: "left",
      issue: { title: "The left one" },
    });
    expect((await get(started, "/api/issues/dup-1?store=right")).body).toMatchObject({
      repository: "right",
      issue: { title: "The right one" },
    });

    const moved = await post(started, "/api/issues/dup-1/status?store=right", {
      to: "in_progress",
      shown: "open",
    });
    expect(moved.status).toBe(200);
    expect((await store("right").show("dup-1")).status).toBe("in_progress");
    expect((await store("left").show("dup-1")).status).toBe("open");
  });
});

describe("a repository's identity (D-18)", () => {
  it("should open the listed owner's repository and not another repository with the same name", async () => {
    await allow(["owner-a/proj"]);
    const ran = join(host.root, "theirs-ran");
    const watched = await scriptedBd(
      `[ "$DIR" = ${shQuote(store("theirs").dir)} ] && echo "$*" >> ${shQuote(ran)}; true`,
    );
    cleanup.push(watched.remove);

    const inOurs = await start(store("ours").dir, { home: undefined });
    expect(inOurs.server.stores).toEqual(["owner-a/proj"]);
    expect((await get(inOurs, "/api/board")).status).toBe(200);

    const inTheirs = await start(store("theirs").dir, { home: undefined, bdEnv: watched.env });
    expect(inTheirs.server.stores).toEqual([]);
    expect(inTheirs.server.storeClosed).toContain("not on [hosts] allow_repos");
    expect((await get(inTheirs, "/api/board")).status).toBe(503);
    await expect(access(ran)).rejects.toThrow();
  });

  it("should open neither of two repositories one entry names, and name the entry in the health line", async () => {
    await inventoryOf("twinA", "twinB", "alpha");
    await allow(["twin", "alpha"]);
    const started = await start(store("alpha").dir);
    expect(started.server.stores).toEqual(["alpha"]);
    const board = await get(started, "/api/board");
    expect(
      board.body.issues.every((issue: { repository: string }) => issue.repository === "alpha"),
    ).toBe(true);
    expect(board.body.health).toContainEqual(
      expect.stringContaining('[hosts] allow_repos entry "twin" names more than one repository'),
    );

    // Naming the owner settles it: only that repository opens.
    await allow(["twin", "owner-b/twin", "alpha"]);
    expect((await get(started, "/api/health")).body.stores).toEqual(["owner-b/twin", "alpha"]);
    // A path names one repository too.
    await allow([store("twinA").dir, "alpha"]);
    expect((await get(started, "/api/health")).body.stores).toEqual([store("twinA").dir, "alpha"]);
  });

  it("should never match an owner entry against a repository with no remote", async () => {
    await allow(["someone/alpha"]);
    const started = await start(store("alpha").dir, { home: undefined });
    expect(started.server.stores).toEqual([]);
    expect(started.server.storeClosed).toContain("not on [hosts] allow_repos");
  });
});
