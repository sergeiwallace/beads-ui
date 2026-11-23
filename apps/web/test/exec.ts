import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const GIT_REPOSITORY_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
] as const;

export function storeEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const clean = { ...env };
  for (const name of GIT_REPOSITORY_VARS) delete clean[name];
  return clean;
}

const run = promisify(execFile);

export const exec = (
  command: string,
  args: readonly string[],
  options: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv; encoding?: "utf8" } = {},
) => run(command, args, { encoding: "utf8", ...options, env: storeEnv(options.env) });
