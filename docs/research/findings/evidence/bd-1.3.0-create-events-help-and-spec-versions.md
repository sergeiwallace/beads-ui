---
title: "Measurements behind the bd serve and tool-visibility spike (bd help, spec versions, binary strings)"
category: research
tags: [research, findings, evidence, beads-ui]
status: complete
source: "claude-opus-5-5-2026-10-15"
task: BU-mg2.2.1
display_id: BU-spike-beads-ui-bd-dvdg
---

# Measurements behind the bd serve and tool-visibility spike

Every reading below was taken on host `sem-kg-ec2` on 2026-10-15 between 01:06Z and 02:00Z with
read-only commands. The packet that cites these readings is
`docs/research/findings/beads-ui-spike-bd-serve-and-tool-visibility.md`. The help text for
`bd delete`, `bd update`, `bd serve`, `bd batch` and `bd --help` is already captured in
`bd-1.3.0-delete-and-update-help.md` beside this file and is not repeated here.

## E-1. Tool versions and store state

| Command | Result |
|---|---|
| `bd --version` (beads-ui worktree root) | `bd version 1.3.0 (f45b249ce)` |
| `bd config get events-journal` (beads-ui worktree root) | `false` |
| `readlink -f "$(command -v claude)"` | `/home/ubuntu/.local/share/claude/versions/2.1.296` |

## E-2. The OpenAPI document differs between the release tags and main

Three copies of `internal/httpapi/spec/openapi.v0.yaml` were read through the GitHub REST
contents API (`GET repos/steveyegge/beads/contents/...?ref=<ref>`, HTTP 200), decoded and hashed.
The GitHub repository now answers as `gastownhall/beads`; the `steveyegge/beads` path redirects.

| Ref | Bytes | Lines | sha256 | Operations (`operationId` count) |
|---|---|---|---|---|
| `v1.3.0` | 497,361 | 11,138 | `9a33a349e5266bdba916246594a4fc457c63e39d7affb5acec9bd5b75acde4dd` | 41 |
| `v1.3.1` | 497,361 | 11,138 | `9a33a349e5266bdba916246594a4fc457c63e39d7affb5acec9bd5b75acde4dd` | 41 |
| `main` (2026-10-15) | 587,112 | 12,954 | `099b24bc7a838af64f5762def193f312607c21064267b4fc29ee62cb10b8e2a5` | 44 |

The v1.3.0 and v1.3.1 documents are byte-identical. The three operations present on `main` and
absent from both release tags, from a path/method/operationId listing of each file:

```text
/v0/beads/issues/{id}:advanceMolecule: post: advanceMolecule
/v0/beads/issues:batchGet: post: batchGetIssues
/v0/beads/issues:reclaim: post: reclaimIssues
```

Schema members present on `main` and absent at v1.3.0, from a member listing of each schema:

| Schema | Members only on `main` |
|---|---|
| `UpdateIssueRequest` | `claim`, `force_notes_overwrite`, `allow_template` |
| `IssuePatchBody` | `persistence` |
| `SweepRequest.tier` enum | `wisps-plane` (v1.3.0 enum is `[ephemeral, durable]`) |

`CreateIssueRequest` has the same 26 members on both refs: `actor`, `id`, `title`, `description`,
`design`, `acceptance_criteria`, `notes`, `issue_type`, `status`, `priority`, `assignee`, `owner`,
`labels`, `estimated_minutes`, `external_ref`, `due_at`, `defer_until`, `sender`, `metadata`,
`ephemeral`, `no_history`, `parent_id`, `inherit_labels_from_parent`, `dependencies`, `waits_for`,
`force_id_prefix`. The `:casMetadata` responses are `200`, `400`, `401`, `404`, `500` and `503` on
both refs; neither defines a `409`.

## E-3. bd create --help (global flags omitted)

