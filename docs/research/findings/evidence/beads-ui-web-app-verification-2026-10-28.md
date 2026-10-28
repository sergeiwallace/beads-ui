---
title: "Verification of the beads-ui web app research doc"
category: research
tags: [research, evidence, verification, beads-ui, web-app]
status: complete
source: "claude-opus-5-5-2026-10-28"
task: BU-mg2.5.1.3
display_id: BU-agent-verify-web-app-phpz
---

# Verification of `docs/research/beads-ui-web-app.md`

Base audited: beads-ui `origin/main` at `3cb5987` (the doc's commit; this worktree fast-forwarded to it
and `git merge --ff-only origin/main` printed "Already up to date"). Fleet files were read at the
commits the doc's footnotes name: ai-harness `23ece1e92b6`, app-portal `b73683e`, ai-core `f40fa2bd`.
The founding ask record's SHA-256 was recomputed and matches the doc's `content_sha256`
(`79619e87...caed0`). Reviewer family: Claude (same family as the author), recorded as such because
the cross-family reviewer on this route cannot fetch web pages.

Every external page below was fetched this session. A verdict of SUPPORTED means the quoted text is
in the page as fetched now.

## A. Research-to-doc gap review

### G1. An ask question with no mapped finding and citation

- Open: the write path for answers to held decisions and for unblocks. A001 asks to "view all the
  blockers and decisions and open questions and respond to them quickly ... and unblock them all and
  prompt them with next steps". Leg 2 Q6 found that `held_cli.py answer` runs only on the host where
  the owning session's landing pad lives, so a server on one host cannot answer an item held on the
  paired machine, and it proposed a host-side closed verb. Leg 1 §4.1 found that a web "Unblock" that
  only changes status leaves the Review section showing the wait, because D-40 ends a wait on the
  `[unblocked ...]` transition comment. Neither finding reaches the doc: §1 covers option cards and
  D-39's verbatim rule, §3 covers prompts, and no section says how an answer or an unblock is
  written. See MUST-FIX M1.

### G2. An ask requirement, constraint, system, option or named artifact that is absent

- Open: "impact" as a review criterion. A001 says "review blockers and decisions based on priority /
  impact / task type, size". Doc §1 says the queue is "sorted by priority and filterable by epic,
  goal, type, size and owner". Impact is missing, and the doc does not say where impact and size come
  from. Leg 1 §1.3 maps them to the curation fields `value` and `effort`. See M8.
- Open: the privacy requirement as it applies to dispatch. A001 requires that private goals "and
  their related tasks" never reach ai-harness. Leg 2 Gaps item 2 and F-5 found that git-inbox commits
  messages to refs in ai-harness and that the work pair's Agent Mail board runs on the employer host,
  and recommended that a private task's prompt text stay in its private store with carriers holding
  an id and a digest. Doc §3 rung 2 says "git-inbox carries a pointer only" with no reason and no rule
  for the queue record or the Agent Mail body. See M5.
- Open: app-portal fit on the work pair. Doc §8 says "Run it standalone on the work pair" as settled.
  Leg 3 F-3 says standing alone is acceptable only until app-portal gains a loopback router, and that
  dropping the portal on that pair "would narrow the ask on one pair and should not be chosen without
  escalation". See M3.
