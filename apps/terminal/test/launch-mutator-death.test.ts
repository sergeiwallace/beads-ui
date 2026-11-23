import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const exec = promisify(execFile);
const launcher = fileURLToPath(new URL("../bin/launch.mjs", import.meta.url));
const workerPath = fileURLToPath(new URL("../bin/companion-lifecycle.mjs", import.meta.url));

async function children(pid: number): Promise<number[]> {
  try {
    const value = await readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
    return value.trim().split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return [];
  }
}
async function command(pid: number): Promise<string> {
  try {
    return (await readFile(`/proc/${pid}/cmdline`, "utf8")).replaceAll("\0", " ");
  } catch {
    return "";
  }
}
async function descendants(pid: number): Promise<number[]> {
  const direct = await children(pid);
  return [...direct, ...(await Promise.all(direct.map(descendants))).flat()];
}
async function waitFor(check: () => Promise<boolean>, milliseconds = 30_000) {
  const end = Date.now() + milliseconds;
  while (!(await check())) {
    if (Date.now() >= end) throw new Error("controlled companion boundary was not reached");
    await new Promise((done) => setTimeout(done, 10));
  }
}

it("should recover the live owned companion after its mutation worker dies before metadata publication", async () => {
  const socket = `beads-mutator-${randomUUID()}`;
  const dir = await mkdtemp(join(tmpdir(), "beads-mutator-"));
  const realTmux = (await exec("which", ["tmux"])).stdout.trim();
  const env = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    BEADS_HOLDER_DIR: dir,
    BEADS_REAL_TMUX: realTmux,
  };
  const tmux = async (...args: string[]) =>
    (await exec(realTmux, ["-L", socket, ...args], { timeout: 2000 })).stdout.trim();
  let first: ReturnType<typeof spawn> | undefined;
  let mutationWorker: number | undefined;
  try {
    await writeFile(
      join(dir, "tmux"),
      `#!/usr/bin/python3
import subprocess,os,pathlib,time,sys
root=pathlib.Path(os.environ['BEADS_HOLDER_DIR'])
result=subprocess.run([os.environ['BEADS_REAL_TMUX'],*sys.argv[1:]],capture_output=True)
if 'split-window' in sys.argv and result.returncode==0:
    try:
        (root/'first-split').mkdir()
        (root/'ready').write_bytes(result.stdout)
        end=time.monotonic()+5
        while not (root/'release').exists() and time.monotonic()<end:time.sleep(.01)
    except FileExistsError:(root/'second-split').write_bytes(result.stdout)
sys.stdout.buffer.write(result.stdout);sys.stderr.buffer.write(result.stderr);sys.exit(result.returncode)
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
    const args = [
      launcher,
      "--socket",
      socket,
      "--pane",
      composer,
      "--repo",
      dir,
      "--session",
      "holder-test",
    ];
    first = spawn(process.execPath, args, { env, stdio: "ignore" });
    const firstExited = new Promise((done) => first?.once("exit", done));
    await waitFor(async () =>
      readFile(join(dir, "ready")).then(
        () => true,
        () => false,
      ),
    );
    const firstPane = (await readFile(join(dir, "ready"), "utf8")).split("\t")[0]?.trim();
    const supervisor = (await children(first.pid ?? 0))[0];
    expect(supervisor).toBeDefined();
    const supervisorCommand = await command(supervisor ?? 0);
    expect(supervisorCommand).toMatch(/^(?:flock|timeout) /);
    expect(supervisorCommand).toContain(socket);
    const family = await descendants(first.pid ?? 0);
    const commands = await Promise.all(family.map(command));
    mutationWorker =
      family[
        commands.findIndex(
          (value) => value.startsWith(process.execPath) && value.includes(workerPath),
        )
      ];
    expect(mutationWorker).toBeDefined();
    process.kill(mutationWorker ?? 0, "SIGKILL");
    await waitFor(async () => (await command(mutationWorker ?? 0)) === "");
    await writeFile(join(dir, "release"), "");
    await firstExited;
    const identity = await tmux(
      "display-message",
      "-p",
      "-t",
      composer,
      "#{socket_path}\t#{pid}\t#{pane_id}",
    );
    const binding = createHash("sha256")
      .update(JSON.stringify([identity, dir, "holder-test"]))
      .digest("hex");
    const lock = join(tmpdir(), `beads-ui-companion-${process.getuid?.()}`, `${binding}.lock`);
    await waitFor(async () =>
      exec("flock", ["-n", lock, "true"], { timeout: 2000 }).then(
        () => true,
        () => false,
      ),
    );
    expect(await tmux("display-message", "-p", "-t", firstPane ?? "", "#{pane_dead}")).toBe("0");
    expect(await tmux("display-message", "-p", "-t", firstPane ?? "", "#{@beads_ui_binding}")).toBe(
      "",
    );
    const result = await exec(process.execPath, args, { env, timeout: 10_000 });
    const ownership = await tmux(
      "list-panes",
      "-t",
      "test",
      "-F",
      "#{pane_id}\t#{@beads_ui_binding}",
    );
    const bindings = new Map(
      ownership.split("\n").map((line) => {
        const [id, binding] = line.split("\t");
        return [id, binding];
      }),
    );
    expect.soft(bindings.get(result.stdout.toString().trim())).toBe(bindings.get(firstPane));
    expect.soft(result.stdout.toString().trim()).toBe(firstPane);
    expect.soft(ownership.split("\n")).toHaveLength(2);
    expect(await tmux("display-message", "-p", "-t", "test", "#{pane_id}")).toBe(composer);
  } finally {
    await writeFile(join(dir, "release"), "").catch(() => undefined);
    if (first?.exitCode === null && first.signalCode === null) first.kill("SIGKILL");
    await tmux("kill-server").catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}, 120_000);
