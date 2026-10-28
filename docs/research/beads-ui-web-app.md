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

`founding_ask_ref`: [FILL: exact `canonical_root_json` + `founding_ask_ref_sha256` | N/A with reason]

[FILL: When this `founding_ask_ref` is `N/A` for a Tier 1 dispatch with no `canonical_root_json`, paste the literal `verbatim_exact_ask` from the worker brief directly below in a fenced `text` block. Never replace it with a summary or a reference to the transient brief. Do not add this block for Tier 0 or Tier 2/3.]

[FILL: account for every authoritative raw FAR entry, including every re-scope entry. This index
is non-authoritative; the raw FAR governs.]

| Authoritative raw entry | Coverage and disposition |
|---|---|
| [FILL: one row per entry id] | [FILL: section/evidence or explicit disposition] |

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

(synthesis will populate this region)

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
