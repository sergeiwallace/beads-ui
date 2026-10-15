---
title: "beads-ui leg A findings: task-manager UX, components and web hosting"
category: research
tags: [research, findings, beads-ui]
status: complete
source: "claude-opus-5-5-2026-10-15"
task: BU-mg2.1.1
display_id: BU-research-leg-beads-mruv
template_version: "research-findings-1.0.0"
---

# beads-ui leg A findings: task-manager UX, components and web hosting

## Summary

(drafting)

## 1. Board, backlog, sprint and roadmap views in Jira, Linear, Todoist, Asana and others

The patterns worth copying come from five places. Linear contributes grouped boards with swimlane rows and keyboard selection. Jira contributes backlog-to-sprint drag and soft column limits. GitHub Projects drives its board and roadmap from plain fields. Todoist contributes Quick Add tokens, and Plane shows one dataset through five layouts. Each product also documents a behaviour beads-ui should avoid copying.

### 1.1 Product by product

Jira defines a swimlane as "a horizontal categorization of work items". Its grouping methods are Queries, Stories, Assignees, Epics, Spaces or none. [VERIFIABLE][^1]

Jira column constraints set a minimum or maximum count per column. A red header marks a maximum exceeded and a yellow header a minimum not met. The values "don't have any impact on the number of work items displayed", so the limit is a signal and blocks nothing. [VERIFIABLE][^2]

Jira's backlog ranks by drag, sends an item to the top or bottom from a right-click menu, and selects ranges with Shift. A selection opens a bulk edit sidebar. [VERIFIABLE][^3] In a Scrum backlog you drag a work item into a sprint section, and "Create sprint" adds a new one. [VERIFIABLE][^4]

Jira's timeline could not be read in this run. Three support URLs returned 404 and the Atlassian guide page returned no body text. [NO SOURCE]

Linear boards group by status by default and regroup by project, priority, cycle, label and more. Swimlane rows can use teams, cycles, assignee, lead, initiative or project health. Cmd/Ctrl B toggles board and list. [VERIFIABLE][^5]

Linear boards default to manual order, and "reordering issues changes the order for everyone in the workspace". Board and list views "cannot be ordered independently". [VERIFIABLE][^5][^6] Shift V opens display options, and the command menu carries a "Show display options" action. [VERIFIABLE][^6]

Linear cycles are "time-boxed periods where a team works on completing a pre-defined set of work". Open issues roll over automatically, an optional cooldown follows each cycle, and completed cycle graphs are kept as historical snapshots. [VERIFIABLE][^7]

Linear creates sub-issues from a "+ Add sub-issues" button, and pasting a list of titles creates several at once. Optional automations close the parent when all children close, or close the children when the parent closes. [VERIFIABLE][^8] Custom views are "durable filtered views" that can be saved and shared. [VERIFIABLE][^9] X marks an issue, Shift extends a range, Cmd/Ctrl A selects all, and common bulk actions sit at the bottom of the view. [VERIFIABLE][^10]

Todoist Quick Add parses natural-language dates, `{march 30}` deadlines, `#Project`, `%label`, `p1` to `p3`, `+person`, `/section` and `!` reminders. The `@` label sigil "is planned to be retired by the end of 2026", and smart date recognition can be switched off. [VERIFIABLE][^11]

Asana Workload draws a capacity bar per person, turns it red when someone is over capacity, and lets you drag tasks to change owners or due dates. [VERIFIABLE][^12] Asana's timeline help pages redirected to the help-centre home or returned 404 in this run. [NO SOURCE]

GitHub Projects builds board columns from "any single select or iteration field". It adds a slice-by panel, horizontal groups and field sums at each column top. Column limits do not stop anyone exceeding them, and dragging a card applies the column's value. [VERIFIABLE][^13]

The GitHub roadmap places items by a start and a target date or iteration field. Dragging changes those dates, zoom runs from a month to a year, and vertical markers show iterations and milestones. [VERIFIABLE][^14] Iterations are a field type with configurable length and breaks. [VERIFIABLE][^15]

Plane offers List, Board, Calendar, Table and Timeline layouts over the same work items. Board drag sets status, calendar drag sets the due date, and the table supports keyboard bulk editing. The timeline drags dates and shows dependencies and the critical path. [VERIFIABLE][^16] Plane cycles carry a burn-down and a build-up chart, and unfinished items transfer to an active or upcoming cycle. [VERIFIABLE][^17]

OpenProject's Gantt chart moves a work package by drag and resizes it from either end. Precede and follow relations draw as blue lines, and moving a predecessor past a follower's start pushes the follower later. [VERIFIABLE][^18]

### 1.2 The requested features, compared

| Feature | Strongest documented pattern | Sources |
| --- | --- | --- |
| Swimlanes | Linear rows on any property; Jira's five fixed methods | [VERIFIABLE][^1][^5] |
| Grouping | Linear groups by any property with a "show empty groups" toggle | [VERIFIABLE][^6] |
| Sub-tasks | Linear paste-to-create and parent or child auto-close | [VERIFIABLE][^8] |
| WIP limits | Jira min and max with coloured headers; GitHub soft limits | [VERIFIABLE][^2][^13] |
| Saved views and filters | Linear shared custom views; personal display options with "Set as default" | [VERIFIABLE][^6][^9] |
| Bulk edit | Jira bulk sidebar, Linear bulk bar, Plane keyboard table | [VERIFIABLE][^3][^10][^16] |
| Quick-add parsing | Todoist tokens for date, project, label, priority, assignee and section | [VERIFIABLE][^11] |
| Command palette | GitHub Ctrl/Cmd K with search and a `>` command mode; `cmdk` as the React component | [VERIFIABLE][^19][^20] |
| Inline editing | The existing Beads web UI edits inline in its Issues and Epics views | [VERIFIABLE][^21] |

GitHub's palette opens with Ctrl K or Cmd K, searches by default, and enters command mode on `>`. [VERIFIABLE][^19] `cmdk` describes itself as "a command menu React component that can also be used as an accessible combobox". [VERIFIABLE][^20] Linear documents a command menu, but its keyboard-shortcuts page returned 404, so the Cmd K binding for Linear is unverified here. [NO SOURCE]

