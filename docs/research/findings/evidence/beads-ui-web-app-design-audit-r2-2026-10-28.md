---
title: "Cross-family doc-audit of the beads-ui web app design, round 2"
category: research
tags: [audit, design, web-app]
status: complete
---

# Cross-family doc-audit of the beads-ui web app design, round 2

MUST-FIX remain

## Check dispositions

| Check | Disposition |
|---|---|
| A. Founding-ask fidelity | Findings W2-M2 through W2-M6. |
| B. Decision quality / authority | None. Every active decision has options, per-option Pros/Cons, one separate Recommendation, a decision record and a chosen-Con mitigation; the cross-repository contract choice remains human-pending. |
| C. Internal consistency | Findings W2-M8, W2-M10 and W2-W1. |
| D. Buildability | Findings W2-M2 and W2-M4 through W2-M7. |
| E. Security and privacy | Findings W2-M1 and W2-M11. |
| F. Public-repository hygiene | Finding W2-M9. No private store row count, literal service port, host process command line or queue-auth-posture statement was found. |
| G. Round 1 closure | See the closure table below. |

## MUST-FIX

1. **W2-M1 (F-1, check E) — The receiver API authorizes a host, not the addressed session.** **Location:** `docs/designs/beads-ui-web-app-design.md:176,339-349`, “only if the dispatch's target host is that token's host.” A per-host bearer can fetch another session's body and post `taken`/`acted`/`failed` receipts; the later client-side target check does not protect disclosure or receipt integrity. **Fix:** authenticate a session-scoped receiver identity (or trusted host broker that derives it), require both host and session to match for fetch and receipt, and add wrong-session fetch/receipt tests. **Verification:** **CONFIRMED** by comparing the API ACs with the signed `target: { session, host }` field.

2. **W2-M2 (DV-1, checks A/D) — The new impact definition is unsupported by both research and the chosen data source.** **Location:** target `:292-298`, “impact is the work queue's WSJF composite.” Research maps impact and size to issue metadata `value` and `effort` (`docs/research/findings/beads-ui-web-app-ux-stack-and-shared-code.md:156-161`), while the queue projection has neither metadata nor a composite (`...backend-portal-and-access.md:193-199`). **Fix:** define the join to authoritative issue metadata, normalization/null ordering and stable ties; or add and version the missing queue projection fields. Add reducer and integration tests. **Verification:** **CONFIRMED** from both schemas.

3. **W2-M3 (JA-1, check A) — The design narrows “all tasks in priority order, then filter blocked” to review-only items.** **Location:** target `:131-133,292-298`, “every held decision, held open question, blocked task and task awaiting a prompt.” The raw ask separately requires all tasks in priority order and a blocked-task filter. Neither this queue nor inherited Phase 3 supplies that all-task ordered view. **Fix:** make Review (or a clearly designated queue view) project every allowed task, sort it by priority, and implement blocked as a filter while retaining held-item joins. Add all-task and blocked-filter ACs. **Verification:** **CONFIRMED** against A001 and parent Phase 3 `:722-748`.

4. **W2-M4 (JA-2, checks A/D) — “Unblock” has no executable behavior.** **Location:** target `:131-137,217,277-321`, the schema admits `kind: ... "unblock"`, but W1 has no unblock control, transition, receiver handler or negative-path AC. Research requires the blocker comment plus the canonical stamped unblock transition (`docs/research/beads-ui-web-app.md:137`). **Fix:** specify the exact task-store and queue-gate paths, authorization/idempotency/failure behavior, follow-up dispatch, tests and live exit-gate proof. **Verification:** **CONFIRMED** by a full phase/decision search; the enum is the only implementation occurrence.

5. **W2-M5 (JA-3, checks A/D) — Task detail and held-item detail are named but not buildable.** **Location:** target `:31-32,115,131-137`, “the full rendered body sits below the card”; parent Phase 3 `:724,729-748` names Issue detail but has no detail AC. There is no criterion for task fields/body or full blocker, decision and open-question details when structured options exist. **Fix:** add field/source/error ACs for task detail and rendered-body ACs for every held kind, with desktop/mobile end-to-end tests. **Verification:** **CONFIRMED** against all W1 and inherited Phase 3 criteria.

