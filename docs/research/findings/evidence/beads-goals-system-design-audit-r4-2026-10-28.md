---
title: "Cross-family doc-audit of the Beads goals system design, round 4"
category: research
tags: [audit, design]
status: complete
---

# Cross-family doc-audit of the Beads goals system design, round 4

MUST-FIX remain — 9 MUST-FIX, 2 WORTH-CONSIDERING, 0 TAKE-IT-OR-LEAVE-IT.

**Status:** findings-pending-fix

**Target:** `docs/designs/beads-goals-system-design.md`, working-tree SHA-256 `a62184435afd10e87d83d4a301af4da95d0e2dc9015dc6f06df966522e6e564d` (112,008 bytes). HEAD is `2be7911`; `origin/main` remains `4a3a17c`.

## MUST-FIX

1. **G4-M1 (IC-1 / JA-1) — [A/C/D/E] `external_members` rejects the shared-store case it exists to support — `MAJOR`, CONFIRMED.** **Location:** Private goals over shared work and T-G2.1, “another store” / “not private-class” (`beads-goals-system-design.md:195,360-361`). The architecture says this record joins a private goal to shared work and “only reads shared stores,” but the criterion makes every shared-class repository unreadable. D-19 likewise promises that any shared task can serve a private goal (`:1277-1310`). **Fix:** make an authorized, readable shared-class repository the valid cross-store case; define any allowed private-to-private case separately; reject unknown/disallowed classes and unreadable issues; test both. **Verification:** direct cross-reading reproduces the contradiction.

2. **G4-M2 (IC-2 / DV-1) — [B/C/D/E] D-14(a) has no admissible repository/host combination — `MAJOR`, CONFIRMED.** **Location:** D-14(a), “store on the work pair, marked `domain`, guarded like private” (`:1084-1118`). The global rule limits private records to private-class repositories on the personal pair (`:199`), while T-G1.5 refuses a private-class store on an employer-class host (`:334-336`). The recommended pending option therefore cannot pass G1. **Fix:** define a distinct domain repository/host class and its exact guard behavior, defaults, startup ACs and tests, or remove (a) as unbuildable; keep the human choice pending. **Verification:** both G1 paths reject the option as written.

3. **G4-M3 (JA-2) — [A/D/E] Derived-text scanning does not cover every web write route — `MAJOR`, CONFIRMED.** **Location:** the guard says derived private text can enter a shared “task, comment, commit message or summary” and that the web write API scans it (`:212`), but the architecture and only web AC limit scanning to edits “from a goal view” (`:195,414`). Other web mutations may satisfy the phase without scanning. **Fix:** put the scan at the centralized shared-store mutation boundary for every web route, enumerate all bypasses, and add a red-arm AC per route; otherwise narrow the guarantee explicitly. **Verification:** no broader web-write AC exists in G1 or G3.

4. **G4-M4 (JA-3) — [A/C/D] The linked hierarchical graph can ship without most required edges — `MAJOR`, CONFIRMED.** **Location:** Goal views promises “what serves this goal” (`:188`) and D-9 requires a hierarchical linked graph (`:891-925`), but G3 requires only goal/member nodes and `blocks` lines (`:404-405`). It never requires membership, `parent-child`, goal `relates-to`, or `conflicts_with` edges. **Fix:** add independently testable rendering and interaction ACs for each edge class, hierarchy direction, filtering, and accessible edge meaning. **Verification:** the G3 graph criteria contain no other edge assertions.

5. **G4-M5 (IC-3) — [C/D] `make`/`help` has contradictory progress semantics — `MAJOR`, CONFIRMED.** **Location:** Links says “`make` counts fully toward progress ... `help` counts half” (`:146`), while the prose and T-G2.2 formulas count estimates or members without contribution strength (`:150,371-383`). “Strongest contribution” only resolves deduplication, not the numerator or denominator. **Fix:** specify strength-weighted progress formulas and zero/no-data behavior, or state that strengths affect alignment only and correct the legend; add make/help comparison tests for estimate and count sources. **Verification:** only the alignment formula applies the 1.0/0.5 factor (`:154-164`).

6. **G4-M6 (JA-4) — [C/D] “Out of range” alignment configuration has no defined ranges — `MAJOR`, CONFIRMED.** **Location:** Alignment lists defaults (`:166-175`); T-G4 falls back for a value “out of range” (`:432`). No domain is defined for `beta`, `blocks_discount`, `blocks_depth`, `window_days`, `state_in_band`, or `state_overdue_factor`, so implementations cannot agree on invalid inputs. **Fix:** define type, inclusive bounds and finite-number rules for every key, plus a malformed and boundary AC per key. **Verification:** repository search finds a range only for `target_share`, not these constants.