- Kept: every other web-app clause in the Founding Ask Coverage table maps to a section that
  addresses it (kanban and backlog by reference to Phase 3, the composer, event dispatch, the three
  named routes, owner change, `/start-goal`, the queue, app-portal on the personal pair, shared code,
  backend, both pairs' access, cloud templates).

### G3. A load-bearing finding without a verified accessible citation, or still inferred

- Open: "Gmail and GitHub mark an item done with E and undo with Z" (§1, `[^4][^5]`). The cited GitHub
  page (`[^5]`) names neither key; GitHub's keyboard-shortcuts page lists `E` for "Mark as done" and no
  undo key in its Notifications table. The undo half is unsupported for GitHub. See M9.
- Open: the May and July 2026 Linear entries (§2, `[^9]`). The `[^9]` URLs are the changelog's first
  page and the Priority inbox post. As fetched, the first page shows entries from 2026-07-20 to
  2026-10-22 and has neither "Reorder groups" nor "Share filtered views"; both are on
  `linear.app/changelog/page/2`, which leg 1 cited and the doc did not. See M10.
- Open, minor: "since Phase 3 the git-inbox prompt-injection wake checks the same switch" (§3,
  `[^15][^16]`). The claim is true: ai-harness `src/ai_harness/git_inbox_delivery.py:222` at
  `23ece1e92b6` passes `submission_gate=lambda: idle_wake.load_policy().automatic_wakes`. Neither cited
  source contains that line; leg 2 cited the delivery module, and the doc dropped that source.
- Open, minor: the Executive Summary's "No product has a queue built for answering decisions" is an
  absence claim; §1's "No surveyed product" is the bounded form. See W10.
- Inferred and labelled as such, acceptable: the signed dispatch envelope, the ladder ordering, the
  browser auth combination, the shared-code candidates. Each is tagged `[INFERENCE]`.

### G4. A doc-raised factual open question that is still researchable, or a design choice not labelled

- Open: none of the five Open Questions carries a `design-choice` label or a reason. OQ3, OQ4 and OQ5
  are design choices. OQ1 mixes a researchable fleet-state fact (when Phase 4 seeds the policy file;
  re-probed this session, the file is still absent on this host and ai-harness `origin/main` at
  `7f19e089dbc` has no Phase 4 commit) with a design choice (whether turn-end delivery is an
  acceptable interim). OQ2 is a scope ruling. See M13.

### G5. A high or medium critic finding without a fix, evidence or explicit concession

- Open: the critic findings in section B at high and medium severity (B1 to B5) are not addressed in
  the doc. Each maps to a MUST-FIX or WORTH-CONSIDERING item below.
- Open: three high-severity items the legs raised for the coordinator were not carried into the doc
  as findings or Open Questions: leg 2 F-4 (paused goals narrow the auto-trigger), leg 3 F-3 (work
  pair portal origin) and leg 3 F-4 (app-portal D-5 departure). See M2, M3, M4.

### G6. A finding that contradicts a cited repository doc or measurement

- Open: Open Question 2 offers keeping the ai-core dashboard "as the queue's own view". beads-ui D-11
  is `✅ Approved by Sergei (human)` (design doc line 1431): "the beads-ui web app becomes the queue's
  Phase 2 member app, queue service unchanged". Option (b), two separate boards, was the rejected
  option (design doc line 936). See M6.
- Open: the Founding Ask Coverage table says the process clauses are "Recorded in the Run History of
  this doc"; the Run History region is empty (doc lines 452-454). See M7.
- Mismatch inside a findings file, not in the doc: leg 3's Summary item 3 gives the task projection
  "0.27 to 1.04 s", its §1.1 table gives "0.27 to 0.69 s", and its emergent finding 8 says the first
  call timed out at 5 s and the next four took 0.27 to 0.69 s. Its evidence file §2 says "0.27 to
  1.04 s over five runs". The doc follows the evidence file. See W4.

## B. Five-perspective critic pass

Each finding has a severity and a tier reference.

### Conventional

- B1 (medium). Live updates over the work pair's forward. The doc recommends Server-Sent Events (§7)
  without the browser limit leg 3 §6.3 measured from MDN: about six SSE connections per browser and
  domain over HTTP/1.1, which is what `http://localhost:<port>` through the forward speaks. Mainstream
  practice for a multi-tab dashboard on HTTP/1.1 is one multiplexed stream shared across tabs. Leg 3
  R7 recommends exactly that; the doc drops it. W1.
- B6 (low). Head polling plus SSE, guarded CLI writes and outbox-then-publish all match mainstream
  practice for a small internal app over a git-backed store. No change warranted.

### Contrarian

- B2 (high). Holding a dispatch to a paused goal. The doc states as a rule that such a dispatch "must
  be held rather than delivered" (§4). The ask says the prompt should auto-trigger the session. Leg 2
  F-4 named this a narrowing and offered three options (hold with a "resume anyway" control, deliver
  always, deliver after the pause cause clears). The doc adopts one without the control and without
  an Open Question. M2.
- B3 (medium). D-10's own deciding criterion. D-10's recommendation cites "Criterion 2 (consistency
  with app-portal and the MCP App examples)". The doc reports that app-portal uses Radix and Vite 7
  and concludes this "does not reopen D-10". That is defensible, but the doc does not say that one of
  D-10's two deciding criteria is now weaker, which is the strongest counterargument to keeping D-10
  unexamined. W6.
- B7 (low). The signed envelope (OQ4) adds key management on four hosts. The strongest counter is to
  have the receiving host trust the transport identity plus a server-side authenticated web session
  recorded in the queue. Leg 2 R-3 lists and rejects that option with reasons; the doc keeps only the
  conclusion. No change warranted beyond OQ4.

### Historical

- B8 (low). Approval queues have long prior art the survey does not touch: deployment approval
  gates in CI systems and approval steps in service-desk tools both model "approve the
  recommendation" with a recorded approver and timestamp, which bears directly on OQ3 (how a one-key
  approval is recorded). PLAUSIBLE; not fetched this session. W11.

### Adjacent

- B9 (low). Email clients' "undo send" delay is the adjacent pattern leg 1 §1.4 used for a 5 to 10 s
  delayed-send window before `held_cli.py answer`, because an answer cannot be cleanly undone once
  the session's turn starts. The doc drops the window; it matters most in bulk review. W5.

### Skeptic

- B4 (medium). Claims tagged `[VERIFIABLE]` that cite only a findings file (`[^1]`, `[^2]`, `[^28]`)
  rather than the public source: Asana's fall 2026 release and Huly's frozen repository (§2), and
  app-portal's Radix and Vite 7 (§5, §8). I fetched Asana and Huly this session and both hold
  (ledger rows 26 and 27). The app-portal claim rests on a private file and is recorded in leg 1's
  evidence file. The template expects the footnote on a `[VERIFIABLE]` claim to be the source itself.
  M12 covers the related template rule.
