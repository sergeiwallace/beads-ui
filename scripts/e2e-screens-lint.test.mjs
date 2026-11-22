import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const screens = fileURLToPath(new URL("../apps/web/e2e/harness/screens/", import.meta.url));

/** The files under `dir` that wait on networkidle anywhere. */
function waitsOnNetworkIdle(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => /networkidle/.test(readFileSync(join(dir, file), "utf8")));
}

test("should find no screen whose readiness waits on networkidle", () => {
  const files = waitsOnNetworkIdle(screens);
  assert.ok(
    readdirSync(screens).some((file) => file.endsWith(".ts")),
    `no screens under ${screens}`,
  );
  assert.deepEqual(files, [], `these screens wait on networkidle: ${files.join(", ")}`);
});

test("should name the file when a screen's readiness waits on networkidle", () => {
  const scratch = mkdtempSync(join(tmpdir(), "beads-ui-screens-lint-"));
  try {
    writeFileSync(
      join(scratch, "good.ts"),
      "export const ready = (page) => page.locator('main').waitFor();\n",
    );
    writeFileSync(
      join(scratch, "bad.ts"),
      'export const ready = (page) => page.waitForLoadState("networkidle");\n',
    );
    assert.deepEqual(waitsOnNetworkIdle(scratch), ["bad.ts"]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
