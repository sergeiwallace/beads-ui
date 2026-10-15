---
title: beads-ui: task-manager surfaces, the Claude Code mods ecosystem and one shared core
category: research
tags: [research, beads-ui, task-manager, claude-code-mods, mcp-apps, web-app, shared-core]
status: complete
source: "claude-fable-5-1-2026-10-15"
template_version: "research-1.2.0"
delegation_provenance:
  version: 2
  contributors: []
task: BU-mg2.1
related_docs:
  - docs/research/findings/beads-ui-task-manager-ux.md
  - docs/research/findings/beads-ui-mods-and-shared-core.md
  - docs/research/findings/beads-ui-beads-queue-and-panel.md
stub: false
---

# beads-ui: task-manager surfaces, the Claude Code mods ecosystem and one shared core

## Founding Ask Coverage

`canonical_root_json`: {"blob_oid":"f5025e8233d0e9cf98d5247ca1b32fae6055072c","capture_commit":"862bb3185e4261c88bcb97da4fcd576c56f3da02","content_sha256":"2c141587e57f0b478ffe5af64d48d3162949575f0353f15075909b1194423eb3","entry_ids":["A001","A002","A003","A004"],"generation":4,"path":"docs/asks/BU-epic-beads-ui-beads-task-manager-mg2.md","previous_ref_sha256":"d54b1990f5a07db79320fd99f0a6c0a0a7a371d2618644fbbc5e3af2249c97ed","repository":"beads-ui","schema_version":1,"task_id":"BU-epic-beads-ui-beads-task-manager-mg2"}

`founding_ask_ref_sha256`: d7668b63750bbee3253a47d99a0b4106aede21e1952bdce105a15f6a01dde937

The raw record is `docs/asks/BU-epic-beads-ui-beads-task-manager-mg2.md` in this repository, committed at `862bb31`. This index is non-authoritative; the raw FAR governs.

| Authoritative raw entry | Coverage and disposition |
|---|---|
| A001 (ORIGINAL-ASK, 2026-10-14T23:39:51Z) | The Beads task manager in the Claude Code TUI with Jira-like board, sprint, backlog, kanban, roadmap and timeline views, mouse drag, reorder and sort, create, update and delete behind an are-you-sure step, burndown and productivity analytics and dashboards, a view of every Claude Code session's tasks, inspiration from Jira, Linear, Todoist and Asana: sections 1, 2, 3 and 5. The retirement of the Claude Code task panel per machine profile with a data backup: section 6. The doc viewer and web-browser epics named in the same entry belong to other epics and are out of this doc's scope; the browser research it asked for is already landed in ai-harness and is cited in section 3. Public repo, Beads store committable: carried into the Recommendation. |
| A002 (FOLLOW-UP, 2026-10-14T23:40:00Z) | One repo `beads-ui` serving the TUI mod, the MCP UI app and the web app from shared code, with mobile and native desktop as later sub-epics: section 4 (how much one core can share) and the Recommendation. The `bv` alias and the separate doc-editor repo are out of this doc's scope. |
| A003 (FOLLOW-UP, 2026-10-14T23:40:01Z) | "mainly the web app, claude web / desktop mcp UI app, and claude code TUI for now": the three surfaces are the doc's scope; iOS, macOS and Linux are explicitly deferred to separate agents, in that order, and are not researched here. "lmk what you reocmmend": the Recommendation. |
| A004 (FOLLOW-UP, 2026-10-14T23:40:01Z) | The autonomous task queue and its dashboard are to be incorporated with beads-ui while the queue stays where it is: section 6 and the Recommendation. Where the queue should live is recorded as an Open Question for the design stage, as the entry asks. |

**Status:** complete

**Created:** 2026-10-15

**Task:** BU-mg2.1 (display id BU-research-beads-ui-jnxr), under epic BU-mg2

**Related docs:**
- `docs/research/findings/beads-ui-task-manager-ux.md` (leg A findings packet)
- `docs/research/findings/beads-ui-mods-and-shared-core.md` (leg B findings packet)
- `docs/research/findings/beads-ui-beads-queue-and-panel.md` (leg C findings packet)
- ai-harness `docs/research/claude-code-mods.md`, `docs/research/claude-code-mods-web-browser-in-the-tui.md`, `docs/designs/aih-xhc5u-claude-code-mods.md` (seed docs)
- ai-harness `docs/designs/autonomous-work-queue-coordinator-and-pwa-dashboard.md` (the queue design)

<!-- doc:region name="context" kind="immutable" -->

## Table of Contents

