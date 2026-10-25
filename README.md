# beads-ui

A task manager for [Beads](https://github.com/steveyegge/beads) issues, designed to run in three places
from one shared core. Only the first exists today:

- inside the Claude Code terminal UI, as a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview)
  (implemented);
- [TODO, not started] inside Claude Desktop and Claude on the web, as an MCP UI app;
- [TODO, not started] in a browser, as a web app you run locally or host from an infra-as-config template.

The goal is the views people expect from Jira, Linear or Todoist (board, backlog, sprints,
roadmap, analytics), working on a Beads store, with one view of the tasks of every Claude Code
session on a machine.

## Status

Only the Claude Code mod (the TUI plugin) is implemented. Phase 0 (the monorepo bootstrap, the
DOM-free shared core and the public-repo hygiene) and Phase 1 (the MVP, a read-mostly board in the
mod) have landed. The mod's pane now opens on a task panel: the session's own tasks, a nav to the
board, backlog and settings, an options menu for every action and a Settings view
([docs/procedures/mod-install.md](docs/procedures/mod-install.md#the-task-panel)). Each view is
registered once and drawn on the band and the pane alike; `[surfaces]` in `beads-ui.toml`, or a
view's row in Settings, limits a view to `band` or `pane`
([docs/procedures/mod-install.md](docs/procedures/mod-install.md#configuration)). Everything you can
press is drawn between accent-coloured brackets, and the band's pane button is the icon `[◨]`. The
band has three levels: the summary line, every count in it a button; a pressed count's tasks under
its line, `[band] rows` at a time with `[+M more]`, `[collapse]` and `[summary]`; and the overview
(`[◫]`), the band's views under a nav from the same registry as the pane's. Its keys are letters
(`p`, `b`, `o`, `d`, `t`, `e`, `v`, `m`, `c`, `s`), and `[band] level` sets the level it opens at
([docs/procedures/mod-install.md](docs/procedures/mod-install.md#the-bands-settings)). The
colours follow your Claude Code theme, and `[theme]` sets any of them to a hex value;
`[indicators] ascii = true` draws every glyph as ASCII
([docs/procedures/mod-install.md](docs/procedures/mod-install.md#the-look)). Every task row, in
the band, the Tasks view, the Backlog and on Board cards, starts with a gutter of row indicators:
`⟳` while an agent is working on the issue (dimmed when that agent's session is no longer live on
the host), `⊘` when it is blocked and `✎` when it has an open review item. The help and Settings list them, and `[indicators]` or
Settings switches each one off
([docs/procedures/mod-install.md](docs/procedures/mod-install.md#row-indicators)). With
`[review] command` set in your own `beads-ui.toml` to a held store's tool (on the fleet,
ai-harness's `held_cli.py`), an issue's Detail opens with a Review section above its description:
the held decisions, blockers and other items about the issue that you must review or act on, and
its bd blockers. An item opens in a reader with its whole body, where you can answer it; the
answer is recorded by the held store's own `answer` verb and handed to the session. The Review
view (key `7` in the pane, `[Rev]` in the band's overview) lists every held item in the
session's scope: the items it holds and those about issues it owns, or, for the firstmate, every
item of its machine pair, with `a` switching to its own. Its filter takes `kind:`, `status:`,
`selection:`, `session:`, `machine:`, `task:`, `epic:`, `label:`, `priority:` and free text,
opening on `status:open selection:current`; `o` sorts by updated, created, priority, task, epic,
kind or session, and `s` groups by task, epic, kind or session. A row whose issue has an open,
current item shows `✎`, and its options menu opens the first
([docs/procedures/mod-install.md](docs/procedures/mod-install.md#review-items)).

The MCP UI app for Claude Desktop and claude.ai, and the web app, are [TODO]: neither has been
started. They are the planned future state in
[docs/designs/beads-ui-design.md](docs/designs/beads-ui-design.md), and the research behind the
design is in [docs/research/](docs/research/).

The work is tracked in this repo's own Beads store (prefix `BU`). Later sub-epics cover iOS, macOS
and Linux.

## Using the pane

How focus reaches the pane and leaves it, and how to close and reopen it. The pane's help (`h`) shows the same.

- Focus enters the pane: Ctrl+X then Tab (again for the next pane, then back to the prompt), a click on it (fullscreen rendering), or the band's pane button, [◨] right after the band's text (click it, or Ctrl+X then Tab to the band and Enter).
- Focus leaves: Esc returns it to the prompt and closes the pane.
- Close: Esc, Ctrl+X then X, the band's [⊠] button (drawn beside [◨] while the pane is open), or /bu (also /show-beads-ui).
- Reopen: /bu, the band's [◨] button, or a key chord bound to command:bu in ~/.claude/keybindings.json, such as this one for Meta+B:

```json
{
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "meta+b": "command:bu"
      }
    }
  ]
}
```

If `~/.claude/keybindings.json` already exists, add the `Chat` entry to its `bindings` list rather than replacing the file. The chord opens the pane when it is closed and closes it when it is open; it cannot move the focus into a pane that is already open, which Ctrl+X then Tab and the `[◨]` button do. Claude Code has no way to hide a pane and keep it open, so hiding it is closing it, and `/bu` brings it back on the same view. It opens on the Tasks view the first time, and on whichever view you left it on after that.

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
| `packages/bd-node/` | The Node adapter that runs `bd ... --json` for the web and MCP servers and returns the core's types; it needs `bd` on `PATH` |
| `scripts/check-core-purity.mjs` | The purity gate `npm run lint` runs on the shared core |
| `.claude-plugin/marketplace.json` | The marketplace that lists the mod, `./plugins/beads-ui` |
| `scripts/check-marketplace.mjs` | The pre-commit gate that runs `claude plugin validate .` and checks the marketplace lists the mod |
| `scripts/check-plugin-size.mjs` | The pre-commit gate that fails naming any file git tracks or stages under `plugins/beads-ui` over 1 MB, with no directory exempt |
| `scripts/check-plugin-allowlist.mjs` | The pre-commit gate that holds the hooks and `$` calls `claude plugin validate --json` reports to `plugins/beads-ui/validate-allowlist.json`, and every `$` call to the hooks module's own file: outside it no `$.` call and no claude-code engine type, inside it no bare `$` handed to a call |

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

```sh
claude plugin marketplace add sergeiwallace/beads-ui
claude plugin install beads-ui@beads-ui
```

Then run `/show-beads-ui` (or `/bu`) in a repository with a Beads store.
[docs/procedures/mod-install.md](docs/procedures/mod-install.md) covers the keys, quick-add,
configuration and how to report a bug.

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
