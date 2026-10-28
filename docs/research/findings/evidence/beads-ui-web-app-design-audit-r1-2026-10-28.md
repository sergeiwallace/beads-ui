---
title: "Cross-family doc-audit of the beads-ui web app design, round 1"
category: research
tags: [audit, design, web-app]
status: complete
---

# Cross-family doc-audit of the beads-ui web app design, round 1

MUST-FIX remain — 12 MUST-FIX, 2 WORTH-CONSIDERING, 0 TAKE-IT-OR-LEAVE-IT.

## MUST-FIX

1. **W1-M1 (IC-1, checks B/C) — D-11 reopens an approved decision on a false premise.**
   **Location:** D-11, “That decision's context said the dashboard was unbuilt,” and “The build proceeds under (a).”
   **What is wrong:** The parent design's D-11 context explicitly says a React dashboard with Board, Epics, Review, Sessions, Inbox and Task-detail views already existed, and the human approved option (a) with that knowledge (`beads-ui-design.md:1401-1438`). The new D-11 therefore neither introduces new evidence nor remains genuinely pending; moreover, a pending decision cannot simultaneously direct the build to proceed under one option.
   **Fix:** Remove this D-11 and preserve the approved parent decision. Treat the existing dashboard only as a port source, with retirement gated on verified parity. Update the summary, risks, open questions and audit table accordingly.
   **Verification:** **CONFIRMED** by direct comparison of both D-11 sections and the parent's approval record.

2. **W1-M2 (JA-1, check A) — The claimed coverage of sprint, rearrangement and quick field editing is false.**
   **Location:** Founding Ask Coverage, “kanban, sprint and backlog, rearrange, quick edits of priority, status and owner”; parent Phase 3 (`beads-ui-design.md:722-748`).
   **What is wrong:** The inherited phase has Board and Roadmap ACs, but no Sprint-view AC and no quick-edit AC for priority or owner. Manual rank is conditional on `views.rank`, so rearrangement is not guaranteed to ship enabled. Merely listing “Sprints” in scope is not testable coverage.
   **Fix:** Add enabled-by-default, EARS-shaped ACs and tests for Sprint, Backlog, card rearrangement, and inline priority/status/owner edits, including guarded-write conflicts and keyboard/touch alternatives.
   **Verification:** **CONFIRMED**; the complete inherited Phase 3 AC block contains no Sprint, priority-edit or owner-edit criterion.

3. **W1-M3 (JA-2, checks A/D) — Held answers are executed on the wrong host.**
   **Location:** T-W1.2, “record the answer through held_cli.py answer.”
   **What is wrong:** The research states that the held landing pad belongs to the owning session's host and that the web server cannot answer a remotely held item (`beads-ui-web-app.md:137`). The phase nevertheless invokes the verb from the web-app side and specifies no target-host answer dispatch.
   **Fix:** Define an `answer` dispatch carrying the exact answer bytes; have the authenticated target-host receiver write the bytes to a file and invoke the closed answer verb there. Add cross-host success, dirty-pad refusal, duplicate-delivery and byte-preservation ACs.
   **Verification:** **CONFIRMED** by comparing T-W1.2 with the cited research constraint.

4. **W1-M4 (F-1, checks D/E) — A paired receiver cannot retrieve a body from the local dispatch store.**
   **Location:** D-14, “a local append-only store otherwise”; T-W2.2, “when the receiving session fetches it.”
   **What is wrong:** The personal-pair design sends pointer-only events, but no deliverable, API, transport, authentication rule or AC lets a session on the paired host fetch a record or body from the server host's local store. The claim that this mode “works” is therefore unverified.
   **Fix:** Specify a mutually authenticated, allowlisted fetch endpoint reachable by both hosts, or use a replicated queue. Define body lifetime, authorization by target session, receipts, retry behavior and a live cross-host exit test.
   **Verification:** **CONFIRMED**; the phase inventories dispatch, ladder, envelope, feed, allowlist and auth modules but no receiver-fetch surface.

