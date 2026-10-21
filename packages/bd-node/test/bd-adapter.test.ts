import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Issue, moveArgv } from "@beads-ui/core";
import { afterEach, describe, expect, it } from "vitest";
import { BD_INSTALL_PAGE, type BdResult, createBdClient, type StaleWrite } from "../src/index.ts";
import { type StubBd, type StubReply, stubBd } from "./stub.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
// The host runs the shared Dolt server under load; a whole-store read has timed out at 10 s (Risk 4).
const REAL_BD_TIMEOUT_MS = 60_000;

const stubs: StubBd[] = [];
afterEach(async () => {
  for (const stub of stubs.splice(0)) await stub.remove();
});

async function stubbed(reply: StubReply) {
  const stub = await stubBd(reply);
  stubs.push(stub);
  return { stub, client: createBdClient({ cwd: stub.dir, env: stub.env }) };
}

function okValue<T>(result: BdResult<T>): T {
  if (result.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result.value;
}

const ISSUE_JSON = JSON.stringify([
  {
    id: "BU-abc",
    title: "A task",
    status: "open",
    priority: 2,
    issue_type: "task",
    labels: ["id:a-task-x1"],
    metadata: { display_id: "a-task-x1" },
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T00:00:00Z",
  },
]);

function rawList(): Record<string, unknown>[] {
  return JSON.parse(
    execFileSync("bd", ["list", "--json", "--all", "--brief", "--limit", "0"], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: REAL_BD_TIMEOUT_MS,
    }),
  );
}

function expectIssueModel(issue: Issue): void {
  expect(typeof issue.id).toBe("string");
  expect(issue.id).not.toBe("");
  expect(typeof issue.title).toBe("string");
  expect(typeof issue.status).toBe("string");
  expect([0, 1, 2, 3, 4]).toContain(issue.priority);
  expect(typeof issue.type).toBe("string");
  expect(Array.isArray(issue.labels)).toBe(true);
  for (const label of issue.labels) expect(typeof label).toBe("string");
  expect(Array.isArray(issue.dependencies)).toBe(true);
  for (const dep of issue.dependencies) {
    expect(typeof dep.type).toBe("string");
    expect(typeof dep.id).toBe("string");
  }
  expect(Number.isNaN(Date.parse(issue.createdAt))).toBe(false);
  expect(Number.isNaN(Date.parse(issue.updatedAt))).toBe(false);
  expect(typeof issue.metadata).toBe("object");
  expect(Array.isArray(issue.metadata)).toBe(false);
}

describe("list against this repository's own store", () => {
  it(
    "should return an Issue matching the core model for every record when bd list --json runs",
    async () => {
      // Raw reads before and after the adapter's; a record another actor touched in between is
      // left out of the comparison, every record stable across both must come back matching.
      const before = rawList();
      const client = createBdClient({ cwd: repoRoot, timeoutMs: REAL_BD_TIMEOUT_MS });
      const issues = okValue(await client.list());
      const after = new Map(rawList().map((record) => [record.id, record]));
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) expectIssueModel(issue);

      const byId = new Map(issues.map((issue) => [issue.id, issue]));
      const stable = before.filter(
        (record) => after.get(record.id)?.updated_at === record.updated_at,
      );
      expect(stable.length).toBeGreaterThan(0);
      for (const record of stable) {
        const issue = byId.get(String(record.id));
        expect(issue, `bd list returned ${String(record.id)}`).toBeDefined();
        if (issue === undefined) continue;
        expect(issue.updatedAt).toBe(record.updated_at);
        expect(issue.title).toBe(record.title);
        expect(issue.status).toBe(record.status);
        expect(issue.priority).toBe(record.priority);
        expect(issue.type).toBe(record.issue_type);
        expect(issue.labels).toEqual(record.labels ?? []);
        expect(issue.createdAt).toBe(record.created_at);
      }
    },
    REAL_BD_TIMEOUT_MS * 3 + 10_000,
  );
});