```text
Create a new issue (or batch from markdown/graph JSON)

Usage:
  bd create [title] [flags]

Aliases:
  create, new

Flags:
      --acceptance string         Acceptance criteria
      --allow-empty-description   Allow empty description input from stdin or file
      --append-notes string       Append to existing notes (with newline separator)
  -a, --assignee string           Assignee
      --body-file string          Read description from file (use - for stdin)
      --context string            Additional context for the issue
      --defer string              Defer until date (issue hidden from bd ready until then). Same formats as --due
      --deps strings              Dependencies as 'type:id' or bare 'id'. Bare 'id', 'depends-on:id', and 'blocked-by:id' all make THIS issue depend on id; 'blocks:id' reverses direction (id depends on this issue). E.g. 'blocked-by:bd-20,discovered-from:bd-15'
  -d, --description string        Issue description
      --design string             Design notes
      --design-file string        Read design from file (use - for stdin)
      --dry-run                   Preview what would be created without actually creating
      --due string                Due date/time. Formats: +6h, +1d, +2w, tomorrow, next monday, 2025-01-15
      --ephemeral                 Create as ephemeral (short-lived, subject to TTL compaction)
  -e, --estimate int              Time estimate in minutes (e.g., 60 for 1 hour)
      --event-actor string        Entity URI who caused this event (requires --type=event)
      --event-category string     Event category (e.g., patrol.muted, agent.started) (requires --type=event)
      --event-payload string      Event-specific JSON data (requires --type=event)
      --event-target string       Entity URI or bead ID affected (requires --type=event)
      --external-ref string       External reference (e.g., 'gh-9', 'jira-ABC', Linear URL)
  -f, --file string               Create multiple issues from markdown file
      --force                     Force creation even if prefix doesn't match database prefix
      --graph string              Create a graph of issues with dependencies from JSON plan file
  -h, --help                      help for create
      --id string                 Explicit issue ID (e.g., 'bd-42' for partitioning)
  -l, --labels strings            Labels (comma-separated)
      --metadata string           Set custom metadata (JSON string or @file.json to read from file)
      --mol-type string           Molecule type: swarm (multi-agent), patrol (recurring ops), work (default)
      --no-history                Skip Dolt commit history without making GC-eligible (for permanent agent beads)
      --no-inherit-labels         Don't inherit labels from parent issue
      --notes string              Additional notes
      --parent string             Parent issue ID for hierarchical child (e.g., 'bd-a3f8e9')
  -p, --priority string           Priority (0-4 or P0-P4, 0=highest) (default "2")
      --repo string               Target repository for issue (overrides auto-routing)
      --silent                    Output only the issue ID (for scripting)
      --skills string             Required skills for this issue
      --spec-id string            Link to specification document
  -s, --status string             Initial status
      --stdin                     Read description from stdin (alias for --body-file -)
      --storage-class string      Storage class: versioned, unversioned, or ephemeral (default: storage-class.<type> config, else versioned)
      --title string              Issue title (alternative to positional argument)
  -t, --type string               Issue type (bug|feature|task|epic|chore|decision|spike|story|milestone); custom types require types.custom config; aliases: enhancement/feat→feature, dec/adr→decision (default "task")
      --validate                  Validate description contains required sections for issue type
      --waits-for string          Spawner issue ID to wait for (creates waits-for dependency for fanout gate)
      --waits-for-gate string     Gate type: all-children (wait for all) or any-children (wait for first) (default "all-children")
      --wisp-type string          Wisp type for TTL-based compaction: heartbeat, ping, patrol, gc_report, recovery, error, escalation
```

`bd create` has `--metadata` and no `--set-metadata`.

## E-4. bd events --help (global flags omitted)

```text
Read and manage the durable events journal (bd_events_journal).

The journal records every committed issue mutation as an ordered, replayable
row. Enable it with 'bd config set events-journal true' (or
BD_EVENTS_JOURNAL=1). Records are emitted only while it is enabled.

Retention is automatic: an enabled journal is bounded to the retention floors
(events-journal-retain-days / -rows, 7 days / 100k rows by default) without
anyone running a command. Disable both floors for an unbounded ledger, or
events-journal-auto-prune for manual control; 'bd events prune' remains for an
earlier, on-demand cut below the floors.

Coverage and scope:
  - Every mutation through bd's normal write paths (create, update, close,
    reopen, delete, claim, dependency add/remove, label add/remove, comment) is
    journaled in the same transaction as the change. Raw DML run through
    'bd sql' bypasses those paths and is NOT journaled — a known non-coverage.
  - The journal is per-branch working-set state (dolt_ignored): it records the
    mutations committed on the writer's active branch. Rows arrive by direct
    write, not by merge, so a consumer must read the journal on the same branch
    the writer commits to; a branch checkout or merge does not carry journal
    rows across branches.
  - For the same reason the journal is per REPLICA. 'bd dolt pull' and the
    changes a merge settles into this clone are not journaled: those rows
    arrived as data, not as local mutations, and nothing on this clone wrote
    them through the mutation seam. A consumer that mirrors a synced workspace
    must re-baseline (a fresh export or a full re-read) after a sync, because
    the journal describes only what THIS clone mutated.
    Each replica also has its OWN seq space, counted from its own first
    mutation. A checkpoint taken against one replica is meaningless against
    another — the same seq names a different record, and a seq above the other
    replica's head reads as "caught up" and stalls forever. Track a checkpoint
    per replica, and re-baseline rather than carry one across.
  - A few writes that happen while a store is being OPENED are unjournaled by
    design: schema migrations and the version reconciliation that runs before
    the workspace's configuration has been applied to the store. They touch
    schema and clone-local metadata, never a bead, so a replaying consumer has
    nothing to apply them to.
  - Dependency records are not symmetric, in two ways.
    Count: a dep_add is emitted for every accepted add, INCLUDING an idempotent
    same-type re-add that only refreshes the edge's metadata. The audit 'events'
    table deduplicates that case and writes nothing; the journal does not. Treat
    dep_add as an upsert of the edge, not as proof the edge is new. A dep_remove
    naming an edge that is already gone emits nothing at all.
    Payload: dep.metadata differs in provenance between the two ops. On dep_add
    it is the value being written, as the caller supplied it; on dep_remove it is
    the raw stored column read back just before the delete. The two can differ
    byte for byte while meaning the same thing, so compare parsed values.

Structural dependency edits — the ones bd wires up itself rather than a 'bd dep'
verb — write no audit event but DO journal, by design: a replaying consumer
needs the edge either way.

Usage:
  bd events [command]

Available Commands:
  export      Print the entire journal from the beginning (JSON lines)
  prune       Delete journal records below a sequence number (retention)
  tail        Print journal records after a sequence number (JSON lines)

Flags:
  -h, --help   help for events
```

