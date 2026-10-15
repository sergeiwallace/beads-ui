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

Research and design stage. Nothing is built yet. The research and design docs land in
[docs/research/](docs/research/) and [docs/designs/](docs/designs/) and wait on the owner's review
before any build starts. The first build target is the Claude Code TUI mod.

The work is tracked in this repo's own Beads store (prefix `BU`). Later sub-epics cover iOS, macOS
and Linux.

## Planned layout

A monorepo with one core package for data access, state, layout and theme, and one package per
surface (TUI mod, MCP UI app, web app). A mod draws to the terminal and has no DOM, so the surfaces
share logic and design tokens rather than UI components. The design doc settles the final package
boundaries.

## Open source

This repository is public and MIT licensed. It holds no secrets, credentials or private data, and
nothing of that kind may be committed to it. Copy `.env.example` to `.env` for local settings;
`.env` is gitignored.

## Repository setup

The scaffold comes from a [Copier](https://copier.readthedocs.io/) template; `.copier-answers.yml`
records the answers, and `copier update` pulls later template changes. Git hooks install with
`bash .githooks/install.sh` (needs `pre-commit`).

## License

[MIT](LICENSE)