describe("list through a stub bd", () => {
  it("should run bd list --json without a shell and parse its records when bd answers", async () => {
    const { stub, client } = await stubbed({ stdout: ISSUE_JSON });
    const [issue] = okValue(await client.list());
    expect(issue?.id).toBe("BU-abc");
    expect(issue?.displayId).toBe("a-task-x1");
    expect(await stub.calls()).toEqual(["list --json --all --brief --limit 0"]);
  });

  it("should return a failed result naming the parse error when bd prints malformed JSON", async () => {
    const { client } = await stubbed({ stdout: "{not json" });
    const result = await client.list();
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.exitCode).toBe(0);
    expect(result.parseError?.source).toBe("bd list");
    expect(result.message).toContain("bd list");
  });

  it("should return a failed result with the exit code and stderr when bd exits non-zero", async () => {
    const { client } = await stubbed({ exitCode: 1, stderr: "database is locked\n" });
    const result = await client.list();
    expect(result).toEqual({
      kind: "failed",
      exitCode: 1,
      stderr: "database is locked\n",
      message: "bd list exited 1: database is locked",
    });
  });

  it("should return a timeout result when bd runs past the call's timeout", async () => {
    const { stub, client } = await stubbed({ hang: true });
    const started = Date.now();
    const result = await client.list({ timeoutMs: 200 });
    expect(result).toEqual({ kind: "timeout", command: "bd list", timeoutMs: 200 });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(await stub.calls()).toHaveLength(1);
  });
});

describe("bd not on PATH", () => {
  it("should fail with a message naming bd and the install page, not a stack trace, when PATH holds no bd", async () => {
    const empty = await mkdtemp(join(tmpdir(), "bd-node-nopath-"));
    try {
      const client = createBdClient({ cwd: empty, env: { ...process.env, PATH: empty } });
      const result = await client.list();
      expect(result.kind).toBe("failed");
      if (result.kind !== "failed") return;
      expect(result.exitCode).toBeNull();
      expect(result.message).toMatch(/\bbd\b/);
      expect(result.message).toContain(BD_INSTALL_PAGE);
      expect(BD_INSTALL_PAGE).toBe("https://github.com/steveyegge/beads");
      expect(result.message).not.toMatch(/\n\s*at\s/);
      expect(result.message).not.toMatch(/ENOENT|Error:/);
    } finally {
      await rm(empty, { recursive: true });
    }
  });

  it("should name the missing directory rather than bd when the store directory does not exist", async () => {
    const { stub } = await stubbed({ stdout: ISSUE_JSON });
    const missing = join(stub.dir, "no-such-store");
    const result = await createBdClient({ cwd: missing, env: stub.env }).list();
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.message).toBe(`the store directory ${missing} does not exist`);
  });
});

describe("show, statuses and ready against this repository's own store", () => {
  const client = createBdClient({ cwd: repoRoot, timeoutMs: REAL_BD_TIMEOUT_MS });

  it(
    "should return the one Issue bd show names when the id exists",
    async () => {
      const [first] = okValue(await client.list());
      if (first === undefined) throw new Error("this repository's store has no issues");
      const issue = okValue(await client.show(first.id));
      expect(issue.id).toBe(first.id);
      expectIssueModel(issue);
    },
    REAL_BD_TIMEOUT_MS * 2,
  );

  it(
    "should return notFound when bd show is given an id the store does not hold",
    async () => {
      const result = await client.show("BU-zzzzzz");
      expect(result.kind).toBe("notFound");
      if (result.kind !== "notFound") return;
      expect(result.id).toBe("BU-zzzzzz");
    },
    REAL_BD_TIMEOUT_MS,
  );

  it(
    "should return the built-in statuses with their categories when bd statuses --json runs",
    async () => {
      const statuses = okValue(await client.statuses());
      expect(statuses).toContainEqual({ name: "open", category: "active", builtin: true });
      expect(statuses).toContainEqual({ name: "closed", category: "done", builtin: true });
    },
    REAL_BD_TIMEOUT_MS,
  );

  it(
    "should return Issues in the list shape when bd ready --json runs",
    async () => {
      const issues = okValue(await client.ready());
      for (const issue of issues) {
        expectIssueModel(issue);
        expect(issue.status).not.toBe("closed");
      }
    },
    REAL_BD_TIMEOUT_MS,
  );
});

describe("show, statuses and ready through a stub bd", () => {
  it("should pass the id to bd show and return its one record when bd answers", async () => {
    const { stub, client } = await stubbed({ stdout: ISSUE_JSON });
    expect(okValue(await client.show("BU-abc")).id).toBe("BU-abc");
    expect(await stub.calls()).toEqual(["show BU-abc --json"]);
  });

  it("should return notFound rather than failed when bd show exits 1 naming the id", async () => {
    const { client } = await stubbed({ exitCode: 1, stderr: "Issue BU-gone not found\n" });
    expect(await client.show("BU-gone")).toEqual({
      kind: "notFound",
      id: "BU-gone",
      stderr: "Issue BU-gone not found\n",
    });
  });

  it("should return failed with the parse error when bd statuses prints an unknown category", async () => {
    const { client } = await stubbed({
      stdout: JSON.stringify({ built_in_statuses: [{ name: "open", category: "nope" }] }),
    });
    const result = await client.statuses();
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.parseError?.source).toBe("bd statuses");
  });

  it("should run bd ready --json and parse its records when bd answers", async () => {
    const { stub, client } = await stubbed({ stdout: ISSUE_JSON });
    expect(okValue(await client.ready()).map((issue) => issue.id)).toEqual(["BU-abc"]);
    expect(await stub.calls()).toEqual(["ready --json --brief --limit 0"]);
  });
});