## E-5. bd events tail --help (global flags omitted)

```text
Print events journal records with seq greater than --since, in order.

Each line is a JSON record:
  {"seq":N,"ts":"...","op":"create|update|close|delete|dep_add|dep_remove|comment",
   "issue_id":"...","actor":"...","issue":{...|null},"dep":{"kind":..,"target":..,"metadata":..},"comment":{...}}

Record contract (stable for external consumers):
  seq       int64   counter-assigned inside the mutation's transaction; gapless,
                    strictly increasing in commit order, never reused or reset
  ts        string  UTC insert time, stamped inside the committing transaction
  op        string  one of the seven ops above
  issue_id  string  the mutated issue's id
  actor     string  the acting identity that performed the mutation, as resolved
                    for the audit-events table (on a comment row: the comment's
                    author). A delete — and the dep_remove rows a cascading
                    delete produces — carries the identity that REQUESTED it.
                    Empty (omitted) only when the path genuinely has no actor:
                    derived maintenance, system cleanup with no request behind
                    it, and rows older than the column. Never user attribution
                    when empty.
  issue     object  full issue state AFTER the mutation; null on delete
  dep       object  {"kind","target","metadata"} for dep_add / dep_remove; omitted otherwise
  comment   object  {"id","author","text","created_at","source"} for comment; omitted otherwise

Poll with the highest seq seen to consume new mutations incrementally, or pass
--follow to keep printing new records as they are committed (Ctrl-C to stop).

Retention boundary: if --since is below the oldest retained record — the prefix
you asked for was pruned — the read FAILS instead of silently skipping ahead or
returning an empty success. With --json the failure carries
{"code":"events_journal_truncated","since":N,"floor":F,"head":H}: floor is the
oldest seq still retained, head the highest ever assigned. Resume from floor-1
to continue with a known gap, or rebuild from a full export.

Usage:
  bd events tail [flags]

Flags:
      --follow      keep printing new records as they are committed (Ctrl-C to stop)
  -h, --help        help for tail
      --limit int   maximum number of records to return (0 = no limit)
      --since int   return records with seq greater than this value
```

## E-6. MCP Apps identifiers in the installed Claude Code 2.1.296 binary

`LC_ALL=C grep -c -a` on `/home/ubuntu/.local/share/claude/versions/2.1.296` (257,068,216 bytes):

| String | Count | Byte offsets (`grep -boa`) |
|---|---|---|
| `io.modelcontextprotocol/ui` | 4 | 97,016,378; 98,686,448; 217,724,739; 225,555,741 |
| `text/html;profile=mcp-app` | 2 | (the `profile=mcp-app` substring at 96,943,182; 98,686,494; 217,724,782; 223,791,673) |

The bytes around offset 97,016,378 read, with non-printing bytes shown as `.`:
`mcp_discovery_cache. ...S...offer:io.modelcontextprotocol/ui....9...unwired`. The bytes around
offset 98,686,448 place `io.modelcontextprotocol/ui` next to `text/html;profile=mcp-app` in a
string table. The binary is compiled; these are string-table entries, and they say the
identifiers exist in the build. They do not say what the build does with a tool's
`_meta.ui.visibility`. No MCP server was started and no `initialize` request was observed.
