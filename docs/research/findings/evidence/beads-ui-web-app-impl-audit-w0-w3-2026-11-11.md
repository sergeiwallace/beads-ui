# Web app implementation audit, Phases W0 to W3, 2026-11-11

A fresh-context, cross-family implementation audit: Claude legs wrote the code, so a Codex reviewer (role `review`, effort medium, read-only) audited it. Target: beads-ui `main` at `2a73840`, the matching ai-harness `main` for the receiving-side legs, and app-portal for the member registration. Spec: every criterion line of Phases W0 to W3 in [the web app design](../../../designs/beads-ui-web-app-design.md#implementation-phases). Phase W4 was still being built and is audited separately.

The rubric given to the reviewer: a criterion is MET when code implements it and at least one test at a real entry point (an HTTP route, a CLI, a rendered component, a Playwright flow) would fail if only that criterion were violated; PARTIAL when the code is there but no such test exists; UNMET when the behaviour is missing or contradicts the criterion. The live exit runs were out of scope.

## Result, verbatim

```text
W0: 38/46 MET, 8 PARTIAL, 0 UNMET
W1: 48/51 MET, 3 PARTIAL, 0 UNMET
W2: 26/26 MET, 0 PARTIAL, 0 UNMET
W3: 8/11 MET, 3 PARTIAL, 0 UNMET

W0 T-W0.4 "When the server writes a dispatch, the system shall sign the RFC" PARTIAL beads-ui/apps/web/test/envelope.test.ts:86 canonical-field coverage tests signer functions directly, not an HTTP/CLI entry point.

W0 T-W0.4 "When the Node signer and the Python verifier run the shared golden" PARTIAL beads-ui/apps/web/test/envelope.test.ts:86 Node golden-vector coverage invokes internal functions only.

W0 T-W0.4 "When the server signs an envelope, it shall include its signing_key_id inside" PARTIAL beads-ui/apps/web/test/envelope.test.ts:111 only an internal-function test proves the key ID is signed.

W0 T-W0.5 "When a dispatch is created, read, given a receipt, expired or consumed" PARTIAL beads-ui/apps/web/test/dispatch-store.contract.test.ts:125 equivalence is tested directly against store implementations, not through receiver/dispatch routes.

W0 T-W0.5 "When the server restarts, the local store shall recover every outstanding dispatch" PARTIAL beads-ui/apps/web/test/dispatch-ladder-restart.test.ts:100 server restart covers queued dispatches but not recovered receipts.

W0 T-W0.5 "If the same dispatch id is written twice, then the store shall" PARTIAL beads-ui/apps/web/test/dispatch-store.contract.test.ts:157 duplicate-ID behavior has no entry-point test.

W0 T-W0.5 "When a dispatch is consumed or expires, the local store shall delete" PARTIAL beads-ui/apps/web/test/dispatch-store.contract.test.ts:286 compaction and both-backend parity are tested only through store APIs.

W0 T-W0.5 "If the local store's file cannot be written, then the server shall" PARTIAL beads-ui/apps/web/test/dispatch-store.contract.test.ts:260 no HTTP dispatch test makes the backing store unwritable and verifies “not queued.”

W1 T-W1.0 "When the user opens the owner picker on a card, a list" PARTIAL beads-ui/apps/web/e2e/views.spec.ts:157 only the card path performs a real owner change; list-row and detail actions are not exercised.

W1 T-W1.1 "If the review-queue reducer receives an item with no priority, then it" PARTIAL beads-ui/plugins/beads-ui/core/test/review-queue.test.ts:151 only the reducer unit test covers missing priority; no rendered Review test does.

W1 T-W1.3 "When the ported composer replaces the ai-core dashboard's, it shall keep each" PARTIAL beads-ui/packages/web-ui/test/composer/composer.test.tsx:13 tests run only against beads-ui’s port, not both implementations as required.

W3 T-W3.2 "When the pair transport starts on the work pair's laptop, it shall" PARTIAL ai-harness/tests/test_pair_transport.py:971 shipped configuration is exercised through internal builders, not the CLI/service entry point.

W3 T-W3.2 "When the forward drops, the pair transport shall restore it under its" PARTIAL ai-harness/tests/test_pair_transport.py:831 restoration is driven through internal `tick()` calls, not the supervised process entry point.

W3 T-W3.2 "Where D-15 is ruled for (a), when app-portal serve-sync runs on the" PARTIAL app-portal/tests/test_beads_member.py:37 registration and dry-run planning are tested, but no test loads beads-ui both directly and through the portal shell.
```

## Dispositions, by the build coordinator

No criterion is UNMET. The 14 PARTIAL lines split as follows.

Five need a test at their entry point and are tracked as BU-mg2.5.4.22: the T-W0.5 restart that must recover receipts as well as records, the T-W0.5 unwritable store and duplicate id through the dispatch route, the T-W1.0 owner change from a list row and from the detail view, and the T-W1.1 rendered Review item with no priority.

Nine are tested at the level their criterion names, so no new test is added:

- The three T-W0.4 lines. The signer's canonical bytes, its signed key id and the shared golden vectors are byte-level contracts between two languages, and the Node suite runs a byte-for-byte copy of the Python verifier's golden vectors. The end-to-end signing path was also verified live on 2026-11-09, when the real receiving client verified a good dispatch and refused a body-tampered one.
- The two remaining T-W0.5 lines. The criterion itself names "one shared contract suite" run against both stores, which is what the contract suite is.
- T-W1.3. The ai-core dashboard's composer lives in another repository and cannot run in the beads-ui suite; the parity inventory is tested against the port, which is what replaces it.
- The three T-W3.2 lines. They are proved by the phase's live exit runs from each pair's laptop, which the design records in the Approval Log.
