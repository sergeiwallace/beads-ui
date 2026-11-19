// A module resolve hook for the host refresher. The core's relative imports name a `.js` file,
// the form Claude Code's mod docs use and `claude plugin validate` type-checks; Node's type
// stripping does not map that to the `.ts` source, so this hook does.
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
