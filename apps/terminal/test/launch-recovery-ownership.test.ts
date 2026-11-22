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
async function until(check: () => Promise<boolean>, failure: string) {
  const deadline = Date.now() + 30_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(failure);
    await new Promise((done) => setTimeout(done, 20));
  }
}
async function fixture(
  run: (context: {
    dir: string;
    composer: string;
    sibling: string;
    tmux: (...args: string[]) => Promise<string>;
    launch: () => Promise<string>;
    panes: () => Promise<string[]>;
  }) => Promise<void>,
) {
  const socket = `beads-recovery-${randomUUID()}`;
  const dir = await mkdtemp(join(tmpdir(), "beads-recovery-"));
  const realTmux = (await exec("which", ["tmux"])).stdout.trim();
  const env = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    BEADS_CLEANUP_DIR: dir,
    BEADS_REAL_TMUX: realTmux,
  };
  const tmux = async (...args: string[]) =>
    (await exec(realTmux, ["-L", socket, ...args], { env, timeout: 2000 })).stdout.trim();
  try {
    await writeFile(
      join(dir, "tmux"),
      `#!/usr/bin/python3
import subprocess,os,pathlib,sys
root=pathlib.Path(os.environ['BEADS_CLEANUP_DIR'])
if (root/'unreadable').exists() and any(command in sys.argv for command in ['display-message','list-panes','has-session']):
    with (root/'probe-attempt').open('a') as stream:stream.write('probe refused\\n')
    sys.exit(1)
result=subprocess.run([os.environ['BEADS_REAL_TMUX'],*sys.argv[1:]])
sys.exit(result.returncode)
`,
    );
    await chmod(join(dir, "tmux"), 0o755);
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
      "80",
      "-P",
      "-F",
      "#{pane_id}",
      "sleep",
      "20",
    );
    const sibling = await tmux(
      "new-session",
      "-d",
      "-s",
      "sibling",
      "-P",
      "-F",
      "#{pane_id}",
      "sleep",
      "20",
    );
    const launch = async () => {
      const result = await exec(
        process.execPath,
        [
          launcher,
          "--socket",
          socket,
          "--pane",
          composer,
          "--repo",
          dir,
          "--session",
          "cleanup-test",
        ],
        { env, timeout: 10_000 },
      );
      const pane = result.stdout.trim();
      await until(
        async () => (await tmux("capture-pane", "-p", "-t", pane)).includes("Beads: cleanup-test"),
        "companion never rendered",
      );
      return pane;
    };
    const panes = async () => (await tmux("list-panes", "-a", "-F", "#{pane_id}")).split("\n");
    await run({ dir, composer, sibling, tmux, launch, panes });
  } finally {
    await tmux("kill-server").catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}

it("should refuse ambiguous live unmarked companions without changing either", async () => {
  await fixture(async ({ launch, tmux, panes }) => {
    const first = await launch();
    const pid = await tmux("display-message", "-p", "-t", first, "#{pane_pid}");
    const argv = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0").filter(Boolean);
    const second = await tmux("split-window", "-d", "-t", first, "-P", "-F", "#{pane_id}", ...argv);
    await until(
      async () => (await tmux("capture-pane", "-p", "-t", second)).includes("Beads: cleanup-test"),
      "second companion never rendered",
    );
    for (const key of ["@beads_ui_binding", "@beads_ui_pid", "@beads_ui_composer"])
      await tmux("set-option", "-p", "-u", "-t", first, key);
    const before = await panes();
    await expect(launch()).rejects.toThrow();
    expect(await panes()).toEqual(before);
    for (const pane of [first, second]) {
      expect(await tmux("display-message", "-p", "-t", pane, "#{pane_dead}")).toBe("0");
      expect(await tmux("display-message", "-p", "-t", pane, "#{@beads_ui_binding}")).toBe("");
    }
  });
}, 120_000);

it("should preserve an unrelated process whose argv merely contains companion arguments", async () => {
  await fixture(async ({ dir, composer, launch, tmux, panes }) => {
    const cli = fileURLToPath(new URL("../bin/beads-ui-terminal.mjs", import.meta.url));
    const lookalike = await tmux(
      "split-window",
      "-d",
      "-t",
      composer,
      "-P",
      "-F",
      "#{pane_id}",
      process.execPath,
      "-e",
      "setInterval(() => {},1000)",
      "--",
      cli,
      "--repo",
      dir,
      "--session",
      "cleanup-test",
    );
    const beforePid = await tmux("display-message", "-p", "-t", lookalike, "#{pane_pid}");
    const companion = await launch();
    expect(companion).not.toBe(lookalike);
    expect(await panes()).toContain(lookalike);
    expect(await tmux("display-message", "-p", "-t", lookalike, "#{pane_pid}")).toBe(beforePid);
    expect(await tmux("display-message", "-p", "-t", lookalike, "#{@beads_ui_binding}")).toBe("");
  });
}, 120_000);
