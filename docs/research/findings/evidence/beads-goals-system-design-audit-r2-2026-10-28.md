---
title: "Cross-family doc-audit of the Beads goals system design, round 2"
category: research
tags: [audit, design, goals]
status: complete
date: 2026-10-28
template_version: "audit-1.0.0"
---

# Cross-family doc-audit of the Beads goals system design, round 2

MUST-FIX remain — 8 MUST-FIX, 0 WORTH-CONSIDERING, 0 TAKE-IT-OR-LEAVE-IT.

**Status:** findings-pending-fix

**Target:** `docs/designs/beads-goals-system-design.md`, committed at `3dae308`, content SHA-256 `7a2b06c16bff835302f3eb1357bfb933c9c61f66d96feea290155667e0ed48c1`

**Snapshot note:** `origin/main` remains at the stated base; the audited goal design is now committed and clean, unlike the round-1 working-tree snapshot. The exact successor issue body remains unverified because the confined route cannot open the local Beads service; this is an audit limitation, not a repository finding.

## Round 2 — Verification and Fresh Audit

### MUST-FIX

1. **G2-M1 (N-1 / DV-1) — [A/C/D/E] Cross-store private membership cannot be represented by the chosen edge — `MAJOR`, CONFIRMED.**
   **Location:** Links and D-2 (“`relates-to` edge from the member to the goal”), Private goals over shared work (“links live in the private store”), and Data Model (“`<member> relates-to <goal>`”). Live `bd dep add --help` accepts an external reference only as the second, depended-on endpoint; the first issue is local. A shared member therefore cannot be the source of a private-store edge to a local private goal. Reversing it would violate D-2’s endpoint semantics. The inconsistency continues in `contributions: { <member-id>... }`, while line 150 says canonical identity is store plus id.
   **Fix:** add a decision for a buildable private-side membership representation—such as a private goal metadata/link record keyed by `{repository, issue_id}`—while retaining native edges for same-store membership. Update D-2, D-3, D-12, D-19, the model, cycle checks and cross-store tests together.

2. **G2-M2 (N-2 / IC-1) — [C/D] Three selected progress sources have no specified behavior — `MAJOR`, CONFIRMED.**
   **Location:** Goal model and Data Model enumerate `work_estimate`, `work_count`, `subgoal`, `metric`, and `manual`; T-G2.2 specifies only estimate progress and its count fallback. No criterion defines explicit `work_count`, subgoal aggregation, metric direction/clamping, or how the check-in’s progress value becomes manual progress. Implementations can produce incompatible percentages while satisfying the phase.
   **Fix:** define a formula, required inputs, “no data” behavior and failure criterion for every source; add one positive and one malformed/missing-input AC for each.

3. **G2-M3 (N-3 / DV-2) — [C/D] The round-1 alignment fix introduced division by zero — `MAJOR`, CONFIRMED.**
   **Location:** Goal model permits `target_share` from 0 to 1, while Alignment divides by the target share. T-G4 handles an empty closed-work window but not a target share of zero.
   **Fix:** either constrain configured shares to `(0,1]` with omission meaning “no target”, or define zero’s semantics without division; add validation and tests for omitted, zero, positive and empty-window inputs.

4. **G2-M4 (N-4 / IC-2) — [B/C] Pending decisions are marked resolved and two are absent from the review prompt — `MAJOR`, CONFIRMED.**
   **Location:** Open Questions 3–5 are headed `[RESOLVED]` although D-14, D-8 and D-17 are pending; question 5 says “decided” despite D-17’s pending record. Question 6 says client guards “stand on their own” while D-20 still decides whether a gateway is required. The final feedback block asks only about D-8 and D-14, omitting D-17 and D-20.
   **Fix:** mark questions 3–5 pending, distinguish the unavailable native ruleset from D-20’s self-hosted gateway, and list all four pending decisions in the feedback block.

