---
title: "Evidence: host and history probes behind the event-dispatch findings"
category: research
tags: [research, evidence, beads-ui, dispatch]
status: complete
source: "claude-opus-5-5-2026-10-27"
task: BU-mg2.5.2.1
display_id: BU-agent-research-event-xjpz
template_version: "research-findings-1.0.0"
---

# Evidence: host and history probes behind the event-dispatch findings

Measured on host-c between 2026-10-27T23:58Z and 2026-10-28T00:06Z by the research leg
BU-agent-research-event-xjpz. Every command was read-only. Outputs are bounded and carry no
secrets, mail bodies or personal content. The ai-harness checkout was at
`23ece1e92b6409eac80155d61f386c35df4e4816`, equal to `origin/main` at the time
(`git rev-parse origin/main HEAD` printed that SHA twice).

## 1. Which idle-wake phases are on ai-harness main

Command, run in the ai-harness worktree:
`git log origin/main --format='%h %cI %s' -i --grep 'idle-wake\|idle wake\|sync owner\|view dedupe\|snapshot protocol\|admission'`
plus `--grep 'install.*owner\|harness-sync.*owner\|interim'`. Relevant rows, verbatim:

```text
a452401e054 2026-10-27T19:26:41-04:00 fix(agent-mail): quiet, withdraw and expire mail to gone addressees (#6168)
50315a68c56 2026-10-27T15:59:44-04:00 feat(idle-wake): passive recovery, action closure and per-source counters (design phase 3) (#6162)
4924c8fc4cd 2026-10-27T15:15:21-04:00 feat(idle-wake): per-session snapshots and shared hook dedupe (design phase 2) (#6110)
6b17692dbdb 2026-10-25T02:00:16-04:00 feat(idle-wake): typed admission and durable obligations (design phase 1) (#6095)
0f7064df8b4 2026-10-25T01:09:03-04:00 Route the harness-sync wake to one installation owner (#6086)
9e86bbda503 2026-10-24T23:57:39-04:00 fix(agent-mail): stop re-delivering an unchanged notice view across changes to the global notice id (#6071)
802f762104a 2026-10-24T22:13:43-04:00 fix(hooks): disable automatic session-notice wakes by default (#6052)
3904eed0d2c 2026-10-24T21:19:13-04:00 docs(design): event-driven admission for idle session wakes (#6032)
```

`git branch -r --list 'origin/wt/ops-lab-1/*'` listed, among others, `idle-wake-design`,
`interim-i1-sync-owner`, `interim-i2-view-dedupe`, `phase1-admission`, `phase2-snapshots`,
`phase2-snapshots-final`, `phase2-fixes`, `phase3-recovery` and `wake-cost-measure`. No
`phase4` or `phase5` branch existed.

## 2. Beads status lines (read-only)

`bd show` on the event-driven idle wake epic, its children, verbatim status glyphs and titles:

```text
✓ child 2: Design the event-driven idle wake (design doc, Codex sol decisions) P1
◐ child 3: Implement the event-driven idle wake (Codex sol implement plus impl-audit) P1
◐ child 6: Phase 2 impl-audit of the idle-wake snapshots (Codex gpt-6.1-sol read-only review) P2
◐ child 9: Implement idle-wake Phase 4: lifecycle coexistence, config seeding and call-time gates (Codex sol) P2
✓ related: Interim kill switch: stop automatic session-notice wakes until the event-driven idle wake lands P0
✓ child 7: Fix the four Phase 2 review findings (Codex gpt-6.1-sol implement) P2
✓ child 1: Measure idle-wake cost and cause from real session transcripts (Codex sol research) P1
✓ child 8: Fix the eight Phase 3 review findings (Codex gpt-6.1-sol implement) P2
✓ child 4: Interim cut of no-op wake cost before the full design lands (Codex sol bug-fix) P1
◐ 6/10 complete (60%)
```

The epic's newest note (2026-10-27) says Phases 1 to 3 are merged and installed on host-b and that
"Automatic wakes remain off (no idle-wake.json)".

`bd show` on the work-queue epic: `[EPIC] ... [P1 · BLOCKED]`, assignee
`ops-vm-3`. `bd show` on its dashboard issue: `[P2 · OPEN]`, "work-queue Phase 2:
dashboard member app -- ai-core web/ SPA (Board, Task detail, Sessions) + SSE + app-portal apps.yaml
registration". The epic's notes from early October name the Phase 2 prerequisites as absent on
this host (no queue services and no Tailscale); section 4 below shows that has moved.

## 3. The live idle-wake policy file on this host

```text
$ ls -la ~/.config/ai-harness/idle-wake.json
ls: cannot access '/home/ubuntu/.config/ai-harness/idle-wake.json': No such file or directory
```

`idle_wake.load_policy()` returns `Policy(reason="policy-unavailable")` on `OSError`, whose
`automatic_wakes` defaults to `False` (ai-harness `src/ai_harness/idle_wake.py:56-63`, `:86-99`).

## 4. Local listeners and processes

Read with `ss -ltnp` and `ps -eo pid,etime,args`. The ai-core queue API, Postgres, NATS and the
Agent Mail edge were running on this host; exact ports, bind addresses and command lines are
omitted from this public file. No `queue_waker` process was running and
`systemctl --user list-units --all` held no queue-waker unit; `ai-harness-goal-waker.timer` was
`active waiting`, and `systemctl --user is-active ai-harness-agent-mail-notifier.service` printed
`active`.

## 5. The ai-core queue API on this host

The queue API's OpenAPI document, read on the host's loopback, lists the session, prompt
(`/api/queue/prompts` with `ack` and `consumed`), claim, lease, gate-resolve, events, projection,
tasks, review and inbox routes. One read-only sessions request was issued; no prompt was queued,
acknowledged or consumed. A data-scope issue in the ai-core queue on the work host is tracked
privately and constrains the backend design: the web app puts its own auth and a per-host
repository allowlist in front of the queue.

## 6. Tool availability during the run

The host's web-search MCP tool did not load in this session: `ToolSearch` for it returned
`No matching deferred tools found`. External sources were therefore fetched directly with WebFetch
from known primary URLs.

## Scratch

Two response bodies were written to `/tmp/bu-xjpz-openapi.json` and `/tmp/bu-xjpz-sessions.json`
during the probe and deleted after the counts above were taken. <!-- gitignored-path-ok: names deleted scratch, cites nothing -->
