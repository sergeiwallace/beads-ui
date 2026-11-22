import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStore, STORE_IMAGE_VAR, type TestStore } from "./store.ts";

const made: TestStore[] = [];
afterEach(async () => {
  for (const store of made.splice(0)) await store.remove();
});

async function store(prefix: string): Promise<TestStore> {
  const created = await createStore(prefix);
  made.push(created);
  return created;
}

const imageStore = () => join(process.env[STORE_IMAGE_VAR] ?? "", "image", "store");

const projectId = async (dir: string) =>
  (
    JSON.parse(await readFile(join(dir, ".beads", "metadata.json"), "utf8")) as {
      project_id: string;
    }
  ).project_id;

const issueIds = async (on: TestStore) =>
  (
    (JSON.parse((await on.bd("list", "--all", "--limit", "0", "--json")) || "[]") ?? []) as {
      id: string;
    }[]
  ).map(({ id }) => id);

describe("the stores a Vitest run makes", () => {
  it("should copy the run's image into each store, so a store holds none of the issues another store made", async () => {
    const first = await store("image");
    const left = await first.create("Left in the first store");
    const second = await store("image");
    expect(process.env[STORE_IMAGE_VAR]).toBeTruthy();
    expect(await projectId(second.dir)).toBe(await projectId(imageStore()));
    expect(await issueIds(second)).toEqual([]);
    expect(await issueIds(first)).toEqual([left]);
  });

  it("should give the copy the prefix the store asked for", async () => {
    const renamed = await store("asked");
    expect(await projectId(renamed.dir)).toBe(await projectId(imageStore()));
    expect(await renamed.create("Named by its prefix")).toMatch(/^asked-/);
  });

  it("should make the store with bd init, not copy the image, when the image changed after it was made", async () => {
    await store("image");
    const stray = join(imageStore(), "left-in-the-image.txt");
    await writeFile(stray, "left\n");
    try {
      const fresh = await store("image");
      expect(await projectId(fresh.dir)).not.toBe(await projectId(imageStore()));
      await expect(access(join(fresh.dir, "left-in-the-image.txt"))).rejects.toThrow();
      expect(await issueIds(fresh)).toEqual([]);
    } finally {
      await rm(stray, { force: true });
    }
  });
});