describe("update through a stub bd", () => {
  const STALE_STDERR = "BU-abc: status is in_progress, not open; nothing written\n";

  it("should return a StaleWrite and call bd once when bd exits 13 on a guarded update", async () => {
    const { stub, client } = await stubbed({ exitCode: 13, stderr: STALE_STDERR });
    const result: BdResult<void> = await client.update(
      "BU-abc",
      { status: "in_progress" },
      { ifStatus: "open" },
    );
    const stale: StaleWrite | undefined = result.kind === "stale" ? result : undefined;
    expect(stale).toEqual({ kind: "stale", id: "BU-abc", exitCode: 13, stderr: STALE_STDERR });
    expect(await stub.calls()).toHaveLength(1);
  });

  it("should return a StaleWrite when bd exits 13 on an assignee guard", async () => {
    const { stub, client } = await stubbed({ exitCode: 13 });
    const result = await client.update("BU-abc", { assignee: "me" }, { ifAssignee: "" });
    expect(result.kind).toBe("stale");
    expect(await stub.calls()).toEqual(["update BU-abc --assignee=me --if-assignee="]);
  });

  it("should write the same argv as the core's moveArgv when the update is a guarded move", async () => {
    const { stub, client } = await stubbed({});
    const result = await client.update("BU-abc", { status: "in_progress" }, { ifStatus: "open" });
    expect(result).toEqual({ kind: "ok", value: undefined });
    expect(await stub.calls()).toEqual([
      moveArgv("BU-abc", "in_progress", "open").slice(1).join(" "),
    ]);
  });

  it("should pass every field as its bd flag when an update sets them all", async () => {
    const { stub, client } = await stubbed({});
    await client.update("BU-abc", {
      title: "-starts with a dash",
      description: "two words",
      priority: 1,
      type: "bug",
      due: "2026-11-01",
      estimatedMinutes: 30,
      addLabels: ["sprint:s1"],
      removeLabels: ["old"],
    });
    expect(await stub.calls()).toEqual([
      "update BU-abc --title=-starts with a dash --description=two words --priority=1 --type=bug" +
        " --due=2026-11-01 --estimate=30 --add-label=sprint:s1 --remove-label=old",
    ]);
  });

  it("should return failed with exit code 13 when an unguarded update exits 13", async () => {
    const { client } = await stubbed({ exitCode: 13, stderr: "odd\n" });
    const result = await client.update("BU-abc", { title: "New" });
    expect(result).toMatchObject({ kind: "failed", exitCode: 13, stderr: "odd\n" });
  });

  it("should return failed with the exit code and stderr when a guarded update exits 1", async () => {
    const { stub, client } = await stubbed({ exitCode: 1, stderr: "database is locked\n" });
    const result = await client.update("BU-abc", { status: "closed" }, { ifStatus: "open" });
    expect(result).toEqual({
      kind: "failed",
      exitCode: 1,
      stderr: "database is locked\n",
      message: "bd update exited 1: database is locked",
    });
    expect(await stub.calls()).toHaveLength(1);
  });

  it("should return notFound when bd update names the id as not found", async () => {
    const { client } = await stubbed({ exitCode: 1, stderr: "Issue BU-gone not found\n" });
    const result = await client.update("BU-gone", { title: "x" }, { ifStatus: "open" });
    expect(result.kind).toBe("notFound");
  });

  it("should refuse before running bd when an update has no field or a label holds a comma", async () => {
    const { stub, client } = await stubbed({});
    expect(() => client.update("BU-abc", {}, { ifStatus: "open" })).toThrow(RangeError);
    expect(() => client.update("BU-abc", { addLabels: ["a,b"] })).toThrow(RangeError);
    expect(() => client.update("-x", { title: "t" })).toThrow(RangeError);
    expect(await stub.calls()).toEqual([]);
  });
});
