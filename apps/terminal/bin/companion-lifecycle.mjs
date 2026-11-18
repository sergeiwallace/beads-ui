// Linux companion creation is serialized by an OS lock, never a persistent tmux semaphore.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { composerIncarnation } from "../server/companion-lifecycle.ts";

const exec = promisify(execFile);
const worker = fileURLToPath(import.meta.url);
const cli = fileURLToPath(new URL("./beads-ui-terminal.mjs", import.meta.url));
const runTmux = async (values, ...args) =>
  (
    await exec("tmux", [...(values.socket ? ["-L", values.socket] : []), ...args], {
      timeout: 2000,
    })
  ).stdout.trim();

export async function launchCompanion(values) {
  if (process.platform !== "linux") throw new Error("Linux locking required");
  const repo = await realpath(values.repo);
  const identity = await runTmux(
    values,
    "display-message",
    "-p",
    "-t",
    values.pane,
    "#{socket_path}\t#{pid}\t#{pane_id}",
  );
  if (identity.split("\t")[2] !== values.pane) throw new Error("Invalid composer");
  const incarnation = await composerIncarnation(values);
  if (!incarnation) throw new Error("Composer absent");
  const binding = createHash("sha256")
    .update(JSON.stringify([identity, repo, values.session]))
    .digest("hex");
  const directory = join(tmpdir(), `beads-ui-companion-${process.getuid()}`);
  await mkdir(directory, { mode: 0o700 }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)
    throw new Error("Unsafe lock directory");
  const lock = join(directory, `${binding}.lock`);
  const handle = await open(
    lock,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const lockStat = await handle.stat();
    if (
      !lockStat.isFile() ||
      lockStat.uid !== process.getuid() ||
      lockStat.nlink !== 1 ||
      (lockStat.mode & 0o077) !== 0
    )
      throw new Error("Unsafe lock file");
  } finally {
    await handle.close();
  }
  // Never unlink lock files: doing so would allow two callers to lock different inodes.
  // Retain the lock in the supervisor and worker so supervisor death cannot unlock an active mutation.
  // Node subprocess defaults keep that fd out of tmux; timeout bounds an orphaned worker.
  const result = await exec(
    "flock",
    [
      "-w",
      "5",
      lock,
      "timeout",
      "--signal=KILL",
      "8",
      process.execPath,
      worker,
      JSON.stringify({ ...values, repo, identity, binding, incarnation }),
    ],
    { timeout: 15_000 },
  );
  if (!/^%\d+\s*$/.test(result.stdout)) throw new Error("Invalid companion response");
  return result.stdout.trim();
}