- B5 (medium). "Gmail ships them off by default" (§1). The Gmail page says the shortcuts "won't work
  unless keyboard shortcuts are turned on" and gives steps to turn them on; it does not say "off by
  default" in those words. PLAUSIBLE, not SUPPORTED. W10.

## C. Citation check

Public URLs were fetched this session. Repository paths were checked with `git ls-tree` at the
commit the footnote names. Gated private-repository links were checked for path existence only.

| Fn | Target | Outcome |
|---|---|---|
| 1 | beads-ui findings leg 1 (path; online link) | Path present at `3cb5987`; added in `cdcda0b` as the footnote says; online link rendered (live) |
| 2 | beads-ui findings leg 2 (path; online link) | Path present; added in `cdcda0b`; online link rendered (live) |
| 3 | linear.app/docs/triage | Live |
| 4 | support.google.com/mail/answer/6594 | Live |
| 5 | docs.github.com ... managing-notifications-from-your-inbox | Live; does not carry the `E` or undo claim (G3) |
| 6 | linear.app/developers/agent-interaction | Live |
| 7 | code.claude.com/docs/en/remote-control | Live |
| 8 | w3.org ... character-key-shortcuts.html | Live |
| 9 | linear.app/changelog; linear.app/changelog/2026-09-03-priority-inbox | Both live; first page lacks the May and July entries (G3) |
| 10 | registry.npmjs.org (queried per package) | Live (`/cmdk` document fetched); evidence file path present |
| 11 | react.dev/blog/2025/10/07/react-compiler-1 | Live |
| 12 | vite.dev/blog/announcing-vite8 | Live |
| 13 | ext-apps spec 2026-01-26 on GitHub; modelcontextprotocol.io apps overview | Both live |
| 14 | ai-harness `docs/designs/aih-p811n7-event-driven-idle-wake.md` | Gated link answered 404 (private, expected); path present at `23ece1e92b6`; coordinator commit `1e67f5e9c37` exists |
| 15 | ai-harness `src/ai_harness/idle_wake.py` | Gated; path present |
| 16 | beads-ui event-dispatch host probe (path; online link) | Path present; online link rendered (live) |
| 17 | ai-harness `docs/procedures/fleet-messaging-ladder.md` | Gated; path present |
| 18 | ai-harness `docs/designs/aih-59eza-prompt-injection-library.md` | Gated; path present |
| 19 | ai-harness `docs/designs/autonomous-work-queue-coordinator-and-pwa-dashboard.md` | Gated; path present |
| 20 | ai-harness `docs/procedures/session-handoff.md`, `skills/handoff/SKILL.md` | Gated; both present |
| 21 | code.claude.com/docs/en/goal.md | Live |
| 22 | ai-harness `skills/start-goal/SKILL.md`, `src/ai_harness/goal_waker.py`, `docs/designs/aih-wmd2v-goal-waker.md` | Gated; all present |
| 23 | microservices.io transactional-outbox | Live |
| 24 | code.claude.com/docs/en/plugins/mods/api.md | Live |
| 25 | beads-ui `docs/designs/beads-ui-design.md` (path; online link) | Path present; online link rendered (live) |
| 26 | code.claude.com/docs/en/hooks.md | Live |
| 27 | code.claude.com/docs/en/channels.md | Live |
| 28 | beads-ui findings leg 3 (path; online link) | Path present; online link rendered (live). Provenance text "merged in this run's third research landing" names no commit; the file is on `3cb5987` |
| 29 | beads-ui backend access probes (path; online link) | Path present; online link rendered (live) |
| 30 | dolthub.com ... dolt-sysvars | Live |
| 31 | docs.aws.amazon.com ... session-manager-working-with-sessions-start.html | Live |
| 32 | tailscale.com/kb/1312/serve | Live |
| 33 | tailscale.com/kb/1242/tailscale-serve | Live |
| 34 | tailscale.com/kb/1324/grants | Live |
| 35 | developer.chrome.com/blog/local-network-access | Live |
| 36 | cheatsheetseries.owasp.org CSRF cheat sheet | Live |
| 37 | docs.fly.io/reference/configuration | Live |
| 38 | docs.railway.com/reference/config-as-code | Live |
| 39 | docs.railway.com/infrastructure-as-code | Live |
| 40 | render.com/docs/blueprint-spec | Live |
| 41 | app-portal `docs/designs/eve-15f-app-portal-architecture.md` | Gated; path present at `b73683e` |
| 42 | app-portal `apps.yaml`, `src/app_portal/`, `src/vite.ts`, `src/shell.tsx`, `package.json` | Gated; all present at `b73683e` |
| 43 | ai-core `src/ai_core/queue/router.py`, `src/ai_core/main.py`, `web/README.md` | Gated; all present at `f40fa2bd` |
| 44 | ai-harness `scripts/pair_transport.py`, `scripts/wq_tunnel.py`, `config/message-transports.json`, a remote-access procedure | Gated; the three named paths present; the procedure is not named by path, and a matching file exists under `docs/procedures/` (its filename is withheld here because it names the employer) |

