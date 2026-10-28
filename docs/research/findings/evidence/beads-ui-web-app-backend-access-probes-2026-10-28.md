---
title: "Evidence: read-only host probes behind the web app backend, portal and access findings"
category: research
tags: [research, evidence, beads-ui, web-app, backend, access]
status: complete
source: "claude-opus-5-5-2026-10-28"
task: BU-mg2.5.1.2
display_id: BU-agent-research-web-ahxr
template_version: "research-findings-1.0.0"
---

# Evidence: read-only host probes for the backend, portal and access leg

Measured on the employer-provisioned EC2 host (fleet name sem-kg-ec2) between 2026-10-28T01:16Z and
01:30Z. Every command was read-only: HTTP GETs to loopback ports, `bd` read verbs, `ss`, `ps` and
file listings. No session, tunnel or AWS call was made. Outputs are bounded. No account id,
instance id, profile name, credential or issue title appears below. Store and repository names
that identify the employer are replaced with "the employer workspace store", and the personal
repository the founding ask names as the home for private goals is called "the personal
repository".

Repository state at measurement: beads-ui worktree fast-forwarded to `origin/main` `0d07e7b`;
ai-harness read at `23ece1e92b6` (its `origin/main` had moved to `f71b675d986`, and
`git diff --stat 23ece1e92b6 origin/main` over every ai-harness file this leg cites printed
nothing); ai-core read at `f40fa2bd` (`git diff --stat HEAD origin/main -- src/ai_core/queue web
src/ai_core/main.py` printed nothing); app-portal read at `b73683e`, with `origin/main` at
`a1ddc13` differing only in `package.json`, `src/api.ts` and `src/shell.tsx` (5 lines), none of
which change a finding.

## 1. Listeners on the host

`ss -ltn`, ports below 30000 or above 45000, plus every non-loopback bind:

```text
0.0.0.0:22  [::]:22  127.0.0.1:3308  127.0.0.1:4222  127.0.0.1:5432  127.0.0.1:7777
127.0.0.1:8400  127.0.0.1:8443  127.0.0.1:9010  127.0.0.53%lo:53
non-loopback: 0.0.0.0:22, [::]:22 only
```

`ps -eo pid,etime,args` shows the Dolt server as
`dolt --data-dir ~/.beads/shared-server/dolt sql-server -H 127.0.0.1 -P 3308`, the ai-core API as
`uvicorn ai_core.main:app --host 127.0.0.1 --port 8400 --workers 2`, a NATS server, Postgres with
`ssl=on`, and `scripts/wq_tunnel.py run --idle-when-unneeded`. No `tailscale` process and no
app-portal shell process was running. A VS Code server ran with `--host=127.0.0.1`.

## 2. ai-core on loopback port 8400

`curl -s -m 5 -o <scratch> -w '<path> %{http_code} %{size_download}'`:

```text
/healthz 200 36
/ 404 22
/index.html 404 22
/api/queue/sessions 200 53570
/api/queue/tasks 000 0          (first attempt, timed out at 5 s)
/events 401 27
/api/apps 404 22
```

Re-run with `-m 60`:

```text
/api/queue/tasks   200 6780649   0.362832s
/api/queue/review  200 11406852  1.044286s
/api/queue/inbox   200 16841     0.038201s
/api/queue/tasks   200 6780649   0.265410s, 0.689732s, 0.521425s (three more runs)
```

`/` answering 404 means the queue dashboard SPA (`attach_queue_dashboard`, mounted only when
`QUEUE_WEB_DIST_DIR` is set) is not mounted on this host. `/events` answers 401 because that route
requires a bearer user; the `/api/queue/*` routes required none.

## 3. The queue's task projection, by repository

Parsed from the `/api/queue/tasks` body above (13,715 rows). Row keys:
`autonomous_eligible, blocked_by, display_id, exported_at, issue_type, labels, owner_session,
parent_id, priority, queue_state, repo, requires_approval, source_commit, status, task_id, title`.
Titles were not printed.

| Repository | Rows | Newest `exported_at` (UTC) |
|---|---|---|
| ai-harness | 7,338 | 2026-10-28T01:20:22Z |
| the employer workspace store | 2,241 | 2026-10-28T01:22:33Z |
| the personal repository | 2,092 | **2026-10-04T06:46:32Z** |
| ai-cli-utils | 741 | 2026-10-28T01:19:17Z |
| ai-core | 589 | 2026-10-28T01:19:48Z |
| aido | 492 | 2026-10-28T01:21:00Z |
| beads-ui | 134 | 2026-10-28T01:22:31Z |
| project-template | 55 | 2026-10-28T01:22:31Z |
| doc-editor | 20 | 2026-10-28T01:22:31Z |
| app-portal | 13 | 2026-10-28T01:22:31Z |

Status counts: closed 8,198; open 4,723; blocked 321; in_progress 254; deferred 219.

