---
title: "Verification of the goals system research doc, 2026-10-28"
category: research
tags: [research-evidence, beads-ui, goals, verification, provenance, privacy]
status: complete
source: "claude-opus-5-5-2026-10-28"
task: BU-ylx.11.1.5
display_id: BU-agent-verify-goals-grmj
---

# Verification of the goals system research doc, 2026-10-28

This file verifies `docs/research/goals-system.md` (548 lines, 59 footnote definitions) at beads-ui `main` `4a3a17c` against the founding ask record A001, the four goals findings files and their three evidence files, the decided `docs/designs/beads-ui-design.md`, and the sources the doc cites. Prior-work and harness paths were read from the ai-harness object store at `origin/main` `6c4b1bb68b8`, as it stood locally without a fetch. The reviewer is the same model family as the author (Claude), so this is a same-family review.

Every MUST-FIX item below names its location in the doc. Items are sorted into MUST-FIX, WORTH-CONSIDERING and TAKE-IT-OR-LEAVE-IT. Confidence is high unless stated.

## A. Research-to-doc gap review

| Id | Open items |
|---|---|
| G1 | One. The ask's "view goals organizationally based on priority" maps in the coverage table to §2 and §7, but neither section describes a priority-ordered goal view. The products leg proposes one (a goal health board in priority order with health, progress, pace, staleness and blockers, `goals-products-and-visualisation-landscape.md` § 5 item 3), and the doc never carries it. |
| G2 | Four. (1) The ask's "start / end / due date fields": the doc models planned start and due only (§4 table row "Dates", §10 "When to use"); planned end is dropped, although the science leg keeps three dates and says merging end and due "would narrow the ask" (`goals-science-ontology-and-alignment.md` Gaps item 7, flag 3). (2) The ask's breadth clause ("the whole gamut ... breadth and depth"): the coverage row says "Covered", while the products leg's own coverage table says "Narrowed: sentiment and four vendors unreadable", and that leg also reports academic work on node-link readability and Gantt comprehension as not reached (Gaps item 7). The doc never states the visualisation-research gap. (3) The privacy leg's leak surfaces with Medium or higher ratings that §8 omits: public repositories (beads-ui itself, where goal fixtures and screenshots will be made), delegates and research legs, the employer model gateway, the transcript harvester, recall indexing, the agent read path and encrypted copies. (4) The privacy leg's rule that a goal-type record without a `shared` marking is refused in a shared store; §8's table refuses only "marked" records. |
| G3 | Three. (1) §9's two scholarly findings (the 2024 SMART-goals experiment and the strict-prioritisation study) cite only the fold-in findings file [^58]; the primary DOIs live in that file and are not in the doc's Sources. (2) "ELK is EPL-2.0" cites [^13]; the React Flow layouting page fetched this session does not state ELK's licence; the licence is in the evidence file behind [^14]. (3) "push-protection custom patterns need a Team or Enterprise plan" cites [^54]; that page states no plan requirement; [^55] does. |
| G4 | Two. (1) Open Questions 1, 4 and 5 are design choices and carry no `design-choice` label or reason; Open Questions 2 and 3 are owner rulings and are not labelled as such. (2) Open Question 1 and §10 offer "adding a custom edge kind" as an option. That is a researchable fact: `bd dep add --help` on Beads 1.3.2 lists a closed set of ten types and `bd config --help` documents `status.custom` and `types.custom` but no custom dependency type (measured this session). The option needs an upstream Beads change and should say so. |
| G5 | Open by construction. The doc records no critic pass: Ambiguous Items and the Provenance Ledger are both "(none yet)". The high and medium findings in section B below have no fix, evidence or concession in the doc yet. |
| G6 | Two. (1) The decided design's D-10 option (a), the chosen web stack, names "Frappe Gantt for the roadmap" (`docs/designs/beads-ui-design.md` line 1361). §6 recommends a custom SVG timeline on visx "shared with the beads-ui Phase 3 Roadmap" without saying that this amends D-10, and visx is not in D-10's stack, so the "no new dependency" framing in the §6 table applies to Recharts only. (2) §9 says keeping goals, work and links "in one Beads store ... removes that failure by construction", while §8 places private goals in a private store whose links point at work in shared stores. For any private goal served by shared work, the design recreates the cross-store join that §9 names as the first system's cause of failure. |

## B. Five-perspective critic pass

### Conventional

1. Medium. §5 and Executive Summary item 4 say unaligned work "keeps its rank". A multiplicative boost leaves an unaligned item's score unchanged but lowers its rank whenever aligned items gain. The science leg's own worked example shows it: "Refactor log formatting" has the highest WSJF composite (3.5) and drops from first to third. Fix: say "keeps its WSJF score and stays listed", or show the rank effect.
2. Low. React Flow with ELK or dagre, Recharts for allocation charts, and a hand-built Gantt where no permissive library has critical path all match mainstream practice; the citations bear them out (section D). No change warranted.

