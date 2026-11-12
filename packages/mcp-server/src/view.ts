// The `ui://beads-ui/board` resource as one HTML document: the view's page, the MCP Apps
// extension's own bundled App module, and the view's script, inlined, since a host renders the
// resource with no way to fetch more. The bundle is the published `app-with-deps` build; its
// export list is bound to `globalThis.McpApps` for the view script, which runs after it.

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const VIEW = new URL("../view/", import.meta.url);
const BUNDLE_MARK = "/* ext-apps */";
const VIEW_MARK = "/* view */";
const EXPORT_LIST = /export\s*\{([^}]*)\};?\s*$/;

/** The bundle's module text with its trailing export list bound to `globalThis.McpApps`. */
export function bindExports(bundle: string): string {
  const match = EXPORT_LIST.exec(bundle);
  if (match === null || match[1] === undefined) {
    throw new Error("the ext-apps app-with-deps bundle ends with no export list to bind");
  }
  const pairs = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const [local, as, exported] = entry.split(/\s+/);
      return `${JSON.stringify(as === "as" ? exported : local)}: ${local}`;
    });
  return `${bundle.slice(0, match.index)}\nglobalThis.McpApps = { ${pairs.join(", ")} };\n`;
}

/** Script text safe inside a `<script>` element: no `</script` closes it early. */
const inline = (script: string): string => script.replaceAll("</script", "<\\/script");

export async function boardHtml(): Promise<string> {
  const require = createRequire(import.meta.url);
  const bundle = await readFile(
    require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"),
    "utf8",
  );
  const [page, view] = await Promise.all([
    readFile(new URL("board.html", VIEW), "utf8"),
    readFile(new URL("board.js", VIEW), "utf8"),
  ]);
  if (!page.includes(BUNDLE_MARK) || !page.includes(VIEW_MARK)) {
    throw new Error("view/board.html lost its script marks");
  }
  return page
    .replace(BUNDLE_MARK, () => inline(bindExports(bundle)))
    .replace(VIEW_MARK, () => inline(view));
}
