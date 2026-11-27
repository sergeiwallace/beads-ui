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
npm run e2e:install -w apps/web
```

The hook install wires the pre-commit and pre-push gates, including the gitleaks secret scan.

The browser suites live in their own install root, `apps/web/e2e/`, outside the npm workspaces:
its `package.json` and lockfile hold Playwright and the frontend test harness library, which is a
private repository (`https://github.com/sergeiwallace/frontend-test-harness`). `npm run e2e:install`
installs that root and Chromium, through your git's credential for that repository. Without read
access to it, `npm ci`, `npm run lint` and the Vitest suites still work. `npm run test:e2e` and
the pre-push `e2e` hook fail before any browser starts, naming the library and how to get access,
and the script tests `npm test` runs fail where they read that install, so a commit
and a push are refused until you have it.

## Checks

Run these before you push. The hooks run them too.

```sh
npm run lint        # Biome, the core purity gate and the core type check
npm test            # Vitest, claude plugin test for the mod and the script tests, through turbo
npm run test:e2e    # the web app's Playwright specs, in full
npx tsc --noEmit    # type check of the whole repository
```

The pre-commit hook runs `npm run test:commit` with `BEADS_UI_TEST_SCOPE=commit`: every package's
Vitest suite and the script tests, where `apps/web` runs only its suites that start no server and
make no store. Its server suites, the mod's `claude plugin test` loop and the Playwright specs take
much longer, so they run at pre-push, in full, and not at commit: the `test-gate` hook runs every
Vitest suite, the `mod-and-script-tests` hook the mod's loop and the script tests
(`npm run test:push`), and the `e2e` hook every Playwright spec. Run `npm test` (no scope: every
suite and the mod's loop) and `npm run test:e2e` yourself when you want their answer before you
push.

`BEADS_UI_TEST_JOBS` (default 1, at most 2) bounds how many test processes `npm test`,
`npm run test:e2e` and the test hooks start; a commit that stages only `docs/**` or `*.md` paths
skips the commit's test hooks. The setting and how its bounds multiply:
[web-run.md, Test it](docs/procedures/web-run.md#test-it).

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

A change to a shipped file under `plugins/beads-ui` must raise the plugin's version above
`main`'s: a `feat` commit by a minor, anything else by a patch. The pre-push hook does it for you
in a commit of its own and asks you to push again; a major bump needs the maintainer's approval.
See [docs/procedures/releasing.md](docs/procedures/releasing.md).

The plugin at `plugins/beads-ui` has no runtime dependencies. Development tools go in the root
`package.json` as dev dependencies.

## Styling the web app

The web app is built on Tailwind CSS v4 and shadcn/ui components on Base UI (D-10 in the design).
`apps/web/components.json` is shadcn's configuration: run `npx shadcn@4.23.0 add <component>` in
`apps/web` to copy a component into `apps/web/client/components/ui`, then delete the comments it
brings, which the comment ratchet refuses. `apps/web/client/shell.css` loads Tailwind's theme and
utilities without its Preflight reset, so the older hand CSS (`packages/web-ui/src/web-ui.css`,
`apps/web/client/app.css`) renders as it did, and it sets shadcn's colour variables to the D-19
tokens in `packages/web-ui/src/theme.css`. Change a colour in `theme.css`, never in `shell.css`;
`apps/web/test/shell-theme.test.ts` fails when a shadcn variable names no token.

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

The web app's suites build their own store. `apps/web/test/*.test.ts` (Vitest) call the server's
routes over HTTP against a temporary store: the run makes one store with `bd init` and copies it
for each suite that asks, and makes the store with `bd init` instead when that image no longer
holds what it held when it was made (`apps/web/test/store.ts`); `apps/web/e2e/*.spec.ts`
(Playwright) run the documented command, one server per Playwright worker whose store is reset
before each test, and drive a browser at 1280 px with
a mouse and at 390 px on a touch screen, with the frontend test harness capturing and probing each
screen a spec reaches (`apps/web/e2e/frontend-harness.config.ts`, adapter and screens under
`apps/web/e2e/harness/`). `npm run e2e:install -w apps/web` installs `apps/web/e2e/` and puts
Chromium in its `node_modules`, where the specs look for it. Component suites are
`packages/web-ui/test/*.test.tsx`, under Vitest with jsdom.

## Pull requests

Keep each commit to one logical change. Describe what changed and how you checked it. By
contributing you agree that your work is released under the [MIT license](LICENSE) and that you
follow the [code of conduct](CODE_OF_CONDUCT.md).
