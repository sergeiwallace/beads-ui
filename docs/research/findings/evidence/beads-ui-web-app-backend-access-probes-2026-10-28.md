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

Measured on the employer-provisioned EC2 host (fleet name host-c) between 2026-10-28T01:16Z and
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

Read with `ss -ltn` and `ps -eo pid,etime,args`. Every service the findings name (the ai-core API,
Postgres, NATS, the Agent Mail edge and the shared Dolt server) listens on loopback only, and no
Tailscale or app-portal shell process runs on this host. Exact ports and command lines are omitted
from this public file.

## 2. ai-core queue API on loopback

Read-only HTTP GETs on the host's loopback. The health, sessions, tasks, review and inbox routes
answered 200; the tasks route returned the full task projection in 0.27 to 1.04 s over five runs.
The API's root route answered 404 because the queue dashboard bundle is not mounted on this host.

## 3. The queue's task projection

Parsed from the tasks route above; titles were not printed. Row keys:
`autonomous_eligible, blocked_by, display_id, exported_at, issue_type, labels, owner_session,
parent_id, priority, queue_state, repo, requires_approval, source_commit, status, task_id, title`.

A data-scope issue in the ai-core queue on the work host is tracked privately and constrains the
backend design: the web app's backend must filter by a per-host repository allowlist (findings
section 7). Per-repository counts are omitted from this public file.

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
1097119  _data_projects_ai-harness_.worktrees_ops-vm-1.json
1097119  _data_projects_ai-harness_.worktrees_ops-vm-2.json
1097119  _data_projects_ai-harness_.worktrees_ops-vm-3.json
1097119  _data_projects_ai-harness_.worktrees_ops-vm-4.json
1097139  _data_projects_ai-harness_.worktrees_ops-vm-firstmate-1.json
 362549  <the employer workspace store>.json
```

Five snapshot files of about 1.1 MB each hold the same ai-harness store, one per session worktree
path.

## 7. Access configuration read from ai-harness (no live call)

- `config/message-transports.json` `pairs`: the work pair (host-a, host-c) has
  `"transport": "ssm-port-forward"`, a relay port and a `forwards` map with one extra entry
  (the agent-mail board); the personal pair (host-b, mac) has
  `"transport": "tailscale"`.
- `config/work_queue.toml` `[machines]`: `host-c = "supervised"`, every other row
  `disabled`, including `host-b`, `mac` and `host-a`.
- The fleet's machine profile for the personal laptop is `mac`; no file under `config/` contains
  `host-f`.
- ai-harness's VS Code remote-access procedure for this host records, for host-a on 2026-09-23,
  an SSH local forward over the existing Session Manager alias returning `rc=0` (command line omitted from this public file)
  through the SSH-over-Session-Manager alias, with `ControlMaster auto` and `ControlPersist 10m`.

## Scratch

Response bodies were written to a private `mktemp -d` directory during the probes and deleted
after the counts above were taken. <!-- gitignored-path-ok: names deleted scratch, cites nothing -->
