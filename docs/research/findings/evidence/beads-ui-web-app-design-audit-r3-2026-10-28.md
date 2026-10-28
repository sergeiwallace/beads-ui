---
title: "Cross-family doc-audit of the beads-ui web app design, round 3"
category: research
tags: [audit, design, web-app]
status: complete
---

# Cross-family doc-audit of the beads-ui web app design, round 3

MUST-FIX remain

## Check dispositions

| Check | Disposition |
|---|---|
| A. Founding-ask fidelity | W3-M1 and W3-M2. |
| B. Decision quality / authority | W3-M1 and W3-M4. D-15 correctly remains human-pending; the other active decisions have distinct options, per-option Pros/Cons, a separate Recommendation, a decision record and mitigation text. |
| C. Internal consistency | W3-W1. |
| D. Buildability | W3-M2 through W3-M5 and W3-W2. |
| E. Security and privacy | W3-M5 and W3-M6. |
| F. Public-repository hygiene | None. The enumerated scan found no private-store issue identifier, live row count, literal service port, host process command line or statement of the queue's authentication posture. |
| G. Prior-round closure | See the closure table. W3-M2 is a regression introduced while fixing round 2; W3-M6 leaves W2-M11 partial. |

The exact proposed build-issue body could not be read because the local task-store transport is unavailable in this sandbox, so issue-body fidelity is UNVERIFIED. The design's implementation phases were audited as the successor brief; this limitation is not a repository finding.

## MUST-FIX

1. **W3-M1 (JA-1, checks A/B) — Goal arming is optional despite the ask and D-10 claiming it is automatic.**
   **Location:** Dispatch record and D-10, “arm_goal: bool” / “A dispatch may carry” / “When a dispatch carries arm_goal.”
   **What is wrong:** A001 requires task prompts and review guidance to auto-trigger /start-goal when no goal is active. The only ACs are conditional on a flag, while no composer, answer, unblock or dispatch AC requires the flag to be set. D-10 nevertheless says “the ask's auto-trigger is kept for every dispatch.” Implemented literally, a valid web prompt can omit the flag and never arm a goal. **CONFIRMED** against A001 and lines 168, 220, 310 and 377-380.
   **Fix:** Define which actionable web dispatch kinds always set arm_goal (at minimum prompt and next-step guidance), add an EARS AC that the composer sets it, and test inactive, active and paused goal states end to end.

2. **W3-M2 (JA-2, checks A/D/G) — Round 2 removed the only explicit inline-owner criterion.**
   **Location:** Board and views / T-W1.0, “inline edits of priority, status and owner,” but the AC says only “priority or status inline.”
   **What is wrong:** A001 explicitly requires quick owner edits. Before the round-2 fix, T-W2.4 said “inline or in detail”; the replacement handoff ACs dropped that surface qualifier. The handoff protocol now holds, but no test requires an owner control on a card or list row, so the coverage row is false. **CONFIRMED** by current lines 172, 285-291 and 367-375 and the pre-round-2 text.
   **Fix:** Add card, list-row and detail owner-picker ACs that route unclaimed changes through the guarded assignee write and claimed changes through D-9/T-W2.4; include keyboard/touch access, conflict/error behavior and a live quick-edit check.

3. **W3-M3 (DV-1, checks A/C/D) — The wake-off rule disables the carrier instead of only suppressing model wakes.**
   **Location:** Configuration / T-W2.1, “with automatic wakes off, only the turn-end rung delivers” and “shall not use rungs 1, 3 or 4.”
   **What is wrong:** Rung 1 combines Agent Mail carriage with notifier admission. The canonical idle-wake contract says automatic_wakes=false suppresses exit-2 model wakes while preserving observations, pending obligations and natural-boundary delivery. Stopping rung 1 prevents the paired host from receiving the pointer that passive delivery consumes; the design specifies no alternative discovery step for the claimed turn-end delivery. **CONFIRMED** against target lines 245-256 and 348-355 and the event-wake design's Phase 4 and Rollout sections on current origin/main.
   **Fix:** Always publish the addressed carrier event. When wakes are off, suppress only active model-turn creation and active injection rungs, retain the event pending, and deliver its passive header at the next natural boundary. Add an off-policy cross-host canary proving no idle turn and eventual passive delivery.

4. **W3-M4 (IC-1, checks B/D) — The chosen fallback ladder is not in the executable phase contract.**
   **Location:** D-6/D-7, “Agent Mail, then Buzz, then git-inbox” and “the mod's submit”; T-W2.1 specifies only Agent Mail, prompt injection and turn-end.
   **What is wrong:** The phase can pass every listed AC and its generic “a fallback rung” live check without implementing either carrier failover or the mod-submit rung. That contradicts two AI-resolved decisions and D-6's promised “test per fallback trigger.” **CONFIRMED** by comparing lines 245-250, 348-355, 751-784 and 794-816.
   **Fix:** Add independently testable ACs for Agent Mail failure to Buzz, Buzz failure to pointer-only git-inbox, prompt-injection unavailability to mod-submit, and final turn-end fallback; require per-rung receipts and exercise every rung in tests, with at least one cross-host live failover.

5. **W3-M5 (DV-2, checks D/E) — The CSRF criterion specifies an impossible Fetch Metadata comparison and the wrong boolean rule.**
   **Location:** T-W3.3, “Origin and Sec-Fetch-Site match the app's own origin.”
   **What is wrong:** Sec-Fetch-Site is a relationship value such as same-origin, not an origin URL. The cited research specifies Sec-Fetch-Site: same-origin **or** a matching Origin fallback, plus the custom header. Literal implementation either rejects legitimate writes or invents a nonstandard comparison. **CONFIRMED** against target line 404 and the backend/access research §4.4, which states the exact predicate.
   **Fix:** State the browser-write rule precisely: require the custom header; accept same-origin Fetch Metadata, otherwise require an exact allowed Origin; reject cross-site/unknown cases per an explicit decision table. Scope machine receiver endpoints to their receiver credential rather than browser metadata.

