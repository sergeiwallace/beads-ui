---
title: "Cross-family doc-audit of the Beads goals system design, round 3"
category: research
tags: [audit, design, goals]
status: complete
date: 2026-10-28
template_version: "audit-1.0.0"
---

# Cross-family doc-audit of the Beads goals system design, round 3

MUST-FIX remain — 6 MUST-FIX, 1 WORTH-CONSIDERING, 0 TAKE-IT-OR-LEAVE-IT.

**Status:** findings-pending-fix
**Auditor:** Codex (GPT-5)
**Target artifact:** `docs/designs/beads-goals-system-design.md`, working-tree SHA-256 `90bf84ee82d1be58bbe1dc17c5d13b91ddcc3c7e55ef1936b2171ab423930398`

## Table of Contents

- [What Was Audited](#what-was-audited)
- [Scope](#scope)
- [Run Ledger](#run-ledger)
- [Methodology](#methodology)
- [Status Summary](#status-summary)
- [Round 3 — Verification and Fresh Audit](#round-3--verification-and-fresh-audit)
- [Decisions Requiring Team Input](#decisions-requiring-team-input)
- [Outstanding Issues to Fix](#outstanding-issues-to-fix)
- [Already-Correct Items](#already-correct-items)
- [Anti-Patterns to Watch For](#anti-patterns-to-watch-for)
- [Sign-Off Checklist](#sign-off-checklist)
- [Audit Log](#audit-log)
- [Appendix: Files Read](#appendix-files-read)
- [Appendix: Commands Run](#appendix-commands-run)

## What Was Audited

The 108,355-byte working-tree design was audited after its round-2 fixes, before implementation. HEAD is `2be7911`; `origin/main` is `4a3a17c`; the target is modified, so this audit pins its content digest rather than treating HEAD as the audited bytes.

## Scope

### Founding ask and alignment

The complete A001 entry, not only the supplied excerpt, was read. Canonical root: `{"blob_oid":"8b43d16fb45272c4911f8de4d1b491e6bb472134","capture_commit":"b5eaeefd646b1fee17f189518ca9d32a67e9aad2","content_sha256":"79619e87b5d6a8e02204a9bf35e294caa65ab910f8be7f0d136e7035009caed0","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-epic-goals-system-usmm.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-epic-goals-system-usmm"}`. Founding-ask reference SHA-256: `c12436184b45bdc5c279f8f1d3928c6610536b5802f38b0760a6d47d4997dae6`.

### In scope

Checks A–F, both prior audit rounds, the design's exact decisions/ACs/phases, parent and sibling designs, research, live Beads 1.3.2 help, repository paths, and public-repository hygiene.

### Out of scope

Implementation and live-system mutation. No test, package, build, network, or write command ran.

## Run Ledger

| Field | Value |
|---|---|
| Stage cursor | doc-audit round 3 |
| Promotion | blocked by six MUST-FIX findings |
| Audited state | working tree, digest above |
| Base check | HEAD `2be7911`; `origin/main` `4a3a17c` |

## Methodology

Claims were traced to raw ask text, design prose, decisions, ACs, research, sibling designs, repository paths, Git state, and command help. Failure-to-find was not treated as proof of absence. CONFIRMED means directly reproduced; PLAUSIBLE marks judgment.

## Status Summary

| Tier | Count |
|---|---:|
| MUST-FIX | 6 |
| WORTH-CONSIDERING | 1 |
| TAKE-IT-OR-LEAVE-IT | 0 |

Ship-readiness verdict: the successor build remains blocked.

## Round 3 — Verification and Fresh Audit

### Check Dispositions

- **A — founding ask:** No direct A001 goals/privacy clause is dropped. D-8, D-14, D-17 and D-20 correctly remain human-pending. Exact successor-brief fidelity is unverified (G3-W1).
- **B — decisions:** D-13 violates the Authority test (G3-M6). Other decisions have options, separate Pros/Cons, one final Recommendation, mitigation and a decision record.
- **C — consistency:** G3-M1, G3-M2, G3-M3 and G3-M5.
- **D — buildability:** G3-M1, G3-M2, G3-M3 and G3-M5.
- **E — privacy/security:** G3-M4. D-20 appropriately leaves the strength of “never” pending.
- **F — public repository:** None. The target contains no prohibited private identifier, operational count, network endpoint, process command line, queue-auth wording or personal-goal content.

### MUST-FIX

1. **G3-M1 (N-1 / IC-1 / DV-1) — [A/C/D/E] Cross-store membership repair is internally impossible — `MAJOR`, CONFIRMED.**
   **Location:** “Private goals over shared work” says cross-store links use `external_members` (`docs/designs/beads-goals-system-design.md:195,269-270`), but T-G2.1 universally says linking “an issue” writes a native edge plus `contributions` (`:352`), and Risk 6 still says membership is an edge in the task's store (`:457`). Live `bd dep add --help` permits only the second endpoint to be external; a shared member cannot be the first endpoint of an edge held in the private store.
   **Fix:** split same-store and cross-store ACs. The latter must write only the private goal's canonical-identity `external_members` record, perform no shared-store write, and define strength there. Update Risk 6 and add red/green cross-store tests.
   **Verification:** reproduced from the cited lines and command help.

2. **G3-M2 (N-2 / IC-2) — [C/D] Progress criteria contradict metric, manual and subgoal sources — `MAJOR`, CONFIRMED.**
   **Location:** T-G2.2 computes subgoal, metric and manual progress without work members (`:365-370`), then requires *any* memberless goal to show “no data” (`:371`). A metric goal with complete metric inputs and no work members therefore must both compute and refuse a value.
   **Fix:** scope the memberless rule to work-based sources, or define explicit source precedence; add tests for memberless goals under all five sources.
   **Verification:** the contradiction reproduces in `:365-371`.

3. **G3-M3 (DV-1) — [C/D] The allocation factor is not reproducible — `MAJOR`, CONFIRMED.**
   **Location:** Alignment defines α using `a_gk` but calls it only the “actual share ... of closed effort” (`:161-164`). The adopted research supplies the omitted equation `sum(c_jg*m_j)/sum(m_j)` and says `m_j` is estimated minutes, falling back to 1 when fewer than half the window is estimated (`goals-science-ontology-and-alignment.md:326-334`). T-G4 covers an empty window but not this calculation (`:417-427`).
   **Fix:** restate the exact equation, item identity/deduplication, pool attribution, sparse-estimate fallback and zero-denominator behavior in the design and ACs; test each boundary.
   **Verification:** target and research differ exactly as cited; the Run Ledger's “full alignment formula” claim is overstated.

4. **G3-M4 (N-4 / JA-1) — [E] Free-text leak prevention and regression detection omit required history surfaces — `MAJOR`, CONFIRMED.**
   **Location:** the design claims derived private commit-message text is term-scanned (`:212,330`), but G1 names only pre-commit/pre-push hooks (`:304`), not `commit-msg`. Its periodic scan checks a repository “tip” (`:335`). Privacy research requires `commit-msg` and every ref/commit since a watermark, including store history (`goals-privacy-and-access-control.md:172,183,217`). A local private commit message precedes pre-push, and a pushed-then-removed leak remains in history but can disappear from a tip scan.
   **Fix:** add a `commit-msg` deliverable/AC and watermark scans of all refs, carrier refs and shared-store history; test a leak removed before the next scan and require redacted output.
   **Verification:** the writer/detector matrix remains incomplete on both cited paths.

5. **G3-M5 (N-5 / JA-2) — [C/D] The acceptance-criterion repair still claims coverage it does not provide — `MAJOR`, CONFIRMED.**
   **Location:** `:351` combines perform-target prompting with learn-definition behavior; `:408` combines HTTP caching with browser persistence. The public-function inventory says `classifyEdge` has a neither-endpoint failure AC and `orderBetween` an equal-neighbour AC (`:385`), but neither criterion exists in T-G2.1–G2.3.
   **Fix:** split independent behaviors and add explicit negative-path ACs for those functions, then map every exported function to the exact criterion that tests it.
   **Verification:** direct inspection of `:347-385,393-409` reproduces both missing mappings.

6. **G3-M6 (F-1) — [B] D-13 is AI-resolved despite cross-repository contract blast radius — `MAJOR`, CONFIRMED.**
   **Location:** D-13 chooses six client-side guard points as “Resolved by Opus orchestrator” (`:1029-1063`), while Phase G1 creates guard and installer contracts in another repository and every machine profile (`:292-304`). The decision framework Gate C requires escalation for a requirement/contract whose blast radius crosses repository boundaries (`decision-framework.md:621-641`).
   **Fix:** retain the founding-ask enforcement requirement, but return the cross-repository mechanism to human-pending with its existing options, Pros/Cons, mitigation and a pending decision record; gate Phase G1 on that ruling.
   **Verification:** the selected decision and Gate C satisfy the invocation's mandatory escalation test.

### WORTH-CONSIDERING

1. **G3-W1 (F-2) — [A], high confidence, PLAUSIBLE.** The exact proposed successor brief was not available in the files or repository search, so the design-to-build handoff cannot be compared clause by clause. This is not proof that no brief exists. **Fix:** before approval, attach a public-safe digest/read-only receipt for the exact brief and map every A001 goals/privacy clause to it.

### TAKE-IT-OR-LEAVE-IT

1. None.

### Round 1 Closure

| Finding | Result | Evidence |
|---|---|---|
| G1-M1–M6 | PASS | Guarantee, intrinsic marking, schema, D-17 authority, two-write safety and fields remain repaired. |
| G1-M7 | PARTIAL → G3-M3 | Actual-share equation/fallback is still absent. |
| G1-M8–M9 | PASS | Edge choice and canonical member-set rule hold. |
| G1-M10 | PARTIAL → G3-M5 | Compound ACs and missing negative-path mappings remain. |
| G1-M11 | PASS | Canonical-root task id is this public repository's own id. |
| G1-W1–W2 | PASS | Digest and cache/log/backup coverage are present at design level. |

### Round 2 Closure

| Finding | Result | Evidence |
|---|---|---|
| G2-M1 | PARTIAL → G3-M1 | `external_members` landed; generic native-edge AC and Risk 6 contradict it. |
| G2-M2 | PARTIAL → G3-M2 | Formulas landed; global no-members rule conflicts with three sources. |
| G2-M3–M4 | PASS | Zero target is rejected; pending questions/prompts agree. |
| G2-M5 | PARTIAL → G3-M4 | More writers landed; commit-message and history detection remain incomplete. |
| G2-M6 | PARTIAL → G3-M5 | Real boundary and inventory landed; claimed AC coverage remains false. |
| G2-M7–M8 | PASS | Task classification and blocker recurrence fixes hold. |

### Verification Matrix

| Finding | Re-run evidence | Result |
|---|---|---|
| G3-M1 | Target `:195,269-276,352,457`; `bd dep add --help` | PASS |
| G3-M2 | Target `:365-371` | PASS |
| G3-M3 | Target `:161-164,417-427`; science research `:326-334` | PASS |
| G3-M4 | Target `:304,330,335`; privacy research `:172,183,217` | PASS |
| G3-M5 | Target `:351,385,408` | PASS |
| G3-M6 | Target `:292-304,1029-1063`; framework `:621-641` | PASS |

**Verified: 6/6 MUST-FIX findings reproduce.**

## Decisions Requiring Team Input

No new AD-N is created. G3-M6 requires target D-13 itself to become the decision surface. Existing pending decisions are not re-raised.

## Outstanding Issues to Fix

All six MUST-FIX findings block the successor build. G3-W1 blocks a claim of verified handoff fidelity, not design correction itself.

## Already-Correct Items

The top-most goal type; optional zero/one/many assignment; priority view; relates/dependency/block links; start/end/due dates; graph/Gantt/timeline views; person/agent alignment; and prior-work fold-in remain represented. Shared-core paths exist; web paths are explicitly future deliverables; phases say they ship enabled after merge and live verification. The public-content scan is clean.

## Anti-Patterns to Watch For

Do not let a generic AC override a storage-specific rule, claim a formula by reference without its operands, equate tip scanning with history scanning, or list a failure path that no criterion states.

## Sign-Off Checklist

- [x] A001 read in full and checks A–F dispositioned
- [x] Round-1 and round-2 fixes reverified
- [x] Verification matrix reproduced 6/6
- [ ] Six MUST-FIX findings corrected
- [ ] Exact successor brief compared
- [ ] Re-audit reaches zero MUST-FIX

## Audit Log

| Date | Round | Action |
|---|---:|---|
| 2026-10-28 | 3 | Independent working-tree re-audit: 6 MUST-FIX, 1 WORTH-CONSIDERING. |

## Appendix: Files Read

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
- `docs/research/findings/evidence/beads-goals-system-design-audit-r2-2026-10-28.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3/docs/asks/BU-epic-goals-system-usmm.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3-agents/bu-goals-webapp-coordinator/docs/designs/TEMPLATE.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3-agents/bu-goals-webapp-coordinator/docs/audits/STUB.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3-agents/bu-goals-webapp-coordinator/docs/audits/TEMPLATE.md`
- `/data/projects/ai-harness/.worktrees/ops-vm-3-agents/bu-goals-webapp-coordinator/docs/procedures/decision-framework.md`

## Appendix: Commands Run

Read-only `sed`, `rg`, `git status`, `git rev-parse`, `sha256sum`, `wc`, `bd --help`, `bd dep add --help`, `bd hooks --help`, and path checks. No tests or builds ran.