6. **W2-M6 (JA-4, checks A/D) — Owner change does not specify completion of the automatic receiver-first handoff.** **Location:** target D-9 and `:350-359`, “send a handoff request ... until the receiver reports taken.” The researched contract also requires the selected receiver to assign, publish and mirror its rows, then the sender to verify before dropping its rows (`...event-dispatch.md:321-336`). Those steps and the selected target are absent from the ACs; an unclaimed task is only reassigned. **Fix:** encode the complete protocol for live, gone, unknown and unclaimed cases, including selected-receiver validation and taken/confirmed/verify evidence. **Verification:** **CONFIRMED** against the handoff procedure and the phase ACs.

7. **W2-M7 (IC-1, checks C/D) — The event-wake dependency is stale against ground truth.** **Location:** target `:260-271,423-446`, “the policy file is not seeded on any host” and “no seeder exists yet.” Current `ai-harness` `origin/main` contains the create-only installer seed, default policy and installer tests; the default is automatic wakes off. **Fix:** replace the seeding dependency with explicit per-pair enablement plus live wake verification, update the Integration/Open Questions/Risk text, and record that the local evidence checkout lagged `origin/main`. **Verification:** **CONFIRMED** from `origin/main` default, installer code, tests and merge history.

8. **W2-M8 (IC-2, check C) — The access route contradicts the signature decision.** **Location:** target `:178-180,1121-1127,1245-1252`: access documents “an SSH local forward ... as the fallback,” while D-20 rejects an option because “the work pair has no SSH route.” **Fix:** state precisely whether SSH runs through the existing managed transport (versus no direct SSH network route), then make Architecture, D-16, D-20 and W3 use the same fact. **Verification:** **CONFIRMED** by direct cross-reference.

9. **W2-M9 (F-2, check F) — A private tracker identifier remains in the public design.** **Location:** target `:446`, embedded in the event-wake design filename. Round 1's public-hygiene concession therefore does not satisfy the invocation's explicit private-prefix prohibition. **Fix:** use a public-neutral design title/opaque reference and keep the exact private path in a non-public evidence sidecar; run a private-prefix deny scan. **Verification:** **CONFIRMED** by pattern scan without reproducing the identifier here.

10. **W2-M10 (IC-3, check C) — The Run Ledger cursor predates its own audit history.** **Location:** target `:476,486-490`; it says “doc-audit next,” but the same ledger records round 1 and its fixes. **Fix:** set the cursor to doc-audit round 2 in progress (then terminal state when converged) and record the last completed audit boundary. **Verification:** **CONFIRMED** from adjacent ledger rows.

11. **W2-M11 (F-3, check E) — Browser authentication is not specified to a safe, testable session contract.** **Location:** target D-17 and `:380-395,1162-1168`, “handed to the browser through a one-time link.” It never requires single-use code exchange, expiry/rotation, an `HttpOnly`/`SameSite=Strict` cookie, a custom CSRF header, logout/revocation, or cookie-authenticated SSE; a bearer in browser storage or an SSE URL would leak the dispatch authority. Research specifies the exchange and cookie controls (`...backend-portal-and-access.md:416-428,517-527`). **Fix:** define the complete cookie session lifecycle and add replay, storage, CSRF, SSE and revocation tests. **Verification:** **CONFIRMED** by comparing D-17/T-W3.3 with the researched boundary.

## WORTH-CONSIDERING

1. **W2-W1 (IC-4, check C; confidence: HIGH) — Shared-code coverage cites the wrong parent decision.** Target `:39,201-203` attributes three-surface core/React sharing to D-35; parent D-35 governs only the mod's band/pane component layer, while parent D-1/D-2 define repository/package sharing. Correct the references and reserve D-35 for band/pane reuse. **Verification:** **CONFIRMED** against the parent decision headings and bodies.