Totals: the 30 distinct public URLs in the doc's footnotes were all fetched and all live, none failed (no DNS, 404, 401/403, timeout or 5xx
outcome). Six beads-ui online links rendered. Eleven gated footnotes checked for path existence, all
present. One gated link was fetched as a control and answered 404, as a private repository does.

Footnote integrity: 44 definitions, contiguous from `[^1]` to `[^44]`; every definition is referenced
and every reference is defined. Inline `[^2]:` at doc lines 152 and 262 is a reference followed by a
colon, not a second definition. `scripts/check_doc_toc.py` on the doc printed
"PASS ... (29 links, ok)".

## D. Provenance ledger

| Claim | Source URL | Verbatim quote | Verdict | Live? |
|---|---|---|---|---|
| Linear Triage keys 1, 2, 3 and H | https://linear.app/docs/triage | "The shortcut `MM` also triggers the mark as duplicate action." | SUPPORTED (the page also maps accept to `1`, decline to 2, duplicate to 3 and snooze to `H`) | Yes |
| Gmail archive with E, undo with Z | https://support.google.com/mail/answer/6594 | "Undo last action" | SUPPORTED (row key `z`; "Archive" row key `e`) | Yes |
| Gmail ships shortcuts off by default | https://support.google.com/mail/answer/6594 | "These shortcuts won't work unless keyboard shortcuts are turned on." | PLAUSIBLE | Yes |
| GitHub notification inbox has saved filters | https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox | "You can add up to 15 of your own custom filters." | SUPPORTED | Yes |
| GitHub inbox has bulk actions | same as above | "To triage multiple notifications at once, select the relevant notifications" | SUPPORTED | Yes |
| GitHub marks done with E and undoes with Z | https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts (not cited by the doc) | "Mark as done" | UNVERIFIABLE for undo (E is on an uncited page; no Z in the Notifications table; the cited page names neither) | Yes |
| Linear agent sessions have six states | https://linear.app/developers/agent-interaction | "Agent sessions can have one of 6 states: `pending`, `active`, `error`, `awaitingInput`, `complete`, `stale`." | SUPPORTED | Yes |
| Remote Control disconnected banner says nothing about work continuing | https://code.claude.com/docs/en/remote-control | "Neither message tells you whether Claude or a subagent you were watching is still working on your computer." | SUPPORTED | Yes |
| Remote Control needs a subscription login, excluding cloud-provider routes | https://code.claude.com/docs/en/remote-control | "Remote Control requires a claude.ai subscription." | SUPPORTED | Yes |
| WCAG 2.1.4 is Level A and allows turn off or remap | https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html | "A mechanism is available to turn the shortcut off;" | SUPPORTED | Yes |
| Linear Priority inbox in September 2026 | https://linear.app/changelog/2026-09-03-priority-inbox | "An active workspace can create a significant amount of notifications each day" | SUPPORTED (post dated September 3, 2026) | Yes |
| Linear reorder groups (May 2026) and shared filtered views (July 2026) | https://linear.app/changelog/page/2 (not cited by the doc) | "Share filtered views" | PLAUSIBLE (true on page 2; the cited `[^9]` URLs do not carry it) | Yes |
| Linear groups agent replies in their own inbox section | https://linear.app/changelog/page/2 (not cited by the doc) | "Grouped agent-authored inbox replies into a dedicated Agents section in focus inbox grouping" | PLAUSIBLE (same citation gap) | Yes |
| cmdk last release 2025-03-14 | https://registry.npmjs.org/cmdk | "1.1.1":"2025-03-14T19:21:16.194Z" | SUPPORTED (`latest` is 1.1.1) | Yes |
| React Compiler 1.0 on 2025-10-07 | https://react.dev/blog/2025/10/07/react-compiler-1 | "We are releasing the compiler's first stable release today." | SUPPORTED | Yes |
| Vite 8 (2026-03-12) bundles with Rolldown | https://vite.dev/blog/announcing-vite8 | "Vite 8 ships with Rolldown as its single, unified, Rust-based bundler." | SUPPORTED | Yes |
| MCP Apps `ui/message` posts into the conversation | https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx | "Send message content to the host's chat interface" | SUPPORTED | Yes |
| MCP Apps fit review and triage workflows | https://modelcontextprotocol.io/extensions/apps/overview | "Approving expense reports, reviewing code changes, or triaging issues involves examining items one by one." | SUPPORTED (leg 1 claim the doc inherits in §6) | Yes |
| Native `/goal` replaces an active goal | https://code.claude.com/docs/en/goal.md | "If a goal is already active, the new one replaces it." | SUPPORTED | Yes |
| Native `/goal` resumes a paused goal on any new prompt | https://code.claude.com/docs/en/goal.md | "Send a message at any time to start the next turn immediately." | SUPPORTED (in the pause paragraph that opens "a notice starting with `Goal paused` names the cause") | Yes |
| Outbox consumers must be idempotent | https://microservices.io/patterns/data/transactional-outbox.html | "The Message relay might publish a message more than once." | SUPPORTED | Yes |
| Mods API `$.prompt.submit` and timers | https://code.claude.com/docs/en/plugins/mods/api.md | "The call waits until the session is idle and then starts a new turn." | SUPPORTED (refused-call results are in "What refused calls return") | Yes |
| `asyncRewake` hook wakes on exit 2 | https://code.claude.com/docs/en/hooks.md | "If `true`, runs in the background and wakes Claude on exit code 2." | SUPPORTED | Yes |
| Channels are a research preview with provider limits | https://code.claude.com/docs/en/channels.md | "Channels are a research preview feature." | SUPPORTED | Yes |
| Dolt `@@<db>_head` gives a store's head | https://www.dolthub.com/docs/sql-reference/version-control/dolt-sysvars | "This system variable reflects the current HEAD commit's hash." | SUPPORTED | Yes |
| Asana fall 2026 adds AI Teammates and a Work Graph | https://asana.com/whats-new | "powered by the Asana Work Graph." | SUPPORTED (doc cites only the findings file) | Yes |
| Huly repository frozen, hosted service discontinued | https://github.com/hcengineering/platform | "The hosted Huly service has been discontinued because its hosting is no longer funded." | SUPPORTED (doc cites only the findings file) | Yes |
| Session Manager port forwarding exists for the work pair | https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html | "`localPortNumber` is the port on your local computer where traffic starts" | SUPPORTED | Yes |
| Tailscale Serve sets an identity header | https://tailscale.com/kb/1312/serve | "Filled with the requester's login name" | SUPPORTED (`Tailscale-User-Login`) | Yes |
| App capabilities need Tailscale 1.92 or later | https://tailscale.com/kb/1312/serve | "This feature is available in Tailscale v1.92 or later." | SUPPORTED | Yes |
| `tailscale serve --set-path` mounts under a path | https://tailscale.com/kb/1242/tailscale-serve | "Appends the specified path to the base URL for accessing the underlying service." | SUPPORTED | Yes |
| Grants carry app capabilities | https://tailscale.com/kb/1324/grants | "The recommended best practice is to favor grants for most use cases." | SUPPORTED | Yes |
| Chrome gates public-to-loopback requests | https://developer.chrome.com/blog/local-network-access | "The Local Network Access permission prompt is launching in Chrome 142." | SUPPORTED | Yes |
| Origin and Fetch Metadata checks against CSRF | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html | "If the Origin header is present, verify that its value matches the target origin." | SUPPORTED | Yes |
| Railway config-as-code deprecated, cutoff 2026-12-01 | https://docs.railway.com/reference/config-as-code | "Existing files keep working for legacy services until 2026-12-01" | SUPPORTED (scope is "legacy services") | Yes |
| Railway's replacement is `.railway/railway.ts` | https://docs.railway.com/infrastructure-as-code | "Railway creates `.railway/README.md` and, by default, `.railway/railway.ts`." | SUPPORTED | Yes |
| `fly.toml` is current | https://docs.fly.io/reference/configuration | "Configuration of builds, environment variables, internet-exposed services, disk mounts, and release commands go here." | SUPPORTED | Yes |
| `render.yaml` is current | https://render.com/docs/blueprint-spec | "By default, this file has the name `render.yaml`" | SUPPORTED | Yes |

