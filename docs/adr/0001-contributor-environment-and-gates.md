# 0001. Contributor environment and gates

## Status

Accepted.

## Context

Local setup, test runners and release checks depend on tools that the
repository does not install into every shell. An installed Claude Code
plugin also updates only when its manifest version increases.

## Decision

- `.envrc` uses the shared direnv loader for the canonical Doppler project
  and config. It suppresses the variable-name listing. A loader missing
  from the machine's direnvrc must produce a warning. See the
  [loader decision](template/0007-envrc-secrets-loader-guard.md).
- `.gitignore` excludes generated Claude Code types and the plugin-root
  tsconfig. The core's own tsconfig is a tracked input.
- `.pre-commit-config.yaml` builds gitleaks for its hook. Contributors also
  install the pinned version on PATH because the hygiene suite invokes it
  itself. Run `npm ci` for the Node gates and have `claude` on PATH for
  the mod gates. The hygiene fixture constructs a fabricated key at runtime
  because gitleaks ignores low-entropy and example keys.
- `scripts/test-hook.mjs` skips the pre-commit test suite for staged
  docs-only changes. Pre-push still checks documentation-linked tests.
  The mod's `claude plugin test` loop runs inside that suite, through the
  mod's own `test` script; no other hook runs it, because a second hook
  ran the whole loop again after `npm test`.
- The pre-commit `npm-test` hook runs `npm test`: Vitest and the script
  tests, with no Playwright. The web app's Playwright specs run in full at
  pre-push, in the `e2e` hook (`npm run test:e2e`), because they took over
  an hour on a loaded host and made every commit wait for them. Each
  Playwright worker serves one store and resets it between tests; a test
  that leaves other server state behind gets the next test a fresh server.
  `scripts/test-hook.mjs` runs the hook's suite with
  `BEADS_UI_TEST_SCOPE=commit`, and under it `apps/web` leaves out every
  Vitest suite that imports the server or a store factory: those took
  most of a 17-minute hook on a loaded host. The pre-push `test-gate`
  hook clears the variable and runs every Vitest suite, so a push still
  runs them.
  Empty staged input runs the suite. For deletes and renames the filter
  includes the old path. The old docs-index gate was retired because the
  generated index had no consumers and could not be regenerated correctly
  from a linked worktree.
- Set `BEADS_UI_TEST_JOBS` to 1 or 2 to bound Turbo, Vitest, Playwright and
  `scripts/plugin-test.mjs`. The default is 1. Turbo and worker limits
  multiply. `node scripts/test-jobs.mjs <command> [args...]` substitutes
  the bound for `{jobs}` and returns the command's status. The mod test
  wrapper runs `claude plugin test --file <file> <dir>` in bounded groups
  because the unsplit command starts one child per file without a limit.
  The wrapper requires a report line and a successful exit from each child.
- `scripts/check-plugin-size.mjs <plugin-dir>` checks indexed blobs,
  including every conflict stage, against 1,000,000 bytes. That catches
  oversized staged content even when the working copy is smaller, and
  stays below an engine limit interpreted as 1 MiB.
- `scripts/plugin-version.mjs` compares shipped files against the base.
  Only commits touching a plugin's shipped files select its version bump.
  Features require a minor bump, other changes a patch, and major changes
  the approval trailer. The pre-push hook bumps a short version and
  stops once so a subsequent push carries it. The release gate reads the
  same policy. The script exposes `check`, `bump` and `pre-push`
  command modes. See [releasing](../procedures/releasing.md).
- `.github/FUNDING.yml` follows GitHub's schema, which accepts up to four
  GitHub Sponsors usernames and up to four custom URLs. Other sponsor
  providers shown in GitHub's example take a single identifier. Tidelift
  uses a platform/package identifier and Community Bridge a project name.

## Consequences

Tests that create scratch Git repositories must scrub Git's hook-scoped
index and directory variables and, for push tests, pre-commit's push
variables. The [web run guide](../procedures/web-run.md#test-it) records
test setup and the worker override.
