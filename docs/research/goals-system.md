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

<!-- exec-summary-slot -->

## 1. Goal and OKR products

Atlassian Goals is "just okay" for a documented reason: it does not compute a goal's progress from the work linked to it. Its own help says that when several work items link to one goal, "progress won't be automatically calculated across all of them", and it caps linked Jira work items at 100 per goal [VERIFIABLE][^2][^3]. Plane and ClickUp count completed work, and Asana names its progress sources most precisely: a goal's progress is `manual`, `subgoal_progress`, `project_task_completion`, `project_milestone_completion`, `task_completion` or `external`, and each supporting link carries a `contribution_weight` from 0 to 1 [VERIFIABLE][^4][^5].

The better products keep health and progress as two separate signals. Linear derives a project's health from its most recent written update, flags "Update Missing" when an update is overdue, and computes progress from estimate points as completed plus a quarter of in-progress over the total [VERIFIABLE][^6][^7]. Health answers "is this on track, in the owner's judgment", progress answers "how much of the work is done", and a goal view needs both.

Products have started exposing goals to AI agents. Perdoo ships an MCP server whose tools list OKRs and log progress updates, Tability sells to "both human and Agent teams" with agent check-ins, and Linear lets a user filter and segment work by the agent it was delegated to [VERIFIABLE][^8][^9][^10]. None shows whether agent effort is going to the highest-priority goals, so that view is new design work (see [§5](#5-goal-alignment-for-a-persons-and-their-agents-work)).

The full product survey, with a comparison table across licence tiers, is in the products leg's findings [VERIFIABLE][^1]. Its gaps: no web-search tool reached the leg, so user sentiment and four vendors' goal pages are unverified there [NO SOURCE].

### When to use

Copy Asana's typed progress sources and weighted links, and Linear's split of health from progress. Avoid Atlassian's manual-only progress.

## 2. How goals link to work

Goal-to-work is many-to-many in every product that models it well, and goal-to-goal is a tree with an optional second parent. Linear joins projects to initiatives through a separate `InitiativeToProject` record, so a project can sit under several initiatives; Asana returns "all of the parent goals of a goal"; GitHub sub-issues keep one parent [VERIFIABLE][^7][^4][^11]. The founding ask's "assign all beads tasks to one or more goals (or no goals)" is exactly this many-to-many shape, and its "relates to and dependencies and blocks" between goals matches Linear's initiative relations and Beads' own `relates-to` and `blocks` edges [INFERENCE][^1].

Privacy boundaries break links in the products that have them. Atlassian restricts a goal only at creation, applies the restriction to its whole hierarchy, and forbids links between restricted and open goals [VERIFIABLE][^12]. Where a private goal lives in a different repository from the public work it serves, the link records must live on the private side, or the public store leaks the private goal's id (see [§8](#8-privacy-and-access-control-for-personal-goals)) [INFERENCE][^1].

### When to use

Model goal membership as a link from the goal to each member, many-to-many, with descendant inclusion: linking an epic counts its children, as Plane does [INFERENCE][^1].

<!-- sections-3-5-slot -->

## 6. Visualisation patterns and libraries

For the hierarchical linked goal graph, React Flow (`@xyflow/react` 12.12.0, MIT, about 38,800 GitHub stars) with ELK's layered layout running in a Web Worker fits D-10's React stack best [VERIFIABLE][^13][^14]. React Flow draws DOM nodes with keyboard focus, ARIA labels and a live region, which no canvas or WebGL graph library in the survey offers [VERIFIABLE][^13]. Two costs come with it: its expand-and-collapse and auto-layout examples are paid "Pro" examples, and ELK is EPL-2.0 with the largest bundle of the layout engines React Flow compares, so dagre serves pure-tree layouts when ELK is not loaded [VERIFIABLE][^13].

No permissive open-source Gantt library offers a critical path. SVAR React Gantt and DHTMLX Gantt both reserve auto-scheduling and critical path for paid PRO editions, and Frappe Gantt draws dependency arrows but has no hierarchy [VERIFIABLE][^15][^16][^17]. (Frappe Gantt released 1.2.2 on 2026-02-25 per the npm registry; the products leg's "no release since February 2025" is superseded by the web app UX leg's registry read [VERIFIABLE][^18].) The cheapest route to the founding ask's Gantt, timeline and dependency lines is a custom SVG timeline on visx, shared with the beads-ui Phase 3 Roadmap, with critical path computed in the DOM-free core [INFERENCE][^1].

Recharts, already in D-10, ships `Sankey`, `Treemap`, `SunburstChart` and `RadialBarChart`, which covers effort-allocation and progress-ring views with no new chart library [VERIFIABLE][^19].

| View | Pick | Why |
|---|---|---|
| Goal graph (hierarchy, links, blockers) | React Flow with ELK (dagre for trees) | Accessible DOM nodes, D-10 fit |
| Gantt, timeline, roadmap | Custom SVG on visx, critical path in core | No permissive library has a critical path |
| Effort allocation, progress rings | Recharts (already chosen) | No new dependency |
| Goal tree editing | TanStack Table expanding rows with Pragmatic drag and drop | One drag library in the app |

### When to use

The graph view answers "what serves this goal and what blocks it". The timeline answers "when, and what is on the critical path". The allocation charts answer "where is the effort actually going".

<!-- sections-7-9-slot -->

## 10. Fit with Beads

Beads 1.3.2 can hold goals without a schema change, though not cleanly [VERIFIABLE][^20]. A custom `goal` type is allowed through `types.custom` per store; priority, `due_at` and dependency edges already exist; and `bd dep cycles` checks for cycles. Beads has no planned start date, no progress or target-value field, `--parent` allows one parent only, and no CLI flag writes the `metadata` column on a dependency edge, so contribution weights have no writable home today [VERIFIABLE][^20].

| Need | Beads 1.3.2 today | Gap |
|---|---|---|
| A goal type | Custom types via `types.custom` | No built-in `goal` type |
| Goal above epic | `parent-child`, one parent | A goal can parent an epic, but the epic then has only that goal |
| Many-to-many membership | `blocks`, `tracks`, `related`, `relates-to` and other edge kinds | No "contributes to" kind; `tracks` is already D-5's sprint edge; `blocks` hides the member from `bd ready` |
| Contribution weight | `dependencies.metadata` column | No CLI flag writes it |
| Dates | `due_at`; `started_at` records the actual start | No planned start; D-5 already stores `sprint.starts_at` in metadata |
| Progress, metric, health | Issue `metadata` JSON; `bd epic status` | No fields |
| Cross-store goals | `bd repo` hydration, `external:<project>:<capability>` edges, `bd migrate-personal` | Which store holds a cross-store link is a privacy rule (§8) |

The goal-membership edge kind is the one data-model call this research cannot settle. `tracks` is the natural kind but already means sprint membership under D-5, and the default `blocks` would remove every member from `bd ready` [VERIFIABLE][^20]. The design must choose between overloading `relates-to`, adding a custom edge kind, or holding membership in the goal's metadata [INFERENCE][^1].

### When to use

Represent a goal as a custom-type issue with `metadata.goal` holding its planned start, date resolution, progress source, target metric and visibility, and keep weights in the goal's metadata keyed by member until Beads can write edge metadata [INFERENCE][^1].

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