Verdict counts: 34 SUPPORTED, 3 PLAUSIBLE, 1 UNVERIFIABLE, 0 CONTRADICTED (38 rows).

Claims that rest on a findings file, checked against that file:

- §3 cache-read median of 365,551 tokens: leg 2 Summary item 5 cites `[^1][^21]`, and its `[^21]` is the
  mods API page, which does not carry the figure. The figure is in ai-harness
  `docs/designs/aih-p811n7-event-driven-idle-wake.md:99` at `23ece1e92b6` ("its associated response
  window reads 365,551 cache tokens"), which the doc's `[^14]` cites (lines 89-200). The doc's citation
  is correct; the findings file's `[^21]` is wrong.
- §3 Phases 1 to 3 built, 4 and 5 not: matches leg 2 Q1's table and its evidence file §1.
- §3 the policy file is absent: matches leg 2 evidence §3; re-probed this session, still absent.
- §4 `bd` refuses another session's reassignment without `--force`: matches leg 2 Q4 and
  `docs/procedures/session-handoff.md:88` at `23ece1e92b6`.
- §3 peer relays from a web app would read `UNVERIFIED`: matches leg 2 Q7 and
  `docs/procedures/fleet-messaging-ladder.md:248`.
- §7 `bd serve` 1.3.2 bearer tokens, rebinding check, no TLS, no hooks: matches leg 3 §1.2 and its
  evidence §5.
- §7 the heads query at 0.42 s: matches leg 3 evidence §4 (0.423 s).
- §7 the projection "0.27 to 1.04 s": matches leg 3 evidence §2; leg 3's own body disagrees (G6).
- §8 app-portal's "no Node at runtime": matches app-portal `eve-15f-app-portal-architecture.md:119-120`
  at `b73683e`.
- §4 "the receiving session ... decides whether to run `/start-goal`": leg 2 R-5 recommends the host
  receiver run `start_goal.py` when the session was idle and goal-inactive, and the session only
  otherwise. The doc keeps only the second half. W5.

## E. Structure and writing

Template conformance (ai-harness `docs/research/TEMPLATE.md`, `research-1.2.0`):

- Section order matches: Founding Ask Coverage, Status and Created, ToC, Context, Temporal Scope,
  Executive Summary, numbered sections with "When to use", Comparison, Recommendation, Open
  Questions, Sources, Ambiguous Items, Research Prompt appendix, Provenance Ledger appendix, Run
  History.
- The ToC sits inside the immutable `context` region (the region opens at doc line 54, before the ToC
  at line 56). The template keeps the ToC in the static header outside every region so a body
  rewrite cannot clobber it, and its stub "FILL THIS IN" comment (lines 58-69) was left in. M14.
- The placeholders in the Ambiguous Items and Provenance Ledger regions use an em dash
  (an em dash after "none yet"); the template's text uses a semicolon. M14.
- 19 `[INFERENCE]` tags carry a footnote reference. The template says "Only [VERIFIABLE] claims carry
  a footnote ref; [INFERENCE]/[NO SOURCE] do not." M12.
- Footnotes are defined contiguously but first referenced out of order (first uses run 1, 3, 4, 5,
  9, 25, 8, 14, ...). T2.
- The ToC lists every `##` and `###` heading and resolves (`check_doc_toc.py` PASS).
- `scripts/far_fidelity.py check --doc <doc> --far <record>` printed "0 finding(s) ... founding ask:
  not read (no AI-resolved decision states a negation)". That floor reads only AI-resolved decisions,
  which a research doc does not carry, so it says nothing about the narrowings in M2 and M3.

Writing pass (ai-harness `docs/procedures/ai-writing-anti-patterns.md`):

- Em dashes in authored prose: none. The six em dashes in the file are in the template-derived comment
  (line 65), the two region placeholders (M14) and three verbatim quotes of the canonical research
  prompt (lines 369, 381, 384), which are exempt.
- Bold lead-ins: only the template's `**Status:**`, `**Created:**`, `**Primary period:**` and
  `**Source weighting:**` labels. None authored.
- Hedges: none found ("likely" at line 150 is a stated judgment of which dependency blocks).
- Three-part padding: none found.
- Self-contradiction, §5 line 187: "Recharts and cmdk are all maintained [VERIFIABLE][^10]. The
  exception is `cmdk`". M11.
- Contrastive foil, pattern #3: "should be ported, not redesigned" (line 169) and "costs only a shared
  token set, not a shared component library" (line 225). Each half carries some information. T1.
- Dense prose, pattern #14: §3's opening paragraph and the authority paragraph run long sentences
  with several clauses. T3.

## F. Public-repository check

The doc itself:

- Row counts: none. Ports: none (`<port>` placeholders only). Host process command lines: none.
  Queue auth-posture wording: none; the data-scope issue appears only in the "tracked privately"
  form (§7). Private issue ids: none in prose. The Research Prompt appendix records a redaction
  ("[Wording redacted for this public file.]").
- Ambiguous: footnotes `[^14]`, `[^18]`, `[^22]` and `[^41]` give fleet file paths whose filenames
  begin with an issue-shaped slug. These are filenames, not issue references. W9.

Sibling public files the doc cites (outside the doc, but bound by the same rule):

- The event-dispatch evidence file (`[^16]`) and the event-dispatch findings file (`[^2]`) carry
  private issue ids in prose, in Beads status lines and in quoted excerpts.
- The backend access probes evidence file (`[^29]`) carries a port number and a full SSH
  port-forward command line in §7. The backend findings file (`[^28]`) names a listening port and a
  key count in §4.1.
- The backend findings file describes the data-scope issue in more than the "tracked privately" form
  in two places (its emergent finding 1 and its R1(c) Cons), and the event-dispatch findings file
  gives a registered-session count from the queue in Q2(f).

These details are not repeated here. MF1.

## Proposals by tier

### MUST-FIX

- M1 (high). Add the write path for held-decision answers and unblocks: the cross-host limit on
  `held_cli.py answer` (leg 2 Q6), the host-side closed-verb proposal, and the unblock comment
  format D-40 reads (leg 1 §4.1). Location: §1 and §3; add an Open Question if the closed verb is a
  new ai-harness change.
- M2 (high). §4's "must be held rather than delivered" narrows the ask's auto-trigger for paused
  goals. Record it as a narrowing, carry leg 2 F-4's options (hold with a "resume anyway" control,
  deliver always, deliver after the cause clears) and add an Open Question, or return it as an
  escalation.
