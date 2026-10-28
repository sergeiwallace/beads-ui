---
title: "Cross-family doc-audit of the beads-ui web app design, round 6"
category: research
tags: [audit, design]
status: complete
---

# Cross-family doc-audit of the beads-ui web app design, round 6

MUST-FIX remain — 5 MUST-FIX, 2 WORTH-CONSIDERING, 0 TAKE-IT-OR-LEAVE-IT.

## What Was Audited

The working-tree design was audited after its uncommitted round-5 fixes. The raw founding ask, approved parent design, research, decision framework, event-wake design, prior five audits, repository inventory and current local history were cross-read. No web implementation exists yet, so no proposed behavior was credited as shipped.

`CONFIRMED` means the cited bytes or history were reproduced. `PLAUSIBLE` marks engineering judgment. The companion checkout of the event-wake design lags its local main; the design's policy-seeding claim was separately verified on current local main. The exact successor body could not be retrieved because the confined read route could not reach the local task service; that is an explicit verification gap, not proof of absence.

## Check Dispositions

| Check | Disposition |
|---|---|
| A. Founding-ask fidelity | W6-M1 and W6-M5 affect the privacy and event-delivery clauses; W6-W2 leaves exact successor fidelity unverified. Kanban, sprint/backlog, rearrangement, quick edits, held details, prompts, handoff, configurable fallbacks, ordered/filtered review, goal arming, portal fit, shared code, task-store/backend use and both access contexts otherwise have coverage. |
| B. Decision quality / authority | None. Existing human-pending choices were not re-raised; resolved decisions retain distinct options, Pros/Cons, a separate Recommendation, mitigation and a decision record. |
| C. Internal consistency | W6-M3, W6-M5 and W6-W1. |
| D. Buildability | W6-M3 through W6-M5 and W6-W2. |
| E. Security and privacy | W6-M1 through W6-M4. |
| F. Public-repository hygiene | None. The enumerated scan found no prohibited non-public tracker identifier, live row count, literal service port, host process command line or prohibited queue-authentication wording. |
| G. Prior-round closure | Round-5 closure is mixed as recorded below; every round-4 and round-3 item is also dispositioned below. |

## Round 6 Findings

### MUST-FIX

1. **W6-M1 / F-1 — MAJOR, CONFIRMED — The destination host's repository allowlist does not govern cross-host dispatch bodies (checks A/E).** **Location:** T-W0.2, “open only the stores whose repositories are on the host's allowlist,” and T-W0.3, “return the dispatch record and its body only if both the host and the session match” (`docs/designs/beads-ui-web-app-design.md:317-327`). **Problem:** the allowlist is enforced on the serving server's store and queue reads. Receiver authorization checks destination host/session, but no criterion checks `task.repo` against the destination host's allowlist before creation, carriage or body return. Cross-host dispatch is intentional, so a body from a repository allowed only on the source can reach a destination where that repository is forbidden, contradicting the founding ask's host-separation rule and D-18. **Fix:** bind every host identity to its allowed repositories; reject creation and fetch when the task repository is not allowed at the destination; independently re-check on the receiver; exclude invalid sessions from owner selection; add source-allowed/destination-denied negative tests without naming the repository.

2. **W6-M2 / F-2 — MAJOR, CONFIRMED gap with PLAUSIBLE exploit — Untrusted Markdown has no browser rendering security contract (check E).** **Location:** T-W1.7, “render its full Markdown body” (`:399-402`). **Evidence:** neither the design nor parent design specifies raw-HTML handling, URL-scheme filtering, sanitization, Content Security Policy or Trusted Types. The design's own research says the proposed renderer is safe by default only while raw HTML is not enabled (`docs/research/findings/beads-ui-web-app-ux-stack-and-shared-code.md:291-293`). **Problem:** a conforming implementation can choose a script-capable renderer; stored task or held content would then execute in an authenticated same-origin page that can create dispatches. **Fix:** require raw HTML disabled (or a named allowlist sanitizer), safe link/image schemes, a restrictive CSP and Trusted Types where supported; add malicious-Markdown end-to-end tests proving no script, network request or authenticated write executes.

