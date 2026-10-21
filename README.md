# beads-ui

A task manager for [Beads](https://github.com/steveyegge/beads) issues, built to run in three places
from one shared core:

- inside the Claude Code terminal UI, as a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview);
- inside Claude Desktop and Claude on the web, as an MCP UI app;
- in a browser, as a web app you run locally or host from an infra-as-config template.

The goal is the views people expect from Jira, Linear or Todoist (board, backlog, sprints,
roadmap, analytics), working on a Beads store, with one view of the tasks of every Claude Code
session on a machine.

## Status

Phase 0 is being built: the monorepo bootstrap, the DOM-free shared core with its purity gate, and
the repository's public-repo hygiene. The design in
[docs/designs/beads-ui-design.md](docs/designs/beads-ui-design.md) is approved, and the research
behind it is in [docs/research/](docs/research/). The first user-facing target is the Claude Code
TUI mod (Phase 1).

The work is tracked in this repo's own Beads store (prefix `BU`). Later sub-epics cover iOS, macOS
and Linux.

## Repository structure

An npm-workspaces monorepo with one shared core and one package per surface.

The shared core holds five layers: data access, domain logic, view models, commands and design
tokens. It has no runtime dependency and no DOM, Node.js or timer reference, so it runs unchanged
inside a Claude Code mod, which draws to the terminal and has no DOM. The surfaces share these
layers and not their UI components: each surface draws its own views.

| Path | What it holds |
|---|---|
| `plugins/beads-ui/` | The Claude Code mod, with the shared core inside it |
| `plugins/beads-ui/core/` | The shared core (`src/`) and its tests (`test/`); the DOM packages import it as `@beads-ui/core` |
| `packages/` | Node and browser packages: the `bd` adapter, the web components and the MCP server, as later phases add them |
| `scripts/check-core-purity.mjs` | The purity gate `npm run lint` runs on the shared core |
| `.claude-plugin/marketplace.json` | The marketplace that lists the mod, `./plugins/beads-ui` |
| `scripts/check-marketplace.mjs` | The pre-commit gate that runs `claude plugin validate .` and checks the marketplace lists the mod |
| `scripts/check-plugin-size.mjs` | The pre-commit gate that fails naming any file under `plugins/beads-ui` over 1 MB |
| `scripts/check-plugin-allowlist.mjs` | The pre-commit gate that holds the hooks and `$` calls `claude plugin validate --json` reports to `plugins/beads-ui/validate-allowlist.json`, and every `$` call to the hooks module's own file |

The core sits inside the plugin because an installed plugin cannot reach files above its own
directory. The design doc records when the core moves to its own package.

## Development

```sh
npm ci
npm run lint
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the rules on the shared core and on secrets.

To load the mod from a checkout, run `claude --plugin-dir plugins/beads-ui`. To install it from
this repository's marketplace (the mod needs Claude Code 2.1.299 or later):

```text
/plugin install beads-ui --marketplace sergeiwallace/beads-ui
```

## Open source

This repository is public and MIT licensed. It holds no secrets, credentials or private data, and
nothing of that kind may be committed to it. A gitleaks pre-commit hook scans every commit and
refuses one that matches a secret pattern. Copy `.env.example` to `.env` for local settings;
`.env` is gitignored. Report a vulnerability as [SECURITY.md](SECURITY.md) describes.

## Repository setup

The scaffold comes from a [Copier](https://copier.readthedocs.io/) template that is private, so
`copier update` works only for the maintainer; `.copier-answers.yml` records the answers it was
generated with. Contributors need neither. Git hooks install with
`bash .githooks/install.sh` (needs `pre-commit`).

## License

[MIT](LICENSE)
