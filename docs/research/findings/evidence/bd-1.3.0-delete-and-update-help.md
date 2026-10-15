# bd 1.3.0 help output: delete and update

Captured 2026-10-15T00:16Z on the sem-kg-ec2 host by the leg A researcher for BU-mg2.1.1.
Commands were run from the beads-ui worktree root and are read-only: `bd --version`,
`bd delete --help` and `bd update --help`. The global-flags block is shown once, under `bd update`.

The findings packet `../beads-ui-task-manager-ux.md` cites this file for the delete preview, the
cascade flag, the compare-and-set guards, the metadata flags and the read-only global flag.

## bd --version

```text
bd version 1.3.0 (f45b249ce)
```

## bd delete --help

```text
Delete one or more issues and clean up all references to them.
This command will:
1. Remove all dependency links (any type, both directions) involving the issues
2. Update text references to "[deleted:ID]" in directly connected issues
3. Permanently delete the issues from the database

This is a destructive operation that cannot be undone. Use with caution.

BATCH DELETION:
Delete multiple issues at once:
  bd delete bd-1 bd-2 bd-3 --force

Delete from file (one ID per line):
  bd delete --from-file deletions.txt --force

Preview before deleting:
  bd delete --from-file deletions.txt --dry-run

DEPENDENCY HANDLING (the same on a local database and against a team server):
Default: Fails if any issue has dependents not in deletion set
  bd delete bd-1 bd-2

Cascade: Recursively delete all dependents
  bd delete bd-1 --cascade --force

Force: Delete and orphan dependents
  bd delete bd-1 --force

Usage:
  bd delete <issue-id> [issue-id...] [flags]

Flags:
      --cascade            Recursively delete all dependent issues
      --dry-run            Preview what would be deleted without making changes
  -f, --force              Actually delete (without this flag, shows preview)
      --from-file string   Read issue IDs from file (one per line)
  -h, --help               help for delete
```

## bd update --help

```text
Update one or more issues.

If no issue ID is provided, updates the last touched issue (from most recent
create, update, show, or close operation). This fallback only applies in
interactive sessions (stdin is a terminal); in scripts and agent sessions a
missing ID is an error, so a command built from an empty variable cannot
silently mutate an unrelated issue. Set BD_LAST_TOUCHED_FALLBACK=1 to allow
the fallback anywhere, or =0 to disable it entirely.

Updates are applied per issue ID, not atomically across IDs: when some IDs
fail, the remaining issues are still updated, every failed ID is reported on
stderr, and the command exits nonzero.

Exit codes: 1 for general failures; 13 when every failure is a stale
--if-assignee/--if-status guard (the precondition no longer held, nothing was
written — another actor won the race, so retrying the same guard is
pointless).

Usage:
  bd update [id...] [flags]

Flags:
      --acceptance string            Acceptance criteria
      --add-label strings            Add labels (repeatable)
      --allow-empty-description      Allow empty description replacement when reading from stdin or file
      --append-notes string          Append to existing notes (with newline separator)
  -a, --assignee string              Assignee
      --await-id string              Set gate await_id (e.g., GitHub run ID for gh:run gates)
      --body-file string             Read description from file (use - for stdin)
      --claim                        Atomically claim the issue (sets assignee to you, status to in_progress; idempotent if already claimed by you; issues assigned to a pool alias listed in the claim.pools config are claimable too)
      --defer string                 Defer until date (empty to clear). Issue hidden from bd ready until then, then auto-wakes to open
  -d, --description string           Issue description
      --design string                Design notes
      --design-file string           Read design from file (use - for stdin)
      --due string                   Due date/time (empty to clear). Formats: +6h, +1d, +2w, tomorrow, next monday, 2025-01-15
      --ephemeral                    Mark issue as ephemeral (wisp) - not exported to JSONL
  -e, --estimate int                 Time estimate in minutes (e.g., 60 for 1 hour)
      --external-ref string          External reference (e.g., 'gh-9', 'jira-ABC', Linear URL)
      --force                        Override two refusals: let -a/--assignee overwrite another actor's live in_progress claim (use only for abandoned claims — crashed agent, expired lease; prefer bd reclaim), and let -s/--status move the issue into closed (or a configured done status) despite open children or a live blocker (same as bd close --force)
  -h, --help                         help for update
      --history                      Clear no-history flag (re-enable Dolt commit history)
      --if-assignee string           Apply the update only if the current assignee equals this value (--if-assignee '' requires unassigned); a mismatch writes nothing and exits 13 (vs 1 for other failures). Requires a field update; cannot combine with --claim
      --if-status string             Apply the update only if the current status equals this value; a mismatch writes nothing and exits 13 (vs 1 for other failures). Requires a field update; cannot combine with --claim
      --metadata string              Set custom metadata (JSON string or @file.json to read from file)
      --no-history                   Mark issue as no-history (skip Dolt commits, not GC-eligible)
      --notes string                 Additional notes (replaces existing notes; use --append-notes to append)
      --parent string                New parent issue ID (reparents the issue, use empty string to remove parent)
      --persistent                   Mark issue as persistent (promote wisp to regular issue)
  -p, --priority string              Priority (0-4 or P0-P4, 0=highest)
      --remove-label strings         Remove labels (repeatable)
      --session string               Claude Code session ID for status=closed (or set CLAUDE_SESSION_ID env var)
      --set-labels strings           Set labels, replacing all existing (repeatable)
      --set-metadata stringArray     Set metadata key=value (repeatable, e.g., --set-metadata team=platform)
      --spec-id string               Link to specification document
  -s, --status string                New status
      --stdin                        Read description from stdin (alias for --body-file -)
      --title string                 New title
  -t, --type string                  New type (bug|feature|task|epic|chore|decision|spike|story|milestone); custom types require types.custom config; aliases: enhancement/feat→feature, dec/adr→decision
      --unset-metadata stringArray   Remove metadata key (repeatable, e.g., --unset-metadata team)

Global Flags:
      --actor string              Actor name for audit trail (default: $BEADS_ACTOR, git user.name, $USER)
      --cpu-profile               Generate CPU profile for performance analysis
      --database string           Run against a different server database for this invocation, without changing the project's configured database (proxied-server mode only)
      --db string                 Database path (default: auto-discover .beads/*.db). In proxied-server mode, a value that isn't an existing path is treated as a database name override (see --database)
  -C, --directory string          Change to this directory before running the command (like git -C)
      --dolt-auto-commit string   Dolt auto-commit policy (off|on|batch). 'on': commit after each write. 'batch': defer commits to bd dolt commit; uncommitted changes persist in the working set until then (a live batch-mode bd process also flushes on SIGTERM/SIGHUP). Applies to embedded and direct SQL-server modes; proxied-server routes are unaffected. Default: on. Override via config key dolt.auto-commit
      --global                    Use the global shared-server database (beads_global)
      --ignore-schema-skew        Proceed despite forward schema drift (some queries may fail)
      --json                      Output in JSON format
      --mem-profile string        Write heap profile to FILE on exit (also respects BEADS_MEM_PROFILE)
      --no-color                  Disable color output (also: NO_COLOR=1 or CLICOLOR=0)
  -q, --quiet                     Suppress non-essential output (errors only)
      --readonly                  Read-only mode: block write operations (for worker sandboxes)
      --sandbox                   Sandbox mode: disables Dolt auto-push
  -v, --verbose                   Enable verbose/debug output
```
