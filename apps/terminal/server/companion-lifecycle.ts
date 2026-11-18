/** Linux process incarnation plus tmux membership; failed reads are unknown, never exit proof. */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const exec = promisify(execFile);
interface ComposerTarget {
  pane: string;
  socket?: string;
}
interface LifecycleTarget extends ComposerTarget {
  incarnation: string;
}
async function tmux(target: ComposerTarget, ...args: string[]): Promise<string> {
  return (
    await exec("tmux", [...(target.socket ? ["-L", target.socket] : []), ...args], {
      timeout: 1000,
    })
  ).stdout.trim();
}
async function start(pid: string): Promise<string> {
  if (!/^\d+$/.test(pid)) throw new Error("Invalid process identity");
  const stat = await readFile(`/proc/${pid}/stat`, "utf8");
  const startTime = stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19];
  if (!startTime || !/^\d+$/.test(startTime)) throw new Error("Unreadable process identity");
  return startTime;
}
export async function composerIncarnation(target: ComposerTarget): Promise<string | null> {
  if (process.platform !== "linux") throw new Error("Linux process identity required");
  const inventory = await tmux(
    target,
    "list-panes",
    "-a",
    "-F",
    "#{pane_id}\t#{pane_pid}\t#{pane_dead}\t#{socket_path}\t#{pid}",
  );
  const entries = inventory.split("\n").map((line) => line.split("\t"));
  if (
    entries.some(
      (entry) =>
        entry.length !== 5 ||
        !/^%\d+$/.test(entry[0] ?? "") ||
        !/^\d+$/.test(entry[1] ?? "") ||
        !/^[01]$/.test(entry[2] ?? "") ||
        !entry[3] ||
        !/^\d+$/.test(entry[4] ?? ""),
    )
  )
    throw new Error("Unreadable pane inventory");
  const pane = entries.find((entry) => entry[0] === target.pane);
  if (!pane || pane[2] === "1") return null;
  const [, pid, , socketPath, serverPid] = pane;
  if (!pid || !serverPid || !socketPath) throw new Error("Unreadable tmux identity");
  return JSON.stringify([
    socketPath,
    serverPid,
    await start(serverPid),
    target.pane,
    pid,
    await start(pid),
  ]);
}

export async function monitorCompanion(encoded: string): Promise<() => void> {
  const target: LifecycleTarget = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (
    !target ||
    typeof target.pane !== "string" ||
    !/^%\d+$/.test(target.pane) ||
    typeof target.incarnation !== "string" ||
    (target.socket !== undefined && !/^[A-Za-z0-9_-]+$/.test(target.socket))
  )
    throw new Error("Invalid lifecycle identity");
  const ownPane = process.env.TMUX_PANE;
  if (!ownPane || !/^%\d+$/.test(ownPane)) throw new Error("Missing companion pane");
  let established = false;
  const establish = async () => {
    const own = await composerIncarnation({ ...target, pane: ownPane });
    if (!own) return false;
    const ownIdentity = JSON.parse(own) as string[];
    const expected = JSON.parse(target.incarnation) as string[];
    // Never mutate a pane supplied only by caller/environment: establish that it runs this process.
    if (
      ownIdentity[4] !== String(process.pid) ||
      ownIdentity.slice(0, 3).join("\t") !== expected.slice(0, 3).join("\t")
    )
      return false;
    await tmux(
      target,
      "if-shell",
      "-F",
      "-t",
      ownPane,
      `#{==:#{pane_pid},${process.pid}}`,
      `set-option -p -t ${ownPane} remain-on-exit off`,
      "",
    );
    return true;
  };
  try {
    established = await establish();
  } catch {
    // Unreadable startup identity is unknown too; retry without changing any pane.
  }
  let checking = false;
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      if (!established) {
        established = await establish();
        return;
      }
      const current = await composerIncarnation(target);
      if (current !== target.incarnation) process.exit(0); // Exit only this companion process.
    } catch {
      // A failed command or /proc read is unknown; keep the pane and retry next interval.
    } finally {
      checking = false;
    }
  }, 500);
  return () => clearInterval(timer);
}
