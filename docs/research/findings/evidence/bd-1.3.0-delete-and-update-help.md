# bd 1.3.0 help output: delete and update

Captured 2026-10-15T00:16Z to 00:40Z on the host-c host by the leg A researcher for
BU-mg2.1.1. Commands were run from the beads-ui worktree root and are read-only: `bd --version`,
`bd delete --help`, `bd update --help`, `bd --help`, `bd serve --help`, `bd batch --help` and
`bd statuses`. The global-flags block is shown once, under `bd update`.

The findings packet `../beads-ui-task-manager-ux.md` cites this file for the delete preview, the
cascade flag, the compare-and-set guards, the metadata flags, the read-only global flag, the
command list, the loopback HTTP API, single-transaction batches and the status categories.

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

## bd --help (command list, global flags omitted)

```text
Issues chained together like beads. A lightweight issue tracker with first-class dependency support.

Usage:
  bd [flags]
  bd [command]

Working With Issues:
  assign            Assign an issue to someone
  children          List child beads of a parent
  close             Close one or more issues
  comment           Add a comment to an issue
  comments          View or manage comments on an issue
  create            Create a new issue (or batch from markdown/graph JSON)
  create-form       Create a new issue using an interactive form
  delete            Delete one or more issues and clean up references
  edit              Edit an issue field in $EDITOR
  gate              Manage async coordination gates
  heartbeat         Refresh the lease on an issue you hold in_progress
  label             Manage issue labels
  link              Link two issues with a dependency
  list              List issues
  merge-slot        Manage merge-slot gates for serialized conflict resolution
  note              Append a note to an issue
  priority          Set the priority of an issue
  promote           Promote a wisp to a permanent bead
  provenance        Append-only provenance event log
  q                 Quick capture: create issue and output only ID
  query             Query issues using a simple query language
  reclaim           Revert stale-lease in_progress issues back to ready (dead-worker recovery)
  reopen            Reopen one or more closed issues
  search            Search issues by text query
  set-state         Set operational state (creates event + updates label)
  show              Show issue details
  state             Query the current value of a state dimension
  tag               Add a label to an issue
  todo              Manage TODO items (convenience wrapper for task issues)
  unclaim           Release a claimed issue
  update            Update one or more issues

Views & Reports:
  count             Count issues matching filters
  diff              Show changes between two commits or branches
  find-duplicates   Find semantically similar issues using text analysis or AI
  history           Show version history for an issue
  lint              Check issues for missing template sections
  stale             Show stale issues (not updated recently)
  status            Show issue database overview and statistics
  statuses          List valid issue statuses
  types             List valid issue types

Dependencies & Structure:
  dep               Manage dependencies
  duplicate         Mark an issue as a duplicate of another
  duplicates        Find and optionally merge duplicate issues
  epic              Epic management commands
  graph             Display issue dependency graph
  supersede         Mark an issue as superseded by a newer one
  swarm             Swarm management for structured epics

Sync & Data:
  backup            Back up your beads database
  branch            List or create branches
  conflicts         Inspect and resolve live merge conflicts
  export            Export issues to JSONL format
  federation        Manage peer-to-peer federation with other workspaces
  import            Import issues from a JSONL file or stdin into the database
  restore           Restore the pre-compaction content of a compacted issue
  sync              Pull, check for conflicts, repair is_blocked, and push (the federation loop)
  vc                Version control operations

Setup & Configuration:
  bootstrap         Non-destructive database setup for fresh clones and recovery
  config            Manage configuration settings
  context           Show effective backend identity and repository context
  dolt              Configure Dolt database settings
  forget            Remove a persistent memory
  hooks             Manage git hooks for beads integration
  human             Show essential commands for human users
  info              Show database information
  init              Initialize bd in the current directory
  kv                Key-value store commands
  memories          List or search persistent memories
  migrate-personal  Move personal planning issues from the project database to your planning repo
  onboard           Display minimal snippet for agent instructions file
  prime             Output AI-optimized workflow context
  quickstart        Quick start guide for bd
  recall            Retrieve a specific memory
  remember          Store a persistent memory
  setup             Setup integration with AI editors
  where             Show active beads location

Maintenance:
  batch             Run multiple write operations in a single database transaction
  compact           Squash old Dolt commits to reduce history size
  doctor            Check and fix beads installation health (start here)
  events            Read and manage the durable events journal
  flatten           Squash all Dolt history into a single commit
  gc                Garbage collect: decay old issues, compact Dolt commits, run Dolt GC
  migrate           Database migration commands
  ping              Check database connectivity
  preflight         Show PR readiness checklist
  prune             Delete old closed beads to reclaim space and shrink exports
  purge             Delete closed ephemeral beads to reclaim space
  recompute-blocked Recompute is_blocked for all issues (repairs stale flags after a pull)
  rename-prefix     Rename the issue prefix for all issues in the database
  rules             Audit and compact Claude rules
  sql               Execute raw SQL against the beads database
  upgrade           Check and manage bd version upgrades
  worktree          Manage git worktrees for parallel development

Integrations & Advanced:
  admin             Administrative commands for database maintenance
  jira              Jira integration commands
  linear            Linear integration commands
  repo              Manage multiple repository configuration

Additional Commands:
  ado               Azure DevOps integration commands
  audit             Record and label agent interactions (append-only JSONL)
  blocked           Show blocked issues
  completion        Generate the autocompletion script for the specified shell
  cook              Compile a formula into a proto (ephemeral by default)
  defer             Defer one or more issues for later
  formula           Manage workflow formulas
  github            GitHub integration commands
  gitlab            GitLab integration commands
  help              Help about any command
  init-safety       Explain bd init flag semantics and the destroy-token format
  mail              Delegate to mail provider (e.g., gt mail)
  metrics           Show or change anonymous usage-metrics settings
  mol               Molecule commands (work templates)
  notion            Notion integration commands
  orphans           Identify orphaned issues (referenced in commits but still open)
  ready             Show ready work (open, no active blockers)
  rename            Rename an issue ID
  schema            Print the JSON Schema for bd's --json / export output
  serve             Serve the beads HTTP API over loopback
  ship              Publish a capability for cross-project dependencies
  undefer           Undefer one or more issues (restore to open)
  version           Print version information

```

