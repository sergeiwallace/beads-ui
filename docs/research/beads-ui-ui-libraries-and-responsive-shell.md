---
title: "beads-ui web app: established UI libraries for a one-row top bar, an icon-rail sidebar and the app shell"
category: research
tags: [research, beads-ui, web-app, app-shell, responsive, shadcn, base-ui, tailwind, overflow-menu, sidebar]
status: complete
source: "claude-opus-5-5-2026-11-22"
template_version: "research-1.2.0"
delegation_provenance:
  version: 2
  contributors: []
task: BU-zvf
stub: false
related_docs:
  - docs/research/beads-ui-web-app.md
  - docs/designs/beads-ui-design.md
  - docs/designs/beads-ui-web-app-design.md
  - docs/research/findings/bu-zvf-leg1-ui-libraries-findings.md
---

# beads-ui web app: established UI libraries for a one-row top bar, an icon-rail sidebar and the app shell

## Founding Ask Coverage

`canonical_root_json`: `{"blob_oid":"96e3b0c019f57ed17be92f2c0d1196687974b124","capture_commit":"b5dfff8e09a70cbcbdf1b74083326ca7e65de93c","content_sha256":"f4f3face29592334a14a181165d488606f9bdec10b44567b897e60d649bc5939","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-zvf.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-zvf"}`

`founding_ask_ref_sha256`: `c1d1d957a578b36a164d21a98e8014a298c7b9c6d133dbbb17caf197ed7406d9`

The founding ask record has one entry, A001, recorded verbatim in ai-harness at `docs/asks/BU-zvf.md`. This index is non-authoritative; the raw entry governs. Each row is one clause of A001.

