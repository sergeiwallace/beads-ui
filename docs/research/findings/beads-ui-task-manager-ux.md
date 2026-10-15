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

1. Both names proposed in founding ask entry A002 are already in use. `bv` is Beads Viewer's Homebrew binary, and the npm package `beads-ui` belongs to a separate, active Beads web UI whose command is `bdui`. [VERIFIABLE][^21][^63]
2. Beads Viewer's MIT licence carries a rider that grants no rights to Anthropic or anyone acting for it. The rider's "use" includes analysis in automated pipelines. A Claude-built project should not reuse its code, binary or robot API. [VERIFIABLE][^64] [INFERENCE]
3. `bd` 1.3.0 already supplies the primitives a task UI needs. `--if-status` and `--if-assignee` refuse stale writes with exit 13. `bd batch` runs one transaction, `bd delete` previews by default and cascades only on request, and `bd serve` offers a loopback HTTP API. [VERIFIABLE][^32]
4. Every drag in the surveyed products is a field write. TanStack Query's optimistic rollback plus `bd`'s exit 13 gives conflict-safe drops. Manual order needs a fractional rank in metadata, at the cost of one Dolt commit per reorder. [VERIFIABLE][^29][^30][^32] [INFERENCE]
5. The web app and the MCP App can share React components, because MCP Apps run any framework in a sandboxed iframe. The Claude Code mod draws an element tree, and Claude Code reserves Tab and the arrow keys. The mod can share data and view logic only. [VERIFIABLE][^34][^76] [INFERENCE]
6. For Claude Code session assignees, the Kanban Guide's flow measures fit better than a points burndown. Two additions are cost per issue from Claude Code's `session.id`-tagged cost metric, and time in human-review statuses. Linear's delegate field is the closest precedent for separating human owner from agent worker. [VERIFIABLE][^44][^46][^49] [INFERENCE]
7. Pragmatic drag and drop (Apache-2.0) and dnd-kit (MIT) lead for drag. TanStack Table, Virtual and Query lead for data. shadcn/ui made Base UI its default in July 2026. Planby is now "All Rights Reserved" and react-beautiful-dnd is archived. [VERIFIABLE][^26][^27][^53][^54][^57]
8. Comparable Beads tools ship one package-manager command first. `bd serve` has no TLS, so a hosted app needs a long-running process with a volume behind a TLS and auth layer. Tailscale Serve and oauth2-proxy are documented options. Vercel and Cloudflare buttons fit only a static client. [VERIFIABLE][^21][^32][^51][^70][^73] [INFERENCE]

## 1. Board, backlog, sprint and roadmap views in Jira, Linear, Todoist, Asana and others

The patterns worth copying come from five places. Linear contributes grouped boards with swimlane rows and keyboard selection. Jira contributes backlog-to-sprint drag and soft column limits. GitHub Projects drives its board and roadmap from plain fields. Todoist contributes Quick Add tokens, and Plane shows one dataset through five layouts. Each product also documents a behaviour beads-ui should avoid copying.

### 1.1 Product by product

Jira defines a swimlane as "a horizontal categorization of work items". Its grouping methods are Queries, Stories, Assignees, Epics, Spaces or none. [VERIFIABLE][^1]

Jira column constraints set a minimum or maximum count per column. A red header marks a maximum exceeded and a yellow header a minimum not met. The values "don't have any impact on the number of work items displayed", so the limit is a signal and blocks nothing. [VERIFIABLE][^2]

Jira's backlog ranks by drag, sends an item to the top or bottom from a right-click menu, and selects ranges with Shift. A selection opens a bulk edit sidebar. [VERIFIABLE][^3] In a Scrum backlog you drag a work item into a sprint section, and "Create sprint" adds a new one. [VERIFIABLE][^4]

Jira's timeline could not be read in this run. Three support URLs returned 404 and the Atlassian guide page returned no body text. [NO SOURCE]

Linear boards group by status by default and regroup by project, priority, cycle, label and more. Swimlane rows can use teams, cycles, assignee, lead, initiative or project health. Cmd/Ctrl B toggles board and list. [VERIFIABLE][^5]

Linear boards default to manual order, and "Manual ordering is unique in that it will update the manual order for everyone in the workspace". Board and list views "cannot be ordered independently". [VERIFIABLE][^5][^6] Shift V opens display options, and the command menu carries a "Show display options" action. [VERIFIABLE][^6]

Linear cycles are "time-boxed periods where a team works on completing a pre-defined set of work". Open issues roll over automatically, an optional cooldown follows each cycle, and completed cycle graphs are kept as historical snapshots. [VERIFIABLE][^7]

Linear creates sub-issues from a "+ Add sub-issues" button, and pasting a list of titles creates several at once. Optional automations close the parent when all children close, or close the children when the parent closes. [VERIFIABLE][^8] Custom views are "durable filtered views" that can be saved and shared. [VERIFIABLE][^9] X marks an issue, Shift extends a range, Cmd/Ctrl A selects all, and common bulk actions sit at the bottom of the view. [VERIFIABLE][^10]

Todoist Quick Add parses natural-language dates, `{march 30}` deadlines, `#Project`, `%label`, `p1` to `p3`, `+person`, `/section` and `!` reminders. The `@` label sigil "is planned to be retired by the end of 2026", and smart date recognition can be switched off. [VERIFIABLE][^11]

Asana Workload draws a capacity bar per person and turns it red when someone is over capacity. Dragging a task changes its owner or due date. [VERIFIABLE][^12] Asana's timeline help pages redirected to the help-centre home or returned 404 in this run. [NO SOURCE]

GitHub Projects builds board columns from "any single select or iteration field". It adds a slice-by panel, horizontal groups and field sums at each column top. Column limits do not stop anyone exceeding them, and dragging a card applies the column's value. [VERIFIABLE][^13]

The GitHub roadmap places items by a start and a target date or iteration field. Dragging changes those dates, zoom runs from a month to a year, and vertical markers show iterations and milestones. [VERIFIABLE][^14] Iterations are a field type with configurable length and breaks. [VERIFIABLE][^15]

Plane offers List, Board, Calendar, Table and Timeline layouts over the same work items. Board drag sets status, calendar drag sets the due date, and the table supports keyboard bulk editing. The timeline drags dates and shows dependencies and the critical path. [VERIFIABLE][^16] Plane cycles carry a burn-down and a build-up chart, and unfinished items transfer to an active or upcoming cycle. [VERIFIABLE][^17]

OpenProject's Gantt chart moves a work package by drag and resizes it from either end. Precede and follow relations draw as blue lines, and moving a predecessor past a follower's start pushes the follower later. [VERIFIABLE][^18]

### 1.2 The requested features, compared

| Feature | Strongest documented pattern | Sources |
| --- | --- | --- |
| Swimlanes | Linear rows on any property; Jira's five fixed methods | [VERIFIABLE][^1][^5] |
| Grouping | Linear groups by status, assignee, project, priority and more, with a toggle that "shows groups with no issues" | [VERIFIABLE][^6] |
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

Linear's single shared manual order means one person's drag reorders everyone's board. Board and list cannot hold different orders. [VERIFIABLE][^5][^6] In beads-ui several Claude Code sessions read the same store. A shared rank written on every drag would also churn that store, a cost §2 covers. [INFERENCE]

Linear cycles offer "no way to keep unfinished issues in a closed cycle". [VERIFIABLE][^7] That keeps the active cycle tidy but erases the record of what slipped, unless the burndown snapshot preserves it. [INFERENCE]

Todoist is moving labels from `@` to `%`. [VERIFIABLE][^11] A quick-add grammar is a public interface, and changing a sigil breaks muscle memory and saved text. [INFERENCE]

Soft WIP limits are the norm in both Jira and GitHub. [VERIFIABLE][^2][^13] For agents that claim work automatically, a limit that only colours a header does not stop over-claiming. A hard limit would have to be enforced where claims happen. [INFERENCE]

Systematic reviewer sentiment could not be gathered. G2 returned 403, Reddit refused the fetch, and Hacker News search returned only scattered anecdotes. [NO SOURCE]

### Hand-offs

- Leg C: how custom statuses are configured per repo.
- Leg C: whether `--json` output exposes the status category for a client to group by.
- Leg C: where a manual rank and a sprint membership field can live (labels, `--metadata`, or a sidecar).
- Design stage: which quick-add grammar to adopt, and whether WIP limits are soft signals or hard claim refusals.

## 2. Drag semantics

A drag in these products is a field write with a visual preview. Moving a card between columns writes the column's field value. Reordering writes a rank, and dragging a timeline bar writes dates. beads-ui can treat every drop as a guarded `bd update`, because `bd` already refuses stale writes with a distinct exit code.

### 2.1 Across columns

