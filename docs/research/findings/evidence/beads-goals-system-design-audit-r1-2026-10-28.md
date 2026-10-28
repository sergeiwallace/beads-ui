---
title: "Cross-family doc-audit of the Beads goals system design, round 1"
category: research
tags: [audit, design, goals]
status: complete
date: 2026-10-28
template_version: "audit-1.0.0"
---

# Cross-family doc-audit of the Beads goals system design, round 1

MUST-FIX remain — 11 MUST-FIX, 2 WORTH-CONSIDERING, 0 TAKE-IT-OR-LEAVE-IT.

**Status:** findings-pending-fix

**Created:** 2026-10-28

**Auditor:** Codex (concrete model identifier not exposed)

**Target artifact:** `docs/designs/beads-goals-system-design.md` (working-tree version)

## Table of Contents

- [What Was Audited](#what-was-audited)
- [Scope](#scope)
  - [Founding ask and alignment](#founding-ask-and-alignment)
  - [In scope](#in-scope)
  - [Out of scope](#out-of-scope)
- [Run Ledger](#run-ledger)
- [Methodology](#methodology)
- [Status Summary](#status-summary)
- [Round 1 — Main Audit](#round-1--main-audit)
  - [R1 Summary](#r1-summary)
  - [R1 Findings](#r1-findings)
  - [R1 Resolution Pass](#r1-resolution-pass)
  - [R1 Verification Matrix](#r1-verification-matrix)
- [Decisions Requiring Team Input](#decisions-requiring-team-input)
- [Outstanding Issues to Fix](#outstanding-issues-to-fix)
- [Already-Correct Items](#already-correct-items)
- [Anti-Patterns to Watch For](#anti-patterns-to-watch-for)
- [Sign-Off Checklist](#sign-off-checklist)
- [Audit Log](#audit-log)
- [Appendix: Commands Run](#appendix-commands-run)
- [Files read](#files-read)

## What Was Audited

The complete working-tree target was checked against A001, its research/evidence, the parent and sibling designs, Beads 1.3.2 help, repository paths, the design template and the decision framework. The prompt's “committed” snapshot is stale: the target is modified in the working tree; `origin/main` remains at the stated base.

## Scope

### Founding ask and alignment

The supplied canonical root and its single raw entry were read in full. Goal hierarchy, assignment, links, dates, views, prioritisation, prior-work fold-in and privacy were traced to the target. Successor-brief fidelity is UNVERIFIED: the issue body could not be read because this confined host could not reach the local Dolt service, and no tracked exact mirror was found. This is an audit limitation, not a repository defect; recheck it before build authorization.

### In scope

Checks A–F from the invocation, decision authority, model/AC consistency, CLI feasibility, public-repository hygiene and the exact working-tree artifact.

### Out of scope

Tests, npm, builds, live writes and network fetches were prohibited. No repository named `sergei` was read.

## Run Ledger

ledger-version: 1

| Field | Value |
|---|---|
| Stage cursor | Round 1 complete |
| Promotion | blocked: 11 MUST-FIX |

## Methodology

Ground-truthed claims against raw asks, research evidence, parent decisions, CLI help, repository paths and legacy approval text; distinguished CONFIRMED from PLAUSIBLE; then re-ran nine redacted spot checks.

## Status Summary

| Tier / severity | Open | Fixed | Deferred |
|---|---:|---:|---:|
| MUST-FIX / MAJOR | 11 | 0 | 0 |
| WORTH-CONSIDERING / MINOR | 2 | 0 | 0 |
| TAKE-IT-OR-LEAVE-IT | 0 | 0 | 0 |

Ship-readiness: not ready for the successor build.

## Round 1 — Main Audit

**Round 1 auditor:** Codex (cross-family; concrete model identifier not exposed)

**Round 1 date:** 2026-10-28

**Round 1 scope:** checks A–F and successor alignment, subject to the successor-brief limitation above.

### R1 Summary

Eleven confirmed/plausible defects can misdirect implementation. No target edits were authorized.

### R1 Findings

#### MUST-FIX

1. **G1-M1 (JA-1) — [A/E] The “never reaches a shared repository” guarantee is not enforced as an invariant — `MAJOR`, CONFIRMED.** Location: Private-goal guard and D-13, lines 176–189, 947–977 (“Client-side guards can be skipped”). The design nevertheless says the guarantee is “exact,” while a direct binary/Dolt invocation or an unhooked client retains publication capability and the periodic scan detects only after publication. That narrows A001's enforced “never” requirement. Fix: make a guarded publisher the sole holder of shared-remote write capability (including Dolt), enumerate and deny direct publication routes, and test bypass attempts; if that cannot be built, leave the guarantee decision human-pending rather than claiming exact prevention. Verification: VM-1.

2. **G1-M2 (IC-1) — [C/E] Task privacy has contradictory semantics — `MAJOR`, CONFIRMED.** D-11 line 897 says “A task inherits the strictest marking,” but D-19 lines 1176–1209 says a shared task serving a private goal remains in the shared store and that store learns nothing. The privacy research, line 52, explicitly chooses the latter. A literal implementation either leaks the relationship while propagating a mark or blocks valid shared work. Fix: state that task content classification is intrinsic to the task/store; private goal membership and its link remain private and do not reclassify otherwise-shared work. Define when content requires a split private task. Verification: VM-2.

3. **G1-M3 (IC-2) — [A/C/E] Marked ordinary tasks have no schema — `MAJOR`, CONFIRMED.** The field table and data model (lines 108–125, 214–240) define `marking` only inside `metadata.goal`, while G1 lines 266–277 promises to refuse marked tasks. The guard therefore has no canonical task field, default, validation rule or migration rule. Fix: add a generic record classification schema (or an explicit task metadata/label contract), precedence/default rules, and create/update/publication ACs for marked and unmarked tasks. Verification: VM-3.

4. **G1-M4 (JA-2) — [B] D-17 improperly AI-resolves reversal of owner-approved content — `MAJOR`, CONFIRMED.** D-17 lines 1093–1128 admits that option (a) drops an owner-approved earlier design, yet records it resolved by AI. The legacy design's Feedback Round 4 (lines 1286–1310) records explicit approvals; decision-framework Gate B (lines 579–593) requires protected content to remain human-pending. Fix: mark D-17 pending with (a) as the recommendation, preserve the exact Pros/Cons/mitigations, and let the owner approve the departure. Verification: VM-4.

5. **G1-M5 (DV-1) — [C/D] D-3's atomic write mitigation cannot be implemented with the named CLI — `MAJOR`, CONFIRMED.** D-3 line 598 requires the edge and contribution metadata in one `bd batch`. Live `bd batch --help` says batch updates accept only status, priority, title, assignee and force; metadata and complex flags are excluded. Fix: choose and specify a real atomic transaction/API, or remove the duplicate map by choosing one canonical representation; add a crash-between-writes test if atomicity is impossible. Verification: VM-5.

6. **G1-M6 (IC-3) — [C/D] Required goal state is referenced but absent from the model — `MAJOR`, CONFIRMED.** D-4 requires conflict metadata; D-6/Risk 4 requires an owner-selected check-in cadence; alignment and Risk 3 distinguish breached versus in-band maintain goals. None of `conflicts`, cadence, or a maintain band appears in the field table/data model (lines 110–125, 217–239). Fix: add typed fields, defaults, validation and ACs for all three, and make the field table, model, decisions and phases identical. Verification: VM-6.

7. **G1-M7 (DV-2) — [A/C/D] Alignment cannot be reproduced from the design — `MAJOR`, CONFIRMED.** Lines 149–155 and G4 lines 341–353 use an undefined “goal weight,” beta and blocker discount. The underlying research lines 318–354 defines priority mapping, state factor, per-pool target/actual share and sources, but the design neither adopts nor explicitly rejects them. Fix: specify the complete formula and config schema, including priority-to-weight mapping, lifecycle/maintain/check-in factors, pool allocation policy, beta and blocker discount; add invalid/missing-input and worked-example ACs. Verification: VM-7.

8. **G1-M8 (IC-4) — [B/C] D-2 records two mutually exclusive choices — `MAJOR`, CONFIRMED.** The recommendation (lines 544–558) implements (a) now and only requests the upstream capability described by (d), while `decision-record` says `chosen-option=(a)+(d)`; option (d) is “Wait,” which the design does not choose. Fix: record `chosen-option=(a)` and describe the upstream request as mitigation/follow-up, or rewrite (d) as a compatible add-on option. Verification: VM-8.

9. **G1-M9 (DV-3) — [C/D] Progress roll-up has no deduplication rule — `MAJOR`, PLAUSIBLE.** Lines 129 and 306 include descendants when an epic is linked, but work can also be linked directly and through multiple ancestors/goals. The same issue can therefore enter a goal's denominator more than once under a literal traversal. Fix: define membership as a set keyed by canonical issue identity, use the strongest applicable contribution once, define cross-store identity, and add explicit-child-plus-linked-ancestor and diamond-graph tests.

10. **G1-M10 (JA-3) — [D] Acceptance criteria and phase contracts are not implementation-ready — `MAJOR`, CONFIRMED.** Examples include line 266 combining refusal, exit status, diagnostic and redaction into one AC, and line 272 combining validation, sequencing and output. Public modules listed in G2–G4 lack a failure-path AC per function, and G1 names no concrete source/test paths. Fix: split compound ACs into independently falsifiable criteria, add a negative path for every public function, and give every cross-repository phase exact files, tests and exit evidence.

11. **G1-M11 (F-1) — [F] The public design exposes a private tracker identifier — `MAJOR`, CONFIRMED.** Founding Ask Coverage line 21 embeds the private harness record's `task_id` in the public file. This violates the invocation's public-repository rule even though the file path itself is permitted. Fix: retain only a public-safe content digest/entry label and resolve the full canonical record from a private sidecar/tool at validation time. Verification: VM-9. No private row count, port, process command line, queue-auth wording or personal goal content was found in this target.

#### WORTH-CONSIDERING

1. **G1-W1 (F-2) — [C], high confidence.** The Run Ledger claims a completed doc boundary, but the audited target is currently modified and has no working-tree digest. Add the exact target blob/content digest to each audit round after fixes so later reviewers can reproduce the artifact.

2. **G1-W2 (F-3) — [E], medium confidence.** G1 covers repository publication and selected readers, but does not state retention/redaction rules for server/browser caches, application logs or local backups. The privacy research's leak table explicitly calls for no persistent client cache. Add a short data-lifecycle table and tests that private response bodies/titles never enter persistent caches or logs and that private backups remain private-only.

#### TAKE-IT-OR-LEAVE-IT

1. None.

### R1 Resolution Pass

| Findings | Status | Required resolution |
|---|---|---|
| G1-M1–M3, G1-M5–M11 | UNRESOLVED | Coordinator applies the concrete fixes and requests re-audit. |
| G1-M4 | TEAM INPUT NEEDED | Return target D-17 to human-pending. |
| G1-W1–W2 | UNRESOLVED / non-blocking | Coordinator may apply before re-audit. |

### R1 Verification Matrix

| VM | Finding | Re-run command | Actual output | Result |
|---|---|---|---|---|
| 1 | G1-M1 | `sed -n '176,189p;947,977p' TARGET` | Exact-guarantee text coexists with skipped-client and absent-scan admissions. | PASS |
| 2 | G1-M2 | `sed -n '897p;1174,1209p' TARGET`; `sed -n '52p' PRIVACY_RESEARCH` | Target says inherit; D-19/research say shared work stays shared. | PASS |
| 3 | G1-M3 | `rg -n 'marking' TARGET` | Schema hits are goal-only; task refusal ACs have no task field. | PASS |
| 4 | G1-M4 | `sed -n '1093,1128p' TARGET`; `sed -n '1286,1310p' LEGACY`; `sed -n '579,593p' FRAMEWORK` | AI-resolved reversal, prior approvals and Gate-B escalation all reproduced. | PASS |
| 5 | G1-M5 | `bd batch --help | rg 'Supported .update.|metadata|complex'` | Supported update keys exclude metadata; complex flags are rejected. | PASS |
| 6 | G1-M6/M7 | `sed -n '110,125p;149,155p;217,239p' TARGET` | Referenced cadence/conflict/band and weight/config inputs are absent from schema/formula. | PASS |
| 7 | G1-M8 | `sed -n '544,558p' TARGET` | Recommendation chooses current edge plus request; record says two choices. | PASS |
| 8 | G1-M9/M10 | `sed -n '129p;264,318p' TARGET` | Descendant inclusion has no set rule; sampled ACs are compound. | PASS |
| 9 | G1-M11 | `rg -n 'task_id' TARGET | cut -d: -f1` | `21` | PASS |

Verified: 9/9 spot-checks reproduce against the 2026-10-28 working-tree target.

## Decisions Requiring Team Input

No new AD-N was created. G1-M4 requires the existing target decision D-17 to use its own human-pending state; its already-complete options, Pros/Cons and final Recommendation remain the decision surface.

## Outstanding Issues to Fix

| ID | Priority | Issue | Owner | Target |
|---|---|---|---|---|
| I-01 | P1 | Resolve G1-M1–M11 | Design coordinator / owner for D-17 | Before successor build |

## Already-Correct Items

- A: top-most goal type, optional zero/one/many membership, standard links, priority views, three dates, graph/Gantt/timeline, owner/agent prioritisation and prior-work fold-in are present.
- B: other sampled decisions contain options, separate Pros/Cons, one Recommendation, mitigation and a decision record.
- C: no additional broken phase/risk cross-reference was found.
- D: the existing shared-core path is correct; future web paths are phase deliverables; phases state enabled after merge.
- E: no additional leak was asserted from failure-to-find.
- F: no prohibited row count, port, process command line, queue-auth wording or personal goal content was found.

## Anti-Patterns to Watch For

Do not treat client installation as a hard publication boundary, a research formula as adopted without restating its inputs, or failure-to-find as proof of absence.

## Sign-Off Checklist

- [ ] All 11 MUST-FIX findings corrected
- [x] Verification matrix run on 9 findings/groups
- [ ] Re-audit completed with zero MUST-FIX
- [ ] Successor brief compared exactly
- [ ] Owner rules on target D-17

## Audit Log

| Date | Action | Notes |
|---|---|---|
| 2026-10-28 | Round 1 audit complete | 11 MUST-FIX, 2 WORTH-CONSIDERING; no target edits. |

## Appendix: Commands Run

`sed`, `rg`, `find`, `git status`, `git rev-parse`, `bd --help`, `bd batch --help`, and path-existence checks. No test/build command ran.

## Files read

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
- `/data/projects/ai-harness/.worktrees/aih-ec2-3/docs/asks/BU-epic-goals-system-usmm.md`
- `/data/projects/ai-harness/.worktrees/aih-ec2-3-agents/bu-goals-webapp-coordinator/docs/designs/TEMPLATE.md`
- `/data/projects/ai-harness/.worktrees/aih-ec2-3-agents/bu-goals-webapp-coordinator/docs/audits/STUB.md`
- `/data/projects/ai-harness/.worktrees/aih-ec2-3-agents/bu-goals-webapp-coordinator/docs/audits/TEMPLATE.md`
- `/data/projects/ai-harness/.worktrees/aih-ec2-3-agents/bu-goals-webapp-coordinator/docs/procedures/decision-framework.md`
- `/data/projects/ai-harness/docs/designs/legacy-goal-system--daily-scoring-system.md` (approval sections)