5. **G2-M5 (N-5 / JA-1) — [A/D/E] The guard phase omits known egress paths and does not implement its backup promise — `MAJOR`, CONFIRMED.**
   **Location:** The guard table and T-G1.4 cover only marked git-inbox, Agent Mail and held bodies. The privacy research identifies founding-ask capture as a direct shared-repository writer and requires it in carrier checks. The design admits derived private text requires term scanning, but T-G1.3–G1.4 never require that scan for commits or carriers. “Phase G3 tests each row” of Caches, logs and backups is false: G3 has no backup AC or deliverable.
   **Fix:** create an exhaustive writer matrix and add exact integration files and red-arm ACs for ask capture, transcript/brief writers, personal-host term scanning at commit/push/carrier paths, and every supported private-store backup path. Narrow any guarantee for paths deliberately left unsupported.

6. **G2-M6 (N-6 / JA-2) — [C/D/E] The claimed Beads write hook does not exist, and the AC repair remains incomplete — `MAJOR`, CONFIRMED.**
   **Location:** Phase G1 promises “hooks wired at `bd` create and update” and T-G1.1 promises refusal at write time. Live `bd hooks --help` exposes git hooks only; the privacy research explicitly says `bd-new` is a convenience layer that raw `bd create` bypasses. Several ACs also still test multiple behaviors, including T-G2.1’s create criterion and G3’s graph-render criterion, and exported symbols are not enumerated, so the required failure-path-per-public-function check cannot be performed.
   **Fix:** name the actual enforcement boundary: guard `bd-new` and web writes, then catch raw CLI writes at publication, or introduce an owned all-invocation wrapper/upstream policy hook. Split remaining compound ACs and list exported symbols with a negative-path AC for each.

7. **G2-M7 (N-7 / IC-3) — [C/E/G] Round 1’s task-marking contradiction remains in the guard table — `MAJOR`, CONFIRMED.**
   **Location:** Goal model and D-11 say a shared task serving a private goal stays shared because its link is private; the guard table still refuses “a task under” a marked goal. T-G1.1 instead correctly refuses a task only by its own marking.
   **Fix:** replace “a task under one” with “a task whose own marking is restricted” and add separate tests proving a shared task may serve a private goal without reclassification while a private-content task cannot enter a shared store.

8. **G2-M8 (N-8 / DV-3) — [C/D] Blocker-alignment propagation is not reproducible — `MAJOR`, CONFIRMED.**
   **Location:** Alignment promises propagation per edge up to `blocks_depth = 3`, but T-G4 has only a one-edge criterion. It does not define aggregation across several blocked items or paths, deduplication, cycle handling, or whether agent-created blocking edges await review. The fold-in research recommends a max recurrence and explicitly identifies agent-created blockers as a gaming path.
   **Fix:** state the recurrence, cap, path/dedup and cycle rules; apply review status to agent-created blocking edges; test depths zero through the configured maximum, a diamond, multiple blocked items and a cycle.

### WORTH-CONSIDERING

1. None.

### TAKE-IT-OR-LEAVE-IT

1. None.

## Round 1 Closure

| Round-1 finding | Verdict | Verification |
|---|---|---|
| G1-M1 | PASS | D-20 is human-pending and lines 212/1281 bound the guarantee to installed guarded paths. |
| G1-M2 | PARTIAL | D-11 now makes marking intrinsic, but guard-table line 203 retains the contradictory “task under one” rule (G2-M7). |
| G1-M3 | PASS | `metadata.privacy.marking`, defaults and ordinary-task criteria now exist. |
| G1-M4 | PASS | D-17 is human-pending with a pending decision record. |
| G1-M5 | PASS | D-3 now specifies edge-first, safe half-written states and tests. |
| G1-M6 | PASS | Conflict, cadence, maintain band and target-share fields are present with relevant validation. |
| G1-M7 | PARTIAL | The formula and config landed, but zero is admitted into a denominator (G2-M3). |
| G1-M8 | PASS | D-2 records only option (a); the upstream request is a mitigation. |
| G1-M9 | PARTIAL | Deduplication says store plus id, but the persisted contribution key and cross-store edge do not (G2-M1). |
| G1-M10 | FAIL | Paths were added, but compound ACs and unverifiable public-function failure coverage remain (G2-M6). |
| G1-M11 | PASS | The canonical-root task identifier is explicitly the public repository’s own identifier under this round’s brief. |
| G1-W1 | PASS | The ledger records the exact round-1 audited digest. |
| G1-W2 | PARTIAL | Cache/log/backup rules were added, but backup enforcement and testing were not (G2-M5). |