### Contrarian

3. High. The privacy design and §9's lesson pull in opposite directions (G6 item 2). A single owner who wants one goal graph, one Gantt and one critical path across private goals and shared work needs a cross-store join in the personal-pair web app server. The privacy leg names the cost under R4 (cycle checks and ready sets reimplemented across stores); the doc does not. The design inherits this unless the research says how the join reports "no data" when a store is unreadable and how cycle checks and critical path run across stores.
4. Medium. Executive Summary item 1 says Beads 1.3.2 "holds all of it today except edge weights, planned start dates and a conflict edge". §10 contradicts it: no membership edge kind ("the one data-model call this research cannot settle"), no progress, metric or health fields, one parent only, and no planned end date. Fix the summary to match §10.
5. Medium. §9 says the measurable target "stays optional", which reverses the science leg's high-confidence D3 (target required on objectives, with a free-text done definition as the escape) without saying so. The fold-in leg's evidence supports a narrower change: an open target for `learning` or exploratory objectives (fold-in Gaps item 1). §3's "When to use" still says to ask for a target. Pick one rule and state it in both places.

### Historical

6. Medium. §9 folds in the first goals system well, and its table matches the fold-in file except one row: "Milestone contribution ... add it as a third strength or a typed member". The fold-in leg recommends the typed member (R3 option (b), a Beads `milestone`-type issue, which Beads already has as a built-in type) and argues against the third strength. The doc lists the rejected option first and states no preference.
7. Low, WORTH-CONSIDERING (confidence medium). Prior art the doc does not mention: GTD's horizons of focus (purpose, vision, goals, areas, projects, actions), which is the best-known personal-goal hierarchy and maps onto the aspiration, objective and maintain split; and committed versus aspirational OKRs, which bears on how a target and its grading are read. Neither changes a recommendation; each would test the two-level choice against a personal-productivity tradition. No source was fetched for either in this run, so treat both as leads.

### Adjacent

8. Medium. §8 is an information-flow design ("no write down" from private to shared), but it guards only records and committed files. Derived content is the gap: an agent on the personal pair that reads a private goal and then writes a shared task, comment, commit message or summary carries the private content into a shared store as free text with no marking. The privacy leg's structural rules cannot see it, and the term-list backstop does not run on the employer host. The diagram's "reads only, writes nothing back" edge is also inaccurate for the personal-pair web app, which will edit shared work items from the goal views. Fix: name derived content as a residual risk and put the content check on the web app's write API (G2 in the privacy leg's numbering), not only on creation.
9. Low. Portfolio-management practice (capacity allocation against strategic themes) is covered through Atlassian Focus and Jellyfish in the products leg and through the allocation factor in the science leg; the doc carries it in §5. No change warranted.

### Skeptic, with the privacy guard in particular

10. High. The publication guard is not unreachable. §8's "Store publication" row puts the check in `bd_dolt_publish.py`, and the privacy leg calls it "the fleet's only publication path". It is the only sanctioned path. Beads 1.3.2 ships `bd dolt push` ("Push commits to Dolt remote", `bd dolt --help`, read this session), which publishes without running the script. The privacy leg also records that whether a `bd dolt push` to a `git+ssh` remote runs the git `pre-push` hook is unmeasured (Gaps item 1). So a raw `bd dolt push` from a shared store holding a private row reaches the shared remote with no guard firing. Fix: state the bypass, and either wrap or refuse the raw verb (for example a shared-store push that requires a token only the publisher holds), or measure whether pre-push fires and add a store check there.
11. High. The guards refuse "a marked record" (Executive Summary item 5, §8 table rows 1 and 2, diagram). An unmarked private goal created in a shared store, which is the forgetting case a default is meant to cover, passes every row of the doc's table. The privacy leg closes this with a structural rule the doc dropped: no goal-type record without `shared` in a shared store, refused at publication. Unmarked tasks that carry private text are caught only by the term list, which is absent on the employer host by design. The doc should state that the guarantee is exact for goal-type records and for marked tasks, and is a best-effort scan for unmarked free text.
12. Medium. "Every guard fails closed" (§8, after the table) contradicts the privacy leg, which makes one deliberate exception: on the employer host the term list is absent and the content scan reports `not-declared` instead of refusing, or every commit there would fail (§4 and § Fail-closed behaviour of that file). The doc should carry the exception.
13. Medium. The ask's "or another core repo that is cloned down and configured on all machines" is broadened in the privacy leg to public repositories and to every repository not positively marked private (its Alignment table, last row, and flag 4). The doc's table does not say which repositories the pre-commit and pre-push row covers, and it never mentions the private-marker default or the `privacy_class` registry. The design needs those rules stated, since beads-ui is public and is where goal fixtures and screenshots will be made.
14. Low. Several phrasings go beyond the cited page: [^52] supports "remains blocking" but not "stored as written" (that text is from `bd dep add --help`); [^57] supports file names and commit messages but not "change patterns"; §7's list of what "the products that do it well offer" (inline creation in the tree, drag to re-parent) is broader than the products leg's § 6.

