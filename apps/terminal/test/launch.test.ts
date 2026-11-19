import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);
const launcher = fileURLToPath(new URL("../bin/launch.mjs", import.meta.url));

it("should keep the composer active and guard user updates when a companion runs on an isolated server", async () => {
  const socket = `beads-test-${randomUUID()}`;
  const dir = await mkdtemp(join(tmpdir(), "beads-companion-"));
  const env = { ...process.env, PATH: `${dir}:/usr/bin:/bin`, BEADS_TEST_STATE: dir };
  const tmux = (...args: string[]) =>
    exec("tmux", ["-L", socket, ...args], { timeout: 10_000, env });
  async function until(check: () => Promise<boolean>) {
    const deadline = Date.now() + 30_000;
    while (!(await check())) {
      if (Date.now() >= deadline) throw new Error("companion did not reach the expected state");
      await new Promise((done) => setTimeout(done, 50));
    }
  }
  try {
    await writeFile(
      join(dir, "issues.json"),
      JSON.stringify([
        {
          id: "BU-own",
          title: "Interactive task",
          status: "in_progress",
          priority: 1,
          issue_type: "task",
          assignee: "aih-fw-cole",
          created_at: "2026-11-15T00:00:00Z",
          updated_at: "2026-11-15T00:00:00Z",
        },
      ]),
    );
    await writeFile(
      join(dir, "statuses.json"),
      JSON.stringify({
        built_in_statuses: [
          { name: "in_progress", category: "wip" },
          { name: "blocked", category: "frozen" },
        ],
        custom_statuses: [],
      }),
    );
    await writeFile(
      join(dir, "bd"),
      [
        "#!/bin/sh",
        'case "$1" in',
        'list|show) cat "$BEADS_TEST_STATE/issues.json";;',
        'statuses) cat "$BEADS_TEST_STATE/statuses.json";;',
        'update) [ "$BEADS_ACTOR" = "aih-fw-cole" ] || exit 9',
        'printf "%s\\n" "$*" >> "$BEADS_TEST_STATE/writes.log"',
        "printf '{}';;",
        "*) exit 9;;",
        "esac",
        "",
      ].join("\n"),
    );
    await chmod(join(dir, "bd"), 0o755);
    await tmux(
      "-f",
      "/dev/null",
      "new-session",
      "-d",
      "-s",
      "test",
      "-x",
      "100",
      "-y",
      "40",
      "sleep",
      "60",
    );
    const before = (await tmux("display-message", "-p", "-t", "test", "#{pane_id}")).stdout.trim();
    const launched = await exec(
      process.execPath,
      [launcher, "--socket", socket, "--pane", before, "--repo", dir, "--session", "aih-fw-cole"],
      { timeout: 10_000, env },
    );
    const companion = launched.stdout.trim();
    expect(companion).toMatch(/^%\d+$/);
    expect(companion).not.toBe(before);
    await until(async () =>
      (await tmux("capture-pane", "-p", "-t", companion)).stdout.includes("Interactive task"),
    );
    expect((await tmux("display-message", "-p", "-t", "test", "#{pane_id}")).stdout.trim()).toBe(
      before,
    );
    // Input goes only to this test's isolated server, never a user's composer.
    await tmux("send-keys", "-t", companion, "-l", "move BU-own blocked");
    await tmux("send-keys", "-t", companion, "Enter");
    await until(async () => {
      try {
        return (await readFile(join(dir, "writes.log"), "utf8")).includes("--if-status");
      } catch {
        return false;
      }
    });
    const writes = (await readFile(join(dir, "writes.log"), "utf8")).trim().split("\n");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("update BU-own --status blocked");
    expect(writes[0]).toContain("--if-status in_progress");
    expect(writes[0]).toContain("--if-assignee=aih-fw-cole");
    expect((await tmux("display-message", "-p", "-t", "test", "#{pane_id}")).stdout.trim()).toBe(
      before,
    );
  } finally {
    await tmux("kill-server").catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}, 70_000);
