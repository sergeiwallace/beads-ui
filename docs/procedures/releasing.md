# Releasing a plugin version

An installed copy of the beads-ui mod updates only when the `version` in
`plugins/beads-ui/.claude-plugin/plugin.json` rises. `claude plugin update` and marketplace
auto-update both compare it, and a commit that leaves it alone installs nothing anywhere. So every
change to shipped plugin files carries a version above `main`'s, and the repository enforces it
rather than relying on anyone to remember.

## The rule

A branch whose diff against `main` touches a shipped plugin file must raise that plugin's version
above `main`'s current one, by at least the level its commits call for:

| The branch's commits that change a shipped file (and, for a squash merge, the PR title) | Bump |
|---|---|
| any `feat` commit | minor (`0.1.1` -> `0.2.0`) |
| only other types (`fix`, `perf`, `refactor`, `chore`, untyped, ...) | patch (`0.1.1` -> `0.1.2`) |
| a `type!:` subject or a `BREAKING CHANGE:` footer | major: refused until Sergei approves |

A major bump is never automatic. Sergei decides when the mod moves to a new major version; record his
say-so with the trailer `Semver-major-approved-by: Sergei` in a commit on the branch, then set the
version by hand. A major bump without that trailer is refused, whether the commits asked for it or not.

Which files are shipped, and the trailer, are set in [plugin-release.json](../../plugin-release.json):
everything under `plugins/beads-ui/` except tests, test fixtures and the Vitest config. A branch that
changes only tests, docs or repository tooling needs no bump.

## What enforces it

- **The pre-push hook** (`plugin-version` in [.pre-commit-config.yaml](../../.pre-commit-config.yaml))
  runs `node scripts/plugin-version.mjs pre-push`. It fetches `origin/main` and checks the branch
  being pushed. When the version falls short it writes the right one into `plugin.json`, commits it as
  `chore(release): beads-ui <version>`, and fails the push once: run the same `git push` again. It
  never makes a major bump.
- **`ghp pr merge`** in ai-harness reads the same `plugin-release.json` from the PR's base branch and
  refuses a merge whose head version does not beat the base's at merge time. This catches the case the
  hook cannot: two PRs that each raised `0.1.1` to `0.1.2`, where the second must go to `0.1.3`.

## By hand

```sh
node scripts/plugin-version.mjs check                          # what is required, and whether the branch has it
node scripts/plugin-version.mjs check --title "feat(mod): ..." # as a squash merge with that title
node scripts/plugin-version.mjs bump                           # write the required version into plugin.json
```

Both compare against `origin/main`; pass `--base <ref>` for another. Exit status 0 means ok, 1 refused,
2 could not run. After a refused merge: merge `origin/main` into the branch, run `bump`, commit, push.
