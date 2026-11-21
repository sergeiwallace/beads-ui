import { appendFile, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

/** The file, under a frontend test harness run's directory, that lists the stores the run made. */
export const CREATED_STORES = "created-stores.txt";

/**
 * Under a frontend test harness run (FTH_RUN_DIR set), records a store directory this run's store
 * factory made, so the adapter's synthetic proof can tell it from any store the run did not make.
 * Outside a run it does nothing.
 */
export async function recordCreatedStore(dir: string): Promise<void> {
  const run = process.env.FTH_RUN_DIR;
  if (run === undefined || run === "") return;
  await mkdir(run, { recursive: true });
  await appendFile(join(run, CREATED_STORES), `${await realpath(dir)}\n`);
}