6. **W3-M6 (F-1, checks E/G) — The round-2 browser-session fix still has no bounded lifetime or individual revocation.**
   **Location:** D-17/T-W3.3, “rotating the secret ends every session.”
   **What is wrong:** Single-use code expiry, HttpOnly/SameSite cookie storage, SSE auth and global rotation are now present, but the issued session cookie has no expiry and there is no logout or per-session revoke path. W2-M11 explicitly required a complete lifecycle with logout/revocation, so that finding is only partial; a captured cookie otherwise remains dispatch authority until all sessions are rotated. **CONFIRMED** against lines 409-413 and 1195.
   **Fix:** Specify absolute and idle expiry, logout that revokes the current server-side session, individual administrative revocation, cookie clearing, and focused expiry/logout/replay tests while retaining secret rotation as the revoke-all path.

## WORTH-CONSIDERING

1. **W3-W1 (IC-2, check C; confidence: HIGH) — The risk table still says the build depends on “seeding.”** The Integration section and current ground truth say create-only seeding already shipped and activation is the remaining dependency, but Risk 1's mitigation still ties the phase to “the seeding.” Replace it with per-host activation and make the exit gate prove activation on every intended host. **CONFIRMED** at lines 262, 271, 452 and current ai-harness origin/main.

2. **W3-W2 (DV-3, check D; confidence: MEDIUM) — Cross-runtime signature canonicalization is unnamed.** The signer is Node and the verifier Python, but T-W2.3 says only “canonical JSON.” Timestamp, Unicode and object-order differences can make valid envelopes unverifiable. Name a canonical byte format (for example RFC 8785 plus fixed timestamp encoding) or sign a stored byte envelope, and add shared golden vectors and malformed-canonicalization tests. **PLAUSIBLE** until implementation chooses the exact encoding.

## TAKE-IT-OR-LEAVE-IT

1. None.

## Prior-round closure

| Prior item | Round-3 result |
|---|---|
| W2-M1 through W2-M5 | PASS: session-target receiver authorization, curation value/effort, all-task Queue view, unblock flow and detail ACs are present. |
| W2-M6 | PASS for the receiver-first handoff; W3-M2 is a new quick-edit regression caused by replacing the old AC. |
| W2-M7 | PASS on the factual seeder correction; W3-M3 and W3-W1 cover the remaining policy semantics and stale wording. |
| W2-M8, W2-M9, W2-M10 | PASS: access/signature wording, neutral event-design reference and ledger cursor are corrected. |
| W2-M11 | PARTIAL — W3-M6. |
| W2-W1, W2-W2 | PASS: parent sharing references and tombstone/body-backup semantics are present. |
| W1-M4, W1-M11, W1-W2 (the round-1 items previously PARTIAL/FAIL) | PASS: receiver fetch is session-scoped, the prohibited filename is absent, and impact/size use the issue metadata fields. |

## Verification Matrix

| Finding | Reproduced check | Actual | Pass |
|---|---|---|---|
| W3-M1 | Search dispatch creation and goal ACs for a required arm_goal assignment | Only conditional receiver ACs exist; no producer sets the flag | Yes |
| W3-M2 | Compare architecture/T-W1.0 with current and pre-round-2 owner ACs | Architecture promises owner inline; current quick-edit AC omits it; old qualifier was removed | Yes |
| W3-M3 | Compare wake-off AC with current event-wake Phase 4/Rollout | Target suppresses rung 1; upstream preserves pending mail and passive pickup | Yes |
| W3-M4 | Enumerate W2.1 fallback ACs against D-6/D-7 | No Buzz, carrier-failure, git-inbox fallback or mod-submit AC exists | Yes |
| W3-M5 | Compare T-W3.3 predicate with the cited research | Target says both values match an origin; research says same-origin metadata or matching Origin | Yes |
| W3-M6 | Enumerate cookie lifecycle ACs | Exchange, replay, SSE and rotate-all exist; expiry, logout and single-session revoke do not | Yes |

Verified: 6/6 sampled findings reproduce against working-tree commit 2677967d; beads-ui origin/main remains 4a3a17c8. The referenced ai-harness checkout lags its origin/main, so wake-policy ground truth was read from origin/main at 3f2bab5f.

## Files read:

- docs/designs/beads-ui-web-app-design.md
- docs/designs/beads-ui-design.md
- docs/research/beads-ui-web-app.md
- docs/research/findings/beads-ui-web-app-backend-portal-and-access.md
- docs/research/findings/evidence/beads-ui-web-app-design-audit-r1-2026-10-28.md
- docs/research/findings/evidence/beads-ui-web-app-design-audit-r2-2026-10-28.md
- docs/research/findings/evidence/beads-ui-web-app-design-audit-r3-2026-10-28.md
- plugins/beads-ui/core/src/ and plugins/beads-ui/core/test/ (path/package inventory)
- ai-harness:docs/asks/<founding-ask-record>.md
- ai-harness:docs/designs/<event-driven-idle-wake-design>.md (working-tree copy and origin/main)
- ai-harness:docs/designs/TEMPLATE.md
- ai-harness:docs/procedures/decision-framework.md
- ai-harness:docs/audits/STUB.md
- ai-harness:docs/audits/TEMPLATE.md
- ai-harness:src/ai_harness/defaults/idle-wake.json and src/ai_harness/cli.py at origin/main