2. **W2-W2 (DV-2, check D; confidence: MEDIUM) — “Append-only” storage and mandatory body deletion lack a reconciled retention model.** Target D-14 chooses a local append-only store (`:1012-1046`), while T-W2.2 requires body deletion on consume/expiry (`:339-344`). An append-only log can represent deletion with a tombstone, but physical body retention and compaction are unspecified. Define tombstone, garbage-collection, backup and test semantics. **Verification:** **PLAUSIBLE** design ambiguity; no implementation exists to disambiguate it.

## TAKE-IT-OR-LEAVE-IT

1. None.

## Round 1 closure

| Round 1 finding | Result in round 2 |
|---|---|
| W1-M1, W1-M2, W1-M3 | PASS |
| W1-M4 | PARTIAL — W2-M1 |
| W1-M5, W1-M6, W1-M7, W1-M8, W1-M9, W1-M10 | PASS |
| W1-M11 | PARTIAL — W2-M9; the prohibited private identifier remains |
| W1-M12 | PASS |
| W1-W1 | PASS |
| W1-W2 | FAIL — W2-M2 defines the wrong source |

## Verification Matrix

| Finding(s) | Reproduced check | Actual result | Pass |
|---|---|---|---|
| W2-M1 | Compare receiver API predicates with signed target | API gates host only; target contains host + session | Yes |
| W2-M2 | Compare sort AC, research mapping and queue projection | Three incompatible shapes; projection lacks the required fields | Yes |
| W2-M3 | Compare A001 with queue and parent Phase 3 ACs | No all-task priority queue with blocked filter | Yes |
| W2-M4 | Search all decisions/phases for unblock behavior | Schema value only; no executable AC | Yes |
| W2-M5 | Enumerate detail ACs in W1 and parent Phase 3 | No full task/held-detail contract | Yes |
| W2-M6 | Compare owner-change ACs with receiver-first procedure | Take/publish/mirror/verify completion is absent | Yes |
| W2-M7 | Inspect event-wake `origin/main` default, installer and tests | Create-only OFF seed is implemented | Yes |
| W2-M8 | Cross-read D-16 and D-20 | Fallback route and “no route” coexist | Yes |
| W2-M9 | Private-prefix scan of target | One prohibited filename match remains | Yes |
| W2-M11 | Compare browser-auth ACs with research controls | Exchange/cookie/CSRF/SSE lifecycle is absent | Yes |

Verified: 10/10 sampled findings reproduce. The beads-ui target remains at `d790a00`, based on the same local `origin/main` snapshot named in the brief; the external event-wake dependency advanced on its own `origin/main`.

## Files read:

- `beads-ui:docs/designs/beads-ui-web-app-design.md`
- `beads-ui:docs/designs/beads-ui-design.md`
- `beads-ui:docs/research/beads-ui-web-app.md`
- `beads-ui:docs/research/findings/beads-ui-web-app-event-dispatch.md`
- `beads-ui:docs/research/findings/beads-ui-web-app-backend-portal-and-access.md`
- `beads-ui:docs/research/findings/beads-ui-web-app-ux-stack-and-shared-code.md`
- `beads-ui:docs/research/findings/evidence/beads-ui-web-app-design-audit-r1-2026-10-28.md`
- `beads-ui:docs/research/findings/evidence/beads-ui-web-app-design-audit-r2-2026-10-28.md`
- `ai-harness:docs/audits/STUB.md.jinja`
- `ai-harness:docs/audits/TEMPLATE.md`
- `ai-harness:docs/designs/TEMPLATE.md`
- `ai-harness:docs/procedures/decision-framework.md`
- `ai-harness:docs/procedures/session-handoff.md`
- `ai-harness:docs/designs/<event-driven-idle-wake design; private filename redacted>`
- `ai-harness:docs/asks/<founding-ask record; private filename redacted>`
- `ai-harness:src/ai_harness/defaults/idle-wake.json`
- `ai-harness:src/ai_harness/cli.py`
- `ai-harness:tests/test_install_idle_wake_config.py`
