---
title: "A goals system above epics, stories and tasks: products, science and ontology, visualisation and privacy"
category: research
tags: [research]
status: stub
source: "None"
template_version: "research-1.2.0"
delegation_provenance:
  version: 2
  contributors: []
task: BU-ylx.11.1
stub: true
---

# A goals system above epics, stories and tasks: products, science and ontology, visualisation and privacy

## Founding Ask Coverage

`canonical_root_json`: `{"blob_oid":"8b43d16fb45272c4911f8de4d1b491e6bb472134","capture_commit":"b5eaeefd646b1fee17f189518ca9d32a67e9aad2","content_sha256":"79619e87b5d6a8e02204a9bf35e294caa65ab910f8be7f0d136e7035009caed0","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-epic-goals-system-usmm.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-epic-goals-system-usmm"}`

`founding_ask_ref_sha256`: `c12436184b45bdc5c279f8f1d3928c6610536b5802f38b0760a6d47d4997dae6`

The founding ask record has one entry, A001, recorded verbatim in ai-harness at `docs/asks/BU-epic-goals-system-usmm.md`. This index is non-authoritative; the raw entry governs. A001 covers two systems. This doc covers the goals clauses and the privacy guard; the web app clauses are covered by [the beads-ui web app research](beads-ui-web-app.md). Each row below is one goals clause of A001.

| A001 clause (quoted or closely paraphrased) | Coverage and disposition |
|---|---|
| A001: a goals system "as a fundamental architectural component to the beads task system hierarchy where it will be like the chief most possible parent beads task type" | Covered: [§2](#2-how-goals-link-to-work), [§4](#4-goal-ontology), [§10](#10-fit-with-beads) |
| A001: "optionall assign all beads tasks to one or more goals (or no goals)" | Covered: [§2](#2-how-goals-link-to-work), [§10](#10-fit-with-beads) |
| A001: view goals organisationally by priority; "all the usual linkages such as relates to and dependencies and blocks" | Covered: [§2](#2-how-goals-link-to-work), [§7](#7-configuration-and-review-ux) |
| A001: a goal system "that sits on top of like epic / story / task issues (jira atlassian has a goal system but its just okay, not that great)" | Covered: [§1](#1-goal-and-okr-products), including why Atlassian Goals falls short |
| A001: interactive visualisations of the epics, stories, tasks and bugs under each goal, their dependencies, blockers and other links, "in a hierarchical linked graph" | Covered: [§6](#6-visualisation-patterns-and-libraries) |
| A001: "start / end / due date fields"; Gantt chart, timeline and graph views with dependency and blocker links | Covered: [§6](#6-visualisation-patterns-and-libraries), [§10](#10-fit-with-beads) |
| A001: orient and prioritise work toward "my actual goals in life"; prioritise "my take and agentic ai work towards them" | Covered: [§5](#5-goal-alignment-for-a-persons-and-their-agents-work) |
| A001: popular apps and systems across free, open-source, freemium and paid tiers, repos, packages, tools and libraries | Covered: [§1](#1-goal-and-okr-products), [§6](#6-visualisation-patterns-and-libraries) |
| A001: "technical blog or academic etc research on the science and engineering / theory of goals and goal alignment and accomplishment" and how to structure goals "ontologically and practically" | Covered: [§3](#3-the-science-of-goals), [§4](#4-goal-ontology) |
| A001: effective UI/UX for organising and configuring goals; visualisations, components and web patterns to copy or learn from | Covered: [§6](#6-visualisation-patterns-and-libraries), [§7](#7-configuration-and-review-ux) |
| A001: fold in aih-fw-2's compile of the first goals attempt, link it, research any new leads; never read goal docs in the sergei repo | Covered: [§9](#9-prior-work-from-the-first-goals-system). The sergei repo was not read |
| A001: a privacy and access-control system so personal, private, sensitive or domain-specific goals and their tasks never reach ai-harness, ai-cli-utils, ai-core, project-template, aido or another shared core repo; enforcement and validation, not convention | Covered: [§8](#8-privacy-and-access-control-for-personal-goals) |
| A001: web app clauses (board, review queue, prompt dispatch, framework, shared code, backend, app-portal, hosting) | Out of this doc by split, covered in full by [the beads-ui web app research](beads-ui-web-app.md) |
| A001: the process clauses (orchestrate, research, wait for the compile, merge, sync, reap, design through /auto-flow, Sergei's review) | Process, not content. Recorded in the Run History of this doc and the coordinator's report |

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

Sergei asked on 2026-10-27 for a goals system as a fundamental part of the Beads task hierarchy: a goal is the top-most parent type, any issue can belong to zero, one or many goals, and goals carry the usual links (relates to, depends on, blocks) and start, end and due dates. He wants it viewable by priority and as a hierarchical linked graph, a Gantt chart and a timeline with dependency and blocker lines, so that his own work and his AI agents' work are prioritised toward the goals that matter. The research spans goal and task products of every licence tier, the science and theory of goals and their ontology, interactive visualisation patterns and libraries, prior work from an earlier attempt at a goals system, and a privacy and access-control guard that keeps personal, private or sensitive goals and their tasks out of every shared harness repo.

**Primary period:** 2024–2026 for products, libraries and practice; no cutoff for goal science, where the foundational literature predates 2024 and is cited with its publication date.
**Source weighting:** 2026 primary, 2025 secondary, 2024 tertiary for products and tooling; peer-reviewed and meta-analytic sources first for goal science. Fleet sources are read at the commits each finding names.

<!-- /doc:region name="context" -->

<!-- doc:region name="body" kind="replaceable" -->

## Temporal Scope

Product, library and practice claims weight 2026 first, then 2025, then 2024. Goal science has no cutoff: its foundational theory and meta-analyses predate 2024 and are cited with their publication dates. Fleet claims (Beads 1.3.x, the beads-ui design, the fleet's repo classes and guards, the prior goals work) are read at the commits each findings file names, measured on 2026-10-27 and 2026-10-28 UTC. Each research leg's full evidence, with its footnoted sources, is in its findings file under [findings/](findings/); this doc synthesizes them and cites the findings file for detail.

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