### 1.3 What these products get wrong, from their own documentation

Jira hides work in an unmapped status: "Unmapped statuses will hide work items both in your board view and backlog view". It also counts only the right-most column as complete. [VERIFIABLE][^2]

`bd statuses` in this store lists seven built-in statuses and two custom ones, `review` and `uat`. Each carries a category: `active`, `wip`, `frozen` or `done`. [VERIFIABLE][^32] A board that builds one column per listed status, and decides "complete" by the `done` category, avoids both Jira failures. [INFERENCE] The brief named five statuses; the store measured on 2026-10-15 also has `pinned`, `hooked`, `review` and `uat`.

Linear's single shared manual order means one person's drag reorders everyone's board. Board and list cannot hold different orders. [VERIFIABLE][^5][^6] For beads-ui, where several Claude Code sessions read the same store, a shared rank written on every drag also creates churn in the store. §2 covers that cost. [INFERENCE]

Linear cycles offer "no way to keep unfinished issues in a closed cycle". [VERIFIABLE][^7] That keeps the active cycle tidy but erases the record of what slipped, unless the burndown snapshot preserves it. [INFERENCE]

Todoist is moving labels from `@` to `%`. [VERIFIABLE][^11] A quick-add grammar is a public interface, and changing a sigil breaks muscle memory and saved text. [INFERENCE]

Soft WIP limits are the norm in both Jira and GitHub. [VERIFIABLE][^2][^13] For agents that claim work automatically, a limit that only colours a header does not stop over-claiming. A hard limit would have to be enforced where claims happen. [INFERENCE]

Systematic reviewer sentiment could not be gathered. G2 returned 403, Reddit refused the fetch, and Hacker News search returned only scattered anecdotes. [NO SOURCE]

### Hand-offs

- Leg C: how custom statuses are configured per repo, and whether the status category is exposed in `--json` output for a client to group by.
- Leg C: where a manual rank and a sprint membership field can live (labels, `--metadata`, or a sidecar).
- Design stage: which quick-add grammar to adopt, and whether WIP limits are soft signals or hard claim refusals.

## 2. Drag semantics

A drag in these products is a field write with a visual preview. Moving a card between columns writes the column's field value. Reordering writes a rank, and dragging a timeline bar writes dates. beads-ui can treat every drop as a guarded `bd update`, because `bd` already refuses stale writes with a distinct exit code.

### 2.1 Across columns

GitHub states the rule plainly: "If you drag an item to a new column, the value of that column is applied to the dragged item." [VERIFIABLE][^13] Plane's board updates status the same way, and Jira maps each column to one or more statuses. [VERIFIABLE][^2][^16]

In Beads the natural column field is status. `bd update -s closed` refuses to close an issue that has open children or a live blocker unless `--force` is passed. [VERIFIABLE][^32] A drop of an epic into a Done column will therefore fail on real data, and the UI needs a refusal state for it. [INFERENCE]

### 2.2 Within a column

Linear keeps one manual order for the whole workspace. [VERIFIABLE][^6] Figma's fractional indexing gives each object "a real number as an index" and inserts "the average index of the two objects on either side". When two clients insert in the same gap, the server assigns the second insert a unique position. [VERIFIABLE][^28] Figma's post is from 2017 and serves as background; the technique is unchanged.

The `fractional-indexing` package generates string keys "in between two points". It recommends random jitter "to minimize the likelihood of index collisions when generating fractional indexes concurrently". [VERIFIABLE][^29] With jitter, two agents reordering the same column rarely collide, and a collision only produces a tie a later drag can break. [INFERENCE]

Beads has no rank field in the `bd update` flags. It does offer `--metadata` and `--set-metadata key=value`. [VERIFIABLE][^32] A rank could live in metadata. Each write is then a Dolt commit under the default `--dolt-auto-commit on` policy, so heavy reordering would fill the history. [INFERENCE]

### 2.3 Across views

Jira drags from the backlog section into a sprint section. [VERIFIABLE][^4] GitHub drags roadmap items to change start and target dates or iteration. [VERIFIABLE][^14] Plane drags timeline bars to change dates and calendar cards to change due dates. [VERIFIABLE][^16]

Dependency-aware rescheduling differs by product. OpenProject pushes a follower later when its predecessor moves past it. [VERIFIABLE][^18] Frappe Gantt exposes a `move_dependencies` option that defaults to `true`. [VERIFIABLE][^33] Beads has `--due` and `--defer` dates but no start date in `bd update`, so a timeline bar has an end and no documented start. [VERIFIABLE][^32] Leg C should confirm whether a start date exists elsewhere in the model.

### 2.4 Multi-select drag and bulk moves

Jira and Linear both select with Shift ranges and per-item toggles, then apply one edit to the selection. [VERIFIABLE][^3][^10] `bd update` accepts several IDs, but "Updates are applied per issue ID, not atomically across IDs". Failed IDs go to stderr and the command exits nonzero. [VERIFIABLE][^32]

`bd batch` is the atomic alternative. It runs every line "inside a single dolt transaction" and rolls the whole batch back on any error. Its `update` lines accept only `status`, `priority`, `title`, `assignee` and `force`. [VERIFIABLE][^32] A bulk move therefore trades between two behaviours. `bd batch` is all-or-nothing with no stale-write guard, while per-ID `bd update --if-status` is guarded but can partly succeed. [INFERENCE]

No fetched library page documented built-in multi-item dragging for dnd-kit or Pragmatic drag and drop. [NO SOURCE]

### 2.5 Touch and keyboard alternatives

WCAG 2.2 Success Criterion 2.5.7 (Level AA) requires that "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging". [VERIFIABLE][^23]

The two main libraries disagree on keyboard dragging. Atlassian's guidance says "Always provide alternatives to dragging" through a button that opens "an inline menu containing outcomes". It also says "we recommend not leveraging directional controls (arrow keys)". [VERIFIABLE][^22] dnd-kit's keyboard sensor picks up with Space or Enter, moves with the arrow keys and cancels with Escape. [VERIFIABLE][^24]

