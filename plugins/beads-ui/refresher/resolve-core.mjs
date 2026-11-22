const CORE = new URL("../core/src/", import.meta.url);

export async function resolve(specifier, context, next) {
  if (
    context.parentURL?.startsWith(CORE.href) &&
    /^\.\.?\//.test(specifier) &&
    specifier.endsWith(".js")
  ) {
    return next(new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL).href, context);
  }
  return next(specifier, context);
}