| A001 clause | Where this doc covers it | Status |
|---|---|---|
| The top bar wraps at 100% zoom on a 13 inch MacBook Air M3 and Sign out drops to a second row | [§ 1](#1-why-the-top-bar-wraps-and-how-far-the-build-drifted-from-d-10) | Covered: cause located in the CSS |
| One row at every zoom level, using best practice for zoom and resize | [§ 2](#2-a-one-row-top-bar-at-every-zoom-and-width) | Covered |
| Items that do not fit collapse into an overflow dropdown on the right | [§ 2](#2-a-one-row-top-bar-at-every-zoom-and-width) | Covered |
| The side bar collapses to icons the same way | [§ 3](#3-a-side-panel-that-collapses-to-an-icon-rail) | Covered |
| Use popular, mature, maintained libraries and patterns instead of hand-rolled code, for all beads-ui web app work | [§ 4](#4-whole-app-library-strategy) | Covered |
| Pivot or refactor current work where it does not follow that principle | [Gaps, blindspots and emergent findings](#gaps-blindspots-and-emergent-findings) | Covered: four conflicts named |
| Extend or fork where needed, contribute upstream, open source what is ours | [§ 5](#5-upstream-contribution-and-open-source) | Covered |
| Run it as research then an orchestrated build | [Recommendation](#recommendation) and [Run History](#run-history) | Covered: research done, build legs next |

No requirement is narrowed. The one gap is that no package in the chosen stack measures toolbar overflow; § 2 fills it with a borrowed technique, which changes how the requirement is met, not whether.

**Status:** complete

**Created:** 2026-11-22

**Task:** BU-zvf

**Related docs:**
- `docs/research/beads-ui-web-app.md`
- `docs/designs/beads-ui-design.md`
- `docs/designs/beads-ui-web-app-design.md`
- `docs/research/findings/bu-zvf-leg1-ui-libraries-findings.md` (the research leg's evidence file)

## Table of Contents

- [Context](#context)
- [Temporal Scope](#temporal-scope)
- [Executive Summary](#executive-summary)
- [1. Why the top bar wraps, and how far the build drifted from D-10](#1-why-the-top-bar-wraps-and-how-far-the-build-drifted-from-d-10)
  - [When to use](#when-to-use)
- [2. A one-row top bar at every zoom and width](#2-a-one-row-top-bar-at-every-zoom-and-width)
  - [When to use](#when-to-use-2)
- [3. A side panel that collapses to an icon rail](#3-a-side-panel-that-collapses-to-an-icon-rail)
  - [When to use](#when-to-use-3)
- [4. Whole-app library strategy](#4-whole-app-library-strategy)
  - [When to use](#when-to-use-4)
- [5. Upstream contribution and open source](#5-upstream-contribution-and-open-source)
  - [When to use](#when-to-use-5)
- [6. Testing fit](#6-testing-fit)
- [Gaps, blindspots and emergent findings](#gaps-blindspots-and-emergent-findings)
- [Comparison](#comparison)
- [Recommendation](#recommendation)
- [Open Questions](#open-questions)
- [Sources](#sources)
- [Ambiguous Items from Auto-Remediation (Post-Run Review)](#ambiguous-items-from-auto-remediation-post-run-review)
- [Appendix: Research Prompt](#appendix-research-prompt)
- [Appendix: Provenance Ledger](#appendix-provenance-ledger)
- [Run History](#run-history)

<!-- doc:region name="context" kind="immutable" -->

## Context

Sergei reported that at the default 100% zoom on a 13 inch MacBook Air M3 the web app's top bar wraps, and Sign out lands alone on a second row at the left. He asked for a bar that stays one row at every zoom, collapses what does not fit into an overflow menu, and a side bar that collapses to icons the same way. He also asked that this and all other beads-ui web app work be built on popular, mature libraries rather than hand-rolled layout, pivoting current work where it is not, and contributing upstream or open sourcing where that fits.

The prior decisions this builds on are D-10 (the front-end stack) and D-19 (tokens) in `docs/designs/beads-ui-design.md`, the stack recheck in `docs/research/beads-ui-web-app.md`, and two open design PRs: PR 115 (responsive layout and app shell) and PR 114 (persistent sign-in and TOTP).

**Primary period:** 2026
**Source weighting:** 2026 primary (library releases, docs and registry reads on 2026-11-22); 2025 secondary; specifications (CSS Flexbox, WCAG) as foundational background.

<!-- /doc:region name="context" -->

<!-- doc:region name="body" kind="replaceable" -->

## Temporal Scope

Every library version, release date, download count and star count was read at its source on 2026-11-22. Download counts are the npm week 2026-11-14 to 2026-11-20. Repository findings read beads-ui at `cc766ed`, the `origin/main` of that day. The CSS Flexbox and WCAG references are older specifications that still govern.

## Executive Summary

The top bar wraps because `.app-bar` is a `flex-wrap: wrap` row and only the timestamp is pushed right, so when the items' natural widths exceed the viewport the last item, Sign out, starts a new line at the left. The cause is a symptom of drift: D-10 chose shadcn/ui on Base UI with Tailwind, TanStack and Zustand, but the build installed only Base UI primitives (plus Pragmatic drag and drop, Recharts and Frappe Gantt) and hand-wrote about 1,000 lines of CSS, its data fetching, tables and palette filtering. The recommendation is to keep D-10 and finish it, shell first: shadcn's Base UI Sidebar with `collapsible="icon"` for the rail, a nowrap top bar that holds a short fixed set of controls with Sign out inside an account menu, container queries to drop labels to icons, and a small priority+ overflow hook (GitHub Primer's IntersectionObserver technique over a Base UI Menu) wherever a variable set of actions must stay in the bar.

## 1. Why the top bar wraps, and how far the build drifted from D-10

The reported viewport is 1470 x 956 CSS px: Wikipedia's M3 table lists "1470 × 956 (Rendered as 2940 × 1912, default)" [VERIFIABLE][^1], while Apple's own spec page lists only the native 2560 x 1664 panel [VERIFIABLE][^2]. The figure is from a secondary source, so the build leg should measure at it rather than trust it.

The markup is one `<header className="app-bar">` holding, in order, the store `<select>`, a `<nav>` with eight view links, the `as of HH:MM:SS` stamp, an optional "Live updates stale since ..." status, a Commands button and Sign out (`apps/web/client/App.tsx:956-1017`). The CSS:

- `.app-bar { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }` (`apps/web/client/app.css:13-16`). The wrap is deliberate, and PR 115 keeps it.
- Only `.app-stamp` has `margin-left: auto` (`app.css:53-54`), which right-aligns the stamp and its followers on the first line only.
- `.app-nav { max-width: 100%; overflow-x: auto; }` (`app.css:26-31`) scrolls the nav only when the nav alone is too wide; it does not stop siblings wrapping.
- The one responsive rule hides the stamp below 480 px (`app.css:81-85`).

In a multi-line flex container, line breaking uses each item's "outer hypothetical main size", its max-content width here, before any shrinking [VERIFIABLE][^3]. When the sum passes the bar's width the leftover items start a new line at main-start, and with the default `justify-content: flex-start` and no auto margin on that line, Sign out sits alone at the left. The mapping of the algorithm to this markup is [INFERENCE]. The test suite misses it because its desktop project runs at 1280 x 800 with short fixture store names (`apps/web/playwright.config.ts:15-16`); a native select sizes to its longest option, and the stale notice adds about 260 px, so real data can pass 1,500 px [INFERENCE], not measured.

There is no side panel today. Issue and held detail render inside `<main>` (`App.tsx:1225`, `App.tsx:1251`); the original plan's left rail and right detail drawer (`docs/designs/beads-ui-design.md:314`) were never built.

D-10 (`docs/designs/beads-ui-design.md:1366`) names React 19, Vite, TanStack Query, Table and Virtual, Zustand vanilla, shadcn/ui on Base UI, Pragmatic drag and drop, Recharts, cmdk and Frappe Gantt. Measured at `cc766ed`:

| D-10 library | Installed and used | Evidence |
|---|---|---|
| React 19, Vite, React Compiler | Yes | `apps/web/package.json:23-27`, `apps/web/vite.config.ts:12` |
| Base UI | Partly: Menu, Toast and Dialog only | `packages/web-ui/package.json:28` and five importing components |
| shadcn/ui | No | No `components.json`, no `class-variance-authority`, `clsx`, `tailwind-merge` or `lucide-react` anywhere |
| Tailwind CSS | No | About 1,000 lines of hand CSS across five files |
| TanStack Query | No | Hand refetch on focus and interval (`App.tsx:550-591`), `setInterval` polling (`App.tsx:222`, `:280-282`) |
| TanStack Table and Virtual | No | Hand `<table>`s in four views; no virtualization |
| Zustand | No | No import or vendored copy, though D-10's rationale says one exists |
| cmdk | No | Own word matcher in `CommandPalette.tsx:40-55` |
| Pragmatic drag and drop, Recharts, Frappe Gantt | Yes | `packages/web-ui/package.json` and their views |

Eight native `<select>`s stand where Base UI ships Select; Base UI's 37 components include Select, Toolbar, Menubar, Navigation Menu, Drawer, Tooltip and OTP Field [VERIFIABLE][^4]. The prior research's "D-10's stack holds" (`docs/research/beads-ui-web-app.md:192`) measured whether the libraries were maintained, not whether the build used them [INFERENCE].

### When to use

Read the table as drift to close, not a new decision. The top bar fix belongs inside the shell migration (§ 2 and § 3), not in another hand CSS patch.

## 2. A one-row top bar at every zoom and width

Browser zoom shrinks the viewport in CSS pixels: "320 CSS pixels is equivalent to a starting viewport width of 1280 CSS pixels wide at 400% zoom" [VERIFIABLE][^5]. A layout driven by width therefore handles zoom with no zoom code: 1470 CSS px at 100% is 735 at 200% [INFERENCE]. Container queries style an element by its container's size, declared with `container-type: inline-size` [VERIFIABLE][^6]. They can hide labels or swap a group for a menu trigger in CSS alone, but they cannot count how many items fit and move the rest into a menu; that needs JavaScript measurement with ResizeObserver or IntersectionObserver [INFERENCE].

The standard pattern is priority+ (an overflow or "More" menu): items stay on one row in priority order and those that do not fit move into a trailing menu. How mature systems build it:

| System | Component | Mechanism |
|---|---|---|
| GitHub Primer | UnderlineNav, ActionBar | A single-row container with `overflow: hidden`; one IntersectionObserver rooted on it reports items that wrapped onto the clipped row, and they render in a "More items" menu whose trigger is marked current when the current item overflowed [VERIFIABLE][^7][^8][^9] |
| Adobe React Spectrum | ActionGroup | `overflowMode="collapse"` collapses items that do not fit into a dropdown; `buttonLabelBehavior="collapse"` hides text when space is short [VERIFIABLE][^10] |
| Microsoft Fluent UI v9 | Overflow, on `@fluentui/priority-overflow` | A framework-agnostic overflow manager with per-item priority, groups and `minimumVisible`; the stable `@fluentui/react-components` 9.75.2 depends on it [VERIFIABLE][^11][^12] |
| IBM Carbon | UI Shell header | No overflow menu: below a breakpoint, header links collapse into a left-panel hamburger [VERIFIABLE][^13] |
| Shopify Polaris | (React library) | Archived on GitHub; not a candidate [VERIFIABLE][^14] |
| Atlassian | `@atlaskit/navigation-system` 12.0.1 | React 18 peer only [VERIFIABLE][^15]; behaviour unread [NO SOURCE] |

Inside D-10, Base UI's Toolbar gives Root, Button, Link, Group, Separator and Input with arrow-key movement, and nothing about overflow or measurement [VERIFIABLE][^16]. shadcn's Base UI registry has 63 entries, among them sidebar, dropdown-menu, menubar, navigation-menu, sheet, tooltip, button-group and input-otp, and none that measures fit [VERIFIABLE][^17]. So D-10 has a gap here. Three ways to fill it:

1. Primer's technique as one local hook of about 60 lines: a clipped single-height row plus an IntersectionObserver, with overflowed items rendered in a Base UI Menu. No new dependency; GitHub ships it in production [VERIFIABLE][^8] for the technique, size [INFERENCE].
2. `@fluentui/priority-overflow` 9.4.3 (2026-08-24): one dependency and about 583,000 weekly downloads [VERIFIABLE][^11][^18]. Its README, like the stable `react-overflow` README, says the components "are not production-ready", which reads like unedited boilerplate given the stable suite depends on it [INFERENCE]. That must be settled before adoption.
3. React Spectrum ActionGroup or Blueprint's OverflowList, each of which brings a second design system against D-10 [INFERENCE].

The structural fix matters more than measurement. If view navigation moves into the sidebar (§ 3, and PR 115's D-1 (a)), the bar keeps a short fixed set: a sidebar trigger, the page title or store switcher, search and Commands, the freshness indicator and an account menu. Sign out, PR 114's "Sign out everywhere", theme and Help go into that menu (shadcn `dropdown-menu`, a Base UI Menu). A fixed set needs `flex-wrap: nowrap`, `min-width: 0` with ellipsis on the title, and container queries that drop labels to icons with tooltips; it needs no overflow measurement [INFERENCE]. Keep the existing 24 px target floor and 44 px on coarse pointers (`packages/web-ui/src/theme.css:38`, `:51`), and give priority+ a floor so the bar never collapses to a lone "More" [INFERENCE].

### When to use <!-- 2 -->

Use the nowrap bar with an account menu for the shell's fixed controls. Use the priority+ hook only where a variable set of actions must stay in the bar, such as per-view actions. Prefer the local Primer-style hook; take the Fluent package only once the README warning is shown to be boilerplate.

## 3. A side panel that collapses to an icon rail

shadcn/ui's Sidebar offers `collapsible` values `offcanvas`, `icon` ("A sidebar that collapses to icons") and `none`, toggles with Cmd+B or Ctrl+B, renders as a Sheet on mobile, and ships Base UI, React Aria and Radix versions [VERIFIABLE][^19]. Its Base UI source, read on main [VERIFIABLE][^20][^21], does the following.

- persists open state in a `sidebar_state` cookie for 7 days, written with `path=/`;
- is 16rem expanded, 3rem as an icon rail and 18rem as the mobile sheet;
- shows each `SidebarMenuButton`'s `tooltip` on the right only while collapsed and not on mobile;
- labels the trigger and rail "Toggle Sidebar" with an `sr-only` label, and gives the mobile Sheet an `sr-only` header;
- switches to the Sheet below 768 px through `matchMedia` on the viewport;
- listens on `window` for Cmd or Ctrl plus `b` and calls `preventDefault`.

Two fit issues for beads-ui [INFERENCE]. The `path=/` cookie would be shared with other apps under the same origin; scope it to the base path, as PR 115 already asks for its pin preference. Cmd+B is bold in the Lexical composer, so the window-level handler would toggle the sidebar while the user bolds text; ignore events from editable targets or remap the chord, which D-12's remap setting covers.

Alternatives: Mantine AppShell has no built-in mini rail, only a collapsed navbar paired with a Burger [VERIFIABLE][^22]; MUI's Drawer has a mini variant that rests "as a mini-drawer at the same elevation as the content" [VERIFIABLE][^23]; React Aria Components has no sidebar, though shadcn's Sidebar has a React Aria version [VERIFIABLE][^19]; Carbon's SideNav has a rail into which header links move at narrow widths [VERIFIABLE][^13].

PR 115's D-2 (a) asks for more than shadcn's Sidebar: a hover-reveal panel over the content, a pin that reserves width, and Escape and pointer-departure rules, all hand-specified. PR 115 itself calls the hover preview "exploratory" [VERIFIABLE][^24].

### When to use <!-- 3 -->

Adopt shadcn's Base UI Sidebar with `collapsible="icon"` and a tooltip on every rail item, its cookie scoped to the base path and its shortcut guarded or remapped away from the composer. Build PR 115's hover preview as a thin extension over `useSidebar()` (`open`, `setOpen`), or drop it if the extension grows: the founding ask names collapse-to-icon, not hover preview. Below the mobile breakpoint, the built-in Sheet is PR 115's modal drawer.

## 4. Whole-app library strategy

Adoption evidence read 2026-11-22: stars and last push from the GitHub API [VERIFIABLE][^14], versions, dates and React peer ranges from the npm registry [VERIFIABLE][^15], weekly downloads from the npm downloads API [VERIFIABLE][^18].

| System | Version, date | Weekly downloads | Stars, last push | Backing | React peer | Base UI fit |
|---|---|---|---|---|---|---|
| shadcn (CLI) | 4.23.0, 2026-10-27 | 19.2 M | 128,705; 2026-11-21 | Vercel-employed maintainer, community | n/a (code copied in) | Base UI is the default since July 2026 [VERIFIABLE][^25] |
| `@base-ui/react` | 1.9.0, 2026-10-09 | 32.3 M | 11,468; 2026-11-21 | MUI | 17 to 19 | Is Base UI |
| `@mantine/core` | 9.8.2, 2026-11-20 | 3.8 M | 31,965; 2026-11-21 | Independent maintainer | ^19.2.0 | Own primitives |
| `@mui/material` | 9.5.0, 2026-10-09 | 15.0 M | 99,379; 2026-11-22 | MUI | 17 to 19 | Separate primitives |
| `@chakra-ui/react` | 3.38.0, 2026-11-03 | 2.4 M | 40,746; 2026-11-19 | Chakra team | >=18 | Ark UI and Emotion |
| `react-aria-components` | 1.22.1, 2026-10-09 | 9.9 M | 16,057; 2026-11-21 | Adobe | 16.8 to 19 | shadcn ships an Aria variant |
| `@ark-ui/react` | 5.40.0, 2026-10-29 | 1.5 M | 5,486; 2026-11-21 | Chakra team | >=18 | Zag.js |
| `@heroui/react` | 3.2.7, 2026-10-28 | 1.1 M | 31,278; 2026-11-21 | HeroUI Inc. | >=19 | React Aria plus Tailwind |
| `@radix-ui/themes` | 3.3.0, 2026-01-31 | 1.6 M | 8,863; 2026-04-11 | WorkOS | 16.8 to 19 | Own tokens |
| `tailwindcss` | 4.3.5, 2026-11-06 | 190.7 M | 98,698; 2026-11-20 | Tailwind Labs | n/a | Required by shadcn |

Tailwind's default palette is oklch [VERIFIABLE][^26], which matches D-19's oklch tokens. shadcn's Vite guide installs `tailwindcss` and `@tailwindcss/vite` and replaces `index.css` with `@import "tailwindcss";` [VERIFIABLE][^27]. Tailwind v4 can omit Preflight and keep everything else [VERIFIABLE][^28], so the shell can migrate without resetting the existing hand CSS at once. The React docs say the compiler works with code that follows the Rules of React [VERIFIABLE][^29]; shadcn components are copied into the repo, so the app's existing compiler preset compiles them like app code [INFERENCE]. No compiler compatibility statement was found for the installed libraries [NO SOURCE].

No 2026 evidence favours replacing D-10. Base UI has the highest downloads of any primitive layer measured, shadcn defaults to it and offers React Aria for anything Base UI lacks. Mantine and MUI are mature but replace Base UI outright and bring their own theming, which would redo D-19. Chakra and Ark depend on Zag.js; HeroUI is a sidegrade at a tenth of Base UI's downloads; Radix Themes has not been pushed since April [INFERENCE].

Migration cost in agent-execution time (an Opus leaf with the repo's gates), low-to-medium confidence [INFERENCE]:

| Step | Scope | Estimate |
|---|---|---|
| 1 | Tailwind v4 without Preflight, `shadcn init` on Base UI, map shadcn's semantic variables to the existing `--bu-*` tokens in `theme.css` | 30 to 60 min |
| 2 | Shell: Sidebar icon rail, nowrap top bar, account menu, tooltips, container-query label collapse, priority+ hook if needed | 1.5 to 3 h |
| 3 | Playwright single-row and rail specs at five widths; update `auth.spec.ts:150`, whose Sign out becomes a menu item | 45 to 90 min |
| 4 | TanStack Query in place of `useBoard` and `useViewRead`, the SSE feed invalidating queries | 2 to 4 h |
| 5 | Base UI or shadcn Select for the eight native selects; shadcn Table plus TanStack Table for four tables | 2 to 4 h |
| 6 | Port the remaining hand CSS view by view, then turn Preflight on | 4 to 8 h |
| 7 | Palette: shadcn Command (cmdk) or Base UI Autocomplete in place of the hand matcher | 30 to 60 min |

Steps 1 to 3 fix the reported bug and add the rail, about 3 to 5 hours. The full migration is about 11 to 21 hours.

### When to use <!-- 4 -->

Keep D-10 and finish it, shell first. Map shadcn's variables onto D-19's tokens rather than replacing them. Add TanStack Query and Table where hand code duplicates them. Record the drift and this plan in the design as an implementation correction to D-10, not a new decision.

## 5. Upstream contribution and open source

- Overflow toolbar: Base UI's Toolbar has none and shadcn has no overflow component (§ 2), so a Base UI priority+ toolbar fills a real gap. Base UI asks contributors to open an issue before a large change [VERIFIABLE][^30]. shadcn asks contributors to check open issues and PRs first, and keeps components under `apps/v4/registry` [VERIFIABLE][^31].
- shadcn supports third-party registries that distribute components, hooks and pages through its CLI, with namespaces and a `registry.json` schema [VERIFIABLE][^32], and its Registry Directory lists community registries and links how to be added [VERIFIABLE][^33].
- The Sidebar's base-path cookie and editable-target shortcut guard (§ 3) are general bugs for any app mounted under a path or holding a rich-text editor, so they fit an issue and PR against `shadcn-ui/ui` [INFERENCE].
- D-19's semantic tokens mapped to shadcn variables could ship as a registry theme item; shadcn added presets in April 2026 [VERIFIABLE][^25], but their format was not read [NO SOURCE].

### When to use <!-- 5 -->

Build the overflow toolbar and the sidebar extension as shadcn registry items inside beads-ui first (`registry.json` in `packages/web-ui`), and publish them as a public beads-ui registry once two views use them. Open a Base UI issue proposing Toolbar overflow with the registry item as prior art, and file the two Sidebar fixes against `shadcn-ui/ui`. Each of those is an outward-facing act on a third-party repository and goes through the fleet's per-action gate for external comments and PRs.

## 6. Testing fit

Base UI and shadcn components render native roles and ARIA state: menu triggers with `aria-expanded`, items with role `menuitem`, the sidebar toggle as a button named "Toggle Sidebar", and rail tooltips that appear only while collapsed [VERIFIABLE][^20]. Playwright's `getByRole` "reflects how users and assistive technology perceive the page" [VERIFIABLE][^34], and the suite already uses it 85 times across the specs in `apps/web/e2e`. A reusable viewport matrix (1470 x 956, 1280 x 800, 735, 390 and 320 CSS px) can assert one row by comparing the top-bar controls' bounding boxes, that overflowed actions are reachable as `menuitem`s in the More or account menu, that the rail keeps accessible names through tooltips, and that the mobile Sheet traps focus, with no CSS selectors [INFERENCE]. Today's projects are 1280 x 800 and 390 x 844 only (`apps/web/playwright.config.ts:13-29`). This matrix belongs in the reusable frontend test harness being built alongside.

## Gaps, blindspots and emergent findings

1. PR 115 Phase 1B tells the build to "Wrap the existing navigation, store picker and freshness/error text before the shell ships" [VERIFIABLE][^24]. The founding ask wants one bar at every zoom with overflow collapsing into a menu. These conflict directly; PR 115 must replace wrapping with nowrap plus overflow.
2. PR 115's sidebar (D-2 (a)) is hand-specified with no library named, against the ask's "try not to handroll it". Building on shadcn's Sidebar, with hover preview and pin as extensions, meets the ask.
3. D-10's drift (§ 1) means the earlier "D-10 holds" was a maintenance reading, not an adoption reading. The ask asks to "update and pivot / refactor" to close it.
4. PR 114 chooses to implement the TOTP RFC counter and truncation locally [VERIFIABLE][^35]. The ask's principle covers all web app work. `otpauth` 9.6.0 (2026-11-02, MIT, one dependency on `@noble/hashes`, about 4.5 M weekly downloads) is an established alternative [VERIFIABLE][^15][^18], and PR 114's enrollment UI could use Base UI's OTP Field or shadcn's `input-otp` [VERIFIABLE][^4][^17]. Its new "Sign out everywhere" belongs in the account menu of § 2.

## Comparison

Approach comparison for the top bar and shell. Adoption claims rest on the registry and GitHub signals in § 4, per the fleet's source-vetting rule; the Fluent package is exploratory until its README warning is settled.

| # | Criterion | Finish D-10 (shadcn on Base UI, Tailwind v4) | Patch the hand CSS | Switch to Mantine or MUI |
|---|---|---|---|---|
| 1 | Fixes the wrap at every zoom | Yes: nowrap bar, account menu, container queries | Partly: no overflow menu without new code | Yes, with their own shell |
| 2 | Icon rail sidebar | Built in (`collapsible="icon"`) | Hand-built | MUI mini Drawer; Mantine has none |
| 3 | Hand-rolled code left to maintain | Small: one overflow hook, two Sidebar fixes | All of it | Small, but D-19 theming redone |
| 4 | Fits prior decisions D-10 and D-19 | Is D-10; maps onto D-19 | Keeps the drift | Replaces D-10 and D-19 |
| 5 | Adoption signal | 19.2 M (shadcn) and 32.3 M (Base UI) weekly | n/a | 3.8 M and 15.0 M weekly |
| 6 | Agent time to fix the bug and add the rail | 3 to 5 h | 1 to 2 h | Longer: full re-theme |

## Recommendation

Finish D-10 rather than patch or replace it (confidence: high).

1. Build in this order: Tailwind v4 without Preflight and `shadcn init` on Base UI with variables mapped to D-19's tokens; then the shell (Sidebar icon rail, nowrap top bar, account menu with Sign out, Sign out everywhere, theme and Help, container-query label collapse); then the Playwright viewport matrix. This fixes the reported bug.
2. Use a local Primer-style `useOverflowItems` hook over Base UI Menu wherever a variable action set stays in the bar (confidence: medium-high).
3. Then close the rest of the drift: TanStack Query, Base UI Select, shadcn Table on TanStack Table, the palette on shadcn Command, and the remaining CSS port.
4. Pivot PR 115 (nowrap plus overflow instead of wrap; shadcn Sidebar instead of a hand-specified one) and PR 114 (`otpauth` and an OTP field instead of a local TOTP).
5. Record the drift and this plan in the beads-ui design as an implementation correction to D-10.
6. Ship the overflow toolbar and sidebar extension as beads-ui registry items, and take the upstream issues and PRs through the external-action gate (confidence: medium).

## Open Questions

1. Is the "not production-ready" text in `@fluentui/priority-overflow`'s README stale boilerplate? The stable suite depends on it, but no Fluent statement was read.
2. The exact width at which the bar wraps on the reporter's machine (store names, whether the stale notice showed, the browser's default font size). The build leg measures it at 1470 x 956 with real data.
3. Atlassian navigation-system's overflow behaviour: its docs page returned no content.
4. React Compiler compatibility statements for Base UI, Mantine and MUI: none found.
5. The format of shadcn presets and the steps to list a registry in shadcn's directory: the guides were not read.
6. Container query Baseline dates were not read at source.

## Sources

[^1]: Wikipedia contributors. (2026). [MacBook Air (Apple silicon)](https://en.wikipedia.org/wiki/MacBook_Air_(Apple_silicon)). Wikipedia. Read 2026-11-22. (M3 13 inch scaled resolutions row: 1470 × 956 default. Secondary source.)
[^2]: Apple. (2024). [MacBook Air (13-inch, M3, 2024) - Tech Specs](https://support.apple.com/en-us/118551). Apple Support. Read 2026-11-22. (2560 by 1664 native; no scaled resolutions listed.)
[^3]: W3C. (2018). [CSS Flexible Box Layout Module Level 1, § 9.3 Main Size Determination](https://www.w3.org/TR/css-flexbox-1/). W3C. Read 2026-11-22.
[^4]: MUI. (2026). [Base UI component list (Menubar page)](https://base-ui.com/react/components/menubar). Base UI docs. Read 2026-11-22.
[^5]: W3C WAI. (2023). [Understanding SC 1.4.10: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). W3C. Read 2026-11-22.
[^6]: MDN. (2026). [CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries). MDN Web Docs. Read 2026-11-22.
[^7]: GitHub. (2026). [primer/react UnderlineNav.tsx](https://github.com/primer/react/blob/main/packages/react/src/UnderlineNav/UnderlineNav.tsx). GitHub. Read via the GitHub API 2026-11-22. (Lines 61-152: the "More items" overflow menu.)
[^8]: GitHub. (2026). [primer/react OverflowObserverProvider.tsx](https://github.com/primer/react/blob/main/packages/react/src/internal/components/OverflowObserverProvider.tsx). GitHub. Read 2026-11-22. (One IntersectionObserver rooted on the clipping row.)
[^9]: GitHub. (2026). [UnderlineNav](https://primer.style/product/components/underline-nav/). Primer docs. Read 2026-11-22.
[^10]: Adobe. (2026). [ActionGroup](https://react-spectrum.adobe.com/react-spectrum/ActionGroup.html). React Spectrum docs. Read 2026-11-22.
[^11]: Microsoft. (2026). [fluentui priority-overflow package](https://github.com/microsoft/fluentui/tree/master/packages/react-components/priority-overflow). GitHub. Read via the GitHub API 2026-11-22; npm entry 9.4.3 (2026-08-24) read with `npm view`.
[^12]: Microsoft. (2026). [@fluentui/react-components](https://www.npmjs.com/package/@fluentui/react-components). npm. Read 2026-11-22. (9.75.2 depends on `@fluentui/react-overflow` ^9.9.5.)
[^13]: IBM. (2026). [UI shell header usage](https://carbondesignsystem.com/components/UI-shell-header/usage/). Carbon Design System. Read 2026-11-22.
[^14]: GitHub. (2026). [REST API: Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository). GitHub Docs. Queried per repository on 2026-11-22 (stars, last push, archived, license).
[^15]: npm, Inc. (2026). [npm public registry](https://registry.npmjs.org/). npm. Queried with `npm view` per package on 2026-11-22 (version, release date, React peer range, dependencies).
[^16]: MUI. (2026). [Toolbar](https://base-ui.com/react/components/toolbar). Base UI docs. Read 2026-11-22.
[^17]: shadcn. (2026). [shadcn-ui/ui registry, Base UI components](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/bases/base/ui). GitHub. Listed via the GitHub API 2026-11-22.
[^18]: npm, Inc. (2026). [npm downloads API, last week](https://api.npmjs.org/downloads/point/last-week/tailwindcss,zustand,cmdk,shadcn,radix-ui,react-aria-components). npm. Read 2026-11-22; window 2026-11-14 to 2026-11-20, plus one call per scoped package.
[^19]: shadcn. (2026). [Sidebar](https://ui.shadcn.com/docs/components/sidebar). shadcn/ui docs. Read 2026-11-22.
[^20]: shadcn. (2026). [Base UI sidebar.tsx](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/sidebar.tsx). GitHub. Read via the GitHub API 2026-11-22. (Constants, cookie, shortcut and tooltip code.)
[^21]: shadcn. (2026). [Base UI use-mobile.ts](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/hooks/use-mobile.ts). GitHub. Read 2026-11-22. (768 px breakpoint.)
[^22]: Mantine. (2026). [AppShell](https://mantine.dev/core/app-shell/). Mantine docs. Read 2026-11-22.
[^23]: MUI. (2026). [Drawer](https://mui.com/material-ui/react-drawer/). Material UI docs. Read 2026-11-22.
[^24]: sergeiwallace/beads-ui. (2026). [PR 115: docs(design): responsive layout and app shell](https://github.com/sergeiwallace/beads-ui/pull/115). GitHub. Head `c0e7ca3dd88`, diff read in full 2026-11-22.
[^25]: shadcn. (2026). [Changelog](https://ui.shadcn.com/docs/changelog). shadcn/ui docs. Read 2026-11-22. (July 2026 Base UI as the default and React Aria; April 2026 presets.)
[^26]: Tailwind Labs. (2026). [Colors](https://tailwindcss.com/docs/colors). Tailwind CSS docs. Read 2026-11-22.
[^27]: shadcn. (2026). [Vite installation](https://ui.shadcn.com/docs/installation/vite). shadcn/ui docs. Read 2026-11-22.
[^28]: Tailwind Labs. (2026). [Preflight](https://tailwindcss.com/docs/preflight). Tailwind CSS docs. Read 2026-11-22.
[^29]: React. (2026). [React Compiler introduction](https://react.dev/learn/react-compiler/introduction). React docs. Read 2026-11-22.
[^30]: MUI. (2026). [base-ui CONTRIBUTING.md](https://github.com/mui/base-ui/blob/master/CONTRIBUTING.md). GitHub. Read 2026-11-22.
[^31]: shadcn. (2026). [ui CONTRIBUTING.md](https://github.com/shadcn-ui/ui/blob/main/CONTRIBUTING.md). GitHub. Read 2026-11-22.
[^32]: shadcn. (2026). [Registry](https://ui.shadcn.com/docs/registry). shadcn/ui docs. Read 2026-11-22.
[^33]: shadcn. (2026). [Registry Directory](https://ui.shadcn.com/docs/directory). shadcn/ui docs. Read 2026-11-22.
[^34]: Microsoft. (2026). [Locators](https://playwright.dev/docs/locators). Playwright docs. Read 2026-11-22.
[^35]: sergeiwallace/beads-ui. (2026). [PR 114: docs(web): design persistent sign-in, tailnet identity and TOTP](https://github.com/sergeiwallace/beads-ui/pull/114). GitHub. Head `0c4a117266c`, diff read 2026-11-22.

<!-- /doc:region name="body" -->

<!-- doc:region name="ambiguous_items" kind="replaceable" -->

## Ambiguous Items from Auto-Remediation (Post-Run Review)

(none yet; auto-populated by verify_and_remediate node)

<!-- /doc:region name="ambiguous_items" -->

<!-- doc:region name="appendix_research_prompt" kind="immutable" -->

## Appendix: Research Prompt

**Registry ID:** none (orchestrated research leg 1)
**Model:** `us.anthropic.claude-opus-5-5` (researcher leaf); doc written by the orchestrator on the same model
**Date:** 2026-11-22

The prompt below is the leaf's stage framing, reproduced with host names, session names and local paths replaced by `<redacted>`, because this repository is public. The founding ask it carried is A001 above.

```text
You are an Opus researcher leaf. This is research leg 1 of an /orchestrate /auto-flow run whose orchestrator writes the research doc itself from what you return. You gather evidence; you do not write the research doc, design docs or code.

TASK
Gather sourced evidence for adopting established, well-maintained UI libraries and standard UX patterns in the beads-ui web app instead of hand-rolled layout, starting with the bug in the founding ask: at 100% zoom on a MacBook Air M3 13 inch (a 1470 x 956 CSS px default viewport; verify this figure), the top bar wraps and Sign out drops to a second row at the left.

CONTEXT YOU MUST READ FIRST
- beads-ui at origin/main cc766ed (<redacted> paths), read-only.
- docs/research/beads-ui-web-app.md (its stack section near line 192).
- docs/designs/beads-ui-web-app-design.md, its D-10 and D-19 decisions and every section on the app shell, top bar, side panel and responsive layout.
- docs/designs/beads-ui-design.md, for D-10's original record.
- Open PRs 115 (responsive layout and app shell) and 114 (persistent sign-in, tailnet identity and TOTP), diffs read in full.
- The current implementation: apps/web and packages/web-ui.

QUESTIONS
Q1 Drift inventory: which parts are hand-rolled where D-10 named a library, with file:line evidence; exactly why the top bar wraps; what the side panel does today.
Q2 One-row top bar at every zoom and width: the priority+ or overflow-menu pattern, how at least three mature design systems implement it, which maintained package implements the measurement; zoom, ResizeObserver versus container versus media queries, minimum sizes; the concrete component choice inside D-10.
Q3 Side panel that collapses to an icon rail: shadcn/ui Sidebar's icon mode and alternatives (Mantine AppShell, React Aria, MUI Drawer mini), with accessibility behaviour.
Q4 Whole-app strategy: shadcn/ui on Base UI with Tailwind v4 as D-10 decided, or another mature system; adoption evidence for each; migration cost in agent-execution time, shell first.
Q5 Upstream and open source: what could be contributed or published, and each project's contribution route.
Q6 Testing fit: how the chosen components expose roles and states for Playwright at many window sizes.

METHOD
Web search through the host's search tool and WebFetch (no hostnames, session names, private ids, file paths or secrets in any query); Context7 for library APIs; primary sources first, every load-bearing number verified on 2026-11-22 with its URL and date; tag every finding [VERIFIABLE], [INFERENCE] or [SPECULATIVE]; repository reads scoped to the beads-ui tree.

OUTPUT
One Markdown findings file: Q1 to Q6 in order with tagged, cited findings and a recommendation per question with its confidence; a table of every library considered with its adoption evidence; a list of open factual questions.

RULES
Read-only toward every repository and remote; no tests; never print secrets; no raw curl or wget; plain writing.

ALIGNMENT OBLIGATION
Evidence that narrows, drops or defers a founding-ask requirement is reported as such, never silently. Name any conflict between the ask and the prior D-10 or PR 115 decisions.
```

<!-- /doc:region name="appendix_research_prompt" -->

<!-- doc:region name="appendix_provenance" kind="replaceable" -->

## Appendix: Provenance Ledger

(none yet; auto-populated at commit from the validated provenance ledger)

The research leg's full evidence, including the complete library adoption table and its file:line reads, is [docs/research/findings/bu-zvf-leg1-ui-libraries-findings.md](findings/bu-zvf-leg1-ui-libraries-findings.md).

<!-- /doc:region name="appendix_provenance" -->

<!-- doc:region name="run_history" kind="append_only" -->

## Run History

### 2026-11-22: orchestrated research leg 1 and doc synthesis

- Research leg 1: one Opus 5.5 researcher leaf, read-only, findings returned as an evidence file (sha256 prefix `6e6931c4a53e` before redaction of two lines naming local paths and a tool).
- Synthesis: the orchestrator (Opus 5.5) wrote this doc from that file, keeping its tags and sources and renumbering footnotes in order of first use.
- No web search tool reached the leaf; discovery used WebFetch on primary URLs, the GitHub API and npm registry reads.

<!-- /doc:region name="run_history" -->