## C. Citation check

All 59 footnote definitions were checked. No URL failed with a DNS, 404, 410, 401, 403, timeout or 5xx outcome.

| Outcome | Footnotes | Count |
|---|---|---|
| Public URL fetched this session, content read (HTTP 200) | 2, 3, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 26, 27, 29, 34, 38, 39, 40, 41, 42, 46, 52, 53, 54, 55, 56, 57 | 32 |
| Public URL live (HTTP 200) but the cited content was not reachable in the fetched text | 4 (GitHub refuses to render a 3.32 MB file), 7 (schema of about 1.36 million characters; the cited fields lie beyond the part read), 18 (registry root returns `{}`; the `frappe-gantt` entry was fetched separately and supports the claim) | 3 |
| DOI source confirmed through Crossref, Europe PMC or OpenAlex metadata; one resolver checked (24: HTTP 302 to frontiersin.org, which returned 200) | 22, 23, 24, 25, 28, 30, 31, 32, 33, 35, 36, 37 | 12 |
| Tracked beads-ui file, path present at `4a3a17c` (the public GitHub view of 1 returned 200) | 1, 21, 44, 45, 58 | 5 |
| Gated link to the private ai-harness repository, path present on `origin/main` `6c4b1bb68b8` | 43, 47, 48, 49, 50, 51, 59 | 7 |

The evidence files cited inside 14, 18 and 20 are tracked at `4a3a17c`. The §9 inline gated link and every ai-harness file the fold-in leg lists in its inventory table are present on ai-harness `origin/main`.

One related path is not on any shared ref: the founding ask record the doc's coverage section names, ai-harness `docs/asks/BU-epic-goals-system-usmm.md` with `capture_commit` `b5eaeefd646`. `git ls-tree origin/main` does not list it, `git merge-base --is-ancestor b5eaeefd646 origin/main` exits 1, and `git branch -a --contains b5eaeefd646` names only a local session branch. The record governs this doc and its successor design, and today nobody outside that one checkout can resolve it.

## D. Provenance ledger

Quotes are as returned from the page fetched this session; curly apostrophes are kept where the page uses them. Scholarly rows name the metadata service used.

