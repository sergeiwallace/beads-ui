import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { Host } from "../hooks/host.js";
import { BeadsPane, KEYBINDINGS_BLOCK, type PaneUi, type Tab, USAGE_LINES } from "../hooks/pane.js";
import { StoreResolver } from "../hooks/store.js";

const repoRoot = resolve(import.meta.dirname, "../../..");
const doc = () => readFileSync(join(repoRoot, "docs/procedures/mod-install.md"), "utf8");

type Drawn = { type: string; props: Record<string, unknown> };

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
  return inputLabels(pane.draw(ui, { width: 118, placement: "dock" }));
}

describe("the usage section (T-1B.6)", () => {
  const section = (text: string) => {
    const start = text.indexOf("## Using the pane");
    if (start === -1) return "";
    const end = text.indexOf("\n## ", start + 1);
    return text.slice(start, end === -1 ? undefined : end);
  };
  const readme = () => readFileSync(join(repoRoot, "README.md"), "utf8");

  it("should carry the same usage section in README.md and mod-install.md", () => {
    expect(section(readme())).not.toBe("");
    expect(section(readme())).toBe(section(doc()));
  });

  it("should carry each line the pane's help draws, and its keybindings.json block", () => {
    const usage = section(readme()).replace(/\s+/g, " ");
    for (const line of USAGE_LINES) expect(usage).toContain(line.replace(/\s+/g, " "));
    expect(section(readme())).toContain(KEYBINDINGS_BLOCK);
  });
});

describe("mod-install.md", () => {
  for (const tab of ["board", "backlog"] as const) {
    it(`should name every field the ${tab} tab draws by the label it draws`, () => {
      const labels = labelsOn(tab);

      expect(labels).toEqual(["Filter", "New"]);
      for (const label of labels) expect(doc()).toContain(`\`${label}\` field`);
    });
  }
});