`test -d /data/projects/<the personal repository>` printed `absent`. The host's store inventory
(`~/.beads/shared-server/publish-sweep.json`, `run_at_utc` 2026-10-28T01:16:56Z) lists 9 stores
and no row for the personal repository. So 2,092 rows from a repository that is no longer on this
host were last ingested 24 days ago and are still served by the queue API here.

## 4. The shared Dolt server

All four commands were run as `time bd -C <repo> ...`, wall time from bash's `time`:

```text
bd version                                   -> bd version 1.3.2 (9b65b9e19)
bd -C beads-ui vc status --json              -> {"branch":"main","commit":"ccf5c0ac..."}  0.373 s
bd -C ai-harness vc status --json            -> {"branch":"main","commit":"c8l912kt..."}  0.369 s
bd -C ai-harness sql "SELECT DOLT_HASHOF_DB() AS h" --json                                 0.321 s
bd -C ai-harness sql "SHOW DATABASES" --json -> AIDO AIH AI_CLI BU CORE COS DED KG PORT TPL
                                                dolt information_schema mysql              0.395 s
bd -C ai-harness sql "SELECT @@AIH_head AS aih, @@BU_head AS bu, @@KG_head AS kg,
                      @@CORE_head AS core" --json                                          0.423 s
  -> aih c8l912kt..., bu ccf5c0ac..., core 5e5vqelh..., kg hs4dfl8q...
```

The one-query read of four heads returned the same commit hashes as the two per-store
`bd vc status` calls (`aih` and `bu` match), at the cost of one process.

`bd -C /data/projects/beads-ui config get events-journal` printed `false`;
`bd -C /data/projects/ai-harness config get events-journal` printed `false`.

## 5. bd 1.3.2 `serve` and `events` help, excerpts

`bd serve --help`, quoted:

```text
--auth-token-file turns it on: every operation except GET /healthz then requires an
"Authorization: Bearer <token>" header ... The file holds ONE TOKEN PER LINE and every line is
accepted. That is the rotation mechanism ... The file is re-read while the server runs
--allow-non-loopback REQUIRES a token file.
The DNS-rebinding check answers only to loopback spellings and the bind address ...
enumerate the names it dials with --allowed-host (repeatable).
No TLS. ... Hooks do not fire. ... An actor on an HTTP request is caller-asserted provenance
for the audit trail, not authenticated identity
It does not run under --readonly, and refuses to start rather than binding.
On a fixed port the second one fails to bind ... Concurrent serves are data-safe either way
```

`bd events --help`, quoted: "Raw DML run through 'bd sql' bypasses those paths and is NOT
journaled"; "the journal is per REPLICA. 'bd dolt pull' and the changes a merge settles into this
clone are not journaled ... A consumer that mirrors a synced workspace must re-baseline".

## 6. The beads-ui host refresher's snapshots

`ls -la ~/.local/state/beads-ui/` at 2026-10-27 21:25 local time: `counts.json` and
`counts-<token>.json` (5,192 bytes each, written 21:24), `lease.json`, `boards/`, `sessions/`,
`wake/`. `ls -la ~/.local/state/beads-ui/boards/<token>/`:

```text
1097119  _data_projects_ai-harness_.worktrees_aih-ec2-1.json
1097119  _data_projects_ai-harness_.worktrees_aih-ec2-2.json
1097119  _data_projects_ai-harness_.worktrees_aih-ec2-3.json
1097119  _data_projects_ai-harness_.worktrees_aih-ec2-4.json
1097139  _data_projects_ai-harness_.worktrees_aih-ec2-firstmate-1.json
 362549  <the employer workspace store>.json
```

Five snapshot files of about 1.1 MB each hold the same ai-harness store, one per session worktree
path.

## 7. Access configuration read from ai-harness (no live call)

- `config/message-transports.json` `pairs`: the work pair (acn-mac, sem-kg-ec2) has
  `"transport": "ssm-port-forward"`, `relay_port` 7777 and a `forwards` map with one extra entry
  (the agent-mail board, remote 8443, local 8443); the personal pair (fw-lnx, mac) has
  `"transport": "tailscale"`.
- `config/work_queue.toml` `[machines]`: `sem-kg-ec2 = "supervised"`, every other row
  `disabled`, including `fw-lnx`, `mac` and `acn-mac`.
- The fleet's machine profile for the personal laptop is `mac`; no file under `config/` contains
  `sw-mac`.
- ai-harness's VS Code remote-access procedure for this host records, for acn-mac on 2026-09-23,
  `ssh -o ExitOnForwardFailure=yes -L 127.0.0.1:52222:127.0.0.1:22 <alias> true` returning `rc=0`
  through the SSH-over-Session-Manager alias, with `ControlMaster auto` and `ControlPersist 10m`.
- `wc -l ~/.ssh/authorized_keys` printed 3 (keys not read).

## Scratch

Response bodies were written to a private `mktemp -d` directory during the probes and deleted
after the counts above were taken. <!-- gitignored-path-ok: names deleted scratch, cites nothing -->
