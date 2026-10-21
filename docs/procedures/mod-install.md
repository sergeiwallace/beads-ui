# Installing and using the beads-ui mod

Load the mod for one session from a checkout with `claude --plugin-dir <checkout>/plugins/beads-ui`, or install it from this repository's marketplace with `claude plugin install beads-ui@beads-ui` after adding the marketplace. Then run `/beads` (or `/bu`) in a repository that has a Beads store.

## Requirements

- Claude Code 2.1.299 or later. The design sets that floor because 2.1.299 is the first release that lets a hooks module's helpers live in other files. The mod's gate ran on 2.1.306. Check yours with `claude --version`.
- `bd` 1.3.x on your `PATH`. The mod runs `bd ... --json` in the session's directory and nothing else.
- A repository with a Beads store (`bd list` works there). In a directory without one, the mod draws no band and the pane shows bd's error line.
- For the pane at full size, a terminal at least 110 columns wide. A pane you open with `/beads` opens at any width.

## Load it from a checkout

From a clone of this repository:

```sh
claude --plugin-dir /path/to/beads-ui/plugins/beads-ui
```

The flag loads the plugin for that session only and changes no settings. Start the session in the repository whose Beads store you want to see, since the mod reads the store of the directory Claude Code runs in.

## Install it from the marketplace

The marketplace is this repository; its name, from `.claude-plugin/marketplace.json`, is `beads-ui`, and it lists one plugin, also `beads-ui`.

```sh
claude plugin marketplace add sergeiwallace/beads-ui
claude plugin install beads-ui@beads-ui
```

Or in one step, which adds the marketplace first if it is not there yet:

```sh
claude plugin install beads-ui --marketplace sergeiwallace/beads-ui
```

Both install for your user by default; pass `--scope project` or `--scope local` to install for one repository instead. Start a new session afterwards. To update later, run `claude plugin marketplace update beads-ui`.

## What it does

- `/beads` opens the pane, and runs again to close it. `/bu` is the same command under a short name.
- The band above the prompt shows the store's open, in-progress and blocked counts, refreshed at most every 10 seconds. It draws nothing until the store has been read once.
- The pane has three tabs: `1` Board, `2` Backlog and `4` Detail. `3` is held for the Sprint tab of a later release. The header shows the store's name and when the board was last read (`as of HH:MM:SS`, local time).
- The pane refreshes when you open it, after every write and every 10 seconds while it is open. A failed `bd list` keeps the last board on screen with an error line naming the exit code, and the next refresh tries again.
- If the pane was open when your last session ended, it opens again on its own. On a terminal narrower than 110 columns it stays closed and a toast says so; `/beads` opens it anyway.

## Keys

The pane takes these keys while it has the keyboard (`/beads` gives it the keyboard when the prompt is empty; otherwise click the pane or press ctrl+x tab). Tab walks the controls.

| Key | Action |
|---|---|
| `1`, `2`, `4` | Board, Backlog, Detail tab |
| `n` | Focus the quick-add field |
| `s` | Next swimlane: none, assignee, epic |
| `o` | Next sort: priority, newest created, recently updated, due date, assignee |
| `d` | Open the focused card's detail |
| `m` | Focus the focused card's Move to |
| `x` | Delete the focused card, or the issue on the Detail tab |
| `p`, `b` | Next or previous page: of the focused card's column on the Board, of the list on the Backlog, while it is paged |
| `l` | Next page of swimlanes, while they take more than one page |
| `u` | Undo the last close, while its line is shown |
| `h` | Show or hide the help panel |
| Esc | Close the pane |

Every card carries a Move to control: Tab to it, press Enter to open its list, pick a status with the arrows and press Enter. Esc closes the whole pane, even from an open list. The move shows at once and is written with `bd update <id> --status <new> --if-status <shown>`. If another session changed the issue first, bd refuses the write, the card goes back to its column and a line says so.

A large board is drawn in pages, because Claude Code cuts off a mod's drawing past 100,000 characters. A column with more cards than fit shows a range such as `1-25 of 200` under its cards, between a `back` control and a `+175 more` control; both wrap round, so `more` on the last page goes back to the first. Tab to either and press Enter, or press `p` or `b` with a card in that column focused, which also moves the focus onto the new page's first card (its `detail` control, so the next `p` steps again; `m` reaches its Move to). When the swimlanes do not fit on one page, a `lanes 1-18 of 201` line above them pages through the lanes the same way, with `l` for the next page. The Backlog lists 60 open issues to a page, with the same `back` and `more` controls under the list and `p` and `b` stepping it. A new filter, swimlane or sort starts every column, and the Backlog, again at its first page.

In the delete confirmation:

