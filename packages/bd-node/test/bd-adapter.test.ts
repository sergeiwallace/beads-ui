import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Issue } from "@beads-ui/core";
import { afterEach, describe, expect, it } from "vitest";
import { BD_INSTALL_PAGE, type BdResult, createBdClient } from "../src/index.ts";
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