function companionArgs(values) {
  return [
    process.execPath,
    cli,
    "--repo",
    values.repo,
    "--session",
    values.session,
    "--lifecycle",
    Buffer.from(
      JSON.stringify({ pane: values.pane, socket: values.socket, incarnation: values.incarnation }),
    ).toString("base64url"),
  ];
}
async function processSnapshot(pid) {
  if (!/^\d+$/.test(pid)) throw new Error("Invalid process");
  const before = await readFile(`/proc/${pid}/stat`, "utf8");
  const argv = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0");
  if (argv.pop() !== "") throw new Error("Unreadable command");
  const after = await readFile(`/proc/${pid}/stat`, "utf8");
  const start = (value) => value.slice(value.lastIndexOf(") ") + 2).split(" ")[19];
  if (!/^\d+$/.test(start(before) ?? "") || start(before) !== start(after))
    throw new Error("Process changed");
  return { argv, start: start(after) };
}
async function recoverCompanion(values, inventory) {
  const expected = companionArgs(values);
  const candidates = [];
  for (const [id, pid, dead, binding, ownedPid, composer] of inventory) {
    if (dead !== "0" || binding || ownedPid || composer || id === values.pane) continue;
    let snapshot;
    try {
      snapshot = await processSnapshot(pid);
    } catch {
      throw new Error("Unknown live pane ownership");
    }
    const argv = snapshot.argv;
    if (argv[0] !== expected[0] || argv[1] !== expected[1]) continue;
    if (
      argv[2] !== "--repo" ||
      argv[3] !== values.repo ||
      argv[4] !== "--session" ||
      argv[5] !== values.session
    )
      continue;
    if (JSON.stringify(argv) !== JSON.stringify(expected))
      throw new Error("Mismatched companion ownership");
    const incarnation = await composerIncarnation({ ...values, pane: id });
    if (
      !incarnation ||
      JSON.stringify(JSON.parse(incarnation).slice(0, 3)) !==
        JSON.stringify(JSON.parse(values.incarnation).slice(0, 3))
    )
      throw new Error("Companion server changed");
    const confirmed = await processSnapshot(pid);
    if (
      confirmed.start !== snapshot.start ||
      JSON.stringify(confirmed.argv) !== JSON.stringify(argv)
    )
      throw new Error("Companion process changed");
    candidates.push({ id, pid, snapshot });
  }
  if (candidates.length > 1) throw new Error("Ambiguous companion ownership");
  if (!candidates.length) return null;
  const { id, pid, snapshot } = candidates[0];
  const guard = `#{&&:#{==:#{pane_pid},${pid}},#{&&:#{==:#{@beads_ui_binding},},#{&&:#{==:#{@beads_ui_pid},},#{==:#{@beads_ui_composer},}}}}`;
  await runTmux(
    values,
    "if-shell",
    "-F",
    "-t",
    id,
    guard,
    `set-option -p -t ${id} @beads_ui_pid ${pid} ; set-option -p -t ${id} @beads_ui_binding ${values.binding} ; set-option -p -t ${id} @beads_ui_composer ${Buffer.from(values.incarnation).toString("base64url")}`,
    "",
  );
  const after = await processSnapshot(pid);
  if (
    after.start !== snapshot.start ||
    JSON.stringify(after.argv) !== JSON.stringify(snapshot.argv) ||
    (await runTmux(
      values,
      "display-message",
      "-p",
      "-t",
      id,
      "#{@beads_ui_binding}\t#{pane_pid}",
    )) !== `${values.binding}\t${pid}`
  )
    throw new Error("Companion changed during publication");
  return id;
}

async function createOrReuse(values) {
  const identity = await runTmux(
    values,
    "display-message",
    "-p",
    "-t",
    values.pane,
    "#{socket_path}\t#{pid}\t#{pane_id}",
  );
  if (identity !== values.identity || (await composerIncarnation(values)) !== values.incarnation)
    throw new Error("Composer changed");
  const panes = await runTmux(
    values,
    "list-panes",
    "-a",
    "-F",
    "#{pane_id}\t#{pane_pid}\t#{pane_dead}\t#{@beads_ui_binding}\t#{@beads_ui_pid}\t#{@beads_ui_composer}",
  );
  const inventory = panes.split("\n").map((line) => line.split("\t"));
  const matches = inventory.filter((parts) => parts[3] === values.binding);
  if (matches.length) {
    const [id, pid, dead, , ownedPid, incarnation] = matches[0];
    if (
      matches.length !== 1 ||
      dead !== "0" ||
      !pid ||
      pid !== ownedPid ||
      incarnation !== Buffer.from(values.incarnation).toString("base64url")
    )
      throw new Error("Stale companion binding");
    return id;
  }
  const recovered = await recoverCompanion(values, inventory);
  if (recovered) return recovered;
  const created = await runTmux(
    values,
    "split-window",
    "-d",
    "-v",
    "-l",
    "12",
    "-t",
    values.pane,
    "-c",
    values.repo,
    "-P",
    "-F",
    "#{pane_id}\t#{pane_pid}",
    ...companionArgs(values),
  );
  const [id, pid] = created.split("\t");
  if (!/^%\d+$/.test(id ?? "") || !/^\d+$/.test(pid ?? ""))
    throw new Error("Invalid companion identity");
  await runTmux(
    values,
    "set-option",
    "-p",
    "-t",
    id,
    "@beads_ui_pid",
    pid,
    ";",
    "set-option",
    "-p",
    "-t",
    id,
    "@beads_ui_binding",
    values.binding,
    ";",
    "set-option",
    "-p",
    "-t",
    id,
    "@beads_ui_composer",
    Buffer.from(values.incarnation).toString("base64url"),
  );
  return id;
}

if (process.argv[1] === worker) {
  try {
    process.stdout.write(`${await createOrReuse(JSON.parse(process.argv[2]))}\n`);
  } catch {
    process.exitCode = 2;
  }
}