5. **W1-M5 (F-2, check E) — The signed envelope does not bind the body locator or asserted author, and no body-hash check is required.**
   **Location:** Dispatch record, “signature over (id, task, target, kind, body_digest, arm_goal, created_at)”; T-W2.2.
   **What is wrong:** `body_ref` and `created_by` are outside the signed tuple, yet authorization checks `created_by`; neither AC requires hashing the fetched bytes and comparing them with `body_digest`. A mutable record can redirect retrieval or alter the asserted author while retaining a valid signature.
   **Fix:** Sign a canonical versioned envelope including `body_ref`, `created_by`, expiry and every authorization-relevant field; require digest verification of fetched bytes before acting; add mutation, replay, expiry and wrong-target tests.
   **Verification:** **CONFIRMED** from the complete record schema and envelope ACs.

6. **W1-M6 (DV-1, check E) — Tailnet identity headers are trusted without a trusted-proxy boundary.**
   **Location:** D-17 and T-W3.3, “require the Tailscale-User-Login identity” and an app capability.
   **What is wrong:** The application also listens on loopback. A local caller can reach that listener directly and supply the same headers unless the design authenticates the proxy hop or blocks direct requests. Host, Origin and Fetch Metadata checks do not establish identity.
   **Fix:** Use a Unix socket or authenticated proxy hop, strip inbound identity/capability headers, accept replacements only from the trusted proxy, and require the application token on direct loopback access. Add forged-header tests.
   **Verification:** **CONFIRMED** as a specification gap; no AC distinguishes proxy-injected headers from caller-supplied headers.

7. **W1-M7 (IC-2, checks C/D) — D-15 claims a mitigation that Phase W3 does not implement or test.**
   **Location:** D-15, “health route, base path, shell tokens are listed and tested in T-W3.4.”
   **What is wrong:** T-W3.4 tests only transport forwarding and path publication. It has no AC for the health route, base-path behavior, shell tokens, SPA fallback or manifest duties.
   **Fix:** Add explicit deliverables and independently testable ACs for every portal duty, plus direct and portal-mounted integration tests.
   **Verification:** **CONFIRMED** by comparing D-15's mitigation with the full T-W3.4 block.

8. **W1-M8 (DV-2, check B) — D-15 and D-19 were resolved beyond the stated authority.**
   **Location:** D-15, “member contract ... no Node at runtime”; D-19, “Changes a deliverable of an approved phase.”
   **What is wrong:** D-15 changes another repository's runtime contract, and D-19 changes an approved deliverable rather than merely repairing wording. The decision framework says requirement or cross-contract changes escalate; expression repair changes wording only. Both are nevertheless marked AI-resolved.
   **Fix:** Return both decisions to pending human/owner review, retaining the recommendations and mitigations. After approval, record the approving actor and implementation dependency.
   **Verification:** **CONFIRMED** against `decision-framework.md` Gate C and the decisions' own stated Cons.

9. **W1-M9 (JA-3, checks A/E) — Goal handling narrows auto-triggering and arms the goal after the work.**
   **Location:** T-W2.4, “after acting on the prompt” and “hold the dispatch” for a paused goal.
   **What is wrong:** The founding ask requires the prompt to trigger work and `/start-goal` when no goal is active. Arming after acting defeats goal tracking, while indefinitely holding a prompt to a paused goal narrows auto-triggering; the research itself flags this (`beads-ui-web-app.md:184`).
   **Fix:** Arm before acting when inactive. Return paused-goal behavior to a pending decision with the researched choices, including a visible “resume anyway” control and a testable release condition.
   **Verification:** **CONFIRMED** against the raw ask, T-W2.4 and the research warning.

10. **W1-M10 (F-3, check D) — Phase deliverable paths do not match the repository.**
    **Location:** W1/W2 deliverables, `core/src/...` and `core/test/...`.
    **What is wrong:** There is no root `core/`; the existing shared core is under `plugins/beads-ui/core/`. The phase mixes both path forms, so an implementer following it literally creates a second core.
    **Fix:** Normalize every core source/test path to the existing package and add the correct package export updates to deliverables.
    **Verification:** **CONFIRMED**: root core absent; plugin core present.