Both libraries announce moves through live regions. Atlassian asks that messages "contain the name of the item being moved, as well as its old and new position". [VERIFIABLE][^22][^24] A "Move to" menu on every card satisfies 2.5.7. The same menu is also the only drag substitute a terminal pane can offer, which §9 covers. [INFERENCE]

### 2.6 Optimistic update and conflicts

TanStack Query documents two optimistic routes. One renders the pending change from the mutation's `variables`. The other writes the cache in `onMutate`, restores the snapshot in `onError`, and invalidates in `onSettled`. [VERIFIABLE][^30]

HTTP has a standard guard for the same race: `If-Match` "can be used to prevent the lost update problem", and a mismatch returns 412 Precondition Failed. [VERIFIABLE][^31] `bd update` has the equivalent built in. `--if-status` and `--if-assignee` write nothing on a mismatch and exit 13, meaning "another actor won the race". [VERIFIABLE][^32]

A drop can send the card's last-seen status as `--if-status`. On exit 13 the client rolls back its optimistic move and refreshes the card from `bd`. That is a compare-and-set loop with no server-side lock, and it fits several sessions writing one store. [INFERENCE]

Claude Code mods add a second race. Every session on a machine shares one `$.store`, and "A `get` followed by a `set` isn't atomic". [VERIFIABLE][^34] A TUI mod should keep board data in `bd`, where the guard lives, and keep only view preferences in `$.store`. [INFERENCE]

### Hand-offs

- Leg C: whether Beads has a rank field, a start date, or a cheaper write path than one Dolt commit per reorder (`--no-history` exists, effect on sync unverified).
- Leg C: whether `--if-status` and `--if-assignee` hold under the proxied-server and team-server modes that `bd` mentions.
- Leg B: whether a mod `Client` region can implement drag with its pointer events, and how a web drag library's state maps onto a mod redraw.

## 3. Create, edit and delete flows

Sergei asked for an "are you sure?" step before a delete. The evidence supports that request for Beads specifically, because `bd delete` is permanent and has no trash. Better-regarded products pair a recoverable delete with undo and keep the typed confirmation for the irreversible case.

### 3.1 Confirmation versus undo

Nielsen Norman Group advises a confirmation dialog "before actions that cannot be undone". It warns against confirmations "for routine actions", because people stop reading them. Buttons should name the outcome, such as "Delete file" and "Keep file". [VERIFIABLE][^35] The article dates from 2018 and was last reviewed in August 2026.

Atlassian's modal guidance asks that the primary button match the modal title. "When the modal is closed, focus should return to the element that triggered the modal." [VERIFIABLE][^38]

### 3.2 What the better-regarded products do

Linear stores deleted issues "in the archives for 30 days". Cmd/Ctrl Z undoes a delete right away, and a later restore runs from "Recently deleted issues". After 30 days removal is permanent. [VERIFIABLE][^36] Linear also archives closed issues automatically after a period of inactivity. [VERIFIABLE][^36]

GitHub requires you to "type the name of the repository you want to delete" and can restore some repositories "within 90 days of deletion". [VERIFIABLE][^37]

Jira's delete documentation could not be read; the two URLs tried returned 404. [NO SOURCE] Todoist and Asana delete-and-restore behaviour was not reached in this run either. [NO SOURCE]

### 3.3 What `bd delete` does

`bd delete` removes dependency links in both directions and rewrites references in connected issues to `[deleted:ID]`. It then deletes "Permanently", and the help calls it "a destructive operation that cannot be undone". [VERIFIABLE][^32]

Without `--force`, `bd delete` only shows a preview, and `--dry-run` does the same explicitly. By default it "Fails if any issue has dependents not in deletion set". `--cascade` recursively deletes dependents, and `--force` alone deletes and orphans them. [VERIFIABLE][^32]

The preview maps onto Sergei's double-check page. The confirmation screen can show `bd`'s own dry-run list, so the user sees exactly what `--cascade` would remove. [INFERENCE] A typed-ID confirmation fits the cascade case best, since GitHub reserves typed confirmation for its own irreversible delete. [INFERENCE]

Beads offers softer exits than delete. `bd` lists `close`, `reopen`, `defer`, `undefer` and `supersede` commands. It also lists `prune`, which deletes "old closed beads", so a closed issue is not kept forever. [VERIFIABLE][^32] A "Close as won't do" action covers most "delete this" intents and stays reversible until a prune. [INFERENCE] Whether Dolt history can recover a deleted issue was not tested. [NO SOURCE]

The `bd serve` HTTP API exposes a bulk sweep that "deletes closed beads in bulk", and "nothing it deletes comes back". [VERIFIABLE][^32] A web client built on `bd serve` must put that operation behind the same confirmation ladder as delete. [INFERENCE]

### 3.4 Cascade for an epic with children

`bd delete` refuses an epic with dependents unless the caller chooses `--cascade` or `--force`. [VERIFIABLE][^32] Linear documents auto-close for parents and children, but its pages say nothing about deleting a parent's sub-issues. [VERIFIABLE][^8][^36] The epic case therefore needs three explicit choices in the UI: cancel, delete the epic and orphan the children, or delete everything. [INFERENCE]

### 3.5 Create and edit

Fast creation in these products is text-first. Todoist parses one line into a task with fields. [VERIFIABLE][^11] Linear turns a pasted list into several sub-issues. [VERIFIABLE][^8] The existing Beads web UI edits fields inline in its list and epic views. [VERIFIABLE][^21] A quick-add line that maps tokens to `bd create` flags would serve all three surfaces. The mod `Input` element submits a line on Enter. [VERIFIABLE][^34] [INFERENCE]

### Hand-offs

- Leg C: whether a trash or soft-delete state should exist on top of Beads (a label, a status, or a sidecar), and whether Dolt history allows recovery of a deleted issue.
- Leg B: how a confirmation page renders in a mod pane (`holdToasts` is documented for dialogs) and in an MCP App iframe.
- Design stage: the exact confirmation ladder (undo toast for close, modal for delete, typed ID for cascade).

## 4. Sprint and flow metrics, dashboards and widgets