## Verification Matrix

| Finding | Re-run | Actual | Result |
|---|---|---|---|
| G2-M1 | Target lines 134, 195, 269, 275 plus `bd dep add --help` | Member-to-goal direction conflicts with external-target-only CLI shape; key is id-only. | PASS |
| G2-M2 | Target lines 119, 150, 259 and 352–364 | Five sources declared; only estimate/count behavior specified. | PASS |
| G2-M3 | Target lines 125, 161 and 403 | Zero allowed, used as divisor, with no zero-target AC. | PASS |
| G2-M4 | Target lines 448–455 and 1318–1321 | Pending decisions are labelled resolved; final prompt lists only two. | PASS |
| G2-M5 | Target lines 203–239 and 303–334; privacy research lines 181 and 218 | Ask capture and term-scanned carriers are absent; backup row has no AC. | PASS |
| G2-M6 | `bd hooks --help`; target lines 303, 342 and 376 | Only git hooks exist; sampled ACs remain compound. | PASS |
| G2-M7 | Target lines 130, 203 and 307 | Intrinsic task marking and “task under one” conflict. | PASS |
| G2-M8 | Target lines 172, 178 and 406; fold-in lines 332–340 | Depth-three prose collapses to a one-edge AC; aggregation/review rules are absent. | PASS |

**Verified: 8/8 findings reproduce on the target digest above.**

## Check Dispositions

- **A:** G2-M1 blocks a required private-goal/shared-task case. Other goals clauses are present. Exact successor-brief comparison remains unavailable for the confined-service reason stated above.
- **B:** No new decision-format or authority finding; all 20 decision blocks have options, separate Pros/Cons, one Recommendation and one decision record.
- **C:** G2-M1–M4, G2-M7 and G2-M8.
- **D:** G2-M1–M3, G2-M6 and G2-M8.
- **E:** G2-M1, G2-M5 and G2-M7. D-20 correctly remains pending rather than silently weakening “never”.
- **F:** None. No prohibited private identifier, operational count, network endpoint, process command line, queue-auth wording or personal goal content was found in the target.

## Decisions Requiring Team Input

No new AD-N is created. The target’s four existing human-pending decisions remain the appropriate decision surfaces.

## Already-Correct Items

- The ask’s hierarchy, optional zero/one/many membership, standard links, priority view, three dates, graph/Gantt/timeline views, owner/agent alignment and prior-work fold-in are represented.
- D-9 explicitly identifies its refinement of the parent web-stack decision.
- The implementation phases name repositories, source/test paths and enabled-after-live-verification behavior.
- Cache-control, browser persistence and application-log rules have corresponding G3 criteria.

## Audit Log

| Date | Action | Notes |
|---|---|---|
| 2026-10-28 | Round 2 verification and fresh audit | 8 MUST-FIX; 8/8 verification checks reproduced; no target edits. |

## Files read:

- `docs/designs/beads-goals-system-design.md`
- `docs/designs/beads-ui-design.md`
- `docs/designs/beads-ui-web-app-design.md`
- `docs/research/goals-system.md`
- `docs/research/findings/goals-products-and-visualisation-landscape.md`
- `docs/research/findings/goals-science-ontology-and-alignment.md`
- `docs/research/findings/goals-privacy-and-access-control.md`
- `docs/research/findings/goals-prior-work-fold-in.md`
- `docs/research/findings/evidence/goals-visualisation-measurements-2026-10-28.md`
- `docs/research/findings/evidence/goals-science-beads-fields-2026-10-28.md`
- `docs/research/findings/evidence/goals-privacy-measurements-2026-10-28.md`
- `docs/research/findings/evidence/goals-system-verification-2026-10-28.md`
- `docs/research/findings/evidence/beads-goals-system-design-audit-r1-2026-10-28.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3/docs/asks/BU-epic-goals-system-usmm.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3-agents/bu-goals-webapp-coordinator/docs/designs/TEMPLATE.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3-agents/bu-goals-webapp-coordinator/docs/audits/STUB.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3-agents/bu-goals-webapp-coordinator/docs/audits/TEMPLATE.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3-agents/bu-goals-webapp-coordinator/docs/procedures/decision-framework.md`