- [Context](#context)
- [Temporal Scope](#temporal-scope)
- [Executive Summary](#executive-summary)
- [1. What beads-ui should borrow from task managers](#1-what-beads-ui-should-borrow-from-task-managers)
  - [1.1 Views and behaviours worth copying](#11-views-and-behaviours-worth-copying)
  - [1.2 Drag, reorder and sort](#12-drag-reorder-and-sort)
  - [1.3 Create, edit and delete with an are-you-sure step](#13-create-edit-and-delete-with-an-are-you-sure-step)
  - [1.4 Analytics and dashboards for a fleet of sessions](#14-analytics-and-dashboards-for-a-fleet-of-sessions)
  - [1.5 Cross-session views](#15-cross-session-views)
  - [When to use](#when-to-use)
- [2. Web app building blocks and hosting](#2-web-app-building-blocks-and-hosting)
  - [2.1 React building blocks](#21-react-building-blocks)
  - [2.2 Open-source trackers to borrow from](#22-open-source-trackers-to-borrow-from)
  - [2.3 Running locally and hosting from templates](#23-running-locally-and-hosting-from-templates)
  - [When to use](#when-to-use-1)
- [3. The Claude Code TUI mod surface](#3-the-claude-code-tui-mod-surface)
  - [3.1 What a mod can draw and receive](#31-what-a-mod-can-draw-and-receive)
  - [3.2 Mouse and drag in the terminal](#32-mouse-and-drag-in-the-terminal)
  - [3.3 Prior art: mods that already read Beads](#33-prior-art-mods-that-already-read-beads)
  - [3.4 Constraints that shape the MVP](#34-constraints-that-shape-the-mvp)
  - [When to use](#when-to-use-2)
- [4. The MCP UI app surface (Claude Desktop and Claude web)](#4-the-mcp-ui-app-surface-claude-desktop-and-claude-web)
  - [4.1 What MCP Apps are and how Claude renders them](#41-what-mcp-apps-are-and-how-claude-renders-them)
  - [4.2 Reaching a local Beads store](#42-reaching-a-local-beads-store)
  - [When to use](#when-to-use-3)
- [5. One core across three surfaces](#5-one-core-across-three-surfaces)
  - [5.1 What a mod renders with](#51-what-a-mod-renders-with)
  - [5.2 Layers that can be shared](#52-layers-that-can-be-shared)
  - [5.3 Precedents](#53-precedents)
  - [5.4 The shareable fraction](#54-the-shareable-fraction)
  - [5.5 Package boundaries to test in the design](#55-package-boundaries-to-test-in-the-design)
  - [5.6 Monorepo tooling](#56-monorepo-tooling)
  - [When to use](#when-to-use-4)
- [6. The substrate: Beads, the autonomous task queue and the Claude Code task panel](#6-the-substrate-beads-the-autonomous-task-queue-and-the-claude-code-task-panel)
  - [6.1 Beads data model and access routes](#61-beads-data-model-and-access-routes)
  - [6.2 The autonomous task queue and its dashboard](#62-the-autonomous-task-queue-and-its-dashboard)
  - [6.3 The Claude Code task panel, its backup and its retirement switch](#63-the-claude-code-task-panel-its-backup-and-its-retirement-switch)
  - [6.4 Other fleet surfaces that read Beads](#64-other-fleet-surfaces-that-read-beads)
  - [When to use](#when-to-use-5)
- [Gaps, blindspots and emergent findings](#gaps-blindspots-and-emergent-findings)
  - [Emergent findings beyond the question list](#emergent-findings-beyond-the-question-list)
  - [Blindspots the research could not resolve](#blindspots-the-research-could-not-resolve)
  - [Contrarian evidence](#contrarian-evidence)
  - [Alignment with the founding ask](#alignment-with-the-founding-ask)
- [Comparison](#comparison)
- [Recommendation](#recommendation)
- [Open Questions](#open-questions)
- [Sources](#sources)
- [Ambiguous Items from Auto-Remediation (Post-Run Review)](#ambiguous-items-from-auto-remediation-post-run-review)
- [Appendix: Research Prompt](#appendix-research-prompt)
- [Appendix: Provenance Ledger](#appendix-provenance-ledger)
- [Run History](#run-history)

## Context

Sergei asked on 2026-10-14 for a Beads task manager inside the Claude Code TUI, built as a Claude Code mod, with the board, backlog, sprint, roadmap and analytics views of a Jira-like product and mouse control, and for the same product as an MCP UI app in Claude Desktop and Claude web and as a local or hostable web app, all from one public monorepo named `beads-ui`. The fleet's task store is Beads (`bd`), and the end state retires the Claude Code task panel per machine profile. This document is the research stage of the epic's `/orchestrate` `/auto-flow` run: three Opus researcher leaves gathered evidence into tracked findings packets under `docs/research/findings/`, and the Fable coordinator authored this synthesis. The design doc that follows it cites this document.

**Primary period:** 2026, with 2025 for the component libraries and products whose current releases confirm the facts
**Source weighting:** 2026 primary (Claude Code mods and MCP Apps are weeks to months old); 2025 secondary; 2024 and earlier background only, except for UX patterns and libraries that have not changed

<!-- /doc:region name="context" -->

<!-- doc:region name="body" kind="replaceable" -->

## Temporal Scope

Primary focus: 2026 sources. Claude Code mods shipped in early October 2026 and changed twice on 2026-10-14; MCP Apps has been a stable extension since 2026-01-26; Beads 1.3.0 was released on 2026-09-15. Component libraries, task-manager product documentation and hosting templates are cited from their current pages, with 2025 releases accepted where the current release confirms the fact. Earlier material appears only as foundational background (Figma's 2017 fractional indexing post, the 2018 Nielsen Norman confirmation-dialog guidance, WCAG 2.2). Every adoption figure (stars, releases, downloads) is a 2026-10-15 snapshot and should be re-read before it is relied on. Reviewer sentiment for the task-manager products could not be gathered: G2 returned 403 and Reddit refused the fetch, so "what users praise" rests on documented features. [NO SOURCE]

## Executive Summary

1. A Claude Code mod draws a fixed element tree that Claude Code renders with Ink; it has no DOM, no React runtime and no Node, and the only bare import is `claude-code`. Drag and drop is feasible, but only inside a `Client` element with pointer capture, and only under fullscreen rendering; in tmux the pointer resolves to whole cells. So the web app and the MCP App can share React components, and the mod can share only DOM-free, timer-free TypeScript: data access, domain logic, view models, command tables and token names. Leg B's defended estimate is 35 to 45 percent of the code shared by all three surfaces and 75 to 85 percent by at least two. [VERIFIABLE][^1] [INFERENCE]
2. Beads 1.3.0 already supplies most of the data primitives a task manager needs: a published JSON Schema, stale-write guards (`--if-status`, exit 13), an atomic `bd batch`, a delete preview with opt-in `--cascade`, lease commands, an events audit table and `bd serve`, a loopback HTTP API with an OpenAPI v0 contract and an SSE stream. It has no sprint, rank or story-point field, so sprints and board order are conventions beads-ui must define, and it resolves only hash ids, so every create path must mint the fleet's display id. `bd serve` skips hooks and has no TLS. [VERIFIABLE][^2] [VERIFIABLE][^3]
3. The ai-harness autonomous work queue is live on this host and already has a React SPA with Board, Epics, Review, Sessions, Inbox and Task-detail views over every repo's Beads, served by ai-core's `/api/queue/*` routes with SSE. Its projection answered 11,388 tasks in 1.97 s while a whole-store `bd list` timed out under load. beads-ui's board and that SPA overlap view for view; the queue's session registry and leases are the only source of the per-session ownership facts a cross-session view needs. Which of the three integration shapes to pick is a design decision. [VERIFIABLE][^2] [INFERENCE]
4. The Claude Code task panel exists on this fleet only because `settings.template.json` sets `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`; on models newer than Opus 4.7 the Task tools are off by default. The per-machine retirement switch is that one env key per profile plus bare-name deny rules for older models, and the backup is a file copy of `~/.claude/tasks/` (625 JSON files in 86 lists here). One list holds employer-session data, so the backup cannot live in the public beads-ui repo. [VERIFIABLE][^2]
5. The proposed names collide: `beads-ui` is a 755-star MIT Beads web UI on npm (command `bdui`) and `bv` is Beads Viewer's Homebrew binary, whose licence rider denies rights to Anthropic and anyone acting for it. The GitHub repo name is unaffected; an npm package needs a scope, the `bv` alias needs a rethink, and Beads Viewer is patterns-only. [VERIFIABLE][^3] [VERIFIABLE][^2]

The recommendation, in one line: build the three surfaces in one monorepo around a DOM-free core, start with a read-mostly TUI mod that reads `bd --json` and writes through guarded `bd update`, make the web app the queue dashboard's missing Phase 2 instead of a second board, and land the panel retirement switch in ai-harness as an env-key drop per machine profile. The details and the decisions this leaves to the design doc are in the Recommendation.

## 1. What beads-ui should borrow from task managers

Leg A surveyed Jira, Linear, Todoist, Asana, GitHub Projects, Plane and OpenProject from their own documentation, and the terminal tools kanban-tui, taskwarrior-tui, lazygit, k9s, dooit and Beads Viewer. Its packet is `docs/research/findings/beads-ui-task-manager-ux.md`; every claim below is cited there with a live-checked source. [VERIFIABLE][^3]

### 1.1 Views and behaviours worth copying

Five patterns stand out. Linear's board groups by status by default and regroups by project, priority, cycle or label, with swimlane rows on teams, cycles, assignee or project health; Cmd/Ctrl B toggles board and list; Shift V opens display options. Jira's backlog ranks by drag, sends an item to the top or bottom from a menu, selects ranges with Shift and opens a bulk-edit sidebar; a Scrum backlog drags an item into a sprint section. GitHub Projects builds board columns from "any single select or iteration field", adds slice-by panels and field sums per column, and its roadmap places items by a start and target date and drags to reschedule. Todoist's Quick Add parses dates, `#Project`, `%label`, `p1` to `p3`, `+person` and `/section` from one line. Plane shows one dataset through List, Board, Calendar, Table and Timeline layouts, where board drag sets status, calendar drag sets the due date and the timeline drags dates and shows dependencies. [VERIFIABLE][^3]

The products also document what to avoid. Jira hides work in an unmapped status and counts only the right-most column as complete; a board that builds one column per `bd statuses` entry and decides "complete" by the `done` category avoids both. Linear keeps one manual order for the whole workspace, so one person's drag reorders everyone's board, and board and list cannot hold different orders. Linear's closed cycles keep no unfinished issues. WIP limits in Jira and GitHub are soft, so for agents that claim work automatically a limit that only colours a header stops nothing; a hard limit must be enforced where claims happen. [VERIFIABLE][^3] [INFERENCE]

This store already has nine statuses: the seven built in (`open`, `in_progress`, `blocked`, `deferred`, `closed`, `pinned`, `hooked`) and two custom (`review`, `uat`), each with a category of `active`, `wip`, `frozen` or `done`; the schema enum omits the custom ones, so a UI must read `bd statuses` and `bd types` to build its columns. [VERIFIABLE][^2]

### 1.2 Drag, reorder and sort

Every drag in the surveyed products is a field write with a visual preview: across columns it writes the column's field, within a column it writes a rank, on a timeline it writes dates. GitHub states the rule directly: "If you drag an item to a new column, the value of that column is applied to the dragged item." [VERIFIABLE][^3] In Beads the column field is status, and `bd update -s closed` refuses to close an issue with open children or a live blocker unless `--force` is passed, so a drop of an epic into Done fails on real data and the UI needs a refusal state. [VERIFIABLE][^3]

Manual order has no Beads field. Leg A's answer is a fractional index in metadata (the `fractional-indexing` package generates string keys between two points and recommends jitter against concurrent collisions), at the cost of one Dolt commit per reorder under the default auto-commit policy. Leg C measured the same absence: no rank, sprint or story-point field, and `bd list --sort` orders only by priority, created, updated, closed, status, id, title, type or assignee. [VERIFIABLE][^3] [VERIFIABLE][^2]

Conflicts have a built-in guard. `bd update --if-status` and `--if-assignee` write nothing on a mismatch and exit 13, "another actor won the race"; TanStack Query's optimistic-update pattern (write the cache in `onMutate`, restore in `onError`, invalidate in `onSettled`) pairs with it to give a compare-and-set drop loop with no server lock. Bulk moves trade atomicity for guards: `bd batch` is all-or-nothing in one Dolt transaction but has no stale-write guard, while per-id `bd update --if-status` is guarded but can partly succeed. [VERIFIABLE][^3]

Accessibility fixes the keyboard path. WCAG 2.2 criterion 2.5.7 requires every dragging function to be achievable "by a single pointer without dragging"; Atlassian's Pragmatic drag and drop guidance asks for a menu of outcomes on each item and advises against arrow-key dragging, while dnd-kit's keyboard sensor uses Space, arrows and Escape. A "Move to" menu on every card satisfies the criterion and is also the only drag substitute a terminal pane can offer. [VERIFIABLE][^3] [INFERENCE]

### 1.3 Create, edit and delete with an are-you-sure step

Sergei asked for an "are you sure?" step before a delete, and the evidence supports it for Beads specifically: `bd delete` removes dependency links, rewrites references to `[deleted:ID]` and then deletes "Permanently", with no trash. Without `--force` it only previews; by default it fails if any issue has dependents outside the deletion set; `--cascade` deletes dependents and `--force` alone orphans them. The preview maps onto the confirmation page: show `bd`'s own dry-run list so the user sees exactly what a cascade removes. [VERIFIABLE][^3] Nielsen Norman's guidance reserves confirmation dialogs for actions that cannot be undone and warns against them for routine actions; Linear keeps deleted issues 30 days with Cmd/Ctrl Z undo; GitHub requires a typed repository name for its irreversible delete. So the ladder leg A proposes is undo for close, a modal for delete, a typed id for cascade, with "Close as won't do" covering most delete intents reversibly. [VERIFIABLE][^3] [INFERENCE] For an epic with children the UI needs three explicit choices: cancel, delete the epic and orphan the children, or delete everything. [INFERENCE]

Fast creation is text-first everywhere: Todoist parses one line, Linear turns a pasted list into sub-issues, mantoni's Beads UI edits inline. A quick-add grammar mapping tokens to `bd create` flags serves all three surfaces, and the mod's `Input` element submits a line on Enter. [VERIFIABLE][^3] [INFERENCE]

### 1.4 Analytics and dashboards for a fleet of sessions

For autonomous assignees, the Kanban Guide's four flow measures (WIP, throughput, work item age, cycle time) fit better than a story-point burndown, because a points burndown measures a sprint commitment nobody made. Jira's burndown plots the board's estimation statistic; its cumulative flow diagram is "an area chart that shows the various statuses of work items"; its control chart plots cycle time per item with a rolling average and spread band. Linear Insights measures issue count, effort, cycle time, lead time, triage time and age, with counts as bars and durations as scatterplots. [VERIFIABLE][^3] Two agent-specific measures sit on top: cost per closed issue, joinable because Claude Code exports `claude_code.cost.usage` and token metrics tagged with `session.id` and `bd update --session` records a session id at close; and time in the human-review statuses `review` and `uat`, which is the agent-era bottleneck. Work item age matters most, because a crashed session leaves a claim that looks like progress; `bd heartbeat`, `reclaim` and `stale` turn an aging-WIP chart into a stuck-agent detector. [VERIFIABLE][^3] [INFERENCE]

The inputs exist. Beads keeps three history surfaces: `bd history <id>` (Dolt commit snapshots), `bd history --events` (the `events` audit table with whole-issue before and after JSON, kept indefinitely) and `bd events` (the durable journal, off by default and off in this store, 7-day retention). Burndown and cycle time should read `events` or Dolt history; live updates should read the journal or the HTTP stream. [VERIFIABLE][^2] [INFERENCE] Leg A's widget table: throughput per week as bars, cycle time as a scatterplot with a rolling average, cumulative flow as stacked areas by status category, sprint progress as a count-based burndown or burn-up, aging WIP against the lease, and cost per issue as a table. [VERIFIABLE][^3]

### 1.5 Cross-session views

Linear has the clearest model for mixed human and agent work: assigning an issue to an agent "sets it as the `delegate`, not the `assignee`", every view filters or slices by either, and an agent session should "Emit a `thought` activity within 10 seconds". GitHub lists Copilot agent sessions in a panel with per-session logs and token usage. [VERIFIABLE][^3] Beads has one assignee field, so a board of sessions needs a convention for which actor it names; `bd update --claim` atomically sets assignee and `in_progress`, and `assign`, `unclaim`, `heartbeat` and `reclaim` complete the set. A board grouped into swimlanes by assignee with columns by status category shows every session's assigned, in-progress and done work; the human-versus-agent split can live in a metadata key with no schema change. [VERIFIABLE][^3] [INFERENCE] One existing tool already reads Claude Code's own task files: kanban-tui's `claude` backend builds a board per session id from `~/.claude/tasks/`. [VERIFIABLE][^3] A mod cannot be that source on its own, because `$.agent.list()` returns "this session's subagents and teammates" only. [VERIFIABLE][^1] The queue's session registry (section 6.2) is the fleet's actual record of which session holds which task. [INFERENCE]

### When to use

Copy a pattern when its data lives in Beads today (status columns, assignee swimlanes, flow metrics from `events`, a guarded drop) and defer one when it needs a convention first (sprints, manual rank, a human-owner field). [INFERENCE]

## 2. Web app building blocks and hosting

### 2.1 React building blocks

Leg A read maintenance signals from the GitHub GraphQL API on 2026-10-15. For drag and drop, Pragmatic drag and drop (Apache-2.0, 12,783 stars, pushed 2026-10-14, a 4.7 kB core, and Atlassian's own choice for Trello, Jira and Confluence) and dnd-kit (MIT, 17,711 stars) lead; react-beautiful-dnd is archived and deprecated. For data, TanStack Table, Virtual and Query are MIT and released within the week; Zustand and Jotai carry one or two open issues against tens of thousands of stars. For primitives, shadcn/ui switched its default to Base UI in July 2026 ("Starting today, Base UI is the default component library in shadcn/ui", with Radix still supported), so a new project generated with the shadcn CLI starts on Base UI; `cmdk` still works but last released 2025-03-14. For timelines, Frappe Gantt is MIT with drag, resize and `move_dependencies`; vis-timeline is dual-licensed and active but carries 266 open issues; SVAR React Gantt is exploratory at 214 stars; Planby is now "Custom License - All Rights Reserved" and gantt-task-react is archived. For charts, Recharts, visx and Apache ECharts are permissive and active, Observable Plot last released 2025-02-14 and Tremor's repository has not been pushed since 2025-10-10. FullCalendar, react-big-calendar and Schedule-X are MIT and active for a due-date calendar. [VERIFIABLE][^3]

One fleet fact bears on the choice: app-portal already uses React 19, Tailwind CSS 4 and shadcn-derived components, so reusing its tokens is a design choice, not a research finding. [VERIFIABLE][^3]

### 2.2 Open-source trackers to borrow from

The general-purpose clones are UX references, not code donors, because most are AGPL (Plane, Leantime, Vikunja, Taiga), GPL (OpenProject), EPL (Huly) or source-available (Planka); only Wekan and Kanboard are MIT, on stacks unlike a React monorepo. Plane is the strongest UX reference (60,851 stars, the five-layout switcher, cycle charts) and OpenProject the reference for dependency-aware Gantt scheduling. Hosted Huly has shut down and Focalboard is "currently not maintained", a sustainability signal that supports MVP-first phasing. [VERIFIABLE][^3]

The closest prior art is the Beads ecosystem itself. mantoni's `beads-ui` (MIT, 755 stars, Express 5 and lit-html, `npm i beads-ui -g` then `bdui start --open`) has Issues, Epics and a Board with Blocked, Ready, In progress and Closed columns, live updates and inline editing; its view layer would not carry over to React. bead-me-up-scotty (MIT, 150 stars, Next.js) already drags cards between columns and writes with `bd update --status`, `bd close` and `bd delete` behind a confirmation. Beads Viewer (Go TUI, 1,713 stars, binary `bv`) adds a rider to MIT under which "no rights are granted to any Restricted Party", Anthropic included, and whose definition of use covers analysis in automated pipelines; a Claude-built project should treat it as patterns-only and not reuse its code, binary or robot API. [VERIFIABLE][^3] [VERIFIABLE][^1] Leg B's verdicts: borrow baselane-sh/mods' read helper and build-per-plugin pattern, mantoni's board and epic views, and bead-me-up-scotty's drag-to-status mapping. [VERIFIABLE][^1]

### 2.3 Running locally and hosting from templates

Comparable Beads-adjacent tools ship one install command first (`npm i beads-ui -g`, `npx vibe-kanban`, `brew install ... bv`) and a Docker Compose file second; Plane's stack needs 4 GB of RAM, which is heavy for a single-user tool, and Vikunja's one-container SQLite mode is the closest analogue to a file-backed store. [VERIFIABLE][^3] The backend constraint is `bd serve`: it binds loopback with auth off by default, `--allow-non-loopback` requires a token file, it has no TLS, it refuses `--readonly`, and hooks do not fire on its writes. So a hosted beads-ui is a long-running process with a persistent volume behind a TLS and auth layer, and static or serverless hosts (Cloudflare's and Vercel's deploy buttons) fit only the client bundle. Docker Compose, a Railway template, a Render `render.yaml` Blueprint and a Fly.io `fly.toml` fit when the service has a volume. AWS CDK, Copilot, App Runner and Helm were not researched. [VERIFIABLE][^3] [NO SOURCE]

Auth stacks by exposure: loopback with no auth for one machine; Tailscale Serve for TLS and identity headers across a tailnet (headers absent for tagged devices); oauth2-proxy (MIT, 15,185 stars, v7.15.5 on 2026-10-01) or Pocket ID (passkeys, BSD-2-Clause) in front of `bd serve` with a token for the open internet; Caddy's `basic_auth` only over HTTPS. [VERIFIABLE][^3] [INFERENCE] The MCP App needs no web hosting of its own, because its server delivers the bundle as a `ui://` resource. [VERIFIABLE][^3]

### When to use

Ship the local one-command path first, Docker Compose with a volume second, and a tailnet or OAuth-proxied deployment third; publish deploy buttons only for the static client. [INFERENCE]

## 3. The Claude Code TUI mod surface

### 3.1 What a mod can draw and receive

A mod is a plugin made of JavaScript or TypeScript event handlers that run inside the Claude Code process; Anthropic's overview defines it as "a plugin that changes how Claude Code looks and behaves" and says "Mods work in the Claude Code CLI and in the Code tab of the Claude Desktop app." [VERIFIABLE][^4] The mod answers a `ui.render` event with an element tree. The interface page: "What a `ui.render` hook returns is an element tree: a description of what to draw, made of boxes, text, and controls nested inside each other. You describe the drawing, and Claude Code renders it in the terminal or the Desktop app." [VERIFIABLE][^5]

The element set is fixed and is listed per surface. `Box`, `Text`, `Button`, `Link`, `Code` and `Markdown` draw everywhere; `Input`, `Select` and `Client` draw in the terminal and the Desktop app; `Svg` draws in the Desktop app only; `Raster` and `Image` draw in the terminal only. [VERIFIABLE][^5] There is no DOM, no HTML element and no web view; a tree that uses an unknown element or prop is refused and "Claude Code draws its own version of the site." [VERIFIABLE][^5] So a board column is a `Box` with `flexDirection: 'column'`, a card is a `Box` with a `borderStyle` holding `Text` and `Button` children, and the layout props available are flex props such as `flexDirection`, `columnGap`, `padding` and `width`. [VERIFIABLE][^5]

A mod's module can be a `.tsx` file and write the tree as JSX, but the elements come from `$.ui.resolve(e)`, not from React: "If your module is a `.tsx` or `.jsx` file, you can write the tree as JSX. Destructure the elements from `$.ui.resolve(e)` first." [VERIFIABLE][^5] This is the fact that bounds code sharing with the web app (section 5): the JSX syntax can be shared, the React runtime and React components cannot. [INFERENCE]

State has three tiers. A module variable lasts until the module reloads; `$.state` is reactive session state that redraws the sites that read it and survives a reload but is reset by `/clear`, `/resume` and `/branch`; `$.store` is a per-plugin JSON key-value store under `~/.claude/plugins/store/` that every session on the machine shares and whose `get` then `set` "isn't atomic". [VERIFIABLE][^5] For beads-ui, Beads itself is the record and `$.store` holds only view preferences, so that race is a bounded concern. [INFERENCE]

Render sites that matter for a task manager are the pane and the band above the prompt. A pane "is a sidebar beside the transcript in a wide fullscreen terminal, or a framed region above the prompt otherwise. With several panes open, each gets a tab that shows its title." [VERIFIABLE][^5] A pane the mod opens on its own appears "only in a terminal at least 144 columns wide. After the user has opened that pane once themselves, 110 columns is enough"; a pane opened by a user action appears at any width. [VERIFIABLE][^5] The band is one shared slot across every mod. [VERIFIABLE][^5] A mod can also take over `/commands` with no Claude turn, which is how `/bv` or `/beads` would open the board. [VERIFIABLE][^4]

Claude Code owns the keyboard model. "Your mod never reads the keyboard itself." Tab moves between controls, Up and Down move or scroll, Enter presses or submits, a `Button` may carry one digit or lowercase hotkey, Esc returns focus to the prompt, Ctrl+X then an arrow resizes the pane, and "A mod can't bind Tab or the arrow keys to anything else". [VERIFIABLE][^5] A board that wants vim-style `h j k l` movement can have it through hotkeys; arrow-key card movement cannot be rebound. [INFERENCE]

Where mods run bounds the audience. Hooks run everywhere the plugin loads, "whichever provider serves the model, including Amazon Bedrock", but drawing appears only in a terminal session and in the Desktop app's Code tab; the VS Code chat panel, `claude -p`, the Agent SDK and cloud sessions run hooks and draw nothing. [VERIFIABLE][^4] The terminal floor is Claude Code 2.1.287 and the Desktop floor is 2.1.286. [VERIFIABLE][^4] Mods are not sandboxed: "A mod is code that runs with your permissions. It can read and write your files, start processes, and make network requests." [VERIFIABLE][^4] The fleet's own mods research, measured on this host on 2026-10-10 to 2026-10-12, adds the limits a board must respect: a hook's own code gets 10 seconds per event, `$.fs` reads and writes cap at 4 MiB, `$.http.fetch` bodies cap at 4 MiB with 30 seconds per call, text in one tree draws up to its first 100,000 characters, and redraws are throttled to 10 a second, or 30 in the terminal for the visible pane. [VERIFIABLE][^6]

### 3.2 Mouse and drag in the terminal

Pointer input exists on exactly one element. `Client` is "A region drawn by a second file of yours, for animation and pointer input. That file gets no mods API. It reaches your hooks by posting data, which arrives as a `ui.message` event." [VERIFIABLE][^5] The public type declarations give the contract: a `ClientModule` runs on the drawing thread with local `state`, `setState`, `columns`, `rows`, an `every(ms, fn)` frame clock, `onPointer` with pointer types `down`, `move`, `up`, `enter` and `leave`, and `onKey`; "Escape never arrives: it returns the focus." [VERIFIABLE][^6] A pointer event carries cell coordinates and, where the terminal supports it, a sub-cell position: "kitty, Ghostty, iTerm2, WezTerm and foot do; tmux passes none through." After a `down` the instance holds the pointer until the `up` and "every `move` reaches it", which is what a drag needs. [VERIFIABLE][^7] Three `setState` calls on three consecutive renders with no input between them count as a render loop and unmount the `Client`. [VERIFIABLE][^6]

Outside a `Client`, the mouse does less: a click gives a pane keyboard focus, and buttons are pressed by hotkey or Enter. [VERIFIABLE][^5] Fullscreen rendering is the mode that "adds mouse support"; it "works inside tmux", where wheel scrolling needs tmux's `set -g mouse on`, and it is incompatible with iTerm2's `tmux -CC` mode. On Bedrock sessions, which fetch no feature flags, the default renderer depends on the machine's first-launch version. [VERIFIABLE][^7] On this host the fleet's sessions run inside tmux on a remote machine, so the design must plan for fullscreen rendering with tmux mouse mode on, keep a keyboard path for every drag, and accept that sub-cell pointer precision is unavailable under tmux. [INFERENCE]

The fleet's browser research reached the same conclusion for a board: "Drag-and-drop, which beads-view wants, is supported: pointer capture between `down` and `up` is exactly a drag. It needs fullscreen rendering." [VERIFIABLE][^7] One consequence for the MVP is that the draggable board is a `Client`, drawn by a second file on the drawing thread with no mods API, which posts "move card X to column Y" messages back to the hook that owns the Beads write. [INFERENCE]

### 3.3 Prior art: mods that already read Beads

The fleet's browser-in-the-TUI research surveyed the mods that show tasks or Beads. The `baselane-sh/mods` Beads family (MIT) offers `beads-pane`, a live side pane of in-progress, ready and blocked issues opened with `/beads`, an `epics-pane`, six bands (counts, the bead in progress, done percent, closed today, open by priority), `/ready`, `/bead <id>`, `/beads-standup`, and `beads-guard`, which asks before destructive `bd` commands. It is read-only ("No beads mod creates, changes or closes a bead"), needs `bd` 1.2 or later, and reads `bd status --json` and `bd ready --json`. Alongside it: `Ascurse/bead-band` (0 stars), `Storybloq` (a ticket board over a `.story/` directory), `alexadark/claude-code-kanban` (a kanban over a JSON board, 1 star), `cbruyndoncx/claude-tasknotes-renderer-mod` (kanban, list, agenda and dependency-graph views of Obsidian tasks as SVG in the Desktop app, MIT) and `scasella/claude-flightdeck` (an agent dashboard with cards and swimlanes, 85 stars, MIT). "None of these writes to Beads, and none was found that drags cards with the mouse." [VERIFIABLE][^7]

So the read side has a working, MIT-licensed pattern to start from, and the write path, the drag and the sprint and roadmap views are new work. The fleet's own mods design also set the packaging rule beads-ui's mod inherits if it is installed through ai-harness: one plugin per mod, TypeScript with no build step, `claude plugin test` in the gate, `claude plugin validate --json` diffed against a per-mod allowlist in pre-commit, and a read-tool allow-list for any mod that calls an MCP server with `$.mcp.call`, because that call borrows the session's credentials and raises no prompt. [VERIFIABLE][^6]

### 3.4 Constraints that shape the MVP

Four facts bound the first surface. A pane in a 100 to 160 column terminal holds three to five columns of cards at a readable width, and a 100,000 character tree cap means a large backlog has to be paged or filtered, never drawn whole. [INFERENCE] Writes to Beads must go through a hold-and-ask step or a confirmation element, because a mod can act without a prompt; this is also where Sergei's are-you-sure delete step lives. [INFERENCE] Every drawing path must have a text fallback for the Desktop app (no `Raster`) and a keyboard fallback for sessions without mouse mode. [INFERENCE] And a mod cannot be an MCP Apps host: the fleet's research recorded that "Claude Code is not an MCP Apps host", so inside Claude Code the mod is the only interactive route, and the MCP UI app of section 4 is a second surface with its own renderer. [VERIFIABLE][^6]

### When to use

The mod is the right surface when the user is already inside a Claude Code session and wants to see or move the tasks that session and its siblings are working on, without leaving the terminal. It is the wrong surface for analytics that need dense charts (terminal `Raster` tops out at 512 by 256 cells with a reduced palette), for anything that must run in the VS Code chat panel or a cloud session, and for users who are not running Claude Code at all. [INFERENCE]

## 4. The MCP UI app surface (Claude Desktop and Claude web)

### 4.1 What MCP Apps are and how Claude renders them

Anthropic's design guidelines define the surface: "MCP Apps are interactive interfaces that appear within Claude's conversational flow." An app "appears in the conversation as an inline card, an inline carousel, or a full screen view", and the modes are declared by the app and negotiated with the host: "Declare which modes your app supports through `appCapabilities.availableDisplayModes` in `ui/initialize`. The host responds with the modes it supports, and your app can request a switch with `ui/request-display-mode`. Modes are `inline`, `fullscreen`, and `pip`." [VERIFIABLE][^8] The full-screen mode is the one a board needs; the guidelines list "Data visualizations and dashboards", "Detailed analysis tools" and "Document editing" as its uses, with the constraints that "Your app provides its own fullscreen button, and a close button appears in the native header bar", "The composer is always visible, so design your UX to work with it", and "No floating panels, so use collapsible sidebars, tabs, or pagination to disclose details". [VERIFIABLE][^8]

Inline cards are deliberately small: "Height auto-fits to content, with no nested scrolling", "At most 2 actions, placed at the bottom of the card", "At most 4-5 data points", "No drill-ins, breadcrumbs, or multiple views", "No menus or popovers, only visible controls". [VERIFIABLE][^8] The guidelines steer away from exactly the controls a desktop task manager leans on: "Menus and popovers: dropdowns, context menus, and popover panels can get clipped by container boundaries or create z-index conflicts with the host UI, so prefer visible controls like segmented buttons, toggles, or inline options". [VERIFIABLE][^8] So the MCP UI app is the same React board as the web app, in full-screen mode, with menus replaced by segmented controls and detail panels replaced by a collapsible sidebar. [INFERENCE]

The sandbox and network rules are strict. "All external origins are blocked by default. Declare the origins each `ui://` resource needs through `_meta.ui.csp`", and "The `frameDomains` field, for embedding third-party iframes, is restricted in Claude pending security review." [VERIFIABLE][^8] Theming comes from the host: "MCP Apps automatically receive style variables from the host client. Reference these CSS custom properties to create interfaces that feel native to Claude", and "All views must support both light and dark themes. Use the host's style tokens, which adapt automatically, and never hardcode colors." [VERIFIABLE][^8] The token names are published (for example `color-background-primary`, `color-text-primary`, `font-text-md-size`, `border-radius-md`), which gives the shared theme layer of section 5 a concrete target: beads-ui's own design tokens map onto these variables in the MCP UI app, onto its own CSS variables in the web app, and onto Claude Code theme keys and ANSI colours in the mod. [VERIFIABLE][^8] [INFERENCE]

Two further facts matter for later surfaces. On mobile "Claude renders apps in a native WebView, `WKWebView` on iOS and `WebView` on Android, rather than a sandboxed iframe", and "users must add a connector on web or desktop before it appears on mobile". [VERIFIABLE][^8] And the interaction split the guidelines prescribe fits a task manager: "If the interaction requires language understanding or generates a response from Claude, it goes through chat. If it's a direct UI action on content your app already controls, handle it in the app." [VERIFIABLE][^8]

### 4.2 Reaching a local Beads store

An MCP App is UI served by an MCP server: "You build one with the MCP Apps SDK as part of your own MCP server, so it reaches people the same way the rest of your plugin's connector does." [VERIFIABLE][^9] Claude Desktop runs such a server locally from its configuration file: "Connecting an example server means adding its entry to Claude Desktop's configuration file, so that the desktop app runs the server locally with `npx`", with a config entry of the form `"command": "npx", "args": ["-y", "<package>", "--stdio"]`. [VERIFIABLE][^9] So on a machine that holds a Beads store, a `beads-ui` MCP server started over stdio by Claude Desktop can read and write that store directly through `bd` or Dolt, and the board renders in the Desktop conversation. [INFERENCE]

claude.ai has no local process, so the same server must be reachable over HTTP. The getting-started page shows the remote shape ("To test a remote MCP App locally, connect to it through a proxy such as mcp-remote") and ties the sandbox origin to the server URL: "For Claude, the value is the first 32 hex characters of the SHA-256 of your server URL, followed by `.claudemcpcontent.com`." [VERIFIABLE][^9] For the fleet that means the web app's own server (section 2.3) doubles as the remote MCP server, exposed on the tailnet or through a tunnel, and the MCP App is one more client of it. [INFERENCE] Beads upstream offers two routes a server can use: the embedded Dolt store ("Dolt runs in-process, data lives in `.beads/embeddeddolt/`, single writer") and a remote mode ("A workspace can also talk to a remote `bd serve` over HTTP instead of opening a local Dolt database"). [VERIFIABLE][^10] Which route the design picks for a machine that hosts several Claude Code sessions is a decision for the design doc; the single-writer constraint on the embedded store is the fact that forces it. [INFERENCE]

The SDK keeps one codebase across hosts: "On the server, register your tools and resources with `registerAppTool()` and `registerAppResource()`, which generate each host's metadata for you. In the app, call `App.connect()` without a transport argument, and the SDK detects the host and picks the transport." The examples ship in "vanilla JS, React, Vue, Svelte, and more", so a React board is a supported shape. [VERIFIABLE][^9] The user grants display once per server: "Claude asks for permission to display the app. Click **Allow**, or **Always allow** for a server you trust". [VERIFIABLE][^9]

### When to use

The MCP UI app is the right surface when Sergei is in a Claude Desktop or claude.ai conversation and wants to see or change tasks without opening a terminal or a browser tab, and when a Claude turn should be able to hand the user a board to act on. It is the wrong surface for heavy keyboard work and for anything that needs a context menu or nested navigation. [INFERENCE]

## 5. One core across three surfaces

### 5.1 What a mod renders with

Leg B settled the fact that bounds the whole architecture. A mod's JSX compiles against Claude Code's own `h` and `Fragment`; the public type declarations say "`h` and `Fragment` (what JSX compiles against)" and the suggested `tsconfig.json` sets `"jsxFactory": "h"`. The runtime has "no DOM, no Node", the terminal surface "is Ink, which draws" the tree, and remote surfaces such as the Desktop app draw the same tree themselves. [VERIFIABLE][^1] So React does not run inside a mod: the JSX builds Claude Code's frozen element records, the mod brings no reconciler, and it gets Ink's flex layout and nothing else. [VERIFIABLE][^1]

Two further limits shape the shared core. A hooks module may import only its own files by relative path, and "The one bare import allowed is `claude-code`"; a third-party npm package can run only as a copy inside the plugin folder, and only if it needs no timers, Node built-ins or DOM. [VERIFIABLE][^1] A practitioner reports that "A module file over 1 MB is not read", while another bundles to about 900 KB minified and loads. [VERIFIABLE][^1] Claude Code 2.1.299 (2026-10-14) lets a hook hand `$` to a function imported from another file of the mod, which the create page still describes as a validation failure; the changelog's fix makes a multi-file shared core loadable. [VERIFIABLE][^1]

### 5.2 Layers that can be shared

Leg B's layer table is the clearest statement of what "one core" can mean. Data access to Beads is shared as argument builders, JSON parsers and validators across all three surfaces, while the transport differs: the mod runs `bd` through `$.process.run` or calls an MCP server through `$.mcp.call`, the MCP App calls `tools/call` through its host, and the web app has its own server running `bd`. Domain logic (columns, sort, filter, rank, burndown, the dependency graph) is pure TypeScript shared by all three. View models are shared as pure reducers and selectors; React state libraries reach only the two DOM surfaces. The command catalog is shared as data, with bindings per surface (`Button` hotkeys and `Client` `onKey` in the mod, DOM key events elsewhere). Layout is shared by the two DOM surfaces only (`Box` flex props in the mod, CSS elsewhere). Theme is shared as semantic token names, with values per surface (theme keys or raw colours in the mod, Claude's CSS variables in the MCP App, the app's own tokens on the web). Components are shared between the MCP App and the web app only. [VERIFIABLE][^1]

That table corrects one line of the repo's own README, which plans a core of "data access, state, layout and theme": layout cannot be shared with the mod, and only part of the state code can. [VERIFIABLE][^1] Whether TanStack Query core, Zustand's vanilla store or XState run without timer globals was not checked; a one-file import probe under `claude plugin test` would settle each. [NO SOURCE]

### 5.3 Precedents

The largest codebase found that targets a terminal and the web from one core is opencode (213,531 stars): its TUI uses OpenTUI with Solid, its web app is a Solid DOM app, and the two share `@opencode/client`, schema, core, util and plugin packages while keeping separate UI code per surface; the TUI imports `@opencode/ui` only for audio files. [VERIFIABLE][^1] OpenTUI itself ships `@opentui/keymap`, a keymap engine for terminal and DOM apps. [VERIFIABLE][^1] The other precedents share everything by putting a terminal UI on the web: Textual with textual-serve, Ratzilla (Ratatui in the browser through WebAssembly) and Bubble Tea with Wish over SSH. Ink is a React renderer with no web counterpart of its own, and react-blessed and react-nil are dormant. [VERIFIABLE][^1] Claude Code's mods follow a third pattern, one element tree that Ink and the remote surfaces each draw. [VERIFIABLE][^1] beads-ui's ask, Jira-like web views plus a TUI, matches the opencode pattern: shared client and domain packages, separate UI per surface. [INFERENCE]

### 5.4 The shareable fraction

Leg B's defended estimate is that 35 to 45 percent of the code after the MVP is shared by all three surfaces and 75 to 85 percent by at least two. It assumes a split of core 40 percent, DOM components 30, mod renderer and adapter 15, servers and adapters 15, with half of the last share a shared Node `bd` adapter. The estimate rests on three facts: the mod cannot share components or layout, opencode shares only client and domain code, and a board's domain logic carries no rendering. [INFERENCE] The coordinator can test it after the MVP by counting lines per package and checking the import graph.

### 5.5 Package boundaries to test in the design

Leg B proposes, for the design stage to test, a `packages/core` (types, parsers, domain, view models, commands, token names), a `packages/bd-node` adapter for `bd`, a `packages/web-ui` of React DOM components, a `packages/mcp-server` (stdio and HTTP, tools, the `ui://` resource), an `apps/mcp-app-view` single HTML bundle, an `apps/web` app and an `apps/claude-mod` plugin folder with core copied in. Five rules make the core checkable: it compiles under the tsconfig the types file suggests (`"lib": ["es2023"]`, `"types": []`); it uses no timer globals and no Node or DOM APIs, enforced by a lint rule; it has no runtime dependency, or only small copies that pass the first rule; its tests pass under Vitest and under `claude plugin test`; and the mod's hooks module with core copied in passes `claude plugin validate` and stays under 1 MB, with every `$` call left in the mod's own files because the validator reads them from source. [VERIFIABLE][^1] [INFERENCE]

One shared write boundary is available to two surfaces. The mod can call the same Beads MCP server with `$.mcp.call` that the MCP App calls through its host, and that call raises no permission prompt, so the mod must draw its own confirmation. Whether Claude Code hides `visibility: ["app"]` tools from its model is unknown; if it does not, app-only Beads write tools would appear as model tools in Claude Code. [VERIFIABLE][^1] [NO SOURCE]

### 5.6 Monorepo tooling

Leg B measured maintenance signals on 2026-10-15: pnpm, Turborepo (29.9 million weekly downloads), Nx (10.8 million), Vite (195 million), Vitest (125 million), Playwright, changesets (5.6 million), Biome (17.9 million), oxlint (26.8 million), ESLint (159 million) and Prettier (139 million) are all pushed within the week. tsup's README says "This project is not actively maintained anymore. Please consider using tsdown instead." `ink-testing-library` does not apply, because a mod is not an Ink app; the mod's test runner is `claude plugin test`. [VERIFIABLE][^1] Among comparable projects, opencode uses Bun workspaces with Turborepo, oxlint and Prettier; ext-apps uses npm workspaces with Playwright; mantoni's beads-ui is a single package with Vitest. [VERIFIABLE][^1] The mod adds one constraint: the plugin folder must be self-contained, so a build step copies core into it, as baselane-sh/mods does with a generated folder marked "Edit the engine or the catalog, not this folder". [VERIFIABLE][^1] Leg B's options for the design stage, all heuristic: pnpm with Turborepo; Vite for the web app and the MCP App view, tsdown or esbuild for libraries and the mod copy; Vitest plus `claude plugin test` plus Playwright; changesets under an npm scope; Biome, or oxlint with Prettier. [HEURISTIC]

### When to use

Share a layer when it is DOM-free, timer-free TypeScript that every surface would otherwise duplicate: the Beads model and parsers, the board's domain rules, the view models, the command catalog and the token names. Keep a layer per surface when it touches a renderer: Ink elements, React components, CSS, key bindings and colour values. [INFERENCE]

## 6. The substrate: Beads, the autonomous task queue and the Claude Code task panel

### 6.1 Beads data model and access routes

Leg C measured the store on this host (bd 1.3.0, Dolt 2.3.4; upstream's latest stable is v1.3.1). Every fleet repo is a database on one shared `dolt sql-server` per host, on `127.0.0.1:3308`, so the embedded store's single-writer lock no longer applies here. [VERIFIABLE][^2] `bd schema` publishes a JSON Schema reflected from the Go structs, so a consumer can generate typed models. The issue record has 56 properties, among them `id` (hierarchical hash primary such as `BU-mg2.1.3`), `metadata.display_id` (the fleet's convention), `title`, `description`, `design`, `acceptance_criteria`, `notes`, `status`, `is_blocked`, `assignee`, `owner`, `priority` (0 to 4), `issue_type`, `estimated_minutes`, `due_at`, `defer_until`, `labels`, timestamps including `started_at`, `closed_at`, `lease_expires_at` and `heartbeat_at`, and typed `dependencies`. The issue types are `bug`, `feature`, `task`, `epic`, `chore`, `decision`, `message`, `molecule`, `gate`, `spike`, `story` and `milestone`; the dependency type enum has 19 values, of which `blocks`, `parent-child`, `conditional-blocks` and `waits-for` gate readiness. [VERIFIABLE][^2]

What the model lacks for a Jira-style UI is a sprint, an iteration, a rank, a board position and story points. Leg C's candidate representations: a `sprint:<name>` label (cheap, filterable, no dates); a `milestone` issue with `due_at` and members linked by `tracks` (native fields, but `parent-child` would conflict with epic membership); `bd set-state sprint=<name>` (atomic and audited, but it mints one event issue per change, the cost the queue design met); `metadata.rank` as a fractional index written with the HTTP `:casMetadata`; `estimated_minutes` for estimates; `due_at` for due dates. No upstream document prescribes any row. [VERIFIABLE][^2] [INFERENCE]

Six programmatic routes reach the store. `bd ... --json` is one process per call and the contract every fleet tool uses; `bd serve` offers `GET /v0/beads/issues` with sort and cursors, `issues:query`, `ready`, `stats`, `dependencies/tree`, `POST` and `PATCH` writes, `:batchCreate`, `:delete`, `:casMetadata`, claims, and `GET /v0/beads/events:watch` as `text/event-stream`, with "41 OpenAPI-specified operations across 35 paths"; Dolt SQL reaches any table but bypasses `bd`'s write paths and the journal; the JSONL mirror is "an export for viewers and interchange, not the source of truth or a backup" and is off and gitignored in beads-ui; ai-core's `/api/queue/tasks` is a cross-repo projection, loopback-only, lagging Beads by one export cycle; and `refs/dolt/data` on GitHub is a clone of the whole database, already public for beads-ui. [VERIFIABLE][^2] `bd serve` deserves care: "Hooks do not fire", "No TLS", it refuses `--readonly`, an HTTP `actor` is caller-asserted, and `POST /v0/beads/issues:sweep` deletes closed beads in bulk for any process that can reach the address. Whether `events:watch` emits anything with the journal off is unstated. [VERIFIABLE][^2] [NO SOURCE]

Latency bounds the architecture. With the host at contention verdict HOLD, a whole-store `bd list` on the 5,918-issue ai-harness store failed after 34.7 s, a five-row list took 26.9 s, and the 17-issue beads-ui store answered in 124 ms, while the queue's projection served 11,388 rows in 1.97 s. A per-repo board on a small store can read `bd` directly; a fleet-wide board that calls `bd` per request will stall under load, which is why the queue design projects Beads into Postgres. [VERIFIABLE][^2] [INFERENCE]

The display-id rules bind every write path. `bd` resolves only hash ids (`bd show BU-research-leg-c-beads-hrme` fails, `bd show BU-mg2.1.3` works); the readable id lives in `metadata.display_id` with an `id:<slug>` label echo, both present on all 17 records; the sanctioned create path is `~/.claude/bin/bd-new`, which mints the slug; a published display id is immutable; and `bd export` emits no `metadata` key, so a JSONL reader sees display ids only through labels. A create through `bd serve` or the queue skips `bd-new`, so beads-ui must mint the id itself or call a minting service, and in a public tool the fleet convention belongs behind a configurable hook that is on for the fleet and off by default. [VERIFIABLE][^2] [INFERENCE] Publication goes through Dolt: `sync.remote` points at the GitHub repo, `export.auto` is off, and ai-harness's `scripts/bd_dolt_publish.py` is the serialized pull-then-push publisher whose docstring records the two outages it guards against. [VERIFIABLE][^2]

### 6.2 The autonomous task queue and its dashboard

The queue is an approved ai-harness design with two shipped phases. Its Executive Summary: "Beads stays the only system of record for tasks; a small queue service inside ai-core owns what Beads does not model today: which session holds a task, whether that session has bandwidth, and the prompts Sergei queues for a task's start, next step, or unblocking." Work reaches a session on two lanes, a pull at the end of every turn through the `Stop` hook and a per-machine waker for idle sessions, and "The dashboard is a member app of the already-ratified app-portal shell, served by ai-core over the tailnet, with a Jira-style board, a review queue for blockers, and a prompt composer with slash-command highlighting." [VERIFIABLE][^11]

What exists, per the Design Overview filled on 2026-09-28: in ai-core, `src/ai_core/queue/` holds the tables, the state machine, the service with leases and `/api/queue/next` selection, the router under `/api/queue/*`, a projection that ingests bridge-pushed `bd export` output, and an outbox to a `QUEUE` NATS stream; in ai-harness, five session hooks (`SessionStart` registers, `UserPromptSubmit` marks busy, `PostToolUse` heartbeats, `Stop` pulls the next prompt, `SessionEnd` deregisters), the `wq` CLI, a stdlib-only transport whose config lives at `$CLAUDE_CONFIG_DIR/wq/config.json`, the serialized `bd` writer `scripts/queue_bridge.py`, and the Lane B waker. Every externally visible watcher "is committed inert"; `config/work_queue.toml` has `[machines]` `disabled` on every row, and the runtime config is only written by an explicit `activate` step. [VERIFIABLE][^11] Phase 2, the dashboard member app, had not been built when the overview was last filled: "Out until their hosts exist: Phase 2 (`eve` now cloned on `sem-kg-ec2` 2026-10-02; still no ai-core `web/` member app and nothing on `:8400`/`:4222`/`:5432` there, re-measured 2026-10-02), Phase 3, Phase 4's second-machine and pi adapter ACs, Phase 5." [VERIFIABLE][^11]

The dashboard the design specifies overlaps beads-ui's web app almost view for view. Its information architecture is "Mobile-first, one column on a phone, split view on a laptop" with six views: a Board ("Beads issues across repos as cards; group by `queue` state or Beads status; sort by priority then WSJF metadata then age; filters: repo, type, label, session, machine, epic, `ready`-only. Bulk status edit."), a Task detail (briefing, links, playbook editor, prompt composer, event timeline), Sessions (a live registry with state, current task, context percent, quota band, last heartbeat), a Review queue, Epics (parent and child roll-ups) and an Inbox. Live updates arrive over SSE from `GET /api/queue/events`, and "The PWA caches the last board for offline reading and shows an 'as of <time>' freshness stamp on every projection-derived view." [VERIFIABLE][^11] The Board, Epics and Sessions views are the same things Sergei asked beads-ui for (a kanban of Beads issues, epic roll-ups, a view of every session's tasks); the Task detail's prompt composer, the Review queue and the Inbox are queue-specific and have no counterpart in the beads-ui ask. [INFERENCE]

The design also fixes how the dashboard joins the fleet's web shell: "The dashboard joins as `kind: portal` exactly as eve-15f § How an app joins the portal prescribes: `apps.yaml` entry `{id: queue, title: Work Queue, path: /queue, upstream: http://127.0.0.1:8400, kind: portal, health: /healthz}`; `app-portal serve-sync` generates the `tailscale serve --set-path /queue` rule; ai-core's existing Circus watcher supervises it (no new watcher); the SPA is mounted as a FastAPI sub-application with `root_path="/queue"` beside ai-core's current UI; `openapi-typescript` types are committed and CI-checked". [VERIFIABLE][^11] Its reuse inventory treats the Claude Code task panel as a display mirror that "the dashboard links rows, never writes them", and notes that Beads is "P0-P4 natively while `/beads-task` exposes P0-P3", with the Board treating P4 as "backlog, never auto-claimed". [VERIFIABLE][^11]

Three integration facts follow for beads-ui, with the queue left where it is as Sergei asked. First, the queue's read models (`/api/queue/*`, the SSE event stream, the session registry) are the only source of the session-ownership and bandwidth facts a cross-session view needs, because Beads does not model them; beads-ui should consume those endpoints; `bd` alone cannot supply them. [INFERENCE] Second, the Board and Epics views of the queue dashboard and beads-ui's board are one product drawn twice unless the design makes beads-ui's web app the queue's Phase 2 member app, or the queue's Phase 2 reuses beads-ui's packages; either is possible because Phase 2 is unbuilt, and the choice is a design decision, not a research finding. [INFERENCE] Third, the queue-specific surfaces (prompt composer, review queue, inbox, playbooks) are features beads-ui can host as optional panels fed by the queue API, so that a machine with the queue disabled still gets a working task manager. [INFERENCE] Where the queue service itself should live (ai-harness, ai-core, ai-chassis, a package) is the question Sergei deferred in his fourth follow-up; this doc records it as an Open Question and does not answer it.

### 6.3 The Claude Code task panel, its backup and its retirement switch

Claude Code documents one storage rule: "To share a task list across sessions, set `CLAUDE_CODE_TASK_LIST_ID` to use a named directory in `~/.claude/tasks/`", and "Tasks persist across context compactions". On this host `~/.claude/tasks` holds 86 named lists, 76 empty and 10 holding 625 task files (2.9 MB); each task file carries `id`, `subject`, `description`, `status`, `blocks` and `blockedBy`, with optional `activeForm`, `owner` and `metadata`. The docs publish no file format, so these shapes are measured, not a contract. [VERIFIABLE][^2] [NO SOURCE] A per-machine file copy is a complete backup, and it must keep the optional fields (98 files carry `metadata`, 157 carry `owner`). The destination needs a privacy rule: the `kg-2` list (171 tasks) is an employer-workspace session, so the backup cannot land in public beads-ui; the candidates are a private repo per machine class or a non-repo archive, and the choice has a data-classification consequence. [VERIFIABLE][^2] [INFERENCE]

The switch is smaller than the ask implies. The Task tools "are available by default only on Opus 4.7, Sonnet 4.6, Haiku 4.5, and earlier models"; on every newer model "Claude Code leaves the tools out unless you opt in", the opt-in is `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`, and the default applies from v2.1.268. ai-harness's `settings.template.json` sets that variable for every machine, so on the fleet's current models the panel exists because of one line. A bare tool name in `permissions.deny` "removes the tool from Claude's context entirely", deny is evaluated first, and a user-level deny beats a project-level allow. [VERIFIABLE][^2] Leg C found no setting that hides the panel while keeping the tools. So retiring the panel for a machine profile means dropping the env key on that profile and adding bare-name deny rules for `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate` and `TodoWrite` for sessions on older models. Two caveats: background and cloud sessions get the tools "listed or not", and whether a deny rule removes them there is unstated; and retirement removes data the fleet's own tooling reads (`wq next`'s TaskList reconciliation, the one-row-per-agent rule, `/load-task-panel`, `/curate-task-panel`, `/clean-task-panel`), so each needs a replacement or a guard on retired machines. The switch belongs in ai-harness, which renders `~/.claude/settings.json` per machine from `machines.json` through `install.sh`'s plan, apply and doctor verbs; the exact profile key is open. [VERIFIABLE][^2] [INFERENCE] [NO SOURCE]

### 6.4 Other fleet surfaces that read Beads

Several fleet surfaces already project Beads and will coexist with or feed beads-ui. `/next` renders staged buckets and a WSJF-lite score from bd metadata through `scripts/bd_work_view.py`; its scoring and `autonomous_eligible` predicate should be reused, because the queue's claim guard uses the same predicate. The docket (`docs/bu-docket.md` here, still a stub) is a markdown projection of ready work with WSJF row fields a backlog view could render directly. `/progress-review` reconciles active panel tasks with in-progress Beads issues and, since the queue's D-14, posts a hash-gated `bd comment` per checkpoint, which a task detail view would show. `fleet-liveness` reports session liveness and repo ownership from heartbeats, not Beads. `bdx` resolves display ids and renders nothing, and beads-ui needs its lookup. Upstream lists six terminal UIs, nine web UIs, nine editor extensions and five native apps for Beads. [VERIFIABLE][^2] [INFERENCE]

### When to use

Read `bd --json` for a single-repo surface on a small store and for every write; read the queue projection and SSE for a fleet-wide board and for session ownership; use `bd serve` when a server process must avoid a `bd` subprocess per request and can stay on loopback or behind a token and TLS; use Dolt SQL for analytics over `events` and history; never use the JSONL mirror as the source. [INFERENCE]

## Gaps, blindspots and emergent findings

### Emergent findings beyond the question list

Six findings surfaced that the brief did not ask for. First, the names collide: `beads-ui` on npm belongs to a 755-star MIT project and `bv` is Beads Viewer's binary; an npm package needs a scope such as `@sergeiwallace/beads-ui`, and a second `bv` on a machine would shadow one or the other on `PATH`. [VERIFIABLE][^3] [VERIFIABLE][^2] Second, Beads Viewer's licence rider denies rights to Anthropic and anyone acting for it, with a definition of use that reaches automated pipelines, so a Claude-built project treats it as patterns-only; whether reading its documentation falls inside the rider is a legal question no packet answers. [VERIFIABLE][^3] Third, the queue SPA and beads-ui overlap more than the fourth follow-up implies: ai-core's SPA already has Board, Epics, Task detail and a Decisions view over every repo's Beads. [VERIFIABLE][^2] Fourth, `bd serve` skips hooks and is an unauthenticated delete surface on loopback (`issues:sweep`), which binds any hosted deployment to a token, TLS and an allowlist. [VERIFIABLE][^2] Fifth, the display-id invariant reaches every create path: the queue's own `set-state` and `gate` calls created id-less issues that reddened the fleet push gate until its bridge minted them, and beads-ui will hit the same gate on its first create unless minting is in its path. [VERIFIABLE][^2] Sixth, the mods surface changed twice on 2026-10-14, after the seed docs, and 2.1.299's multi-file `$` passing is what makes a shared core loadable in a mod at all. [VERIFIABLE][^1]

### Blindspots the research could not resolve

Nothing was drawn, dragged or rendered live in any surface; every behaviour claim about mods, `Client` pointer capture and MCP Apps comes from documentation, type declarations, READMEs and issue text. [NO SOURCE] The public types file lists `mobile` and `vscode` render surfaces while the overview says only the terminal and Desktop draw; the two are unreconciled. [VERIFIABLE][^1] Whether a `Client` receives clicks inside tmux with mouse mode off, which mouse tracking mode Claude Code enables, and whether the types file or terminal-browser is right about pixel positions are open. [NO SOURCE] Whether TanStack Query core, Zustand's vanilla store or XState run without timer globals in a mod was not checked. [NO SOURCE] Whether `events:watch` streams anything with the Beads events journal off, and the full `bd serve` request schemas, were not read; the OpenAPI spec is 585 kB and leg C read its first 100 kB. [NO SOURCE] Whether a `permissions.deny` rule removes the Task tools in background and cloud sessions is unstated. [NO SOURCE] The task panel was measured on this host only; other machines differ in count and in the employer-versus-personal split. [NO SOURCE] Reviewer sentiment for the task-manager products was blocked (G2 403, Reddit refused), Jira's timeline and delete pages and Asana's timeline 404'd, Linear's Cmd K binding is unverified, multi-item drag in dnd-kit and Pragmatic drag and drop was undocumented, and AWS CDK, Copilot, App Runner and Helm templates were not researched. [NO SOURCE] No second model has reviewed any packet; each leg's critic pass was run by its author, and this synthesis was written by the coordinator who briefed them. [NO SOURCE]

### Contrarian evidence

Three arguments cut against a drag-first Jira clone; each is recorded here. The queue design argues that "Beads cannot serve a phone UI across 20 repos on a request path", and leg C's latency readings support it for a fleet-wide board under load while refuting it for a single-repo board on a small store. [VERIFIABLE][^2] The fleet's prior-art research recommends keeping a list or table view beside the board and keeping drag optional, with an explicit action for every transition. [VERIFIABLE][^2] And the Beads ecosystem already has a working MIT web UI with board, epics and live updates; forking or contributing to mantoni's `beads-ui` would reach a web UI sooner than a rebuild, at the cost of its lit-html stack and the ask's choice of a new public repo. [VERIFIABLE][^3] [VERIFIABLE][^1] Vibe Kanban's sunset and the unmaintained Focalboard show that large project-management UIs are costly to keep alive, which supports the MVP-first phasing Sergei already asked for. [VERIFIABLE][^3]

### Alignment with the founding ask

Every requirement in entries A001 to A004 is covered, narrowed or deferred as follows; the raw record governs. Board, backlog, sprint, drag, reorder and sort: covered (sections 1, 3, 6.1), with sprints and rank narrowed to conventions on Beads. Create, update and delete behind an are-you-sure step: covered (sections 1.3, 6.1), with `bd delete`'s preview as the confirmation's content. Analytics and dashboards: covered (section 1.4), narrowed from story points to flow metrics for session assignees. A view of every session's tasks: covered (sections 1.5, 6.2), with the source narrowed to Beads assignees plus the queue's session registry once the panel retires. Timeline and roadmap: covered from GitHub, Plane and OpenProject; Jira's own timeline page could not be read. Mouse control in the TUI: narrowed to `Client` pointer capture under fullscreen rendering, with a keyboard path required. Retire the panel per machine profile with a backup: covered (section 6.3), narrowed by the privacy constraint on the backup's destination. Public repo with the Beads store committed: verified (section 6.1). One repo with shared components (A002): narrowed, components shared by two surfaces and logic by three (section 5); the `bv` alias and npm name are flagged. The web app, MCP UI app and TUI first (A003): covered; iOS, macOS and Linux are not researched. Incorporate the queue and its dashboard with the queue left where it is (A004): covered (section 6.2) with three integration options; where the queue lives is recorded as an open question, as the entry asks.

## Comparison

The three surfaces are compared on the criteria that decide what the shared core can and cannot carry. Column facts come from the sources cited in sections 3, 4 and 5; a cell marked inferred is the coordinator's reading of those sources.

| # | Criterion | Claude Code TUI mod | MCP UI app (Claude Desktop and claude.ai) | Web app (local or hosted) |
|---|---|---|---|---|
| 1 | Drawing surface | A fixed element tree (`Box`, `Text`, `Button`, `Input`, `Select`, `Markdown`, `Client`, `Raster`); no DOM, no HTML [^5] | An HTML document in a sandboxed iframe (a native WebView on mobile), one of three display modes [^8] | A full browser DOM; the app owns its layout |
| 2 | Component sharing with React | None: JSX syntax only, elements from `$.ui.resolve(e)` [^5] | Full: the same React components as the web app, inside the full-screen mode's constraints [^9] | Full |
| 3 | Mouse and drag | Pointer events only inside a `Client`; drag needs fullscreen rendering and tmux mouse mode; no sub-cell precision under tmux [^7] | Browser pointer and touch events; vertical pan inside an inline app scrolls the conversation on mobile [^8] | Browser pointer and touch events, unrestricted |
| 4 | Keyboard | Claude Code's focus model; Tab and arrows fixed; one digit or letter hotkey per button [^5] | Browser keyboard events; the host composer stays visible [^8] | Unrestricted; a command palette is possible |
| 5 | Where it runs | A terminal session and the Desktop Code tab; not the VS Code chat panel, `claude -p`, the SDK or cloud sessions [^4] | Claude Desktop (local stdio server) and claude.ai (remote HTTP server); mobile after a connector is added on web or desktop [^9] [^8] | Any browser; a phone over the tailnet if hosted |
| 6 | Reaching the Beads store | Direct: the mod runs on the machine with the store and calls `bd` through `$.process`-style APIs or an MCP server through `$.mcp.call` [^6] | Local stdio server reads the store directly; the remote server needs a network route to the machine that holds it [^9] [^10] | The web server reads the store directly; a hosted deployment needs the store mirrored or served (`bd serve`) [^10] |
| 7 | Theming | Claude Code theme keys and named colours on `Text`; `Raster` palette rounding in the terminal [^5] | Host style variables (`color-*`, `font-*`, `border-radius-*`), light and dark required [^8] | The app's own CSS variables |
| 8 | Density and charts | Text and `Raster` cells; `Svg` on Desktop only [^5] | Full HTML charts in full-screen mode; inline cards capped at 4 to 5 data points [^8] | Full HTML charts |
| 9 | Write safety | Unsandboxed code with the user's permissions; writes need a hold-and-ask or confirmation step [^4] | Sandboxed iframe; CSP blocks external origins by default; the host prompts once per server [^8] [^9] | The app's own auth and confirmation flows |
| 10 | First audience | A Claude Code session that wants to see or move its own tasks | A Claude conversation that should hand the user a board | Sergei on a laptop or phone, and any later user of the public project |

Row 2 is the one that bounds the architecture: two surfaces share React components and one shares none, so the "one core" is the layer beneath components. Row 6 is the one that bounds hosting: every surface ultimately reads one Beads store that is single-writer when embedded, so a machine with several sessions and several surfaces needs one writer process in front of it. Both are inferred from the cited facts and are decisions for the design doc.

## Recommendation

1. Build one public monorepo with a DOM-free `core` package and separate renderers per surface, in the opencode pattern: shared types, parsers, domain rules, view models, command catalog and token names; React components shared by the web app and the MCP App only; the mod's plugin folder generated with core copied in and kept under 1 MB. Treat leg B's package boundary and its five core rules as the design's starting proposal and its 35 to 45 percent estimate as a claim to measure after the MVP. [INFERENCE from section 5]
2. Make the TUI mod the MVP, read-mostly first: a board pane with columns from `bd statuses` grouped by category, assignee swimlanes, a detail view, quick-add through `Input`, and status moves through a "Move to" `Select` with `bd update --if-status`. Add `Client` pointer drag as the second step, behind fullscreen rendering and tmux mouse mode, keeping the keyboard path. Put every write behind a confirmation and every delete behind `bd delete`'s own preview. Read `bd --json` for the single-repo store and keep view preferences, not data, in `$.store`. [INFERENCE from sections 1, 3, 6.1]
3. Make the web app the queue dashboard's missing Phase 2, so the fleet has one board: register it as an app-portal member app, consume `/api/queue/*` and SSE for the fleet-wide board, sessions and review queue when a queue service is configured, and fall back to `bd` when it is not, so the public project works without the fleet's queue. Leave the queue service where it is, as Sergei asked, and record its long-term home as an open question. [INFERENCE from section 6.2]
4. Ship the MCP App as the same React board in full-screen mode, served by one `beads-ui` MCP server that runs over stdio under Claude Desktop and over HTTP for claude.ai; map beads-ui's tokens to Claude's style variables; replace menus with segmented controls. Defer claude.ai to a later phase, because it needs an internet-reachable server with auth. [INFERENCE from section 4]
5. Land the panel retirement in ai-harness as a per-machine-profile switch that drops `CLAUDE_CODE_ENABLE_TODO_TOOLS` and adds bare-name deny rules, preceded by a file-copy backup of `~/.claude/tasks/` into a private destination chosen by data class, and gated on replacements for the fleet tooling that reads the panel. [INFERENCE from section 6.3]
6. Decide three conventions in the design doc before any build, because every surface depends on them: sprint membership on Beads (label, milestone or state), board order (`metadata.rank` as a fractional index or none), and display-id minting in beads-ui's create path (built in, `bd-new`, or a configurable hook). [INFERENCE from sections 1.2 and 6.1]
7. Rename what collides: publish under an npm scope and drop or rename the `bv` alias. Treat Beads Viewer as off limits for code and API reuse. [INFERENCE from section 2.2]
8. Before the MVP ships, run the three live checks no packet could: a drag inside a `Client` under tmux over SSM and in Ghostty or kitty locally; a one-file import probe of the state library candidates under `claude plugin test`; and `bd serve`'s `events:watch` with the journal on and off. [INFERENCE from the blindspots]

External adoption claims above follow the fleet's source-vetting rule: Pragmatic drag and drop, TanStack, Base UI through shadcn/ui, Vite, Vitest, Playwright, Turborepo and oauth2-proxy carry the maintenance signals leg A and leg B measured; baselane-sh/mods (1 star, days old), SVAR Gantt (214 stars) and bead-me-up-scotty (150 stars) are exploratory and are cited for patterns.

## Open Questions

1. Where should the autonomous task queue service live long term (ai-core, ai-harness, ai-chassis or its own package)? Sergei deferred this in his fourth follow-up; the design records it and does not answer it.
2. Does a `Client` receive clicks and drags inside tmux over SSM, and does `ui.render` draw in an interactive Bedrock session on this host? Nothing was run live; the first mod spike answers both.
3. Does Claude Code hide MCP Apps' `visibility: ["app"]` tools from its model? If not, app-only Beads write tools exposed for the MCP App would appear as model tools in Claude Code.
4. Does `bd serve`'s `events:watch` emit events with the Beads events journal off, and does `POST /v0/beads/issues` accept `metadata` at create? The first 100 kB of the OpenAPI spec did not say.
5. Does a `permissions.deny` rule remove the Task tools in background and cloud sessions, which receive them "listed or not"?
6. Which mouse tracking mode does Claude Code enable, and are the types file ("kitty, Ghostty, iTerm2, WezTerm and foot" report pixels) or terminal-browser's README ("claude code does not enable pixel coordinate mouse reporting") right about sub-cell positions?
7. Do the `mobile` and `vscode` render surfaces in the public types file mean mods will draw there, or are they unreleased work?
8. Will Claude Code become an MCP Apps host? If it does, the mod's role narrows to terminal-only drawing.

## Sources

[^1]: Claude Opus 5.5 researcher leaf for aih-3 (beads-ui). (2026). [beads-ui research leg B: Claude Code mods, MCP Apps and the shared core](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-mods-and-shared-core.md). sergeiwallace/beads-ui, `docs/research/findings/beads-ui-mods-and-shared-core.md`, landed on main at 4a8891c (PR #3) 2026-10-15. 882 lines, 51 sources, a 74-row provenance ledger with every quote SUPPORTED. (The mods API by evidence class; the public types file; mouse and `Client` drag; mods and Beads prior art; the MCP Apps specification and Claude's support; the shared-core layer table, precedents, the shareable-fraction estimate and the package boundary proposal; monorepo tooling.)

[^2]: Claude Opus 5.5 researcher leaf for aih-3 (beads-ui). (2026). [beads-ui research leg C: the Beads data model, the autonomous work queue and the Claude Code task panel](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-beads-queue-and-panel.md). sergeiwallace/beads-ui, `docs/research/findings/beads-ui-beads-queue-and-panel.md`, landed on main at 7e0067f (PR #2) 2026-10-15. 823 lines, 14 sources, a 31-row provenance ledger, and host measurements M-1 to M-9 in `docs/research/findings/evidence/beads-ui-beads-queue-and-panel-measurements.md`. (bd 1.3.0 schema, routes and `bd serve`; latency under load; display-id rules; the work queue as shipped, its API and SPA; the task panel's storage, tool contracts, backup and retirement switch; other fleet Beads surfaces.)

[^3]: Claude Opus 5.5 researcher leaf for aih-3 (beads-ui). (2026). [beads-ui leg A findings: task-manager UX, components and web hosting](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-task-manager-ux.md). sergeiwallace/beads-ui, `docs/research/findings/beads-ui-task-manager-ux.md`, landed on main at 68ea599 (PR #4) 2026-10-15. 854 lines, 81 sources each stamped with HTTP status and date, a 121-row provenance ledger. (Jira, Linear, Todoist, Asana, GitHub Projects, Plane and OpenProject patterns; drag semantics and `bd` guards; delete flows; flow metrics; cross-assignee views; React building blocks with 2026-10-15 maintenance signals; open-source trackers and the Beads ecosystem; hosting and auth; terminal parallels.)

[^4]: Anthropic. (2026). [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview). Claude Code Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Definition, where mods run and draw, version floors, the no-sandbox warning, the mods versus hooks versus skills versus MCP comparison.)

[^5]: Anthropic. (2026). [Draw in the interface with a mod](https://code.claude.com/docs/en/plugins/mods/interface.md). Claude Code Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Render sites, pane widths, the element-by-surface table, JSX over `$.ui.resolve`, the `Client` description, keyboard focus and keys, the `$.state` and `$.store` tiers.)

[^6]: Wallace, S. (ai-harness, Fable coordinator). (2026). [Claude Code mods: capability, ecosystem and fleet use cases](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/claude-code-mods.md). Private repository `sergeiwallace/ai-harness`, `docs/research/claude-code-mods.md`; read from the local main tree 2026-10-14 (1148 lines, refreshed 2026-10-12). (The `Client` type contract, `$.mcp.call` credentials rule, limits table, the packaging rules, "Claude Code is not an MCP Apps host".)

[^7]: Wallace, S. (ai-harness, Opus researcher). (2026). [A working web browser inside the Claude Code TUI through mods: what exists and what it takes](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/claude-code-mods-web-browser-in-the-tui.md). Private repository `sergeiwallace/ai-harness`, `docs/research/claude-code-mods-web-browser-in-the-tui.md`; read from the local main tree 2026-10-14 (680 lines, dated 2026-10-14). (Pointer capture and drag, fullscreen rendering and tmux mouse mode, the Beads-mod prior-art table, `Raster` and `Image` limits.)

[^8]: Anthropic. (2026). [Design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines). Claude Developer Platform, MCP Apps. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Display modes and their constraints, mobile WebView, CSP, host style tokens, the app-versus-chat interaction split.)

[^9]: Anthropic. (2026). [Get started with MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started). Claude Developer Platform, MCP Apps. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Local `npx --stdio` servers in `claude_desktop_config.json`, `registerAppTool()` and `registerAppResource()`, `App.connect()`, the `ui.domain` sandbox origin rule, the permission prompt.)

[^10]: Yegge, S. (2026). [beads: Distributed graph issue tracker for AI agents, powered by Dolt](https://github.com/steveyegge/beads). GitHub. Verified accessible (HTTP 200, WebFetch) 2026-10-15; 27.9k stars shown. (Embedded Dolt single writer, `bd init --server`, `bd serve` over HTTP, JSONL as export not source of truth, hierarchical epic ids, dependency link types, atomic claim.)

[^11]: Wallace, S. (ai-harness, Fable coordinator). (2026). [Autonomous work-queue coordinator + mobile PWA task dashboard — Design Document](https://github.com/sergeiwallace/ai-harness/blob/main/docs/designs/autonomous-work-queue-coordinator-and-pwa-dashboard.md). Private repository `sergeiwallace/ai-harness`, `docs/designs/autonomous-work-queue-coordinator-and-pwa-dashboard.md`, status approved; read from the local main tree 2026-10-14 (3806 lines; Design Overview filled 2026-09-28). (Architecture, what Phases 0 and 1 built, the dashboard information architecture, the app-portal integration, the reuse inventory.)

<!-- /doc:region name="body" -->

<!-- doc:region name="ambiguous_items" kind="replaceable" -->

## Ambiguous Items from Auto-Remediation (Post-Run Review)

(none yet — auto-populated by verify_and_remediate node)

<!-- /doc:region name="ambiguous_items" -->

<!-- doc:region name="appendix_research_prompt" kind="immutable" -->

## Appendix: Research Prompt

**Registry ID:** none (no ai-core registry on this host); the prompts below were assembled by the Fable coordinator from `ai-harness/docs/research/prompts/TEMPLATE.md` and rendered through `skills/_shared/ask-fidelity/ask_fidelity.py`
**Model:** `us.anthropic.claude-opus-5-5` for the three research leaves (persona `researcher`, effort high); `us.anthropic.claude-fable-5-1[1m]` for the coordinator's synthesis
**Date:** 2026-10-14 (leaves launched 23:59 UTC) to 2026-10-15

Each leaf received a Tier 3 founding-ask carrier (the canonical root JSON and digest recorded in Founding Ask Coverage above, the resolved record path, four verbatim excerpts, a stage framing and an alignment obligation), then the destructive-operation floor, then the research prompt below, then a six-field brief. The research prompt and the brief are shown once, for leg A; legs B and C differ only in the role identity, the temporal line, the question list, the deliverable path and the worktree names, all of which are given after it.

````text
## RESEARCH PROMPT (canonical research-prompt template blocks, reproduced verbatim with fills)

<grounding_instructions>
You are a principal product designer and front-end architect who has shipped task-management and project-tracking products (board, backlog, sprint, roadmap and analytics surfaces) and who evaluates open-source component libraries for production use. You have strong opinions backed by evidence. When you cannot find a source, you say so explicitly.

Temporal scope: Weight sources by recency — 2026 (primary) → 2025 → 2024.
Pre-2024 sources are background context only unless foundational to the topic.
If post-2024 literature is genuinely sparse for a subtopic, state
"[subtopic]: no significant post-2024 developments found" rather than
backfilling with older sources. Backfilling is a failure mode, not a hedge.
Distributed systems, databases, cloud defaults do not apply; this is product UX and front-end tooling. Weight 2026 and 2025 sources first; 2024 and 2023 sources are acceptable for component libraries and UX patterns that have not changed. Older sources are background only.

Before generating your final output, execute a Chain-of-Verification (CoVe)
to ensure factual fidelity over compliance.

Inside your thought process:
1. Isolate the core facts required.
2. Draft a tentative response.
3. Hostile Cross-Examination: flag any claim where you are citing a source because
   the prompt implied you should, rather than because you verified it.
4. Strip away any claim that cannot be empirically verified.

When generating your final output, classify every major claim. Write your rationale
before appending the tag — writing the tag first causes post-hoc rationalization.
Rationale → evidence check → tag.

- [VERIFIABLE]: backed by documentation, peer-reviewed research, or official
  tech blogs (2024–2026). Carry an inline footnote ref to the source: [VERIFIABLE][^N].
- [HEURISTIC]: widely accepted best practice without a specific citation.
- [INFERENCE]: a logical conclusion drawn from context. Provide your reasoning
  in-text. Do not fabricate a source. Tier tag only — NO footnote ref.
- [NO SOURCE]: explicitly state when you cannot find verifiable data. Tier tag
  only — NO footnote ref.

Citation format (mandatory for every externally-sourced claim):
- Inline: append the GFM footnote ref directly after the tier tag — [VERIFIABLE][^N].
  A claim citing multiple sources carries ascending separate refs — [VERIFIABLE][^3][^7]
  (never grouped [^3,^7]; never out of order).
- Footnote definitions live once, under ## Sources, in APA form with a clickable
  URL or DOI and an access-verification stamp. Worked example:
    [^1]: LangChain. (2026). [Threads](https://docs.langchain.com/langsmith/threads).
    LangSmith Documentation. Verified accessible (HTTP 200) 2026-06-03. (Scope note.)
- URL-or-DOI ALWAYS: every source entry carries a clickable URL or a doi.org link —
  paywalled/gated is fine (link it anyway; stamp the access status). Only the
  truly-irreducible case (no online catalog presence anywhere) gets an explicit
  [no online source located] marker with a one-line justification.
- Integrity: footnote refs are contiguous from [^1], every [^N] ref has a matching
  definition, and every definition is referenced — no gaps, no orphans.
- [INFERENCE] / [NO SOURCE] claims carry the tier tag with NO footnote ref.

Hard constraint (overrides all formatting preferences): never invent a citation
to satisfy a formatting instruction. Accuracy > completeness.

When evaluating an externally sourced idea, feature, repository, package, tool, or pattern for
adoption, apply `docs/procedures/source-vetting-and-corroboration.md`: record concrete
adoption/maintenance signals or independently corroborate the underlying pattern. If neither
route passes, call it exploratory rather than an established best practice.

Format architecture, workflow, sequence, data-flow, and lifecycle/state diagrams with the
`archify` skill by default. Named Mermaid exception: a teammate-visible document reviewed on GitHub
uses a Mermaid fence for an inline, reviewable diagram because GitHub displays Archify HTML as
source; it may additionally link the Archify HTML for exploration. Everything else uses Archify.
Format math using LaTeX. Never use ASCII diagrams.
NEVER generate binary images.

<!-- doc:writing-rules:mirror:begin -->
Writing rules: answer first, no preamble. Plain sentences. No em dashes, snappy or punchy lines,
rule-of-three padding, bolded verdict openers or hedging words. No private dev-tracking ids in
anything others see. Opus 5.5: no bold lead-in labels, no three-part lists, no hedges.
Fable 5.1: one idea per paragraph, no sentence over 25 words, no metaphor for a plain statement.
Also for Fable 5.1: define every label once, no arrow chains, quote or cite every borrowed passage.
Before you report, run the pre-ship pass in `docs/procedures/ai-writing-anti-patterns.md` over what
you wrote. A model that did not write a passage reviews it.
<!-- doc:writing-rules:mirror:end -->
</grounding_instructions>

## Scope note — questions, examples, and named references are a starting point, not a checklist
The questions, topics, and named examples below are illustrative anchors and a FLOOR for this
research — not an exhaustive list to answer only or evaluate only. Reason independently: survey the
landscape broadly, follow the evidence where it leads, expand scope where warranted, and surface
relevant work, factors, and failure modes not named here. Actively resist answering only the listed
questions or evaluating only the named approaches — an output that merely fills in the listed items
has NOT met the research goal.

## Independent exploration (gaps, blindspots, emergent threads) — required
Treat the question list as a FLOOR, not a ceiling. As you research, actively surface what this
framing may be missing and pursue each promising thread to a logical conclusion:
- Adjacent or upstream factors the questions don't capture.
- Contrarian / disconfirming evidence — report it even when it challenges the premise.
- Emerging 2025–2026 practices, tools, or research not anchored by the named examples.
- Known failure modes and second-order effects.
Whenever a load-bearing thread surfaces mid-research, follow it to its conclusion and report it in a
dedicated "Gaps, blindspots & emergent findings" subsection. Explicitly NAME any blindspot you
suspect but cannot resolve (and why) rather than omitting it. Anchor bias — over-fitting to the
listed questions and example approaches — is a known failure mode; counter it deliberately and say
where you did.

## Retrieval enforcement (mandatory)
For each load-bearing claim, make at least one live fetch; never return `[VERIFIABLE]` without a URL you actually fetched in this session. Do not stop after one round. If no source is found for a sub-question, run additional searches across alternate framings before tagging it `[NO SOURCE]`; that tag is reserved for genuine evidence absence, not retrieval avoidance. Cross-reference each load-bearing claim across at least two independent sources. Fetch every citation you record; classify a failure instead of dropping it: DNS failure or malformed URL = likely fabricated, downgrade hard and flag; 404 or 410 = dead, downgrade out of VERIFIABLE and try `https://archive.org/wayback/available?url=<url>`; 401 or 403 = paywalled or bot-blocked, keep the citation and flag it; timeout or 5xx = transient, keep, flag, retry once. Stamp every source "Verified accessible (HTTP <code>) <date>". For a provenance row, the quote must literally appear in the fetched text (check it yourself with a whitespace-normalized substring test).

## Search recipe on this host
Native WebSearch does not exist on this machine (Bedrock does not proxy it). If a tool named `mcp__bms-web-search__web_search` is available to you, use it for discovery. Otherwise discover with WebFetch on `https://www.bing.com/search?q=<url-encoded query>` (DuckDuckGo returns a bot challenge), then WebFetch the result pages themselves. Use specific multi-word queries; a bare product name returns dictionary entries. Never set HTTP_PROXY or HTTPS_PROXY. Do not curl arbitrary hosts; WebFetch is your network route.

## Questions (floor, not ceiling)
1. For Jira, Linear, Todoist and Asana, and for at least four more widely adopted or open-source task managers you choose (candidates: GitHub Projects, Trello, Monday, ClickUp, Height, Shortcut, Plane, Huly, Focalboard, Planka, Taiga, Vikunja, OpenProject, Leantime): what do their board, backlog, sprint and roadmap or timeline views do that users and reviewers praise, and what do they get wrong. Cover swimlanes, grouping, sub-tasks, WIP limits, saved views and filters, bulk edit, quick-add parsing (Todoist's natural-language entry), the keyboard-first command palette (Linear), and inline editing.
2. Drag semantics: moving a card across columns, reordering within a column, cross-view drag (backlog to sprint, timeline bar drag to reschedule), multi-select drag, touch and keyboard-accessible alternatives, optimistic update and conflict handling when two clients move the same item.
3. Create, edit and delete flows, including the are-you-sure step Sergei asked for: modal confirmation versus undo toast, soft delete and trash, cascade behaviour for an epic with children, and what the better-regarded products do today.
4. Sprint burndown, velocity, cumulative flow, cycle time and throughput, dashboards and widgets: which metrics, how they are drawn, and which matter when the "assignees" are autonomous Claude Code sessions rather than people.
5. Cross-assignee views: "my work", team and workload views, people or assignee swimlanes, activity feeds; how these map to a view of every Claude Code session's assigned, in-progress and done tasks.
6. Open-source React building blocks with license and maintenance signals (stars, last release, open issues, maintainers): drag and drop (dnd-kit, Atlassian pragmatic-drag-and-drop, others), tables and virtualization (TanStack Table, TanStack Virtual), data fetching and state (TanStack Query, Zustand, Jotai, XState), UI primitives (shadcn/ui, Radix, Base UI, Mantine), command palette (cmdk), timeline and gantt (frappe-gantt, vis-timeline, svar gantt, planby, others), charts (Recharts, visx, Observable Plot, Tremor, ECharts), calendars.
7. Open-source Jira or Linear clones (Plane, Huly, Focalboard, Planka, Taiga, Vikunja, OpenProject, Leantime, others you find): license, stack, what UI patterns and code are worth borrowing, and whether any ships a terminal or CLI surface.
8. Web app hosting for a small open-source single-user or small-team app: the local run path (one command, npx, a single binary, Docker Compose), and infra-as-config quick starts (Docker Compose, Fly.io, Railway, Render blueprints, Cloudflare Pages or Workers, Vercel, AWS CDK, Copilot or App Runner, Helm). What maintainers of comparable apps actually ship as "deploy" buttons and templates, and how a self-hosted single-user app handles auth (Tailscale, basic auth, OAuth proxy, passkeys).
9. Terminal parallels: how terminal task and kanban TUIs (kanban-tui, taskwarrior-tui, dooit, kanban-python, lazygit, k9s, others) handle columns, mouse clicks and drags, modal confirmation and keyboard navigation; which of these patterns translate into a Claude Code mod pane that has no DOM.

## SIX-FIELD BRIEF

### 1. Objective
Produce one findings packet on the task-manager UI, UX, components and web-hosting landscape that beads-ui should borrow from, for its web app, its MCP UI app and (where patterns translate) its Claude Code TUI mod.

### 2. Context / Inputs
- Sergei's verbatim ask is the founding ask record above (four entries, A001 to A004) at `/data/projects/beads-ui/.worktrees/aih-3-agents/fable-auto-flow/docs/asks/BU-epic-beads-ui-beads-task-manager-mg2.md`. Read it in full before researching; the stage framing is the coordinator's interpretation and is not authoritative.
- Beads records (read-only; do not run `bd` write verbs): epic BU-mg2 "EPIC beads-ui: Beads task manager for the Claude Code TUI, an MCP UI app and a web app, sharing one core"; your leg is BU-mg2.1.1 under BU-mg2.1 (the research task). Both were in_progress when measured (2026-10-14 23:52 UTC).
- The three surfaces are a Claude Code TUI mod, an MCP UI app for Claude Desktop and Claude web, and a local or hostable web app. The MVP is the TUI mod. Leg B (a sibling child) covers the mods API, MCP Apps and the shared core; leg C covers the Beads data model, the autonomous task queue and the Claude Code task panel. Do not research those; name a hand-off when you touch them.
- The data source is Beads (`bd`), a git-backed issue tracker with epics, parent and child issues, dependencies, labels, priority P0 to P4, and status open, in_progress, blocked, deferred, closed. It has no native sprint object (leg C measures this). Sprint and roadmap views will have to be modelled on top of labels, metadata or a sidecar.
- Repo state (measured 2026-10-14 23:50 UTC): beads-ui `origin/main` is `7fc643f`; your beads-ui worktree `/data/projects/beads-ui/.worktrees/aih-3-agents/bu-research-leg-beads-mruv` is on branch `wt/aih-3/bu-research-leg-beads-mruv` created from `origin/main`; `docs/research/` does not exist yet in beads-ui, so create `docs/research/findings/`. The repo's only hooks are the fleet ref-delete guard. The beads-ui `.gitignore` ignores `.dolt/`, `*.db`, `.beads/proxieddb/` and the Dolt server state file.
- These repo facts are a snapshot taken at the times stamped above. Re-verify anything load-bearing against `origin/main` before acting on it; if it has moved, say so and work from what you measured, not from this brief.

### 3. Output contract
Deliverable file: `docs/research/findings/beads-ui-task-manager-ux.md` in your beads-ui worktree, 300 to 900 lines, with this structure:
1. YAML frontmatter: `title`, `category: research`, `tags: [research, findings, beads-ui]`, `status: complete`, `source: "claude-opus-5-5-<date>"`, `task: BU-mg2.1.1`, `display_id: BU-research-leg-beads-mruv`, `template_version: "research-findings-1.0.0"`.
2. `## Summary`: 5 to 8 numbered findings, one or two sentences each, each with its tier tag and footnote refs.
3. One `## N. <question>` section per question above, in order, each ending with a `### Hand-offs` list naming anything that belongs to a sibling leg or to the coordinator's design stage.
4. `## Gaps, blindspots and emergent findings` (required; name every blindspot you suspect but could not resolve, and why).
5. `## Sources`: GFM footnote definitions `[^N]:` in APA form with a clickable URL and the access stamp, contiguous from [^1], no gaps, no orphans.
6. `## Appendix: Provenance Ledger`: a table `| Claim | Source URL | Verbatim quote | Verdict | Live? |` with one row per `[VERIFIABLE]` claim; verdicts SUPPORTED, PLAUSIBLE, UNVERIFIABLE or CONTRADICTED; only SUPPORTED rows with a live URL keep the `[VERIFIABLE]` tag in the body.
7. `## Run History`: one line: date, model, effort, what was searched, how many sources fetched and how many failed, with the failure classes.
Tier tags on every major claim, rationale before tag: `[VERIFIABLE][^N]`, `[HEURISTIC]`, `[INFERENCE]`, `[NO SOURCE]`. Citations are footnotes, never inline URLs in prose. No ASCII-art diagrams, no images; a Mermaid fence is allowed for one architecture or flow diagram if it helps.

Your final message to the coordinator is capped at 300 words and contains ONLY:
- `Packet:` the absolute path, line count, and `provenance: current-run`.
- `Commit:` the final commit SHA on your branch, with the bounded output of `git cat-file -t <sha>` and `git merge-base --is-ancestor <sha> wt/aih-3/bu-research-leg-beads-mruv` (exit status quoted).
- `Sync:` the upstream name from `git rev-parse --abbrev-ref '@{u}'` and the behind-count (must be 0).
- `PR:` the PR URL.
- `Top findings:` up to 6 one-line findings.
- `Open gaps:` up to 4 one-line items.
- `Escalations:` any decision the Authority test escalated, or `none`.
No preamble, no restating the task.

Writing rules: answer first, no preamble. Plain sentences. No em dashes, snappy or punchy lines,
rule-of-three padding, bolded verdict openers or hedging words. No private dev-tracking ids in
anything others see. Opus 5.5: no bold lead-in labels, no three-part lists, no hedges.
Fable 5.1: one idea per paragraph, no sentence over 25 words, no metaphor for a plain statement.
Also for Fable 5.1: define every label once, no arrow chains, quote or cite every borrowed passage.
Before you report, run the pre-ship pass in `docs/procedures/ai-writing-anti-patterns.md` over what
you wrote. A model that did not write a passage reviews it.

### 4. Tools & scope
- You are a leaf: do NOT spawn sub-agents. A long shell is not a reason to idle: do the next piece of your own work and read its output file between steps; never `sleep`-poll it, and never end a turn with nothing to do until it finishes.
- Tools: Read, Glob, Grep for local files; WebFetch (and `mcp__bms-web-search__web_search` if present) for the web; Bash for read-only measurement and for git in your beads-ui worktree only. Context7 (`resolve-library-id` then `get-library-docs`) is allowed for current library APIs.
- Scope fence: write only `docs/research/findings/beads-ui-task-manager-ux.md` (and, if you must, a sibling evidence file under `docs/research/findings/evidence/`) inside `/data/projects/beads-ui/.worktrees/aih-3-agents/bu-research-leg-beads-mruv`. Do not edit any other file. Do not write in the ai-harness worktree or in any main tree. Do not run `bd` write verbs, `bd init` or `bd setup`; read-only `bd show`, `bd list` and `bd --help` are allowed from the beads-ui worktree.
- Run no tests, no pytest, no builds and no installs on this host (another session holds the test slot). `uv` only; never `pip install`.
- Never commit against a repo's main working tree. Write only inside the worktree paths listed above; if the work requires a repo not listed, stop and report it rather than editing that repo's main tree — that races any session live there and silently loses work.
- Never pass `-c user.name=...` or `-c user.email=...` or set `GIT_AUTHOR_*` / `GIT_COMMITTER_*`; use the repository's configured Git identity as-is.
- GitHub: use `ghp` (the personal credential, already configured), never bare `gh`. Open the PR with `ghp pr create -R sergeiwallace/beads-ui --head wt/aih-3/bu-research-leg-beads-mruv --title "<title>" --body-file <file>`; the body ends with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Use `--body-file`, never an inline body.
- Never `--no-verify`.

### 5. Boundaries + Definition-of-Done
Boundaries: one packet, the questions above and what they lead to; no design decisions for beads-ui (record options and evidence, the coordinator decides); no edits outside the scope fence; nothing secret or sensitive in the public repo; no private dev-tracking ids other than the Beads ids and repo names Sergei allowed.

Definition-of-Done: the packet exists at `docs/research/findings/beads-ui-task-manager-ux.md` with every section above filled; every `[VERIFIABLE]` tag has a live-checked footnote and a provenance row whose quote is literally present in the fetched text; the five-perspective critic pass (conventional, contrarian, historical, adjacent, skeptic) has run over the draft and each high or medium finding is fixed, evidenced or conceded in the Gaps section; the packet is committed on `wt/aih-3/bu-research-leg-beads-mruv` in atomic commits, pushed, and its PR is open; the completion contract below is satisfied and reported.

Commit PERIODICALLY and ATOMICALLY, not once at the end: one commit when the scaffold and sources exist, further commits per completed section group, a final one for the ledger.

Every commit message ends with this exact ordered footer block:
```text
Delegated-to: claude/researcher
Delegation-tier: opus
Delegation-model: us.anthropic.claude-opus-5-5
Delegation-effort: high
Delegation-persona: researcher
Delegation-worktree: /data/projects/beads-ui/.worktrees/aih-3-agents/bu-research-leg-beads-mruv
Delegation-session: aih-3
```

> **Cite evidence from a tracked path only.** Any file you point at as proof in a committed doc (a
> screenshot, a run log, a captured response) must be in the git index of the repo whose doc cites
> it — never under `artifacts/`, `scratchpad/`, `.scratch*/`, `/tmp` or any other gitignored or
> untracked path. Move it to a tracked location (`docs/<kind>/evidence/…`, a test fixture, beside the
> doc), `git add` it in the same commit, and cite that path. The `evidence-citation-gate` hook blocks
> the write (exit 2) and ai-harness pre-commit refuses the commit; a sentence that only DESCRIBES
> where a tool writes is waived on its own line with `<!-- gitignored-path-ok: <reason> -->`.
> Rule and checker: `docs/procedures/tracked-evidence-citations.md`.

The completion contract (verbatim):

> **Before you report, confirm all six. A gate you cannot satisfy is reported as unsatisfied, never
> silently skipped.**
>
> 1. The work is done, reviewed, tested and validated — not "should work". Name the command you ran
>    and quote its verbatim summary line.
> 2. Everything is committed to your own worktree branch, atomically, one logical unit per commit,
>    throughout the run rather than as one dump at the end. Uncommitted work in a worktree is work
>    nobody can see, review, or salvage if you die mid-run.
> 3. Your worktree is fully in sync with `origin`. **You** fetch, pull, resolve any merge conflicts
>    yourself, re-run the gate on the merged result, and commit back. This is your job, not the
>    orchestrator's. A test result from an unsynced branch describes a base nobody is working on.
> 4. Measure that sync against **your worktree's OWN upstream**, never a hardcoded `origin/main`:
>    read it with `git rev-parse --abbrev-ref '@{u}'`. `git rev-list --count HEAD..<upstream>` — the
>    behind-count — must be zero before you report.
> 5. Your report states what you measured and against which base, with the verbatim gate output.
>    "Tests pass" without a base is not a result.
> 6. You push your OWN `wt/*` branch and open or update its PR, and you stop there. You do not
>    merge to `main` and do not delete any worktree. Your DoD is "pushed, PR open, not merged" —
>    your launcher does the merging, after reading your diff.

A decision or blocker passes the Authority test in `docs/procedures/decision-framework.md` before it is escalated: investigate first within your tools, re-run the test on what you learned, and return only what it escalates, with evidence; "unsure" alone is not an escalation. You never surface a decision to Sergei yourself; it goes in your final message to the coordinator. Scratch you produced with no consumer and no unique content is deleted after that check and named as deleted; anything you cannot prove on all three counts stays in place, named with the reason.

### 6. Failure / escalation
"No finding" and "insufficient evidence" are first-class returns: tag them `[NO SOURCE]` with the searches you ran. If a seed doc or a measurement contradicts a web source, report both with quotes; do not pick one silently. If a gate in the completion contract cannot be satisfied (push refused, PR creation refused, upstream unreachable), report it as unsatisfied with the verbatim error; never skip it and report success. If the founding ask record at the path above is unreadable or its sha256 does not match `content_sha256` in the canonical root JSON, stop and report before researching.
````

Leg B differences. Role identity: "You are a principal engineer who builds developer tooling across terminal UIs and web UIs, has shipped React and TypeScript monorepos with several rendering targets, and reads protocol specifications and type definitions rather than blog summaries. You have strong opinions backed by evidence. When you cannot find a source, you say so explicitly." Temporal line: "Claude Code mods and MCP Apps are 2025 and 2026 developments; weight 2026 first. Terminal UI frameworks and layout engines may be cited from 2023 onward when the current release confirms the fact." Deliverable: `docs/research/findings/beads-ui-mods-and-shared-core.md`; worktree leaf `bu-research-leg-b-beads-qegu`; Beads issue BU-mg2.1.2. Questions:

````text
## Questions (floor, not ceiling)
1. Read the three ai-harness seed docs in full first (paths in Context). From them and from the current official Claude Code documentation (code.claude.com/docs; index at /docs/llms.txt) and the mods type definitions: what the mods API offers today for a task-manager mod. Cover render surfaces (panes, bands, status line, toasts, the Client element), input events (mouse click, drag, scroll, keyboard, focus), the layout model, theme and colour access, state persistence, process and filesystem access, how a mod reaches an MCP server or the network, the trust and install model, the version floor, and what changed since the seed docs were written. Separate "documented", "documented in the types file only" and "inferred" as the seed docs do.
2. Mouse control inside a mod: which mouse events a mod receives, whether press-move-release drag is feasible, terminal mouse protocol limits (SGR 1006, motion tracking) across tmux, kitty, iTerm2, WezTerm, Ghostty, VS Code's terminal and Windows Terminal, and what existing mods or TUIs do for drag and drop.
3. Popular open-source Claude Code mods and plugins: galleries, lists and marketplaces, the most-adopted mods, and in particular baselane-sh/mods' read-only Beads mods (what they display, how they read Beads, license, activity), any other task, kanban or issue-tracker mods, doc viewers and browser mods. For each: license, maintenance signals, and whether beads-ui should reuse, fork or only borrow the pattern.
4. MCP Apps (the MCP UI extension, `@modelcontextprotocol/ext-apps`, and the earlier mcp-ui project): specification status and version, how a server declares a UI resource, the iframe sandbox and the host JSON-RPC bridge, display modes, size and network and CSP limits, authentication, what Claude Desktop and claude.ai support as of your run, the developer tooling and examples (including Asana's and other task-manager-shaped apps), and what a Beads MCP App needs: a local stdio MCP server for Claude Desktop versus a remote server for claude.ai, and how a local Beads store is reached in each case.
5. The shared-core question: what a Claude Code mod renders with (confirm concretely whether React runs inside a mod, which reconciler or renderer, and whether a mod can use third-party npm packages), and therefore which layers can be one package across the TUI mod, the MCP UI app and the web app: data access, domain logic, view models and state (TanStack Query, Zustand, XState or similar), command and keyboard maps, layout (Yoga via Ink or Satori, Taffy, OpenTUI, Ratatui-style constraint layout) and theme tokens. Find codebases that target terminal and web from one core (Ink plus react-dom, OpenTUI plus Solid, Textual's web serving, react-nil, react-blessed, Charm's Bubble Tea plus Wish, others) and report how much they share and how. End with a defended estimate of the shareable fraction and a package boundary proposal the coordinator can test.
6. Monorepo tooling for a TypeScript monorepo with three surfaces and a server: pnpm workspaces with Turborepo or Nx, build (Vite, tsup, esbuild), tests (Vitest, Playwright, Ink testing library), release (changesets), lint and format (Biome, ESLint, Prettier); maintenance signals and what comparable open-source projects use in 2026.
````

Leg C differences. Role identity: "You are a staff engineer who integrates developer tools with issue trackers and local data stores, reads schemas and CLI output rather than marketing pages, and measures a system before describing it. You have strong opinions backed by evidence. When you cannot find a source, you say so explicitly." Temporal line: "Beads, Dolt, Claude Code and the ai-harness repository are 2025 and 2026 artifacts; weight 2026 first. Measurements on this host, stamped with their time, outrank any document about them." Deliverable: `docs/research/findings/beads-ui-beads-queue-and-panel.md`; worktree leaf `bu-research-leg-c-beads-hrme`; Beads issue BU-mg2.1.3. Questions:

````text
## Questions (floor, not ceiling)
1. Beads (`bd`, upstream steveyegge/beads, plus the fleet's wrappers in ai-harness `scripts/bd_*.py` and `~/.claude/bin/bd-new`, `bdx`): the issue schema (fields, issue types, statuses, priorities, labels, parent and child, dependency types, assignee, metadata including `display_id`, external_ref), the Dolt backend (how `bd` talks to it, `dolt sql-server` or embedded, the single-writer lock the fleet documents, concurrency limits, read latency), the `.beads/issues.jsonl` mirror and `scripts/bd_dolt_publish.py`, history and events (`bd history`), what Beads has or lacks for sprints, milestones, estimates and ordering, and every programmatic read and write route a UI could use (Dolt SQL, `bd ... --json`, the JSONL mirror, any HTTP or `bd serve` or web UI upstream). Measure on this host with read-only commands only (`bd --help`, `bd list --json` shape on the beads-ui store at `/data/projects/beads-ui/.worktrees/aih-3-agents/bu-research-leg-c-beads-hrme`, `cat .beads/config.yaml`, `dolt version`), stamp each measurement, and cite upstream docs for the rest. Report the display-id rules the fleet enforces (published ids immutable; `bd_repair_duplicate_ids.py`) because the UI's create and edit paths must respect them.
2. The ai-harness autonomous task queue and dashboard: read `/data/projects/ai-harness/docs/designs/autonomous-work-queue-coordinator-and-pwa-dashboard.md` (3806 lines, status approved, measured 2026-10-14 23:45 UTC) in full, and `/data/projects/ai-harness/docs/research/autonomous-work-queue-coordinator-prior-art.md`. Report the architecture, queue lifecycle and status model, session registry, event delivery, prompt and action model, dashboard information architecture, app-portal member-app integration, and the data model. Then measure what has shipped: `bd show AIH-swgb4` and its children from an ai-harness checkout (your ai-harness worktree, read-only), grep ai-harness `scripts/`, `src/` and `skills/` for the queue's symbols (read them from the design doc first, then grep for those names, not for concepts). Conclude with the integration contract beads-ui should consume or expose while the queue stays in ai-harness: read models, APIs or events, overlap with beads-ui's own board and dashboard, and what must not be duplicated.
3. The Claude Code task panel: where Claude Code stores task-list data on disk (look for `~/.claude/tasks/` and `CLAUDE_CODE_TASK_LIST_ID`; measure file shapes read-only), the TaskCreate, TaskUpdate and TaskList tool contracts as documented at code.claude.com/docs, how ai-harness mirrors Beads into the panel (`skills/load-task-panel`, `skills/curate-task-panel`, `skills/clean-task-panel`, `docs/designs/curate-task-panel-skill.md`, the `<DISPLAY_ID>: <short description>` subject rule), and how every panel's data can be backed up before retirement (file copy per machine, export format, where to store it in a repo).
4. The retirement switch: whether Claude Code offers a setting, environment variable or `permissions.deny` route that disables the Tasks feature or hides the task panel (check the settings reference, the CHANGELOG and the docs index; confirm by citation, not memory), and how ai-harness machine profiles work (`machines.json`, `src/ai_harness/defaults/settings.template.json`, `install.sh` plan, apply and doctor verbs, the per-machine overlays in `projects-wide-session-config/`), so the coordinator can design a per-machine-profile config switch that lands in ai-harness.
5. Other fleet surfaces that already read Beads for display, which beads-ui may replace or must coexist with: the docket docs (`docs/docket/`, `docs/bu-docket.md`), `/progress-review`, `/next`, fleet-liveness and the firstmate chief-of-staff registry, `bdx`, and any Beads UI upstream. One paragraph each with a path or citation.
````

<!-- /doc:region name="appendix_research_prompt" -->

<!-- doc:region name="appendix_provenance" kind="replaceable" -->

## Appendix: Provenance Ledger

Two ledgers back this doc. The coordinator's own rows below cover the sources the coordinator fetched directly on 2026-10-15; each quote was copied from the WebFetch output of that page and checked by a whitespace-normalized substring test against the saved extract. Every claim cited to a findings packet (`[^9]`, `[^10]`, `[^11]`) is backed by that packet's own ledger: leg A's 121 rows, leg B's 74 rows (every one SUPPORTED, substring-checked for GitHub-hosted sources) and leg C's 31 rows plus host measurements M-1 to M-9 in its evidence file. The three ai-harness repository documents (`[^6]`, `[^7]`, `[^8]`) were read from the local main tree and are cited for their own measured and documented findings.

| Claim | Source URL | Verbatim quote | Verdict | Live? |
|---|---|---|---|---|
| Mods draw a fixed element set per surface; `Svg` Desktop only; `Raster` and `Image` terminal only | https://code.claude.com/docs/en/plugins/mods/interface.md | "`Client` \| A region drawn by a second file of yours, for animation and pointer input. That file gets no mods API." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| JSX in a mod compiles against `$.ui.resolve` elements, not React | https://code.claude.com/docs/en/plugins/mods/interface.md | "If your module is a `.tsx` or `.jsx` file, you can write the tree as JSX. Destructure the elements from `$.ui.resolve(e)` first." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| A mod-opened pane needs 144 columns, 110 after the user opened it once | https://code.claude.com/docs/en/plugins/mods/interface.md | "the pane appears only in a terminal at least 144 columns wide. After the user has opened that pane once themselves, 110 columns is enough." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| Tab and the arrow keys cannot be rebound by a mod | https://code.claude.com/docs/en/plugins/mods/interface.md | "A mod can't bind Tab or the arrow keys to anything else, so a game steers with `w`, `a`, `s`, and `d`." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| `$.store` is shared by every session and `get` then `set` is not atomic | https://code.claude.com/docs/en/plugins/mods/interface.md | "Every session on your machine that runs your mod shares one `$.store`. A `get` followed by a `set` isn't atomic." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| Mods are unsandboxed code with the user's permissions | https://code.claude.com/docs/en/plugins/mods/overview | "A mod is code that runs with your permissions. It can read and write your files, start processes, and make network requests." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| Drawing appears only in the terminal and the Desktop Code tab | https://code.claude.com/docs/en/plugins/mods/overview | "The VS Code extension's chat panel \| Yes \| No" | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| Terminal floor 2.1.287, Desktop 2.1.286 | https://code.claude.com/docs/en/plugins/mods/overview | "In the terminal, use Claude Code v2.1.287 or later. The Desktop app includes its own copy of Claude Code, and mods work there from v2.1.286." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| MCP Apps have three display modes negotiated with the host | https://claude.com/docs/connectors/building/mcp-apps/design-guidelines | "Declare which modes your app supports through `appCapabilities.availableDisplayModes` in `ui/initialize`. The host responds with the modes it supports, and your app can request a switch with `ui/request-display-mode`. Modes are `inline`, `fullscreen`, and `pip`." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| Inline cards are capped at 2 actions and 4 to 5 data points with no menus | https://claude.com/docs/connectors/building/mcp-apps/design-guidelines | "At most 2 actions, placed at the bottom of the card" | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| External origins are blocked by default; `frameDomains` is restricted in Claude | https://claude.com/docs/connectors/building/mcp-apps/design-guidelines | "The `frameDomains` field, for embedding third-party iframes, is restricted in Claude pending security review." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| Mobile renders MCP Apps in a native WebView after a connector is added on web or desktop | https://claude.com/docs/connectors/building/mcp-apps/design-guidelines | "On mobile, Claude renders apps in a native WebView, `WKWebView` on iOS and `WebView` on Android, rather than a sandboxed iframe." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| Claude Desktop runs an MCP App server locally over stdio from its config file | https://claude.com/docs/connectors/building/mcp-apps/getting-started | "Connecting an example server means adding its entry to Claude Desktop's configuration file, so that the desktop app runs the server locally with `npx`." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| Claude derives the sandbox origin from a hash of the server URL | https://claude.com/docs/connectors/building/mcp-apps/getting-started | "For Claude, the value is the first 32 hex characters of the SHA-256 of your server URL, followed by `.claudemcpcontent.com`." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| One codebase serves every MCP Apps host | https://claude.com/docs/connectors/building/mcp-apps/getting-started | "In the app, call `App.connect()` without a transport argument, and the SDK detects the host and picks the transport." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| Embedded Beads is single-writer; server mode allows concurrent writers; `bd serve` over HTTP exists | https://github.com/steveyegge/beads | "Embedded (default) — `bd init`. Dolt runs in-process, data lives in `.beads/embeddeddolt/`, single writer." | SUPPORTED | yes (HTTP 200, 2026-10-15) |
| The JSONL file is an export, not the source of truth | https://github.com/steveyegge/beads | "`.beads/issues.jsonl` is an export for viewers and interchange, not the source of truth or a backup." | SUPPORTED | yes (HTTP 200, 2026-10-15) |

<!-- /doc:region name="appendix_provenance" -->

<!-- doc:region name="run_history" kind="append_only" -->

## Run History

- 2026-10-14 23:59Z to 2026-10-15 01:00Z, aih-3 Fable coordinator (`us.anthropic.claude-fable-5-1[1m]`) with three Claude Opus 5.5 researcher leaves (`us.anthropic.claude-opus-5-5`, persona `researcher`, effort high, isolation worktree, Tier 3 founding-ask carriers). Leg A: about 95 fetches, 81 sources, PR #4 (68ea599). Leg B: about 95 fetches through WebFetch and the GitHub REST API, 51 sources, PR #3 (4a8891c). Leg C: 29 fetches (4 failed or unusable, classified) plus read-only host measurements, 14 sources, PR #2 (7e0067f). Coordinator: 6 direct fetches (one 404 on a guessed mods URL, replaced by the documented path), the three seed docs and the queue design read from the local ai-harness main tree, synthesis authored by the coordinator under the orchestrator authorship rule. No session, install, build, test or model call was run beyond the agents themselves; the host held a test-slot hold throughout. Each leg ran its own five-perspective critic pass; no cross-family review has yet read any packet or this synthesis.
<!-- /doc:region name="run_history" -->
