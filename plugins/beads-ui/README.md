# beads-ui for Claude Code

A [Beads](https://github.com/steveyegge/beads) task board inside the Claude Code terminal. `/bu`
opens a pane over the Beads store your session works in, and a band above the prompt counts the
session's own tasks by status.

This plugin is not [mantoni/beads-ui](https://github.com/mantoni/beads-ui), the separate web UI for
Beads that runs with `npx beads-ui start`. This one is a Claude Code plugin: it draws in the
terminal next to your session, and its task counts follow the session that owns the work.

## Install

```sh
claude plugin marketplace add sergeiwallace/beads-ui
claude plugin install beads-ui@beads-ui
```

Or load it for one session from a clone, changing no settings:

```sh
claude --plugin-dir /path/to/beads-ui/plugins/beads-ui
```

You need Claude Code 2.1.299 or later, `bd` 1.3.x on your `PATH`, and a repository with a Beads
store (`bd list` works there). Start the session in that repository.

## Use

- `/bu` (or `/show-beads-ui`) opens the pane, and runs again to close it.
- The pane opens on the session's own tasks. Its nav leads to the Board, Backlog, Detail, Timeline
  and Settings views.
- The band above the prompt reads `[bd] N tasks (P in progress, B blocked, O open, D done last 24h)`.
  Every count is a button that lists those tasks under the line.
- Everything you can press is drawn between brackets, `[like this]`. A click presses it, and every
  control also has a key.

The full guide, with keys, configuration and the host refresher, is
[docs/procedures/mod-install.md](../../docs/procedures/mod-install.md). Three walk-throughs of real
tasks, from unblocking a task to planning a sprint, are in
[docs/worked-uses.md](../../docs/worked-uses.md).

## Validation

`claude plugin validate plugins/beads-ui`, run from the repository root on Claude Code 2.1.322,
passes. The manifest and hooks validate; the one plugin directory warning is the missing listing
icon. An excerpt of its output:

```text
Validating plugin manifest: plugins/beads-ui/.claude-plugin/plugin.json

Validating hooks: plugins/beads-ui/hooks/hooks.json

Plugin directory checks for plugins/beads-ui.

⚠ Found 1 plugin directory warning:

  ❯ .claude-plugin/plugin.json icon: No icon (ICON_MISSING).

✔ Validation passed
```

The hooks check also lists every hook, Claude Code API call and environment variable the hooks
module uses. The plugin directory runs its own safety scan and policy review on top of these checks.

## License

[MIT](../../LICENSE)
