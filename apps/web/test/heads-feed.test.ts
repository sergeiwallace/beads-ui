import { type ChildProcess, execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLOSE_GRACE_MS, type RunningServer, startServer } from "../server/server.ts";
import { type HostEnv, hostConfig, hostEnv, signIn } from "./auth-env.ts";
import { type RepoStore, repoStore, type ScriptedBd, scriptedBd, shQuote } from "./host-stores.ts";

const exec = promisify(execFile);

/** The poll interval the suites configure: short, so a test waits seconds, not the default. */
const INTERVAL_MS = 1_000;

interface Event {
  type: string;
  data: Record<string, unknown>;
  at: number;
}

/** A browser's event stream, read as Server-Sent Events. */
interface Stream {
  events: Event[];
  /** The next event of `type` after `since` (an index into `events`), within `timeoutMs`. */
  next(type: string, since: number, timeoutMs: number): Promise<Event>;
  close(): void;
}

async function openStream(server: RunningServer, cookie: string): Promise<Stream> {
  const abort = new AbortController();
  const response = await fetch(new URL("/api/events", server.url), {
    headers: { cookie },
    signal: abort.signal,
  });
  expect(response.status).toBe(200);
  const events: Event[] = [];
  const waiters = new Set<() => void>();
  void (async () => {
    const reader = response.body?.getReader();
    if (reader === undefined) return;
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let end = buffer.indexOf("\n\n");
        while (end !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const type = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (type !== undefined && data !== undefined) {
            events.push({ type, data: JSON.parse(data), at: Date.now() });
            for (const wake of [...waiters]) wake();
          }
          end = buffer.indexOf("\n\n");
        }
      }
    } catch {
      // The stream was closed.
    }
  })();
  return {
    events,
    next(type, since, timeoutMs) {
      return new Promise((resolve, reject) => {
        const check = () => {
          const found = events.slice(since).find((event) => event.type === type);
          if (found === undefined) return;
          clearTimeout(timer);
          waiters.delete(check);
          resolve(found);
        };
        const timer = setTimeout(() => {
          waiters.delete(check);
          reject(
            new Error(`no ${type} event within ${timeoutMs} ms; saw ${JSON.stringify(events)}`),
          );
        }, timeoutMs);
        waiters.add(check);
        check();
      });
    },
    close: () => abort.abort(),
  };
}

/**
 * A bd that logs every call, `<dir> <args>`, to `log`, then fails `vc` and `sql` while `fail`
 * exists, and takes 4 seconds over them while `<fail>.slow` exists.
 */
async function loggingBd(log: string, fail: string): Promise<ScriptedBd> {
  return scriptedBd(
    [
      `printf '%s %s\\n' "$DIR" "$*" >> ${shQuote(log)}`,
      `if [ -e ${shQuote(`${fail}.slow`)} ]; then case "$1" in vc|sql) sleep 4 ;; esac; fi`,
      `if [ -e ${shQuote(fail)} ]; then case "$1" in vc|sql) echo 'dolt: connection refused' >&2; exit 1 ;; esac; fi`,
    ].join("\n"),
  );
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

const hasDolt = await exec("sh", ["-c", "command -v dolt"]).then(
  () => true,
  () => false,
);

interface Host {
  root: string;
  env: HostEnv;
  stores: RepoStore[];
  log: string;
  fail: string;
  bd: ScriptedBd;
  server: RunningServer;
  cookie: string;
  /** The bd calls logged since `from` lines. */
  calls(from: number): Promise<string[]>;
  remove(): Promise<void>;
}

/**
 * Two stores on one host, both on the allowlist and in the store inventory, served with the poll
 * interval set short. `server` names a Dolt sql-server port the stores use; without one they are
 * embedded stores.
 */
async function twoStores(server?: number): Promise<Host> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "beads-ui-web-feed-")));
  const home = join(root, "home");
  await mkdir(home);
  const stores: RepoStore[] = [];
  for (const prefix of ["feeda", "feedb"]) {
    const dir = join(root, prefix);
    if (server === undefined) stores.push(await repoStore(dir, { prefix }));
    else {
      await mkdir(dir);
      await exec("git", ["init", "-q"], { cwd: dir });
      await exec(
        "bd",
        [
          "init",
          "--non-interactive",
          "--skip-hooks",
          "--server",
          "--external",
          "--server-port",
          String(server),
          "-p",
          prefix,
        ],
        { cwd: dir, timeout: 120_000 },
      );
      const bd = async (...args: string[]) =>
        (await exec("bd", args, { cwd: dir, encoding: "utf8", timeout: 60_000 })).stdout;
      stores.push({
        dir,
        bd,
        async create(title) {
          return (JSON.parse(await bd("create", title, "--json")) as { id: string }).id;
        },
        show: async () => {
          throw new Error("unused");
        },
      });
    }
  }
  const inventory = join(home, ".beads", "shared-server", "publish-sweep.json");
  await mkdir(join(home, ".beads", "shared-server"), { recursive: true });
  await writeFile(
    inventory,
    JSON.stringify({
      schema: 1,
      stores: Object.fromEntries(
        stores.map((store, i) => [["FEEDA", "FEEDB"][i], { repo: store.dir }]),
      ),
      skipped: [],
    }),
  );
  const env = await hostEnv(hostConfig({ allowRepos: ["feeda", "feedb"] }));
  env.configEnv.home = home;
  const log = join(root, "bd-calls.log");
  const fail = join(root, "fail-heads");
  await writeFile(log, "");
  const bd = await loggingBd(log, fail);
  const running = await startServer({
    repoRoot: stores[0]?.dir ?? root,
    port: 0,
    clientDir: root,
    configEnv: env.configEnv,
    bdEnv: { ...bd.env, HOME: home },
    feedIntervalMs: INTERVAL_MS,
  });
  const cookie = await signIn(running);
  return {
    root,
    env,
    stores,
    log,
    fail,
    bd,
    server: running,
    cookie,
    async calls(from) {
      return (await readFile(log, "utf8")).split("\n").filter(Boolean).slice(from);
    },
    async remove() {
      // A case that stopped the server itself has closed it already.
      await running.close().catch(() => undefined);
      await bd.remove();
      await env.remove();
      await rm(root, { recursive: true });
    },
  };
}

