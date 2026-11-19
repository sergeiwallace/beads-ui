// A module resolve hook: `@beads-ui/core` and `@beads-ui/core/<file>` resolve to the core's
// sources inside the plugin, as the path alias in tsconfig.base.json says for the type checker.
// The core's own relative imports name a `.js` file, the form Claude Code's mod docs use and
// `claude plugin validate` type-checks; Node's type stripping does not map that to the `.ts`
// source, so this hook does.
const CORE = new URL("../../../plugins/beads-ui/core/src/", import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier === "@beads-ui/core") return next(new URL("index.ts", CORE).href, context);
  if (specifier.startsWith("@beads-ui/core/")) {
    return next(new URL(specifier.slice("@beads-ui/core/".length), CORE).href, context);
  }
  if (
    context.parentURL?.startsWith(CORE.href) &&
    /^\.\.?\//.test(specifier) &&
    specifier.endsWith(".js")
  ) {
    return next(new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL).href, context);
  }
  return next(specifier, context);
}
