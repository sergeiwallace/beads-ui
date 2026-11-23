---
title: "App shell on the libraries: Tailwind and shadcn on Base UI, an icon-rail sidebar and a top bar that stays one row"
category: plan
tags: [plan, web-app, app-shell, tailwind, shadcn, base-ui, responsive, e2e]
status: active
template_version: "plan-1.0.0"
---

<!-- doc:region name="overview" kind="replaceable" -->

# App shell on the libraries: Tailwind and shadcn on Base UI, an icon-rail sidebar and a top bar that stays one row

## Founding Ask Coverage

`canonical_root_json`: `{"blob_oid":"96e3b0c019f57ed17be92f2c0d1196687974b124","capture_commit":"b5dfff8e09a70cbcbdf1b74083326ca7e65de93c","content_sha256":"f4f3face29592334a14a181165d488606f9bdec10b44567b897e60d649bc5939","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-zvf.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-zvf"}`

`founding_ask_ref_sha256`: `c1d1d957a578b36a164d21a98e8014a298c7b9c6d133dbbb17caf197ed7406d9`

The founding ask record has one entry, A001, recorded verbatim in ai-harness at `docs/asks/BU-zvf.md`. This index is non-authoritative; the raw entry governs.

| A001 clause | Where this plan covers it | Disposition |
|---|---|---|
| The top bar wraps at 100% zoom on a 13 inch laptop and Sign out drops to a second row | [T-03](#t-03-a-top-bar-that-never-wraps) | Built: the bar is one row by construction, and the viewport matrix proves it |
| One row at every zoom level | [T-03](#t-03-a-top-bar-that-never-wraps), [T-04](#t-04-the-viewport-matrix) | Built: widths and zoom levels from 256 to 1920 CSS px |
| What does not fit collapses into an overflow menu on the right | [T-03](#t-03-a-top-bar-that-never-wraps) | Built: a priority+ group over a Base UI Menu |
| The side bar collapses to icons the same way | [T-02](#t-02-the-icon-rail-sidebar) | Built: shadcn's Sidebar with `collapsible="icon"` |
| Use popular, mature libraries, not hand-rolled layout | [T-01](#t-01-tailwind-v4-and-shadcn-on-base-ui), [T-02](#t-02-the-icon-rail-sidebar) | Built: Tailwind v4, shadcn/ui on Base UI, lucide icons; the one local piece is the overflow hook, which no package in the stack provides |
| Pivot the rest of the web app to the libraries | Out of this plan: build step 3 of the D-10 correction | Deferred by the build order, not narrowed |
| Fork, contribute upstream, open source | Out of this plan | Deferred: the research doc's section 5 names the routes; each is an outward-facing act |

**Status:** BUILT

**Created:** 2026-11-22

## Summary for a wide audience

The web app's top bar used to wrap: on a 13 inch laptop at 100% zoom, Sign out landed alone on a second row. The app now has a standard app shell built on shadcn/ui and Base UI: the views are in a left sidebar that collapses to an icon rail, the top bar holds a short fixed set of controls on one row, Sign out is in an account menu, and controls that do not fit move into a "More" menu instead of wrapping. A browser test checks the bar at widths and zoom levels from a phone to a wide monitor.

## Overview

The D-10 implementation correction in `docs/designs/beads-ui-design.md` and the research in `docs/research/beads-ui-ui-libraries-and-responsive-shell.md` set the order: Tailwind and shadcn first, then the shell, then the rest of the drift. This plan builds the first two steps. Out of scope: TanStack Query, Base UI Select for the native selects, shadcn Table, the palette on shadcn Command and the port of the remaining hand CSS (step 3).

## Task Breakdown

### T-01: Tailwind v4 and shadcn on Base UI

**Size:** M
**Batch:** 1

Tailwind v4 through `@tailwindcss/vite`, with its theme and utilities layers and no Preflight, so the existing hand CSS renders as before. `shadcn init` on Base UI (`components.json` in `apps/web`, components under `apps/web/client/components/ui`), with shadcn's semantic variables set to D-19's `--bu-*` tokens instead of its own palette, so light, dark and more-contrast keep working through `light-dark()`.

**Acceptance criteria:**

- [x] When the client is built, the system shall emit Tailwind's theme and utilities layers and no Preflight rules.
- [x] Every shadcn semantic variable shall be set to a `--bu-*` token that `theme.css` defines, and a test shall fail when one is missing or names an undefined token.
- [x] After this step, the main views (Board, Backlog, Roadmap, Analytics, Sessions, Review, Sprints, Queue, an issue's detail and the open palette) shall render pixel-identical at 1280 px and at 390 px to their render before it.
- [x] The Vitest and browser suites shall pass with the same counts as before.

### T-02: The icon-rail sidebar

**Size:** M
**Batch:** 1

shadcn's Sidebar with `collapsible="icon"` holds the eight views, each with an icon and its label as the collapsed rail's tooltip. Below 768 px it is shadcn's Sheet. Two fixes the research names are made in the copied component: the open-state cookie is scoped to the app's base path, and Ctrl or Cmd plus B does not toggle the sidebar from an editable target (the composer uses it for bold).

**Acceptance criteria:**

- [x] When the sidebar is collapsed, each view link shall show only its icon and keep its view's name as its accessible name.
- [x] When the user presses the sidebar toggle or Ctrl+B outside an editable field, the sidebar shall collapse to the rail or expand back.
- [x] If Ctrl+B is pressed in an editable field, then the sidebar shall not toggle.
- [x] While the viewport is under 768 px, the views shall be in a sheet the toggle opens, and choosing a view shall close it.

### T-03: A top bar that never wraps

**Size:** M
**Batch:** 1

The bar is a `flex-wrap: nowrap` row and a size container. It holds the sidebar toggle, the store picker (which shrinks and truncates), the live-updates notice, a priority+ group with the Commands button and the freshness stamp, and an account menu with Sign out. Container queries drop the Commands and notice labels to icons with accessible names. The priority+ group is a local hook after GitHub Primer's technique: the group is clipped to one row, an IntersectionObserver rooted on it reports the items that wrapped out of view, and those render in a "More" menu (shadcn's dropdown-menu, a Base UI Menu).

**Acceptance criteria:**

- [x] At every size of the viewport matrix, the bar shall be one row tall and no control shall sit below its first row.
- [x] At every size, Sign out shall be reachable through the account menu and shall end the session.
- [x] When a control of the priority+ group does not fit, it shall be hidden from the bar and listed in the More menu, and choosing it there shall do what it does in the bar.
- [x] When every control fits, the bar shall show no More menu.
- [x] Every icon-only control shall have an accessible name; Escape shall close an open menu and return focus to its trigger.

### T-04: The viewport matrix

**Size:** M
**Batch:** 1

`apps/web/e2e/shell.spec.ts` drives the shell at 1470 by 956 (the reporter's laptop at 100% zoom, scale 2), 1470 by 956 at 200% zoom (735 by 478), at 400% (368 by 239), 1280 by 800, 1920 by 1080, 390 by 844 on touch, and 1280 at 500% zoom (256 by 160). Specs that pressed Sign out in the bar, or found the views in the first navigation landmark, move to the account menu and to the sidebar, which opens first under 768 px. The harness inventory (`e2e/harness/journey-inventory.ts`) lists the spec's two fixed titles, as it lists every spec title.

**Acceptance criteria:**

- [x] Each matrix assertion shall fail on the build before T-02 and T-03 (recorded in [Measurements](#measurements)).
- [x] The browser suite's pass count shall match the count before this plan, plus the new spec, with every difference explained test by test.

### T-05: Docs

**Size:** S
**Batch:** 1

`docs/procedures/web-run.md` (Sign out's place, the sidebar), `CONTRIBUTING.md` (the styling stack), the D-10 correction's progress and this plan's measurements, in the same commits as the change.

## Batch Plan

| Batch | Tasks | Focus | Exit gate |
|-------|-------|-------|-----------|
| 1 | T-01 | Libraries in, nothing visible changed | Screenshot comparison identical; commit hook green |
| 1 | T-02 to T-05 | The shell and its tests | Viewport matrix green and proved red before; full browser suite green |

## Measurements

Every run is on the same loaded 16-core host, where the host's contention reading stayed at LOOK
(load 28 to 33 on 16 cores).

### T-02 to T-04: the matrix before and after

The matrix serves one store whose repository is named `a-repository-with-a-name-as-long-as-many-real-ones`, so the store picker is as wide as it is with real repository names; the suite's own fixture store already wraps the old bar at 1280 px. Each cell opens its own browser window. `expect.soft` lets every assertion of a cell report on the build before the fix.

| Cell | Before (step 1 build, old bar) | After |
|---|---|---|
| 1470 by 956, scale 2 (the reported laptop at 100%) | fails: bar 73 px against a one-row limit under 48, Sign out on the second row | passes: one row, nothing in More |
| 735 by 478 (that laptop at 200%) | fails: bar 105 px | passes: views in the sheet, labels as icons |
| 368 by 239 (that laptop at 400%) | fails: bar 105 px | passes: the stamp moves into More |
| 1280 by 800 | fails: bar 73 px | passes |
| 1920 by 1080 | fails: the bar fits on one row, but there is no account menu, so Sign out is not reachable through one | passes |
| 390 by 844 on touch | fails: bar 165 px against a limit under 88 (44 px targets) | passes: the stamp moves into More |
| 256 by 160 (1280 at 500%) | fails: bar 137 px, and Commands is not in a More menu | passes: Commands and the stamp move into More, and Commands opens the palette from there |
| Ctrl+B toggles outside a text field, not inside one | fails: there is no sidebar | passes |
| Bar names, focus order, Escape | fails: the first bar control is the store picker, not the sidebar toggle | passes |

The Ctrl+B guard is tested in the palette's text input; it also skips a contenteditable target such as the composer, which no test drives yet.

### The suites before and after

`npm run test:e2e` at `BEADS_UI_TEST_JOBS=1`, on the base (the plan commit) and on the branch after T-02 to T-04:

| What | Before | After |
|---|---|---|
| Wall time of the Playwright run | 43.9 min | 48.5 min |
| Tests | 186: 140 passed, 46 skipped | 204: 149 passed, 55 skipped |

Every test the two runs share kept its result. The 18 the after run adds are `shell.spec.ts`: 9 pass at 1280 px and 9 skip at 390 px, since each cell opens its own window. The auth spec's forged-header test moved one line down and passed in both. The inventory test failed once in the after run, because the inventory did not yet list the new spec's two titles; with them added it passed on its own re-run (2 passed, 2 skipped by project), and that fix is in the T-02 to T-04 commit.

`npm test` with no scope at `BEADS_UI_TEST_JOBS=1`, before and after:

| Suite | Before | After |
|---|---|---|
| `packages/bd-node` | 47 passed | 47 passed |
| `packages/web-ui` | 149 passed | 149 passed |
| `apps/web` | 397 passed, 1 skipped | 399 passed, 1 skipped: the 2 added are `test/shell-theme.test.ts` |
| `packages/terminal` | 21 passed | 21 passed |
| `apps/mcp-server` | 16 passed | 16 passed |
| `plugins/beads-ui`, Vitest | 584 passed | 584 passed |
| `plugins/beads-ui`, `claude plugin test` | 978 passed | 978 passed |
| `scripts/*.test.mjs` | 73 passed | 73 passed |

### What the shell looks like

At 1470 by 956 the sidebar is open at 16rem with an icon and a label per view, and the bar holds, left to right, the sidebar toggle, the store picker, the `as of` stamp, Commands with its Ctrl K hint and the account icon; the store picker stops at 16rem and truncates. Collapsed, the sidebar is a 3rem rail of icons and the board takes the width. Under 768 px the sidebar is a panel over the page. At 256 px wide the bar holds the toggle, the store picker, the More button and the account icon, and More lists Commands and the stamp.

### T-01: no visual change

A throwaway Playwright spec, kept out of the repository, served one store with fixed issue ids
and a fixed repository name and took a full-page screenshot of the Board, Backlog, Roadmap,
Analytics, Sessions, Review, Sprints, Queue, an issue's detail and the open palette, at 1280 by 800
with a mouse and at 390 by 844 on touch, with the clock text masked. Captured twice on the build
before T-01, the screenshots matched each other pixel for pixel once the issue detail's Created and
Updated times were masked too; they were then compared with `maxDiffPixels: 0` against the build
after T-01.

| Project | Identical | Different |
|---|---|---|
| 1280 by 800 | 10 of 10 | none |
| 390 by 844 | 9 of 10 | the issue detail: 124 px, all in the digits of its Created and Updated times, which the mask missed at 390 px and which differ because the issues were made at another minute |

The built stylesheet holds Tailwind's base, components and utilities layers with no Preflight
rule: its base layer is the three rules for shadcn's `data-slot` elements, and its utilities are
the three Tailwind found as words in the client (`relative`, `inline`, `filter`), none of which is
an existing class name.

## Decisions

### Decision Summary

| # | Decision | Options Considered | Recommended (AI) | Chosen | Diverged? | Rationale | Status |
|---|----------|-------------------|------------------|--------|-----------|-----------|--------|
| <a id="d-1"></a>D-1 | Where the shadcn components live | (a) `apps/web/client/components/ui`, (b) `packages/web-ui` | (a) | (a) | No | The shell is the web app's own; the research moves shared pieces into a `packages/web-ui` registry once two surfaces use them | `Resolved` |
| <a id="d-2"></a>D-2 | How shadcn components get the resets Preflight would give them | (a) A small base layer scoped to shadcn's `data-slot` elements, (b) Preflight on now | (a) | (a) | No | (b) restyles every hand-CSS screen at once, which step 3 does view by view | `Resolved` |
| <a id="d-3"></a>D-3 | What the priority+ group holds | (a) The bar's variable right-hand controls: Commands and the freshness stamp, (b) the view links as well | (a) | (a) | No | The views move to the sidebar (research section 2, the app-shell design's D-1 (a)); Sign out and the sidebar toggle never collapse | `Resolved` |

| <a id="d-4"></a>D-4 | Where the views go under 768 px | (a) shadcn's Sheet, which the toggle opens, (b) keep the icon rail on phones | (a) | (a) | No | (a) is the library's own behaviour; the specs open the sheet first through one helper (`showViews` in `e2e/harness/journeys.ts`) | `Resolved` |
| <a id="d-5"></a>D-5 | Edits to the copied shadcn components | (a) Only the research's two fixes and what the repo's gates need, (b) none | (a) | (a) | No | `SidebarInset` renders a `div`, since the app already has its `main`; the cookie path and the shortcut guard; a `biome-ignore` on shadcn's cookie write and two stable setters out of hook dependency lists for Biome; comments removed for the ratchet | `Resolved` |
| <a id="d-6"></a>D-6 | Where the `shadcn` package goes | (a) `dependencies`, as `shadcn init` put it, (b) `devDependencies` | (a) | (a) | No | The server builds the client when it starts, and the build imports `shadcn/tailwind.css`; it adds the CLI's packages to the lockfile | `Resolved` |

## Open Questions

None.

## Approval Log

| Date | Decision | Actor | Notes |
|------|----------|-------|-------|
| 2026-11-22 | D-1 to D-6 | AI (Claude Opus, engineer) | Resolved; built on, for the maintainer's review after it is live |

<!-- /doc:region name="overview" -->
