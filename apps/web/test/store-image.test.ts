import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
    const shared = process.env[STORE_IMAGE_VAR];
    const root = await mkdtemp(join(tmpdir(), "beads-ui-web-image-test-"));
    process.env[STORE_IMAGE_VAR] = root;
    try {
      const image = join(root, "image", "store");
      const copied = await store("image");
      expect(await projectId(copied.dir)).toBe(await projectId(image));
      await writeFile(join(image, "left-in-the-image.txt"), "left\n");
      const fresh = await store("image");
      expect(await projectId(fresh.dir)).not.toBe(await projectId(image));
      await expect(access(join(fresh.dir, "left-in-the-image.txt"))).rejects.toThrow();
      expect(await issueIds(fresh)).toEqual([]);
    } finally {
      if (shared === undefined) delete process.env[STORE_IMAGE_VAR];
      else process.env[STORE_IMAGE_VAR] = shared;
      await rm(root, { recursive: true, force: true });
    }
  });
});
