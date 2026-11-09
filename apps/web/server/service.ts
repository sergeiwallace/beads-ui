import { execFile } from "node:child_process";
import { access, constants, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type ConfigEnv, DEFAULT_PORT, readWebConfig } from "./config.ts";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The unit `install-service` writes; one per user, so a second install rewrites it. */
export const UNIT_NAME = "beads-ui-web.service";
export const UNIT_TEMPLATE = join(APP_DIR, "service", "beads-ui-web.service.in");
const BIN = join(APP_DIR, "bin", "beads-ui-web.mjs");

export const SERVICE_USAGE = `       beads-ui-web install-service [--port <n>]

  install-service       write the systemd user unit that runs this server from the current
                        directory, supervised and started again after a reboot, then reload systemd`;

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

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(command, args, { env, timeout: 30_000, encoding: "utf8" }, (error, _out, stderr) =>
      resolve(error === null ? undefined : (stderr.trim() || error.message).split("\n")[0]),
    );
  });
}

/**
 * Writes the unit for the server run from `cwd` and reloads the user's systemd. Running it again
 * rewrites the same file, so there is only ever one unit; it prints what it wrote and the one
 * command that starts it.
 */
export async function installServiceMain(
  argv: readonly string[],
  configEnv: ConfigEnv,
  cwd: string,
  processEnv: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  let values: { port?: string | undefined };
  try {
    ({ values } = parseArgs({ args: [...argv], options: { port: { type: "string" } } }));
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\nusage: ${SERVICE_USAGE.trimStart()}\n`);
    return 2;
  }
  try {
    const config = await readWebConfig(cwd, configEnv);
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
    const before = await readFile(target, "utf8").catch(() => undefined);
    const temporary = `${target}.tmp-${process.pid}`;
    await writeFile(temporary, unit, { mode: 0o644 });
    await rename(temporary, target);
    process.stdout.write(
      `${before === undefined ? "wrote" : before === unit ? "kept" : "rewrote"} ${target}:\n\n${unit}\n`,
    );
    const reload = await run("systemctl", ["--user", "daemon-reload"], processEnv);
    if (reload !== undefined) {
      process.stderr.write(
        `beads-ui web: the unit is written, but systemctl --user daemon-reload failed: ${reload}\n`,
      );
      return 1;
    }
    process.stdout.write(`start it with: systemctl --user enable --now ${UNIT_NAME}\n`);
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
    return 0;
  } catch (error) {
    if (error instanceof InstallRefused) {
      process.stderr.write(`beads-ui web: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
