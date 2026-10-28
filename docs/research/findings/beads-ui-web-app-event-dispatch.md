---
title: "beads-ui web app research leg 2: event-driven dispatch of per-task prompts to the owning Claude Code session"
category: research
tags: [research, findings, beads-ui, web-app, dispatch, idle-wake, agent-mail, prompt-injection, handoff, start-goal]
status: complete
source: "claude-opus-5-5-2026-10-27"
task: BU-mg2.5.2.1
display_id: BU-agent-research-event-xjpz
template_version: "research-findings-1.0.0"
---

# Event-driven dispatch from the beads-ui web app to the owning session

This packet answers one question for the coordinator. A prompt, decision answer, unblock or
guidance entered on a task in the web app must reach the Claude Code session that owns the task
and start its work, by event only. It also covers how an owner change runs `/handoff` and how a
session with no goal gets `/start-goal`, on the same path.

Repo state was measured on 2026-10-27 and 2026-10-28 UTC. ai-harness was read at
`23ece1e92b6` (equal to `origin/main` then). beads-ui was read at `c5f6e57`. Host probes are in
the tracked evidence file
[`evidence/beads-ui-web-app-event-dispatch-host-probe.md`](evidence/beads-ui-web-app-event-dispatch-host-probe.md).

## Summary

1. The fleet already has an event-driven admission system for idle wakes, and the web app should
   enter it as one more typed event source. The notifier daemon polls outside the model, classifies
   typed events, and an async `FileChanged` hook exits 2 to create a model turn only for an admitted
   event. Phases 1 to 3 of that design are on ai-harness main; Phases 4 and 5 are not. Rationale:
   design doc and commit history read directly. [VERIFIABLE][^1][^2]
2. Every automatic idle wake is currently switched off on this host. The live policy file
   `~/.config/ai-harness/idle-wake.json` does not exist, which reads as `automatic_wakes = false`, and
   since Phase 3 the git-inbox prompt-injection wake checks the same switch. Until the switch is on,
   a dispatch reaches a session only at its next natural turn boundary. Rationale: file probe plus
   the loader and the delivery code. [VERIFIABLE][^2][^3][^4]
3. Recommended primary route: the web app writes a durable dispatch record, then sends addressed
   Agent Mail to `<session>@<host>`. The target host's notifier admits it as addressed mail, which
   wakes an idle session through the hook and shows a header at the next tool call of a busy one.
   Agent Mail is the fleet's primary cross-machine rung, so the same send covers acn-mac and sw-mac.
   Rationale: the admission matrix and the ladder order, cited under Q1 and Q2. [INFERENCE]
4. Recommended fallbacks, in order: the shared prompt-injection library's one-line pointer when no
   shown receipt arrives within a bound; the beads-ui mod's `$.prompt.submit` when the mod is loaded
   in the target session; the work queue's `Stop`-hook pull at the next turn end. All honour one kill
   switch. Git-inbox and Buzz are cross-host carriers behind Agent Mail. [INFERENCE]
5. Every route costs zero model tokens while nothing is pending, provided the waiting runs in a
   daemon, a hook watcher or a mod timer. Each delivery costs one model turn over the session's
   cached context, which the wake-cost measurement put at a median 365,551 cache-read tokens per
   response window. Coalescing several dispatches to one session into one turn is the main cost
   lever for bulk review. [VERIFIABLE][^1][^21]
6. An owner edit must not reassign an in-progress claim directly. `bd` refuses another session's
   reassignment without `--force`, and `/handoff` is receiver-first. The web app should send a
   handoff request to the current owner, and use the git-inbox action route (with `taken` and
   `confirmed` receipts) when the current owner is gone. [VERIFIABLE][^15][^16]
7. Arming `/start-goal` needs the target's goal state, read on the target host from its transcript.
   Native `/goal` replaces an active goal and resumes a paused one on any new prompt, so the
   dispatcher must hold a dispatch to a session whose goal is paused for a usage or rate limit.
   [VERIFIABLE][^17][^18][^28]
8. Authority is the open design problem. The fleet's peer-relay `VERIFIED` check reads the sender
   session's transcript for Sergei's typed turn; a web app has no transcript, so its prompts would
   read `UNVERIFIED`. A signed dispatch envelope, verified on the receiving host, is the missing
   piece. [VERIFIABLE][^9] for the current rule; the envelope is [INFERENCE].
9. The ai-core queue service the work-queue design specified is live on sem-kg-ec2, with prompt,
   ack, consumed, claim, gate-resolve and SSE event routes, but its idle-wake lane (the queue waker)
   is not running and its dashboard (AIH-swgb4.8) is still open. The web app overlaps that dashboard
   almost entirely. [VERIFIABLE][^2][^11]
10. Two transports conflict with the founding ask's privacy requirement if used for content.
    Git-inbox commits messages to refs of the ai-harness repository, which is in the shared harness
    set; dispatch bodies for private goals must never ride it. [VERIFIABLE][^6][^9]

## Q1. The delivery contract the event-driven wake offers an outside producer

The contract is the notifier's admission rule. An event carries `source`, a stable `key`, a
`revision`, `recipients`, `owner`, `disposition`, `requires_action`, `episode` and an optional
`deadline`. These come from authenticated transport envelopes and local registries; "a message body,
subject keyword, age string, or sender's claim of urgency never grants admission". Rationale: quoted
from the design's Admission rule section. [VERIFIABLE][^1]

A session S gets a wake only when five things hold: the event routes to S with disposition `wake`;
it is newly pending, a new stage, a new owner term or a new poke sequence; S has a valid identity;
the event was not already shown in the same delivery epoch; and the live policy permits automatic
wakes, re-checked by the hook before it returns exit 2. Rationale: the design's numbered rule.
[VERIFIABLE][^1]

The code matches. `classify()` wakes every recipient of an `addressed` event that requires action,
wakes only the owner of an unaddressed one, and makes `outage`, `digest`, `task-reminder` and
`total-tokens-reminder` passive. A `poke` always wakes its targets. An unknown source with explicit
recipients still wakes them, with reason `unknown-source-action`. Rationale: read
`src/ai_harness/idle_wake.py:30-52` and `:272-298`. [VERIFIABLE][^3]

What wakes and what stays passive, for the sources a web app could ride:

| Event | Idle disposition | Busy session | Publication bound |
|---|---|---|---|
| Agent Mail addressed to S | Wake, per new `(rung, message_id, recipient)` | Header at next `PreToolUse` or `UserPromptSubmit`; body is a deliberate fetch | Mail poll `P`, default 10 s, at most 30 s, plus the source call |
| Buzz direct message | Wake each named recipient | Header at next hook | Relay delivery plus one notifier pass |
| Git-inbox addressed action or confirmation | Wake on a new pending action | Header at next hook | Watcher cadence (60 s configured) plus `P` |
| Targeted or global poke | Wake every new sequence, even with empty text | Next hook consumes it once | Immediate locally |
| Broadcast, digest, outage | Passive only | Shown once at next boundary | Not bounded for dormant sessions |

