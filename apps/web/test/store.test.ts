import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, failingBd, STORE_IMAGE_VAR } from "./store.ts";

describe("createStore", () => {
  let temp: string;
  const saved = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR };
  const savedImage = process.env[STORE_IMAGE_VAR];

  const restore = () => {
    process.env.PATH = saved.PATH;
    process.env.TMPDIR = saved.TMPDIR;
    if (savedImage === undefined) delete process.env[STORE_IMAGE_VAR];
    else process.env[STORE_IMAGE_VAR] = savedImage;
  };

  beforeEach(async () => {
    temp = await mkdtemp(join(tmpdir(), "beads-ui-store-test-"));
  });

  afterEach(async () => {
    restore();
    await rm(temp, { recursive: true, force: true });
  });

  it("leaves no store directory behind when bd init fails", async () => {
    const failing = await failingBd(["init"]);
    try {
      process.env.PATH = failing.env.PATH;
      process.env.TMPDIR = temp;
      delete process.env[STORE_IMAGE_VAR];

      await expect(createStore()).rejects.toThrow(/database is locked/);

      expect(
        (await readdir(temp)).filter((name) => name.startsWith("beads-ui-web-store-")),
      ).toEqual([]);
    } finally {
      restore();
      await failing.remove();
    }
  });
});
