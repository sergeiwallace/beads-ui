---
title: "Cross-family doc-audit of the beads-ui web app design, round 5"
category: research
tags: [audit, design]
status: complete
---

# Cross-family doc-audit of the beads-ui web app design, round 5

MUST-FIX remain — 5 MUST-FIX, 1 WORTH-CONSIDERING, 0 TAKE-IT-OR-LEAVE-IT.

## What Was Audited

The working-tree design was audited after its uncommitted round-4 fixes, at repository HEAD `2be79116948d` with local `origin/main` at `4a3a17c8e651`. The full raw founding-ask entry, approved parent design, research, rounds 1–4, decision framework, current event-wake design and repository inventory were cross-read. No web implementation exists yet, so design promises were not credited as shipped behavior.

## Scope and Method

All checks A–G were in scope. `CONFIRMED` means the cited bytes or history were reproduced; `PLAUSIBLE` is reserved for judgment. The exact successor brief could not be retrieved because the confined read route's task query failed with “database connection denied”; that state is `UNVERIFIED`, not evidence that an edge or clause is absent. The canonical founding-ask metadata was verified but is not reproduced in this public file because it contains a non-public tracking identifier.

## Check Dispositions

| Check | Disposition |
|---|---|
| A. Founding-ask fidelity | No dropped raw web-app clause found in the design. W5-M4 weakens its claimed fast-answer behavior; W5-W1 leaves exact successor-brief fidelity unverified. |
| B. Decision quality / authority | W5-M1. Option/Pros/Cons/Recommendation/record/mitigation structure otherwise holds. Existing human-pending choices are not re-raised. |
| C. Internal consistency | W5-M4 and W5-M5. |
| D. Buildability | W5-M1, W5-M3, W5-M4 and W5-M5. |
| E. Security and privacy | W5-M2 and W5-M3. |
| F. Public-repository hygiene | None. The enumerated scan found no prohibited non-public tracker identifier, live row count, literal service port, host process command line or prohibited queue-authentication wording. |
| G. Prior-round closure | Four round-4 MUST-FIX fixes and W4-W1 hold; W4-M5 fails and W4-W2 remains partial. All round-3 fixes and the earlier PARTIAL/FAIL items still hold. |

## Round 5 Findings

### MUST-FIX

1. **W5-M1 / N-1 — MAJOR, CONFIRMED — The round-4 authority repair still treats external contract choices as settled (checks B/D/G).** **Location:** Design Decisions, “the design choices themselves stay resolved,” D-2, D-6, D-8, D-10, D-16, D-20 and D-22 (`docs/designs/beads-ui-web-app-design.md:563-590,1157-1193,1364-1390`). **Problem:** D-22 asks for a human ruling on companion-repository work but explicitly leaves the choices that define those new contracts AI-resolved. It omits D-16 entirely even though W3 modifies that repository's access-route map (`:434-456`). The authority framework says a contract or requirement change with cross-repository blast radius escalates (`docs/procedures/decision-framework.md:621-630`). Thus the build is told that the external interfaces are final before the pending ruling. **Fix:** make every cross-boundary effect, including the access-route change, explicitly contingent within one comprehensive pending decision; remove “stay resolved” and any settled status for the external-contract portions until the ruling is recorded. Keep local recommendations and ask requirements intact. **Verification note:** statuses, phase deliverables and Gate C were cross-read.

2. **W5-M2 / F-1 — MAJOR, CONFIRMED — The MCP dispatch path can mint signed, actionable work without a specified actor-authorization boundary (checks D/E).** **Location:** Phase W4, “accept a text call” and “write the same dispatch record and envelope” (`:458-467`); D-8 requires signing only “after authenticating” the human (`:858-895`); the record hard-codes that human as creator (`:211-232`). **Problem:** W0 authenticates browser and receiver requests, but no criterion authenticates or authorizes an MCP tool caller, requires user confirmation, or constrains access to the signing key. A text-capable caller can therefore satisfy W4 while producing a verified instruction falsely attributed to the human. **Fix:** specify MCP caller identity and authorization, explicit confirmation for actionable dispatch, signing-key isolation, refusal of unsigned/unverified calls, replay behavior, and negative tests for model-initiated, unauthenticated and wrong-user calls. **Verification note:** every W0/W4 auth criterion and D-8 was searched; none covers this producer.

3. **W5-M3 / N-2 — MAJOR, CONFIRMED — W0's security policy has no complete configuration contract (checks D/E/G).** **Location:** T-W0.1 requires an allowed Host, allowed Origin, per-host token, receiver token and dispatch-identity list (`:288-305`), while Configuration defines only dispatch ladders and `allow_repos` (`:234-255`). **Problem:** sources, schema, secret references, validation and failure behavior for the auth values are unspecified. A build can meet the named file/test list yet invent incompatible defaults on the two deployments or fail open when a list is absent. **Fix:** add an `[auth]` schema (or named equivalent) covering hosts, origins, dispatch identities and references to generated browser, receiver and signing credentials; define ownership/permissions, validation and fail-closed startup ACs; add missing/invalid/empty configuration tests. **Verification note:** the complete configuration block, D-17/D-20 and W0 were compared.

4. **W5-M4 / IC-1 — MAJOR, CONFIRMED — The promised one-key answer is not an executable acceptance criterion (checks A/C/D).** **Location:** Executive Summary and Review queue promise “one key” / Enter approval (`:96-98,132-135`), and D-3 chooses that behavior (`:679-715`); T-W1.2 only says a number key selects, then a separate confirmation writes (`:354-363`). **Problem:** the phase can pass with a two-action flow and no preselected recommendation, so the design's fast-review claim is not guaranteed. **Fix:** choose and state the exact single-key transition—for example, Enter on a preselected recommendation or a number key starts the five-second undo window—and add keyboard, focus, undo and accidental-key tests. **Verification note:** prose, decision and all option-card ACs were compared literally.