3. **W6-M3 / N-1 — MAJOR, CONFIRMED — The credential contract contradicts itself and still does not define MCP authorization (checks C/D/E/G).** **Location:** Configuration `[auth]` (`:256-265`), T-W0.1 “any request ... require the per-host token” versus receiver-token authorization (`:304-305`), and W4's “per-host MCP token” and “configured user” (`:477-479`). **Problem:** configuration defines browser, receiver and signing credentials only. The universal-token AC conflicts with the receiver endpoint's separate credential, while the MCP token and configured-user source do not exist in schema, startup validation or W0 tests. Implementers cannot derive which credential each route accepts. **Fix:** add a route/credential matrix for browser API, SSE, receiver API, MCP API and health; replace the universal statement with route-specific ACs; define `mcp_token` and configured-user references, permissions, rotation and fail-closed validation; add wrong-class, missing-token and wrong-user tests.

4. **W6-M4 / N-2 — MAJOR, CONFIRMED — Public-key distribution and rotation are prose-only (checks D/E).** **Location:** D-20 says the public key “ships through the installer” and rotation is “one key write plus one install” (`:1310-1342`), but W0 names only a receiver client, verifier and golden vectors (`:292-340`), and D-22's cross-repository inventory omits trusted-key installation (`:1381-1407`). **Problem:** the envelope has no signed issuer/key identifier, receiver trust-map schema, installer deliverable, overlap/revocation rule or unknown/stale-key failure test. A build can pass W0 while trusting the wrong key, failing during rotation or accepting an obsolete one. **Fix:** add a signed issuer/key id, receiver trust-map configuration, installer ownership, staged rotation and revocation semantics, unknown/stale-key negative tests and a live rotation exit gate; include this work explicitly in the pending cross-repository decision.

5. **W6-M5 / N-3 — MAJOR, CONFIRMED — W1 promises turn-end delivery before any phase publishes a deliverable event (checks A/C/D).** **Location:** W1 says dispatch “delivers only at the next turn end” and its gate requires one such delivery (`:342-407`), while addressed mail, typed admission and passive pickup first appear in W2 (`:409-429`). W0 supplies a fetch client but no natural-boundary hook or event that invokes it (`:292-340`). **Problem:** a W1 deployment can store a dispatch but has no specified way to make the target session discover it, especially with the local store. Its exit gate is therefore not executable, and it overstates compliance with the ask's event-triggered prompt flow. **Fix:** move the minimal addressed passive event/admission and natural-boundary integration into W0/W1 with named files, tests and a local-store discovery path, or remove W1's delivery promise and live gate until W2.

### WORTH-CONSIDERING

1. **W6-W1 / IC-1 — MINOR, CONFIRMED, confidence HIGH — Decision lineage still points security/storage decisions at obsolete phases (check C).** D-8, D-14 and D-20 say `applicability=phase:W2`; D-17 and D-18 say W3 (`:910,1127,1249,1290,1340`), while the Implementation Audit and phase body put all five in W0 (`:288-340,490-496`). **Fix:** change each lineage applicability to W0, or list multiple phases where a decision genuinely spans them.

2. **W6-W2 / JA-1 — MINOR, CONFIRMED verification gap, confidence HIGH — Exact successor-brief fidelity remains unverified (checks A/D/G).** The Run Ledger now records a digest and byte size (`:564-572`), which improves provenance, but no public-safe exact body or clause projection is available in the repository and the confined external query failed. **Fix:** before approval, attach a public-safe read-only receipt for the exact successor body and map every raw-ask clause, dependency and pending decision to it.

### TAKE-IT-OR-LEAVE-IT

1. None.

## Prior-Round Closure

| Round-5 finding | Round-6 result |
|---|---|
| W5-M1 | PASS — D-22 now makes all named cross-repository work, including the access route, contingent (`:1381-1407`). |
| W5-M2 | PARTIAL — confirmation and signing-key isolation were added, but MCP credentials/user configuration remain undefined; W6-M3. |
| W5-M3 | PARTIAL — `[auth]` exists, but route credential classes and MCP configuration are incomplete; W6-M3. |
| W5-M4 | PASS — a preselected recommendation, one-key choice and undo window are executable (`:365-377`). |
| W5-M5 | PASS — receiver authorization now points to T-W0.3 (`:304`). |
| W5-W1 | PARTIAL — digest and size are recorded, but the exact body remains unavailable; W6-W2. |