GitHub documents the rule: "If you drag an item to a new column, the value of that column is applied to the dragged item." [VERIFIABLE][^13] Plane's board updates status the same way, and Jira maps each column to one or more statuses. [VERIFIABLE][^2][^16]

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

HTTP has a standard guard for the same race. `If-Match` "can be used to prevent the lost update problem", and a mismatch returns 412 Precondition Failed. [VERIFIABLE][^31] `bd update` has the equivalent built in. `--if-status` and `--if-assignee` write nothing on a mismatch and exit 13, meaning "another actor won the race". [VERIFIABLE][^32]

A drop can send the card's last-seen status as `--if-status`. On exit 13 the client rolls back its optimistic move and refreshes the card from `bd`. That is a compare-and-set loop with no server-side lock, and it fits several sessions writing one store. [INFERENCE]

Claude Code mods add a second race. Every session on a machine shares one `$.store`, and "A `get` followed by a `set` isn't atomic". [VERIFIABLE][^34] A TUI mod should keep board data in `bd`, where the guard lives, and keep only view preferences in `$.store`. [INFERENCE]

### Hand-offs

- Leg C: whether Beads has a rank field or a start date.
- Leg C: whether a reorder can avoid one Dolt commit each. `--no-history` exists; its effect on sync is unverified.
- Leg C: whether `--if-status` and `--if-assignee` hold under the proxied-server and team-server modes that `bd` mentions.
- Leg B: whether a mod `Client` region can implement drag with its pointer events.
- Leg B: how a web drag library's state maps onto a mod redraw.

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

`bd delete` refuses an epic with dependents unless the caller chooses `--cascade` or `--force`. [VERIFIABLE][^32] Linear documents auto-close for parents and children. [VERIFIABLE][^8] Neither fetched Linear page describes what deleting a parent does to its sub-issues. [NO SOURCE] The epic case therefore needs three explicit choices in the UI: cancel, delete the epic and orphan the children, or delete everything. [INFERENCE]

### 3.5 Create and edit

Fast creation in these products is text-first. Todoist parses one line into a task with fields. [VERIFIABLE][^11] Linear turns a pasted list into several sub-issues. [VERIFIABLE][^8] The existing Beads web UI edits fields inline in its list and epic views. [VERIFIABLE][^21] A quick-add line that maps tokens to `bd create` flags would serve all three surfaces. The mod `Input` element submits a line on Enter. [VERIFIABLE][^34] [INFERENCE]

### Hand-offs

- Leg C: whether a trash or soft-delete state should exist on top of Beads, as a label, a status or a sidecar.
- Leg C: whether Dolt history allows recovery of a deleted issue.
- Leg B: how a confirmation page renders in a mod pane and in an MCP App iframe. `holdToasts` is documented for mod dialogs.
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

Story points assume a team that commits to a sprint scope. Agent sessions take the next ready item, so a points burndown measures a commitment nobody made. [INFERENCE] Jira's burndown plots whatever estimation statistic the board is configured with. [VERIFIABLE][^39] The page does not name issue count as one of the options. [NO SOURCE] A count-based burndown per sprint label needs no estimates, which suits agents. [INFERENCE] `bd` also stores an estimate in minutes. [VERIFIABLE][^32]

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
| Sprint progress | Count-based burndown or burn-up | Plane, Jira, GitHub [VERIFIABLE][^17][^39][^43] |
| Aging WIP | Age per in-progress item against its lease | Kanban Guide age definition [VERIFIABLE][^44] |
| Cost per issue | Table or bar of USD and tokens per closed issue | Claude Code metrics [VERIFIABLE][^46] |

### Hand-offs

- Leg C: whether Beads keeps status-transition timestamps, which cycle time and cumulative flow need.
- Leg C: whether `bd events` or `bd history` exposes those timestamps in JSON.
- Leg C: how a Beads assignee maps to a Claude Code `session.id`, and where cost data would be stored for the join.
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

- Leg C: the identity convention for a Claude Code session in Beads: session name, `session.id` or `$BEADS_ACTOR`.
- Leg C: whether a delegate or owner field exists or is planned.
- Leg C: how the Claude Code task panel's per-session data relates to Beads claims, given `kanban-tui` already reads `~/.claude/tasks/`.
- Leg C and the coordinator: the autonomous task queue dashboard Sergei asked to fold in (founding ask entry A004) belongs with these session views.

## 6. Open-source React building blocks

The web app and the MCP App can share one React component set. An MCP App is web content in an iframe, and "you can use any framework or none at all". [VERIFIABLE][^76] The Claude Code mod cannot use these components. A mod returns an element tree of `Box`, `Text`, `Button` and similar elements, with no DOM. [VERIFIABLE][^34]

Most candidates below are permissively licensed and actively maintained as of 2026-10-15. Five need care: Planby is now "All Rights Reserved", react-beautiful-dnd and gantt-task-react are archived, and Tremor and `cmdk` show slowing activity.

### 6.1 Measured signals

All counts below were read from the GitHub GraphQL API on 2026-10-15 about 00:05Z. [VERIFIABLE][^53]

| Area | Library | Licence | Stars | Last push | Latest release | Open issues |
| --- | --- | --- | --- | --- | --- | --- |
| Drag and drop | dnd-kit | MIT | 17,711 | 2026-09-12 | `@dnd-kit/collision@0.5.0`, 2026-06-11 | 94 |
| Drag and drop | Pragmatic drag and drop | Apache-2.0 (LICENSE file; GitHub reports NOASSERTION) | 12,783 | 2026-10-14 | none on GitHub | 96 |
| Drag and drop | @hello-pangea/dnd | not checked (GitHub reports NOASSERTION) | 4,033 | 2026-10-14 | v18.0.1, 2025-02-09 | 71 |
| Table | TanStack Table | MIT | 28,491 | 2026-10-12 | 9.3.1 (devtools tag), 2026-10-12 | 47 |
| Virtualization | TanStack Virtual | MIT | 7,145 | 2026-10-14 | 3.13.45, 2026-10-13 | 55 |
| Server state | TanStack Query | MIT | 50,428 | 2026-10-14 | release-2026-10-11 | 56 |
| Client state | Zustand | MIT | 58,821 | 2026-10-14 | v5.0.15, 2026-08-13 | 2 |
| Client state | Jotai | MIT | 21,294 | 2026-10-07 | v3.0.1, 2026-09-29 | 1 |
| State machines | XState | MIT | 30,298 | 2026-10-14 | 2026-10-08 (package tag) | 93 |
| UI kit | shadcn/ui | MIT | 125,615 | 2026-10-14 | shadcn@4.21.5, 2026-10-14 | 804 |
| Primitives | Radix Primitives | MIT | 19,394 | 2026-10-14 | none on GitHub | 118 |
| Primitives | Base UI | MIT | 11,149 | 2026-10-14 | v1.9.0, 2026-10-09 | 331 |
| UI kit | Mantine | MIT | 31,832 | 2026-10-11 | 9.7.2, 2026-10-11 | 14 |
| Command palette | cmdk | MIT | 13,016 | 2025-10-29 | v1.1.1, 2025-03-14 | 52 |
| Gantt | Frappe Gantt | MIT | 6,144 | 2026-06-18 | v1.0.3, 2025-02-03 | 43 |
| Timeline | vis-timeline | Apache-2.0 or MIT | 2,568 | 2026-10-14 | v8.5.4, 2026-08-12 | 266 |
| Gantt | SVAR React Gantt | MIT core, paid PRO edition | 214 | 2026-10-12 | none on GitHub | 12 |
| Gantt | gantt-task-react | MIT, archived | 1,098 | 2024-08-12 | v0.3.9, 2022-07-10 | 129 |
| EPG timeline | Planby | "Custom License - All Rights Reserved" | 1,720 | 2026-08-23 | v2.1.0, 2026-08-23 | 10 |
| Charts | Recharts | MIT | 27,628 | 2026-10-14 | v3.10.1, 2026-07-25 | 418 |
| Charts | visx | MIT | 21,077 | 2026-06-22 | v4.0.0, 2026-06-11 | 116 |
| Charts | Observable Plot | ISC | 5,405 | 2026-09-01 | v0.6.17, 2025-02-14 | 251 |
| Charts | Tremor | Apache-2.0 | 3,660 | 2025-10-10 | none on GitHub | 18 |
| Charts | Apache ECharts | Apache-2.0 | 67,512 | 2026-10-13 | 6.1.0, 2026-05-19 | 1,284 |
| Calendar | FullCalendar | MIT | 20,687 | 2026-10-12 | v7.1.2, 2026-10-12 | 1,072 |
| Calendar | react-big-calendar | MIT | 8,763 | 2026-06-01 | v1.20.0, 2026-06-01 | 39 |
| Calendar | Schedule-X | MIT | 2,601 | 2026-10-14 | none on GitHub | 37 |

