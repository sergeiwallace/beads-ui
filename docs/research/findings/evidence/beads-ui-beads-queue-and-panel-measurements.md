---
title: "Measurements behind the leg C findings packet (Beads, work queue, task panel)"
category: research
tags: [research, findings, evidence, beads-ui]
status: complete
source: "claude-opus-5-5-2026-10-15"
task: BU-mg2.1.3
display_id: BU-research-leg-c-beads-hrme
---

# Measurements behind the leg C findings packet

Every reading below was taken on host `sem-kg-ec2` between 2026-10-15T00:04Z and 00:13Z with
read-only commands. Times are UTC. The packet that cites these readings is
`docs/research/findings/beads-ui-beads-queue-and-panel.md`. Nothing here is copied from a
document; where a document disagrees, the packet says so.

Host state during the run: `machine-contention status` returned verdict `HOLD` at 00:08Z
(swap-out rate 204,699 pages per minute, PSI memory full 38.8% and PSI io full 56.1% over 60 s,
load 38.2 on 16 cores). Every latency figure below was measured under that pressure.

## M-1. Tool versions (00:04:45Z)

| Command | Result |
|---|---|
| `bd --version` | `bd version 1.3.0 (f45b249ce)` |
| `dolt version` | `dolt version 2.3.4` (Dolt warns 2.4.2 is newest) |
| `claude --version` | `2.1.296 (Claude Code)` |

## M-2. The beads-ui store's backend (00:05:39Z)