| Claim | Source URL | Verbatim quote | Verdict | Live? |
|---|---|---|---|---|
| Atlassian does not compute goal progress across several linked work items (§1) | https://support.atlassian.com/platform-experiences/docs/link-goals-and-projects-to-work-in-jira/ | "progress won’t be automatically calculated across all of them." | SUPPORTED | Yes, 200 |
| Atlassian caps linked Jira work items at 100 per goal (§1) | https://support.atlassian.com/platform-experiences/docs/goals-app-data-limits-and-guardrails/ | "A single goal can have a maximum of 100 Jira work items linked to it." | SUPPORTED | Yes, 200 |
| Asana supporting links carry a `contribution_weight` (§1) | https://developers.asana.com/reference/goal-relationships | "The weight that the supporting resource's progress contributes to the supported goal's progress." | SUPPORTED (the 0 to 1 range was paraphrased by the page reader, so that part is PLAUSIBLE) | Yes, 200 |
| Asana's six `progress_source` values (§1) | https://github.com/Asana/openapi/blob/master/defs/asana_oas.yaml | Page text: "we can't show files that are this big right now." | UNVERIFIABLE this session (the products evidence file records the enum) | Yes, 200 |
| Linear flags "Update Missing" (§1) | https://linear.app/docs/initiative-and-project-updates | "Projects are marked Update Missing when both of the following are true:" | SUPPORTED | Yes, 200 |
| Linear progress formula and `InitiativeToProject` (§1, §2) | https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql | Not reached in the fetched text | UNVERIFIABLE this session (the products evidence file quotes both) | Yes, 200 |
| Perdoo's MCP server logs progress updates (§1) | https://support.perdoo.com/en/articles/14470891-mcp-server | "Logs a progress update (new value + status + note) on a KPI or key result" | SUPPORTED | Yes, 200 |
| Tability sells to human and agent teams with agent check-ins (§1) | https://www.tability.io/ | "An AI-native platform to build, roll out and execute your business strategy with both human and Agent teams." | SUPPORTED | Yes, 200 |
| Linear segments work by delegated agent (§1) | https://linear.app/docs/agents-in-linear | "Use Insights sliced or segmented by Delegate to measure how much work is being directed to and handled by agents." | SUPPORTED | Yes, 200 |
| GitHub sub-issues keep one parent (§2) | https://docs.github.com/en/rest/issues/sub-issues | "Option that, when true, instructs the operation to replace the sub-issues current parent issue" | PLAUSIBLE (implied by replacement, not stated) | Yes, 200 |
| Atlassian restricts at creation, for the whole hierarchy (§2, §8) | https://support.atlassian.com/platform-experiences/docs/restrict-who-can-view-and-edit-goals/ | "You can't change an existing open goal to restricted." / "Restriction applies to the whole hierarchy." | SUPPORTED | Yes, 200 |
| React Flow's expand-and-collapse and layout examples are paid Pro examples (§6) | https://reactflow.dev/learn/layouting/layouting | "This is a Pro example." | SUPPORTED | Yes, 200 |
| ELK is EPL-2.0 (§6, cited to [^13]) | https://reactflow.dev/learn/layouting/layouting | The page does not state ELK's licence | UNVERIFIABLE on the cited page (the evidence file behind [^14] records it) | Yes, 200 |
| SVAR reserves critical path for PRO (§6) | https://svar.dev/react/gantt/ | "critical path, constraints, deadlines, working-time calendars, baselines, resource planning, data export, and more." | SUPPORTED | Yes, 200 |
| DHTMLX reserves critical path and auto-scheduling for PRO (§6) | https://github.com/DHTMLX/gantt | "The DHTMLX Gantt PRO edition adds auto-scheduling, critical path calculation, resource management" | SUPPORTED | Yes, 200 |
| Frappe Gantt draws dependency arrows (§6) | https://github.com/frappe/gantt | "Curve radius of arrows connecting dependencies." | SUPPORTED (no hierarchy: the page mentions none, so PLAUSIBLE for that half) | Yes, 200 |
| Frappe Gantt released 1.2.2 on 2026-02-25 (§6) | https://registry.npmjs.org/frappe-gantt | "\"1.2.2\":\"2026-02-25T10:12:26.442Z\"" | SUPPORTED | Yes, 200 |
| Recharts ships Sankey, Treemap, SunburstChart, RadialBarChart (§6) | https://github.com/recharts/recharts/tree/main/src/chart | "Sankey.tsx" / "Treemap.tsx" / "SunburstChart.tsx" / "RadialBarChart.tsx" | SUPPORTED | Yes, 200 |
| Specific difficult goals beat do-your-best, d = .42 to .80 (§3) | https://med.stanford.edu/content/dam/sm/s-spire/documents/PD.locke-and-latham-retrospective_Paper.pdf (author-hosted copy of [^22]; metadata via Crossref) | "The effect sizes in meta-analyses ranged from .42 to .80" | SUPPORTED | Yes, 200 |
| Difficulty effects .48 on complex tasks and .67 on simple ones (§3) | same author-hosted copy of [^22] | "goal difficulty effect sizes (d) of .48 for the most complex tasks versus .67 for the least complex tasks." | SUPPORTED | Yes, 200 |
| Progress monitoring raises attainment, d+ = 0.40 (§3) | https://doi.org/10.1037/bul0000025 (abstract via Europe PMC) | "promoted goal attainment (d+ = 0.40, 95% CI [0.32, 0.48])" | SUPPORTED | Metadata service 200 |
| Larger when recorded or reported (§3) | same, via Europe PMC | "when the outcomes were reported or made public" / "when the information was physically recorded" | SUPPORTED | Metadata service 200 |
| Superordinate plus subordinate goals sustain pursuit (§4) | https://www.frontiersin.org/articles/10.3389/fpsyg.2018.01879/full | "people pursue goals in the long term with higher motivation and more consistently" | SUPPORTED | Yes, 200 |
| BMM separates goals from time-targeted measurable objectives (§4) | https://www.omg.org/spec/BMM/1.3/PDF | "An Objective is a statement of an attainable, time-targeted, and measurable target" | SUPPORTED | Yes, 200 |
| PARA areas continue indefinitely (§4) | https://fortelabs.com/blog/para/ | "that's the definition of an area of responsibility, that it continues indefinitely." | SUPPORTED | Yes, 200 |
| A shared means is seen as less useful to each goal (§4) | https://doi.org/10.1037/0022-3514.92.3.389 (Crossref) | "How additional goals undermine the perceived instrumentality of a shared path." | SUPPORTED (title-level) | Metadata service 200 |
| Re-engagement, not disengagement, predicted well-being (§3) | https://doi.org/10.1007/s11031-022-09941-6 (abstract via Europe PMC) | "goal reengagement, but not goal disengagement, capacities predicted higher levels of well-being" | SUPPORTED | Metadata service 200 |
| 2026 meta-analysis of 235 studies, evidence low to moderate (§3) | https://doi.org/10.1038/s41562-025-02312-4 (abstract via Europe PMC) | "We identified 1,421 effect sizes from 235 studies" / "the overall standard of accumulated evidence was determined to be low to moderate" | SUPPORTED | Metadata service 200 |
| Goodhart's law has four mechanisms (§3) | https://arxiv.org/abs/1803.04585 | "(at least) four different mechanisms" | SUPPORTED | Yes, 200 |
| Rewards lower free-choice intrinsic motivation, d = -0.40 to -0.28 (§3) | https://doi.org/10.1037/0033-2909.125.6.627 (abstract via Europe PMC) | "free-choice intrinsic motivation (d = -0.40, -0.36, and -0.28, respectively)" | SUPPORTED | Metadata service 200 |
| OKR research base is thin (§3) | https://doi.org/10.5753/isys.2024.3885 (abstract via OpenAlex) | "few academic studies addressing the topic in depth" | SUPPORTED | Metadata service 200 |
| Weight-over-duration ordering is Smith's 1956 rule (§5) | https://doi.org/10.1002/nav.3800030106 (Crossref) | "Various optimizers for single‐stage production" | PLAUSIBLE (metadata only; the rule itself is not in the record) | Metadata service 200 |
| Every model in the 2025 evaluation drifted (§5) | https://arxiv.org/abs/2505.02709 | "all evaluated models exhibit some degree of goal drift." | SUPPORTED | Yes, 200 |
| Drift is inherited from earlier agents' trajectories (§5) | https://arxiv.org/abs/2603.03258 | "the same models often inherit drift when conditioned on prefilled trajectories from weaker agents." | SUPPORTED | Yes, 200 |
| Reasoning models hacked a chess benchmark by default (§5) | https://arxiv.org/abs/2502.13295 | "reasoning models like OpenAI o3 and DeepSeek R1 will often hack the benchmark by default." | SUPPORTED | Yes, 200 |
| AI coach raised two-week goal progress, d = 0.33, N = 517 (§3) | https://arxiv.org/abs/2603.17887 | "The AI chatbot produced significantly higher goal progress than the control (d = 0.33, p = .016)." | SUPPORTED | Yes, 200 |
| Feedback made the goal-setting chatbot effective, N = 543 (§3) | https://arxiv.org/abs/2602.08636 | "it is the addition of feedback that makes LLM-based chatbots effective" | SUPPORTED | Yes, 200 |
| A Dolt push carries history (§8) | https://www.dolthub.com/blog/2026-10-08-how-dolt-remotes-work/ | "transfers only the missing chunks needed for the incoming commit, including any missing history." | SUPPORTED | Yes, 200 |
| An `external:` edge remains blocking where the project is unconfigured (§8) | https://github.com/gastownhall/beads/blob/main/docs/core-concepts/dependencies.md | "an unconfigured or unavailable project remains blocking." | SUPPORTED ("stored as written" is not on this page) | Yes, 200 |
| Linear shows a private issue's id as a PR linkback (§8) | https://linear.app/docs/private-teams | "Private issues will be posted as linkbacks on PRs or MRs with the issue ID and link only" | SUPPORTED | Yes, 200 |
| Secret Protection needs a Team or Enterprise plan (§8) | https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security | "You must be on a GitHub Team or GitHub Enterprise plan in order to purchase GitHub Code Security or GitHub Secret Protection." | SUPPORTED | Yes, 200 |
| Same claim, as cited to [^54] | https://docs.github.com/en/code-security/secret-scanning/using-advanced-secret-scanning-and-push-protection-features/custom-patterns/defining-custom-patterns-for-secret-scanning | The page names no plan | UNVERIFIABLE on the cited page | Yes, 200 |
| Pre-receive hooks are a GitHub Enterprise Server feature (§8) | https://docs.github.com/en/enterprise-server@latest/admin/enforcing-policies/enforcing-policy-with-pre-receive-hooks/about-pre-receive-hooks | "Pre-receive hooks are scripts that run on the GitHub Enterprise Server appliance" | SUPPORTED | Yes, 200 |
| git-crypt leaves metadata visible and cannot revoke access (§8) | https://github.com/AGWA/git-crypt | "git-crypt does not encrypt file names, commit messages, symlink targets, gitlinks, or other metadata." / "git-crypt does not support revoking access to an encrypted repository which was previously granted." | SUPPORTED ("change patterns" is not on the page) | Yes, 200 |

