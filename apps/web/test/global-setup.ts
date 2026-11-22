import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STORE_IMAGE_VAR } from "./store.ts";

export async function setup(): Promise<() => Promise<void>> {
  const root = await mkdtemp(join(tmpdir(), "beads-ui-web-image-"));
  process.env[STORE_IMAGE_VAR] = root;
  return () => rm(root, { recursive: true, force: true });
}