`bd context` from the beads-ui worktree reported: backend `dolt`, mode `server`, database `BU`,
server `127.0.0.1:3308`, beads dir `/data/projects/beads-ui/.beads` (the main tree's, not the
worktree's), role `maintainer`.

`.beads/metadata.json`: `"backend": "dolt"`, `"dolt_mode": "server"`, `"dolt_database": "BU"`.

`.beads/config.yaml` non-comment keys: `sync.remote: "git+https://github.com/sergeiwallace/beads-ui.git"`,
`export.auto: false`, `export.git-add: false`, `dolt.shared-server: true`.

`.beads/.gitignore` ignores `issues.jsonl`, `interactions.jsonl`, `dolt/`, `embeddeddolt/` and the
server state files.

`ps -eo pid,etime,args` showed one shared Dolt server for the host:
`dolt --data-dir /home/ubuntu/.beads/shared-server/dolt sql-server -H 127.0.0.1 -P 3308`.

`git ls-remote origin` (00:15Z) listed `refs/dolt/data` and `refs/heads/__dolt_remote_info__`
beside `refs/heads/main`, so the store's Dolt data is pushed to the public GitHub repository.

`bd config list` (filtered): `status.custom = review:wip,uat:wip`,
`types.custom = research,follow_up`, `export.auto = false`. `bd config get events-journal` returned
`false`.

## M-3. Issue record shape (00:04:57Z)

`bd list --json --all -n 0` on the BU store returned 17 records in 124 ms. Keys present, with the
count of records carrying each: `id`, `title`, `description`, `status`, `priority`, `issue_type`,
`owner`, `created_at`, `created_by`, `updated_at`, `metadata`, `labels`, `dependency_count`,
`dependent_count`, `comment_count` (17 each); `parent` and `dependencies` (16); `assignee` and
`started_at` (6). Types: 9 `epic`, 8 `task`. Statuses: 11 `open`, 6 `in_progress`. Priorities:
P1 8, P2 4, P3 5.

Every record's `metadata` held exactly one key, `display_id`, and every record carried a matching
`id:<display_id>` label. A dependency row reads
`{"issue_id", "depends_on_id", "type": "parent-child", "created_at", "created_by", "metadata": "{}"}`.

`bd schema` returned `schema_version` 1 with two record types. The `issue` type has 56 properties
and requires `id`, `title`, `priority`, `created_at`, `updated_at`. Status enum: `open`,
`in_progress`, `blocked`, `deferred`, `closed`, `pinned`, `hooked`. Issue-type enum: `bug`,
`feature`, `task`, `epic`, `chore`, `decision`, `message`, `molecule`, `gate`, `spike`, `story`,
`milestone`. Scheduling-relevant properties: `estimated_minutes`, `due_at`, `defer_until`,
`started_at`, `closed_at`, `lease_expires_at`, `heartbeat_at`. Other properties include `design`,
`acceptance_criteria`, `notes`, `spec_id`, `external_ref`, `source_system`, `close_reason`,
`closed_by_session`, `is_blocked`, `pinned`, `is_template`, `work_type`, `mol_type`.

The `dependency` type's `type` enum has 19 values: `blocks`, `parent-child`,
`conditional-blocks`, `waits-for`, `related`, `discovered-from`, `replies-to`, `relates-to`,
`duplicates`, `supersedes`, `authored-by`, `assigned-to`, `approved-by`, `attests`, `tracks`,
`until`, `caused-by`, `validates`, `delegated-from`.

No property names a sprint, an iteration, a rank, a board position or story points.

`bd list --help` offers `--sort` over `priority, created, updated, closed, status, id, title, type,
assignee` and `-r` to reverse; it offers no manual order.

`bd update --help` offers `--if-status` and `--if-assignee`: "a mismatch writes nothing and exits
13", plus `--claim`, `--estimate`, `--due`, `--defer`, `--parent`, `--set-metadata`,
`--external-ref`.

`bd statuses` listed the seven built-ins plus the custom `review` and `uat`, both `wip`.
`bd types` listed nine core types plus the custom `follow_up` and `research`.

## M-4. History and events (00:05:39Z)

`bd history BU-mg2 --json` returns Dolt commit snapshots (`CommitHash`, `Committer`, `CommitDate`,
full `Issue`). `bd history BU-mg2 --events --json` returns audit rows with `id`, `issue_id`,
`event_type`, `actor`, `old_value` and `new_value`, where the values are whole-issue JSON snapshots.

`bd sql --json 'SELECT event_type, COUNT(*) ... FROM events GROUP BY event_type'` on BU:
`created` 17, `label_added` 17, `updated` 17, `status_changed` 6, `closed` 1.

`bd sql --csv 'SHOW TABLES'` on BU listed 32 tables, including `issues`, `dependencies`, `labels`,
`comments`, `events`, `bd_events_journal`, `bd_events_seq`, `issue_snapshots`, `leases`,
`ready_issues`, `blocked_issues`, `custom_statuses`, `custom_types`, `provenance_events` and the
`wisp_*` set.

## M-5. Display-id resolution (00:06Z)

`bd show BU-research-leg-c-beads-hrme --json` answered `"error": "no issues found matching the
provided IDs"`. The same record answers to its hash id `BU-mg2.1.3`. bd 1.3.0 still resolves only
the hash-primary id, as `scripts/bdx.py` in ai-harness documents for bd 1.1.2.

## M-6. Read latency on a large store under HOLD (00:06:57Z to 00:08:40Z)

From an ai-harness worktree (database `AIH`, same shared server):

| Command | Result |
|---|---|
| `bd list --json --all -n 0` | failed after 34.7 s: three `i/o timeout` reads, then `search count issues: invalid connection` |
| `bd ready --json -n 0` | failed after 46.0 s with the same error |
| `bd count --json` | `5918` in 4.4 s |
| `bd list --json -n 5` | succeeded in 26.9 s after two `i/o timeout` retries |

## M-7. The work-queue service on this host (00:11Z)

`ss -ltn` showed loopback listeners on `:8400` (ai-core), `:5432` (Postgres), `:4222` (NATS) and
`:3308` (Dolt). `ps` showed `uvicorn ai_core.main:app --host 127.0.0.1 --port 8400 --workers 2`
(up 4 days 15 h), `scripts/queue_bridge.py loop --interval-seconds 30` and
`scripts/queue_waker.py run --liveness-interval-seconds 60`.

`GET http://127.0.0.1:8400/openapi.json` returned 200 with 62 paths, 26 under `/api/queue/`:
`sessions` (GET, POST), `sessions/{id}/heartbeat|state|liveness` (POST), `sessions/{id}` (DELETE),
`next` (GET), `prompts` (POST), `prompts/{id}/ack|consumed` (POST), `claim`, `block`, `done`,
`briefing` (POST), `leases/{id}/release` (POST), `gates/{repo}/{task_id}/resolve` (POST),
`bridge/pending` (GET), `bridge/{command_id}/result` (POST), `events` (GET with `Last-Event-ID`,
POST), `projection/{repo}` (POST), `tasks` (GET, params `repo`, `queue_state`),
`tasks/{repo}/{task_id}` (GET), `tasks/{repo}/{task_id}/status` (POST), `review` (GET),
`review/{item_id}/accept` (POST), `inbox` (GET), `skills` (GET).

Schemas: `TaskOut` has `task_id`, `display_id`, `repo`, `title`, `status`, `priority`,
`issue_type`, `parent_id`, `labels`, `queue_state`, `owner_session`, `blocked_by`,
`autonomous_eligible`, `requires_approval`, `source_commit`, `exported_at`. `TaskDetailOut` has
`task`, `briefing`, `links`, `playbook`, `prompts`, `events`. `TaskStatusIn` has `status`,
`expected_status`, `idempotency_key`, `actor`. `SessionOut` has `id`, `machine`, `name`,
`harness`, `repo`, `worktree`, `tmux_target`, `pid`, `task_list_id`, `transcript_path`,
`goal_state`, `state`, `capacity`, `ctx_pct`, `quota_pct`, `started_at`, `last_heartbeat_at`,
`ended_at`. The status endpoint's description reads "202, not 200: the status is *requested*.
Beads has not been written when this returns" and "409 when ``expected_status`` is given and
stale".

`GET /api/queue/tasks` returned 200 with 11,388 rows in 1.97 s: ai-harness 5,918, sergei 2,092,
sw-bms-workspace 1,665, ai-cli-utils 622, ai-core 553, aido 465, project-template 40, beads-ui 17,
app-portal 9, doc-editor 7.

`GET /queue/` returned 404 on the running server. `/data/projects/ai-core/web/src/views/` holds
`Board.tsx`, `Decisions.tsx`, `Epics.tsx`, `Inbox.tsx`, `Review.tsx`, `Sessions.tsx` and
`TaskDetail.tsx`; its `package.json` names `@ai-core/queue-web` with React 19, Lexical 0.52,
`openapi-fetch` and `@app-portal/ui` pinned to an app-portal commit.

In ai-harness, `config/work_queue.toml` has `sem-kg-ec2 = "supervised"` and the `bms-shared`
group with `service_host = "sem-kg-ec2"`. No `wq` skill exists under `skills/`.

## M-8. The Claude Code task store (00:12:33Z)

`~/.claude/tasks` resolves to `/data/claude/tasks`: 86 directories, 76 of them holding no task
file, 2.9 MB. All 86 are named lists (none is a session UUID), which matches the fleet pinning
`CLAUDE_CODE_TASK_LIST_ID` per session. 625 `<id>.json` task files across the 10 non-empty lists,
all parseable, plus a `.lock` and a `.highwatermark` per list.

Every task file carries `id`, `subject`, `description`, `status`, `blocks` and `blockedBy`.
Optional keys and their counts: `activeForm` 433, `owner` 157, `metadata` 98. Statuses: `pending`
547, `in_progress` 55, `completed` 23.

## M-9. The fleet's Task tool opt-in (00:13Z)

ai-harness `src/ai_harness/defaults/settings.template.json` sets `"env":
{"CLAUDE_CODE_ENABLE_TODO_TOOLS": "1", ...}` and carries two `permissions.deny` entries, neither
naming a Task tool. The live `~/.claude/settings.json` contains the variable name once.
