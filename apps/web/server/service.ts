import { execFile } from "node:child_process";
import { access, constants, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type ConfigEnv, DEFAULT_PORT, LOOPBACK, readWebConfig } from "./config.ts";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The unit `install-service` writes; one per user, so a second install rewrites it. */
export const UNIT_NAME = "beads-ui-web.service";
export const UNIT_TEMPLATE = join(APP_DIR, "service", "beads-ui-web.service.in");
const BIN = join(APP_DIR, "bin", "beads-ui-web.mjs");

export const SERVICE_USAGE = `       beads-ui-web install-service [--port <n>] [--enable]

  install-service       write the systemd user unit that runs this server from the current
                        directory, supervised and started again after a reboot, then reload systemd;
                        with --enable, also enable and start (or restart) it and wait until its
                        /healthz answers 200`;

/** The credential-free health route: `/api/health` takes a browser session, so a probe cannot. */
const HEALTH_PATH = "/healthz";
const JOURNAL = `journalctl --user -u ${UNIT_NAME}`;

/** The environment the server reads its settings by; each set one is written into the unit. */
const CARRIED = ["XDG_CONFIG_HOME", "XDG_STATE_HOME"] as const;

/** A value as systemd reads it: `%` doubled, and quoted when it holds a space, quote or backslash. */
function unitWord(value: string): string {
  const escaped = value.replaceAll("%", "%%");
  return /[\s"'\\]/.test(escaped) ? `"${escaped.replace(/["\\]/g, (ch) => `\\${ch}`)}"` : escaped;
}

export interface UnitInputs {
  workingDirectory: string;
  node: string;
  bin: string;
  port: number;
  /** The PATH the server runs bd with. */
  path: string;
  environment: Readonly<Record<string, string>>;
}

/** The unit template with every `@NAME@` filled in. */
export function renderUnit(template: string, inputs: UnitInputs): string {
  const environment = Object.entries(inputs.environment)
    .map(([name, value]) => `Environment=${unitWord(`${name}=${value}`)}`)
    .join("\n");
  const values: Record<string, string> = {
    WORKING_DIRECTORY: unitWord(inputs.workingDirectory),
    PATH: unitWord(inputs.path),
    ENVIRONMENT: environment,
    NODE: unitWord(inputs.node),
    BIN: unitWord(inputs.bin),
    PORT: String(inputs.port),
  };
  // With nothing to carry, the @ENVIRONMENT@ line goes, rather than leaving a blank one.
  const lines = environment === "" ? template.replace(/^@ENVIRONMENT@\n/m, "") : template;
  const text = lines.replace(/@([A-Z_]+)@/g, (whole, name: string) => values[name] ?? whole);
  const left = /@[A-Z_]+@/.exec(text);
  if (left !== null) throw new Error(`the unit template has no value for ${left[0]}`);
  return text;
}

/** Where systemd reads the user's own units. */
export function unitPath(env: ConfigEnv): string | undefined {
  const base =
    env.xdgConfigHome !== undefined && env.xdgConfigHome !== ""
      ? env.xdgConfigHome
      : env.home === undefined || env.home === ""
        ? undefined
        : join(env.home, ".config");
  return base === undefined ? undefined : join(base, "systemd", "user", UNIT_NAME);
}

/** The first `name` on `path` that is an executable file. */
async function onPath(name: string, path: string): Promise<string | undefined> {
  for (const dir of path.split(delimiter)) {
    if (dir === "") continue;
    try {
      await access(join(dir, name), constants.X_OK);
      return join(dir, name);
    } catch {
      // Not in this directory.
    }
  }
  return undefined;
}

class InstallRefused extends Error {}

/** Runs `command`; `error` is the first line of what it said when it failed. */
function runFor(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ error?: string; stdout: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { env, timeout: 30_000, encoding: "utf8" }, (error, stdout, stderr) =>
      resolve(
        error === null
          ? { stdout }
          : { error: (stderr.trim() || error.message).split("\n")[0] ?? "", stdout },
      ),
    );
  });
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return (await runFor(command, args, env)).error;
}

interface UnitState {
  /** A transient unit of this name, started by hand (`systemd-run`), shadows the unit file. */
  transient: boolean;
  active: boolean;
}

/** What systemd holds under UNIT_NAME now, read with `systemctl --user show`. */
async function unitState(env: NodeJS.ProcessEnv): Promise<UnitState | { error: string }> {
  const shown = await runFor(
    "systemctl",
    ["--user", "show", "-p", "Transient", "-p", "ActiveState", UNIT_NAME],
    env,
  );
  if (shown.error !== undefined) return { error: shown.error };
  const fields = new Map<string, string>();
  for (const line of shown.stdout.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) fields.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return {
    transient: fields.get("Transient") === "yes",
    active: fields.get("ActiveState") === "active",
  };
}

function transientLines(rerun: string): string {
  return (
    `a transient unit named ${UNIT_NAME} is live (started by hand, not from a unit file), and it shadows the installed unit\n` +
    `stop it with: systemctl --user stop ${UNIT_NAME}\n` +
    `then run again: ${rerun}\n`
  );
}

/** Polls `url` until it answers 200 or `timeoutSeconds` pass; the last failure otherwise. */
async function probe(
  url: string,
  timeoutSeconds: number,
  intervalSeconds: number,
): Promise<{ ok: true; body: string } | { ok: false; last: string }> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let last = "no probe ran";
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) return { ok: false, last };
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(left) });
      const body = (await response.text()).trim();
      if (response.status === 200) return { ok: true, body };
      last = `HTTP ${response.status} ${body.slice(0, 200)}`.trim();
    } catch (error) {
      const cause = (error as { cause?: { code?: string; message?: string } }).cause;
      last = cause?.code ?? cause?.message ?? (error as Error).message;
    }
    const wait = Math.min(intervalSeconds * 1000, deadline - Date.now());
    if (wait <= 0) return { ok: false, last };
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/**
 * Writes the unit for the server run from `cwd` and reloads the user's systemd. Running it again
 * rewrites the same file, so there is only ever one unit; it prints what it wrote and the one
 * command that starts it. With `--enable` it runs that command itself (restarting a service
 * already running, so the new unit and code take effect) and waits for `/healthz` to answer 200.
 */
export async function installServiceMain(
  argv: readonly string[],
  configEnv: ConfigEnv,
  cwd: string,
  processEnv: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let values: { port?: string | undefined; enable?: boolean | undefined };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { port: { type: "string" }, enable: { type: "boolean" } },
    }));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\nusage: ${SERVICE_USAGE.trimStart()}\n`);
    return 2;
  }
  try {
    const config = await readWebConfig(cwd, configEnv);
    for (const problem of config.problems) process.stderr.write(`beads-ui web: ${problem}\n`);
    const port = values.port === undefined ? (config.port ?? DEFAULT_PORT) : Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new InstallRefused(`--port takes a whole number from 1 to 65535, not ${values.port}`);
    }
    const target = unitPath(configEnv);
    if (target === undefined) {
      throw new InstallRefused(
        "neither XDG_CONFIG_HOME nor HOME is set, so there is no unit directory",
      );
    }
    const searched = processEnv.PATH ?? "";
    const bd = await onPath("bd", searched);
    if (bd === undefined) {
      throw new InstallRefused("bd is not on PATH; the server runs bd, so install it first");
    }
    const rerun = `cd ${cwd} && ${process.execPath} ${BIN} install-service ${argv.join(" ")}`;
    let before: UnitState | undefined;
    if (values.enable === true) {
      const state = await unitState(processEnv);
      if ("error" in state) {
        throw new InstallRefused(`systemctl --user show ${UNIT_NAME} failed: ${state.error}`);
      }
      if (state.transient) {
        throw new InstallRefused(`${transientLines(rerun)}nothing was written or enabled`);
      }
      before = state;
    }
    const dirs = [dirname(bd), dirname(process.execPath), "/usr/local/bin", "/usr/bin", "/bin"];
    const environment: Record<string, string> = {};
    for (const name of CARRIED) {
      const value = processEnv[name];
      if (value !== undefined && value !== "") environment[name] = value;
    }
    const unit = renderUnit(await readFile(UNIT_TEMPLATE, "utf8"), {
      workingDirectory: cwd,
      node: process.execPath,
      bin: BIN,
      port,
      path: [...new Set(dirs)].join(delimiter),
      environment,
    });
    await mkdir(dirname(target), { recursive: true });
    const previous = await readFile(target, "utf8").catch(() => undefined);
    const temporary = `${target}.tmp-${process.pid}`;
    await writeFile(temporary, unit, { mode: 0o644 });
    await rename(temporary, target);
    process.stdout.write(
      `${previous === undefined ? "wrote" : previous === unit ? "kept" : "rewrote"} ${target}:\n\n${unit}\n`,
    );
    const reload = await run("systemctl", ["--user", "daemon-reload"], processEnv);
    if (reload !== undefined) {
      process.stderr.write(
        `beads-ui web: the unit is written, but systemctl --user daemon-reload failed: ${reload}\n`,
      );
      return 1;
    }
    const user = userInfo().username;
    const lingering = await access(join("/var/lib/systemd/linger", user)).then(
      () => true,
      () => false,
    );
    if (!lingering) {
      process.stderr.write(
        `beads-ui web: user services start at boot only with lingering on: loginctl enable-linger ${user}\n`,
      );
    }
    if (before === undefined) {
      process.stdout.write(`start it with: systemctl --user enable --now ${UNIT_NAME}\n`);
      const state = await unitState(processEnv);
      if (!("error" in state) && state.transient) {
        process.stderr.write(`beads-ui web: warning: ${transientLines(rerun)}`);
      }
      return 0;
    }
    const enabled = await run("systemctl", ["--user", "enable", "--now", UNIT_NAME], processEnv);
    if (enabled !== undefined) {
      process.stderr.write(
        `beads-ui web: systemctl --user enable --now ${UNIT_NAME} failed: ${enabled}\nread its log with: ${JOURNAL}\n`,
      );
      return 1;
    }
    // enable --now leaves a service that was already running on its old code; restart it.
    if (before.active) {
      const restarted = await run("systemctl", ["--user", "restart", UNIT_NAME], processEnv);
      if (restarted !== undefined) {
        process.stderr.write(
          `beads-ui web: systemctl --user restart ${UNIT_NAME} failed: ${restarted}\nread its log with: ${JOURNAL}\n`,
        );
        return 1;
      }
    }
    const url = `http://${LOOPBACK}:${port}${HEALTH_PATH}`;
    const timeout = config.serviceProbeTimeoutSeconds;
    const health = await probe(url, timeout, config.serviceProbeIntervalSeconds);
    if (!health.ok) {
      process.stderr.write(
        `beads-ui web: ${UNIT_NAME} is enabled, but ${url} did not answer 200 within ${timeout} s; last probe: ${health.last}\n` +
          `read its log with: ${JOURNAL}\nafter a fix: systemctl --user restart ${UNIT_NAME}\n`,
      );
      return 1;
    }
    process.stdout.write(
      `${before.active ? "restarted" : "enabled and started"} ${UNIT_NAME} from ${target}\n${url} answered 200 ${health.body}\n`,
    );
    return 0;
  } catch (error) {
    if (error instanceof InstallRefused) {
      process.stderr.write(`beads-ui web: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
