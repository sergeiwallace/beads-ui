import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_REPOSITORY_VARS } from "./exec.ts";
import { STORE_IMAGE_VAR } from "./store.ts";

export async function setup(): Promise<() => Promise<void>> {
  const root = await mkdtemp(join(tmpdir(), "beads-ui-web-image-"));
  process.env[STORE_IMAGE_VAR] = root;
  for (const name of GIT_REPOSITORY_VARS) delete process.env[name];
  return () => rm(root, { recursive: true, force: true });
}