Ledger totals: 44 rows; 38 SUPPORTED, 2 PLAUSIBLE, 4 UNVERIFIABLE, 0 CONTRADICTED.

### Findings-file checks

These compare what the doc says a findings file says with the file itself.

| Doc location | Findings file says | Match |
|---|---|---|
| §6 table and §7: the products leg "recommends TanStack Table expanding rows with Pragmatic drag and drop" | R9: "(c) if the Phase 3 backlog already uses expanding rows, else (a) [headless-tree] after a spike", confidence low-medium | Mismatch: the doc states a conditional, low-confidence pick as unconditional |
| §9 milestone row: "a third strength or a typed member" | R3 recommends option (b), a `milestone`-type issue, and argues against (c), the third strength | Mismatch in emphasis |
| §9: "the target stays optional" | Science leg D3: required on objectives (high confidence); fold-in Gaps item 1: an open target for learning or exploratory objectives | Mismatch: broader than either leg |
| §5: unaligned work "keeps its rank" | Science leg's worked example: the unaligned refactor falls from first to third | Contradicted by the leg's own example (the leg makes the same claim) |
| §8: "Every guard fails closed" | Privacy leg: the absent term list on the employer host is "the one deliberate non-failure" | Mismatch |
| §8 table, `bd` write row: refuses "a goal or task marked personal, private, sensitive or domain-specific" | Privacy leg § 4: also "no goal-type record without `shared`" in a shared store | Rule dropped |
| §4 table, "Dates": planned start, due, date resolution | Science leg attributes table: planned start, planned end, hard due, date resolution | Planned end dropped |
| Open Question 1 and §10: options are `relates-to`, a custom kind, or goal metadata | Products leg R2 recommends `tracks` told apart by target type (medium confidence); option (b) is a label | The leg's recommended option is missing from the doc's list |
| Coverage row for breadth: "Covered" | Products leg coverage table: "Narrowed: sentiment and four vendors unreadable" | Mismatch |
| §8: pre-push "sees every writer" | Privacy leg Gaps item 1: whether a Dolt push to a `git+ssh` remote runs `pre-push` is unmeasured | Overstated for the Dolt writer |
| Every other synthesized claim in §§1 to 4, 6 and 10 checked against its leg | Wording and numbers agree | Match |