## bd serve --help (global flags omitted)

```text
Serve the beads HTTP API — the same work surface the CLI answers, for
automation clients that would otherwise fork a bd subprocess per call.

The wire contract is described by an OpenAPI document (/v0); GET
/v0/beads/context reports which operations this build actually implements.

DEPLOYMENT

  Pass an explicit port. The default 127.0.0.1:0 takes an ephemeral one, which
  is right for ad-hoc and test use — where the bound address printed on stdout
  is read immediately — but carries no mutual exclusion: two serves against one
  workspace then run side by side on different ports with no way to enumerate
  them. On a fixed port the second one fails to bind, which is the intended
  behavior. Concurrent serves are data-safe either way; claims are arbitrated
  in the SQL server.

  Run it under a supervisor. bd shuts down gracefully on SIGHUP as well as
  SIGINT and SIGTERM, so closing the terminal of a foreground bd serve stops it.

PROBES

  GET /healthz is LIVENESS only: it answers from the process and never touches
  the database, so it stays green while the database is unreachable. For
  readiness use GET /v0/beads/ready?limit=1 — a real query, where 200 means
  ready and 503 means live but not ready.

AUTHENTICATION

  Optional, and off by default on loopback — where the trust model is the
  loopback boundary itself, the same one the database behind it already relies
  on. --auth-token-file turns it on: every operation except GET /healthz then
  requires an "Authorization: Bearer <token>" header, GET /v0/beads/context
  included, because it reports the repo root, beads directory and database name.

  The file holds ONE TOKEN PER LINE and every line is accepted. That is the
  rotation mechanism: write the new token alongside the old, roll the clients
  over, then delete the old line. The file is re-read while the server runs, so
  both the addition and the removal take effect within about a second and
  neither needs a restart. Write it atomically (a temp file plus rename; a
  Kubernetes secret mount already does this).

  There is deliberately no --auth-token flag. A credential passed as an
  argument is readable by every local user in the process listing.

  --allow-non-loopback REQUIRES a token file. Beyond loopback, reaching the
  address would otherwise be the whole authorization: any peer could read every
  issue and claim work as any actor. --insecure-no-auth is the explicit,
  auditable way to say you meant that anyway.

  The Host allowlist is what a service deployment usually trips over first. The
  DNS-rebinding check answers only to loopback spellings and the bind address,
  so a client dialing a service name gets 400 on every request; enumerate the
  names it dials with --allowed-host (repeatable). Matching is exact — no
  wildcards — and the startup log line prints the effective allowlist.

WHAT THIS DOES NOT DO

  No TLS. Even with a token, the credential and every issue body travel in
  plaintext, so a deployment beyond loopback has to supply confidentiality
  itself — a service mesh, or a network boundary you already trust.

  Hooks do not fire. A hook is a user-controlled subprocess per mutation: in a
  concurrent server that is an unbounded latency multiplier and an orphaned
  child at shutdown, and its working-directory-derived hook lookup is
  meaningless in a server process. A CLI claim runs on_update; an HTTP claim
  does not.

  The per-command auto-commit machinery does not run. Durability is per request:
  a successful claim commits inside its own transaction, exactly as a proxied
  CLI claim does today.

  An actor on an HTTP request is caller-asserted provenance for the audit trail,
  not authenticated identity — the same thing it has always been on the CLI,
  where any local process can pass any --actor.

  It does not run under --readonly, and refuses to start rather than binding.
  Every server it binds publishes the issue-claim operation, and the capability
  set it advertises is a property of the build rather than of the flags on the
  process that started it — so a read-only server would advertise a write it
  could never land.

DESTRUCTIVE OPERATIONS

  POST /v0/beads/issues:sweep deletes closed beads in bulk — the operation
  behind bd purge and bd prune — and nothing it deletes comes back. It shares
  the library surface those commands call, so it inherits their guards: pinned
  beads are never swept, and a durable sweep with neither a cutoff nor an id
  pattern is refused rather than clearing every closed bead in the workspace.
  Combined with the trust model above, that means anyone who can reach this
  address can erase closed work; bind it accordingly.

Usage:
  bd serve [flags]

Flags:
      --addr string                Address to bind as IP:PORT; the host must be a numeric IP literal, and port 0 takes an ephemeral port (default "127.0.0.1:0")
      --allow-non-loopback         Permit a bind beyond loopback. Requires --auth-token-file, since reaching the address would otherwise be the whole authorization
      --allowed-host stringArray   Additional Host header value to answer to, e.g. a service DNS name. Repeatable; matched exactly, with no wildcards
      --auth-token-file string     Require an Authorization: Bearer token from this file, one token per line, all accepted. Re-read while running, so rewriting it rotates tokens without a restart (env BEADS_SERVE_TOKEN_FILE)
  -h, --help                       help for serve
      --insecure-no-auth           Serve a non-loopback bind with NO authentication. Every peer that can reach the address gets full read and claim access

```

