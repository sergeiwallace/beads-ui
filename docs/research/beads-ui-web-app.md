---
title: "beads-ui web app: review and triage UX, event-based prompt dispatch, stack, shared code, backend and access"
category: research
tags: [research]
status: stub
source: "None"
template_version: "research-1.2.0"
delegation_provenance:
  version: 2
  contributors: []
task: BU-mg2.5.1
stub: true
---

# beads-ui web app: review and triage UX, event-based prompt dispatch, stack, shared code, backend and access

## Founding Ask Coverage

`canonical_root_json`: `{"blob_oid":"8b43d16fb45272c4911f8de4d1b491e6bb472134","capture_commit":"b5eaeefd646b1fee17f189518ca9d32a67e9aad2","content_sha256":"79619e87b5d6a8e02204a9bf35e294caa65ab910f8be7f0d136e7035009caed0","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-epic-goals-system-usmm.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-epic-goals-system-usmm"}`

`founding_ask_ref_sha256`: `c12436184b45bdc5c279f8f1d3928c6610536b5802f38b0760a6d47d4997dae6`

The founding ask record has one entry, A001, recorded verbatim in ai-harness at `docs/asks/BU-epic-goals-system-usmm.md`. This index is non-authoritative; the raw entry governs. A001 covers two systems. This doc covers the web app clauses; the goals clauses and the privacy guard are covered by [the goals system research](goals-system.md). Each row below is one web app clause of A001.

