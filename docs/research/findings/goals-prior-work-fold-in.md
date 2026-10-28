---
title: "Prior goals system fold-in: what to reuse, what is superseded, why it failed, and the leads it raises"
category: research
tags: [beads-ui, goals, prior-work, legacy-goal-system, scoring, gamification, failure-analysis, privacy, research-findings]
status: complete
source: "claude-opus-5-5-2026-10-28"
task: BU-ylx.11.1.4
display_id: BU-agent-fold-prior-ctyj
template_version: "research-findings-1.0.0"
---

# Prior goals system fold-in: what to reuse, what is superseded, why it failed, and the leads it raises

Research leg 4 of the beads-ui goals research. It reads the prior-work compile of the first goals system (ai-harness PR #6182, commit `3ebb6f3cf60`, read at `d79603123c8`) against legs 1 to 3 and the synthesis on beads-ui `main` (`3cb5987`). Prior-work paths are ai-harness paths. `[REDACTED: ...]` regions are information boundaries; no redacted text is inferred or reproduced here.

## Summary

1. The first system failed at the goal-to-task link, not in its goal model. Tasks moved to Beads while goals and the `goal_tasks` link table stayed in the ai-core database, so the join could not run. The Postgres path of `get_goal` then returned zero progress "rather than erroring", and the guidance service refused to run at all [VERIFIABLE][^1][^6][^13][^15]. The new design keeps goals, work and links in one Beads store, which removes this failure by construction [INFERENCE].
2. The local link table held zero rows at both inventory dates (2026-07-07 and 2026-07-25), so the progress bars had nothing to count there [VERIFIABLE][^6]. The new design must make linking cheap and must show an empty link set as "no data", never as 0% progress [INFERENCE].
3. Most of the old goal record carries over. The new research already restates the `why`, obstacles, target date, lifecycle with pause, many-to-many links, the unaligned-work signal and "no streaks" [VERIFIABLE][^2][^20]. Three old concepts are missing from the new ontology. These are a unique active rank (the remedy for the new research's own "priority inflation" failure mode), a `milestone` contribution, and goal-to-document links [VERIFIABLE][^2][^20] [INFERENCE].
4. The daily score, achievements and narrative coach should not return in the first release. The old design was owner-approved, yet its code diverged from it in three measured places. Its own research found no productivity system that sustained gamified engagement past one to two years. And legs 2 and 3 found evidence against points and streaks [VERIFIABLE][^3][^9][^14][^20]. The owner's underlying intents can be served without a score. These are priority discipline, credit for unblocking agents, and confirming agent-made records before they count [INFERENCE].
5. A new lead follows from the old design's credit for unblocking agents. The new alignment formula follows only `contributes-to` and `parent-child` paths, so a decision that blocks goal-serving work gets no alignment boost unless someone links it by hand [VERIFIABLE][^20] [INFERENCE]. Propagating alignment backwards along `blocks` edges would rank the person's review queue by the goals it unblocks.
6. Several prior citations are wrong or weaker than they read. The novelty-effect paper is by Rodrigues and colleagues, not Koivisto and Hamari [VERIFIABLE][^23]. The "Cognition, 2023" prioritisation study is in *Cognitive Psychology* (2024) and finds that people under load overweight deadlines [VERIFIABLE][^28]. The nudge meta-analysis the old docs cite (d = 0.43) was answered by "No evidence for nudging after adjusting for publication bias" [VERIFIABLE][^25]. The "completion bias" source in the achievement research names the wrong paper; the measured effect is KC and colleagues' task completion preference [VERIFIABLE][^11][^27].
7. Two verified prior-work leads qualify new recommendations. A 2024 pre-registered experiment found SMART goals no better than do-your-best or open goals for creative performance, which bears on leg 2's rule that every objective needs a measurable target [VERIFIABLE][^24]. Strict prioritisation instructions raised negative affect and perceived conflict, while lenient ones removed the link, which bears on how a unique rank is framed [VERIFIABLE][^29].
8. The compile's own scrub supplies privacy lessons the guard design should absorb. Design docs followed their code into a shared repository, and that move carried personal content in [VERIFIABLE][^2][^3]. One redaction was applied in one file but not in five others. The old guidance service sent open task titles and a vision statement to an external model command line [VERIFIABLE][^15]. Prevention at placement, which leg 3 recommends, is the only control that would have stopped all three [INFERENCE][^21].

## 1. Inventory of the prior work

The compile holds eleven documents and an archive of 26 code copies plus a README, which matches the brief's count of 27 archive files [VERIFIABLE][^1][^12]. None of the eleven documents is a stub. The compile replaced seven wholly private documents with stubs elsewhere in the repository, and those are not part of this set [VERIFIABLE][^1].

| Prior-work file (ai-harness path) | Covers | Evidence grade |
|---|---|---|
| `docs/analysis/legacy-goal-system--prior-work-reference.md` | Index, model and scoring summaries, archive table, privacy notes, live session-goal pointers, issue appendix, reuse options A to D | The compile's own analysis; it separates design intent from code and calls approvals "a source snapshot" [^1] |
| `docs/designs/legacy-goal-system--goals-system.md` | Goal fields, unique rank, many-to-many links, MCP tools, ranked-list UI, startup, digest and guidance integrations, 14 approved decisions | Owner-approved design intent; 22 redaction markers [^2] |
| `docs/designs/legacy-goal-system--daily-scoring-system.md` | Three-axis daily score, achievements, AI narrative, baselines, ethics, 15 decisions with owner feedback rounds | Owner-approved design intent, partly shipped; 22 markers [^3] |
| `docs/plans/legacy-goal-system--daily-scoring-system-plan.md` | Acceptance criteria for the scoring build, difficulty rubric, provisional tasks, EMA crossover | Approved plan; the code diverges from it in places (§5) [^4] |
| `docs/designs/legacy-goal-system--priority-scoring-engine.md` | Next-task score from priority, deadline urgency and activity | Short (41 lines); "Approved, partially shipped" [^5] |
| `docs/analysis/legacy-goal-system--t13-task-api-retirement-inventory.md` | Retirement of the local task tables, live callers, backup evidence, execution record | Measured engineering record; 56 markers, many replacing whole referents [^6] |
| `docs/research/legacy-goal-system--goal-psychology-planning.md` | Goal-setting theory, forced ranking, linking granularity, nudges, review cadence, abandonment | Opus research, 2026-03-25; mostly sound, some unverified figures [^7] |
| `docs/research/legacy-goal-system--gamification-scoring-psychology.md` | Gamification frameworks, scoring models, product survey | Opus research, 2026-03-26; one misattributed citation [^8][^23] |
| `docs/research/legacy-goal-system--gamification-gap-analysis.md` | Novelty cliff, live-service game resets, social identity, change-point baselines, ethics | Opus research, 2026-03-26; it states that no productivity case beat the novelty cliff [^9] |
| `docs/research/legacy-goal-system--gamification-scoring-synthesis.md` | Consolidated scoring recommendations | Synthesis; later decisions revised its baseline, seasonal and cold-start parts [^3][^10] |
| `docs/research/legacy-goal-system--achievement-tier-psychology.md` | Rarity tiers, achievement criteria, difficulty tagging, intraday scoring, BOCPD, rule engine | Lowest grade: produced by a free-tier Gemini preview model (line 17) with weak citations (§3) [^11] |
| `archive/goal-system/` (26 copies) | Later `ai_core` and earlier `humanware` services, routes, templates, schema, migrations | Shipped code snapshots; "not runnable", "must not be imported, executed, or collected as tests" [^12] |

The reference doc's own grading holds up against the code. It says the archived engine applies diminishing returns "on the effort axis", that approval multipliers "exist as a helper but are not applied", and that the guidance entry points reject the legacy task index on Postgres. All three match the code read in this run [VERIFIABLE][^1][^14][^15].

## 2. Goal model comparison

The old model is a flat goal table over tasks. Its fields are a stable display id, a unique active rank, title, summary, `why`, obstacles, vision alignment, roadmap, tags, target date and `achieved_at`. Links to tasks are typed `direct`, `supporting` or `milestone`, with an optional ordinal, and document links sit alongside [VERIFIABLE][^2][^17]. The new ontology has two levels and two kinds, `contributes-to` with `make` (1.0) or `help` (0.5), three dates, and a lifecycle with `paused` and `dropped` [VERIFIABLE][^18][^20].

| Old concept | New research's equivalent | Verdict | Why |
|---|---|---|---|
| Goal above tasks, flat in v1; hierarchy and "life roadmap graph" deferred | Aspiration and objective levels above epics; `refines` | Superseded | The founding ask makes the goal the top parent and asks for a hierarchical graph; the old design deferred both [^2][^20] |
| Stable display id (`GOAL-1`) | Beads issue id of a custom `goal` type | Superseded | Beads issues ids already [^20] |
| Unique active rank, sequential, no ties; partial unique index on active goals | Beads `priority` 0 to 4, ties allowed | Conflict | The new research lists "priority inflation: if every goal is P0" as a failure mode with no structural remedy. A unique rank is that remedy [^2][^17][^20]. See R1 |
| Rank framed as "your priority order right now"; weekly "still in the right order?" review | Calendar-boundary reviews; check-in cadence | Adapt | The framing is supported by Freund and Tomasik: strict prioritisation raised negative affect and lenient instructions removed the effect [^2][^29] |
| `summary` | Title plus description | Superseded | Beads description covers it [^20] |
| `why` (motivation and benefits merged) | `why` field | Carry over | Both rely on self-concordance and SDT [^2][^20] |
| `obstacles` (WOOP) | Structured obstacles, each with an if-then plan, plus `obstructs` links | Superseded | The new form adds the if-then format, the measured moderator [^2][^20] |
| `vision_alignment` (identity framing) | Aspiration level | Adapt | An aspiration is a goal record; the old field was free text on each goal. The aspiration carries the identity framing [INFERENCE] |
| `roadmap_plan` narrative | Linked epics and the timeline view | Superseded | The old research itself judged the roadmap "useful at creation, rarely re-read" [^7] |
| `tags` (moved from comma text to a JSON array) | Beads labels | Carry over | Labels exist; the migration shows tags were wanted for filtering [^17][^20] |
| `target_date` only | Planned start, planned end, hard due, date resolution | Superseded | The ask names start, end and due; the old model narrowed this to one date [^2][^20] |
| `achieved_at` | Beads `closed_at` | Superseded | Beads records it [^22] |
| Lifecycle active, paused, achieved, archived; "archived" chosen over "abandoned" to avoid shame | Active, paused, achieved, dropped with reason and successor | Adapt | The new state is better specified. The old evidence on shame bears on the label shown, not the state. See R7 [^2][^20] |
| Paused goals leave the rank order; no auto-promotion on achieve | Paused goals weigh 0 in alignment | Carry over | Same behaviour; keep "no auto-promote" [^2][^20] |
| 30-day "resume or archive?" prompt for paused goals; 7-day grace before nudging an empty goal | Review prompts on staleness and at week, month and quarter boundaries | Carry over | Both are timed events that fit event-based dispatch; the new research has no empty-goal rule [^2][^7][^20] |
| Many-to-many `goal_tasks` | `contributes-to`, many-to-many, descendant inclusion | Superseded | Same shape, plus descendant inclusion through epics [^2][^20] |
| Contribution `direct` and `supporting` | `make` and `help` | Superseded | Same meaning, with numeric weights from iStar 2.0 [^20] |
| Contribution `milestone`; goal-phase markers advanced by milestone links | None | Conflict (gap) | The old design used milestones as named checkpoints for phases. Beads has a built-in `milestone` type. See R3 [^2][^3][^20] |
| Ordinal order of tasks within a goal | None | Adapt | The old research said most users would not set it; priority order is the better default [^7] |
| `goal_docs` links to plans and research | None | Conflict (gap) | Not in the new ontology. See Gaps item 5 [^2][^20] |
| Progress = done linked tasks / all linked tasks | Typed progress source, estimate-weighted with a count fallback; health kept separate | Superseded | The old bar is the count fallback. The old research warned that the denominator grows as tasks are added [^7][^19] |
| Unanchored P0 warning; links optional | Unaligned-work list, informational, never a gate | Carry over | Same decision, same reason ("when everything is signal, nothing is signal") [^2][^7][^20] |
| Keyword goal-link suggestions, "never auto-applied" | Agent-made links stay proposed until reviewed | Carry over | The old suggestion rule is the same review principle [^2][^13][^20] |
| Soft warning at 5 or more active goals | "A soft cap on active objectives follows, but no study gives a number" | Adapt | The old cited evidence is about conflict, not count (Gray and colleagues); the old research says "the key variable is conflict, not count" [^7][^20][^26] |
| Goal boost on the next-task score: 1.5x for rank 1, 1.25x for rank 2 | Noisy-OR alignment $A_i$ multiplying WSJF, per pool | Superseded | The new form scales with goal weight and splits person and agent queues [^2][^15][^20] |
| Session startup: top three goals and an AI focus pick | Goal context injected when an agent claims work | Adapt | The person-facing pick does not exist in the new research. The old design rejected inactivity notifications as "too noisy", which matches the ask's event-based rule [^2][^20] |
| Per-goal visibility private, friends, public (future social layer) | Privacy marking that decides the storage location | Conflict | Two different ideas: audience versus placement. The new marking must not be read as the old audience flag. See §6 [^3][^21] |

Health has no old equivalent. The old system had only the progress bar and, in scoring, a weekly "was your score accurate?" check [VERIFIABLE][^3]. The new progress-and-health split is new work [VERIFIABLE][^19].

The alignment score has two old ancestors. One is the 1.5x and 1.25x goal boost. The other is the scoring design's strategic-alignment axis, a fixed per-rank multiplier table from 5.0 down to 1.0 that takes the best-ranked goal per task [VERIFIABLE][^3][^14][^15]. Both use the best goal only. The new noisy-OR credits several goals with diminishing returns, which the dilution effect supports [INFERENCE][^20].

## 3. Scoring and gamification against the new evidence

The old daily score was $0.40\,SA + 0.35\,EQ + 0.25\,C$. Its axes were strategic alignment, effort quality and consistency, normalised against a 7-day EMA, with declared rest, a score-free mode and seven hard prohibitions on the AI coach [VERIFIABLE][^3][^14]. The owner approved it over four feedback rounds and authorised autonomous implementation [VERIFIABLE][^3][^4].

### What the owner asked for, separated from the mechanism

The owner's feedback in the old design states intents that outlast the score:

- Challenges should serve goals: "a tool in service of goals, not something existing to drive engagement for the sake of it" (design line 1270) [VERIFIABLE][^3].
- Scoring should be objective and comparable, with no generous early bias, and versioned when the rules change (line 1264) [VERIFIABLE][^3].
- Lower-priority work while higher-priority work stays open should count for less, increasingly so within a day (DD-14, lines 1112 to 1149) [VERIFIABLE][^3].
- Approving a design or unblocking agents is high-leverage work and should be weighted by what it unblocks (DD-13, lines 1072 to 1108) [VERIFIABLE][^3].
- Work the system observes should be captured as provisional records the owner confirms before they count (DD-15, lines 1153 to 1188) [VERIFIABLE][^3].
- Difficulty should mean cost to the owner: review burden, research and prompt review, iteration risk and token budget, not agent time (OQ1, lines 1325 and 1335) [VERIFIABLE][^3].

Each intent has a home in the new design without a daily score [INFERENCE]:

| Owner intent | New-design home |
|---|---|
| Serve goals, not engagement | Leg 2's D7 (no points, badges or streaks) and the unaligned-work list [^20] |
| Objective, versioned rules | Alignment constants versioned in config, as the old `scoring_version` did [^14][^20] |
| Priority discipline | Ordering by $S_i$, plus an informational "lower-priority work closed while P0 open" line in reviews |
| Credit for unblocking agents | The review queue ordered by unblocked alignment (R4) and the WSJF unblock term [^20] |
| Confirm before counting | Agent-made links and records stay proposed until reviewed (leg 2's D11) [^20] |
| Difficulty as owner cost | A person-pool effort measure (R6) |

### Why the score should not return now

The old research itself says the mechanism is unproven. The gap analysis found "no documented case" of productivity gamification sustaining engagement past one to two years [VERIFIABLE][^9]. The scoring research cites gamification effects of g = 0.257 that fade past one semester [VERIFIABLE][^8]. Its source for that fade is the longitudinal study by Rodrigues and colleagues (2022), which the old docs attribute to Koivisto and Hamari [VERIFIABLE][^8][^23]. Leg 2 adds reward undermining (d = -0.40 to -0.28) and broken-streak disengagement [VERIFIABLE][^20].

The old design's own reviewer flagged the main risk. A live score invites quick-win selection, and the reviewer recommended "No live score counter anywhere in the UI" (design line 1424) [VERIFIABLE][^3]. The owner chose incremental scoring anyway, accepting that risk (line 1326) [VERIFIABLE][^3]. The measured effect behind the concern is task completion preference. Under heavier workload, physicians favoured easy tasks, which looked like higher throughput until complexity was adjusted for, and then it was lower [VERIFIABLE][^27]. The same mechanism threatens a count-based progress bar, so leg 1's estimate-weighted progress with a count fallback is the safer default [INFERENCE][^19].

The safeguards that are worth keeping are independent of the score [INFERENCE]:

1. Every computed number explains itself. The old "Why am I seeing this?" rule matches leg 2's rule [VERIFIABLE][^9][^20].
2. Weekly, the owner judges whether the numbers match reality. The old qualitative check-in "Was your score accurate to how you feel" becomes "Does this progress match how the goal feels?", which is the new health check-in [VERIFIABLE][^3][^19].
3. Absences never create a deficit. A paused goal or a quiet week must not show as failure [VERIFIABLE][^3].
4. Agent-written text about goals passes the old phrase checks for controlling and loss-framed language. The archived `check_ethical_compliance` holds such a list [VERIFIABLE][^16].

### Achievements

The rarity tiers have no evidence base; the R-48 document says so itself [VERIFIABLE][^11]. Its recovery-over-streak ranking is a sound idea and maps onto the new lifecycle's re-engagement step [INFERENCE][^20]. Nothing else in the achievement layer should return [INFERENCE].

### The priority scoring engine

The engine's step multiplier scales from 1x to 15x as a deadline nears, so an overdue P3 (weight 1, times 15) outranks a P0 with no date (weight 10) [VERIFIABLE][^5][^15]. Leg 2 cites the mere-urgency effect against this kind of ordering [VERIFIABLE][^20]. Alister and colleagues (2024) add that under limited time and load, people "disproportionately" weigh deadline information when prioritising goals [VERIFIABLE][^28]. A scorer that multiplies by urgency builds that bias in. WSJF's additive time criticality is the better form, and the old engine should not be reused [INFERENCE][^20].

The engine also recomputed daily on a timer, and guidance used a four-hour cache [VERIFIABLE][^5][^15]. Both conflict with the ask's event-based rule; the new research recomputes on change events [VERIFIABLE][^20].

## 4. Failure analysis

The first system was built from March to April 2026 and never ran on Beads data. Six causes are measurable in the compile.

1. Split ownership of one relationship. Tasks became Beads-owned while `goals` and `goal_tasks` stayed in the ai-core database. On Postgres, `get_goal` returns `tasks = []` and `progress = 0.0`, with a comment that the join "cannot run cross-engine" [VERIFIABLE][^13]. The guidance service raises `TaskProjectionUnavailableError` [VERIFIABLE][^15]. Five goal tools ran raw `SELECT ... FROM tasks` against a different Postgres `tasks` table owned by another layer, and the retirement inventory flagged this as a "Trap for a later executor" [VERIFIABLE][^6].
2. A silent zero. Returning empty linkage instead of an error made a broken join look like a goal with no progress. The reference doc warns against "treating empty linkage as measured progress" [VERIFIABLE][^1][^13].
3. No links to count. The local `goal_tasks` held 0 rows at both inventory dates, and `task_links` went from 1 to 0 [VERIFIABLE][^6]. The Postgres linkage was not measured in the compile, so this packet cannot say whether goals were ever linked in production [NO SOURCE].
4. Breadth before a working core. The daily-scoring build was rated XL: ten MCP tools, achievements, narrative, UI and integrations [VERIFIABLE][^3][^4]. Every axis depended on goal links, difficulty tags and completion events, and none of these was reliable [VERIFIABLE][^14]. The plan gated only at a final UAT [VERIFIABLE][^4].
5. Wrong completion events. "Completed on date D" meant `status = 'done' AND date(updated_at) = D`, so any later edit to a closed task moves its completion day [VERIFIABLE][^14]. `confirm_provisional_task` sets `status = 'done'` at confirmation time, so confirmed work counts on the confirmation day. The plan wanted it included "retroactively" [VERIFIABLE][^4][^14].
6. Design-to-code drift with no parity check. The code applies diminishing returns on the effort axis, while DD-14 puts them on strategic alignment. The gate-approval multiplier is defined and never called. The "P0 is blocked" escape hatch is absent [VERIFIABLE][^3][^14]. The UI promised drag-to-rerank, which the list template does not implement [VERIFIABLE][^1]. The app factory now refuses to start [VERIFIABLE][^1][^12].

The retirement inventory supplies the general lesson: "identify actual callers and verify replacement behavior before retiring a data path" [VERIFIABLE][^1][^6]. Here the goals subsystem was ruled out of scope for the task-table retirement, and no one owned goal-to-task parity afterwards [VERIFIABLE][^6].

What the new design must do differently [INFERENCE]:

- Store goals as Beads issues and links as Beads edges in the same store as the work. Then there is no cross-store join. Leg 3's privacy rule keeps private goals in a private store, and each store is still self-contained [^20][^21].
- Make "unknown" a distinct state. A goal with no members, a store that cannot be read, or a projection that is not ready must show as "no data", never 0%.
- Derive completion from Beads `closed_at`, which exists among the 56 `issues` columns, never from `updated_at` [^22].
- Ship a thin vertical first: goal type, membership links, progress from members and one view. Then add alignment and allocation.
- Give each formula a parity test against the design's worked examples. Leg 2's worked example of the alignment score is such a fixture [^20].
- Recompute on events (link, close, check-in, goal state change), never on a timer [^20].

## 5. Algorithms worth re-specifying

These behaviours are worth specifying afresh. They are described as behaviour; none of the archived code should be imported [VERIFIABLE][^12].

### Rank maintenance

Active goals hold ranks $1..N$ with no gaps and no ties. Moving a goal from rank $r_0$ to $r_1$ shifts every goal between them by one in a single transaction. Paused, achieved and dropped goals leave the order, and the rest close up. Nothing auto-promotes [VERIFIABLE][^2][^13].

### Exponential moving average with a half-life

The archive converts a half-life $h$ in periods into a smoothing factor:

$$
\alpha = 1 - 2^{-1/h}, \qquad E_t = \alpha\, x_t + (1-\alpha)\, E_{t-1}
$$

[VERIFIABLE][^14]. This is the right way to express a trailing window in leg 2's allocation factor if a smooth window is preferred to a hard cut-off [INFERENCE][^20].

### Regime-change prompt

The archive flags a possible regime change when $E^{(7)}_t < 0.6\, E^{(30)}_t$ for five consecutive days. It recommends recalibration and never resets on its own [VERIFIABLE][^11][^14]. The design called the 0.6 and 5 "starting guesses" and noted that the rule misses gradual drift and oscillation [VERIFIABLE][^3]. A version of this trigger fits leg 2's allocation factor, which the leg warns can oscillate: prompt a review of a goal's target share when its actual share stays far below target. Never move the target automatically [INFERENCE][^20].

### Diminishing returns for off-priority work

When a P0 is open, a closed P3 counts 0.5, a P2 0.7 and a P1 0.85. Each further consecutive low-priority close loses 0.2 more, down to a floor of 0.1 [VERIFIABLE][^14]. The design wanted an exemption while the P0 is blocked [VERIFIABLE][^3]. The new ordering by $S_i$ already prefers higher work up front. A retrospective "off-priority share" line in reviews keeps the signal without a penalty, provided it excludes periods when every higher item was blocked [INFERENCE].

### Difficulty as owner cost

The seven-factor rubric scores design review, research burden, implementation iteration, token impact, cross-project scope, ambiguity and dependency depth, each from 1 to 3. The total maps 7 to 10 to low, 11 to 15 to medium and 16 to 21 to high [VERIFIABLE][^4][^14]. Manual overrides are never overwritten, and the per-factor breakdown is stored so that an override is informed [VERIFIABLE][^3][^4]. This is a candidate for the person-pool effort measure (R6) [INFERENCE].

### Provisional confirmation

Records inferred from session activity are created as provisional. They are visible but flagged, they are excluded from every computed number until confirmed, and they expire if unconfirmed [VERIFIABLE][^4]. The new design should keep the work's own date on confirmation, which the archive did not (§4) [INFERENCE]. The same states fit agent-proposed goal links [INFERENCE][^20].

### Link suggestion

The archive matched task-title keywords, minus stop words, against active goal titles and summaries. It skipped existing links, returned at most five, and never applied any [VERIFIABLE][^13]. The contract carries over: ranked, capped, never applied without review [INFERENCE].

### Activation-barrier signals

The narrative service flagged a P0 open two or more days, and four or more of the last five closes being low difficulty [VERIFIABLE][^16]. These are cheap, explainable review signals. The suggestion text ("Start with just the first 15 minutes") is an implementation-intention prompt, which leg 2's evidence supports [INFERENCE][^20].

Signal strength, $S = I \cdot U \cdot R \cdot G / D^2$, is not worth re-specifying [VERIFIABLE][^15]. Its urgency term has the §3 problem, and its recency term pushes neglected work further down [INFERENCE].

## 6. Privacy lessons from the compile's scrub

1. Documents followed code into shared repositories. Both legacy designs carry the note that the doc "followed its implementation into this repo" from the owner's private archive [VERIFIABLE][^2][^3]. That move is how personal goal content reached a shared repository. A goal document's home must follow its privacy marking, never the location of the code it describes [INFERENCE][^21].
2. Scrubbing is lossy and inconsistent. The amendment sweep made 27 line-level scrubs and seven stubs, with one item left for an owner decision [VERIFIABLE][^1]. In the retirement inventory, one placeholder phrase replaces many different referents, including file paths inside commands. That leaves sections such as its backup verification table hard to read [VERIFIABLE][^6]. This run also found that one term redacted as a personal detail in the daily-scoring design appears 11 times across five other compiled files. The term is not reproduced here, and the file list is flagged below. Scrubbing after the fact cannot be the control [INFERENCE].
3. The guard's own rules are private content. The sweep left one policy rule file unchanged "because the rule must name the identifier it removes" [VERIFIABLE][^1]. This corroborates leg 3's gaps item 6: term lists and fixtures must live on the private side or be synthetic [VERIFIABLE][^21].
4. A model call is a leak path. The archived vision check built a prompt from every open task title and a vision statement, then ran an external model command line [VERIFIABLE][^15]. Leg 3 names model providers as a path the ask does not mention [VERIFIABLE][^21]. The goals design should say that private goal text never enters a prompt on a host whose class forbids the record [INFERENCE].
5. Audience is not placement. The old per-goal visibility (private, friends-only, public) was about who sees a goal inside one store [VERIFIABLE][^3]. Leg 3's marking is about which store may hold it [VERIFIABLE][^21]. Reusing the old field names would invite the wrong reading [INFERENCE].
6. History stays. The reference doc says "Scrubbing a working copy does not remove earlier git history" and leaves a rewrite to the owner [VERIFIABLE][^1]. Leg 3 records the owner's ruling on commit history and flags that it may not cover the Beads store's Dolt history [VERIFIABLE][^21].

## 7. Founding-ask requirements in the prior work

The prior work narrowed or deferred most of the goals clauses the founding ask names. The new research restores them, so the prior work offers patterns, not coverage.

| Founding-ask goals requirement | Prior work | New research | Status after the fold-in |
|---|---|---|---|
| Goal as "the chief most possible parent beads task type" | Goals above tasks, flat; hierarchy deferred [^2] | Aspiration and objective above epics [^20] | Kept by the new research |
| Zero, one or many goals per issue | Many-to-many, optional [^2] | Same [^20] | Kept |
| "relates to and dependencies and blocks" between goals | No goal-to-goal links [^2] | `refines`, `blocks`, `relates-to`, conflicts [^20] | Kept by the new research |
| Start, end and due dates | `target_date` only [^2] | Three dates plus resolution [^20] | Kept by the new research |
| Hierarchical linked graph, Gantt, timeline | None; "life roadmap graph" deferred [^2] | React Flow graph, custom SVG timeline [^18] | Kept by the new research |
| View goals by priority | Ranked list [^2] | Priority-led views [^20] | Kept; R1 adds an ordered rank |
| Prioritise the person's and the agents' work | One goal boost for all tasks [^15] | Per-pool alignment [^20] | Kept; R4 and R6 extend it |
| Privacy guard keeping private goals out of shared repos | Audience flag only; leaks happened [^1][^3] | Placement guards [^21] | Kept; §6 adds lessons |

No goals requirement is dropped by any recommendation in this packet [INFERENCE].

## Recommendations for the design

### R1. Goal ordering

Option (a): Beads `priority` 0 to 4 only, as the new research proposes.

**Pros:**
- No new field; the alignment weight $\pi(p)$ reads it directly.
- Ties express "equally important" without forcing a choice.

**Cons:**
- No remedy for priority inflation, which leg 2 lists as a failure mode.
- The ask's "view goals organizationally based on priority" gets coarse buckets only.

Option (b): a unique rank only, as the old design had.

**Pros:**
- Forces the tradeoff explicitly.
- A drag-to-reorder list is simple to build and use.

**Cons:**
- Strict prioritisation raised negative affect and perceived conflict [VERIFIABLE][^29].
- A rank change would reorder agent queues across the fleet at once.

Option (c): priority 0 to 4 for weight, plus an optional unique order among active objectives. The order is used for display, ties and the "one goal this week" view, and the review asks "still in the right order?"

**Pros:**
- Keeps $\pi(p)$ stable while giving a total order where wanted.
- Conner and colleagues found prioritisation helped behaviour change without hurting the other behaviours [VERIFIABLE][^30].

**Cons:**
- Two ordering signals to explain.

Recommendation: (c), with lenient framing ("your order right now"). Deciding criterion: a structural fix for priority inflation that does not make a strict ranking the source of weight. Confidence: medium. [INFERENCE]

### R2. Daily score, achievements and narrative

Option (a): none in the first release. Map the owner's intents to informational signals (§3).

**Pros:**
- Matches leg 2's D7 and the old research's own novelty-cliff finding.
- Removes the subsystem that drifted most from its design.

**Cons:**
- Departs from a scoring design the owner approved in April 2026.

Option (b): a score as an optional derived view, off by default, versioned, end-of-day only.

**Pros:**
- Honours the earlier approval and keeps the score-free principle.

**Cons:**
- Needs difficulty and completion data the first release will not have.
- Every Goodhart risk the old design listed returns.

Option (c): restore the old three-axis score and achievements.

**Pros:**
- Most of the design work is done.

**Cons:**
- Its code diverged from its design in three places, and its premises (rank multipliers, difficulty tags) do not exist in Beads.

Recommendation: (a), recorded as an explicit design decision so the owner sees it at the design review gate. Deciding criterion: the founding ask names alignment and prioritisation, not a score, and the evidence on points and streaks is negative. Confidence: medium-high. [INFERENCE]

### R3. Milestones

Option (a): `make` and `help` only.

**Pros:**
- Smallest model.

**Cons:**
- Loses named checkpoints, which the timeline and phase views need.

Option (b): milestones as Beads `milestone`-type issues under an objective, linked with `make`. They are drawn as markers on the timeline, and progress can be measured by milestones.

**Pros:**
- Uses a built-in type [VERIFIABLE][^20].
- Matches Asana's `project_milestone_completion` progress source [VERIFIABLE][^19].

**Cons:**
- One more type to explain.

Option (c): a third contribution strength, `milestone`.

**Pros:**
- Mirrors the old model.

**Cons:**
- Mixes "how much this helps" with "this is a checkpoint".

Recommendation: (b). Deciding criterion: the timeline needs checkpoints as items with dates, not as edge weights. Confidence: medium. [INFERENCE]

### R4. Alignment through blockers

Option (a): the current formula, which follows only `contributes-to` and `parent-child` paths.

**Pros:**
- Already specified, with a worked example.

**Cons:**
- A decision or review that blocks goal-serving agent work gets no alignment boost unless linked by hand.
- The old design's strongest owner intent (DD-13, credit for unblocking) goes unserved.

Option (b): also follow `blocks` edges backwards. A blocker inherits a damped share of the alignment of what it blocks, for example $c_{b,g} = \delta \max_{i \in \text{blocked}(b)} c_{i,g}$ with $\delta = 0.5$.

**Pros:**
- Orders the person's review queue by the goals it unblocks, which is the ask's review workflow.
- Needs no new links.

**Cons:**
- Another constant to calibrate.
- An agent could create blocking edges to raise an item, so blocks added by agents need the same review as their links.

Option (c): rely on WSJF's unblock term.

**Pros:**
- No change to alignment.

**Cons:**
- The unblock term counts dependents and ignores which goals they serve.

Recommendation: (b). Deciding criterion: the person's most leveraged work is unblocking agents, and the old owner feedback said so explicitly. Confidence: medium. [INFERENCE]

### R5. Completion events

Option (a): Beads `closed_at` and the issue event history.

**Pros:**
- An immutable close time; reopen and close events are visible.

**Cons:**
- Needs care for reopened issues.

Option (b): `updated_at`, as the archive did.

**Pros:**
- Always present.

**Cons:**
- Any edit after close moves the completion day (§4).

Recommendation: (a). Deciding criterion: a progress number must not move when nothing was completed. Confidence: high. [VERIFIABLE][^14][^22]

### R6. Effort measure for the person's pool

Option (a): `estimated_minutes` for both pools, as leg 2 proposes.

**Pros:**
- One field.

**Cons:**
- For agent work it measures agent time, which the owner called "not really difficult for me".

Option (b): an optional attention-cost estimate for the person's pool, from a reduced version of the old seven-factor rubric, falling back to counts.

**Pros:**
- Measures what the owner spends on each item: review, decisions and token budget.

**Cons:**
- A second estimate to maintain; the rubric is untested.

Option (c): counts only for the person's pool.

**Pros:**
- No estimation.

**Cons:**
- Overweights small items, as leg 2's failure mode 6 says.

Recommendation: (b), inactive until the owner sets a person-pool target share. Deciding criterion: the allocation factor is only meaningful if it measures the owner's scarce resource. Confidence: low-medium. [INFERENCE]

### R7. The label for a stopped goal

Option (a): show `dropped`.

**Pros:**
- Matches the stored state.

**Cons:**
- The old research argued that "abandoned" language invites shame and avoidance; "dropped" is close to it [VERIFIABLE][^7].

Option (b): store `dropped` with a reason and successor, and show "Archived" with the reason.

**Pros:**
- Keeps the new semantics and the old copy rule.

**Cons:**
- The stored and displayed names differ.

Recommendation: (b). Deciding criterion: the shame argument is about copy, not state. Confidence: low; it rests on inference from SDT, not a test. [INFERENCE]

### R8. Reuse path for the prior work

Option A in the reference doc is to start from scratch. Option B maps selected concepts onto Beads with scores as a derived view. Option C adapts archived services. Option D reuses the research only [VERIFIABLE][^1].

**Pros (B):**
- Matches legs 1 to 3, which already model goals as Beads issues.
- Avoids the cross-store join that failed.

**Cons (B):**
- Needs the field and edge gaps leg 1 lists to be settled first.

**Pros (C):**
- Concrete algorithms to compare against.

**Cons (C):**
- The services embed raw SQL against retired tables, and the archive is not importable by its own rules.

Recommendation: B, with §5's behaviours re-specified and parity-tested. Deciding criterion: reuse ideas, never code tied to a retired store. Confidence: high. [INFERENCE]

### R9. Scrub-consistency regression check

Option (a): prevention only, through leg 3's guards.

**Pros:**
- No private term list on any shared host.

**Cons:**
- Existing scrubbed copies stay inconsistent (§6 item 2).

Option (b): prevention plus a check, run only on a personal host, that every redacted term in one compiled file is absent from all others.

**Pros:**
- Catches the cross-file case this run found.

**Cons:**
- The term list must live in the private repo, as leg 3 requires.

Recommendation: (b), added to leg 3's periodic scan. Deciding criterion: the inconsistency is already present and was found by accident. Confidence: medium. [INFERENCE]

## Gaps, blindspots & emergent findings

1. Open goals for creative or exploratory work. Leg 2's D3 requires a target or a done definition on every objective. Pietsch and colleagues (2024, pre-registered, N = 247) found no meaningful difference in creative performance between SMART, do-your-best and open goals [VERIFIABLE][^24]. The old research had already said the system "should support both specific and open-ended goal formats" [VERIFIABLE][^7]. Next question: should a `learning` or exploratory objective accept an open target, with check-ins as its only progress? Answerable here: yes, as a design call; leg 2's orientation flag is the natural place [INFERENCE].
2. Weak nudge evidence in the prior docs. The old research leaned on Mertens and colleagues' d = 0.43 for progress bars and nudges [VERIFIABLE][^7][^10]. Maier and colleagues re-analysed that work and published "No evidence for nudging after adjusting for publication bias" [VERIFIABLE][^25]. Progress display rests better on Harkin's monitoring meta-analysis, which leg 2 uses [VERIFIABLE][^20].
3. Goal conflict evidence. Leg 2 could not read Gray and colleagues' goal-conflict meta-analysis [VERIFIABLE][^20]. Its metadata is confirmed here (Journal of Research in Personality 66, pp. 27 to 37) [VERIFIABLE][^26]. The pooled r = .34 with k = 54 comes from the prior research and was not readable in this run either [NO SOURCE]. It still supports the conflict link (leg 2's D12) and a goal-count warning that counts conflicts, not goals [INFERENCE].
4. The old design's person-facing focus pick. At session start it showed the top three goals and an AI recommendation of one goal with up to three tasks [VERIFIABLE][^2]. The new research gives agents goal context at claim time but has no person-facing equivalent [VERIFIABLE][^20]. In the web app this would be a "focus" panel computed on events. Whether it belongs in the review queue or a separate view is a design question [INFERENCE].
5. Document links. The old `goal_docs` table linked plans and research to goals, and the owner resolved that "Core entities (docs, research, tasks) should be linkable to goals" [VERIFIABLE][^2]. Neither the new ontology nor leg 1's Beads gap table names a document link [VERIFIABLE][^19][^20]. Whether Beads 1.3.2 has a field for an external document reference was not measured in this run [NO SOURCE]. Fallback: a list in `metadata.goal` [INFERENCE].
6. The empty-goal rule. The old design nudged a goal with no links after a seven-day grace [VERIFIABLE][^2]. Combined with §4's "unknown is not zero", this gives the goal views a third state besides on-track and stalled: "not yet connected" [INFERENCE].
7. Prior citations need checking before reuse. Besides the misattributions in the Summary, the achievement research credits "Fitts's Law and the Keystroke-Level Model" with showing that each form field "exponentially" raises abandonment, citing no study [VERIFIABLE][^11]. The goal-psychology research's "performance differences exceeding 250%" was not traced to a passage in this run [NO SOURCE]. A design that cites prior-work numbers should re-verify each one [INFERENCE].
8. Anchor-bias check. The brief leans on scoring, the bulk of the prior pages. I weighted the failure analysis and goal model more. R4 and R6 were not asked for; both came from the owner's earlier feedback [INFERENCE].
9. Not covered: the earlier `humanware` copies, two shared migrations and most templates (I relied on the reference doc for templates). The live session-goal tooling is a different feature. The issue appendix holds private tracker ids and was not used [NO SOURCE].
10. Unresolvable by design. The old goal records are redacted, so whether the owner's goals fit two levels and two kinds cannot be tested here, and must not be inferred [NO SOURCE].

## Flagged for the coordinator

1. Scrub inconsistency in the compile. One term that `docs/designs/legacy-goal-system--daily-scoring-system.md` redacts as a personal detail (its AI-mechanics section) appears unredacted in five other compiled ai-harness files, 11 times in total. The files are `docs/plans/legacy-goal-system--daily-scoring-system-plan.md` (1), `docs/research/legacy-goal-system--gamification-scoring-psychology.md` (2), `docs/research/legacy-goal-system--gamification-scoring-synthesis.md` (3), `archive/goal-system/ai-core/src/ai_core/services/narrative.py` (4) and `archive/goal-system/ai-core/src/ai_core/services/guidance.py` (1). The research uses may be general-topic text, not personal, so whether each occurrence is private is a judgement for the compile's owner. I could not fix it (ai-harness is read-only to me) or file it (no Beads writes in this run). The term is withheld here because beads-ui is public. Measured with a case-insensitive count over the compiled docs and the archive at ai-harness `d79603123c8`.
2. The scoring stance against a prior owner-approved design. R2 recommends no daily score, although the owner approved one in April 2026. This is not a founding-ask requirement, so it does not fail Gate 0. The founding ask says "prioritizing my take and agentic ai work towards them appropriately". The prior design's owner feedback says "a tool in service of goals, not something existing to drive engagement for the sake of it" (`docs/designs/legacy-goal-system--daily-scoring-system.md`, line 1270). Recommendation: record it as an explicit decision in the design doc so it surfaces at the owner's review gate.
3. R1 (an ordered rank beside priority) and R4 (alignment through `blocks` edges) change leg 2's ontology and formula. Both are AI-decidable design calls with the evidence above. They need the design author's ruling, not the owner's.
4. The synthesis has a `<!-- section-9-slot -->` placeholder for prior work, and its §3 and Open Question 5 point to §9 (`docs/research/goals-system.md`, lines 124, 269 and 314). This packet supplies that content.

## Files read

ai-harness, at `d79603123c8` (the compile landed in `3ebb6f3cf60`, PR #6182):

- `docs/analysis/legacy-goal-system--prior-work-reference.md` (full)
- `docs/analysis/legacy-goal-system--t13-task-api-retirement-inventory.md` (full)
- `docs/designs/legacy-goal-system--goals-system.md` (full)
- `docs/designs/legacy-goal-system--daily-scoring-system.md` (full)
- `docs/designs/legacy-goal-system--priority-scoring-engine.md` (full)
- `docs/plans/legacy-goal-system--daily-scoring-system-plan.md` (full)
- `docs/research/legacy-goal-system--goal-psychology-planning.md` (full)
- `docs/research/legacy-goal-system--gamification-scoring-synthesis.md` (full)
- `docs/research/legacy-goal-system--achievement-tier-psychology.md` (full)
- `docs/research/legacy-goal-system--gamification-gap-analysis.md` (full)
- `docs/research/legacy-goal-system--gamification-scoring-psychology.md` (sections 1, 7, 8, 10, headings)
- `archive/goal-system/README.md`; `archive/goal-system/ai-core/src/ai_core/services/{goals,scoring,guidance,narrative}.py` (outlines plus the functions cited); `archive/goal-system/ai-core/src/ai_core/dbx/tables.py` (goal tables and indexes); `archive/goal-system/ai-core/alembic/versions/0012_goals_tags_jsonb.py` (docstring)

beads-ui, at `3cb5987`:

- `docs/research/goals-system.md` (full)
- `docs/research/findings/goals-science-ontology-and-alignment.md` (lines 1 to 699)
- `docs/research/findings/goals-products-and-visualisation-landscape.md` (Summary, sections 5 and 6, R4, R5, Gaps, Flagged)
- `docs/research/findings/goals-privacy-and-access-control.md` (Summary, section 1, sections 5 and 6, Gaps, Flagged)
- `docs/research/findings/evidence/goals-visualisation-measurements-2026-10-28.md` (line 71)

## Sources

[^1]: ai-harness. (2026). *Legacy goal system prior work reference* (`docs/analysis/legacy-goal-system--prior-work-reference.md`), lines 56 to 248 and 750 to 784. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/analysis/legacy-goal-system--prior-work-reference.md).
[^2]: ai-harness. (2026). *Legacy goal system: Goals System* (`docs/designs/legacy-goal-system--goals-system.md`), lines 11 to 17, 62 to 135, 156 to 183, 234 to 298, 325 to 340 and 355 to 362. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/designs/legacy-goal-system--goals-system.md).
[^3]: ai-harness. (2026). *Legacy goal system: Daily Scoring System* (`docs/designs/legacy-goal-system--daily-scoring-system.md`), lines 11 to 15, 96 to 250, 366 to 387, 444 to 510, 692 to 744, 1072 to 1188, 1255 to 1302, 1321 to 1335 and 1388 to 1424. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/designs/legacy-goal-system--daily-scoring-system.md).
[^4]: ai-harness. (2026). *Legacy goal system: Daily Scoring System, Implementation Plan* (`docs/plans/legacy-goal-system--daily-scoring-system-plan.md`), lines 15, 101 to 124, 325 to 389 and 393 to 407. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/plans/legacy-goal-system--daily-scoring-system-plan.md).
[^5]: ai-harness. (2026). *Legacy goal system: Priority Scoring Engine* (`docs/designs/legacy-goal-system--priority-scoring-engine.md`), lines 15 to 39. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/designs/legacy-goal-system--priority-scoring-engine.md).
[^6]: ai-harness. (2026). *Legacy goal system: Task-API Retirement Inventory* (`docs/analysis/legacy-goal-system--t13-task-api-retirement-inventory.md`), lines 59 to 96, 107 to 160, 162 to 177 and § 9. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/analysis/legacy-goal-system--t13-task-api-retirement-inventory.md).
[^7]: ai-harness. (2026). *Legacy goal system: Goal Psychology, Planning, and UI Design* (`docs/research/legacy-goal-system--goal-psychology-planning.md`), lines 33 to 37, 79 to 123, 139 to 151, 159 to 162, 203 to 252, 303 to 321 and 398 to 416. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/legacy-goal-system--goal-psychology-planning.md).
[^8]: ai-harness. (2026). *Legacy goal system: Gamification Psychology, Scoring Systems & AI-Powered Engagement* (`docs/research/legacy-goal-system--gamification-scoring-psychology.md`), lines 23 and 47 to 49. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/legacy-goal-system--gamification-scoring-psychology.md).
[^9]: ai-harness. (2026). *Legacy goal system: Gamification Gap Analysis* (`docs/research/legacy-goal-system--gamification-gap-analysis.md`), lines 105 to 115, 193 to 198 and 336 to 345. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/legacy-goal-system--gamification-gap-analysis.md).
[^10]: ai-harness. (2026). *Legacy goal system: Gamification & Scoring Research Synthesis* (`docs/research/legacy-goal-system--gamification-scoring-synthesis.md`), lines 70 to 76 and 329 to 339. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/legacy-goal-system--gamification-scoring-synthesis.md).
[^11]: ai-harness. (2026). *Legacy goal system: Achievement Tier Psychology & Daily Scoring Open Questions* (`docs/research/legacy-goal-system--achievement-tier-psychology.md`), lines 17, 27 to 68 and 84 to 87. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/legacy-goal-system--achievement-tier-psychology.md).
[^12]: ai-harness. (2026). *Legacy goal system code archive* (`archive/goal-system/README.md`), lines 1 to 28. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/archive/goal-system/README.md).
[^13]: ai-harness. (2026). Archived goal service (`archive/goal-system/ai-core/src/ai_core/services/goals.py`), lines 84 to 95, 275 to 337, 370 to 421 and 534 to 603. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/archive/goal-system/ai-core/src/ai_core/services/goals.py).
[^14]: ai-harness. (2026). Archived scoring service (`archive/goal-system/ai-core/src/ai_core/services/scoring.py`), lines 43 to 65, 73 to 180, 231 to 333, 340 to 371 and 446 to 453. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/archive/goal-system/ai-core/src/ai_core/services/scoring.py).
[^15]: ai-harness. (2026). Archived guidance service (`archive/goal-system/ai-core/src/ai_core/services/guidance.py`), lines 18 to 79, 99 to 103, 274 to 338 and 348 to 440. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/archive/goal-system/ai-core/src/ai_core/services/guidance.py).
[^16]: ai-harness. (2026). Archived narrative service (`archive/goal-system/ai-core/src/ai_core/services/narrative.py`), lines 279 to 355. Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/archive/goal-system/ai-core/src/ai_core/services/narrative.py).
[^17]: ai-harness. (2026). Archived goal schema (`archive/goal-system/ai-core/src/ai_core/dbx/tables.py`, lines 100 to 156 and 306 to 314) and tags migration (`archive/goal-system/ai-core/alembic/versions/0012_goals_tags_jsonb.py`, docstring). Read at `d79603123c8`. [Gated link](https://github.com/sergeiwallace/ai-harness/blob/main/archive/goal-system/ai-core/src/ai_core/dbx/tables.py).
[^18]: beads-ui. (2026). [A goals system above epics, stories and tasks](../goals-system.md) (`docs/research/goals-system.md`), lines 86 to 314. Read at `3cb5987`, 2026-10-28. Online: [goals-system.md](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/goals-system.md).
[^19]: beads-ui. (2026). [Goals research leg 1: goal products and visualisation landscape](goals-products-and-visualisation-landscape.md) (`docs/research/findings/goals-products-and-visualisation-landscape.md`), Summary, § 5 and R4 to R5. Read at `3cb5987`, 2026-10-28. Online: [goals-products-and-visualisation-landscape.md](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/goals-products-and-visualisation-landscape.md).
[^20]: beads-ui. (2026). [Goals research leg 2: goal science, ontology and alignment](goals-science-ontology-and-alignment.md) (`docs/research/findings/goals-science-ontology-and-alignment.md`), lines 18 to 29, 209 to 398 and 400 to 699. Read at `3cb5987`, 2026-10-28. Online: [goals-science-ontology-and-alignment.md](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/goals-science-ontology-and-alignment.md).
[^21]: beads-ui. (2026). [Goals research leg 3: private-goal privacy and access control](goals-privacy-and-access-control.md) (`docs/research/findings/goals-privacy-and-access-control.md`), Summary, §§ 1, 5 and 6, Gaps items 5 to 7. Read at `3cb5987`, 2026-10-28. Online: [goals-privacy-and-access-control.md](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/goals-privacy-and-access-control.md).
[^22]: beads-ui. (2026). [Measurements behind the goals visualisation findings](evidence/goals-visualisation-measurements-2026-10-28.md) (`docs/research/findings/evidence/goals-visualisation-measurements-2026-10-28.md`), line 71 (`issues` columns include `closed_at`). Read at `3cb5987`, 2026-10-28. Online: [goals-visualisation-measurements-2026-10-28.md](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/evidence/goals-visualisation-measurements-2026-10-28.md).
[^23]: Rodrigues, L., Pereira, F. D., Toda, A. M., Palomino, P. T., Pessoa, M., Carvalho, L. S. G., Fernandes, D., Oliveira, E. H. T., Cristea, A. I., & Isotani, S. (2022). Gamification suffers from the novelty effect but benefits from the familiarization effect: Findings from a longitudinal study. *International Journal of Educational Technology in Higher Education*. [doi:10.1186/s41239-021-00314-6](https://doi.org/10.1186/s41239-021-00314-6). Metadata confirmed via the Crossref API, 2026-10-28.
[^24]: Pietsch, S., Riddell, H., Semmler, C., Ntoumanis, N., & Gucciardi, D. F. (2024). SMART goals are no more effective for creative performance than do-your-best goals or non-specific, exploratory "open goals". *Educational Psychology, 44*. [doi:10.1080/01443410.2024.2420818](https://doi.org/10.1080/01443410.2024.2420818). Metadata via the Crossref API and abstract via the OpenAlex API, 2026-10-28.
[^25]: Maier, M., Bartoš, F., Stanley, T. D., Shanks, D. R., Harris, A. J. L., & Wagenmakers, E.-J. (2022). No evidence for nudging after adjusting for publication bias. *Proceedings of the National Academy of Sciences, 119*(31). [doi:10.1073/pnas.2200300119](https://doi.org/10.1073/pnas.2200300119). Metadata confirmed via the Crossref API, 2026-10-28; abstract not available through OpenAlex, so only the title's claim is used.
[^26]: Gray, J. S., Ozer, D. J., & Rosenthal, R. (2017). Goal conflict and psychological well-being: A meta-analysis. *Journal of Research in Personality, 66*, 27–37. [doi:10.1016/j.jrp.2016.12.003](https://doi.org/10.1016/j.jrp.2016.12.003). Metadata confirmed via the Crossref and OpenAlex APIs, 2026-10-28; abstract not available, so effect sizes are unverified here.
[^27]: KC, D. S., Staats, B. R., Kouchaki, M., & Gino, F. (2020). Task selection and workload: A focus on completing easy tasks hurts performance. *Management Science, 66*(10), 4397–4416. [doi:10.1287/mnsc.2019.3419](https://doi.org/10.1287/mnsc.2019.3419). Metadata via the Crossref API and abstract via the OpenAlex API, 2026-10-28.
[^28]: Alister, M., Herbert, S. L., Sewell, D. K., Neal, A., & Ballard, T. (2024). The impact of cognitive resource constraints on goal prioritization. *Cognitive Psychology, 148*, 101618. [doi:10.1016/j.cogpsych.2023.101618](https://doi.org/10.1016/j.cogpsych.2023.101618). Metadata via the Crossref API and abstract via the OpenAlex API, 2026-10-28.
[^29]: Freund, A. M., & Tomasik, M. J. (2021). Managing conflicting goals through prioritization? The role of age and relative goal importance. *PLOS ONE, 16*(2), e0247047. [doi:10.1371/journal.pone.0247047](https://doi.org/10.1371/journal.pone.0247047). Metadata via the Crossref API and abstract via the OpenAlex API, 2026-10-28.
[^30]: Conner, M., Wilding, S., Prestwich, A., Hutter, R., Hurling, R., van Harreveld, F., Abraham, C., & Sheeran, P. (2022). Goal prioritization and behavior change: Evaluation of an intervention for multiple health behaviors. *Health Psychology, 41*(5). [doi:10.1037/hea0001149](https://doi.org/10.1037/hea0001149). Metadata via the Crossref API and abstract via the OpenAlex API, 2026-10-28 (N = 1,802; prioritisation did not lower non-prioritised behaviours).