## bd batch --help (global flags omitted)

```text
Run multiple write operations in a single database transaction.

Commands are read from stdin (one per line) or from a file via -f/--file.
All operations execute inside a single dolt transaction: on any error the
whole batch is rolled back, otherwise it is committed with one DOLT_COMMIT.

This is intended for shell scripts that currently invoke 'bd' many times in
a loop, which causes severe write amplification on a dolt sql-server backed
by btrfs+compression. Batching collapses N invocations into one transaction
and one dolt commit.

Grammar (one command per line):
  close <id> [reason...]
  update <id> <key>=<value> [<key>=<value> ...]
  create <type> <priority> <title...>
  dep add <from-id> <to-id> [type]
  dep remove <from-id> <to-id>
  #comment  (blank lines and '# ...' comments are ignored)

Supported 'update' keys: status, priority, title, assignee, force
Supported dependency types: see 'bd dep add --help' (default: blocks)

'force' is not a field. An update whose status moves the issue into closed
(or a configured done status) is refused when it still has open children or
a live blocker, the same as 'bd close'; 'force=true' overrides that refusal.
Because the batch is one transaction, an unforced refusal rolls back EVERY
operation in the batch, not just the offending line. Note the asymmetry with
'close <id>', which does not apply that policy at all.

Tokens are whitespace-separated. Double-quoted strings ("like this") may
contain spaces; use \" to embed a quote and \\ for a backslash.

Examples:
  # From a pipe
  bd list --status stale -q | awk '{print "close",$1," stale"}' | bd batch

  # From a file
  bd batch -f operations.txt

  # Inline
  printf 'close bd-1 done\nupdate bd-2 status=in_progress\n' | bd batch

On success, exits 0 and prints a summary (or JSON with --json). On any error,
rolls back the entire transaction and exits non-zero with the failing line.

NOTE: This is a narrow subset. Commands like 'show', 'list', 'ready', 'sync',
complex create flows, or any flag not listed above are NOT accepted. Use
normal 'bd' subcommands for interactive/read operations.

Usage:
  bd batch [flags]

Flags:
      --dry-run          Parse input and echo commands without executing
  -f, --file string      Read commands from file instead of stdin
  -h, --help             help for batch
  -m, --message string   DOLT_COMMIT message (default: 'bd: batch N ops by <actor>')

```

## bd statuses (this store, 2026-10-15)

```text
Built-in statuses:
  ○ open           [active]  Available to work (default)
  ◐ in_progress    [wip   ]  Actively being worked on
  ● blocked        [wip   ]  Blocked by a dependency
  ❄ deferred       [frozen]  Deliberately put on ice for later
  ✓ closed         [done  ]  Completed
  📌 pinned         [frozen]  Persistent, stays open indefinitely
  ◇ hooked         [wip   ]  Attached to an agent's hook

Custom statuses:
  ◐ review         [wip   ]
  ◐ uat            [wip   ]
```
