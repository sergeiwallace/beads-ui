# Three worked uses

Each walk-through below is one real task from start to finish. The first two use the Claude Code
plugin, the band above the prompt and the `/bu` pane. The third uses the web app. Every step
names the key or control it takes, and every write it makes is a plain `bd` command you could run
yourself.

- [1. See what is blocking your work, and unblock it](#1-see-what-is-blocking-your-work-and-unblock-it)
- [2. File a bug you just found, fix it and close it](#2-file-a-bug-you-just-found-fix-it-and-close-it)
- [3. Plan a sprint in the web app](#3-plan-a-sprint-in-the-web-app)

You need what the plugin's [install section](../plugins/beads-ui/README.md#install) lists: Claude
Code 2.1.299 or later, `bd` 1.3.x on your `PATH`, and a session started in a repository whose
Beads store answers `bd list`. The keys are listed in full in the
[mod guide](procedures/mod-install.md#keys).

## 1. See what is blocking your work, and unblock it

You come back to a session and the band above the prompt reads
`[bd] 7 tasks (2 in progress, 1 blocked, 4 open, 3 done last 24h)`. One of your tasks is stuck.

1. Give the band the keyboard with Ctrl+X then Tab, and press `b`. The blocked task's row opens
   under the line, with the `⊘` indicator at its start. With fullscreen rendering on, a click on
   `1 blocked` does the same.
2. Run `/bu`. The pane opens on the Tasks view: your in-progress tasks first, then the blocked one
   (`●`), then the open ones. Move to the blocked task and press Enter. Its Detail view shows its
   fields as controls, its description as Markdown, then its comments, oldest first. The newest
   comment says why it is blocked, for example that it waits on a review of another change.
3. That review landed this morning. Tab to the `Status` list, pick `in_progress` and press Enter.
   The mod writes `bd update <id> --status in_progress --if-status blocked`. If another session
   changed the status first, bd refuses the write, the field goes back to `blocked` and a line says
   so.
4. Tab to the `Comment` field, type `Unblocked: the review it waited on has merged.` and press
   Enter. The mod writes it with `bd comments add`, under your session's name, and draws it at the
   end of the list.
5. Press Esc. The pane closes and the band now reads `3 in progress, 0 blocked`.

## 2. File a bug you just found, fix it and close it

While working you notice the band's count is off by one when a task is deferred. You want it on
record before you fix it, and closed when the fix lands.

1. Run `/bu` and press `n` to focus the `New` field. Type
   `Band count includes deferred tasks p1 type:bug +band @<session name>` and press Enter, with
   your session's name after the `@`. The mod runs `bd create` with
   `--title="Band count includes deferred tasks" --priority=1 --type=bug --labels=band` and that
   assignee, and the new task appears in the Tasks view under open. Without an `@` the task has no
   owner, so it shows on the Board and the Backlog but not in your own Tasks view.
2. Press `m` on it to open its Detail on the status, pick `in_progress` and press Enter, so the
   band and anyone watching the board can see it is being worked on.
3. Fix the bug. When the fix is committed, Tab to the `Comment` field on the same Detail and
   record it, for example `Fixed in a1b2c3d: deferred tasks are no longer counted.`
4. Press `x`. The confirmation shows what `bd delete <id> --dry-run` would remove. Press `c` to
   close the task instead, which runs `bd close <id>` and never deletes anything.
5. If you closed the wrong task, press `u` while the undo line is shown. The mod writes the
   previous status back with the same guarded `bd update`.

## 3. Plan a sprint in the web app

You want to pick next week's work from the backlog, see it as a board and track its burndown.
These steps use the web app's views; its setup is in [web setup and usage](procedures/web-run.md).

1. Start the server from your checkout with `node apps/web/bin/beads-ui-web.mjs`. It prints the
   stores it opened and its address, such as `http://127.0.0.1:4810/`. In another shell run
   `beads-ui-web login-link`, and open the link it prints. The link works once, for five minutes.
2. Create the sprint's milestone so the burndown has dates: a milestone titled `Sprint s1` with a
   due date, and `sprint.starts_at` in its metadata. In the plugin's `New` field, for example,
   `Sprint s1 type:milestone due:2026-11-20` creates the milestone; then add `sprint.starts_at` to
   its metadata.
3. Open Sprints. Its picker lists the backlog and every open sprint. Drag each task you want onto
   the `sprint:s1` entry, or use the card's Move to menu. Each move writes the `sprint:s1` label
   and drops any other sprint label.
4. Switch the sprint to its board view. Drag a card to `in_progress` to start it, or use Move to,
   so no step needs a drag. A move is written as `bd update --status <to> --if-status <shown>`; if
   another session moved the card first, it goes back to its column and a toast says so.
5. Open Analytics, pick sprint `s1`, and read its burndown. Each chart's numbers are under its
   Data toggle. If the sprint lacks a start or due date, the burndown says which one is missing.