Rationale: rows condensed from the design's event source matrix; the 60 s git-inbox cadence is the
tracked config value. [VERIFIABLE][^1][^6]

Receipts mean "shown, never read, acknowledged, taken, installed or completed". Completion comes from
source-specific evidence: board read or ack, git-inbox take or confirm, a stamp. A claim with no
shown receipt after 300 seconds becomes a delivery failure eligible for one bounded recovery.
Rationale: quoted from the admission rule and the claims section. [VERIFIABLE][^1]

Dedupe identity is per session: `(session, context-epoch, event-revision)`, claimed with noclobber
before output. A compaction opens a new context epoch, so outstanding work is shown once again after
it. Exactly-once model consumption is explicitly not provable; the protocol bounds the uncertain case
instead. Rationale: the design's "Delivery identities, claims and races" section. [VERIFIABLE][^1]

The kill switch is the installed JSON file read at every hook call. An absent, unreadable or
malformed file means off, and the notice stays pending for natural delivery. Rationale: design
§ Rollout plus `load_policy()`. [VERIFIABLE][^1][^3]

Built versus designed, measured against main and the Beads epic:

| Part | State on main | Evidence |
|---|---|---|
| Interim kill switch (wakes off by default) | Built | `802f762104a` (#6052) |
| I-1 one installation owner | Built | `0f7064df8b4` (#6086) |
| I-2 local-view dedupe | Built | `9e86bbda503` (#6071) |
| Phase 1 typed admission and obligations | Built | `6b17692dbdb` (#6095) |
| Phase 2 per-session snapshots, shared hook dedupe | Built | `4924c8fc4cd` (#6110) |
| Phase 3 recovery, action closure, counters | Built | `50315a68c56` (#6162) |
| Gone-addressee quieting and expiry | Built | `a452401e054` (#6168) |
| Phase 4 lifecycle coexistence, config seeding, call-time gates | Designed; AIH-p811n7.9 in progress, no branch | Beads child list |
| Phase 5 Windows notifier supervision | Designed | No branch |
| `idle-wake.json` on any host | Not seeded; absent here; epic note says absent on fw-lnx | File probe, epic note |

Rationale: commit list, remote branch list and Beads children recorded in the evidence file.
[VERIFIABLE][^2]

A producer outside the harness does not get its own API from this design. It can produce events only
through the existing transports (Agent Mail, Buzz, git-inbox) or a local poke. The poke carries no
payload: `poke --session x` re-opens x's claims and changes `sessions/x.poke.txt`, and an unknown
slug writes nothing and exits 2. It runs only on the host whose state directory holds the session.
Rationale: read `Notifier.poke` at `src/ai_harness/agent_mail_notifier.py:6952-6994`.
[VERIFIABLE][^5]

## Q2. The candidate routes

Each route below is judged on mechanism, idle token cost, latency, cross-host reach, failure modes and
build state.

### (a) Agent Mail direct message to the owning session

The web app's server sends mail to `<session>@<host>`. The target host's notifier fetches it on its
poll, admits it as addressed mail, and the rewake hook exits 2 for an idle session. The model sees a
sanitized one-line header; the body stays a deliberate fetch with `agent-mail-notifier read <id>`.
Rationale: admission matrix row 1 and the ladder's note on `read`. [VERIFIABLE][^1][^9]

Idle cost is zero: polling runs in the daemon. Latency is the poll interval, 10 s by default, plus
the hook and model start. Agent Mail is the primary cross-machine rung by Sergei's 2026-10-11 ruling,
with Buzz behind it. Rationale: ladder section "Agent Mail leads until Buzz reaches parity".
[VERIFIABLE][^9]

Failure modes: the automatic-wake switch is off today; a session started before its MCP
registration lacks the adapter until restart; resolving a rung is not delivery evidence. Built:
send, admission, rewake hook, receipts. Not on: the policy file. [VERIFIABLE][^1][^2][^9]

### (b) Explicit poke

A poke wakes a session for every new sequence and needs no mail. It is local to the host and carries
no text, so it can only re-surface something already in the session's view. It fits as the
same-host "deliver now" nudge after a dispatch record exists in a store the session reads.
Rationale: poke docstring and the poke row of the matrix. [VERIFIABLE][^1][^5]

### (c) Hook context injection at `UserPromptSubmit` and `PreToolUse`

`additionalContext` from these hooks is "wrapped in a system reminder" and read on the next model
request; `UserPromptSubmit` injects it alongside the prompt and cannot replace the prompt. Neither
hook creates a turn. `asyncRewake` "runs in the background and wakes Claude on exit code 2", showing
the hook's stderr or stdout to Claude as a system reminder. Rationale: fetched hooks reference.
[VERIFIABLE][^24]

So hook injection is two things in this design. The passive leg rides a busy session's next tool
call. The wake leg is `FileChanged` plus `asyncRewake`, which is how route (a) wakes an idle session.
The realtime-awareness design recorded live tests that exit 2 creates an idle turn, and that generic
MCP notifications do not reach the model. Rationale: p811n7 "Claude Code primitives" paragraph
citing the earlier tests. [VERIFIABLE][^1]

### (d) The shared prompt-injection library (AIH-59eza)

The library types into a live tmux pane behind a fingerprint fence, presses Enter separately, and
proves landing from the transcript. It is "the only transport that can submit a slash command into
an open interactive session". It refuses a non-empty composer, a pane in copy mode, a modal and the
save-state-to-compact boundary. Rationale: library design executive summary, readiness and
boundary-hold sections. [VERIFIABLE][^8]

It can deliver into an idle session; that is what its nudge injectors do. It is already the git-inbox
prompt layer: `delivery = ["hook", "prompt"]` with `prompt_enabled = true`, the `inbox-nudge` use
case on, a one-line pointer capped at 400 characters, and the body sent as hook context. Rationale:
tracked config and the library's consumer table. [VERIFIABLE][^6][^8]

Its rule for content from outside the host binds this web app: "the typed line is harness-authored
and bounded, never the foreign text (the body goes through the hook-context channel...)". Rationale:
quoted from the library's consumer guarantees. [VERIFIABLE][^8]

Since Phase 3 the git-inbox prompt layer passes `submission_gate=lambda:
idle_wake.load_policy().automatic_wakes`, so it is off wherever the policy file is absent. It also
needs a quiet-transcript idle proof before typing. Rationale: read
`src/ai_harness/git_inbox_delivery.py:206-223`. [VERIFIABLE][^4]

Reach is same-host only: it needs the target's tmux server. Idle cost is zero (it runs when called).
Latency is a few seconds of readiness sampling plus a 5 s landing timeout. [VERIFIABLE][^8]

### (e) The beads-ui mod's `$.prompt.submit`

A mod's `$.clock.every` timer "runs outside any event, so it keeps running between turns and doesn't
start one". `$.prompt.submit({ text })` "waits until the session is idle and then starts a new turn",
and Claude reads the text after a sentence naming the mod as sender. A refused or dropped submit
resolves with a `drop` reason and is retried from `turn.complete`. Rationale: fetched mods API page.
[VERIFIABLE][^21]

So a mod can be a zero-token event receiver: a timer reads a local spool (`$.fs.read`, or the
machine-shared `$.store`) or the local queue API (`$.http.fetch`) and submits. No keystrokes, no
composer race, no tmux dependency. Rationale: the API methods and `$.store` "every session on the
machine shares". [VERIFIABLE][^21][^22]

beads-ui already uses this path for two things: a failed publish of a pane edit (D-33) and a held
answer typed in the pane (D-39), each with a fixed template and the foreign text fenced. Rationale:
read D-33 and D-39 "As built". [VERIFIABLE][^14]

Limits: it works only in sessions where the mod is loaded; it reaches one host; it does not run
slash commands (`$.command.run` exists, but whether it runs a user skill is not stated in the pages
fetched). [VERIFIABLE][^22] for the method list; skill execution [NO SOURCE].

### (f) The work queue's claim, lease and pull API

The queue design delivers on two lanes. Lane A: the `Stop` hook calls `GET /api/queue/next` and
returns `{"decision":"block","reason":"<prompt text>"}`, so a session is never interrupted mid-turn.
Lane B: the service publishes `queue.prompt.queued` on NATS and a per-machine `queue-waker` types the
literal `/wq next`. Delivery is at-least-once with a per-prompt id ledger; receipts move `queued`,
`delivered`, `acknowledged`, then `consumed`, `expired` or `cancelled`. Rationale: design § Event
delivery. [VERIFIABLE][^11]

On this host the API is live on `127.0.0.1:8400` with `/api/queue/prompts`, `/ack`, `/consumed`,
`/claim`, `/gates/{repo}/{task_id}/resolve` and `/events`; 88 sessions are registered. The `wq-*`
hooks are wired for all machines. No `queue_waker` process or unit is running, so Lane B is absent
here. Rationale: OpenAPI read, process list and manifest. [VERIFIABLE][^2][^13]

The waker's own contract matches the library rule: "The only text ever injected is the literal
`/wq next`... the prompt BODY always travels over the API". Rationale: read
`scripts/queue_waker.py` docstring. [VERIFIABLE][^12]

Lane A costs nothing extra: it fires at a turn end that is happening anyway. It is not idle-capable.
[VERIFIABLE][^11]

### (g) Claude Code native primitives

Cross-session messaging: a message to an idle session "starts a new turn"; outcomes are Delivered,
Held or Refused. A script can post to a session's inbox socket (`CLAUDE_CODE_MESSAGING_SOCKET`), but
the docs document only the optional auth line; the message line format is undocumented. Commands in a message never run.
A bypass-permissions receiver holds a message from a sender that asserts no permission class.
Rationale: fetched cross-session messaging page. [VERIFIABLE][^23]

Cross-machine native messaging rides Remote Control, which "requires a claude.ai subscription";
Bedrock is excluded. So it is unavailable on the employer-hosted EC2 machine and possible only on the
personal pair. [VERIFIABLE][^23][^27]

Channels push MCP notifications into a running session and are delivered "together on the next turn"
when busy, but they are a research preview, need `--channels` or a development flag at launch, are
"not available on Amazon Bedrock", and give no acknowledgement. [VERIFIABLE][^25][^26]

`claude -p --continue` "opens a background session that has finished, but not one that is still
running", so headless resume is no route into a live pane. [VERIFIABLE][^29]

### Comparison

| Route | Idle tokens | Starts a turn when idle | Cross-host | Runs slash command | Built and on here |
|---|---|---|---|---|---|
| (a) Agent Mail + rewake hook | 0 | Yes, when the switch is on | Yes | No | Built; switch off |
| (b) Poke | 0 | Yes | No | No | Built; switch off |
| (c) Passive hook context | 0 | No | n/a | No | Built |
| (d) Injection library pointer | 0 | Yes | No | Yes | Built; switch off for git-inbox |
| (e) Mod `$.prompt.submit` | 0 | Yes | No | No (unverified) | Built for D-33/D-39 only |
| (f) Queue Lane A / Lane B | 0 | Lane B only | Queue host only today; joins disabled | Lane B types `/wq next` | Lane A wired; Lane B not running |
| (g) Native socket | 0 | Yes | Personal pair only via Remote Control | No | Line format undocumented |
| (g) Channels | 0 | Yes | Local server only | No | Unavailable on Bedrock |

Rationale: synthesis of the sections above. [INFERENCE]

## Q3. Cross-host reach

The two pairs are separate. `config/message-transports.json` names a work pair of acn-mac and
sem-kg-ec2, relayed on sem-kg-ec2 through a cloud session-manager port forward (relay port 7777,
board port 8443), and a personal pair of fw-lnx and mac relayed over Tailscale. Rationale: read the
`pairs` block. [VERIFIABLE][^10]

Agent Mail authenticates with per-machine client certificates the installer writes; a session's board
identity is `<AI_HOST>--<session title>`. Buzz is a relay speaking signed events with NIP-42 client
authentication. Git-inbox rides git push access to the shared private repository, and "does not
authenticate its sender field". Rationale: ladder text, `buzz_channel.py` constants and the
git-inbox config comment. [VERIFIABLE][^6][^9]

Launch and restart requests travel as signed Buzz events, encrypted to the target daemon, even when
git-inbox carries them; the receiver checks the signature and never trusts the git-inbox sender
field. Launch and restart stay within a pair; git-inbox wake senders cross pairs. Rationale: wake
sidecar design, "What Phases 3 to 7 built" and pair scope. [VERIFIABLE][^7]

For the web app this means: a server on sem-kg-ec2 reaches acn-mac sessions by Agent Mail (primary)
or Buzz, both pair-local; a server on fw-lnx reaches sw-mac sessions the same way over Tailscale.
Git-inbox is the only carrier that crosses pairs, and it must carry pointers only (Gaps, item 2).
[INFERENCE]

Delivery on the far host is always local. The target host's notifier admits the event and its own
hook, library or mod delivers it; the web app never types into a remote pane. Rationale: the
sidecar's rule "Each host runs its own sidecar and serves only the sessions on that host".
[VERIFIABLE][^7]

The queue API reaches the work pair's other machine only by a forward that machine opens itself.
`scripts/wq_tunnel.py` keeps a joining machine's cloud session-manager port forwards alive, "client
to instance, one direction", because the queue host has zero inbound rules. On the host it is inert.
Its docstring says "every committed `[machines]` row is `disabled`" and the live joining wiring "is
unverified". So acn-mac sessions cannot reach the queue today. Rationale: module docstring; the
process seen on sem-kg-ec2 is the host's inert copy. [VERIFIABLE][^2][^32]

## Q4. Owner change and the automatic /handoff

`/handoff` is receiver-first. The sender reassigns a live claim, publishes the store, sends the
rendered message over the resolved rung, keeps its rows, and deletes them only after `verify` exits
0. The receiver assigns itself, sets `in_progress`, publishes, mirrors rows and replies "taken".
Rationale: read the skill. [VERIFIABLE][^16]

Two rules shape a web-app owner edit. First, `bd` refuses another session's reassignment of an
in-progress claim: "cannot reassign AIH-d16q1: held by "aih-acn-1" (in_progress) ... pass --force
only if their claim is abandoned". Second, fleet work goes only to `aih-*` and `ai-cli-*` sessions,
never a `kg-*` one. Rationale: quoted from the handoff procedure. [VERIFIABLE][^15]

The git-inbox route already automates the receiver side with receipts. `git-inbox send --action
<display-id>@<repo>` refuses an action that is missing, unpublished, assigned or not open; the
receiver runs `/git-inbox-take`, which "creates the receiver's CC rows and arms a goal", and the
sender runs `git-inbox confirm`. Rationale: procedure § The git-inbox route. [VERIFIABLE][^15]

Recommended flow, by the current owner's liveness:

| Current owner | What the web app does | Completion evidence |
|---|---|---|
| Live | Dispatch kind `handoff-request` to the current owner: "Sergei reassigned X to Y@host; run `/handoff --to Y@host X`" | `handoff.py verify` exit 0; bd assignee is Y |
| Positively gone, task in progress | Record Sergei's explicit reassignment as a bd comment, clear the claim with `--force` (an abandoned claim, by Sergei's act), then send a git-inbox action to Y | Git-inbox `taken` then `confirmed` receipts |
| Unknown liveness | Treat as live and send the request; never `--force` on unknown | As for live |
| No owner, task open | Git-inbox action to Y directly | `taken`, `confirmed` |

Rationale: maps the documented protocol onto the edit. Unknown is not gone, as p811n7 and the
notifier treat it. [INFERENCE]

If the new owner is not live, the wake sidecar can launch it from a message: a signed
`KIND_LAUNCH_REQUEST` inside a git-inbox message, one recorded launch attempt, and delivery once the
session is live, within the 7-day `pending_ttl_s`. That launch is pair-local. Otherwise the dispatch
stays pending and the UI says so. Rationale: sidecar Phase 3 and the git-inbox TTL.
[VERIFIABLE][^6][^7]

The receiver's routing rule should be enforced by the web app's owner picker, which should offer only
sessions the fleet allows for that repository. [INFERENCE]

## Q5. Goal state and /start-goal

The fleet reads goal state from the transcript. The library exposes `goal_state(target)` returning
`active`, `inactive` or `unknown`; the queue client's `goal_state_for_transcript()` is a tri-state
with `UNDETERMINED` on a torn record. The goal waker adds terminal phrases and `/exit-goal` records
to its "ended" test. Rationale: library execution-oracle section and goal-waker D-4.
[VERIFIABLE][^8][^18]

`/start-goal` refuses while the target holds an active native goal ("report `goal-active`"), and
re-arms only a session with unblocked in-progress work. Rationale: start-goal skill boundaries.
[VERIFIABLE][^17]

Native `/goal` behaviour matters here. "If a goal is already active, the new one replaces it."
After a rate limit or usage limit, "a notice starting with `Goal paused` names the cause", and "Send
a message at any time to start the next turn immediately." Rationale: fetched `/goal` page.
[VERIFIABLE][^28]

The goal waker already detects that notice: `notice_fields(transcript)` and a `Goal paused` prefix
check, used to tell a save-state nudge to keep the goal paused. The library's `goal_state` does not
classify paused separately. Rationale: read `src/ai_harness/goal_waker.py:2205`, `:2380`, `:2725`;
grep of `prompt_injection/` for paused found nothing. [VERIFIABLE][^18]

Recommended decision on the target host, at dispatch time:

| Goal state | Dispatch | Arm `/start-goal` |
|---|---|---|
| Active | Deliver the prompt; it becomes guidance for the running goal | No |
| Paused (`Goal paused` notice) | Hold the dispatch and show "held: goal paused (cause)"; deliver only if Sergei presses "resume anyway" | No |
| Inactive or ended | Deliver the prompt | Yes, when the dispatch asks for it and the task is unblocked in-progress work |
| Undetermined | Deliver the prompt | No; the UI shows "goal state unknown" |
| Human gate (pending question or permission dialog) | Library refuses `not-ready`; keep queued | No |

Rationale: combines the native semantics with the fleet guards. [INFERENCE]

Arming has two workable shapes. The session can run `/start-goal` itself, as the delivered template
asks (the skill is model-invocable and supports a self target that returns `QUEUED` then `verify`).
Or the host-side receiver runs `start_goal.py --target session:<slug>` after the prompt lands, which
types the `/goal` through the library. The second costs no extra model reasoning but types into a
pane right after a turn started. Rationale: skill usage block and the library's self-target flow.
[VERIFIABLE][^8][^17]

## Q6. Answers to held decisions and blockers

Held items have a strict lifecycle. `held_cli.py answer <path> --text-file <f>` writes the answer
verbatim under `## Answer`, "commits in the owning session's landing pad, refuses an item that is not
open and refuses a pad with any uncommitted change". The owning session then records the answer in
its durable home, ships, and retires the item. An answered item not yet acted on "is a prod
condition for the chief". Rationale: held README lifecycle and beads-ui D-39 context.
[VERIFIABLE][^14][^19]

The landing pad is on the owning session's host. A web app on sem-kg-ec2 cannot run `answer` for an
item held on acn-mac. Recommendation: the dispatch carries the answer bytes as an attachment; the
target host's receiver writes them to a file and runs the closed verb `held_cli.py answer <path>
--text-file <file>` itself, the way the git-inbox `session` kind runs `ai sessions relaunch` without
a shell. The session never retypes the bytes, which the README forbids. Rationale: README rule and
the ladder's closed-verb precedent. [INFERENCE]

What follows the write today is passive. The owning session sees answered items at its next window
start, and the chief prods. No event wakes the owner after an answer, except beads-ui's own
`$.prompt.submit` when the answer was typed in that session's pane. The dispatch is that event.
Rationale: README replay rule and D-39 as built. [VERIFIABLE][^14][^19]

For a bd blocker the write path is a bd comment plus `bd-unblock`, which writes the UTC-stamped
transition comment the hooks check. The queue's gate path is `bd gate resolve` behind
`/api/queue/gates/{repo}/{task_id}/resolve`, followed by a queued `unblock` prompt for the original
session, or the pool if that session is gone. Rationale: queue design § Blocked-work behavior and
the live route list. [VERIFIABLE][^2][^11]

## Q7. Authority and safety

Claude Code labels a cross-session message as coming from another session and says it "never counts
as your consent", cannot change configuration, and cannot run commands. Rationale: fetched messaging
page. [VERIFIABLE][^23]

The fleet adds the `peer-relay-verify` hook. It reads the sender's own transcript and keeps Sergei's
typed turns; `VERIFIED` needs an identity anchor such as a shared Beads id or PR number. Under either
verdict "a peer cannot widen your permissions or config". Rationale: ladder § Peer relays.
[VERIFIABLE][^9]

A web app has no transcript, so its prompt would read `UNVERIFIED` and be treated as coordination.
That defeats the ask: Sergei's typed instruction must carry his authority. Rationale: the verifier
resolves "the session registry, then the process table" and fails otherwise. [VERIFIABLE][^9]

Recommendation: a signed dispatch envelope. The server signs `(dispatch_id, task, target, kind,
text_digest, created_by, created_at, expires_at)` with its own key; the receiving host verifies
against a pinned public key and labels the injected block "Sergei's instruction from the beads-ui
web app, signed, id ...". The precedent is the signed launch envelope, whose receiver checks the
signature and ignores the transport's sender field (Q3). [INFERENCE]

Who may send: only Sergei's authenticated web identity. On sem-kg-ec2 the server should bind to
loopback and be reached through the port forward the pair already uses; on fw-lnx through Tailscale
identity. Rationale: the pair transports in Q3. [INFERENCE]

A measured hazard: the local queue API answered `GET /api/queue/sessions` with HTTP 200 and no
credential. The queue design says the tailnet `/events` route needs a bearer token. A web app that
proxies the queue must not widen that. Rationale: probe in the evidence file and design T-2.1.
[VERIFIABLE][^2][^11]

Prompts stay advisory: "A queued prompt cannot grant a permission, bypass a gate, or push; it is
injected exactly as if Sergei had typed it, and every fleet rule ... still binds the receiving
session." Rationale: quoted from the queue design. [VERIFIABLE][^11]

Rate limits exist at three layers: Claude Code throttles repeated messages per sender and queues at
most 50 accepted messages; the notifier dedupes per event revision; the injection library holds a
per-pane lease. The web app should add a per-session cap and dedupe on `(task, prompt revision)`.
[VERIFIABLE][^1][^8][^23] for the existing layers.

Audit trail: the dispatch record, the notifier's per-source counters (reason enums only), the
library's attempt and run records, git-inbox receipts, and a bd comment mirroring each delivered
dispatch. [VERIFIABLE][^1][^8][^15]

## Q8. Delivery states the UI can show

| UI state | Meaning | Source of truth |
|---|---|---|
| Queued | Record written, not yet published to the target | Dispatch record (queue prompt `queued`) |
| Waiting (switch off, goal paused, human gate, owner not running) | Published but held for a named reason | Notifier status and admission store; library `REFUSED` reason; git-inbox `pending` |
| Shown | The session's model saw the header or prompt | p811n7 shown receipt; library landing `prompt-record`; mod submit resolved; queue `delivered` |
| Taken | The session acknowledged the work | Queue `ack`; git-inbox `taken`; bd assignee and `in_progress` |
| Acted on | The work happened | Queue `consumed`; a bd comment by the session; held item retired; start-goal ledger `landing=command-record` |
| Failed | Refused, expired or blocked | Library `REFUSED`/`AMBIGUOUS`; notifier uncertain after 300 s then blocked; git-inbox `expired` |

Rationale: maps each design's own vocabulary. The UI must never render "shown" as done, per the
receipt rule. [VERIFIABLE][^1][^8][^11][^15]

## Recommended dispatch ladder

The web app follows the transactional outbox pattern: write the dispatch durably, then publish an
event; the relay may deliver twice, so every consumer is idempotent on the dispatch id. Rationale:
both pattern sources state the duplicate and idempotent-consumer rule. [VERIFIABLE][^30][^31]

Step 0, the record. The server writes the dispatch to the ai-core queue (`POST /api/queue/prompts`),
which already models `queued` to `consumed` with an id, and mirrors a bd comment on the task. A
private task keeps its text in its private store and the dispatch carries only the id and a digest.
[INFERENCE]

Rung 1, primary: Agent Mail addressed to `<session>@<host>`, admitted by the target host's notifier.
Idle: the rewake hook exits 2 and the header names the dispatch id and the fetch command. Busy: the
header rides the next `PreToolUse` or `UserPromptSubmit`. Trigger to fall back: no shown receipt
within `shown_within_s` (proposed 60 s), or the board probe reports unavailable.

Rung 2: Buzz, then git-inbox, as carriers when Agent Mail is unavailable, per the ladder. Git-inbox
carries a pointer only. Delivery on the far host is the same local admission.

Rung 3, local fallback on the target host: the shared prompt-injection library types a
harness-authored pointer (`beads-ui dispatch <id> for <task>: read it with <command>`), under the same
I-2 claim and policy switch the git-inbox prompt layer uses. Trigger: rung 1 published but unshown
past the bound, and the session has a tmux pane.

Rung 4: the beads-ui mod's `$.prompt.submit`, for a session with the mod loaded and no pane the
library can resolve. Its timer reads the local queue or spool and submits through the same claim.

Rung 5, floor: the queue's Lane A `Stop` pull and the passive header. Nothing is lost if every wake
rung is off; the prompt lands at the next turn end.

Kill switch: every rung re-reads `idle-wake.json` at call time; with it off, only rung 5 delivers.
Native socket and channels stay out of the ladder until their limits are lifted (Gaps, item 6).

Rationale for the order: rung 1 is the fleet's single admission point, which p811n7 D-1 chose so
busy and idle delivery share one classifier and one kill switch; it is already cross-host; and it is
the "hook context injection ... event-based" route the ask points at through aih-fw-1's work. The
ask's other two named routes stay as rungs 3 and 2. [INFERENCE]

```mermaid
sequenceDiagram
    autonumber
    actor S as Sergei (web app)
    participant W as Web app server
    participant Q as Dispatch store (ai-core queue + bd comment)
    participant M as Agent Mail board
    participant N as Target host notifier
    participant H as Rewake hook (FileChanged, asyncRewake)
    participant C as Owning Claude Code session
    participant L as Prompt-injection library (fallback)

    S->>W: Prompt on task T (kind: next, arm goal if none)
    W->>W: Authenticate Sergei, sign envelope
    W->>Q: Write dispatch d (queued), mirror bd comment
    W->>M: Send mail to session@host: pointer to d
    N->>M: Poll (default 10 s)
    N->>N: Admit addressed event, read goal state, check switch
    alt Session idle and switch on
        N->>H: Publish wake snapshot, touch readiness file
        H->>C: Exit 2, header names d (shown receipt)
    else Session busy
        C->>N: Next PreToolUse or UserPromptSubmit
        N-->>C: Passive header names d (shown receipt)
    end
    C->>Q: Fetch d, verify signature, ack (taken)
    C->>C: Work T; run /start-goal if armed and no goal
    C->>Q: Mark consumed, comment on T (acted on)
    opt No shown receipt within shown_within_s
        N->>L: Type one-line pointer to d (same claim, same switch)
        L->>C: Prompt lands (prompt-record)
    end
    Q-->>W: SSE event per state change
    W-->>S: Queued, shown, taken, acted on, or failed
```

Config sketch, read at call time on both the server and each receiving host:

```toml
# beads-ui web app: dispatch policy (sketch, not an existing file)
[dispatch]
record = "ai-core-queue"          # outbox; "bd-comment-only" when the queue is unreachable
mirror_bd_comment = true
coalesce_window_s = 20            # several dispatches to one session become one turn
max_per_session_per_hour = 30
shown_within_s = 60               # fall back to the next rung after this
kill_switch = "~/.config/ai-harness/idle-wake.json"   # automatic_wakes must be true

[dispatch.carriers]               # cross-host carriage, in order
order = ["agent-mail", "buzz", "git-inbox"]
git_inbox_payload = "pointer-only" # never a body: the refs live in a shared repository

[dispatch.local]                  # delivery on the target host, in order
order = ["rewake-hook", "injection-library", "beads-ui-mod", "stop-pull"]
library_use_case = "beads-ui-dispatch"
typed_line_max_chars = 400

[dispatch.goal]
arm_when = "inactive-or-ended"    # never when active, paused, undetermined or waiting on a human
template = "work-all-in-progress" # per-profile override, e.g. the Sem-KG template
hold_when_paused = true

[dispatch.handoff]
route_live_owner = "handoff-request"
route_gone_owner = "git-inbox-action"
force_only_when = "positively-gone"
allowed_receivers = ["aih-*", "ai-cli-*"]  # fleet repos; a kg-* session never takes fleet work

[dispatch.auth]
signing_key = "~/.config/beads-ui/dispatch-ed25519.key"   # server side
verify_pubkey = "~/.config/beads-ui/dispatch-ed25519.pub" # each receiving host
```

## Recommendations for the design

### R-1. Where the dispatch record lives

- (a) The ai-core queue's prompt record, mirrored as a bd comment
  - **Pros:**
    - Already models ids, receipts and SSE events, and is live on sem-kg-ec2.
    - Matches the queue design's playbook mirroring into Beads.
  - **Cons:**
    - Couples the web app to ai-core, which is not running on every host.
    - The queue dashboard (AIH-swgb4.8) covers the same ground; two owners must agree.
- (b) Beads only (a comment or a structured note on the task)
  - **Pros:**
    - One system of record, published by the existing tool.
  - **Cons:**
    - No receipt state machine; publishing costs seconds and contends per store.
- (c) A beads-ui-owned store under the web app
  - **Pros:**
    - No cross-repo dependency.
  - **Cons:**
    - A third task-adjacent store the fleet must reconcile.

Recommendation: (a), with (b) as the degraded mode. Criterion: reuse of an existing receipt model and
a single owner of prompt state. Confidence: medium, because the swgb4.8 overlap is unresolved.
[INFERENCE]

### R-2. The primary wake route

- (a) Agent Mail admitted by the notifier, waking through the rewake hook
  - **Pros:**
    - One admission point, one kill switch, cross-host already, built through Phase 3.
  - **Cons:**
    - Off until `idle-wake.json` exists; 10 s poll latency.
- (b) The injection library as primary
  - **Pros:**
    - Can run slash commands; proves landing from the transcript.
  - **Cons:**
    - Same-host only; keystroke races; foreign text may never be typed.
- (c) The beads-ui mod as primary
  - **Pros:**
    - No keystrokes, zero idle cost, no tmux.
  - **Cons:**
    - Only where the mod is loaded; a second admission path unless it shares the claim.

Recommendation: (a), keeping (b) and (c) as rungs. Criterion: one classifier for busy and idle
delivery (p811n7 D-1). Confidence: high on direction, medium on timing. [INFERENCE]

### R-3. Authority of a web-app prompt

- (a) A signed dispatch envelope verified on the receiving host
  - **Pros:**
    - Gives Sergei's typed text a provable origin; reuses the launch-envelope pattern.
  - **Cons:**
    - New key management on four hosts; a new verified label in the receiving hook.
- (b) Treat web-app prompts as coordination (`UNVERIFIED`)
  - **Pros:**
    - Nothing new.
  - **Cons:**
    - Drops the ask's "auto-trigger that owning cc session to start working on it" for any step that needs Sergei's approval.
- (c) Trust the transport identity (board certificate or git push access)
  - **Pros:**
    - Already authenticated for Agent Mail and Buzz.
  - **Cons:**
    - Proves which host sent it and says nothing about the person; git-inbox does not authenticate its sender at all.

Recommendation: (a). Criterion: the receiving session must tell Sergei's instruction from an
injected one. Confidence: medium; flagged as a design decision below. [INFERENCE]

### R-4. Owner change

- (a) Handoff request to a live owner; git-inbox action when the owner is gone
  - **Pros:**
    - Keeps receiver-first; reuses `taken` and `confirmed` receipts.
  - **Cons:**
    - Two paths to test; depends on liveness classification.
- (b) The web app reassigns with `--force` and tells both sessions
  - **Pros:**
    - Immediate in the UI.
  - **Cons:**
    - Breaks a live claim and the sender's rows; the procedure forbids it.

Recommendation: (a). Criterion: the documented protocol. Confidence: high. [INFERENCE]

### R-5. Arming /start-goal

- (a) The delivered template asks the session to run `/start-goal` when the dispatch says to
  - **Pros:**
    - The session applies the re-arm rule with full context.
  - **Cons:**
    - Relies on the model following the template.
- (b) The target host's receiver runs `start_goal.py --target session:<slug>` after the prompt lands
  - **Pros:**
    - Deterministic; ledger proof of landing.
  - **Cons:**
    - Types into a pane right after a turn began; needs the library's readiness to pass.

Recommendation: (b) when the session was idle and goal-inactive at dispatch, (a) otherwise.
Criterion: deterministic arming where the pane is free. Confidence: medium. [INFERENCE]

### R-6. Batching

- (a) Coalesce dispatches to one session within a window into one turn
  - **Pros:**
    - Bulk review ("unblock them all") costs one turn per session.
  - **Cons:**
    - Adds up to the window's delay.
- (b) One turn per dispatch
  - **Pros:**
    - Simple ordering.
  - **Cons:**
    - Each turn re-reads the cached context.

Recommendation: (a) with a 20 s window. Criterion: token cost per unit of work. Confidence: medium.
Rationale: the measured cache-read cost in Summary item 5. [INFERENCE]

## Dependencies on other fleet work

| Dependency | Needed for | State | If late |
|---|---|---|---|
| AIH-p811n7 Phase 4 and a seeded `idle-wake.json` | Any automatic idle wake (rungs 1, 3, 4) | In progress; file absent here | Deliver at the next turn end (rung 5); show "waiting: automatic wakes off" |
| AIH-p811n7 typed source for dispatch | Clear counters and reasons | Not built; unknown addressed actions already wake with reason `unknown-source-action` | Ride ordinary addressed mail |
| AIH-59eza library and the `inbox-nudge` pattern | Rung 3 | Built; use case on | Skip rung 3 |
| AIH-swgb4 queue API | Dispatch record, receipts, SSE | Live on sem-kg-ec2; Lane B not running; no joining machine enabled; dashboard open | bd-comment-only record; poll the record |
| AIH-swgb4.8 dashboard | Scope boundary with this web app | Open | Decide ownership before building (F-1) |
| AIH-iz7t3 wake sidecar | Launch of a non-running owner | Built, enabled on four pair hosts | Leave pending and show "owner not running" |
| held store `review`/`answer` verbs | Held answers | Built (beads-ui D-37, D-39) | Answer from the pane only |
| owner-sync assignee convention | Routing by host alias | Designed; names carry the host alias | Resolve host from the session registry |

Rationale: states from the evidence file and the cited designs. [VERIFIABLE][^1][^2][^7][^8][^11][^14][^20]

The dependency most likely to block is the policy switch. Phases 1 to 3 are merged, but no host has
`idle-wake.json`, and Phase 4 owns the seeding. [VERIFIABLE][^2]

## Gaps, blindspots & emergent findings

1. Overlap with the work-queue dashboard. AIH-swgb4.8 already specifies a Board, Task detail, prompt
   composer, review queue and SSE, as an app-portal member app. The beads-ui web app has the same
   founding purpose. Building both duplicates the prompt model. [VERIFIABLE][^11]
2. Privacy and carriers. Git-inbox messages and receipts are commits on `refs/heads/fleet-inbox/*` in
   the ai-harness repository, which the ask lists in the shared set that must never hold private goal
   content. The work pair's Agent Mail board runs on the employer-hosted EC2 machine. A private
   task's prompt text must stay in its private store, with carriers holding an id and a digest.
   [VERIFIABLE][^6][^9]; the rule is [INFERENCE].
3. A dispatch resumes a paused goal. Native `/goal` starts the next turn on any message, so a usage-
   or rate-limit pause would end at once. The hold rule in Q5 addresses it. [VERIFIABLE][^28]
4. Bypass-permissions sessions hold messages. Claude Code holds a peer message to a bypass session
   unless the sender also bypasses, and git-inbox's `allow_senders` holds every sender by default.
   The web app's sender identity needs adding to the pair allow-lists. [VERIFIABLE][^6][^23]
5. Cross-host held answers. `answer` runs only where the landing pad lives; a host-side closed verb
   is new work. [VERIFIABLE][^19]
6. Native socket and channels. Same-host socket posting is documented for scripts, but the message
   line format is not; channels need launch flags and are unavailable on Bedrock. Both stay
   exploratory under the source-vetting rule. [VERIFIABLE][^23][^25]
7. The save-state boundary. The library returns `HELD` between `/save-state` and compaction; a
   dispatch must stay queued through it, and SessionStart after compaction re-shows outstanding work
   once. [VERIFIABLE][^1][^8]
8. The weekly host stop. The employer-hosted EC2 machine stops itself at weekends; a web app hosted
   there is down with it, and the record must survive for resume. [INFERENCE] from the host rules in
   the fleet context.
9. Assignee vocabulary. beads-ui D-17's text says `<machine>/<session>`, while the fleet and D-42's
   measurement use the session name, which carries the host alias. The web app should route on the
   alias. [VERIFIABLE][^14][^20]
10. Unauthenticated localhost reads on the queue API (Q7). I did not test writes.
11. A mod's `$.prompt.submit` and a half-typed human draft: the pages fetched do not say whether a
    submit preserves the composer's draft. [NO SOURCE]
12. Anchor bias. The brief named seven routes; I added the wake sidecar, the queue's live API,
    `/goal` pause semantics and the outbox pattern from evidence outside the list.
13. External literature. The host's web-search tool did not load, so outside sources are vendor docs
    and two pattern pages fetched directly. Agent-dispatch delivery semantics: no significant
    post-2024 sources beyond vendor documentation were found within this run.

## Flagged for the coordinator

- F-1. Scope against AIH-swgb4.8. Raw excerpt: "work-queue Phase 2: dashboard member app -- ai-core
  web/ SPA (Board, Task detail, Sessions) + SSE + app-portal apps.yaml registration" (bd
  AIH-swgb4.8). The founding ask wants this web app inside the app-portal system too. Options:
  supersede swgb4.8 with the beads-ui web app; build the web app as that member app; or keep both
  with one shared prompt store. Needs an owner decision across two epics.
- F-2. The automatic-wake switch. Raw excerpt: "Automatic wakes remain off (no idle-wake.json).
  ... Next: Phase 4 (AIH-p811n7.9)" (bd AIH-p811n7 notes, 2026-10-27). The ask requires that a
  prompt "auto-trigger that owning cc session to start working on it". That requirement depends on
  aih-fw-1's Phase 4 and on the switch being turned on; this leg cannot decide it.
- F-3. Signed dispatch envelope (R-3) is a new mechanism with key management on four hosts. It needs
  a design decision.
- F-4. Paused goals. The ask says the prompt should auto-trigger work and arm `/start-goal` "if
  they're not in a current goal mode state". Holding a dispatch to a paused goal narrows "auto-trigger"
  for that case. Options: hold with a "resume anyway" control (recommended), deliver always, or
  deliver only after the pause cause clears.
- F-5. Privacy carriers (Gaps, item 2). The ask: personal goals and their tasks "never make their
  way into ai-harness repo". Git-inbox dispatches to personal-pair sessions must be pointer-only, and
  the design should state it as a rule the sender enforces.
- F-6. Queue API reads with no credential on loopback (Q7). I did not file a Beads issue because this
  brief forbids Beads writes; the coordinator should route it to the ai-core owner.

## Alignment with the founding ask

Every requirement this topic covers is kept. Event-based delivery with no scheduled polling of the
model: kept (all waiting runs outside the model). Agent Mail, hook context injection and the shared
prompt-injection library, configurable with fallbacks: kept as rungs 1, 1 and 3 with a config table.
Auto-trigger the owning session on a prompt, decision, blocker answer or guidance: kept, dependent on
F-2. Owner change triggers the automatic `/handoff`: kept (R-4). Auto `/start-goal` when no goal is
active: kept, narrowed for paused goals and flagged (F-4). Access for both machine pairs: kept,
pair-local carriers. Nothing was dropped.

## Files read

ai-harness at `23ece1e92b6`: `docs/designs/aih-p811n7-event-driven-idle-wake.md` (in full),
`docs/designs/aih-59eza-prompt-injection-library.md` (lines 218-807),
`docs/designs/autonomous-work-queue-coordinator-and-pwa-dashboard.md` (lines 175-600),
`docs/designs/aih-iz7t3-fleet-wake-sidecar.md` (lines 1-230), `docs/designs/beads-assignee-owner-sync.md`
(line 120), `docs/designs/aih-wmd2v-goal-waker.md` (grep), `docs/designs/aih-d3kwe-agent-mail-realtime-awareness.md`
(headings), `docs/procedures/fleet-messaging-ladder.md` (lines 34-262), `docs/procedures/session-handoff.md`
(lines 63-180), `docs/held/README.md` (lines 351-395), `skills/handoff/SKILL.md`, `skills/start-goal/SKILL.md`
(lines 1-135), `src/ai_harness/idle_wake.py`, `src/ai_harness/agent_mail_notifier.py` (poke and CLI),
`src/ai_harness/git_inbox_delivery.py` (lines 195-235), `src/ai_harness/goal_waker.py` (paused handling),
`scripts/queue_waker.py` and `scripts/wq_tunnel.py` (docstrings), `config/message-transports.json`, `config/machine-host-aliases.toml`,
`projects-wide-session-config/ai-harness.toml` (git-inbox and wake-sidecar tables),
`projects-wide-session-config/hooks-manifest.json` (wq hooks), `docs/procedures/ai-writing-anti-patterns.md`
(pre-ship pass), `docs/research/prompts/TEMPLATE.md`. Not read in full: `aih-utmaxs-cross-pair-work-handoff.md`,
`aih-bdrg6-start-goal.md`.

beads-ui at `c5f6e57`: `docs/designs/beads-ui-design.md` (D-17, D-25, D-26, D-33, D-37, D-39, D-42),
`docs/research/claude-code-mod-panel-rendering-and-focus.md` (grep).

## Sources

[^1]: Fleet (ai-harness). (2026). *Event-driven admission for idle session wakes* (`docs/designs/aih-p811n7-event-driven-idle-wake.md`, lines 121-200, 506-514, 535-552). Internal file read at commit `23ece1e92b6`, 2026-10-27. [no online source located] private repository; path and commit given.
[^2]: beads-ui. (2026). *Evidence: host and history probes behind the event-dispatch findings* (`docs/research/findings/evidence/beads-ui-web-app-event-dispatch-host-probe.md`). Tracked in this branch; measured 2026-10-27T23:58Z to 2026-10-28T00:06Z. [no online source located] committed beside this file.
[^3]: Fleet (ai-harness). (2026). `src/ai_harness/idle_wake.py` (lines 30-63, 86-124, 257-298). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^4]: Fleet (ai-harness). (2026). `src/ai_harness/git_inbox_delivery.py` (lines 195-235). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^5]: Fleet (ai-harness). (2026). `src/ai_harness/agent_mail_notifier.py` (`Notifier.poke`, lines 6952-6994; CLI, lines 8515-8640). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^6]: Fleet (ai-harness). (2026). `projects-wide-session-config/ai-harness.toml` (`[git_inbox]` lines 1455-1500; wake-sidecar tables lines 1949-1986). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^7]: Fleet (ai-harness). (2026). *Fleet wake sidecar* (`docs/designs/aih-iz7t3-fleet-wake-sidecar.md`, lines 97-228). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^8]: Fleet (ai-harness). (2026). *Prompt injection and auto-submission library* (`docs/designs/aih-59eza-prompt-injection-library.md`, lines 218-800). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^9]: Fleet (ai-harness). (2026). *Fleet messaging ladder* (`docs/procedures/fleet-messaging-ladder.md`, lines 34-262). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^10]: Fleet (ai-harness). (2026). `config/message-transports.json` (`pairs` block). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^11]: Fleet (ai-harness). (2026). *Autonomous work-queue coordinator and PWA dashboard* (`docs/designs/autonomous-work-queue-coordinator-and-pwa-dashboard.md`, lines 175-600). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^12]: Fleet (ai-harness). (2026). `scripts/queue_waker.py` (module docstring, lines 1-45). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^13]: Fleet (ai-harness). (2026). `projects-wide-session-config/hooks-manifest.json` (`wq-stop`, `wq-session-start`, `wq-prompt-submit`, `wq-heartbeat` entries, `machines: "all"`). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^14]: beads-ui. (2026). *beads-ui design* (`docs/designs/beads-ui-design.md`, D-17 lines 1656-1690, D-33 lines 2332-2370, D-37 lines 2672-2711, D-39 lines 2780-2850, D-42 lines 3180-3234). Read at `c5f6e57`, 2026-10-27. [no online source located] read from this repository's branch base.
[^15]: Fleet (ai-harness). (2026). *Session handoff* (`docs/procedures/session-handoff.md`, lines 63-180). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^16]: Fleet (ai-harness). (2026). `/handoff` skill (`skills/handoff/SKILL.md`). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^17]: Fleet (ai-harness). (2026). `/start-goal` skill (`skills/start-goal/SKILL.md`, lines 1-135). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^18]: Fleet (ai-harness). (2026). `src/ai_harness/goal_waker.py` (lines 230-242, 2195-2215, 2715-2740) and *Goal waker* design (`docs/designs/aih-wmd2v-goal-waker.md`, D-4 and lines 220-222, 327-332). Internal files read at `23ece1e92b6`. [no online source located] private repository.
[^19]: Fleet (ai-harness). (2026). *Held outputs* (`docs/held/README.md`, lines 351-395). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^20]: Fleet (ai-harness). (2026). *Beads assignee and owner sync* (`docs/designs/beads-assignee-owner-sync.md`, line 120). Internal file read at `23ece1e92b6`. [no online source located] private repository.
[^21]: Anthropic. (2026). [Use the mods API](https://code.claude.com/docs/en/plugins/mods/api.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-27. (Timers, `$.prompt.submit`, `$.session.send`, refused-call results.)
[^22]: Anthropic. (2026). [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-27. (Method table, `$.store` sharing, limits.)
[^23]: Anthropic. (2026). [Message your other Claude Code sessions](https://code.claude.com/docs/en/cross-session-messaging.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-27. (Delivery outcomes, inbound controls, inbox socket, availability.)
[^24]: Anthropic. (2026). [Hooks reference](https://code.claude.com/docs/en/hooks.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-27; characters 0 to 200,000 read. (`asyncRewake`, `additionalContext`, `idle_prompt`.)
[^25]: Anthropic. (2026). [Push events into a running session with channels](https://code.claude.com/docs/en/channels.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-27. (Research preview, provider availability.)
[^26]: Anthropic. (2026). [Channels reference](https://code.claude.com/docs/en/channels-reference.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-27. (No acknowledgement; events delivered together when busy; sender gating.)
[^27]: Anthropic. (2026). [Continue local sessions from any device with Remote Control](https://code.claude.com/docs/en/remote-control.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-27. (Subscription-only requirement; Bedrock excluded.)
[^28]: Anthropic. (2026). [Keep Claude working toward a goal](https://code.claude.com/docs/en/goal.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-27. (Replacement, pause, idle check-ins.)
[^29]: Anthropic. (2026). [Run Claude Code programmatically](https://code.claude.com/docs/en/headless.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-27. (`--continue` and a still-running session.)
[^30]: Richardson, C. (2026). [Pattern: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html). microservices.io. Verified accessible (HTTP 200) 2026-10-27; no last-updated date shown. (Idempotent consumers.)
[^31]: Amazon Web Services. (2026). [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html). AWS Prescriptive Guidance. Verified accessible (HTTP 200) 2026-10-27. (Duplicate messages, idempotent consumers.)
[^32]: Fleet (ai-harness). (2026). `scripts/wq_tunnel.py` (module docstring, lines 1-40). Internal file read at `23ece1e92b6`, 2026-10-28. [no online source located] private repository.
