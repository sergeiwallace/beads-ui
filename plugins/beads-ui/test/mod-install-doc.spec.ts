// Runners: Vitest only. It reads docs/procedures/mod-install.md, which the mod environment cannot.
// The install doc names each field by the label the pane draws on it.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Host } from "../hooks/host.ts";
import { BeadsPane, type PaneUi, type Tab } from "../hooks/pane.ts";
import { StoreResolver } from "../hooks/store.ts";

const repoRoot = resolve(import.meta.dirname, "../../..");
const doc = () => readFileSync(join(repoRoot, "docs/procedures/mod-install.md"), "utf8");

type Drawn = { type: string; props: Record<string, unknown> };

// Each element as a plain record of its props, so the tree can be walked without the engine.
const element =
  (type: string) =>
  (props: Record<string, unknown>): Drawn => ({ type, props });
const ui = {
  Box: element("Box"),
  Text: element("Text"),
  Button: element("Button"),
  Input: element("Input"),
  Select: element("Select"),
  Markdown: element("Markdown"),
  Code: element("Code"),
} as unknown as PaneUi;

function inputLabels(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(inputLabels);
  if (typeof node !== "object" || node === null) return [];
  const { type, props } = node as Drawn;
  const own = type === "Input" && typeof props.label === "string" ? [props.label] : [];
  return [...own, ...inputLabels(props.children)];
}

function labelsOn(tab: Tab): string[] {
  const pane = new BeadsPane(new StoreResolver());
  pane.host = { cwd: "/work/beads-ui" } as Host;
  pane.tab = tab;
  return inputLabels(pane.draw(ui, 118));
}

describe("mod-install.md", () => {
  for (const tab of ["board", "backlog"] as const) {
    it(`should name every field the ${tab} tab draws by the label it draws`, () => {
      const labels = labelsOn(tab);

      expect(labels).toEqual(["Filter", "New"]);
      for (const label of labels) expect(doc()).toContain(`\`${label}\` field`);
    });
  }
});