The Pragmatic drag and drop licence file opens "Licensed under the Apache License, Version 2.0". [VERIFIABLE][^26] vis-timeline declares "SPDX-License-Identifier: Apache-2.0 OR MIT". [VERIFIABLE][^56] The Planby licence file is titled "Custom License - All Rights Reserved". [VERIFIABLE][^57]

### 6.2 Drag and drop

Pragmatic drag and drop "enables safe and successful usage of the browsers built in drag and drop functionality". Its core is about 4.7 kB. Its README says it is "powering some of the biggest products on the web" and names Trello, Jira and Confluence. [VERIFIABLE][^26] That adoption claim is the vendor's own and names its own products. Its strength for beads-ui is that a Jira-like board is its home use case. [INFERENCE]

dnd-kit lists itself as "Framework agnostic" and describes sortables that "can be reordered within and across lists". Its docs split into Latest and Legacy sections. [VERIFIABLE][^25] Its keyboard sensor and announcements are documented on the legacy pages. [VERIFIABLE][^24] A build on the newer packages should check that those features carried over. [INFERENCE]

react-beautiful-dnd is archived and "deprecated on `npm`", and its README sends readers to Pragmatic drag and drop. [VERIFIABLE][^27] `@hello-pangea/dnd` is a maintained fork but has not released since February 2025. [VERIFIABLE][^53]

### 6.3 Tables, data and state

TanStack Table, Virtual and Query are all MIT, active, and released within the last week. [VERIFIABLE][^53] TanStack Query's optimistic-update guide covers the drag rollback pattern from §2.6. [VERIFIABLE][^30] Zustand and Jotai each show one or two open issues against tens of thousands of stars. [VERIFIABLE][^53]

### 6.4 UI primitives and the command palette

shadcn/ui switched its default primitives in July 2026: "Starting today, Base UI is the default component library in shadcn/ui", and "Radix is still fully supported". [VERIFIABLE][^54] A new beads-ui project generated with the shadcn CLI would therefore start on Base UI. [INFERENCE]

shadcn/ui distributes components as source code the project owns. [HEURISTIC] Tremor uses the same copy-and-paste model, "Built on top of Tailwind CSS and Radix UI". [VERIFIABLE][^58] Tremor's repository has not been pushed since 2025-10-10, which is a maintenance warning. [VERIFIABLE][^53]

`cmdk` composes "Radix UI's Dialog component", filters and sorts items itself, and supports nested pages. [VERIFIABLE][^20] Its last release was 2025-03-14 and its last push 2025-10-29. [VERIFIABLE][^53] It still works. If it stalls, a Base UI combobox or a maintained fork is the replacement path. [INFERENCE]

### 6.5 Timeline, gantt and calendars

Frappe Gantt is MIT, drags and resizes bars, and has a `move_dependencies` option. Its last release is from February 2025. [VERIFIABLE][^33][^53]

SVAR React Gantt states "React 19 compatibility" and "The ability to drag tasks from a backlog". It ships an "open-source core" and a separate PRO edition. [VERIFIABLE][^55] With 214 stars it has little adoption evidence, so it is exploratory under the source-vetting rule. [INFERENCE]

vis-timeline carries a permissive dual licence and released in August 2026, but has 266 open issues against 2,568 stars. [VERIFIABLE][^53][^56] Planby is closed source now, and gantt-task-react is archived. [VERIFIABLE][^53][^57]

FullCalendar, react-big-calendar and Schedule-X are all MIT and active. [VERIFIABLE][^53] Beads has due and defer dates, so a calendar view can place items by due date as Plane's does. [VERIFIABLE][^16][^32] [INFERENCE]

### 6.6 Charts

Recharts, visx and ECharts are permissive and active. [VERIFIABLE][^53] Observable Plot has not released since February 2025. [VERIFIABLE][^53] In the terminal mod, charts must be drawn as `Raster` cells. The mods docs recommend one `Raster` "For a heat map, a sparkline, or a game board in the terminal". [VERIFIABLE][^34]

### Hand-offs

- Leg B: which of these React packages bundle cleanly into an MCP App resource under its CSP.
- Leg B: how much of the view layer the mod can share, given no DOM; this packet expects data and view models only.
- Coordinator: an existing fleet app (`app-portal`) already uses React 19, Tailwind CSS 4 and shadcn-derived components, per its `package.json` read on 2026-10-15. Reusing its tokens is a design choice outside this leg.

## 7. Open-source Jira and Linear clones

The general-purpose clones are useful as UX references. Most cannot donate code to an MIT repository, because they are AGPL, GPL, EPL or custom-licensed. The closest prior art is the Beads ecosystem itself. Two existing projects collide with names Sergei proposed: Beads Viewer ships a `bv` command, and the npm package `beads-ui` belongs to another author.

### 7.1 General-purpose clones

Signals below were read from the GitHub GraphQL API on 2026-10-15 about 00:07Z. [VERIFIABLE][^59]

| Project | Licence | Main language | Stars | Latest release | Status |
| --- | --- | --- | --- | --- | --- |
| Plane | AGPL-3.0 | TypeScript | 60,851 | v1.4.2, 2026-08-23 | Active |
| Huly | EPL-2.0 | TypeScript | 27,905 | v0.7.426, 2026-07-05 | Hosted service shut down |
| Focalboard | NOASSERTION | TypeScript | 26,502 | v8.0.0, 2024-06-13 | "currently not maintained" |
| Wekan | MIT | JavaScript | 21,116 | v12.46, 2026-10-14 | Active |
| OpenProject | GPL-3.0 | Ruby | 16,421 | v17.9.1, 2026-10-01 | Active |
| Planka | PLANKA Community, Fair Use and Pro licences | JavaScript | 12,617 | v2.2.1, 2026-08-10 | Active |
| Leantime | AGPL-3.0 | PHP | 11,830 | v3.11.0, 2026-10-09 | Active |
| Kanboard | MIT | PHP | 9,907 | v1.2.54, 2026-08-29 | Active |
| Vikunja | AGPL-3.0 | Go | 5,732 | v2.7.0, 2026-10-02 | Active |
| Taiga (front end) | AGPL-3.0 | CoffeeScript | 383 | none on GitHub | Active |

Huly's README states "Hosted Huly has shut down" because "its hosting is no longer funded". [VERIFIABLE][^60] Focalboard's README opens "This repository is currently not maintained". [VERIFIABLE][^61]

Planka's licence prohibits "operating PLANKA as a hosted service for third parties for any commercial gain whatsoever". [VERIFIABLE][^62] That is a source-available licence, so Planka code is off limits for an MIT project. [INFERENCE]

Copying AGPL, GPL or EPL source into an MIT project would bring those terms with it. [HEURISTIC] UX patterns, layouts and interaction ideas can still be studied and re-implemented from scratch. [HEURISTIC]

Plane is the strongest UX reference among the clones. It has the most stars, the five-layout switcher, and cycle charts. [VERIFIABLE][^16][^17][^59] OpenProject is the reference for dependency-aware Gantt scheduling. [VERIFIABLE][^18] The two MIT clones, Wekan and Kanboard, run on stacks unlike a React and TypeScript monorepo, so little of their code would transfer. [INFERENCE]

Whether Plane, Huly or the other general clones ship a terminal or CLI surface was not established in this run. [NO SOURCE]

### 7.2 The Beads ecosystem

A GitHub search for Beads UIs, viewers and kanbans returned 36 repositories on 2026-10-15. [VERIFIABLE][^65] Two have real adoption.

`mantoni/beads-ui` is a local web UI for Beads: MIT, JavaScript, 755 stars, v0.12.6 released 2026-08-11. [VERIFIABLE][^59] It installs with `npm i beads-ui -g` and starts with `bdui start --open`. Its views are Issues, Epics and a Board with "Blocked / Ready / In progress / Closed columns". It lists "Live updates", "Keyboard navigation" and "Multi-workspace". [VERIFIABLE][^21] The npm package `beads-ui` belongs to its maintainers, and its command is `bdui`. [VERIFIABLE][^21] Its `package.json` depends on `express` 5, `lit-html` 3 and `ws` 8, and requires Node 22 or later. [VERIFIABLE][^21] Its MIT licence permits reuse with attribution. Its view layer is lit-html, so React components would not carry over. [INFERENCE]

Beads Viewer is a Go TUI for Beads with 1,713 stars and v0.25.2 released 2026-10-01. [VERIFIABLE][^59] It installs with `brew install dicklesworthstone/tap/bv`. Its board is opened with `b`, cycles swimlane modes with `s`, and agents are told "Use ONLY --robot-* flags". [VERIFIABLE][^63]