7. **G4-M7 (IC-4) — [C/D] Maintain goals both “never close” and support `done` — `MAJOR`, CONFIRMED.** **Location:** Goal model says a maintain goal “never closes” (`:115`), but the common lifecycle includes `done` (`:130`) and the state formula gives done goals zero weight (`:164`). No transition rule distinguishes kinds. **Fix:** decide whether maintain goals may transition to done; encode allowed transitions and end-state semantics in the model and add invalid-transition ACs. **Verification:** T-G2.3 has no done/maintain transition criterion (`:391-395`).

8. **G4-M8 (JA-5 / F-1) — [A/D/E] Private-side alignment has no privacy-preserving path into the agents’ queue — `MAJOR`, CONFIRMED.** **Location:** D-8 requires the external work queue to order agents by the score (`:858-885`), while G4 requires private-derived alignment to stay on the private side and forbids writing the score or goal id to the shared store (`:444`). Importing the core function (`:885`) does not give that queue access to private stores, and no transport, trust boundary, failure mode or AC bridges them. **Fix:** design the execution boundary: where private scoring runs, what minimal result crosses (if anything), how rank leakage is controlled, how unavailable private state degrades, and end-to-end ACs for person and agent ordering; preserve D-8 as pending. **Verification:** G4 names only the core module and queue change (`:424-445`).

9. **G4-M9 (JA-6) — [A/C/D] Aspiration/objective hierarchy constraints are descriptive only — `MAJOR`, CONFIRMED.** **Location:** the model defines an aspiration over objectives and the data model fixes `<objective> parent-child <aspiration>` (`:114,277`), but link validation only rejects cycles and a non-goal parent (`:362-364`). An aspiration can refine an objective or an objective another objective while all ACs pass. **Fix:** define allowed level pairs and cardinality/top-level rules, enforce them in `linkMember`/goal-link validation, and add positive and negative ACs. **Verification:** no criterion validates either endpoint’s level.

## WORTH-CONSIDERING

1. **G4-W1 (F-2) — [A], high confidence, PLAUSIBLE.** **Location:** Run Ledger records only the successor brief’s digest and size (`:537`). The confined local service could not return its body, and repository search found no copy, so exact design-to-successor fidelity remains unverified; failure to retrieve is not evidence of mismatch. **Fix:** attach a public-safe read-only receipt or checked-in brief and map each A001 goals/privacy clause before approval. **Verification:** digest-only evidence cannot establish content equality.

2. **G4-W2 (F-3) — [E], high confidence, CONFIRMED.** **Location:** Caches, logs and backups permits application logs to carry private-record ids (`:230-239`), but defines no allowed sink, retention, rotation, backup or export rules. An identifier can therefore leave the personal boundary through log handling even while titles/bodies do not. **Fix:** define permitted sinks and hosts, retention and backup/export exclusions; prefer request-local correlation tokens over persistent private identifiers; add sink and rotation tests. **Verification:** G3 checks log-line fields only (`:421`).

## TAKE-IT-OR-LEAVE-IT

1. None.

## Check dispositions

| Check | Disposition |
|---|---|
| A — founding ask | G4-M1, G4-M3, G4-M4, G4-M8 and G4-M9. Other goals/privacy clauses remain represented; exact successor fidelity is G4-W1. |
| B — decision quality | G4-M2 makes one pending option unbuildable. No new authority or decision-skeleton defect; no new AD-N. |
| C — internal consistency | G4-M1, G4-M2, G4-M4, G4-M5, G4-M7 and G4-M9. |
| D — buildability | G4-M1 through G4-M9 except G4-M3’s privacy scope is also captured under E. |
| E — privacy/security | G4-M1, G4-M2, G4-M3, G4-M8 and G4-W2. D-20 correctly remains human-pending. |
| F — public-repository safety | None: no prohibited private identifier, operational count, network endpoint, host command line, queue-auth wording or personal goal content was found in the target. |

## Prior-round closure

### Round 1

| Finding | Result | Current evidence |
|---|---|---|
| G1-M1 | PASS | Guarantee remains bounded and D-20 remains pending (`:212,1316-1349`). |
| G1-M2 | PASS | Task marking remains intrinsic (`:130,203`). |
| G1-M3 | PASS | One privacy field and defaults remain (`:130,273-275`). |
| G1-M4 | PASS | D-17 remains human-pending. |
| G1-M5 | PASS | D-3 retains edge-first half-write handling (`:699`). |
| G1-M6 | PASS | Required conflict, cadence, band and share fields remain (`:121-126`). |
| G1-M7 | PASS | Alignment equation and actual-share operands remain (`:154-175`); G4-M6 is a new validation gap. |
| G1-M8 | PASS | D-2 records one chosen edge option. |
| G1-M9 | PASS | Canonical store-plus-id identity remains (`:150,269`). |
| G1-M10 | PASS | Public functions and failure criteria remain mapped (`:396`). |
| G1-M11 | PASS | The canonical-root identifier is the public repository’s own identifier. |
| G1-W1 | PASS | Audited digests remain in the ledger (`:535-537`). |
| G1-W2 | PASS | Cache/log/backup rows remain (`:230-239`); G4-W2 concerns their still-unspecified log sink. |

