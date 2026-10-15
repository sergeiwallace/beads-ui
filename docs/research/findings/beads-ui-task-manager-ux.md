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

(drafting)

## 2. Drag semantics

(drafting)

## 3. Create, edit and delete flows

(drafting)

## 4. Sprint and flow metrics, dashboards and widgets

(drafting)

## 5. Cross-assignee views

(drafting)

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
[^32]: beads-ui contributors. (2026). [bd 1.3.0 help output: delete and update](https://github.com/sergeiwallace/beads-ui/blob/wt/aih-3/bu-research-leg-beads-mruv/docs/research/findings/evidence/bd-1.3.0-delete-and-update-help.md). beads-ui repository, tracked evidence file `docs/research/findings/evidence/bd-1.3.0-delete-and-update-help.md`. Captured locally 2026-10-15. (Local measurement of `bd delete --help` and `bd update --help`.)
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