Beads Viewer's licence adds a rider to MIT. "Restricted Parties" include "Anthropic, PBC", and "no rights are granted to any Restricted Party". Its definition of "use" covers "analyzing, indexing, or incorporating" the software into "any dataset, training corpus, evaluation harness, or pipeline for machine learning or other automated systems". [VERIFIABLE][^64]

beads-ui is being researched and built by Claude agents. Using Beads Viewer's code, binary or robot API in that work carries legal risk under the rider. [INFERENCE] This packet read only Beads Viewer's README and LICENSE, and used its README for interaction patterns. Whether reading its documentation is within the rider is a legal question this packet does not answer.

The search also found smaller Beads front ends. They include a web viewer (33 stars) and an agent dashboard with TUI and React web modes (31 stars). Several read-only TUIs, a VS Code extension for `bv` and an Emacs interface also appear. [VERIFIABLE][^65] The VS Code and Emacs projects name `bv` as Beads Viewer's command, so the name already has users. [VERIFIABLE][^65]

### 7.3 Name collisions with the founding ask

Founding ask entry A002 proposes the alias `bv` and the name `beads-ui`. The `bv` command is already Beads Viewer's Homebrew binary. [VERIFIABLE][^63] A second `bv` on the same machine would shadow one or the other on `PATH`. [INFERENCE]

The GitHub repository `sergeiwallace/beads-ui` coexists with `mantoni/beads-ui` without conflict, since owners differ. [VERIFIABLE][^59] Publishing to npm under the bare name `beads-ui` is not possible, because the name is taken. A scoped name such as `@sergeiwallace/beads-ui` would avoid that. [VERIFIABLE][^21] [INFERENCE]

### Hand-offs

- Coordinator: the `bv` alias and the npm package name are naming decisions for the design stage.
- Coordinator: whether to treat Beads Viewer as off limits entirely. This packet makes no legal finding.
- Leg C: `mantoni/beads-ui` builds its board columns from readiness: Blocked, Ready, In progress and Closed. Leg C can say whether `bd ready` semantics should drive columns.

## 8. Web app hosting and auth for a small open-source app

Comparable local-first tools ship one install command first and a Docker Compose file second. Deploy buttons come last. beads-ui has a constraint most of them lack: its data lives in a git checkout with a Dolt store. `bd serve` already exposes that store as a loopback HTTP API with optional token auth and no TLS. A hosted beads-ui is therefore a long-running process with a persistent volume behind a TLS and auth layer. Static and serverless hosts fit only the client bundle.

### 8.1 What comparable apps ship as the local run path

| Project | Local run path | Source |
| --- | --- | --- |
| mantoni/beads-ui | `npm i beads-ui -g`, then `bdui start --open` | [VERIFIABLE][^21] |
| Vibe Kanban | `npx vibe-kanban` | [VERIFIABLE][^51] |
| Beads Viewer | `brew install dicklesworthstone/tap/bv` | [VERIFIABLE][^63] |
| Plane | download and run `setup.sh`; 2 CPU cores and 4 GB RAM minimum | [VERIFIABLE][^66] |
| Vikunja | one container with SQLite: "You can also remove the db section." | [VERIFIABLE][^67] |

The two Beads-adjacent web tools both start from a single package-manager command. [VERIFIABLE][^21][^51] Plane's stack needs 4 GB of RAM, which is heavy for a single-user tool. [VERIFIABLE][^66] Vikunja's SQLite mode is the closest analogue to a file-backed store in one container. [VERIFIABLE][^67] [INFERENCE]

### 8.2 `bd serve` as the backend

`bd serve` serves "the same work surface the CLI answers, for automation clients that would otherwise fork a bd subprocess per call". An OpenAPI document describes the wire contract at `/v0`. [VERIFIABLE][^32]

Its defaults suit a local app. It binds `127.0.0.1:0` unless told otherwise, and the help advises an explicit port so a second serve fails to bind. Authentication is "off by default on loopback". [VERIFIABLE][^32]

Its limits shape a hosted deployment. `--allow-non-loopback` "REQUIRES a token file". Under "WHAT THIS DOES NOT DO" the help lists "No TLS" and states that hooks do not fire on HTTP writes. It also refuses to start under `--readonly`. [VERIFIABLE][^32]

The web app and the MCP App server can both call `bd serve` and avoid spawning `bd` per request. [INFERENCE] Any Beads hook the fleet relies on would not run for writes made through the UI on that route. [INFERENCE]

### 8.3 Deploy templates and buttons

| Target | What the maintainer ships | Fit for a `bd`-backed app |
| --- | --- | --- |
| Docker Compose | A compose file; Plane and Vikunja both document one | Fits: a volume holds the checkout and Dolt state [VERIFIABLE][^66][^67] [INFERENCE] |
| Railway | A published template plus a "Deploy on Railway" button | Fits if the service has a volume [VERIFIABLE][^68] [INFERENCE] |
| Render | A `render.yaml` Blueprint "at the root of your repo" | Fits as a web service with a disk [VERIFIABLE][^69] [INFERENCE] |
| Fly.io | `fly launch` and a `fly.toml` | Fits with a volume; volume details not read [VERIFIABLE][^72] [INFERENCE] |
| Cloudflare | A Deploy button that clones the repo and provisions resources from the Wrangler config | Client bundle only; Workers cannot run `bd` [VERIFIABLE][^70] [INFERENCE] |
| Vercel | A Deploy Button that clones the repo and creates a project | Client bundle only [VERIFIABLE][^71] [INFERENCE] |

Cloudflare's button "clones your source repository into the user's GitHub/GitLab account". Required resources "are automatically provisioned and bound to the Worker". [VERIFIABLE][^70] Vercel's button follows the same clone-then-deploy flow. [VERIFIABLE][^71]

Render's Deploy-to-Render button page returned 404, so only the Blueprint file format was verified. [NO SOURCE] AWS CDK, Copilot, App Runner and Helm templates were not researched in this run; §Gaps lists them.

### 8.4 Auth for a self-hosted single-user app

Tailscale Serve routes tailnet traffic to a local service and needs HTTPS enabled in the tailnet. It adds `Tailscale-User-Login`, `Tailscale-User-Name` and `Tailscale-User-Profile-Pic` headers. Those headers "are not populated for traffic originating from tagged devices". [VERIFIABLE][^73]

oauth2-proxy is "A reverse proxy and static file server that provides authentication using Providers (Google, GitHub, and others)". [VERIFIABLE][^74] It is MIT, has 15,185 stars and released v7.15.5 on 2026-10-01. [VERIFIABLE][^77]

Caddy's `basic_auth` requires hashed passwords, and the docs warn "basic auth is not secure over plain HTTP". [VERIFIABLE][^75]

Passkeys have two maintained routes. SimpleWebAuthn is an MIT TypeScript library (2,365 stars, v14.0.3 on 2026-09-25). Pocket ID is a BSD-2-Clause OpenID Connect provider that "lets users sign in to your applications with passkeys" (9,592 stars, v2.18.0 on 2026-10-04). [VERIFIABLE][^77]

These pieces stack in order of exposure. Loopback with no auth suits one machine, and `bd serve` defaults to it. Tailscale Serve adds TLS and identity across a tailnet. oauth2-proxy or Pocket ID in front of `bd serve` with a token covers the open internet. [INFERENCE]

### 8.5 The MCP App as a second delivery route

An MCP App's UI is "an HTML page, often bundled with its JavaScript and CSS", rendered in a sandboxed iframe. It talks to the host over `postMessage`. [VERIFIABLE][^76] Claude, Claude Desktop, VS Code GitHub Copilot, Microsoft 365 Copilot and Goose are among its listed hosts. [VERIFIABLE][^76] The MCP App needs no web hosting of its own, because the MCP server delivers the bundle as a `ui://` resource. [VERIFIABLE][^76] [INFERENCE]

### Hand-offs

- Leg B: how the MCP App server reaches `bd serve` or `bd` and whether its CSP allows a loopback call.
- Leg C: whether Beads hooks must fire for UI writes, given that `bd serve` skips them.
- Leg C: how a hosted checkout syncs with the git remote.
- Design stage: the first-class local command name, the template set for the first release, and the default auth layer.

## 9. Terminal parallels

Terminal kanban tools pair vim-style keys with optional mouse support, and the careful ones confirm only destructive actions. A Claude Code mod pane is stricter than a full-screen TUI. Claude Code owns Tab, the arrow keys and Esc. Hotkeys are one digit or one lowercase letter on a `Button`, and pointer input exists only inside a `Client` region. The patterns that translate are letter hotkeys, a "Move to" menu, a focused confirmation pane and a per-session board.

### 9.1 What the terminal tools do

