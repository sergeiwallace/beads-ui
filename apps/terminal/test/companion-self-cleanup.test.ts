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
  const deadline = Date.now() + 3000;
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
  const socket = `beads-cleanup-${randomUUID()}`;
  const dir = await mkdtemp(join(tmpdir(), "beads-cleanup-"));
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

it("should exit only its own companion when the original composer disappears", async () => {
  await fixture(async ({ composer, sibling, launch, tmux, panes }) => {
    const companion = await launch();
    const siblingPid = await tmux("display-message", "-p", "-t", sibling, "#{pane_pid}");
    await tmux("kill-pane", "-t", composer);
    try {
      await until(
        async () => !(await panes()).includes(companion),
        "owned companion survived composer removal",
      );
    } finally {
      expect(await tmux("display-message", "-p", "-t", sibling, "#{pane_pid}")).toBe(siblingPid);
    }
  });
}, 12_000);

it("should exit the old companion without touching a replacement at the same composer pane id", async () => {
  await fixture(async ({ composer, sibling, launch, tmux, panes }) => {
    const companion = await launch();
    const oldPid = await tmux("display-message", "-p", "-t", composer, "#{pane_pid}");
    expect((await readFile(`/proc/${oldPid}/stat`, "utf8")).length).toBeGreaterThan(0);
    await tmux("respawn-pane", "-k", "-t", composer, "sleep", "20");
    const replacementPid = await tmux("display-message", "-p", "-t", composer, "#{pane_pid}");
    expect(replacementPid).not.toBe(oldPid);
    try {
      await until(
        async () => !(await panes()).includes(companion),
        "owned companion survived composer replacement",
      );
    } finally {
      expect(await tmux("display-message", "-p", "-t", composer, "#{pane_pid}")).toBe(
        replacementPid,
      );
      expect(await panes()).toContain(sibling);
    }
  });
}, 12_000);

it("should override remain-on-exit only on its own pane and remove that pane on normal quit", async () => {
  await fixture(async ({ composer, sibling, launch, tmux, panes }) => {
    await tmux("set-option", "-w", "-t", composer, "remain-on-exit", "on");
    const companion = await launch();
    expect
      .soft(await tmux("show-options", "-p", "-A", "-v", "-t", companion, "remain-on-exit"))
      .toBe("off");
    expect(await tmux("show-options", "-p", "-A", "-v", "-t", composer, "remain-on-exit")).toBe(
      "on",
    );
    await tmux("send-keys", "-t", companion, "-l", "quit");
    await tmux("send-keys", "-t", companion, "Enter");
    try {
      await until(
        async () => !(await panes()).includes(companion),
        "exited companion pane retained by inherited remain-on-exit",
      );
    } finally {
      expect(await panes()).toContain(sibling);
      expect(await tmux("show-options", "-p", "-A", "-v", "-t", composer, "remain-on-exit")).toBe(
        "on",
      );
    }
  });
}, 12_000);

it("should treat a refused composer identity probe as unknown and leave all panes alive", async () => {
  await fixture(async ({ dir, composer, sibling, launch, tmux, panes }) => {
    const companion = await launch();
    const composerPid = await tmux("display-message", "-p", "-t", composer, "#{pane_pid}");
    await writeFile(join(dir, "unreadable"), "");
    try {
      await until(
        async () =>
          readFile(join(dir, "probe-attempt")).then(
            () => true,
            () => false,
          ),
        "companion never attempted a composer identity probe",
      );
    } finally {
      expect(await panes()).toEqual(expect.arrayContaining([composer, sibling, companion]));
      expect(await tmux("display-message", "-p", "-t", composer, "#{pane_pid}")).toBe(composerPid);
    }
  });
}, 12_000);
