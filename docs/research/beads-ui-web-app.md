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