| Key | Action |
|---|---|
| `c` | Close instead: runs `bd close <id>`, never `bd delete` |
| `x` | Delete, once it is enabled |
| Esc | Cancel |

The board steps aside while the confirmation is open, so the confirmation gets the keyboard, and comes back when it closes. The confirmation shows `bd delete <id> --dry-run` before anything is written. Delete runs the dry run once more and deletes only if nothing changed. When the issue has dependents, the delete is a cascade, and Delete appears only after you type the issue's display id into the field. After a close, `u` writes the status the issue had back, through the same guarded write as a move.

## Quick-add

Type a line into the `New` field (`n` focuses it) and press Enter. Words become the title; these tokens set fields:

| Token | Sets | Example |
|---|---|---|
| `p0` to `p4` | Priority | `p1` |
| `type:<type>` | Issue type | `type:bug` |
| `@<name>` | Assignee | `@aih-ec2-3` |
| `+<label>` | A label (repeatable) | `+ui` |
| `due:<YYYY-MM-DD>` | Due date | `due:2026-11-02` |
| `sprint:<name>` | The `sprint:<name>` label | `sprint:s1` |

For example, `Fix the band p1 type:bug +ui due:2026-11-02` runs `bd create` with `--title=Fix the band --priority=1 --type=bug --labels=ui --due=2026-11-02`. When the store's issues carry display ids (`metadata.display_id`), the new issue gets one of the same shape, written to `metadata.display_id` and as an `id:<display id>` label.

The readable part of a display id is cut to 32 characters, or 20 for a child issue. The fleet's `bd-new` takes these budgets from `AIH_SLUG_BODY_MAX_CHARS` and `AIH_SLUG_BODY_MAX_CHARS_CHILD`, and the mod reads the same two variables from the session's environment when it creates an issue, so both mint the same id. A value that is not a positive whole number is ignored and the default applies.

If the issue is created but writing its display id fails, a warning line stays on the pane and the mod writes the same display id again on every refresh until it succeeds, in this session or a later one. It never mints a second id for the issue, and if the issue has meanwhile got a display id some other way, it keeps that one and writes nothing.

## Filter

Type `key:value` terms into the `Filter` field (Tab to it) and press Enter. Terms combine with AND. The keys are `type`, `label`, `assignee`, `sprint` and `ready` (`ready:true` or `ready:false`, from `bd ready`). A term with any other key shows the accepted keys and leaves the list as it was.

## Edit an issue

The Detail tab shows the issue's fields as controls. Tab to one, change it and press Enter to save: the mod writes that one field with `bd update` and reads the issue again before it redraws. Status and priority are lists; the others are one-line fields.

The description is shown as Markdown and is also edited in the one-line `Description` field. There, a line break is written `\n`, a tab `\t`, a carriage return `\r` and a backslash `\\`; the mod turns them back into those characters when you save, so the text round-trips exactly, and saving it unchanged writes nothing. A backslash before any other character is kept as typed. A description longer than 20,000 characters in that form is not edited inline; the field says so and names the `bd update` command to use.

## Configuration

The mod reads `beads-ui.toml` each time it refreshes. It uses the first of these that exists:

1. `beads-ui.toml` in the directory the session runs in (the repository root);
2. `$XDG_CONFIG_HOME/beads-ui/beads-ui.toml`, or `~/.config/beads-ui/beads-ui.toml` when `XDG_CONFIG_HOME` is unset.

With no file, these defaults apply:

```toml
[stores.default]
id_policy = "auto"        # auto: mint display ids when the store already has them; fleet-slug: always; off: never
refresh_seconds = 10      # at least 10; a smaller value is raised to 10

[views]
soft_wip_limit = { in_progress = 5 }   # a column over its limit is drawn in the warning colour
```

A `[stores.<name>]` table whose `path` is the repository applies before `[stores.default]`. A setting the mod cannot use keeps its default, and the pane shows a line naming it. The file's other tables (`[queue]`, `[theme]`, `views.rank`) are for later releases.

The mod keeps your view choices (the open tab, filter, swimlane, sort and whether the pane was open) in Claude Code's plugin store, under the key `view`. It never stores issue data. The one other key, `pending-display-ids`, holds a display id the mod minted for an issue it created but could not write yet: the issue's id and the display id, nothing else.

## Report a bug

Open an issue at <https://github.com/sergeiwallace/beads-ui/issues> with:

- what you did and what you saw, including the pane's error line if there was one;
- the output of `claude --version` and `bd --version`;
- whether you loaded the mod with `--plugin-dir` or from the marketplace.

This repository is public, so leave out tokens, credentials and anything private from your store. Report a security problem as [SECURITY.md](../../SECURITY.md) describes, not in a public issue.
