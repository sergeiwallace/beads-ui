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