- M3 (high). §8 "Run it standalone on the work pair" and its "When to use" settle the work-pair
  portal question. Carry leg 3 F-3: standalone as an interim, app-portal's loopback router as the
  path to the ask's portal fit on that pair, and an Open Question for the cross-repo change. Update
  the Founding Ask Coverage row for app-portal to say it is met on the personal pair and pending on
  the work pair.
- M4 (medium). §8's recommendation departs from app-portal D-5 ("no Node at runtime") for one member.
  Say so and add an Open Question naming the app-portal owner's agreement or a recorded amendment
  (leg 3 F-4).
- M5 (medium). §3 rungs 0 to 2: state the privacy rule for dispatch content. A private task's prompt
  text stays in its private store; the queue record, the Agent Mail body and any git-inbox message
  carry an id and a digest (leg 2 Gaps 2, F-5); and say why git-inbox is pointer-only.
- M6 (medium). Open Question 2 offers an option that D-11, approved by Sergei, rejected. Reframe it
  as which ai-core `web/` components are ported and when the dashboard retires, under D-11 (a).
- M7 (medium). The Founding Ask Coverage row for process clauses points to an empty Run History.
  Add the Run History entry (legs, dates, the ops-lab-2 compile wait and its state) or change the row.
- M8 (low). §1: add impact to the review sort and filter keys and name the source fields (`value`,
  `effort`) from leg 1 §1.3.