11. **W1-M11 (F-4, check F) — The public design exposes prohibited private operational metadata.**
    **Location:** frontmatter, Founding Ask Coverage, Integration, access diagrams, Run Ledger and decision-lineage comments; representative heading: “Run Ledger.”
    **What is wrong:** The document contains private tracker identifiers, machine names, an absolute worktree path, private branch/session identifiers, restricted-host wording and current deployment/authentication state. This violates the invocation's public-repository floor.
    **Fix:** Replace identifiers with public-neutral capability names; move operational evidence and private lineage to a private sidecar; retain only opaque public references. Re-run a deny-pattern scan before merge.
    **Verification:** **CONFIRMED** by a repository-wide pattern scan of the target; matches span every location named above.

12. **W1-M12 (JA-4, check D) — The phase ACs do not meet the canonical task-authoring standard.**
    **Location:** W1-W4 acceptance criteria; design template requirement for one failure-path AC per changed public function and parity ACs for replacements.
    **What is wrong:** Several ACs combine independently failing behaviors, public modules have no mapped failure-path AC, and the ported composer has no inventory of preserved or intentionally dropped behavior.
    **Fix:** Split compound ACs, map each public entry point to a negative-path test, and add a composer parity inventory covering secret refusal, editor behavior, typeahead, submission and accessibility.
    **Verification:** **CONFIRMED** against the canonical template and the complete W1-W4 AC set.

## WORTH-CONSIDERING

1. **W1-W1 (F-5, check D; confidence: HIGH) — Cross-tab SSE sharing is absent.** Research recommends one shared connection because multiple tabs can exhaust browser HTTP/1.1 limits, but T-W3.1 only says to push to every tab. Add a SharedWorker or leader-election design and a multi-tab test. **Verification:** **CONFIRMED** against `beads-ui-web-app.md:216` and T-W3.1.

2. **W1-W2 (DV-3, checks A/D; confidence: HIGH) — “Impact” sorting has no defined field or null ordering.** D-1 and T-W1.1 require priority then impact, but the data model never maps impact to a Beads field. Define the field, normalization and missing-value order, then test stable ties. **Verification:** **CONFIRMED** by searching the complete data model and phase ACs.

## TAKE-IT-OR-LEAVE-IT

1. None.

## Verification Matrix

| Finding | Reproduced check | Actual | Pass |
|---|---|---|---|
| W1-M1 | Compare both D-11 sections | Parent already records the built SPA and human approval | Yes |
| W1-M2 | Search inherited Phase 3 ACs | No Sprint, priority-edit or owner-edit AC | Yes |
| W1-M3 | Compare T-W1.2 with research §1 | Research requires target-host execution | Yes |
| W1-M4 | Search phases for receiver-fetch surface | Fetch is assumed; no surface is specified | Yes |
| W1-M5 | Compare signed tuple with schema and ACs | Locator/author omitted; no byte-digest assertion | Yes |
| W1-M7 | Compare D-15 mitigation with T-W3.4 | Claimed portal duties are absent | Yes |
| W1-M10 | Check declared core directories | Root path absent; existing plugin path present | Yes |
| W1-M11 | Public-hygiene pattern scan | Prohibited categories occur across all named sections | Yes |

Verified: 8/8 sampled findings reproduce in the current worktree. The target's last change remains based on the same unchanged remote-main snapshot described by the invocation.

## Files read:

- `docs/designs/beads-ui-web-app-design.md`
- `docs/designs/beads-ui-design.md`
- `docs/research/beads-ui-web-app.md`
- `docs/research/findings/beads-ui-web-app-event-dispatch.md`
- `docs/research/findings/beads-ui-web-app-backend-portal-and-access.md`
- `docs/research/findings/beads-ui-web-app-ux-stack-and-shared-code.md`
- `docs/research/findings/evidence/beads-ui-web-app-design-audit-r1-2026-10-28.md`
- `plugins/beads-ui/core/src/`, `plugins/beads-ui/core/test/`, `packages/bd-node/src/`
- `ai-harness/docs/audits/STUB.md`
- `ai-harness/docs/audits/TEMPLATE.md`
- `ai-harness/docs/designs/TEMPLATE.md`
- `ai-harness/docs/procedures/decision-framework.md`
- `ai-harness/docs/designs/<event-driven-idle-wake-design>.md`
- `<private-founding-ask-record path withheld from this public artifact>`
