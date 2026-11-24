---
title: "Beads UI responsive layout and app shell"
category: design
tags: [design, beads-ui, web-app, responsive-layout, navigation]
status: draft
source: "aido-stub"
template_version: "design-1.0.0"
delegation_provenance:
  version: 2
  contributors: []
task: BU-w2g
stub: false
---
<!-- Full structure: see TEMPLATE.md in this directory -->

# Beads UI responsive layout and app shell — Design Document

## Founding Ask Coverage

`founding_ask_ref`: N/A (Tier 0 bounded design stage; the original request is recorded on BU-w2g)

This coverage index follows the supplied brief. The original task record governs.

| Brief requirement | Coverage |
|---|---|
| Fit the board and make tiles, rows and tabs adapt to window size and zoom | [Root cause](#root-cause) and [Phase 1](#phase-1-responsive-layout) |
| Expand, collapse and pin a left project panel, with hover preview and a top search bar | [App shell](#app-shell), [D-1](#d-1), [D-2](#d-2) and [Phase 2](#phase-2-app-shell) |
| Find everything this host or machine pair can expose through Beads UI | [Project discovery](#project-discovery), [D-3](#d-3) and [Phase 3](#phase-3-unified-project-view) |
| Keep the top bar on one row at zoom, move actions into menus as space runs out, and use established components for the shell and icon rail | [Top bar](#top-bar), [App shell](#app-shell) and [Build order](#build-order). The [research coverage index](../research/beads-ui-ui-libraries-and-responsive-shell.md#founding-ask-coverage) identifies the verbatim follow-up and tracks its wider app scope. |

**Status:** DRAFT

**Created:** 2026-11-20

<!-- doc:region name="overview" kind="replaceable" -->

## Table of Contents

- [Founding Ask Coverage](#founding-ask-coverage)
- [Table of Contents](#table-of-contents)
- [Executive Summary](#executive-summary)
- [Summary for a wide audience](#summary-for-a-wide-audience)
- [Problem Statement](#problem-statement)
- [Design Overview](#design-overview)
- [Architecture](#architecture)
  - [Root cause](#root-cause)
  - [Responsive layout](#responsive-layout)
  - [Top bar](#top-bar)
  - [App shell](#app-shell)
  - [Project discovery](#project-discovery)
  - [Current server inventory](#current-server-inventory)
- [Data Model](#data-model)
- [Integration](#integration)
- [Implementation Phases](#implementation-phases)
  - [Build order](#build-order)
  - [Phase 1: Responsive layout](#phase-1-responsive-layout)
  - [Phase 2: App shell](#phase-2-app-shell)
  - [Phase 3: Unified project view](#phase-3-unified-project-view)
- [Implementation Audit](#implementation-audit)
- [Risks and Mitigations](#risks-and-mitigations)
- [Design Decisions](#design-decisions)
  - [Decision Summary](#decision-summary)
  - [Decision Details](#decision-details)
  - [D-1: Navigation ownership](#d-1)
  - [D-2: Sidebar expansion and layout](#d-2)
  - [D-3: Project inventory and document discovery](#d-3)
- [Open Questions](#open-questions)
- [Feedback Rounds](#feedback-rounds)
- [Approval Log](#approval-log)

## Executive Summary

Five Board columns should fit at a 1440 CSS px viewport with default text size and 100% browser zoom. At higher zoom or in smaller windows, text and controls adapt to the space available, and the board switches to a vertical layout when it gets too narrow. This layout work ships before the new navigation. The proposed shell puts project navigation in a collapsible left panel and app-wide search and account actions at the top. The proposed Projects page brings together the stores, views, documents and sessions this deployment can serve. The orchestrating Opus session ruled option (a) on the shell and Projects decisions (D-1 to D-3) on 2026-11-21; Sergei reviews them after they are live.

## Summary for a wide audience

The layout update makes the board use the available width and lets you enlarge text while keeping controls usable. The top bar stays on one row, with menus for actions that need more space. The left panel gives you a place to switch projects and views. Open Projects to see what is available on the current Beads UI deployment.

## Problem Statement

Board columns keep a fixed width while the available working area changes. Other views adapt at different window widths or depend on horizontal scrolling, so resizing the browser produces different results across tabs. The single header also serves as a store switcher, tab strip, command launcher and account control, and there is no entry point that inventories the host's resources.

## Design Overview

**Status:** Design draft. Fill in the deployed behavior and any deviations when the implementation audit closes.

## Architecture

### Root cause

- **Column sizing.** `apps/web/client/main.tsx:3–5` loads the theme, shared component CSS and app CSS. `apps/web/client/App.tsx:1067–1083` renders Board directly in the main region. `apps/web/client/app.css:1–85` leaves main at its default block sizing. `packages/web-ui/src/Board.tsx:273–278` renders one section per status, including empty columns. `packages/web-ui/src/web-ui.css:54–70` makes the board a single flex row with a `0.75rem` gap, `0.75rem` padding, local horizontal scrolling and snap points. Each column uses `flex: 0 0 18rem` with zero grow and shrink factors and `max-width: 85vw` against the window. At a 16px root font, ordinary columns under the cap are about 290 CSS px including borders. Five need about 1,522 CSS px with gaps and padding. At the left edge about 459 CSS px shows one full column and half the next. A long unbreakable card title or status can also increase the automatic minimum width above the basis until the cap. The reported count is consistent with these rules. The original viewport, zoom and content are unknown. [CSS Flexbox automatic minimum size](https://www.w3.org/TR/css-flexbox-1/#min-size-auto)
- **Card and row sizing.** `packages/web-ui/src/Board.tsx:108–167,197–227` renders the title link, ID, repository, priority, owner and Move to inside status sections and card list items. In `packages/web-ui/src/web-ui.css:77–107,141–185,612–617`, the heading and card metadata use flex rows without wrapping, the title has no long-token wrapping or line limit, the repository stays on one ellipsized line, and the owner trigger is capped at `12rem` with no wrap. The Backlog and Sprint list use `Backlog.tsx:88–165,186–217`, an intrinsic-width table inside an overflow wrapper with row actions in a non-wrapping flex group (`web-ui.css:329–352,624–628`). Long text and form controls can force overflow inside those views even where the app itself fits.
- **Zoom.** Normal desktop page zoom scales CSS pixels and rem-based content visually and changes how many CSS pixels fit in the window. The Board therefore exposes fewer fixed tracks as the effective viewport shrinks, with a separate change in sizing when the `85vw` cap starts to bind at roughly 340 CSS px. The header switches at 480px (`apps/web/client/app.css:81–85`), stacked tables at 640px (`web-ui.css:543–568`), and Review at 600px (`review/review.css:4–14,166–179`). Those media rules use the viewport even when a view gets less room. The palette and toast cap rem widths against viewport widths (`web-ui.css:223–233,289–295`), and root theme targets are 24px or 44px alongside rem type and spacing (`theme.css:32–52`). Pixel and rem lengths both participate in page zoom. Their difference matters for user font changes, where root-relative lengths follow the root font and fixed lengths do not. The authored board and shell path contains no CSS `zoom`, scale transform or JS zoom override. The app entry sets a device-width viewport with initial scale 1 and supplies no zoom limit (`apps/web/client/index.html:5`). [MDN CSS lengths](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length) · [W3C Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) · [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

### Responsive layout

Give each page a shrinkable main-content boundary and each view a named inline-size container. Keep the root font at the browser default. Use rem for text, spacing, track minima and component breakpoints, with unitless line heights and CSS pixel floors for hit targets. Retain pixels for borders and focus outlines. Allow ordinary text and long tokens to wrap, bound controls and overlays to their usable inline space, and put necessary horizontal overflow inside the named region that owns it. [MDN container size queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)

Board and Sprint Board share one rule. For a board with `N` statuses, use `N` equal grid tracks with `minmax(13rem, 1fr)`, a `0.75rem` gap and `0.75rem` outer padding per side. Give the grid a zero-status empty state. A board fits in one row when its scrollport is at least `N × 13rem + (N − 1) × 0.75rem + 1.5rem` wide. For five statuses this is `69.5rem`, or `1,112` CSS px at the default font. At 1440 CSS px all five full columns, including their right edges, fit side by side with zero horizontal scroll range. When the board container is at least `36rem` wide but cannot fit all tracks, a labeled, keyboard-focusable board region scrolls horizontally. At a 1440 CSS px starting viewport and 200% desktop zoom, approximately 720 CSS px are available and that rule applies. Below `36rem` use a single vertical stack of status sections in the existing order, with every card and its actions reachable by vertical scrolling. At 320 CSS px, including 1280 CSS px at 400% zoom, the stack fits the page. Preserve drag where a pointer can perform it and retain Move to and rank step actions in every layout. [MDN grid minmax()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/minmax) · [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

Make status headers wrap independently of their counts. Use column container width to show up to three title lines below `17rem` and two from `17rem` up. Provide visible full-text disclosure for a clipped title and keep the title link's full accessible name. Below `15rem`, put supplemental repository and owner text and inline owner/priority edits in a labeled card details/actions disclosure. Keep the ID, title, priority value and Move to visible. From `15rem` show repository and owner inline, wrapping the action group as needed. Keep repository identity available on all-stores cards at every width, including when two stores use the same issue ID. Disclosures operate with click, touch and keyboard, and a resize that moves a focused control transfers focus to its new location or its disclosure trigger.

| Existing surface and evidence | Responsive treatment and parity |
|---|---|
| Board and both Sprint modes (`App.tsx:1067–1083,1108–1160`, `sprint/SprintView.tsx:86–122`) | Apply the same Board/list rules to the nested view. Wrap the sprint picker and mode controls. Preserve selection, status order, counts, WIP indicators, guarded moves, rank, owner/handoff, priority and detail links. |
| Backlog and Sessions (`Backlog.tsx:186–217`, `Sessions.tsx:32–107`, `web-ui.css:329–352,543–568`) | Use a table where there is space and labeled stacked rows below `40rem` of view width. Preserve row order, field labels, sort/rank controls, state, current-task links and all actions. |
| Roadmap and Analytics (`Roadmap.tsx:47–85,89–125`, `Analytics.tsx:71–100,181–237`, `web-ui.css:447–452,483–509`) | Wrap controls and legends, use shrinkable chart cards and confine timeline panning to its chart. Add a wrapping text list of dated roadmap entries with links and dates alongside the existing dependencies and undated items. Keep Analytics summaries and data disclosures, and stack their rows if necessary. |
| Review and Queue (`App.tsx:1163–1188,1290–1296`, `review.tsx:158–169,206–255`, `review/review.css:4–18,154–179`, `queue/QueueView.tsx`) | Review uses two shrinkable panes from `40rem` of view width, and its existing list/detail and Back behavior below that width. Queue remains a wrapping list. Preserve filters and their URL state, keyboard shortcuts and settings, ordering, details, bulk approval and unblock flows. |
| Issue and Held Detail, Markdown, composer and palette (`App.tsx:1248–1308`, `web-ui.css:223–268,376–405`, `composer/composer.css:12–34`, `detail/Markdown.tsx:155–163`) | Wrap fields, descriptions, code and links, contain the width of structured content, and size menus, dialogs and the editor to leave focused controls visible. Preserve comments, option cards, draft editing, dispatch, goal arming, undo and Ctrl/Cmd+K. |
| Header, alerts, sign-in/refusal, toasts (`app.css:9–85`, `App.tsx:955–1051`, `auth.ts:440–460`, `web-ui.css:287–329`) | Apply the [one-row top bar](#top-bar) in Phase 1B. Preserve store and view navigation until it moves to the sidebar. Keep freshness, errors and alerts visible in the affected view. Retain toasts and sign-in/sign-out behavior, and include a device-width viewport on server-rendered sign-in/refusal pages. |

> **Feedback Round 1:**

### Top bar

Use `flex-wrap: nowrap` to replace the current wrapping row (`apps/web/client/app.css:12–16`). Give the title `min-width: 0` and single-line ellipsis while preserving its full accessible text. Use inline-size container queries to swap visible control labels for icons with tooltips. Give icon controls accessible names independent of tooltip visibility. Keep the existing `--bu-target` floor of 24 CSS px in both dimensions and 44 CSS px for coarse pointers. [MDN container size queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) · [Base UI Tooltip](https://base-ui.com/react/components/tooltip) · [Beads UI target sizes](../../packages/web-ui/src/theme.css)

In Phase 1B, keep the store picker bounded by available space and collapse the fixed view links into a labeled Views menu when space is short. Move Sign out to a shadcn Base UI `dropdown-menu` labeled Account. Add “Sign out everywhere” there when the sign-in design's bulk revocation action is available. Phase 2 moves store and view navigation to the sidebar and keeps the navigation toggle, Search and Account visible. Keep the existing Commands entry point through Search and Ctrl/Cmd+K. At compact widths, container queries place fixed secondary actions such as Create and Notifications in the More menu once those actions are available. [shadcn Base UI Dropdown Menu](https://ui.shadcn.com/docs/components/base/dropdown-menu) · [Persistent sign-in design](https://github.com/sergeiwallace/beads-ui/pull/114)

Use a local priority+ hook only for a variable set of actions that must stay in the bar, such as view-specific actions. Use one IntersectionObserver rooted in a clipped, noninteractive measurement row, following Primer's technique. Leave room for the More trigger before measuring. Render fitting actions inline and expose the rest as items in the Base UI Menu. Keep the primary controls outside this group so More can never be the only visible control. If resizing moves the focused action into the menu, move focus to More. [Primer overflow observer](https://github.com/primer/react/blob/main/packages/react/src/internal/components/OverflowObserverProvider.tsx) · [Base UI Menu](https://base-ui.com/react/components/menu)

### App shell

D-1 and D-2 govern the shell. Put the Projects index and store switcher at the top of the left navigation. Group Board, Backlog, Sprints, Roadmap and Analytics under project views, and Review, Queue and Agents & Sessions under work coordination. Keep named views and filter links in the sidebar when shareable, and keep the controls that edit those filters beside their results. The top bar holds app-wide Search, Create, Notifications and Account. Account also provides sign-in state, theme and Help. Keep freshness and source failures with the affected view.

Search first indexes navigable views, authorized stores and issues already loaded, with store labels on hits. It uses the existing command palette for actions and states the issue search scope. Expand to authorized document metadata when Projects provides it. Create targets an explicitly chosen open store when several are available. Notifications initially can link to existing review/dispatch state once an authorized feed exists. Surface Create and Notifications only when their supporting contracts are live. Theme uses the existing theme tokens and Help links to shortcuts and usage guidance.

Jira Cloud documents site-wide search and create in the header and boards, spaces and filters in the sidebar, with keyboard and pointer controls to resize or collapse it. Linear places workspace search and New Issue together in its sidebar, and puts documents and links in project resources. GitHub provides global project discovery and a command palette, and individual projects own their board and other layouts. These document two viable placements for global actions and corroborate grouping project resources with project views. The hover and pin behavior below is Beads UI's proposal. [Jira navigation](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-new-navigation-in-jira/) · [Linear search](https://linear.app/docs/search) · [Linear Projects](https://linear.app/docs/projects) · [GitHub project discovery](https://docs.github.com/en/issues/planning-and-tracking-with-projects/finding-your-projects) · [GitHub Projects layouts](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project) · [GitHub command palette](https://docs.github.com/en/get-started/accessibility/github-command-palette)

Use shadcn's Base UI Sidebar with `collapsible="icon"`. Provide a `SidebarMenuButton` tooltip for every rail item and give each icon control the same accessible name even when its tooltip is closed. Use the stock Sidebar's controlled provider and separate panel and spacer as the extension points. [shadcn Sidebar](https://ui.shadcn.com/docs/components/sidebar) · [Base UI Sidebar source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/sidebar.tsx)

- In wide mode, use a `3rem` rail and a `16rem` expanded panel. A thin extension reads `open` and calls `setOpen` from `useSidebar()` for hover and explicit opening. It derives the spacer width from pin state alone. Open the panel over the board on hover with a hover-capable fine pointer, leaving the spacer at `3rem`. Pin reserves `16rem`. Unpin restores the rail's reserved width and keeps the overlay open while engaged. [Base UI Sidebar source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/sidebar.tsx)
- Use a named Navigation landmark, links with `aria-current="page"`, a named toggle with `aria-expanded` and `aria-controls`, and a named pin toggle with `aria-pressed`. Keep expanded-only links out of the collapsed tab order. Hover leaves focus in place. An explicit toggle opens the panel until dismissal or navigation. A hover preview stays open while the pointer or focus is inside. Escape closes it, restores focus to the toggle if focus was inside and suppresses hover reopening until pointer re-entry. On focus moving to main content, close the overlay before it obscures the new focus. Keep focus indicators visible around the sticky header, composer and overlays. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [W3C Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) · [ARIA disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- Adapt the Sidebar's mobile predicate so drawer mode applies below `64rem` of app width or for a coarse primary pointer. Use its built-in Sheet as the modal drawer, capped at `min(16rem, 100%)`. Reuse the same navigation and provide a visible Close action, Escape and backdrop dismissal. Focus moves into the drawer and stays inside. On dismissal, return focus to the toggle. On navigation, focus the destination heading. [Sidebar mobile hook](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/hooks/use-mobile.ts) · [Sidebar Sheet source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/sidebar.tsx) · [Base UI Dialog](https://base-ui.com/react/components/dialog) · [ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Adapt the provider's `sidebar_state` cookie to write only on pin changes. Set its path to the active app base path and record that base path in its value so a `/beads` mount can ignore a cookie from the root mount. Ignore the preference in drawer mode and restore it on return to wide mode. If persistence is unavailable, keep the pin in memory. Guard the provider's window-level Cmd/Ctrl+B before handling it so inputs, textareas and contenteditable targets, including the composer, retain their editing shortcuts. [Base UI Sidebar source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/sidebar.tsx)

### Project discovery

D-3 governs this proposal. Projects opens a searchable, read-only inventory. Its default scope is this deployment, with an All stores entry and a row for each authorized store. Each store row links to Board, Backlog, Sprints and Queue, plus the store-scoped Roadmap, Analytics and Agents & Sessions views. Use the existing encoded repository filter for store-specific Queue links. Provide a deployment-level Review entry and sections for held items and design documents, each with store context and an authorized destination. Show source host or pair scope when the provider supplies it, and distinguish queue-backed liveness from Beads assignees when liveness is unavailable. The project filter narrows the inventory. Existing URL filters remain owned by their destination view.

A deployment serves the machine pair through the existing access routes, with local authorized stores and any paired resources already available through configured providers. Pair scope does not make another deployment's stores available. Held review can be pair-sourced even when a particular held record has no authorized detail route on this host. Link an item directly only when it meets the detail route's eligibility rule. Otherwise send users to its existing Review surface, which already applies its own eligibility. Show empty, unavailable, partial and stale reads separately, with an as-of time and retry where applicable. Catalog entries should lead to the existing surface and request heavy data there. The docs section adds a bounded metadata reader and read-only rendering for explicitly configured design documents, subject to D-3.

### Current server inventory

| Surface | What the working tree exposes |
|---|---|
| Stores and health | `apps/web/server/registry.ts:142–174,195–277,286–313` discovers stores and the startup repo, deduplicates linked worktrees by repository identity and applies the call-time host allowlist. Ambiguous entries fail closed. `routes.ts:326–344` exposes open names and health. |
| Boards, Backlog and Sprints | `routes.ts:245–321,636–654` provides a board read for one or all open stores, with statuses, repository-qualified issues and per-store failures. Backlog and Sprint modes derive from this data (`apps/web/client/App.tsx:1067–1160`). Issue detail resolves a store and includes comments or their read error (`routes.ts:347–376`). |
| Roadmap, Analytics and Sessions | `apps/web/server/views.ts:69–85,218–294,309–363` takes one open store for each. Sessions uses the work queue's allowlisted sessions and leased tasks when configured and reachable, otherwise Beads-derived assignees without queue liveness. There is no general agent catalog in `routes.ts:636–663`. |
| Queue and Review | `apps/web/server/queue-view.ts:118–149,149–180,270–280` supplies cross-store tasks and queue or local order. Queue repo filtering is client-side (`App.tsx:721–728,1173–1186`). `dispatch.ts:287–329,400–448,1189–1203` reads current open held review items from pair scope and filters through open stores and the allowlist, alongside the Review tasks, options and failures. |
| Held documents and design documents | Review renders held bodies via `GET /api/review/body` (`dispatch.ts:473–504,1189–1193`). The separate `GET /api/held/item` requires catalog membership in its held review output and an owning open store (`held-detail.ts:90–150`). Neither route inventories general design files. The route table and static serving code expose no repository design-document index or reader (`routes.ts:636–663`, `static.ts:35–78`). |
| Access and supporting capabilities | The parent design's [machine-pair access](beads-ui-web-app-design.md#access-for-each-machine-pair) describes work-pair forwarding and personal-pair serving under `/beads`. The current handler admits browser sessions before serving routes and distinguishes browser, MCP, receiver and admin credentials (`app.ts:174–222`, `auth.ts:46–64,440–466`). Dispatch receipts, skills, drafts and owner/handoff actions serve contextual workflows. The task-create endpoint in `routes.ts:583–607,626–633` is MCP-only. There is no browser-wide notification feed in the route table. |

## Data Model

The layout phase needs no persisted data. Under D-2, the shell stores one boolean pin preference, namespaced by app base path. Transient state includes route, focus, interaction mode and whether the unpinned panel is closed, hover-open or explicitly open. Pin and theme preferences contain no credentials or project data.

Under D-3, introduce authenticated `GET /api/projects` under the current base path. A response contains `asOf`, a deployment scope label, and store records keyed by the registry's open repository selector with a display name and supported view kinds. Source summaries carry `ready`, `empty`, `partial`, `unavailable` or `stale`, with a last-success time when known. Resource entries carry a stable ID scoped by source and store, type, title, repository selector, optional host label, and an authorized route target. Keep session and queue details in their existing views. Batch or load sections independently and avoid loading task histories, document bodies or all session payloads for the index.

For the proposed design-doc provider, an operator configuration lists stable document IDs, titles and repository-relative Markdown paths under an open repo's `docs/designs/`. A separate authenticated read by ID rechecks the registry and configured membership, resolves against the canonical repository root and admits only files whose real path stays within that directory. Refuse unknown, revoked and escaped records uniformly. Bound file size and render via the shared safe Markdown component. Return only display data and authorized route targets, with no filesystem paths from the provider. Recheck authorization on each read and refresh the list when active scope changes or a source is retried.

## Integration

This design extends the [Beads UI web app design](beads-ui-web-app-design.md) and its [approved host-scoping model](beads-ui-web-app-design.md#d-18). Keep the web shell under `apps/web`. Shared layout rules should work in MCP embeds where the same components are used. Reuse the existing base-aware client navigation and API wrappers for roots mounted at `/` and `/beads`. Preserve direct and modified-click navigation, browser history, encoded store/filter parameters and authenticated writes. Use canonical store-qualified references from existing models for issue links. Use the existing review and queue adapters, current allowlist and browser-session perimeter for the inventory. A same-named store outside the deployment cannot widen that perimeter.

> **Feedback Round 1:**

<!-- /doc:region name="overview" -->

## Implementation Phases

Each slice starts with the named failing acceptance tests or a recorded manual failure where browser chrome is required. Use the existing Playwright app harness and disposable fixtures for observed browser layout and real routes. A controlled five-status response can verify geometry regardless of bd's built-in status count. Cover real status, move and rank behavior with the existing bd-backed suite. Measure widths and scroll ranges in CSS pixels, allowing one pixel for fractional rounding. Run each slice's exit gate before starting dependent work.

### Build order

This shell is an implementation correction to [D-10 of the beads-ui design](beads-ui-design.md#d-10) to finish adopting the chosen stack.

1. Set up Tailwind v4 without its Preflight import, then run `shadcn init --base base` and map its CSS variables to the existing [D-19 tokens](beads-ui-design.md#d-19). [Tailwind Preflight](https://tailwindcss.com/docs/preflight#disabling-preflight) · [shadcn CLI](https://ui.shadcn.com/docs/cli#init) · [shadcn theming](https://ui.shadcn.com/docs/theming)
2. Build the one-row top bar in Phase 1B and finish the shell in Phase 2.
3. Run the viewport matrix against the completed shell before starting Phase 3.

### Phase 1: Responsive layout

Ships before the navigation moves to the sidebar. Preserve the current routes and header capabilities.

| Slice | Scope and deliverables | Spec-first acceptance tests |
|---|---|---|
| 1A Board and Sprint Board | Shared Board markup and styles, app content sizing, browser layout spec at `apps/web/e2e/responsive-board.spec.ts` | `fits five complete columns at 1440`, `grows and shrinks tracks across the fit threshold`, `scrolls within the board at 720`, `stacks statuses at 320`, `keeps long card text and edits reachable`, `handles an empty board and extra statuses`, `preserves board and sprint moves at compact widths` |
| 1B Other tabs and common controls | Shared list, Review, chart, detail, dialog and composer reflow, one-row top bar and public sign-in/refusal viewport, `apps/web/e2e/responsive-views.spec.ts` | `reflows each destination at 320`, `reflows a narrow content container in a wide window`, `keeps every compact row action accessible`, `preserves review controls and shareable filters`, `keeps detail, composer and palette controls visible`, `keeps top-bar controls in one row across the viewport matrix`, `keeps store, views, Commands and Sign out reachable` |

**Acceptance criteria**

- When a five-status fixture is rendered at 1440 CSS px and a 16px root font, the Board and Sprint Board shall show all five column border boxes inside their scrollports, with a horizontal scroll range of at most 1 CSS px. When the same viewport shrinks through the calculated fit threshold, tracks shall shrink to 13rem before scrolling starts.
- When the board gets approximately 720 CSS px at 200% desktop page zoom, it shall keep its status lanes, permit keyboard and pointer access to the last lane, and keep document horizontal overflow at most 1 CSS px. When the board is below 36rem, it shall stack all statuses and expose all actions by vertical navigation alone.
- If a fixture has more statuses than fit in a row, then the board shall keep each status in its original order and expose it through the applicable overflow or stack rule. If no statuses arrive, then it shall show an accessible empty/loading/error state appropriate to the response.
- When a card contains long unbroken text, repeated IDs from two stores or owner names wider than their current track, it shall keep the full title, repository and owner values available and keep priority, owner, rank and Move to controls keyboard reachable. While layout changes, the selected card, pending write state, action destination and detail link shall remain associated with the same store-qualified issue.
- When resizing the content container from 48rem to 32rem with the window width unchanged, Backlog, Sessions and Review shall switch to their compact layouts without navigation or data loss. When a row is compact, its field relationships and keyboard actions shall remain exposed. When a write fails in a compact layout, the existing error/rollback behavior shall remain visible.
- When opening every tab, both Sprints modes, issue detail, held detail and the signed-out page at 320 CSS px, the document shall have at most 1 CSS px horizontal overflow, and keyboard focus shall reach every operative control. If the timeline or a structured block needs horizontal scrolling, then only its local region shall scroll and equivalent text or details shall be reachable. When using Review, Queue, detail or composer at that width, the user shall retain access to the actions and state listed in the responsive parity table.
- When the header renders at any width in the Phase 2 matrix, including with a long store name or a stale feed, all visible top-bar controls shall fit on one row. When the view links collapse, every destination shall remain reachable from Views with the current store filter. Account shall expose Sign out at every matrix width.

**Exit gate:** Run `npm run test:e2e -w apps/web -- responsive-board.spec.ts responsive-views.spec.ts` and the adjacent `board`, `views`, `rank`, `detail`, `review`, `palette`, `auth` and `mcp-app` Playwright specs. Reuse the two configured desktop and touch projects. In desktop Chromium and Firefox, record actual page zoom at 100%, 125%, 150%, 200% on a window starting at 1440 CSS px, then 400% from 1280 CSS px. Record effective viewport and board widths, visible columns, document overflow and keyboard reachability. Check 200% text enlargement at the same window size separately. Automated viewport-size cases cover reflow geometry. Desktop browser zoom and text enlargement use browser controls, since device-pixel ratio and simulated pinch zoom exercise different mechanisms.

### Phase 2: App shell

Start after Phase 1 and apply D-1 and D-2. Slice 2A covers navigation, scope and existing actions. Slice 2B covers sidebar layout, local preference and focus. Public create and notification capabilities can follow independently under their own browser contracts.

| Slice | Scope and deliverables | Spec-first acceptance tests |
|---|---|---|
| 2A Navigation and search | `apps/web/client/App.tsx`, app shell markup and styles, command palette integration, `apps/web/e2e/app-shell.spec.ts` | `keeps existing links, filters and shortcuts under both mount paths`, `searches loaded issues and views across store scope`, `keeps top-bar controls in one row across the viewport matrix`, `exposes account and overflow actions as menuitems` |
| 2B Sidebar behavior | Same web-only shell and spec, with keyboard, mouse, touch and storage cases | `exposes named rail items with matching tooltips`, `previews without changing board geometry`, `dismisses hover with Escape and waits for re-entry`, `keeps focus or pointer inside a preview`, `scopes pin persistence and restores it after drawer mode`, `preserves bold in the composer`, `traps focus in the Sheet and returns it on dismissal`, `works when preference storage is unavailable` |

Run the one-row and menu tests at `1470 × 956`, `1280 × 800`, `735`, `390` and `320` CSS px, using the existing desktop or touch fixture height where only a width is given. Include a variable-action fixture that forces overflow. Run rail assertions at the two wide sizes with a fine pointer and Sheet assertions at the three narrow widths. Also exercise the Sheet at `1280 × 800` with a coarse pointer.

Locate the banner, controls, navigation, links, tooltips, menu items and dialog with `getByRole`. Use no CSS selectors. Compare visible top-bar controls' bounding boxes to confirm that they share a horizontal band and fit within the banner, allowing one CSS px for rounding. [Playwright locators](https://playwright.dev/docs/locators#locate-by-role)

**Acceptance criteria for the recommendation**

- When navigating through sidebar links, direct URLs, modified clicks and back/forward under either mount path, the shell shall preserve the current view and existing store/filter semantics. When search opens by typing or Ctrl/Cmd+K, it shall find matching view names and loaded authorized issue IDs/titles and identify their stores. If no match exists, then the result shall report the searched scope and remain usable.
- When the shell renders at a matrix width, the top bar shall keep the navigation toggle, Search and Account in the row and honor the target size floor. When Account opens, Sign out and, once available, “Sign out everywhere” shall be reachable as `menuitem`s. If a variable action no longer fits, then it shall be reachable as a `menuitem` under More. When the action fits again, it shall return inline. If a focused action moves into More, focus shall move to its trigger.
- When the wide sidebar is collapsed, each rail item shall retain its accessible name. When a rail item receives keyboard focus, its tooltip shall display the matching name. When Cmd/Ctrl+B is used in the composer, the edit shall apply bold and the sidebar shall keep its current state.
- When someone previews and leaves the sidebar with a fine pointer, the board's bounding box and scroll position shall stay the same. While the pointer travels between rail and panel or focus stays inside, the preview shall remain available. When Escape dismisses it, it shall stay closed until a new interaction.
- When a user toggles the pin at wide width, the app shall reserve or release panel space and retain the preference across a same-origin, same-base reload. Verify the cookie path on each mount and that opening or closing a preview leaves the stored pin untouched. If the viewport becomes narrow or the input is coarse, then navigation shall be a button-operated modal drawer without taking board width. If persistence is unavailable, then pinning shall still work for the current page.
- While the Sheet is open, Tab and Shift+Tab shall cycle within it. When the drawer closes, focus shall return to its opener. When a link navigates, focus shall reach the destination heading. When the user tabs to the board past a temporary wide panel, the panel shall yield before it can cover the focused control. When a screen reader encounters the navigation toggle, it shall report its name and expansion state.

**Exit gate:** Run `npm run test:e2e -w apps/web -- app-shell.spec.ts responsive-board.spec.ts responsive-views.spec.ts`, including the matrix above. Verify the five-column fit at 1440 CSS px with the panel pinned. Check landmarks, expanded/current announcements and focus with a screen reader, and check hover, keyboard and touch dismissal in their respective layouts.

### Phase 3: Unified project view

Apply D-3 after Phase 2's navigation entry point passes the viewport matrix. Slice 3A links the current authorized sources. Slice 3B adds explicitly published design docs.

| Slice | Scope and deliverables | Spec-first acceptance tests |
|---|---|---|
| 3A Project inventory | Browser read route in `apps/web/server/routes.ts` backed by registry and existing provider adapters, client API and Projects route, `apps/web/test/projects.test.ts` and `apps/web/e2e/projects.spec.ts` | `lists only current authorized stores and their correct destinations`, `separates empty, failed and stale sources`, `offers pair review and distinguishes session fallback`, `keeps projects reachable under both mounts and at 320` |
| 3B Design documents | Bounded server-side document provider and detail read, shared Markdown render, extensions to the Projects tests | `lists and opens published designs only`, `refuses unknown IDs, revoked stores and out-of-root files`, `preserves other inventory when a design is unavailable` |

**Acceptance criteria for the recommendation**

- When two stores are open and a third store is denied, the index shall list exactly the two open stores, plus the aggregate entry. When the user selects a store-specific destination, the URL shall carry that selector and open the matching content. If the allowlist changes, then the next list or detail read shall omit or refuse revoked resources.
- While a configured pair Review provider returns authorized items, Projects shall show their source and store. When a held item cannot be opened by the detail route, the entry shall open Review. If the queue or held provider is unavailable, then the unaffected store/resources shall stay usable, and the failed source shall have a distinct status. Beads-only sessions shall be identified as assignees with liveness unavailable.
- When an operator publishes a design from an allowed store, the user shall find it by title and open the same document under the active app base path. If a request is unauthenticated, names an unlisted ID or targets a document outside its configured root, then the service shall return no document metadata or body. If a listed document is missing or unreadable, then other authorized entries shall remain visible.
- When a user opens Projects by keyboard, touch or a deep link at 320 CSS px, the inventory and its filters shall fit the page and retain all authorized destinations.

**Exit gate:** Run `npm exec -w apps/web -- vitest run test/projects.test.ts` and `npm run test:e2e -w apps/web -- projects.spec.ts app-shell.spec.ts`. Use temporary repositories, both mount paths, overlapping IDs, allowlist changes and synthetic queue/review sources. Measure reflow at 320 and pinned 1440 CSS px.

> **Feedback Round 1:**

## Implementation Audit

| # | Phase | Section / Decision | Verified | Notes |
|---|---|---|---|---|
| 1 | N/A | Update Design Overview with deployed behavior | - [ ] | After implementation |
| 2 | 1 | Board fit, actual browser zoom, compact tab matrix and behavior parity | - [ ] | Phase 1 exit gate |
| 3 | 2 | D-1 and D-2, navigation parity, focus, dismissal and pin persistence | - [ ] | Phase 2 exit gate |
| 4 | 3 | D-3, inventory authority, partial reads and document detail boundaries | - [ ] | Phase 3 exit gate |

**Audit completed:** Pending implementation.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Long tokens, extra statuses, a large browser default font or a pinned panel reduce available room | Text or actions can overflow their tracks | Verify long-string and custom-status fixtures and effective container widths across reflow modes |
| Shared CSS affects the MCP embed | A layout change may obscure shared controls there | Scope web-only chrome and cover the existing MCP embed in Phase 1 |
| Placeholder header actions imply features the browser cannot use | Users encounter a dead end | Tie Create and Notifications to browser capabilities and preserve existing contextual actions |
| Store identifiers collide, a provider fails, or a repo loses authorization | Inventory could merge resources incorrectly, go blank or show stale access | Use store-qualified keys, isolate provider errors and revalidate access for each inventory and detail read |

<!-- doc:region name="decisions" kind="replaceable" -->

## Design Decisions

### Decision Summary

| # | Decision | Options Considered | Recommended (AI) | Chosen | Diverged? | Rationale | Status |
|---|---|---|---|---|---|---|---|
| D-1 | Navigation ownership | (a) Header for app actions, left panel for project navigation. (b) Search in the header, other actions in the sidebar. | (a) | (a) | No | Keep search and account access available while the project panel is closed | Settled |
| D-2 | Sidebar expansion and layout | (a) Hover overlay, pinned layout reservation. (b) Always push in wide mode. | (a) | (a) | No | Keep board geometry stable during preview | Settled |
| D-3 | Project inventory and document discovery | (a) Inventory with explicit document publication. (b) Broker of existing views and remote links. | (a) | (a) | No | Discover authorized designs in-app with an explicit published set | Settled |

### Decision Details

<a id="d-1"></a>

#### D-1: Navigation ownership — `✅ Resolved by driver (Opus)`

**Context.** The current header combines store selection, navigation and Commands. Jira and Linear show two established placements for global actions, and GitHub scopes project layouts to their project. See [App shell](#app-shell) for the product references.

##### (a) App actions in the header and project navigation on the left

**Pros:**

- Search and account access stay visible while the project panel is collapsed.
- Views and store scope sit next to each other.

**Cons:**

- Two landmarks need clear labels and a consistent responsive priority.
- Create and Notifications need browser capabilities beyond the current shell.

##### (b) Search in the header and other app actions in the sidebar

**Pros:**

- Greater header room for search and view context.
- Create sits beside the store selector, where its destination is visible.

**Cons:**

- Create, Notifications and account controls take another interaction when the sidebar is collapsed.
- The sidebar mixes project destinations with actions whose scope is the whole app.

##### Recommendation

> **Decision:** `✅ Resolved by driver (Opus)` — (a).
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=claude-opus-5-5; ai-effort=UNVERIFIED; ai-profile=interactive -->
<!-- decision-lineage: decision-id=BU-w2g/D-1; decision-topic=navigation ownership; governs=apps/web:app-shell; normalized-proposition=assign app actions and project navigation to their shell regions; applicability=phase:2; outcome-id=; relation=different-question; related-decision-id=; supersedes=; approval-log-decision-id=; approval-actor=; approval-date=; approval-commit= -->

Recommend (a). Label the landmarks and put secondary header actions in one menu at narrow widths. Expose Create and Notifications when their browser contracts are available.

<a id="d-2"></a>

#### D-2: Sidebar expansion and layout — `✅ Resolved by driver (Opus)`

**Context.** A hover preview must leave the board steady and provide explicit access on keyboard and touch. Jira documents expand/collapse. The proposed preview is exploratory and uses the disclosure and modal patterns cited in [App shell](#app-shell).

##### (a) Hover overlay and pinned layout reservation

**Pros:**

- Hover leaves board tracks, scroll and drag geometry stable.
- Pin creates a durable, side-by-side work area.

**Cons:**

- Temporary navigation covers part of the board.
- Hover, focus, Escape and narrow mode add state transitions.

##### (b) Always push the main content in wide mode

**Pros:**

- Expanded navigation and board stay visible side by side.
- The wide panel uses the same placement for hover and pin.

**Cons:**

- Every hover resize can move targets, wrap cards or change overflow state.
- Narrow and touch modes still need separate interaction rules.

##### Recommendation

> **Decision:** `✅ Resolved by driver (Opus)` — (a).
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=claude-opus-5-5; ai-effort=UNVERIFIED; ai-profile=interactive -->
<!-- decision-lineage: decision-id=BU-w2g/D-2; decision-topic=sidebar expansion and layout; governs=apps/web:sidebar; normalized-proposition=define transient and persistent sidebar expansion behavior; applicability=phase:2; outcome-id=; relation=different-question; related-decision-id=; supersedes=; approval-log-decision-id=; approval-actor=; approval-date=; approval-commit= -->

Recommend (a). Keep the panel hoverable with Escape and close it when focus moves to the page. Centralize transitions around the toggle, pin, pointer and focus events and check each transition in the browser suite.

<a id="d-3"></a>

#### D-3: Project inventory and document discovery — `✅ Resolved by driver (Opus)`

**Context.** Existing reads expose different scopes and failure modes. There is no general design-doc reader. Linear project resources and GitHub project discovery document comparable ways to group links and project resources. See [App shell](#app-shell) for the references.

##### (a) Unified inventory with an explicitly published document set

**Pros:**

- Discover stores, available views, held reviews, published designs and sessions from one page.
- An explicit document set makes in-app access and scope verifiable.

**Cons:**

- A server reader, configuration and independent source health add implementation work.
- An operator must publish new design documents.

##### (b) Directory of current app views and existing repository links

**Pros:**

- Reuses current endpoints and keeps document authentication with the destination.
- Delivers a smaller first release.

**Cons:**

- A user cannot discover or read individual designs in Beads UI.
- Repository links may be unavailable locally or exclude unpublished designs readable on the host.

##### Recommendation

> **Decision:** `✅ Resolved by driver (Opus)` — (a).
<!-- decision-record: chosen-option=(a); ai-family=claude; ai-model=claude-opus-5-5; ai-effort=UNVERIFIED; ai-profile=interactive -->
<!-- decision-lineage: decision-id=BU-w2g/D-3; decision-topic=project inventory and document discovery; governs=apps/web:projects; normalized-proposition=define inventory scope and how design documents become discoverable; applicability=phase:3; outcome-id=; relation=different-question; related-decision-id=; supersedes=; approval-log-decision-id=; approval-actor=; approval-date=; approval-commit= -->

Recommend (a). Deliver existing store and provider links first, then add one narrow, independently failing design-doc provider. Keep configuration to explicit published IDs and show its publication state in Projects so an unconfigured source is distinguishable from an empty one.

> **Feedback Round 1:**

## Open Questions

None. D-1 to D-3 were settled on 2026-11-21 (option (a) each); Sergei reviews them after they are live.

> **Feedback Round 1:**

<!-- /doc:region name="decisions" -->

<!-- doc:region name="feedback_rounds" kind="append_only" -->

## Feedback Rounds

No feedback rounds recorded.

<!-- /doc:region name="feedback_rounds" -->

<!-- doc:region name="approval_log" kind="append_only" -->

## Approval Log

| Date | Decision | Actor | Notes |
|---|---|---|---|
| 2026-11-21 | BU-w2g/D-1 | Orchestrating session (Opus 5.5) | (a): app actions in the header, project navigation in the left panel. Search, account and sign-out stay reachable with the panel closed, which the sign-in work (BU-ute slice D) also relies on. |
| 2026-11-21 | BU-w2g/D-2 | Orchestrating session (Opus 5.5) | (a): hover overlay, pin reserves width. Board geometry stays fixed during preview, so drag targets and the five-column fit hold; every transition is covered in app-shell.spec.ts. |
| 2026-11-21 | BU-w2g/D-3 | Orchestrating session (Opus 5.5) | (a): unified inventory with an explicitly published design set, store links first (3A), then the bounded document provider (3B). Matches the ask for a unified project view. |
| 2026-11-24 | D-10 implementation correction | Codex | Folded the fixed top bar, Base UI account menu and limited overflow hook from [§ 2](../research/beads-ui-ui-libraries-and-responsive-shell.md#2-a-one-row-top-bar-at-every-zoom-and-width), the Sidebar extension with an editable-target shortcut guard from [§ 3](../research/beads-ui-ui-libraries-and-responsive-shell.md#3-a-side-panel-that-collapses-to-an-icon-rail), setup from [§ 4](../research/beads-ui-ui-libraries-and-responsive-shell.md#4-whole-app-library-strategy) and the matrix from [§ 6](../research/beads-ui-ui-libraries-and-responsive-shell.md#6-testing-fit). This addresses [Gaps 1 and 2](../research/beads-ui-ui-libraries-and-responsive-shell.md#gaps-blindspots-and-emergent-findings). |

<!-- /doc:region name="approval_log" -->
