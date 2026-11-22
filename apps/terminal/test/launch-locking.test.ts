import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);
const launcher = fileURLToPath(new URL("../bin/launch.mjs", import.meta.url));

it("should fail without splitting when flock is unavailable", async () => {
  const socket = `beads-lock-${randomUUID()}`;
  const dir = await mkdtemp(join(tmpdir(), "beads-lock-"));
  const tmux = async (...args: string[]) =>
    (await exec("tmux", ["-L", socket, ...args], { timeout: 2000 })).stdout.trim();
  try {
    await symlink((await exec("which", ["tmux"])).stdout.trim(), join(dir, "tmux"));
    const pane = await tmux(
      "-f",
      "/dev/null",
      "new-session",
      "-d",
      "-P",
      "-F",
      "#{pane_id}",
      "sleep",
      "30",
    );
    await expect(
      exec(
        process.execPath,
        [launcher, "--socket", socket, "--pane", pane, "--repo", dir, "--session", "lock-test"],
        { env: { ...process.env, PATH: dir }, timeout: 5000 },
      ),
    ).rejects.toMatchObject({ code: 2 });
    expect(await tmux("list-panes", "-F", "#{pane_id}")).toBe(pane);
  } finally {
    await tmux("kill-server").catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

it("should time out without splitting and recover after an OS lock holder is killed", async () => {
  const socket = `beads-lock-${randomUUID()}`;
  const dir = await mkdtemp(join(tmpdir(), "beads-lock-"));
  const tmux = async (...args: string[]) =>
    (await exec("tmux", ["-L", socket, ...args], { timeout: 2000 })).stdout.trim();
  let holder: ReturnType<typeof spawn> | undefined;
  try {
    await writeFile(
      join(dir, "bd"),
      '#!/bin/sh\ncase "$1" in\nlist) printf "[]";;\nstatuses) printf \'{"built_in_statuses":[],"custom_statuses":[]}\';;\n*) exit 9;;\nesac\n',
    );
    await chmod(join(dir, "bd"), 0o755);
    const pane = await tmux(
      "-f",
      "/dev/null",
      "new-session",
      "-d",
      "-x",
      "100",
      "-y",
      "40",
      "-P",
      "-F",
      "#{pane_id}",
      "sleep",
      "30",
    );
    const identity = await tmux(
      "display-message",
      "-p",
      "-t",
      pane,
      "#{socket_path}\t#{pid}\t#{pane_id}",
    );
    const binding = createHash("sha256")
      .update(JSON.stringify([identity, dir, "lock-test"]))
      .digest("hex");
    const lockDir = join(tmpdir(), `beads-ui-companion-${process.getuid?.()}`);
    await mkdir(lockDir, { mode: 0o700, recursive: true });
    const lock = join(lockDir, `${binding}.lock`);
    await writeFile(lock, "", { mode: 0o600 });
    holder = spawn("flock", ["-F", lock, "sleep", "20"], { stdio: "ignore" });
    const deadline = Date.now() + 2000;
    while (true) {
      try {
        await exec("flock", ["-n", lock, "true"]);
      } catch {
        break;
      }
      if (Date.now() >= deadline) throw new Error("holder failed to acquire lock");
      await new Promise((done) => setTimeout(done, 20));
    }
    const args = [
      launcher,
      "--socket",
      socket,
      "--pane",
      pane,
      "--repo",
      dir,
      "--session",
      "lock-test",
    ];
    const started = Date.now();
    await expect(exec(process.execPath, args, { timeout: 12_000 })).rejects.toMatchObject({
      code: 2,
    });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(await tmux("list-panes", "-F", "#{pane_id}")).toBe(pane);
    const exited = new Promise((done) => holder?.once("exit", done));
    holder.kill("SIGKILL");
    await exited;
    const result = await exec(process.execPath, args, {
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      timeout: 12_000,
    });
    expect(result.stdout.trim()).toMatch(/^%\d+$/);
    expect(await tmux("display-message", "-p", "#{pane_id}")).toBe(pane);
    const companion = result.stdout.trim();
    await tmux("respawn-pane", "-k", "-t", companion, "sleep", "20");
    const unrelatedPid = await tmux("display-message", "-p", "-t", companion, "#{pane_pid}");
    await expect(exec(process.execPath, args, { timeout: 12_000 })).rejects.toMatchObject({
      code: 2,
    });
    expect(await tmux("display-message", "-p", "-t", companion, "#{pane_pid}")).toBe(unrelatedPid);
    expect((await tmux("list-panes", "-F", "#{pane_id}")).split("\n")).toHaveLength(2);
  } finally {
    holder?.kill("SIGKILL");
    await tmux("kill-server").catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}, 20_000);