| A001 clause (quoted or closely paraphrased) | Coverage and disposition |
|---|---|
| A001: "the web app for the beads-ui task manager ... same overall purpose as the beads-ui task manage claude code mod tui" | Covered: Context; [§5](#5-front-end-stack-recheck); [§6](#6-shared-code-across-the-web-app-the-mcp-app-and-the-mod) |
| A001: "react or whatever framework is pretty and aesthetic and best practice" | Covered: [§5](#5-front-end-stack-recheck) |
| A001: "best practice UI / UX interactions from jira / todoist / asana / linear"; kanban, sprint and backlog, rearrange, quick edits of priority, status and owner, view details | Covered: [§2](#2-board-backlog-and-sprint-the-2025-2026-delta), building on the prior beads-ui landscape research |
| A001: "view the held doc blockers / decisions / open questions / details" | Covered: [§1](#1-review-and-triage-of-blockers-decisions-and-open-questions) |
| A001: type and enter prompt responses per task for the owning session; the session "should get automatically notified via event-based system" built on aih-fw-1's event-driven wake | Covered: [§3](#3-per-task-prompts-and-event-based-dispatch) |
| A001: "it can work via either agent-mail or hook context injection (should be event-based) and/or prompt injection via shared prompt injection library or configurable combination of them with fallback options" | Covered: [§3](#3-per-task-prompts-and-event-based-dispatch). All three named routes stay in the design space; the section recommends how they combine |
| A001: "i can change the owning cc session too and it should trigger the automatic /handoff" | Covered: [§4](#4-owner-change-handoff-and-start-goal) |
| A001: "auto-triggers them to `/start-goal` if they're not in a current goal mode state" | Covered: [§4](#4-owner-change-handoff-and-start-goal) |
| A001: "use the auto-work queue system to see all the tasks in priority order and filter them to see all blocked tasks in priority order (can filter by ... epic etc)"; review blockers and decisions by priority, impact, type and size; unblock and prompt next steps | Covered: [§1](#1-review-and-triage-of-blockers-decisions-and-open-questions); [§7](#7-backend-over-beads-and-ai-core) for the queue data |
| A001: "fit within the app-portal system ... as a modular web app" | Covered: [§8](#8-app-portal-fit) |
| A001: "shared code ... for beads-ui claude code mod tui, claude desktop / claude.ai webapp UI MCP app ... (if its too limiting, then they can be separate builds)" | Covered: [§6](#6-shared-code-across-the-web-app-the-mcp-app-and-the-mod) |
| A001: "built on our backend of beads tasks dolt db store etc and whatever else from ai-core"; open to changing backend or frontend | Covered: [§7](#7-backend-over-beads-and-ai-core) |
| A001: local hosting for now; sem-kg-ec2 with acn-mac via SSM or SSH; fw-lnx with sw-mac via Tailscale; cloud hosting from infra-as-config templates later | Covered: [§9](#9-hosting-and-access-for-each-machine-pair) |
| A001: goals system, goal views, goal research and the privacy guard | Out of this doc by split, covered in full by [the goals system research](goals-system.md) |
| A001: the process clauses (orchestrate, research, wait for aih-fw-2's compile, merge, sync, reap, then design through /auto-flow, then Sergei's review) | Process, not content. Recorded in the Run History of this doc and the coordinator's report |

**Status:** stub

**Created:** None

<!-- doc:region name="context" kind="immutable" -->

## Table of Contents

<!-- FILL THIS IN as you write. The entries below are this stub's own placeholder sections, so
     they already resolve; as you add, rename, or remove a heading, update this list in the same
     edit. A ToC that lists headings the doc does not have, or omits ones it does, is worse than
     no ToC because it looks like working navigation.
     The doc's D5 (c) decision: list EVERY `## ` and EVERY `### ` heading in the real doc, with
     GitHub-style anchors (lowercase, spaces→hyphens, punctuation stripped) so they navigate
     in-window (incl. VS Code Remote-SSH). If all-`###` proves too noisy, fall back to D5 (a)
     "meaningful `###`" — a deterministic OR-rule: include a `###` when it (1) has child `####`,
     (2) its body ≥ ~8-10 lines, (3) its parent `##` is allowlisted, or (4) matches a pattern.
     Hand-maintained: the not-yet-shipped `aido toc check` tool. Verify with
     `scripts/check_doc_toc.py <this-doc>`, which fails on an anchor that does not resolve.
     Manual `<!-- toc:skip -->` / `<!-- toc:include -->` override. -->

- [Context](#context)
- [Ambiguous Items from Auto-Remediation (Post-Run Review)](#ambiguous-items-from-auto-remediation-post-run-review)
- [Appendix: Research Prompt](#appendix-research-prompt)
- [Appendix: Provenance Ledger](#appendix-provenance-ledger)
- [Run History](#run-history)

## Context

Sergei asked on 2026-10-27 for a web app version of the beads-ui task manager: the same purpose as the Claude Code mod, with Jira, Todoist, Asana and Linear quality interactions, and a way to steer the Claude Code session that owns each task from the browser. A prompt, a decision answer or an unblock entered on a task must reach that session by event, never by a scheduled wake, and start its work; changing the owner runs `/handoff`, and a session with no goal armed gets `/start-goal`. The app fits app-portal as a member app, shares code with the mod and the MCP App where that is sound, runs on the Beads Dolt stores, and is reachable from both machine pairs: sem-kg-ec2 with acn-mac, and fw-lnx with sw-mac.

The beads-ui design doc already decides the web stack (D-10), the queue member-app role (D-11), the MCP topology (D-14) and the Phase 3 to 6 scope. This research covers what the 2026-10-27 ask adds on top of that, and rechecks the stack.

**Primary period:** 2024–2026
**Source weighting:** 2026 primary, 2025 secondary, 2024 tertiary; earlier sources only where foundational. Fleet sources (ai-harness and beads-ui designs, code and Beads issues) are read at the commits each finding names.

<!-- /doc:region name="context" -->

<!-- doc:region name="body" kind="replaceable" -->

## Temporal Scope

Product, library and platform claims weight 2026 first, then 2025, then 2024; earlier sources appear only as background. Fleet claims (the event-driven wake, Agent Mail, the work queue, the prompt-injection library, the held-doc store, the beads-ui design) are read from ai-harness, ai-core and beads-ui at the commits each findings file names, measured on 2026-10-27 and 2026-10-28 UTC. Each research leg's full evidence, with its footnoted sources, is in its findings file under [findings/](findings/); this doc synthesizes them and cites the findings file for detail.

<!-- exec-summary-slot -->

## 1. Review and triage of blockers, decisions and open questions

No surveyed product has a queue built for answering decisions. The nearest pattern is the triage queue, and it transfers well. Linear Triage binds Accept, Decline and Duplicate to the keys 1, 2 and 3 and snooze to H [VERIFIABLE][^1][^3]. Gmail and GitHub mark an item done with E and undo with Z, and GitHub offers saved filters and bulk actions in its notification inbox [VERIFIABLE][^4][^5]. Linear added a Priority tab to its inbox in September 2026 and groups agent replies in their own inbox section [VERIFIABLE][^9].

The fleet's held decisions are already structured for this. Each held decision carries `format-decision` markers, `##### (a)` option headings with Pros and Cons, and a Recommendation naming a letter, and ai-harness's `format_decision` module already parses that shape [INFERENCE] (the UX leg read the module and the held README; see [^1] § 1). A web app can therefore show each decision as an option card whose number keys pick an option, with the rendered Markdown body below for context.

The recommended Review view is a split list and detail queue, keyboard first, grouped by next action (answer a decision, unblock, answer an open question, prompt), sorted by priority and filterable by epic, goal, type, size and owner, with bulk selection for cases such as approving every recommendation in one epic [INFERENCE][^1]. Two points need design calls. First, beads-ui D-39 records Sergei's answer "exactly as typed", so a one-key "approve the recommendation" writes text Sergei did not type; the design must either record such an answer as chosen by a control, naming the option, or fill the composer and require Send [VERIFIABLE][^1][^25]. Second, structured option data needs a new held-store command that prints each decision's options and recommendation as JSON, which is an ai-harness change beside D-37's `review` verb [INFERENCE][^1].

Single-letter shortcuts in the Gmail and Linear style must be possible to turn off or remap to meet WCAG 2.1.4 at Level A; Gmail ships them off by default [VERIFIABLE][^4][^8]. No decided beads-ui decision covers this, so the web app design needs one.

### When to use

The triage queue is the web app's home for Sergei's review work: blocked tasks, held decisions and open questions in priority order. The Board stays the home for moving work between statuses.

## 2. Board, backlog and sprint: the 2025-2026 delta

The prior beads-ui landscape research covers Jira, Linear, Todoist and Asana board, backlog, sprint and drag interactions in depth, and the beads-ui design already decides the board (Phase 3, D-5, D-6, D-13, D-22, D-23). The 2026 delta is small and concentrated in Linear: drag-to-reorder groups and swimlanes in May 2026, shareable filtered-view URLs in July 2026, and the Priority inbox in September 2026 [VERIFIABLE][^9]. Asana's fall 2026 release adds AI Teammates and a "Work Graph" [VERIFIABLE][^1] (§ 4). Huly's repository is now frozen and its hosted service discontinued, so it drops out as a reference [VERIFIABLE][^1] (§ 4). Superhuman, Asana Inbox, Height and Jira's 2025-2026 changes could not be verified in this run [NO SOURCE].

Shareable view URLs are the one delta worth adopting: a filtered Review or Board view should be a URL so a session or a note can link straight to "blocked P0 and P1 in epic X" [INFERENCE].

## 3. Per-task prompts and event-based dispatch

The fleet already has an event-driven admission system for idle sessions, and the web app should enter it as one more typed event source rather than build a second wake path. The notifier daemon polls outside the model, classifies typed events, and an async `FileChanged` hook exits 2 to create a model turn only for an admitted event; direct mail and explicit pokes wake their recipient, and passive items ride the next `PreToolUse` or `UserPromptSubmit` [VERIFIABLE][^14][^26]. Phases 1 to 3 of that design are on ai-harness main; Phases 4 and 5 are not [VERIFIABLE][^2][^16].

Every automatic idle wake is switched off on sem-kg-ec2 today. The live policy file `~/.config/ai-harness/idle-wake.json` does not exist, which the loader reads as `automatic_wakes = false`, and since Phase 3 the git-inbox prompt-injection wake checks the same switch [VERIFIABLE][^15][^16]. Until the switch is on, a dispatched prompt reaches a session only at its next natural turn boundary. Seeding the file belongs to Phase 4 of the event-driven wake, which the aih-fw-1 session owns; it is the dependency most likely to block the web app's auto-trigger [VERIFIABLE][^2] (§ Dependencies).

The recommended dispatch path follows the transactional outbox pattern: write the dispatch durably, then publish an event, and make every consumer idempotent on the dispatch id because a relay may deliver twice [VERIFIABLE][^23]. The dispatch leg's ladder, with each rung honouring one call-time kill switch [INFERENCE][^2]:

| Rung | Route | When it is used |
|---|---|---|
| 0 | Record: the dispatch goes to the ai-core work queue (`POST /api/queue/prompts`, which already models `queued` to `consumed`), mirrored as a bd comment on the task | Always, first |
| 1 | Agent Mail addressed to `<session>@<host>`, admitted by the target host's notifier: an idle session wakes through the hook, a busy one sees a header at its next tool call | Primary |
| 2 | Buzz, then git-inbox, as cross-host carriers when Agent Mail is unavailable; git-inbox carries a pointer only | Agent Mail unavailable |
| 3 | The shared prompt-injection library types a one-line, harness-authored pointer to the dispatch on the target host | Rung 1 published but no shown receipt within a bound (proposed 60 s), and the session has a tmux pane |
| 4 | The beads-ui mod's `$.prompt.submit`, when the mod is loaded in the target session | No pane the library can resolve |
| 5 | The work queue's `Stop`-hook pull and the passive header at the next turn end | Floor: nothing is lost when every wake rung is off |

This keeps all three routes the founding ask names. Agent Mail admitted by the notifier is the "hook context injection ... event-based" route through aih-fw-1's work, the shared prompt-injection library is rung 3, and git-inbox and Buzz carry Agent Mail's role across hosts [INFERENCE][^2][^17][^18]. Claude Code's native channels and remote control stay out of the ladder: channels are a research preview with provider limits, and Remote Control requires a subscription login that excludes the Bedrock route this host uses [VERIFIABLE][^7][^27].

Every rung costs zero model tokens while nothing is pending, because the waiting runs in a daemon, a hook watcher or a mod timer. Each delivery costs one model turn over the session's cached context, measured at a median of 365,551 cache-read tokens per response window, so coalescing several dispatches to one session into one turn is the main cost lever during bulk review [VERIFIABLE][^14][^2].

Authority is the open design problem. The fleet's peer-relay `VERIFIED` check reads the sending session's transcript for Sergei's typed turn; a web app has no transcript, so its prompts would arrive `UNVERIFIED` and a receiving session would treat them as coordination only [VERIFIABLE][^17]. The web app needs a dispatch envelope signed by the server after it authenticates Sergei and verified on the receiving host [INFERENCE][^2]. The same leg found the ai-core queue API answering on loopback with no credential, which the web app's auth design must account for [VERIFIABLE][^16].

The composer itself should be ported, not redesigned. The work queue's dashboard in ai-core already has a Sergei-approved composer (Lexical rich text, a `/skill` typeahead, an explicit "Queue prompt" button and a secret-guard refusal), and under D-11 the beads-ui web app replaces that dashboard [INFERENCE][^1][^25]. Every agent-delegation product surveyed shows a per-session state beside a follow-up box; Linear's agent sessions have six states (`pending`, `active`, `error`, `awaitingInput`, `complete`, `stale`), and Claude Code's Remote Control docs warn that a disconnected banner says nothing about whether work continues [VERIFIABLE][^6][^7]. The composer should therefore show three separate indicators: session liveness, delivery state (queued, shown, taken, acted on, failed, each with its source of truth in the queue record) and the session's response [INFERENCE][^1][^2].

### When to use

Agent Mail is the route for every dispatch. The fallbacks exist for a session that does not show the mail within the bound, and the floor guarantees delivery at the next turn end when automatic wakes are off.

## 4. Owner change, /handoff and /start-goal

An owner edit must not simply reassign an in-progress claim. `bd` refuses to reassign another session's claim without `--force`, and the fleet's `/handoff` is receiver-first: the sender drops its rows only after the receiver says taken [VERIFIABLE][^20]. The web app should therefore send a handoff request to the current owner, and use the git-inbox action route, with its `taken` and `confirmed` receipts, when the current owner is gone [INFERENCE][^2]. The UI side is an inline owner select with a confirmation popover that names both sessions and their liveness [INFERENCE][^1].

Arming `/start-goal` needs the target session's goal state, which is read on the target host from that session's transcript by the goal waker [VERIFIABLE][^22]. Claude Code's native `/goal` replaces an active goal and resumes a paused one on any new prompt, so a dispatch to a session whose goal is paused for a usage or rate limit must be held rather than delivered [VERIFIABLE][^21]. The dispatch carries an "arm a goal if none is active" flag; the receiving session, not the web app, decides whether to run `/start-goal` after reading its own state [INFERENCE][^2].

### When to use

Use the handoff request whenever the owner field changes on a task that has a live claim. A task with no claim takes a plain assignee write.

## 5. Front-end stack recheck

D-10's stack holds as of 2026-10-28: React 19, Vite, TanStack Query, Table and Virtual, Zustand, shadcn/ui on Base UI, Pragmatic drag and drop, Recharts and cmdk are all maintained [VERIFIABLE][^10]. The exception is `cmdk`, whose last release is 2025-03-14 and last push 2025-10-29; shadcn's Command still wraps it, and Base UI's Autocomplete now covers filtering, groups, keyboard movement and virtualization, so the replacement path D-10 planned exists [VERIFIABLE][^10]. Three facts in the prior stack record have moved: Base UI's package is now `@base-ui/react` (1.0.0 on 2025-12-11), Frappe Gantt released 1.2.2 on 2026-02-25, and Vite 8 (2026-03-12) bundles with Rolldown [VERIFIABLE][^10][^12]. React Compiler reached 1.0 on 2025-10-07 and is worth enabling for a dense board [VERIFIABLE][^11].

For an attractive Linear-grade look, the recommendation is D-19's semantic token names expressed as shadcn-style oklch CSS variables in light and dark, with a contrast setting, keeping the token file small enough to swap for a generated theme later [INFERENCE][^1]. app-portal itself uses Radix and Vite 7, which does not reopen D-10 because a member app ships its own bundle [VERIFIABLE][^1].

### When to use

Keep D-10 as decided. Revisit `cmdk` only when it breaks on a React or Base UI upgrade, and then move the palette to Base UI's Autocomplete behind the same component.

## 6. Shared code across the web app, the MCP App and the mod

The prior shared-code split stands. Core reducers, view models and commands are shared by all three surfaces; React components are shared by the web app and the MCP App, while the mod draws its own element tree [VERIFIABLE][^1][^25]. This ask adds four shared candidates: the review-queue reducer, the decision-option model, the composer's delivery-state machine and the key map, the last held as data in core's command catalog and bound by a small DOM listener in the web package [INFERENCE][^1].

One limit matters for the MCP App. MCP Apps' `ui/message` posts into the Claude conversation, not into a Claude Code session, so the MCP App must send a session prompt through a server tool that writes the same dispatch record the web app writes [VERIFIABLE][^13]. Separate builds are needed only for drawing (DOM against the mod's element tree), never for the domain, so the founding ask's fallback of separate builds applies to the view layer alone [INFERENCE].

### When to use

Put anything that decides what to show or what a key does in core. Put anything that draws in the surface package.

<!-- sections-7-9-slot -->

<!-- /doc:region name="body" -->

<!-- doc:region name="ambiguous_items" kind="replaceable" -->

## Ambiguous Items from Auto-Remediation (Post-Run Review)

(none yet — auto-populated by verify_and_remediate node)

<!-- /doc:region name="ambiguous_items" -->

<!-- doc:region name="appendix_research_prompt" kind="immutable" -->

## Appendix: Research Prompt

```text
None
```

<!-- /doc:region name="appendix_research_prompt" -->

<!-- doc:region name="appendix_provenance" kind="replaceable" -->

## Appendix: Provenance Ledger

(none yet — auto-populated at commit from the validated provenance ledger)

<!-- /doc:region name="appendix_provenance" -->

<!-- doc:region name="run_history" kind="append_only" -->

## Run History

<!-- /doc:region name="run_history" -->
