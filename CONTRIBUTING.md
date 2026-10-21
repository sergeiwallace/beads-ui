# Contributing to beads-ui

Thanks for helping. This repository is public, so read the rule on secrets below before your first
commit.

## Before you start

The design lives in [docs/designs/beads-ui-design.md](docs/designs/beads-ui-design.md), and the work
is tracked in this repository's own Beads store (prefix `BU`). For anything larger than a small fix,
open an issue first so the change can be checked against the design.

## Setup

You need Node.js 24 or later, npm, and [pre-commit](https://pre-commit.com/).

```sh
npm ci
bash .githooks/install.sh
```

The hook install wires the pre-commit and pre-push gates, including the gitleaks secret scan.

## Checks

Run these before you push. The hooks run them too.

```sh
npm run lint        # Biome, the core purity gate and the core type check
npm test            # Vitest
npx tsc --noEmit    # type check of the whole repository
```

The shared core in `plugins/beads-ui/core` runs inside a Claude Code mod, which has no DOM, no
Node.js APIs and no timers. Code in that directory must not reference `setTimeout`, `setInterval`,
`queueMicrotask`, `requestAnimationFrame`, `window`, `document`, `process` or `console`, and may
import only relative paths inside the core. `npm run lint` fails naming the file and line when it
does. Code that needs the time takes a clock function as an argument.

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

Inside `plugins/beads-ui`, the two runners split by file name. A `*.test.ts` file is a mod test:
`claude plugin test` runs it in the mod's own environment, and it imports its kit from
`claude-code/testing`. A `*.spec.ts` file is a Vitest suite, free to use Node.js. Name a file for
the runner it needs; the other runner never collects it.

## Pull requests

Keep each commit to one logical change. Describe what changed and how you checked it. By
contributing you agree that your work is released under the [MIT license](LICENSE) and that you
follow the [code of conduct](CODE_OF_CONDUCT.md).