`kanban-tui` is built on Textual. It moves cards between columns with `H` and `L` and reorders with `J` and `K`. "Movement between columns and reordering within a column are also supported via mouse drag and drop." [VERIFIABLE][^52] It lists `d` for delete without a documented confirmation, and it can run "as a local mcp server". [VERIFIABLE][^52]

taskwarrior-tui uses `j` and `k` to move, `a` to add, `m` to modify, `x` to delete and `u` to undo. `v` toggles a mark and `V` marks every task in the current filter. [VERIFIABLE][^78] Its delete confirmation behaviour is not documented on that page. [NO SOURCE]

lazygit turns on mouse capture with `mouseEvents: true` and warns that captured mouse events make text selection harder. Its config has per-action warning toggles such as `skipDiscardChangeWarning`, and `?` opens the options menu. [VERIFIABLE][^79]

k9s opens a command mode with `:` and filters with `/`. Ctrl-D deletes a resource with "TAB and ENTER to confirm", while Ctrl-K kills one with "no confirmation dialog". [VERIFIABLE][^80] That split keeps a confirmation on the normal delete and offers a deliberate fast path.

dooit uses vim-like keybindings and shows them on `?`. [VERIFIABLE][^81] Beads Viewer opens its board on `b`, moves with `h`, `l`, `j` and `k`, and cycles swimlane modes with `s`. It filters with `o`, `c` and `r` for open, closed and ready. [VERIFIABLE][^63]

Adoption differs widely across these tools. lazygit has 83,181 stars and k9s 34,814. dooit has 2,962, taskwarrior-tui 2,142 and `kanban-tui` 286. [VERIFIABLE][^59]

### 9.2 The constraints of a mod pane

`Box`, `Text`, `Button`, `Link`, `Code` and `Markdown` draw everywhere. `Input` and `Select` draw in the terminal and Desktop. `Raster` and `Image` draw in the terminal only. [VERIFIABLE][^34]

`Client` is "A region drawn by a second file of yours, for animation and pointer input". It draws in the terminal and Desktop. [VERIFIABLE][^34]

Claude Code routes keys to a mod's controls only while its pane has focus. "A mod can't bind Tab or the arrow keys to anything else." A hotkey is "one digit or one lowercase letter", and Esc "Returns keyboard focus to the prompt". [VERIFIABLE][^34]

A pane takes focus only "while the prompt is empty and nothing else has keyboard focus". A pane the mod opens unprompted needs a terminal at least 144 columns wide. [VERIFIABLE][^34]

`holdToasts: true` exists for "a dialog the user answers and leaves". The permission prompt is not a render site, though `AskUserQuestion` is. [VERIFIABLE][^34]

### 9.3 Which patterns translate

| Terminal pattern | Precedent | Translation into a mod pane |
| --- | --- | --- |
| Move card between columns with `H`/`L` | `kanban-tui` [VERIFIABLE][^52] | Uppercase is not a valid hotkey; use lowercase letter buttons or a `Move to` `Select` [VERIFIABLE][^34] [INFERENCE] |
| Mouse drag between columns | `kanban-tui` [VERIFIABLE][^52] | Only inside a `Client` region with pointer input; leg B must confirm drag is feasible [VERIFIABLE][^34] [INFERENCE] |
| Confirm delete, skip confirm on a separate key | k9s Ctrl-D and Ctrl-K [VERIFIABLE][^80] | A focused confirm pane opened with `holdToasts`; Enter confirms and Esc returns focus [VERIFIABLE][^34] [INFERENCE] |
| Mark then bulk act | taskwarrior-tui `v` and `V` [VERIFIABLE][^78] | Lowercase hotkey `v` on a button; uppercase `V` needs another key [INFERENCE] |
| Filter with `/` | k9s, taskwarrior-tui [VERIFIABLE][^78][^80] | `/` is not a valid hotkey; an `Input` filter field instead [VERIFIABLE][^34] [INFERENCE] |
| Command mode with `:` | k9s [VERIFIABLE][^80] | Mod-registered slash commands such as `/beads-board` [VERIFIABLE][^34] [INFERENCE] |
| Cycle swimlanes with `s` | Beads Viewer [VERIFIABLE][^63] | Direct: lowercase `s` is a valid hotkey [INFERENCE] |
| Help on `?` | lazygit, dooit [VERIFIABLE][^79][^81] | `?` is not a valid hotkey; a help button or a digit [INFERENCE] |
| Inline charts | Terminal dashboards | `Raster` cells for sparklines and heat maps [VERIFIABLE][^34] |

The mod also loses one thing every full-screen TUI has. Claude Code's prompt shares the screen and takes Esc, so the pane is a side panel and not the whole application. [INFERENCE]

### Hand-offs

- Leg B: whether a `Client` region can receive uppercase keys or `/` through its own key handler, which would relax the hotkey limits above.
- Leg B: whether pointer events in a `Client` carry enough position data to implement drag between columns.
- Leg C: whether `kanban-tui`'s reading of `~/.claude/tasks/` matches the Claude Code task panel data leg C measures.

## Gaps, blindspots and emergent findings

### Five-perspective critic pass

A conventional reviewer would note missing coverage of a dependency-graph view, notifications and search syntax. `bd` has `graph`, `search` and `query` commands. [VERIFIABLE][^32] UX evidence for those views was not gathered, and this gap is conceded.

A contrarian reviewer raises two challenges. The first is that a Jira clone is the wrong frame for agent work. Vibe Kanban's sunset and Linear's and GitHub's session panels put sessions and queues first. [VERIFIABLE][^49][^50][^51] §4.3 and §5 carry that evidence, and the choice stays open for the design stage.

The second contrarian challenge is that `mantoni/beads-ui` already exists, is MIT, and released in August 2026. [VERIFIABLE][^21][^59] Forking it or contributing to it would reach a working web UI sooner than a rebuild. Its stack is lit-html and Express, with no React. [INFERENCE] That is a decision for the coordinator.

A historical reviewer points at sustainability. Focalboard is unmaintained, hosted Huly shut down, and Vibe Kanban is sunsetting. [VERIFIABLE][^51][^60][^61] Large project-management UIs are costly to keep alive, which supports the MVP-first phasing Sergei already asked for. [INFERENCE]

An adjacent-field reviewer notes that the most-adopted terminal tools are dense single-purpose views that confirm destructive actions. lazygit and k9s are examples. [VERIFIABLE][^59][^80] That supports a focused TUI MVP over Jira parity. [INFERENCE]

A skeptic raises four limits, all conceded:

- Most product evidence is vendor documentation. It says what a feature does, not whether users like it, and reviewer sites were blocked.
- Star counts and release dates are a one-time snapshot from 2026-10-15.
- GitHub-hosted quotes were checked by exact local grep. Other quotes were checked by a second, model-mediated fetch that answered FOUND or NOT FOUND. That pass caught two non-literal quotes, both corrected.
- Claims about `bd` rest on its help text, and none was exercised against live data.

### Unresolved blindspots

- Reviewer sentiment. G2 returned 403 and Reddit refused the fetch, so "what users praise" rests on documented features, not user reports.
- Jira timeline and delete behaviour, Asana timeline, and Todoist and Asana restore. The pages tried returned 404 or redirected.
- Linear's Cmd K binding. Its keyboard-shortcuts page returned 404.
- AWS CDK, Copilot, App Runner and Helm templates were not researched in this run, for lack of time.
- Multi-item drag in dnd-kit and Pragmatic drag and drop. No fetched page documented it.
- Pointer drag inside a mod `Client`, and drag inside an MCP App iframe on Claude Desktop. Both belong to leg B.
- The Beads Viewer rider's reach. This packet makes no legal finding.
- Dolt commit churn per reorder, and recovery of a deleted issue from Dolt history. Both are inferences, unmeasured.

### Emergent findings beyond the question list

These go beyond the questions, which counters anchor bias:

- `bd` already has a conflict guard, an atomic batch, a delete preview, an HTTP server and lease commands.
- Two existing Beads front ends collide with the proposed names.
- One of them carries a licence rider aimed at Anthropic.
- This store has nine statuses, more than the five the brief listed.
- `kanban-tui` already reads Claude Code's task files.
- `bd serve` skips hooks on HTTP writes.
- shadcn/ui changed its default primitives in July 2026.

### Founding ask alignment