5. **W5-M5 / IC-2 — MAJOR, CONFIRMED — W0 authorizes receiver requests against the owner-change task (checks C/D/G).** **Location:** T-W0.1 says receiver authorization uses “target match of T-W2.2” (`:294`); T-W2.2 is Owner change, while receiver target matching is T-W0.3 (`:311-316,414-424`). **Problem:** the reference sends implementers to an unrelated protocol and leaves the security AC's intended predicate ambiguous. **Fix:** change the reference to T-W0.3 and map receiver-token, host-match and session-match negative tests to it. **Verification note:** both referenced task headings were opened.

### WORTH-CONSIDERING

1. **W5-W1 / F-2 — MINOR, CONFIRMED verification gap, confidence HIGH — Exact successor-brief fidelity remains unverified (checks A/D/G).** **Location:** Run Ledger round 4 claims a dependency-edge receipt (`:548-555`), but the repository contains no public-safe exact successor body or digest. The external query was denied by the sandbox, so absence is not asserted. **Fix:** before approval, attach a public-safe digest/read-only receipt for the exact brief and map every raw-ask clause and pending decision to it. **Verification note:** repository/history search found assertions and the edge summary, not the exact brief.

### TAKE-IT-OR-LEAVE-IT

1. None.

## Round 4 Closure

| Round-4 finding | Round-5 result |
|---|---|
| W4-M1 | PASS — W0 precedes all acting phases and contains authentication/allowlist controls (`:276-329`). |
| W4-M2 | PASS — receiver, verifier and store now land in W0 (`:282-329`). |
| W4-M3 | PASS — interface, queue/local implementations, shared contract suite, recovery and retention ACs exist (`:284-328`). |
| W4-M4 | PASS — standalone is baseline and portal registration is conditional (`:179-181,434-456`). |
| W4-M5 | FAIL — W5-M1; the package decision is pending but external contract choices remain settled and access-route work is omitted. |
| W4-W1 | PASS — stale local-decision references were corrected. |
| W4-W2 | PARTIAL — the edge summary is recorded, but W5-W1 remains because the exact brief/digest is unavailable. |

All W3-M1 through W3-M6 remain PASS at `:289-329,339-432`. The earlier W2-M11 PARTIAL now passes via expiry, logout and individual revoke ACs (`:299-305`); earlier W1-M4, W1-M11 and W1-W2 remain PASS. W5-M1, W5-M3 and W5-M5 are defects introduced or left incomplete by the round-4 repair.

## R5 Resolution Pass

| Finding | Status | Required disposition |
|---|---|---|
| W5-M1–W5-M5 | OPEN | Correct before build authorization. |
| W5-W1 | OPEN verification gap | Close before approval if the external record becomes readable. |

## R5 Verification Matrix

| Finding | Reproduced check | Actual result | Reproduced |
|---|---|---|---|
| W5-M1 | `sed -n '563,590p;1364,1390p'` plus Gate C `:621-630` | Pending package says underlying external choices stay resolved; access change omitted | Yes |
| W5-M2 | `sed -n '211,255p;458,467p;858,895p'` | MCP can sign/deliver; no MCP actor authorization or confirmation AC | Yes |
| W5-M3 | `sed -n '234,255p;288,329p'` | Required auth values exceed defined configuration | Yes |
| W5-M4 | `sed -n '96,98p;132,135p;354,363p;679,715p'` | One-key promise; select-then-confirm AC | Yes |
| W5-M5 | `sed -n '288,316p;414,424p'` | T-W2.2 is owner change; T-W0.3 owns target checks | Yes |
| W5-W1 | repository `rg` plus read-only task query | Assertions found; exact brief unavailable; query denied | Yes |

Verified: 6/6 findings reproduced.

## Decisions Requiring Team Input

No new AD-N is introduced. W5-M1 repairs the scope/status of the existing pending decision; it does not choose an option.

## Outstanding Issues to Fix

W5-M1 through W5-M5 block sign-off. W5-W1 is an explicit external verification gap rather than an asserted repository defect.

## Already-Correct Items

The design otherwise covers the raw ask's board, sprint/backlog, rearrangement and quick edits; held details; prompts and automatic handoff; event-only delivery with fallbacks; ordered/filtered queues; goal arming; portal fit; shared surfaces; task-store/backend integration; and both access contexts. Prior security/session fixes remain present. Public-hygiene scanning is clean.

## Sign-Off

**Blocked.** Five MAJOR findings remain; re-audit after correction.

## Audit Log

| Date | Round | Notes |
|---|---:|---|
| 2026-10-28 | 5 | Independent cross-family verification; 5 MUST-FIX, 1 WORTH-CONSIDERING. |

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
- `docs/research/findings/evidence/beads-ui-web-app-design-audit-r4-2026-10-28.md`
- `plugins/beads-ui/core/src/` and `plugins/beads-ui/core/test/` (inventory)
- Companion-repository `docs/asks/<founding-ask record>.md`
- Companion-repository `docs/designs/<event-driven idle-wake design>.md` (working-tree and current `origin/main`)
- Companion-repository `docs/designs/TEMPLATE.md`
- Companion-repository `docs/procedures/decision-framework.md`
- Companion-repository `docs/audits/STUB.md` and `docs/audits/TEMPLATE.md`
- Companion-repository idle-wake default, installer source and installer tests