- M9 (low). §1: drop "and undo with Z" for GitHub, or cite a page that documents it; cite GitHub's
  keyboard-shortcuts page for `E`.
- M10 (low). `[^9]`: add `https://linear.app/changelog/page/2`, which carries the May and July 2026
  entries and the agent-replies grouping.
- M11 (low). §5 line 187: remove `cmdk` from the "all maintained" list.
- M12 (low). Remove footnote refs from the 19 `[INFERENCE]` tags, or retag claims that truly rest on
  a cited source; for §2's Asana and Huly claims and §5/§8's app-portal claim, cite the public source
  or the evidence file directly.
- M13 (low). Label each Open Question `design-choice` with a reason, or researchable; split OQ1 into
  the fleet-state fact and the interim-delivery choice.
- M14 (low). Move the ToC out of the `context` region to the static header, delete the stub comment
  at lines 58-69, and use the template's region placeholder text.
- MF1 (medium). Sibling public files carry details the public-repository rule bars (section F). Scrub
  them to the "tracked privately" form, with no issue ids, ports, command lines or counts. This is
  outside the doc under review and is the coordinator's call to schedule.

### WORTH-CONSIDERING

- W1 (medium; confidence high). Carry leg 3 §6.3 and R7 into §7: one multiplexed SSE stream shared
  across tabs, because the work-pair forward is HTTP/1.1.
- W2 (low; confidence high). Carry leg 3 F-6 (refresher snapshots keyed by worktree path, duplicated
  per session) and §2.2 (the queue projection lags `bd` by up to 5 minutes) into §7.
- W3 (low; confidence high). Note leg 3's finding that the personal laptop's fleet profile is `mac`,
  not `host-f`, so config naming the personal pair must use `mac`.
- W4 (low; confidence high). Note the cold first read of the queue projection (leg 3 emergent 8) and
  fix leg 3's internal timing inconsistency.
- W5 (low; confidence medium). Record both arming shapes from leg 2 R-5 in §4, and leg 1 §1.4's
  delayed-send undo window in §1.
- W6 (low; confidence medium). State in §5 that D-10's criterion 2 (app-portal consistency) is weaker
  now that app-portal is on Radix and Vite 7, and why D-10 still holds.
- W7 (low; confidence medium). The Executive Summary says D-14 holds; the body never examines D-14.
  Cite leg 3 F-8 or drop D-14 from that line.
- W8 (low; confidence medium). The ask says "whatever is the best web app UI/UX frontend framework".
  The doc rechecks D-10's libraries but surveys no 2026 alternative framework. A one-paragraph note
  that D-10 already weighed alternatives (Solid, lit-html) and that nothing measured since reopens
  that would close the question.
- W9 (low; confidence low). Decide whether issue-shaped filename slugs in fleet paths count as
  private issue ids under the public-repository rule.
- W10 (low; confidence high). Reword "Gmail ships them off by default" to what the page says, and
  bound the Executive Summary's "No product has a queue built for answering decisions" to the
  products surveyed.
- W11 (low; confidence low). For OQ3, consider prior art in approval gates (CI deployment approvals,
  service-desk approvals) that record an approver and a timestamp for a one-action approval.

### TAKE-IT-OR-LEAVE-IT

- T1. Rephrase the two contrastive foils at lines 169 and 225 as plain statements.
- T2. Renumber footnotes in first-use order.
- T3. Split §3's longest paragraphs.

## Verdict