| Entry | Requirement | Where covered | Disposition |
| --- | --- | --- | --- |
| A001 | Drag, move, rearrange, reorder, sort | §1, §2 | Covered |
| A001 | Kanban board, sprints, backlog | §1, §2.3 | Covered; sprint storage handed to leg C |
| A001 | Jira, Linear, Todoist, Asana and other UX | §1 | Covered; Jira and Asana timelines not verified |
| A001 | Create and update tasks | §3.5 | Covered |
| A001 | Delete with an "are you sure?" double-check page | §3 | Covered |
| A001 | Burndown, productivity metrics, dashboards | §4 | Covered |
| A001 | View every Claude Code session's tasks | §5 | Covered for UX; identity and panel data handed to leg C |
| A001 | Timeline or roadmap view like Jira's | §1.1, §2.3, §6.5 | Narrowed: Jira's own timeline unverified, GitHub, Plane and OpenProject used instead |
| A001 | Mouse control in the TUI | §9 | Narrowed: pointer input exists only in a `Client` region; feasibility handed to leg B |
| A001 | Retire the Claude Code task panel, per-machine config | none | Out of this leg; leg C |
| A001 | Open source, public repo, no secrets | §7 | Licence implications covered; nothing secret in this packet |
| A002 | Name `beads-ui`, alias `bv` | §7.3 | Flagged: both collide with existing tools |
| A002 | Shared components for TUI, MCP App and web app | §6, §9 | Narrowed: web and MCP App can share React components; the mod shares data and view logic only |
| A002 | Mobile and desktop repos | none | Out of scope by the brief |
| A003 | Research the web app, MCP App and TUI first | all sections | Covered for this leg's topics |
| A004 | Fold in the autonomous task queue dashboard | §5 hand-offs | Deferred to leg C and the coordinator |