## E. Structure and writing

The section order follows the research template (`research-1.2.0`): Founding Ask Coverage, Status and Created, Table of Contents, the `context` region, the `body` region (Temporal Scope, Executive Summary, ten numbered sections each with a "When to use", Comparison, Recommendation, Open Questions, Sources), then Ambiguous Items, the Research Prompt appendix, the Provenance Ledger appendix and Run History, each in its named region with the template's kind. Footnotes run contiguously from 1 to 59; every definition is referenced and every reference is defined (checked by script this session). The ToC anchor checker reported `PASS ... (33 links, ok)`, and `far_fidelity.py check` reported `0 finding(s)`.

Defects, all low:

1. The ToC still carries the stub's instruction comment ("FILL THIS IN as you write ...", lines 56 to 67). It is now stale and should go.
2. The template asks for ascending footnote references; first use runs 2, 3, 1, 4 ... 12, 22, 23, 31 ... 21, 43, 37 ... 59, 20. Renumbering by first use would fix it.
3. Lines 449 and 533 put an em dash in the region placeholders, where the template uses a semicolon. Line 107 uses an en dash in "2024–2026"; page ranges in the APA footnotes use en dashes as APA requires, which is fine.
4. Line 118 opens with "One limitation is stated rather than hidden", which comments on the doc's own move (the "narrating your own rhetorical moves" family, plus the "rather than" foil). State the limitation directly. Line 303's "rely on the guards, not on care" is the same contrastive foil.
5. Bold labels appear only where the template puts them (Status, Created, Primary period, Source weighting, the prompt appendix fields). No hedges were found in the body (grep for "perhaps", "arguably", "somewhat", "it may be"). The §6 "When to use" is a three-part parallel list ("The graph view answers ... The timeline answers ... The allocation charts answer ..."); it carries one fact per view, so it can stay.

Temporal Scope's limitation (line 118) is accurate: legs 1 and 2 report no web-search tool, and the products leg confirms user sentiment and several vendor UIs unread. It is incomplete in two ways. It lists ClickUp among the unverified vendors although §1 cites ClickUp's goals page (read at HTTP 200 by leg 1); the unread part was ClickUp's help centre. And it does not say that product discovery itself, not only sentiment, was bounded by the named list and direct fetches, which is why the breadth row should read "narrowed" (G2 item 2). The claim "No decision in this doc rests on them" holds: the Asana recommendation rests on its API spec, which leg 1 read.

## F. Public-repository check