| Round-4 finding | Round-6 result |
|---|---|
| W4-M1 | PASS — W0 precedes acting phases and contains the security boundary. |
| W4-M2 | PASS — receiver, verifier and store land in W0; W6-M5 is a distinct missing discovery event introduced by the phase split. |
| W4-M3 | PASS — one interface, both stores and a shared contract suite are specified. |
| W4-M4 | PASS — standalone operation is baseline; portal registration is conditional. |
| W4-M5 | PASS — D-21 and D-22 remain human-pending and external effects are contingent. |
| W4-W1 | PASS — stale local decision references were corrected. |
| W4-W2 | PARTIAL — successor digest/size are present, but exact fidelity is still unverified; W6-W2. |

| Earlier finding | Round-6 result |
|---|---|
| W3-M1 | PASS — actionable producers set `arm_goal`. |
| W3-M2 | PASS — the owner picker covers card, row and detail. |
| W3-M3 | PASS — wakes-off retains addressed mail and passive delivery. |
| W3-M4 | PASS — each configured fallback rung has an AC. |
| W3-M5 | PASS — browser-write predicates are explicit. |
| W3-M6 | PASS — expiry, logout, individual revoke and rotate-all remain specified. |
| W3-W1 | PASS — activation wording remains corrected. |
| W3-W2 | PASS — RFC 8785 and cross-runtime vectors remain required. |
| W2-M11 | PASS — the complete browser-session lifecycle remains present. |
| W1-M4 | PASS — receiver fetch remains session-scoped. |
| W1-M11 | PASS — the prohibited event-design filename remains absent from the public design. |
| W1-W2 | PASS — impact and size still use issue metadata fields. |

## R6 Resolution Pass

| Finding | Status | Required disposition |
|---|---|---|
| W6-M1–W6-M5 | OPEN | Correct before build authorization. |
| W6-W1 | OPEN | Correct phase metadata with the same revision. |
| W6-W2 | OPEN verification gap | Close before approval when the exact record is readable. |

## R6 Verification Matrix

| Finding | Reproduced check | Actual result | Reproduced |
|---|---|---|---|
| W6-M1 | Read T-W0.2/T-W0.3 and search `allowlist.*dispatch` / `receiver.*allowlist` | Serving reads are filtered; destination repository authorization is absent | Yes |
| W6-M2 | Search target, parent and research for sanitization/CSP/raw HTML | Research names safe default; executable design has no rendering security AC | Yes |
| W6-M3 | Compare `[auth]`, T-W0.1 and W4 | Three configured credentials; receiver rule conflicts with “any request”; MCP token/user undefined | Yes |
| W6-M4 | Compare W0, D-20 and D-22 for key installation/rotation | Installer claim exists only in mitigation prose; no trust schema or rotation tests | Yes |
| W6-M5 | Compare W0/W1 gate with W2.1 | W1 stores and claims delivery; the first event/passive-pickup AC is W2 | Yes |
| W6-W1 | Search decision-lineage applicability and compare Implementation Audit | Five W0 decisions still carry W2/W3 metadata | Yes |
| W6-W2 | Read Run Ledger and attempt read-only successor query | Digest/size present; exact body unavailable through confined route | Yes |

Verified: 7/7 findings reproduced against the working-tree design.

## Decisions Requiring Team Input

No new AD-N is introduced. These fixes complete existing security and phase contracts without selecting any human-pending option.

## Outstanding Issues and Sign-Off

**Blocked.** W6-M1 through W6-M5 would mislead the build. Re-audit after correction. W6-W2 remains an external verification gap.

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
- `docs/research/findings/evidence/beads-ui-web-app-design-audit-r5-2026-10-28.md`
- `plugins/beads-ui/core/src/` and `plugins/beads-ui/core/test/` (inventory)
- Companion repository: `docs/asks/<founding-ask-record>.md`
- Companion repository: `docs/designs/<event-wake-design>.md` (working tree and current local main)
- Companion repository: `docs/designs/TEMPLATE.md`
- Companion repository: `docs/procedures/decision-framework.md`
- Companion repository: `docs/audits/STUB.md`
- Companion repository: `docs/audits/TEMPLATE.md`
- Companion repository: event-wake policy installer source and tests
