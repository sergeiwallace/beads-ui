import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../bin/beads-ui-terminal.mjs", import.meta.url));

it("should draw only the named session through the real CLI and bd-node when reading once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bd-terminal-"));
  const issue = (id: string, assignee: string, title: string) => ({
    id,
    title,
    assignee,
    status: "in_progress",
    priority: 1,
    issue_type: "task",
    created_at: "2026-11-15T00:00:00Z",
    updated_at: "2026-11-15T00:00:00Z",
  });
  const issues = JSON.stringify([
    {
      ...issue("BU-0123456789abcdef0123456789abcdef", "aih-fw-cole", "Own task\u001b[2J"),
      metadata: { display_id: "friendly-task-name" },
    },
    issue("BU-peer", "peer", "Peer task"),
  ]);
  try {
    await writeFile(join(dir, "issues.json"), issues);
    const script =
      '#!/bin/sh\ncase "$1" in\nlist) cat "$BEADS_TEST_ISSUES";;\nstatuses) printf \'{"built_in_statuses":[{"name":"in_progress","category":"wip"}],"custom_statuses":[]}\';;\n*) exit 9;;\nesac\n';
    await writeFile(join(dir, "bd"), script);
    await chmod(join(dir, "bd"), 0o755);
    const out = await exec(
      process.execPath,
      [cli, "--repo", dir, "--session", "aih-fw-cole", "--once"],
      {
        env: {
          ...process.env,
          PATH: `${dir}:/usr/bin:/bin`,
          BEADS_TEST_ISSUES: join(dir, "issues.json"),
        },
      },
    );
    expect(out.stdout).toContain("friendly-task-name");
    expect(out.stdout).toContain("BU-0123456789abcdef0123456789abcdef");
    expect(out.stdout).toContain("Own task");
    expect(out.stdout).not.toContain("BU-peer");
    expect(out.stdout).not.toContain("\u001b");
  } finally {
    await rm(dir, { recursive: true });
  }
});

it("should refuse missing session identity before invoking bd", async () => {
  await expect(
    exec(process.execPath, [cli, "--repo", "/tmp", "--once"], {
      env: { ...process.env, PATH: "/nonexistent" },
    }),
  ).rejects.toMatchObject({
    code: 2,
    stderr: expect.stringContaining("--repo and --session are required"),
  });
});