For autonomous assignees, the Kanban Guide's four flow measures fit better than a story-point burndown. They are WIP, throughput, work item age and cycle time. Two agent-specific measures sit on top: cost per closed issue, and time spent waiting on a human.

### 4.1 How the products draw them

Jira's burndown shows "the actual and estimated amount of work to be done in a sprint" against a grey guideline. The vertical axis is whatever estimation statistic the board uses, and scope changes appear when time tracking is on. [VERIFIABLE][^39]

Jira's cumulative flow diagram is "an area chart that shows the various statuses of work items", one band per column. A band "widening vertically over time" marks a bottleneck. [VERIFIABLE][^40]

Jira's control chart plots cycle time or lead time per item. It adds a work-based rolling average and a shaded standard-deviation band. [VERIFIABLE][^41]

Linear Insights measures issue count, effort, cycle time, lead time, triage time and issue age. Counts draw as bars and durations as scatterplots, and burn-up charts are described as cumulative flow diagrams. Views slice by assignee and segment by status. [VERIFIABLE][^42]

GitHub Projects offers current and historical charts, and its default chart is "Burn up". [VERIFIABLE][^43] Plane draws a burn-down and a build-up chart per cycle. [VERIFIABLE][^17] Linear keeps completed cycle graphs "as historical snapshots". [VERIFIABLE][^7]

### 4.2 Flow measures and their arithmetic

The Kanban Guide defines WIP as "The number of work items started but not finished". Throughput is "The number of work items finished per unit of time". Work Item Age is "The elapsed time between when a work item started and the current date", and Cycle Time runs from start to finish. [VERIFIABLE][^44]

Little's Law links the three averages for a stable system. [HEURISTIC]

$$\overline{\text{Cycle time}} = \frac{\overline{\text{WIP}}}{\overline{\text{Throughput}}}$$

The Kanban Guide itself does not state Little's Law; it mentions queuing theory only in passing. [VERIFIABLE][^44]

The Scrum Guide lists "burn-downs, burn-ups, or cumulative flows" as forecasting practices that "do not replace the importance of empiricism". [VERIFIABLE][^45] A burndown chart is therefore optional even inside Scrum.

### 4.3 Which measures matter when assignees are Claude Code sessions

Story points assume a team that commits to a sprint scope. Agent sessions take the next ready item, so a points burndown measures a commitment nobody made. [INFERENCE] Jira's burndown can run on issue count, so a count-based burndown per sprint label stays available. [VERIFIABLE][^39] `bd` also stores an estimate in minutes. [VERIFIABLE][^32]

Work item age matters most for agents, because a crashed session leaves a claim that looks like progress. `bd` has `heartbeat` to refresh a lease, `reclaim` to revert stale-lease work, and `stale` to list idle issues. [VERIFIABLE][^32] An aging-WIP chart that marks claims past their lease turns these into a stuck-agent detector. [INFERENCE]

Cost per closed issue becomes measurable. Claude Code exports `claude_code.cost.usage` in USD, plus `token.usage`, `active_time.total`, `commit.count` and `pull_request.count`. These carry a `session.id` attribute that is on by default. [VERIFIABLE][^46] `bd update --session` records a Claude Code session ID when an issue closes. [VERIFIABLE][^32] Joining the two gives cost and tokens per issue. [INFERENCE]

Time waiting on a human is the agent-era bottleneck. Linear measures "Triage Time" as time spent in Triage status. [VERIFIABLE][^42] This store has custom `review` and `uat` statuses in the `wip` category. [VERIFIABLE][^32] Time in those statuses is the human queue, and a cumulative flow band for them shows it growing. [INFERENCE]

Reopen rate is a cheap quality signal. `bd reopen` and `bd history` exist, so reopens per closed issue can be counted. [VERIFIABLE][^32] [INFERENCE]

Throughput is easy to inflate by splitting issues, a Goodhart's-law effect. [HEURISTIC] Pairing throughput with cycle time and reopen rate makes splitting visible. [INFERENCE]

### 4.4 Dashboard widgets the evidence supports

| Widget | Drawn as | Precedent |
| --- | --- | --- |
| Throughput per week | Bar chart of closed count | Linear issue-count bars [VERIFIABLE][^42] |
| Cycle time | Scatterplot with a rolling average and spread band | Jira control chart, Linear scatterplots [VERIFIABLE][^41][^42] |
| Cumulative flow | Stacked area by status or status category | Jira CFD [VERIFIABLE][^40] |
| Sprint progress | Count-based burndown or burn-up | Jira, GitHub, Plane [VERIFIABLE][^39][^43][^17] |
| Aging WIP | Age per in-progress item against its lease | Kanban Guide age definition [VERIFIABLE][^44] |
| Cost per issue | Table or bar of USD and tokens per closed issue | Claude Code metrics [VERIFIABLE][^46] |

### Hand-offs

- Leg C: whether Beads keeps status-transition timestamps (needed for cycle time and cumulative flow), and whether `bd events` or `bd history` exposes them in JSON.
- Leg C: how a Beads assignee maps to a Claude Code `session.id`, and where OpenTelemetry cost data would be stored for the join.
- Design stage: the MVP metric set; this packet recommends no metric, only the evidence.

## 5. Cross-assignee views

Linear has the clearest model for mixed human and agent work. A human stays the assignee and the agent becomes a separate "delegate", and every view can filter or slice by either field. Beads has one assignee field, so a board of Claude Code sessions needs a convention for which actor that field names.

### 5.1 What the products do

Linear's My Issues has four tabs. They cover issues "assigned to you, created by you, to which you are subscribed, and issues with recent activity". [VERIFIABLE][^47]

Assigning a Linear issue to an agent "sets it as the `delegate`, not the `assignee`". [VERIFIABLE][^49] Custom views filter by Delegate, Insights segment by it, and delegated issues "will still appear" in My Issues. [VERIFIABLE][^48]

A Linear agent session starts when the agent is mentioned or delegated. The agent should "Emit a `thought` activity within 10 seconds", and "Session state is visible to users". [VERIFIABLE][^49]

