import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** Quotes `text` for a POSIX sh script. */
export const shQuote = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

export interface ScriptedBd {
  /** PATH with the scripted bd first. */
  env: NodeJS.ProcessEnv;
  remove(): Promise<void>;
}

/**
 * A `bd` that runs `script` (POSIX sh, with "$REAL" the real bd and "$DIR" the directory bd runs
 * in, symlinks resolved) before handing the call to the real bd; `script` may exit instead.
 */
export async function scriptedBd(script: string): Promise<ScriptedBd> {
  const real = (await exec("sh", ["-c", "command -v bd"], { encoding: "utf8" })).stdout.trim();
  const dir = await mkdtemp(join(tmpdir(), "beads-ui-web-scripted-bd-"));
  const lines = [
    "#!/bin/sh",
    `REAL=${shQuote(real)}`,
    'DIR="$(pwd -P)"',
    script,
    'exec "$REAL" "$@"',
  ];
  await writeFile(join(dir, "bd"), `${lines.join("\n")}\n`);
  await chmod(join(dir, "bd"), 0o755);
  return {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
    remove: () => rm(dir, { recursive: true }),
  };
}
