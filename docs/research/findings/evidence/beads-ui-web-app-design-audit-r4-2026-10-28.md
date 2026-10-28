---
title: "Cross-family doc-audit of the beads-ui web app design, round 4"
category: research
tags: [audit, design, web-app]
status: complete
---

# Cross-family doc-audit of the beads-ui web app design, round 4

MUST-FIX remain — 5 MUST-FIX, 2 WORTH-CONSIDERING, 0 TAKE-IT-OR-LEAVE-IT.

## Table of Contents

- [What Was Audited](#what-was-audited)
- [Scope](#scope)
- [Methodology](#methodology)
- [Status Summary](#status-summary)
- [Round 4 — Verification and Independent Audit](#round-4--verification-and-independent-audit)
  - [R4 Summary](#r4-summary)
  - [MUST-FIX](#must-fix)
  - [WORTH-CONSIDERING](#worth-considering)
  - [TAKE-IT-OR-LEAVE-IT](#take-it-or-leave-it)
  - [R4 Resolution Pass](#r4-resolution-pass)
  - [R4 Verification Matrix](#r4-verification-matrix)
- [Decisions Requiring Team Input](#decisions-requiring-team-input)
- [Outstanding Issues to Fix](#outstanding-issues-to-fix)
- [Already-Correct Items](#already-correct-items)
- [Sign-Off](#sign-off)
- [Audit Log](#audit-log)
- [Files read](#files-read)

## What Was Audited

The working-tree `docs/designs/beads-ui-web-app-design.md` at beads-ui HEAD `2be79116948d` was audited against founding ask A001, the approved parent design, its research, rounds 1–3, the decision framework and the current event-driven wake evidence. The target is committed; the parent design has an unrelated working-tree edit, so its current bytes and history were both checked. Local `origin/main` remains `4a3a17c8e651`.

## Scope

All checks A–G are in scope. The raw founding ask was read in full. Exact successor-brief and dependency-edge evidence was sought separately from the design’s phase text; failure to retrieve that external record is treated as unverified, not as proof of absence.

## Methodology

Every load-bearing claim below was cross-read against the cited design lines, parent decision, decision framework, prior audits, repository inventory or git history. `CONFIRMED` means reproduced from those artifacts. No implementation exists yet, so no design promise is credited as shipped behavior.

## Status Summary

| Check | Disposition |
|---|---|
| A. Founding-ask fidelity | JA-1 affects the required non-queue deployment. The remaining raw web-app clauses have design coverage. F-2 leaves exact successor fidelity unverified. |
| B. Decision quality / authority | IC-2 and JA-2. D-15 is correctly human-pending, but the architecture assumes one option; five other cross-boundary choices and D-21 are marked AI-resolved without authority. |
| C. Internal consistency | IC-1, IC-2 and IC-3. |
| D. Buildability | F-1, F-2, IC-1, IC-2, JA-1 and JA-2. |
| E. Security and privacy | F-1 and JA-1. |
| F. Public-repository hygiene | None. The enumerated scan found no prohibited private issue identifier, live row count, literal service port, host runtime command line or prohibited authentication-posture statement. |
| G. Rounds 1–3 closure | All round-3 fixes hold; see the closure table. The five current MUST-FIX findings are independent defects, not failed round-3 fixes. |

## Round 4 — Verification and Independent Audit

### R4 Summary

The design is not ready to authorize the build. Its first actionable phase precedes its security boundary and receiver transport, one required storage mode has no executable phase contract, the architecture commits to a pending portal option, and several decisions exceed AI authority.

### MUST-FIX

1. **W4-M1 / F-1 — MAJOR, CONFIRMED — Actionable dispatch ships before its security boundary (checks D/E).** **Location:** Implementation Phases, “Every phase ships enabled once merged and live-verified” and W1’s prompt/answer/unblock criteria (`docs/designs/beads-ui-web-app-design.md:273-339`); authentication and the repository allowlist first appear in W3 (`:392-428`). **Problem:** W1 creates instructions that a session can act on and W2 exposes the receiver API, while request authentication, write authorization and fail-closed data scope do not land until W3. A reachable caller can therefore create actionable work during valid W1/W2 deployments without D-17/D-18. **Fix:** add a security-foundation phase before W1 containing browser authentication, dispatch-write authorization, receiver credentials, the repository allowlist and negative end-to-end tests; keep those controls enabled from the first actionable deployment. **Verification note:** phase ordering and each control’s first deliverable were reproduced directly.

2. **W4-M2 / IC-1 — MAJOR, CONFIRMED — W1’s exit gate depends on the receiver and envelope delivered only in W2 (checks C/D).** **Location:** W1 says delivery is turn-end-only, then requires “the target host’s dispatch receiver” to apply answers and unblocks and proves remote delivery in its exit gate (`:279,282-339`); receiver API/client and signature verification are W2 deliverables (`:341-373`). **Problem:** W1 cannot independently meet its own acceptance criteria or live gate. Acting before W2 also bypasses D-8’s required verified envelope. **Fix:** land a minimal authenticated receiver API/client and envelope before any W1 action, or merge/reorder W1 and W2 and rewrite both gates so every phase is independently shippable. **Verification note:** the producer, consumer, transport and verifier were traced phase by phase.

3. **W4-M3 / JA-1 — MAJOR, CONFIRMED — The required local dispatch-store branch is not buildable or testable (checks A/D/E).** **Location:** D-14 chooses “a local append-only store otherwise” and promises a shared `DispatchStore` suite (`:1056-1090`), but no phase deliverable or test names that interface or implementation. **Problem:** the deployment without the central queue is a founding-ask path, yet the phases define no local persistence, restart recovery, receipt/idempotency, expiry, body deletion, tombstone, compaction or backup behavior. The only `DispatchStore` occurrence is non-executable mitigation prose. **Fix:** name the interface and both implementations in phase deliverables, add one shared contract suite for create/read/receipt/idempotency/restart/expiry/body deletion/tombstones/backups, and require a live no-queue exit gate. **Verification note:** a full design search reproduced the single interface mention and absence from deliverables/tests.

4. **W4-M4 / IC-2 — MAJOR, CONFIRMED — Current architecture assumes a portal option that remains pending (checks B/C/D).** **Location:** Access states the app is “registered through app-portal’s `apps.yaml`” (`:178-180`); W3 makes registration conditional on D-15 (`:392-399`); D-15 remains human-pending and says standalone operation continues until the ruling (`:1096-1131`). **Problem:** an implementer following Architecture receives a different topology from the decision and phase contract. **Fix:** show standalone operation as the current baseline, make portal registration and diagrams conditional, and give each D-15 option its own topology/deliverables. **Verification note:** all three statements were cross-read and conflict literally.

5. **W4-M5 / JA-2 — MAJOR, CONFIRMED — AI-resolved decisions exceed the decision framework’s authority (checks B/D).** **Location:** D-2, D-6, D-8, D-10 and D-20 are marked “Resolved by Opus orchestrator,” while phases add a structured held-data command, notifier admission, receiver client/instructions and verifier in another repository (`:282,346,616-646,763-800,838-873,911-946,1267-1303`). D-21 also changes the parent’s board-order default (`:1309-1336`). **Evidence:** the decision framework says a requirement or contract change with cross-repository blast radius escalates (`ai-harness:docs/procedures/decision-framework.md:621-630`). The parent is status `approved`, its Approval Log records whole-design approval, and its D-6 keeps rank behind an opt-in setting (`docs/designs/beads-ui-design.md:5,49,1194-1229,3975-3980`). **Problem:** the build is told these choices are settled even though they alter external contracts or reopen an approved default. **Fix:** return the cross-boundary portions of D-2/D-6/D-8/D-10/D-20 and all of D-21 to human-pending, retain the recommendations, and keep the approved parent behavior until a ruling is recorded. **Verification note:** status, lineage, deliverables, framework gate and parent approval were all reproduced.

### WORTH-CONSIDERING

1. **W4-W1 / IC-3 — MINOR, CONFIRMED, confidence HIGH — Decision references are stale or ambiguous (check C).** Founding Ask Coverage cites local D-12 for “Stack and look,” but D-12 governs shortcuts (`:30,984-1008`). D-21’s summary and mitigation say “D-6’s keys” without identifying the approved parent D-6 (`:568,1309-1336`), while local D-6 is the dispatch ladder. **Fix:** remove the D-12 stack citation and qualify every rank reference as parent-design D-6. **Verification note:** each referenced decision heading was opened, not inferred from numbering.

2. **W4-W2 / F-2 — MINOR, CONFIRMED verification gap, confidence HIGH — The exact successor brief and claimed dependency edges are not auditable (checks A/C/G).** The design says the build dependency edges are “wired” and treats its phases as the successor brief (`:271-275`), but no public-safe exact issue body, digest or edge receipt is tracked with the artifact; the confined read route could not query the task service. This does not prove the edges are absent, but it leaves the load-bearing transition claim unverified. **Fix:** attach a public-safe successor-brief digest and read-only edge receipt, then compare every A001 clause against that exact brief before approval. **Verification note:** repository/history search found only the assertion; external state is explicitly UNVERIFIED.

### TAKE-IT-OR-LEAVE-IT

1. None.

### R4 Resolution Pass

| Finding | Status | Required disposition |
|---|---|---|
| W4-M1–W4-M5 | OPEN | Must be corrected or explicitly ruled before build authorization. |
| W4-W1–W4-W2 | OPEN | Correct during the same revision; neither changes the architecture choice. |

Prior-round closure:

| Prior item | Round-4 result |
|---|---|
| W3-M1 | PASS — producers set `arm_goal` (`:384-389`). |
| W3-M2 | PASS — owner picker covers card, row and detail (`:290,339`). |
| W3-M3 | PASS — wake-off retains addressed mail and passive delivery (`:256,353-354`). |
| W3-M4 | PASS — every configured fallback rung has an AC (`:355-358`). |
| W3-M5 | PASS — browser-write predicates are explicit (`:412-420`). |
| W3-M6 / earlier W2-M11 | PASS — expiry, logout, individual revoke and rotate-all exist (`:422-428,1212`). |
| W3-W1 | PASS — activation replaces stale seeding language (`:469,488`). |
| W3-W2 | PASS — RFC 8785 and cross-runtime golden vectors are required (`:369-370`). |
| Earlier items round 3 marked PARTIAL/FAIL | PASS as recorded in round 3; no contrary current evidence found. |

### R4 Verification Matrix

| Finding | Reproduced check | Actual result | Pass |
|---|---|---|---|
| W4-M1 | `sed -n '273,283p;392,428p'` on target | W1 acts; security controls first land in W3 | Yes |
| W4-M2 | `sed -n '279,339p;341,373p'` | W1 consumes remotely; receiver/envelope are W2 | Yes |
| W4-M3 | `rg -n 'DispatchStore|local append-only|local store'` | One interface promise; no phase implementation/test | Yes |
| W4-M4 | `sed -n '178,180p;392,399p;1096,1131p'` | Unconditional architecture conflicts with pending decision | Yes |
| W4-M5 | Cross-read target decisions, framework `:621-630`, parent `:1194-1229,3975-3980` | External-contract and approved-default changes are AI-resolved | Yes |
| W4-W1 | `sed -n '29,31p;553,568p;1309,1336p'` | Local D-12 is shortcuts; local D-6 is dispatch | Yes |
| W4-W2 | `sed -n '271,275p'` plus repository/history search | Assertion present; exact brief/receipt unavailable | Yes |

Verified: 7/7 sampled findings reproduced.

## Decisions Requiring Team Input

No new AD-N is introduced. W4-M5 requires existing target decisions to return to their own human-pending state; D-15 already has the correct decision skeleton and status.

## Outstanding Issues to Fix

W4-M1 through W4-M5 block sign-off. W4-W1 and W4-W2 should be closed in the same revision so citations and transition evidence cannot mislead the build.

## Already-Correct Items

Outside the findings above, the design covers kanban/sprint/backlog interactions, quick edits and rearrangement, held-item detail and response, per-task prompts, automatic handoff, event-only notification with configurable fallbacks, ordered/filtered review and work queues, goal arming, shared surfaces, backend integration and both access contexts. Round-3 security/session and wake-policy fixes remain intact. The public-repository hygiene scan is clean.

## Sign-Off

**Blocked.** Five MAJOR findings remain. Re-audit after correction and after the exact successor brief and dependency receipt are available.

## Audit Log

| Date | Round | Notes |
|---|---:|---|
| 2026-10-28 | 4 | Independent cross-family re-audit; 5 MUST-FIX and 2 WORTH-CONSIDERING findings. |

## Files read:

- `docs/designs/beads-ui-web-app-design.md`
- `docs/designs/beads-ui-design.md`
- `docs/research/beads-ui-web-app.md`
- `docs/research/findings/beads-ui-web-app-event-dispatch.md`
- `docs/research/findings/beads-ui-web-app-backend-portal-and-access.md`
- `docs/research/findings/beads-ui-web-app-ux-stack-and-shared-code.md`
- `docs/research/findings/evidence/beads-ui-web-app-design-audit-r1-2026-10-28.md`
- `docs/research/findings/evidence/beads-ui-web-app-design-audit-r2-2026-10-28.md`
- `docs/research/findings/evidence/beads-ui-web-app-design-audit-r3-2026-10-28.md`
- `plugins/beads-ui/core/src/` and `plugins/beads-ui/core/test/` (inventory)
- `ai-harness:docs/asks/<founding-ask record>.md`
- `ai-harness:docs/designs/<event-driven idle-wake design>.md` (working-tree copy and current `origin/main`)
- `ai-harness:docs/designs/TEMPLATE.md`
- `ai-harness:docs/procedures/decision-framework.md`
- `ai-harness:docs/audits/STUB.md`
- `ai-harness:docs/audits/TEMPLATE.md`
- `ai-harness:src/ai_harness/defaults/idle-wake.json`
- `ai-harness:src/ai_harness/cli.py`
- `ai-harness:tests/test_install_idle_wake_config.py`