GitHub lists Copilot agent sessions in an agents panel reachable "from any page on GitHub". Each session opens a log and overview showing progress and token usage, and stopped sessions can be archived. [VERIFIABLE][^50]

Jira and Linear both offer assignee swimlanes. [VERIFIABLE][^1][^5] Asana Workload draws capacity per person and turns over-capacity bars red. [VERIFIABLE][^12]

### 5.2 Agent boards already in the wild

Vibe Kanban, an agent board run with `npx vibe-kanban`, now states "Vibe Kanban is sunsetting". [VERIFIABLE][^51] Adoption did not keep that project maintained, so stars alone are a weak signal for this category. [INFERENCE]

`kanban-tui` has a `claude` backend that reads "the `.json` files under `~/.claude/tasks/`", and "Boards are created for each session ID". [VERIFIABLE][^52] That is a working precedent for showing Claude Code's own task panel data as boards per session.

### 5.3 What Beads provides for a session view

`bd update --claim` atomically sets the assignee to the caller and the status to `in_progress`. `bd` also has `assign`, `unclaim`, `heartbeat` and `reclaim`. [VERIFIABLE][^32] The `--actor` flag names the actor for the audit trail and defaults to `$BEADS_ACTOR`, the git user name or `$USER`. [VERIFIABLE][^32]

A board grouped into swimlanes by assignee, with columns by status category, shows every session's assigned, in-progress and done work in one place. [INFERENCE] Each row can show claim age against its lease, which ties §4's aging measure to the person or session holding the work. [INFERENCE]

`bd events` reads "the durable events journal", and `bd history` shows an issue's version history. [VERIFIABLE][^32] Either could feed an activity panel in the style of Linear's Activity tab. [VERIFIABLE][^47] [INFERENCE]

The human-versus-agent split has no Beads field. Options include an assignee per session plus an owner label, or a metadata key for the human owner. [INFERENCE] `bd update` accepts arbitrary metadata, so neither option needs a schema change. [VERIFIABLE][^32]

### Hand-offs

- Leg C: the identity convention for a Claude Code session in Beads (session name, `session.id`, or `$BEADS_ACTOR`), and whether a delegate or owner field exists or is planned.
- Leg C: how the Claude Code task panel's per-session data relates to Beads claims, given `kanban-tui` already reads `~/.claude/tasks/`.
- Leg C and the coordinator: the autonomous task queue dashboard Sergei asked to fold in (founding ask entry A004) belongs with these session views.

## 6. Open-source React building blocks

(drafting)

## 7. Open-source Jira and Linear clones

(drafting)

## 8. Web app hosting and auth for a small open-source app

(drafting)

## 9. Terminal parallels

(drafting)

## Gaps, blindspots and emergent findings

(drafting)

## Sources

