// A module resolve hook: `@beads-ui/core` and `@beads-ui/core/<file>` resolve to the core's
// sources inside the plugin, as the path alias in tsconfig.base.json says for the type checker.
const CORE = new URL("../../../plugins/beads-ui/core/src/", import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier === "@beads-ui/core") return next(new URL("index.ts", CORE).href, context);
  if (specifier.startsWith("@beads-ui/core/")) {
    return next(new URL(specifier.slice("@beads-ui/core/".length), CORE).href, context);
  }
  return next(specifier, context);
}