This packet adds one section the brief's structure did not list. The `docs/research/README.md` convention on `origin/main` requires an `## Appendix: Research Prompt`. It sits before the ledger, as in the canonical template. To stay under the 900-line cap, it points to the full prompt in a sibling evidence file.

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
[^21]: Antoni, M. (2026). [beads-ui README](https://github.com/mantoni/beads-ui), [package.json](https://github.com/mantoni/beads-ui/blob/main/package.json) and [npm registry record for `beads-ui`](https://registry.npmjs.org/beads-ui). GitHub and npm. README and package.json read raw via `ghp api` (HTTP 200) and registry fetched (HTTP 200) 2026-10-15. (Install and `bdui` command, views, live updates, keyboard editing; Express 5, lit-html and ws dependencies; npm owner and bin name.)
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
[^32]: beads-ui contributors. (2026). [bd 1.3.0 help output: delete and update](https://github.com/sergeiwallace/beads-ui/blob/f9e4b48acf42076e813828b0df4f3006677ead6b/docs/research/findings/evidence/bd-1.3.0-delete-and-update-help.md). beads-ui repository, tracked evidence file `docs/research/findings/evidence/bd-1.3.0-delete-and-update-help.md` (commit permalink). Captured locally 2026-10-15; fetched from GitHub after push. (Local measurement of `bd --version`, `bd --help`, `bd delete --help`, `bd update --help`, `bd serve --help`, `bd batch --help` and `bd statuses`.)
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

## Appendix: Research Prompt

Registry ID: none (coordinator brief for BU-mg2.1.1; no registry entry was created for this leg)

Model: `us.anthropic.claude-opus-5-5`

Date: 2026-10-15

The full prompt text is in [`evidence/beads-ui-task-manager-ux-prompt.md`](evidence/beads-ui-task-manager-ux-prompt.md), reproduced verbatim from the coordinator's brief.

## Appendix: Provenance Ledger

Every row is SUPPORTED, and every URL was live on 2026-10-15. GitHub-hosted quotes were matched by exact local grep of the raw file. Other quotes were confirmed by a second fetch that answered FOUND or NOT FOUND. The `bd` quotes match the tracked evidence file. API quotes are field values from the JSON response. Claims that only restate an earlier row, such as the §1.2, §4.4, §8.1, §8.3 and §9.3 table cells, are covered by that earlier row.

| Claim | Source URL | Verbatim quote | Verdict | Live? |
| --- | --- | --- | --- | --- |
| S1 `bv` and npm `beads-ui` taken | https://github.com/Dicklesworthstone/beads_viewer ; https://registry.npmjs.org/beads-ui | "brew install dicklesworthstone/tap/bv" ; "bdui" | SUPPORTED | yes |
| S2 Beads Viewer rider | https://github.com/Dicklesworthstone/beads_viewer/blob/main/LICENSE | "no rights are granted to any Restricted Party" | SUPPORTED | yes |
| S3 `bd` primitives | evidence permalink [^32] | "another actor won the race" ; "Preview before deleting:" ; "Serve the beads HTTP API" | SUPPORTED | yes |
| S4 drag as guarded write | https://github.com/rocicorp/fractional-indexing ; TanStack [^30] ; [^32] | "Generate a single key in between two points." ; "use the `onMutate` option to update your cache directly" ; "--set-metadata stringArray" | SUPPORTED | yes |
| S5 sharing split | [^34] ; [^76] | "A mod can't bind Tab or the arrow keys to anything else" ; "you can use any framework or none at all" | SUPPORTED | yes |
| S6 agent metrics and delegate | [^44] ; [^46] ; [^49] | "The number of work items started but not finished" ; "claude_code.cost.usage" ; "sets it as the `delegate`, not the `assignee`" | SUPPORTED | yes |
| S7 component signals | [^26] ; [^27] ; [^53] ; [^54] ; [^57] | "Licensed under the Apache License, Version 2.0" ; "deprecated on `npm`" ; "Starting today, Base UI is the default component library in shadcn/ui" ; "Custom License - All Rights Reserved" | SUPPORTED | yes |
| S8 hosting | [^21] ; [^32] ; [^51] ; [^70] ; [^73] | "npm i beads-ui -g" ; "No TLS" ; "npx vibe-kanban" ; "Cloudflare clones your source repository into the user's GitHub/GitLab account" ; "requires that you enable HTTPS" | SUPPORTED | yes |
| Jira swimlane methods | https://support.atlassian.com/jira-software-cloud/docs/configure-swimlanes/ | "A swimlane is a horizontal categorization of work items" | SUPPORTED | yes |
| Jira soft column constraints | https://support.atlassian.com/jira-software-cloud/docs/configure-columns/ | "don't have any impact on the number of work items displayed" | SUPPORTED | yes |
| Jira backlog rank and bulk edit | https://support.atlassian.com/jira-software-cloud/docs/use-your-kanban-backlog/ | "Drag and drop a work item to rank it." ; "This will open the bulk edit sidebar." | SUPPORTED | yes |
| Jira drag into sprint | https://support.atlassian.com/jira-software-cloud/docs/use-your-scrum-backlog/ | "Drag and drop a work item from the Backlog section to the relevant sprint section" | SUPPORTED | yes |
| Linear grouping, rows, Cmd B | https://linear.app/docs/board-layout | "teams, cycles, assignee, lead, initiative or project health" ; "switch to board layout (or back to list)" | SUPPORTED | yes |
| Linear shared manual order | https://linear.app/docs/display-options ; https://linear.app/docs/board-layout | "Manual ordering is unique in that it will update the manual order for everyone in the workspace" ; "cannot be ordered independently" | SUPPORTED | yes |
| Linear command menu entry | https://linear.app/docs/display-options | "Show display options" | SUPPORTED | yes |
| Linear empty-groups toggle | https://linear.app/docs/display-options | "shows groups with no issues" | SUPPORTED | yes |
| Linear cycles | https://linear.app/docs/use-cycles | "Cycles are time-boxed periods where a team works on completing a pre-defined set of work" | SUPPORTED | yes |
| Linear cycles keep nothing unfinished | https://linear.app/docs/use-cycles | "no way to keep unfinished issues in a closed cycle" | SUPPORTED | yes |
| Linear cycle snapshots | https://linear.app/docs/use-cycles | "Completed cycle graphs and statistics are preserved as historical snapshots" | SUPPORTED | yes |
| Linear sub-issue auto-close | https://linear.app/docs/parent-and-sub-issues | "When all sub-issues are marked as done, the parent issue will also be marked as done automatically" | SUPPORTED | yes |
| Linear custom views | https://linear.app/docs/custom-views | "durable filtered views of issues, projects, or initiatives that you can save and share" | SUPPORTED | yes |
| Linear selection | https://linear.app/docs/select-issues | "use Cmd/Ctrl A to select all issues on a board or list" | SUPPORTED | yes |
| Todoist Quick Add and sigil change | https://www.todoist.com/help/articles/use-task-quick-add-in-todoist-va4Lhpzz | "is planned to be retired by the end of 2026" ; "% followed by the label name" | SUPPORTED | yes |
| Asana Workload | https://asana.com/features/resource-management/workload | "When someone is over capacity, their bar turns red, highlighting overload" | SUPPORTED | yes |
| GitHub board columns | https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout | "you choose any single select or iteration field for your columns" | SUPPORTED | yes |
| GitHub soft limits | same as above | "Setting a limit does not restrict anyone from adding cards that would exceed the column's limit" | SUPPORTED | yes |
| GitHub drag applies value | same as above | "If you drag an item to a new column, the value of that column is applied to the dragged item" | SUPPORTED | yes |
| GitHub roadmap drag | https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-roadmap-layout | "drag items to affect their start and target dates or selected iteration" | SUPPORTED | yes |
| GitHub iteration field | https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-iteration-fields | "Iterations can be set to any length of time, can include breaks" | SUPPORTED | yes |
| Plane layouts and board drag | https://docs.plane.so/core-concepts/issues/layouts | "Drag and drop cards between columns to reflect progress" ; "great for bulk editing" | SUPPORTED | yes |
| Plane calendar by due date | same as above | "The Calendar layout maps out your work items by their due dates" | SUPPORTED | yes |
| Plane cycles charts | https://docs.plane.so/core-concepts/cycles | "The burn-down chart gives you a clear visual of how much work remains in your cycle" ; "transfer any unfinished work items to an active or upcoming cycle" | SUPPORTED | yes |
| OpenProject pushes followers | https://www.openproject.org/docs/user-guide/gantt-chart/ | "Moving a predecessor past the start date of the follower will automatically push the follower into the future" | SUPPORTED | yes |
| GitHub command palette | https://docs.github.com/en/get-started/accessibility/github-command-palette | "You can navigate, search, and run commands on GitHub with the GitHub Command Palette" | SUPPORTED | yes |
| cmdk description and Radix | https://github.com/dip/cmdk | "a command menu React component that can also be used as an accessible combobox" ; "Composes Radix UI's Dialog component." | SUPPORTED | yes |
| Beads web UI inline edit | https://github.com/mantoni/beads-ui | "Filter and search issues, edit inline" | SUPPORTED | yes |
| Jira unmapped statuses | https://support.atlassian.com/jira-software-cloud/docs/configure-columns/ | "Unmapped statuses will hide work items both in your board view and backlog view" | SUPPORTED | yes |
| Jira column to status mapping | same as above | "By default, a board's columns are mapped to the default Jira statuses" | SUPPORTED | yes |
| `bd statuses` categories | evidence permalink [^32] | "Custom statuses:" ; "Built-in statuses:" | SUPPORTED | yes |
| `bd` close refusal | evidence permalink [^32] | "despite open children or a live blocker" | SUPPORTED | yes |
| Figma fractional index | https://www.figma.com/blog/realtime-editing-of-ordered-sequences/ | "Every object has a real number as an index" | SUPPORTED | yes |
| Fractional-indexing jitter | https://github.com/rocicorp/fractional-indexing | "To minimize the likelihood of index collisions when generating fractional indexes concurrently" | SUPPORTED | yes |
| `bd` metadata flags, due and defer | evidence permalink [^32] | "Set custom metadata (JSON string or @file.json to read from file)" ; "Due date/time (empty to clear)" | SUPPORTED | yes |
| Frappe dependency move | https://github.com/frappe/gantt | "Whether moving a task automatically moves its dependencies." | SUPPORTED | yes |
| `bd update` not atomic | evidence permalink [^32] | "Updates are applied per issue ID, not atomically across IDs" | SUPPORTED | yes |
| `bd batch` transaction and keys | evidence permalink [^32] | "All operations execute inside a single dolt transaction" ; "Supported 'update' keys: status, priority, title, assignee, force" | SUPPORTED | yes |
| WCAG 2.5.7 | https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html | "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging" | SUPPORTED | yes |
| Atlassian drag alternatives | https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines | "we recommend not leveraging directional controls (arrow keys)" ; "Draggable entities should have a button that can be used to trigger an inline menu containing outcomes" | SUPPORTED | yes |
| Atlassian announcements | same as above | "Messages should contain the name of the item being moved, as well as its old and new position" | SUPPORTED | yes |
| dnd-kit keyboard and announcements | https://dndkit.com/legacy/guides/accessibility/ | "The arrow keys are used to move the draggable item in any given direction" ; "Picked up draggable item" | SUPPORTED | yes |
| TanStack optimistic routes | https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates | "leverage the returned `variables` to update your UI" ; "Always refetch after error or success" | SUPPORTED | yes |
| HTTP If-Match | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/If-Match | "can be used to prevent the lost update problem" | SUPPORTED | yes |
| `bd` guard exit 13 | evidence permalink [^32] | "a mismatch writes nothing and exits 13" | SUPPORTED | yes |
| Mods `$.store` race | https://code.claude.com/docs/en/plugins/mods/interface.md | "A `get` followed by a `set` isn't atomic" | SUPPORTED | yes |
| NN/g confirmation | https://www.nngroup.com/articles/confirmation-dialog/ | "consider a confirmation dialog before actions that cannot be undone" ; "Do not use confirmation dialogs for routine actions" | SUPPORTED | yes |
| Atlassian modal focus | https://atlassian.design/components/modal-dialog/usage | "When the modal is closed, focus should return to the element that triggered the modal" | SUPPORTED | yes |
| Linear delete window | https://linear.app/docs/delete-archive-issues | "Recently deleted issues are stored in the archives for 30 days" | SUPPORTED | yes |
| Linear auto-archive | same as above | "Closed issues are auto-archived after they have remained completed, canceled, or auto-closed and inactive" | SUPPORTED | yes |
| GitHub typed delete and restore | https://docs.github.com/en/repositories/creating-and-managing-repositories/deleting-a-repository | "type the name of the repository you want to delete" ; "Some deleted repositories can be restored within 90 days of deletion" | SUPPORTED | yes |
| `bd delete` permanent | evidence permalink [^32] | "This is a destructive operation that cannot be undone." | SUPPORTED | yes |
| `bd delete` preview and cascade | evidence permalink [^32] | "Fails if any issue has dependents not in deletion set" ; "Recursively delete all dependent issues" | SUPPORTED | yes |
| `bd` soft exits and prune | evidence permalink [^32] | "Reopen one or more closed issues" ; "Delete old closed beads to reclaim space" | SUPPORTED | yes |
| `bd serve` sweep | evidence permalink [^32] | "nothing it deletes comes back" | SUPPORTED | yes |
| Mod `Input` submit | https://code.claude.com/docs/en/plugins/mods/interface.md | "runs your `onSubmit` callback with the text when the user presses Enter" | SUPPORTED | yes |
| Jira burndown | https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-burndown-chart/ | "A Burndown Chart shows the actual and estimated amount of work to be done in a sprint" ; "The vertical axis represents the estimation statistic that you have configured for your board" | SUPPORTED | yes |
| Jira CFD | https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-cumulative-flow-diagram/ | "widening vertically over time" | SUPPORTED | yes |
| Jira control chart | https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-control-chart/ | "The rolling average (blue line on the chart) is work-based, not time-based" | SUPPORTED | yes |
| Linear Insights measures | https://linear.app/docs/insights | "Time from issue start to completion" ; "Time issue spent in Triage status" ; "cumulative flow diagrams" | SUPPORTED | yes |
| GitHub burn up | https://docs.github.com/en/issues/planning-and-tracking-with-projects/viewing-insights-from-your-project/about-insights-for-projects | "allows you to visualize the progress of your issues over time" | SUPPORTED | yes |
| Kanban Guide measures | https://kanbanguides.org/english/ | "The number of work items finished per unit of time" ; "queuing theory" | SUPPORTED | yes |
| Scrum Guide forecasting | https://scrumguides.org/scrum-guide.html | "these do not replace the importance of empiricism" | SUPPORTED | yes |
| `bd` estimate, leases, session | evidence permalink [^32] | "Time estimate in minutes" ; "Revert stale-lease in_progress issues back to ready (dead-worker recovery)" ; "Claude Code session ID for status=closed" | SUPPORTED | yes |
| Claude Code cost metric | https://code.claude.com/docs/en/monitoring-usage | "Cost of the Claude Code session" ; "OTEL_METRICS_INCLUDE_SESSION_ID" | SUPPORTED | yes |
| Linear My Issues | https://linear.app/docs/my-issues | "assigned to you, created by you, to which you are subscribed, and issues with recent activity" | SUPPORTED | yes |
| Linear delegate views | https://linear.app/docs/agents-in-linear | "to monitor agent involvement on specific types of issues or workflows" | SUPPORTED | yes |
| Linear agent sessions | https://linear.app/developers/agents | "Emit a `thought` activity within 10 seconds" ; "Session state is visible to users" | SUPPORTED | yes |
| GitHub agent sessions | https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions | "Track sessions from the agents panel (available from any page on GitHub) or from the agents page" | SUPPORTED | yes |
| Vibe Kanban sunset | https://github.com/BloopAI/vibe-kanban | "Vibe Kanban is sunsetting." | SUPPORTED | yes |
| kanban-tui Claude backend | https://github.com/Zaloog/kanban-tui | "Boards are created for each session ID." | SUPPORTED | yes |
| `bd` claim, actor, events | evidence permalink [^32] | "Atomically claim the issue" ; "Actor name for audit trail" ; "Read and manage the durable events journal" | SUPPORTED | yes |
| Mod element tree | https://code.claude.com/docs/en/plugins/mods/interface.md | "What a `ui.render` hook returns is an element tree" | SUPPORTED | yes |
| Library signals | https://api.github.com/graphql [^53] | `"nameWithOwner":"clauderic/dnd-kit","stargazerCount":17711` ; `"nameWithOwner":"dip/cmdk"` ; `"pushedAt":"2025-10-10T13:08:24Z"` (Tremor) | SUPPORTED | yes |
| vis-timeline licence | https://github.com/visjs/vis-timeline | "SPDX-License-Identifier: Apache-2.0 OR MIT" | SUPPORTED | yes |
| Pragmatic DnD adoption | https://github.com/atlassian/pragmatic-drag-and-drop | "powering some of the biggest products on the web" ; "Tiny: ~`4.7kB` core" | SUPPORTED | yes |
| dnd-kit sortables | https://dndkit.com/ | "can be reordered within and across lists" ; "Framework agnostic" | SUPPORTED | yes |
| Tremor model | https://github.com/tremorlabs/tremor | "Built on top of Tailwind CSS and Radix UI" | SUPPORTED | yes |
| SVAR React Gantt | https://github.com/svar-widgets/react-gantt | "React 19 compatibility" ; "The ability to drag tasks from a backlog" ; "open-source core" | SUPPORTED | yes |
| Mod `Raster` for charts | https://code.claude.com/docs/en/plugins/mods/interface.md | "For a heat map, a sparkline, or a game board in the terminal" | SUPPORTED | yes |
| Clone signals | https://api.github.com/graphql [^59] | `"nameWithOwner":"makeplane/plane","stargazerCount":60851` ; `"nameWithOwner":"sergeiwallace/beads-ui"` | SUPPORTED | yes |
| Huly hosted shutdown | https://github.com/hcengineering/platform | "Hosted Huly has shut down." | SUPPORTED | yes |
| Focalboard unmaintained | https://github.com/mattermost-community/focalboard | "This repository is currently not maintained." | SUPPORTED | yes |
| Planka licence | https://github.com/plankanban/planka/blob/master/LICENSE.md | "operating PLANKA as a hosted service for third parties for any commercial gain whatsoever is prohibited" | SUPPORTED | yes |
| Beads front-end search | https://api.github.com/search/repositories [^65] | `total_count` 36 ; "VS Code extension for Beads Viewer (bv)" | SUPPORTED | yes |
| Beads web UI views and stack | https://github.com/mantoni/beads-ui | "Blocked / Ready / In progress / Closed columns" ; `"express": "^5.2.1"` | SUPPORTED | yes |
| npm package owner | https://registry.npmjs.org/beads-ui | "git+https://github.com/mantoni/beads-ui.git" | SUPPORTED | yes |
| Beads Viewer robot mode and keys | https://github.com/Dicklesworthstone/beads_viewer | "Use ONLY --robot-* flags" ; "Cycle swimlane mode (Status → Priority → Type)" | SUPPORTED | yes |
| Beads Viewer rider scope | https://github.com/Dicklesworthstone/beads_viewer/blob/main/LICENSE | "analyzing, indexing, or incorporating" ; "evaluation harness" | SUPPORTED | yes |
| Plane installer and size | https://developers.plane.so/self-hosting/methods/docker-compose | "curl -fsSL -o setup.sh https://github.com/makeplane/plane/releases/latest/download/setup.sh" ; "4GB" | SUPPORTED | yes |
| Vikunja SQLite | https://vikunja.io/docs/full-docker-example/ | "You can also remove the db section" | SUPPORTED | yes |
| `bd serve` contract | evidence permalink [^32] | "for automation clients that would otherwise fork a bd subprocess per call" ; "off by default on loopback" ; "--allow-non-loopback REQUIRES a token file" ; "Hooks do not fire." | SUPPORTED | yes |
| Railway template button | https://docs.railway.com/guides/publish-and-share | "click the publish button and fill out the form to publish your template" | SUPPORTED | yes |
| Render Blueprint | https://render.com/docs/infrastructure-as-code | "at the root of your repo" | SUPPORTED | yes |
| Fly Launch | https://docs.fly.io/launch | "Fly Launch helps you configure and orchestrate your app" | SUPPORTED | yes |
| Cloudflare provisioning | https://developers.cloudflare.com/workers/platform/deploy-buttons/ | "are automatically provisioned and bound to the Worker" | SUPPORTED | yes |
| Vercel Deploy Button | https://vercel.com/docs/deploy-button | "The Deploy Button allows users to deploy a new project through the Vercel Project creation flow" | SUPPORTED | yes |
| Tailscale identity headers | https://tailscale.com/kb/1312/serve | "These identity headers are not populated for traffic originating from tagged devices" | SUPPORTED | yes |
| oauth2-proxy | https://oauth2-proxy.github.io/oauth2-proxy/ | "A reverse proxy and static file server that provides authentication using Providers (Google, GitHub, and others)" | SUPPORTED | yes |
| Caddy basic auth | https://caddyserver.com/docs/caddyfile/directives/basic_auth | "basic auth is not secure over plain HTTP" | SUPPORTED | yes |
| Auth project signals | https://api.github.com/graphql [^77] | `"stargazerCount":15185` (oauth2-proxy) ; "lets users sign in to your applications with passkeys" | SUPPORTED | yes |
| MCP App delivery and hosts | https://modelcontextprotocol.io/docs/extensions/apps | "This resource contains an HTML page, often bundled with its JavaScript and CSS for simplicity." ; "MCP Apps are currently supported by" | SUPPORTED | yes |
| kanban-tui mouse and MCP | https://github.com/Zaloog/kanban-tui | "Movement between columns and reordering within a column are also supported via mouse drag and drop." ; "can be run as a local mcp server" | SUPPORTED | yes |
| taskwarrior-tui keys | https://kdheepak.com/taskwarrior-tui/keybindings/ | "x: task {selected} delete" ; "v: {toggle mark on selected}" | SUPPORTED | yes |
| lazygit mouse caveat | https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md | "When mouse events are captured, it's a little harder to select text" | SUPPORTED | yes |
| k9s delete versus kill | https://k9scli.io/topics/commands/ | "TAB and ENTER to confirm" ; "no confirmation dialog" | SUPPORTED | yes |
| dooit keys | https://github.com/dooit-org/dooit | "Vim like keybindings" | SUPPORTED | yes |
| TUI adoption | https://api.github.com/graphql [^59] | `"nameWithOwner":"jesseduffield/lazygit","stargazerCount":83181` | SUPPORTED | yes |
| Mod elements by surface | https://code.claude.com/docs/en/plugins/mods/interface.md | "A text field and a dropdown" ; "A region drawn by a second file of yours, for animation and pointer input" | SUPPORTED | yes |
| Mod keys and focus | same as above | "one digit or one lowercase letter" ; "while the prompt is empty and nothing else has keyboard focus" | SUPPORTED | yes |
| Mod dialogs and prompts | same as above | "a dialog the user answers and leaves" ; "The permission prompt isn't a render site" | SUPPORTED | yes |
| Mod slash commands | same as above | "await $.command.register({ name: 'hello-tabs'" | SUPPORTED | yes |
| `bd` graph, search, query | evidence permalink [^32] | "Display issue dependency graph" ; "Search issues by text query" | SUPPORTED | yes |

## Run History

- 2026-10-15, `us.anthropic.claude-opus-5-5`, effort high, leaf researcher for the aih-3 coordinator. Searched vendor docs for Jira, Linear, Todoist, Asana, GitHub Projects, Plane and OpenProject. Also searched drag, accessibility and concurrency references, the Claude Code mods and MCP Apps docs, hosting and auth docs, terminal tools, and GitHub metadata through `ghp api`, plus read-only `bd` 1.3.0 help in this repo. 81 sources cited from about 140 retrievals through WebFetch and `ghp api`. Failures, all excluded from VERIFIABLE: 11 HTTP 404 (Linear `cycles`, `keyboard-shortcuts` and `command-menu`; Atlassian timeline ×2, delete ×2 and LexoRank; Asana timeline feature page and workload help; Render deploy button), 1 HTTP 403 (G2), 1 fetch refused (Reddit), 1 page with no body text (Atlassian timeline guide), 2 HTTP 301 (Asana guide to help home, not followed; Fly docs, followed). Bing returned no on-topic results for 5 queries. The second-pass quote check returned NOT FOUND for 2 quotes, both corrected.