The doc carries no personal or private goal content, no private issue ids (grep over the doc for the private stores' prefixes returned nothing), no ports, no process command lines and no wording about the queue's auth posture. The work-host data-scope issue appears twice (lines 264 and 270), both times as "tracked privately". The one count that names a private repository ("585 of 8,576 tracked ai-harness paths") is a path count, not a queue row count. Public PR numbers, commit SHAs and file paths are as the brief allows.

Two examples are worth a second look. §4 uses "be healthy" and "run a half marathon by June" as the aspiration and objective examples, and the science and products legs use the half-marathon example too. They read as generic, and nothing here suggests they are real, but a health or fitness goal is the kind of example a reader could take for the owner's own. A work-neutral pair ("ship the v2 API", "keep CI green", which the legs already use) would remove the question.

In the findings files, outside the doc: the privacy evidence file's M-3 table and Summary item 7 of the privacy leg print synthetic strings that carry the sergei repository's id prefix. They are labelled synthetic, but they have the exact shape of that store's ids. The fold-in leg's flag 1 lists the five private-repository paths that hold an unredacted personal term; that is a pointer to private content, not the content.

## Proposals by tier

### MUST-FIX

1. Restore planned end as a goal date (§4 "Dates" row, §10 "When to use", Executive Summary item 1). The ask names start, end and due.
2. Name the raw `bd dolt push` bypass of the publication guard and say how the design closes it; state that pre-push coverage of Dolt pushes is unmeasured (§8 "Store publication" row and the "every writer" sentence in §8's second paragraph).
3. Carry the privacy leg's rule refusing an unmarked goal-type record in a shared store, and state the residual risk for unmarked tasks and derived free text (§8 table rows 1 and 2, Executive Summary item 5).
4. Carry the employer-host exception to "every guard fails closed" (§8, after the table).
5. Resolve the contradiction between §9's "one Beads store ... by construction" and §8's cross-store private goals; say how the join, cycle checks and critical path work across stores and how an unreadable store shows as "no data" (§9 second paragraph, §8).
6. Mark the breadth row as narrowed and add the unread visualisation research to the gaps (Founding Ask Coverage, product-breadth row; Temporal Scope).
7. Say that the custom-timeline pick amends D-10's "Frappe Gantt for the roadmap" and adds visx (§6, its table).
8. Fix Executive Summary item 1 so it matches §10's gaps.
9. Fix "unaligned work keeps its rank" (§5 first paragraph, Executive Summary item 4).
10. Reconcile §9's "target stays optional" with §3 and the science leg's D3 (§9 sixth paragraph, §3 "When to use").
11. Label Open Questions 1, 4 and 5 `design-choice` with a reason and 2 and 3 as owner rulings; add `tracks` (the products leg's recommendation) to Open Question 1's options and mark the custom edge kind as needing an upstream Beads change (Open Questions, §10).
12. List the public-repository broadening and the private-marker default in §8 (§8 table, Guard point "Pre-commit and pre-push").
13. The founding ask record and its capture commit are on no shared ref of ai-harness (Founding Ask Coverage). This is a landing step for the coordinator, not a doc edit.

### WORTH-CONSIDERING

1. Add a priority-ordered goal view (the products leg's goal health board) to §7 so the coverage row's "view by priority" has a home (confidence high).
2. Put the primary DOIs for §9's two scholarly findings in Sources (confidence high).
3. Re-point "ELK is EPL-2.0" to [^14] and the plan requirement to [^55]; drop "stored as written" from [^52]'s claim and "change patterns" from [^57]'s (confidence high).
4. Correct §6 and §7's tree-editing pick to the products leg's conditional R9 and §9's milestone row to the fold-in leg's R3 (b) (confidence high).
5. Replace the health and fitness examples with work-neutral ones (confidence medium).
6. Add the content check to the web app's write API and correct the diagram's "writes nothing back" edge (confidence medium).
7. State the invariant that no issue type may parent a goal, which is what "chief most possible parent" requires (confidence medium).
8. Name GTD's horizons of focus and committed versus aspirational OKRs as prior art to test the two-level ontology against (confidence medium; no source fetched).
9. Remove the stale ToC instruction comment, renumber footnotes by first use, and rewrite line 118's opening (confidence high).

### TAKE-IT-OR-LEAVE-IT

1. Use a semicolon instead of the em dash in the two region placeholders, as the template does.
2. Replace the synthetic ids in the privacy findings and evidence files with a made-up prefix.

## Verdict

The doc is a faithful and well-cited synthesis of its four legs on goal science, products, visualisation and the prior system: 38 of 44 ledger claims were supported by quotes fetched this session, none was contradicted, and no citation failed. It is not yet fit to feed the design, for two reasons. First, it narrows the ask in one place, dropping the planned end date. Second, its privacy section, the part the ask treats as a hard requirement, claims more than the guard design delivers. A raw `bd dolt push` bypasses the publication check, an unmarked private goal passes every guard in the table, and "every guard fails closed" contradicts the leg it summarises. Before the design starts, the coordinator should restore the end date, carry the privacy leg's dropped rules with the bypass and residual risk stated, and reconcile §9's one-store claim with §8's cross-store design. The other MUST-FIX items are wording and labelling corrections.

## Files read

- beads-ui at `4a3a17c`: `docs/research/goals-system.md` (full); `docs/research/findings/goals-products-and-visualisation-landscape.md` (full); `docs/research/findings/goals-science-ontology-and-alignment.md` (full); `docs/research/findings/goals-privacy-and-access-control.md` (full); `docs/research/findings/goals-prior-work-fold-in.md` (full); `docs/research/findings/evidence/goals-visualisation-measurements-2026-10-28.md`, `goals-science-beads-fields-2026-10-28.md` and `goals-privacy-measurements-2026-10-28.md` (full); `docs/research/findings/evidence/beads-ui-web-app-stack-signals-2026-10-28.md` (frappe-gantt lines); `docs/designs/beads-ui-design.md` (D-5, D-10, the sprint conventions table and T-3.2, by grep and lines 1355 to 1392); `docs/research/beads-ui-web-app.md` (headings of §§ 1 and 7, for the anchors).
- ai-harness: the founding ask record A001 (from the coordinator's checkout); `docs/research/TEMPLATE.md` and `docs/procedures/ai-writing-anti-patterns.md` (from this run's read-only worktree); from `origin/main` `6c4b1bb68b8`, `docs/procedures/wsjf-scoring-rubric.md` (the `priority_override` and derived-priority lines), `.beads/.gitignore` (lines 75 to 90) and `config/agent_artifact_routing.toml` (the ask and held-route lines); path existence for every gated footnote and every prior-work path in the fold-in inventory.
- Beads 1.3.2 help text, read-only: `bd dolt --help`, `bd dep add --help`, `bd config --help`.
- Checks run: `scripts/check_doc_toc.py` and `scripts/far_fidelity.py check` from the ai-harness worktree against the doc; a footnote-integrity and dash scan of the doc.

## Sources fetched

- https://support.atlassian.com/platform-experiences/docs/link-goals-and-projects-to-work-in-jira/ : 200
- https://support.atlassian.com/platform-experiences/docs/goals-app-data-limits-and-guardrails/ : 200
- https://developers.asana.com/reference/goal-relationships : 200
- https://github.com/Asana/openapi/blob/master/defs/asana_oas.yaml : 200, file too large to render
- https://linear.app/docs/initiative-and-project-updates : 200
- https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql : 200, cited fields beyond the part read
- https://support.perdoo.com/en/articles/14470891-mcp-server : 200
- https://www.tability.io/ : 200
- https://linear.app/docs/agents-in-linear : 200
- https://docs.github.com/en/rest/issues/sub-issues : 200
- https://support.atlassian.com/platform-experiences/docs/restrict-who-can-view-and-edit-goals/ : 200
- https://reactflow.dev/learn/layouting/layouting : 200
- https://docs.github.com/en/graphql : 200
- https://svar.dev/react/gantt/ : 200
- https://github.com/DHTMLX/gantt : 200
- https://github.com/frappe/gantt : 200
- https://registry.npmjs.org/ : 200, empty body
- https://registry.npmjs.org/frappe-gantt : 200
- https://github.com/recharts/recharts/tree/main/src/chart : 200
- https://github.com/gastownhall/beads : 200
- https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/goals-products-and-visualisation-landscape.md : 200
- https://api.crossref.org/works/10.1037/0003-066X.57.9.705 : 200
- https://med.stanford.edu/content/dam/sm/s-spire/documents/PD.locke-and-latham-retrospective_Paper.pdf : 200 (PDF, text extracted)
- https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1037/bul0000025&resultType=core&format=json : 200
- https://doi.org/10.3389/fpsyg.2018.01879 : 302 to frontiersin.org
- https://www.frontiersin.org/articles/10.3389/fpsyg.2018.01879/full : 200
- https://api.crossref.org/works/10.1109/ISRE.2001.948567 : 200
- https://arxiv.org/abs/1605.07767 : 200
- https://www.omg.org/spec/BMM/1.3/PDF : 200 (PDF, text extracted)
- https://api.crossref.org/works/10.24963/ijcai.2020/684 : 200
- https://fortelabs.com/blog/para/ : 200
- https://api.crossref.org/works/10.1037/0022-3514.92.3.389 : 200
- https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1007/s11031-022-09941-6&resultType=core&format=json : 200
- https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1038/s41562-025-02312-4&resultType=core&format=json : 200
- https://api.crossref.org/works/10.5465/amp.2009.37007999 : 200
- https://arxiv.org/abs/1803.04585 : 200
- https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1037/0033-2909.125.6.627&resultType=core&format=json : 200
- https://api.openalex.org/works/doi:10.5753/isys.2024.3885 : 200
- https://api.crossref.org/works/10.1002/nav.3800030106 : 200
- https://arxiv.org/abs/2505.02709 : 200
- https://arxiv.org/abs/2603.03258 : 200
- https://arxiv.org/abs/2502.13295 : 200
- https://arxiv.org/abs/2603.17887 : 200
- https://arxiv.org/abs/2602.08636 : 200
- https://www.dolthub.com/blog/2026-10-08-how-dolt-remotes-work/ : 200
- https://github.com/gastownhall/beads/blob/main/docs/core-concepts/dependencies.md : 200
- https://linear.app/docs/private-teams : 200
- https://docs.github.com/en/code-security/secret-scanning/using-advanced-secret-scanning-and-push-protection-features/custom-patterns/defining-custom-patterns-for-secret-scanning : 200
- https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security : 200
- https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection : 200
- https://docs.github.com/en/enterprise-server@latest/admin/enforcing-policies/enforcing-policy-with-pre-receive-hooks/about-pre-receive-hooks : 200
- https://github.com/AGWA/git-crypt : 200

The DOIs of footnotes 22, 23, 25, 28, 30, 31, 32, 33, 35, 36 and 37 were checked through the metadata services listed above rather than through the DOI resolver; only footnote 24's resolver was fetched.
