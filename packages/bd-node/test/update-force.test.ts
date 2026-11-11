import { afterEach, describe, expect, it } from "vitest";
import { createBdClient } from "../src/index.ts";
import { type StubBd, stubBd } from "./stub.ts";

// bd's force path for an abandoned claim (web app design T-W2.2): `--force` beside the status
// guard, and refused before bd runs beside the assignee guard, which bd itself refuses.

const stubs: StubBd[] = [];
afterEach(async () => {
  for (const stub of stubs.splice(0)) await stub.remove();
});

describe("a forced update through a stub bd", () => {
  it("should pass --force after the status guard when the update releases an abandoned claim", async () => {
    const stub = await stubBd({});
    stubs.push(stub);
    const client = createBdClient({ cwd: stub.dir, env: stub.env });
    const result = await client.update(
      "BU-abc",
      { assignee: "", status: "open" },
      { ifStatus: "in_progress", force: true },
    );
    expect(result).toEqual({ kind: "ok", value: undefined });
    expect(await stub.calls()).toEqual([
      "update BU-abc --status open --assignee= --if-status in_progress --force --json",
    ]);
  });

  it("should refuse before running bd when --force is asked for beside the assignee guard", async () => {
    const stub = await stubBd({});
    stubs.push(stub);
    const client = createBdClient({ cwd: stub.dir, env: stub.env });
    expect(() =>
      client.update("BU-abc", { assignee: "" }, { ifAssignee: "holder", force: true }),
    ).toThrow(RangeError);
    expect(await stub.calls()).toEqual([]);
  });
});
