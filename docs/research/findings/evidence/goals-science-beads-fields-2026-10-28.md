---
title: "Beads fields read for the goal ontology mapping, 2026-10-28"
category: research
tags: [beads-ui, goals, beads, evidence]
status: complete
source: "claude-opus-5-5-2026-10-28"
task: BU-ylx.11.1.2
display_id: BU-agent-research-goal-mgqe
template_version: "research-findings-1.0.0"
---

# Beads fields read for the goal ontology mapping

Read-only commands run on 2026-10-28 at about 01:30 UTC in this worktree, at commit `0d07e7b` of `main`. They back the ontology mapping table in `../goals-science-ontology-and-alignment.md`. The sibling evidence file `goals-visualisation-measurements-2026-10-28.md` holds the wider Beads measurements; this file records only the fields the ontology table cites.

## `bd --version`

```text
bd version 1.3.2 (9b65b9e19)
```

## `bd types` (first 20 lines)

```text
Core work types (built-in):
  task           General work item (default)
  bug            Bug report or defect
  feature        New feature or enhancement
  chore          Maintenance or housekeeping
  epic           Large body of work spanning multiple issues
  decision       Architecture decision record (ADR)
  spike          Timeboxed investigation to reduce uncertainty before committing to a story
  story          User story describing a feature from the user's perspective
  milestone      Marks completion of a set of related issues (contains no work itself)

System types (built-in, created by bd commands):
  message        Message between agents or users
  molecule       Molecule root for swarm coordination (bd mol)
  gate           Async coordination gate (bd gate, formula gates)
  event          Audit-trail event (bd set-state)

Configured custom types:
  follow_up
  research
```

No `goal` type is built in. A store adds one through `types.custom`, as this store did for `follow_up` and `research`.

## `bd dep add --help` (lines matching `type` or `kind`)

```text
  -t, --type string         Dependency type (blocks|tracks|related|parent-child|discovered-from|until|caused-by|validates|relates-to|supersedes); 'blocked-by' and 'depends-on' are accepted as aliases for 'blocks' (default "blocks")
```

The help also states: "With no -t/--type the edge is created as type=blocks". No edge kind expresses goal conflict or partial contribution.

## `bd create --help` (lines matching `due`, `defer`, `estimate`, `metadata`, `priority`)

```text
      --defer string              Defer until date (issue hidden from bd ready until then). Same formats as --due
      --due string                Due date/time. Formats: +6h, +1d, +2w, tomorrow, next monday, 2025-01-15
  -e, --estimate int              Time estimate in minutes (e.g., 60 for 1 hour)
      --metadata string           Set custom metadata (JSON string or @file.json to read from file)
  -p, --priority string           Priority (0-4 or P0-P4, 0=highest) (default "2")
```

A goal can carry a due date, a defer date, a minute estimate, a priority and free metadata at creation. There is no planned-start or planned-end flag.