The doc is accurate where it speaks: 34 of 38 ledger claims are supported by pages fetched this
session, every public citation is live, every repository path exists at its stated commit, and the
measured fleet facts match their evidence files. It is not yet fit to feed the web app design as is,
because the synthesis drops three narrowings the legs flagged for escalation (paused goals, the
work-pair portal origin, app-portal D-5), omits the answer and unblock write path the ask's "respond
... and unblock them all" depends on, and leaves out the privacy rule for dispatch content. Fix M1 to
M6 first; the design would otherwise inherit settled-looking choices that narrow the founding ask.
The remaining MUST-FIX items are citation and template repairs.

## Files read

- beads-ui at `3cb5987`: `docs/research/beads-ui-web-app.md` (in full);
  `docs/research/findings/beads-ui-web-app-ux-stack-and-shared-code.md` (in full);
  `docs/research/findings/beads-ui-web-app-event-dispatch.md` (in full);
  `docs/research/findings/beads-ui-web-app-backend-portal-and-access.md` (in full);
  `docs/research/findings/evidence/beads-ui-web-app-event-dispatch-host-probe.md` (in full);
  `docs/research/findings/evidence/beads-ui-web-app-backend-access-probes-2026-10-28.md` (in full);
  `docs/research/findings/evidence/beads-ui-web-app-stack-signals-2026-10-28.md` (tables);
  `docs/designs/beads-ui-design.md` (D-10, D-11, D-39 acceptance line, Phase 6 deliverables);
  `docs/research/goals-system.md` (headings).
- ai-harness worktree: `docs/research/TEMPLATE.md` (in full);
  `docs/procedures/ai-writing-anti-patterns.md` (core sections).
- ai-harness at `23ece1e92b6`: `docs/designs/aih-p811n7-event-driven-idle-wake.md` (line 99);
  `src/ai_harness/idle_wake.py` (lines 50-100); `src/ai_harness/git_inbox_delivery.py` (line 222);
  `docs/procedures/session-handoff.md` (grep); `docs/procedures/fleet-messaging-ladder.md` (grep);
  path listings for every cited ai-harness file.
- ai-harness worktree for the ask: `docs/asks/BU-epic-goals-system-usmm.md` (SHA-256 only; A001 read
  from the brief's verbatim carrier).
- app-portal at `b73683e`: `docs/designs/eve-15f-app-portal-architecture.md` (grep for Node); path
  listing. ai-core at `f40fa2bd`: path listing.
- Host: `~/.config/ai-harness/idle-wake.json` (absence re-probed).

## Sources fetched

- https://linear.app/docs/triage: live
- https://support.google.com/mail/answer/6594: live
- https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox: live
- https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts: live (control for M9; not cited by the doc)
- https://linear.app/developers/agent-interaction: live
- https://code.claude.com/docs/en/remote-control: live
- https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html: live
- https://linear.app/changelog: live
- https://linear.app/changelog/page/2: live (control for M10; not cited by the doc)
- https://linear.app/changelog/2026-09-03-priority-inbox: live
- https://registry.npmjs.org/cmdk: live
- https://registry.npmjs.org/@base-ui/react: live (document longer than one read; `time` object not reached, so no claim rests on it)
- https://react.dev/blog/2025/10/07/react-compiler-1: live
- https://vite.dev/blog/announcing-vite8: live
- https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx: live
- https://modelcontextprotocol.io/extensions/apps/overview: live
- https://code.claude.com/docs/en/goal.md: live
- https://microservices.io/patterns/data/transactional-outbox.html: live
- https://code.claude.com/docs/en/plugins/mods/api.md: live
- https://code.claude.com/docs/en/hooks.md: live (first part of a long page read)
- https://code.claude.com/docs/en/channels.md: live
- https://www.dolthub.com/docs/sql-reference/version-control/dolt-sysvars: live
- https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html: live
- https://tailscale.com/kb/1312/serve: live
- https://tailscale.com/kb/1242/tailscale-serve: live
- https://tailscale.com/kb/1324/grants: live
- https://developer.chrome.com/blog/local-network-access: live
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html: live
- https://docs.fly.io/reference/configuration: live
- https://docs.railway.com/reference/config-as-code: live
- https://docs.railway.com/infrastructure-as-code: live
- https://render.com/docs/blueprint-spec: live
- https://github.com/hcengineering/platform: live
- https://asana.com/whats-new: live
- https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-web-app-event-dispatch.md: live
- https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-web-app-backend-portal-and-access.md: live
- https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-web-app-ux-stack-and-shared-code.md: live
- https://github.com/sergeiwallace/beads-ui/blob/main/docs/designs/beads-ui-design.md: live
- https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/evidence/beads-ui-web-app-backend-access-probes-2026-10-28.md: live
- https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/evidence/beads-ui-web-app-event-dispatch-host-probe.md: live
- https://github.com/sergeiwallace/ai-harness/blob/main/docs/designs/aih-p811n7-event-driven-idle-wake.md: 404 (private repository; expected for a gated link)