/** Lines logged so far. */
async function logged(host: Host): Promise<number> {
  return (await host.calls(0)).length;
}

/** Waits until the feed has read every head once, so the next move is a change. */
async function settled(host: Host, stream: Stream): Promise<void> {
  // Any write moves no head here; the first poll records the heads and pushes nothing.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const status = host.server.feed.status();
    if (status.asOf !== undefined) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the feed never read the heads; events ${JSON.stringify(stream.events)}`);
}

const boardReadsIn = (calls: string[], dir: string) =>
  calls.filter((line) => line.startsWith(`${dir} list`) || line.startsWith(`${dir} statuses`));

describe.skipIf(!hasDolt)("the change feed on a Dolt sql-server", () => {
  let dolt: ChildProcess;
  let doltDir: string;
  let host: Host;

  beforeAll(async () => {
    doltDir = await mkdtemp(join(tmpdir(), "beads-ui-web-dolt-"));
    const port = await freePort();
    dolt = spawn("dolt", ["sql-server", "--host", "127.0.0.1", "--port", String(port)], {
      cwd: doltDir,
      stdio: "ignore",
    });
    const deadline = Date.now() + 30_000;
    for (;;) {
      const answered = await new Promise<boolean>((resolve) => {
        const socket = createServer().listen(port, "127.0.0.1");
        socket.once("listening", () => socket.close(() => resolve(false)));
        socket.once("error", () => resolve(true));
      });
      if (answered) break;
      if (Date.now() > deadline) throw new Error("dolt sql-server did not start");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    host = await twoStores(port);
  }, 180_000);

  afterAll(async () => {
    await host?.remove();
    if (dolt !== undefined && dolt.exitCode === null) {
      // The server writes its files until it exits, so its directory goes only after that.
      const exited = new Promise((resolve) => dolt.once("exit", resolve));
      dolt.kill("SIGTERM");
      await exited;
    }
    if (doltDir !== undefined) await rm(doltDir, { recursive: true });
  });

  it("should read both stores' heads in one query, re-read only the store that moved and push one event within the interval", async () => {
    const stream = await openStream(host.server, host.cookie);
    try {
      await settled(host, stream);
      const [a, b] = host.stores;
      if (a === undefined || b === undefined) throw new Error("two stores");
      // A store's own read, before the move, is kept for its head.
      await fetch(new URL("/api/board", host.server.url), { headers: { cookie: host.cookie } });
      const from = await logged(host);
      const seen = stream.events.length;
      await a.create("moved by another actor");
      const written = Date.now();
      const change = await stream.next("change", seen, 30_000);
      expect(change.data.stores).toEqual(["feeda"]);
      expect(change.at - written).toBeLessThan(INTERVAL_MS + 10_000);
      expect(stream.events.slice(seen).filter((event) => event.type === "change")).toHaveLength(1);
      const calls = await host.calls(from);
      expect(boardReadsIn(calls, a.dir).length).toBeGreaterThan(0);
      expect(boardReadsIn(calls, b.dir)).toEqual([]);
      // One process asked the server for both heads; neither store's head was read on its own.
      const sql = calls.filter((line) =>
        / sql SELECT @@`feeda_head` AS h0, @@`feedb_head` AS h1/.test(line),
      );
      expect(sql.length).toBeGreaterThan(0);
      expect(calls.filter((line) => / vc status/.test(line))).toEqual([]);
    } finally {
      stream.close();
    }
  }, 120_000);
});

describe("the change feed on embedded stores", () => {
  let host: Host;

  beforeAll(async () => {
    host = await twoStores();
  }, 180_000);

  afterAll(async () => {
    await host?.remove();
  });

  it("should push one event naming only the store whose head moved and re-read that store alone", async () => {
    const stream = await openStream(host.server, host.cookie);
    try {
      await settled(host, stream);
      const [a, b] = host.stores;
      if (a === undefined || b === undefined) throw new Error("two stores");
      const from = await logged(host);
      const seen = stream.events.length;
      await b.create("moved");
      const change = await stream.next("change", seen, 30_000);
      expect(change.data.stores).toEqual(["feedb"]);
      const calls = await host.calls(from);
      expect(boardReadsIn(calls, b.dir).length).toBeGreaterThan(0);
      expect(boardReadsIn(calls, a.dir)).toEqual([]);
    } finally {
      stream.close();
    }
  }, 120_000);

  it("should serve a store's board from the read the feed kept while its head has not moved", async () => {
    const stream = await openStream(host.server, host.cookie);
    try {
      await settled(host, stream);
      const [a] = host.stores;
      if (a === undefined) throw new Error("a store");
      const read = () =>
        fetch(new URL("/api/board?store=feeda", host.server.url), {
          headers: { cookie: host.cookie },
        });
      expect((await read()).status).toBe(200);
      const from = await logged(host);
      expect((await read()).status).toBe(200);
      expect(boardReadsIn(await host.calls(from), a.dir)).toEqual([]);
    } finally {
      stream.close();
    }
  }, 60_000);

  it("should run no bd for the feed while no event stream is open", async () => {
    // Every stream of the earlier cases is closed; the feed goes idle once the server sees it.
    const deadline = Date.now() + 10_000;
    while (host.server.feed.status().asOf !== undefined && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(host.server.feed.status()).toEqual({});
    const from = await logged(host);
    await new Promise((resolve) => setTimeout(resolve, 3 * INTERVAL_MS));
    const calls = await host.calls(from);
    expect(calls.filter((line) => / (vc|sql) /.test(line))).toEqual([]);
  }, 60_000);

  it("should keep the last state with a stale stamp, retry with a doubling wait and report no change while the heads cannot be read", async () => {
    const stream = await openStream(host.server, host.cookie);
    try {
      await settled(host, stream);
      const seen = stream.events.length;
      const board = await (
        await fetch(new URL("/api/board", host.server.url), { headers: { cookie: host.cookie } })
      ).json();
      await writeFile(host.fail, "");
      const first = await stream.next("stale", seen, 30_000);
      const second = await stream.next("stale", stream.events.indexOf(first) + 1, 30_000);
      expect(first.data.message).toMatch(/connection refused/);
      expect(first.data.since).toEqual(second.data.since);
      expect(second.data.retryInMs).toBe(2 * (first.data.retryInMs as number));
      expect(second.at - first.at).toBeGreaterThanOrEqual((first.data.retryInMs as number) - 100);
      expect(stream.events.slice(seen).map((event) => event.type)).not.toContain("change");
      expect(host.server.feed.status().stale?.since).toBe(first.data.since);
      // The last state stands: the board still reads, as it did before the heads failed.
      const during = await (
        await fetch(new URL("/api/board", host.server.url), { headers: { cookie: host.cookie } })
      ).json();
      expect(during.issues).toEqual(board.issues);

      await rm(host.fail);
      const back = stream.events.length;
      const change = await stream.next("change", back, 30_000);
      expect(change.data.stores).toEqual([]);
      expect(host.server.feed.status().stale).toBeUndefined();
    } finally {
      stream.close();
    }
  }, 120_000);
});

describe("stopping the server while a page holds a stream", () => {
  let host: Host;

  beforeAll(async () => {
    host = await twoStores();
  }, 180_000);

  afterAll(async () => {
    await host?.remove();
  });

  it("should refuse the stream a browser reopens as the stop begins, so the stop does not wait out its connection", async () => {
    const stream = await openStream(host.server, host.cookie);
    await settled(host, stream);
    // Hold a poll in flight, as a loaded host does: the stop waits for it before it stops listening.
    await writeFile(`${host.fail}.slow`, "");
    const from = await logged(host);
    while (!(await host.calls(from)).some((line) => / vc /.test(line))) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const started = Date.now();
    // A browser's EventSource reconnects the moment its stream ends, and the stop ends it first.
    const stopping = host.server.close();
    const reopened = await fetch(new URL("/api/events", host.server.url), {
      headers: { cookie: host.cookie },
    });
    expect(reopened.status).toBe(503);
    await reopened.arrayBuffer();
    await stopping;
    expect(Date.now() - started).toBeLessThan(CLOSE_GRACE_MS);
    stream.close();
  }, 120_000);
});
