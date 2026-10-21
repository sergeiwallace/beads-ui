# Contributing to beads-ui

Thanks for helping. This repository is public, so read the rule on secrets below before your first
commit.

## Before you start

The design lives in [docs/designs/beads-ui-design.md](docs/designs/beads-ui-design.md), and the work
is tracked in this repository's own Beads store (prefix `BU`). For anything larger than a small fix,
open an issue first so the change can be checked against the design.

## Setup

You need Node.js 24 or later, npm, [pre-commit](https://pre-commit.com/), and
[gitleaks](https://github.com/gitleaks/gitleaks#installing) on your `PATH` at the version
`.pre-commit-config.yaml` pins (8.30.1): `npm test` runs it on a fabricated key in a scratch
repository to prove the secret scan refuses it, and fails naming the binary when it is missing.

```sh
npm ci
bash .githooks/install.sh
```

The hook install wires the pre-commit and pre-push gates, including the gitleaks secret scan.

## Checks

Run these before you push. The hooks run them too.

```sh
npm run lint        # Biome, the core purity gate and the core type check
npm test            # Vitest, then claude plugin test for the mod
npx tsc --noEmit    # type check of the whole repository
```

The mod's gates need Claude Code (`claude`) on your `PATH`: `npm test` runs `claude plugin test`,
and the pre-commit hooks run `claude plugin validate` on the repository root and on
`plugins/beads-ui`. When you add a hook or a `$` call to the mod, add it to
`plugins/beads-ui/validate-allowlist.json` in the same commit; the gate names each difference.

The shared core in `plugins/beads-ui/core` runs inside a Claude Code mod, which has no DOM, no
Node.js APIs and no timers. Code in that directory must not reference `setTimeout`, `setInterval`,
`queueMicrotask`, `requestAnimationFrame`, `window`, `document`, `process`, `console` or
`globalThis`, and may import only relative paths inside the core, each as one string literal. It
must not generate code or reach a global through a string either: no `eval`, no `Function`
(called or constructed), no `self`, no `.constructor` access and no `import()` of a computed
specifier. `npm run lint` fails naming the file and line when it does. Code that needs the time takes a clock function as an argument.

The plugin at `plugins/beads-ui` has no runtime dependencies. Development tools go in the root
`package.json` as dev dependencies.

## No secrets

Never commit credentials, tokens, private keys, `.env` files or private data. The gitleaks hook
refuses a commit that matches a secret pattern; do not bypass it. If you committed a secret by
mistake, rotate it first, then tell the maintainer. Removing it from history does not make it safe
again.

## Tests

Name tests `it("should <action> when <condition>")`, and test behaviour through the real entry
point rather than one function at a time.

Inside `plugins/beads-ui`, file names choose the runners. A pure core suite is
`core/test/<name>.test.ts`: it imports `describe`, `test` and `expect` from `claude-code/testing`
and runs under both `claude plugin test` and Vitest, which maps that import to `vitest`. It uses
only matchers both kits have, no `node:` import, and reads fixtures from `core/test/fixtures/<name>.json.ts`
modules (`<name>.txt.ts` for bd's plain-text output), each holding the exact text of its `.json` or
`.txt` twin (`fixture-modules.spec.ts` checks it). A
suite that needs Node.js is `*.spec.ts` and runs under Vitest alone. The mod's own tests,
`hooks/*.test.ts`, drive the engine through `$` and run under `claude plugin test` alone.

Suites under `packages/<name>/test/*.test.ts` sit outside the plugin and run under Vitest alone.
The `bd` adapter's suite, `packages/bd-node/test/bd-adapter.test.ts`, reads this repository's own
Beads store with `bd list`, `show`, `statuses` and `ready`, so `npm test` needs `bd` on your `PATH`.
It drives every write through a stub `bd` in a temporary directory and never writes to the store.

## Pull requests

Keep each commit to one logical change. Describe what changed and how you checked it. By
contributing you agree that your work is released under the [MIT license](LICENSE) and that you
follow the [code of conduct](CODE_OF_CONDUCT.md).