### Round 2

| Finding | Result | Current evidence |
|---|---|---|
| G2-M1 | PARTIAL → G4-M1 | `external_members` exists, but the new repository-class check is inverted (`:360-361`). |
| G2-M2 | PASS | All five source formulas and no-data rules remain (`:371-382`). |
| G2-M3 | PASS | Zero share remains rejected (`:265,369`). |
| G2-M4 | PASS | The five governed decisions are consistently pending (`:545`). |
| G2-M5 | PASS | Ask capture, term scanning, backup and history checks remain (`:324-341`). |
| G2-M6 | PASS | Real write boundaries and public-function failures remain (`:203,306,396`). |
| G2-M7 | PASS | Shared tasks serving private goals retain their own marking (`:318`). |
| G2-M8 | PASS | Block recurrence, cycle and review rules remain (`:438-443`). |

### Round 3

| Finding | Result | Current evidence |
|---|---|---|
| G3-M1 | PARTIAL → G4-M1 | Same/cross-store writes are split, but the cross-store class condition rejects shared work. |
| G3-M2 | PASS | No-members behavior is limited to work-based sources (`:380-381`). |
| G3-M3 | PASS | Allocation equation, fallback and attribution remain (`:164,433-435`). |
| G3-M4 | PASS | Commit-message and full-history watermark scans remain (`:337-340`). |
| G3-M5 | PASS | Criteria are split and missing failure paths were added (`:353-396,404-421`). |
| G3-M6 | PASS | D-13 is pending and G1 is gated on D-13/D-20 (`:303,1044-1078`). |
| G3-W1 | PARTIAL → G4-W1 | A digest exists, but the exact body was unavailable in this confined audit. |

## Verification matrix

| Finding | Re-run evidence | Result |
|---|---|---|
| G4-M1 | `:195,360-361,1277-1310` | PASS |
| G4-M2 | `:199,334-336,1084-1118` | PASS |
| G4-M3 | `:195,212,414` | PASS |
| G4-M4 | `:188,404-405,891-925` | PASS |
| G4-M5 | `:146,150,154-164,371-383` | PASS |
| G4-M6 | `:166-175,432` | PASS |
| G4-M7 | `:115,130,164,391-395` | PASS |
| G4-M8 | `:424-445,858-885` | PASS |
| G4-M9 | `:114,277,362-364` | PASS |
| G4-W1 | ledger digest plus failed local retrieval and repository search | UNVERIFIED, correctly scoped |
| G4-W2 | `:230-239,421` | PASS |

**Verified: 9/9 MUST-FIX findings reproduce.**

## Decisions Requiring Team Input

No new AD-N. Existing pending decisions remain the design’s decision surfaces; G4-M2 repairs an option before the human chooses it, and G4-M8 specifies the consequence of either D-8 outcome.

## Outstanding Issues to Fix

All nine MUST-FIX findings block the successor build. G4-W1 blocks a claim of verified handoff fidelity, not design correction itself.

## Already-Correct Items

The design still covers optional zero/one/many membership, priority views, dates, graph/Gantt/timeline views, standard links, person/agent prioritisation, prior-work fold-in, fail-closed structural guards and enabled-after-live-verification phases. Shared-core paths exist and the five cross-boundary decisions remain pending.

## Anti-Patterns to Watch For

Do not let a validation rule invert its use case, let prose stand in for edge/transition ACs, claim all write routes from a view-specific test, or hide a cross-host privacy boundary behind a package import.

## Sign-Off Checklist

- [x] A001 read in full; checks A–F dispositioned.
- [x] Round 1–3 fixes reverified.
- [x] Verification matrix reproduced 9/9 MUST-FIX findings.
- [ ] Nine MUST-FIX findings corrected.
- [ ] Exact successor brief compared.
- [ ] Re-audit reaches zero MUST-FIX.

## Audit Log

| Date | Round | Action |
|---|---:|---|
| 2026-10-28 | 4 | Independent working-tree re-audit: 9 MUST-FIX, 2 WORTH-CONSIDERING. |

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
- `docs/research/findings/evidence/beads-goals-system-design-audit-r2-2026-10-28.md`
- `docs/research/findings/evidence/beads-goals-system-design-audit-r3-2026-10-28.md`
- `ai-harness/docs/asks/BU-epic-goals-system-usmm.md`
- `ai-harness/docs/designs/TEMPLATE.md`
- `ai-harness/docs/audits/STUB.md`
- `ai-harness/docs/audits/TEMPLATE.md`
- `ai-harness/docs/procedures/decision-framework.md`
