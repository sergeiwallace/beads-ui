import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);
const launcher = fileURLToPath(new URL("../bin/launch.mjs", import.meta.url));

async function fixture(
  run: (context: {
    composer: string;
    launch: (pane: string, session: string) => Promise<string>;
    tmux: (...args: string[]) => Promise<string>;
  }) => Promise<void>,
) {
  const socket = `beads-lifecycle-${randomUUID()}`;
  const dir = await mkdtemp(join(tmpdir(), "beads-lifecycle-"));
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH ?? "/usr/bin:/bin"}` };
  const tmux = async (...args: string[]) =>
    (await exec("tmux", ["-L", socket, ...args], { env, timeout: 10_000 })).stdout.trim();
  try {
    await writeFile(
      join(dir, "bd"),
      '#!/bin/sh\ncase "$1" in\nlist) printf "[]";;\nstatuses) printf \'{"built_in_statuses":[],"custom_statuses":[]}\';;\n*) exit 9;;\nesac\n',
    );
    await chmod(join(dir, "bd"), 0o755);
    const composer = await tmux(
      "-f",
      "/dev/null",
      "new-session",
      "-d",
      "-s",
      "test",
      "-x",
      "120",
      "-y",
      "120",
      "-P",
      "-F",
      "#{pane_id}",
      "sleep",
      "60",
    );
    const launch = async (pane: string, session: string) => {
      const result = await exec(
        process.execPath,
        [launcher, "--socket", socket, "--pane", pane, "--repo", dir, "--session", session],
        { env, timeout: 10_000 },
      );
      const id = result.stdout.trim();
      expect(id).toMatch(/^%\d+$/);
      const deadline = Date.now() + 5_000;
      while (!(await tmux("capture-pane", "-p", "-t", id)).includes(`Beads: ${session}`)) {
        if (Date.now() >= deadline) throw new Error("companion did not render its session");
        await new Promise((done) => setTimeout(done, 25));
      }
      return id;
    };
    await run({ composer, launch, tmux });
  } finally {
    await tmux("kill-server").catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}

for (const concurrent of [false, true]) {
  it(`should reuse one companion and preserve focus when the same binding launches ${concurrent ? "concurrently" : "repeatedly"}`, async () => {
    await fixture(async ({ composer, launch, tmux }) => {
      const ids = concurrent
        ? await Promise.all([launch(composer, "session-one"), launch(composer, "session-one")])
        : [await launch(composer, "session-one"), await launch(composer, "session-one")];
      const panes = (await tmux("list-panes", "-t", "test", "-F", "#{pane_id}")).split("\n");
      expect.soft(ids[1]).toBe(ids[0]);
      expect.soft(panes).toHaveLength(2);
      expect.soft(panes).toContain(composer);
      expect(await tmux("display-message", "-p", "-t", "test", "#{pane_id}")).toBe(composer);
    });
  }, 20_000);
}

it("should keep distinct session and composer bindings separate without stealing focus", async () => {
  await fixture(async ({ composer, launch, tmux }) => {
    const other = await tmux(
      "split-window",
      "-d",
      "-h",
      "-t",
      composer,
      "-P",
      "-F",
      "#{pane_id}",
      "sleep",
      "60",
    );
    const ids = [
      await launch(composer, "session-one"),
      await launch(composer, "session-two"),
      await launch(other, "session-one"),
    ];
    expect(new Set(ids).size).toBe(3);
    expect((await tmux("list-panes", "-t", "test", "-F", "#{pane_id}")).split("\n")).toHaveLength(
      5,
    );
    expect(await tmux("display-message", "-p", "-t", "test", "#{pane_id}")).toBe(composer);
  });
}, 20_000);