[^1]: Atlassian. (2026). [Configure swimlanes](https://support.atlassian.com/jira-software-cloud/docs/configure-swimlanes/). Jira Cloud Documentation. Verified accessible (HTTP 200) 2026-10-15. (Swimlane definition and the five grouping methods.)
[^2]: Atlassian. (2026). [Configure columns](https://support.atlassian.com/jira-software-cloud/docs/configure-columns/). Jira Cloud Documentation. Verified accessible (HTTP 200) 2026-10-15. (Column constraints, header colours, status mapping, unmapped statuses.)
[^3]: Atlassian. (2026). [Use your Kanban backlog](https://support.atlassian.com/jira-software-cloud/docs/use-your-kanban-backlog/). Jira Cloud Documentation. Verified accessible (HTTP 200) 2026-10-15. (Drag ranking, multi-select, bulk edit sidebar.)
[^4]: Atlassian. (2026). [Use your Scrum backlog](https://support.atlassian.com/jira-software-cloud/docs/use-your-scrum-backlog/). Jira Cloud Documentation. Verified accessible (HTTP 200) 2026-10-15. (Drag from backlog into a sprint, create sprint.)
[^5]: Linear. (2026). [Board layout](https://linear.app/docs/board-layout). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (Grouping, swimlane rows, shared ordering with list, Cmd/Ctrl B.)
[^6]: Linear. (2026). [Display options](https://linear.app/docs/display-options). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (Ordering, manual order shared workspace-wide, sub-grouping, command menu entry, Shift V.)
[^7]: Linear. (2026). [Use cycles](https://linear.app/docs/use-cycles). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (Cycle definition, rollover, cooldown, historical snapshots.)
[^8]: Linear. (2026). [Parent and sub-issues](https://linear.app/docs/parent-and-sub-issues). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (Creating sub-issues, auto-close in both directions.)
[^9]: Linear. (2026). [Custom views](https://linear.app/docs/custom-views). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (Durable saved and shared filtered views.)
[^10]: Linear. (2026). [Select issues](https://linear.app/docs/select-issues). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (X, Shift and Cmd/Ctrl A selection; bulk actions.)
[^11]: Doist. (2026). [Use task Quick Add in Todoist](https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz). Todoist Help Center. Verified accessible (HTTP 200) 2026-10-15. (Quick Add tokens, the `@` label sigil's planned retirement.)
[^12]: Asana. (2026). [Workload](https://asana.com/features/resource-management/workload). Asana feature page. Verified accessible (HTTP 200) 2026-10-15. (Capacity bars, red over-capacity bar, drag to change owner or date. Vendor marketing page.)
[^13]: GitHub. (2026). [Customizing the board layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout). GitHub Docs. Verified accessible (HTTP 200) 2026-10-15. (Column field, slice by, group, soft column limits, field sums, drag applies value.)
[^14]: GitHub. (2026). [Customizing the roadmap layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout). GitHub Docs. Verified accessible (HTTP 200) 2026-10-15. (Date and iteration fields, drag to reschedule, zoom, markers.)
[^15]: GitHub. (2026). [About iteration fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-iteration-fields). GitHub Docs. Verified accessible (HTTP 200) 2026-10-15. (Iterations as a field type with breaks.)
[^16]: Plane. (2026). [Layouts](https://docs.plane.so/core-concepts/issues/layouts). Plane Documentation. Verified accessible (HTTP 200) 2026-10-15. (List, Board, Calendar, Table and Timeline layouts.)
[^17]: Plane. (2026). [Cycles](https://docs.plane.so/core-concepts/cycles). Plane Documentation. Verified accessible (HTTP 200) 2026-10-15. (Burn-down and build-up charts, transferring unfinished work.)
[^18]: OpenProject. (2026). [Gantt charts](https://www.openproject.org/docs/user-guide/gantt-chart/). OpenProject User Guide. Verified accessible (HTTP 200) 2026-10-15. (Drag to reschedule, precede and follow lines, pushed followers.)
[^19]: GitHub. (2026). [GitHub Command Palette](https://docs.github.com/en/get-started/accessibility/github-command-palette). GitHub Docs. Verified accessible (HTTP 200) 2026-10-15. (Ctrl/Cmd K, search mode and `>` command mode.)
[^20]: Coursey, P. (2025). [cmdk README](https://github.com/dip/cmdk). GitHub (repository `dip/cmdk`, formerly `pacocoursey/cmdk`). Read raw via `ghp api` (HTTP 200) 2026-10-15. (Command menu and combobox component; composes Radix Dialog.)
[^21]: Antoni, M. (2026). [beads-ui README](https://github.com/mantoni/beads-ui) and [npm registry record for `beads-ui`](https://registry.npmjs.org/beads-ui). GitHub and npm. README read raw via `ghp api` (HTTP 200) and registry fetched (HTTP 200) 2026-10-15. (Install and `bdui` command, views, live updates, keyboard editing; npm owner and bin name.)
[^22]: Atlassian. (2026). [Pragmatic drag and drop: accessibility guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines). Atlassian Design System. Verified accessible (HTTP 200) 2026-10-15. (Alternatives to dragging, menu pattern, arrow-key advice, live regions.)
[^23]: W3C. (2023). [Understanding Success Criterion 2.5.7: Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html). W3C WAI. Verified accessible (HTTP 200) 2026-10-15. (WCAG 2.2 Level AA criterion text and intent; foundational standard.)
[^24]: dnd-kit. (2026). [Accessibility (legacy docs)](https://dndkit.com/legacy/guides/accessibility/). dnd-kit Documentation. Verified accessible (HTTP 200) 2026-10-15. (Keyboard sensor keys, screen reader instructions, live announcements.)
[^25]: dnd-kit. (2026). [dnd-kit home](https://dndkit.com/). dnd-kit Documentation. Verified accessible (HTTP 200) 2026-10-15. (Framework-agnostic claim, sortable within and across lists, Latest and Legacy docs.)
[^26]: Atlassian. (2026). [pragmatic-drag-and-drop README](https://github.com/atlassian/pragmatic-drag-and-drop) and [LICENSE](https://github.com/atlassian/pragmatic-drag-and-drop/blob/main/LICENSE). GitHub. Read raw via `ghp api` and WebFetch (HTTP 200) 2026-10-15. (Built on the browser's drag and drop, 4.7 kB core, used by Trello, Jira and Confluence, Apache-2.0.)
[^27]: Atlassian. (2026). [react-beautiful-dnd README](https://github.com/atlassian/react-beautiful-dnd). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Archived and deprecated; points to Pragmatic drag and drop.)
[^28]: Wallace, E. (2017). [Realtime editing of ordered sequences](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/). Figma Blog. Verified accessible (HTTP 200) 2026-10-15. (Fractional indexing; server-side uniqueness for concurrent inserts. Foundational background.)
[^29]: Rocicorp. (2026). [fractional-indexing README](https://github.com/rocicorp/fractional-indexing). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (`generateKeyBetween`, jitter to avoid concurrent collisions, CC0-1.0.)
[^30]: TanStack. (2026). [Optimistic updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates). TanStack Query Documentation. Verified accessible (HTTP 200) 2026-10-15. (Variables-based and cache-based optimistic updates, rollback, invalidate on settled.)
[^31]: Mozilla. (2026). [If-Match](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/If-Match). MDN Web Docs. Verified accessible (HTTP 200) 2026-10-15. (Lost-update prevention and 412 Precondition Failed.)
[^32]: beads-ui contributors. (2026). [bd 1.3.0 help output: delete and update](https://github.com/sergeiwallace/beads-ui/blob/7a28fea9c0b06dd488f2f4e3fd55c68354ddb4d1/docs/research/findings/evidence/bd-1.3.0-delete-and-update-help.md). beads-ui repository, tracked evidence file `docs/research/findings/evidence/bd-1.3.0-delete-and-update-help.md` (commit permalink). Captured locally 2026-10-15; fetched from GitHub after push. (Local measurement of `bd delete --help` and `bd update --help`.)
[^33]: Frappe. (2025). [Frappe Gantt README](https://github.com/frappe/gantt). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Drag and resize options, `move_dependencies`, progress.)
[^34]: Anthropic. (2026). [Draw in the interface with a mod](https://code.claude.com/docs/en/plugins/mods/interface.md). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15. (Render sites, elements by surface, `Client`, keyboard focus and reserved keys, hotkeys, `$.store` races.)
[^35]: Nielsen, J. (2018). [Confirmation dialogs can prevent user errors (if not overused)](https://www.nngroup.com/articles/confirmation-dialog/). Nielsen Norman Group. Verified accessible (HTTP 200) 2026-10-15. (Published 2018-02-18, last reviewed 2026-08-07; foundational guidance.)
[^36]: Linear. (2026). [Delete and archive issues](https://linear.app/docs/delete-archive-issues). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (30-day recently deleted archive, undo, restore, auto-archive.)
[^37]: GitHub. (2026). [Deleting a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/deleting-a-repository). GitHub Docs. Verified accessible (HTTP 200) 2026-10-15. (Type-the-name confirmation, 90-day restore.)
[^38]: Atlassian. (2026). [Modal dialog usage](https://atlassian.design/components/modal-dialog/usage). Atlassian Design System. Verified accessible (HTTP 200) 2026-10-15. (Sparing use, button labels, focus return.)
[^39]: Atlassian. (2026). [View and understand the burndown chart](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-burndown-chart/). Jira Cloud Documentation. Verified accessible (HTTP 200) 2026-10-15.
[^40]: Atlassian. (2026). [View and understand the cumulative flow diagram](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-cumulative-flow-diagram/). Jira Cloud Documentation. Verified accessible (HTTP 200) 2026-10-15.
[^41]: Atlassian. (2026). [View and understand the control chart](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-control-chart/). Jira Cloud Documentation. Verified accessible (HTTP 200) 2026-10-15.
[^42]: Linear. (2026). [Insights](https://linear.app/docs/insights). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (Measures, chart types, slice and segment.)
[^43]: GitHub. (2026). [About insights for Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/viewing-insights-from-your-project/about-insights-for-projects). GitHub Docs. Verified accessible (HTTP 200) 2026-10-15. (Current and historical charts, default burn up.)
[^44]: Vacanti, D., & Coleman, Y. (2025). [The Kanban Guide](https://kanbanguides.org/english/). ProKanban.org. Verified accessible (HTTP 200) 2026-10-15. (Definitions of WIP, throughput, work item age and cycle time.)
[^45]: Schwaber, K., & Sutherland, J. (2020). [The Scrum Guide](https://scrumguides.org/scrum-guide.html). Scrum Guides. Verified accessible (HTTP 200) 2026-10-15. (Forecasting practices and empiricism; foundational.)
[^46]: Anthropic. (2026). [Monitoring](https://code.claude.com/docs/en/monitoring-usage). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15. (OpenTelemetry metric names and the `session.id` attribute.)
[^47]: Linear. (2026). [My issues](https://linear.app/docs/my-issues). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (Assigned, Created, Subscribed and Activity tabs.)
[^48]: Linear. (2026). [Agents in Linear](https://linear.app/docs/agents-in-linear). Linear Documentation. Verified accessible (HTTP 200) 2026-10-15. (Delegate filter, Insights by Delegate, delegated issues in My Issues.)
[^49]: Linear. (2026). [Agents (developer docs)](https://linear.app/developers/agents). Linear Developers. Verified accessible (HTTP 200) 2026-10-15. (Delegate versus assignee, agent sessions, visible session state.)
[^50]: GitHub. (2026). [Tracking Copilot's sessions](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions). GitHub Docs. Verified accessible (HTTP 200) 2026-10-15. (Agents panel, session log, token usage.)
[^51]: BloopAI. (2026). [vibe-kanban README](https://github.com/BloopAI/vibe-kanban). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Sunset notice, `npx vibe-kanban`.)
[^52]: Zaloog. (2026). [kanban-tui README](https://github.com/Zaloog/kanban-tui). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Textual, mouse drag and drop, H/L and J/K moves, `claude` backend, MCP server.)
[^53]: GitHub. (2026). Repository metadata via the GraphQL API for [clauderic/dnd-kit](https://github.com/clauderic/dnd-kit), [atlassian/pragmatic-drag-and-drop](https://github.com/atlassian/pragmatic-drag-and-drop), [hello-pangea/dnd](https://github.com/hello-pangea/dnd), [TanStack/table](https://github.com/TanStack/table), [TanStack/virtual](https://github.com/TanStack/virtual), [TanStack/query](https://github.com/TanStack/query), [pmndrs/zustand](https://github.com/pmndrs/zustand), [pmndrs/jotai](https://github.com/pmndrs/jotai), [statelyai/xstate](https://github.com/statelyai/xstate), [shadcn-ui/ui](https://github.com/shadcn-ui/ui), [radix-ui/primitives](https://github.com/radix-ui/primitives), [mui/base-ui](https://github.com/mui/base-ui), [mantinedev/mantine](https://github.com/mantinedev/mantine), [dip/cmdk](https://github.com/dip/cmdk), [frappe/gantt](https://github.com/frappe/gantt), [visjs/vis-timeline](https://github.com/visjs/vis-timeline), [svar-widgets/react-gantt](https://github.com/svar-widgets/react-gantt), [svar-widgets/gantt](https://github.com/svar-widgets/gantt), [MaTeMaTuK/gantt-task-react](https://github.com/MaTeMaTuK/gantt-task-react), [karolkozer/planby](https://github.com/karolkozer/planby), [recharts/recharts](https://github.com/recharts/recharts), [airbnb/visx](https://github.com/airbnb/visx), [observablehq/plot](https://github.com/observablehq/plot), [tremorlabs/tremor](https://github.com/tremorlabs/tremor), [apache/echarts](https://github.com/apache/echarts), [schedule-x/schedule-x](https://github.com/schedule-x/schedule-x), [fullcalendar/fullcalendar](https://github.com/fullcalendar/fullcalendar) and [bigcalendar/react-big-calendar](https://github.com/bigcalendar/react-big-calendar). Read via `ghp api graphql` (HTTP 200) 2026-10-15 about 00:05Z. (Stars, archived flag, last push, SPDX id, open issues, latest release as quoted in §6.)
[^54]: shadcn. (2026). [Base UI as the default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default). shadcn/ui changelog. Verified accessible (HTTP 200) 2026-10-15.
[^55]: SVAR. (2026). [SVAR React Gantt README](https://github.com/svar-widgets/react-gantt). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (React 19 support, drag from backlog, open-source core with a PRO edition.)
[^56]: vis.js community. (2026). [vis-timeline README](https://github.com/visjs/vis-timeline). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Dual Apache-2.0 or MIT licence.)
[^57]: Kozer, K. (2026). [planby LICENSE](https://github.com/karolkozer/planby/blob/master/LICENSE). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. ("Custom License - All Rights Reserved".)
[^58]: Tremor Labs. (2025). [tremor README](https://github.com/tremorlabs/tremor). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Copy-and-paste chart components on Tailwind CSS and Radix UI.)
[^59]: GitHub. (2026). Repository metadata via the GraphQL API for [makeplane/plane](https://github.com/makeplane/plane), [hcengineering/platform](https://github.com/hcengineering/platform), [mattermost-community/focalboard](https://github.com/mattermost-community/focalboard), [plankanban/planka](https://github.com/plankanban/planka), [taigaio/taiga-front](https://github.com/taigaio/taiga-front), [go-vikunja/vikunja](https://github.com/go-vikunja/vikunja), [opf/openproject](https://github.com/opf/openproject), [Leantime/leantime](https://github.com/Leantime/leantime), [kanboard/kanboard](https://github.com/kanboard/kanboard), [wekan/wekan](https://github.com/wekan/wekan), [Zaloog/kanban-tui](https://github.com/Zaloog/kanban-tui), [kdheepak/taskwarrior-tui](https://github.com/kdheepak/taskwarrior-tui), [dooit-org/dooit](https://github.com/dooit-org/dooit), [Zaloog/kanban-python](https://github.com/Zaloog/kanban-python), [jesseduffield/lazygit](https://github.com/jesseduffield/lazygit), [derailed/k9s](https://github.com/derailed/k9s), [Dicklesworthstone/beads_viewer](https://github.com/Dicklesworthstone/beads_viewer), [mantoni/beads-ui](https://github.com/mantoni/beads-ui) and [sergeiwallace/beads-ui](https://github.com/sergeiwallace/beads-ui). Read via `ghp api graphql` (HTTP 200) 2026-10-15 about 00:07Z. (Stars, licence, primary language, last push, latest release as quoted in §7 and §9.)
[^60]: Hardcore Engineering. (2026). [Huly platform README](https://github.com/hcengineering/platform). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Hosted Huly shut down; self-host route.)
[^61]: Mattermost community. (2026). [Focalboard README](https://github.com/mattermost-community/focalboard). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Not-maintained notice.)
[^62]: PLANKA. (2026). [LICENSE.md](https://github.com/plankanban/planka/blob/master/LICENSE.md). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Community, Fair Use and Pro licences; commercial hosting prohibited.)
[^63]: Emanuel, J. (2026). [Beads Viewer README](https://github.com/Dicklesworthstone/beads_viewer). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (The `bv` command, brew install, views and keys, robot flags.)
[^64]: Emanuel, J. (2026). [Beads Viewer LICENSE](https://github.com/Dicklesworthstone/beads_viewer/blob/main/LICENSE). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (MIT with an additional rider naming OpenAI and Anthropic as restricted parties.)
[^65]: GitHub. (2026). [Repository search: beads UI, viewer and kanban](https://api.github.com/search/repositories?q=beads+in:name,description+kanban+OR+beads+ui+OR+beads+viewer&sort=stars&per_page=25). GitHub REST API. Read via `ghp api` (HTTP 200) 2026-10-15. (`total_count` 36; names, stars, licences and descriptions of Beads front ends.)
[^66]: Plane. (2026). [Docker Compose self-hosting](https://developers.plane.so/self-hosting/methods/docker-compose). Plane Developer Docs. Verified accessible (HTTP 200) 2026-10-15. (Installer commands and minimum requirements.)
[^67]: Vikunja. (2026). [Full docker example](https://vikunja.io/docs/full-docker-example/). Vikunja Documentation. Verified accessible (HTTP 200) 2026-10-15. (SQLite option without a database container.)
[^68]: Railway. (2026). [Publish and share templates](https://docs.railway.com/guides/publish-and-share). Railway Docs. Verified accessible (HTTP 200) 2026-10-15. (Deploy on Railway button, template publishing.)
[^69]: Render. (2026). [Blueprints (infrastructure as code)](https://render.com/docs/infrastructure-as-code). Render Docs. Verified accessible (HTTP 200) 2026-10-15. (`render.yaml` at the repo root.)
[^70]: Cloudflare. (2026). [Deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/). Cloudflare Workers Docs. Verified accessible (HTTP 200) 2026-10-15. (Clone into the user's account, provision resources from the Wrangler config.)
[^71]: Vercel. (2025). [Working with the Deploy Button](https://vercel.com/docs/deploy-button). Vercel Docs. Verified accessible (HTTP 200) 2026-10-15. (Page `last_updated` 2025-03-12.)
[^72]: Fly.io. (2026). [Fly Launch](https://docs.fly.io/launch). Fly Docs. Verified accessible (HTTP 301 from `fly.io/docs/launch/`, destination HTTP 200) 2026-10-15.
[^73]: Tailscale. (2026). [Tailscale Serve](https://tailscale.com/kb/1312/serve). Tailscale Docs. Verified accessible (HTTP 200) 2026-10-15. (Identity headers.)
[^74]: oauth2-proxy. (2026). [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/). oauth2-proxy Documentation. Verified accessible (HTTP 200) 2026-10-15.
[^75]: Caddy. (2026). [basic_auth](https://caddyserver.com/docs/caddyfile/directives/basic_auth). Caddy Documentation. Verified accessible (HTTP 200) 2026-10-15.
[^76]: Model Context Protocol. (2026). [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps). MCP Documentation. Verified accessible (HTTP 200) 2026-10-15. (Sandboxed iframe, any framework, supported hosts.)
[^77]: GitHub. (2026). Repository metadata via the GraphQL API for [MasterKale/SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn), [pocket-id/pocket-id](https://github.com/pocket-id/pocket-id) and [oauth2-proxy/oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy). Read via `ghp api graphql` (HTTP 200) 2026-10-15 about 00:17Z. (Stars, licence, latest release, description.)
[^78]: Kumar, D. (2026). [taskwarrior-tui keybindings](https://kdheepak.com/taskwarrior-tui/keybindings/). taskwarrior-tui Documentation. Verified accessible (HTTP 200) 2026-10-15.
[^79]: Duffield, J. (2026). [lazygit Config.md](https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md). GitHub. Verified accessible (HTTP 200) 2026-10-15. (`mouseEvents`, warning toggles, confirm and menu keys.)
[^80]: Derailed. (2026). [k9s commands](https://k9scli.io/topics/commands/). k9s Documentation. Verified accessible (HTTP 200) 2026-10-15. (Command mode, filter, delete with confirmation, kill without.)
[^81]: dooit-org. (2025). [dooit README](https://github.com/dooit-org/dooit). GitHub. Read raw via `ghp api` (HTTP 200) 2026-10-15. (Vim-like keys, `?` help.)

## Appendix: Provenance Ledger

(drafting)

## Run History

(drafting)
