# beads-ui web UI: established libraries over hand-rolled layout (research leg 1 findings)

Researched 2026-11-22 UTC (host clock read 2026-11-21 local) by an Opus 5.5 researcher leaf. Evidence file for the orchestrator, not the research doc.

## Answer first

The top bar wraps because `.app-bar` is a `flex-wrap: wrap` row (`apps/web/client/app.css:13-14`) and only the timestamp carries `margin-left: auto` (`app.css:53-54`). When the items' max-content widths add up to more than the viewport, the flex algorithm starts a second line, and the last item, Sign out, lands alone at the left of that line. No D-10 UI library except Base UI, Pragmatic drag and drop and Recharts is installed. shadcn/ui, Tailwind, TanStack Query, Table and Virtual, Zustand and cmdk are all absent from every manifest and from `package-lock.json`. The app shell, top bar, tables, selects, data fetching and the palette's filtering are hand-rolled. Closing D-10's drift means adopting shadcn/ui on Base UI with Tailwind v4. Its Sidebar with `collapsible="icon"` gives the icon rail. A nowrap top bar holds few items, Sign out goes into a Base UI account menu, and labels collapse through container queries. A small priority+ overflow hook covers any variable item set, because neither shadcn nor Base UI ships an overflow toolbar.

## Facts re-measured against the brief

- The beads-ui main tree is at `0184917`, behind `origin/main` `cc766ed`. Every repository finding below reads a run worktree at `cc766ed`, which matches the brief.
- D-10 (stack) and D-19 (tokens) are in `docs/designs/beads-ui-design.md` (lines 1362-1400 and 1745-1783). In `docs/designs/beads-ui-web-app-design.md`, D-10 is "Arming /start-goal" (line 1107) and D-19 is a withdrawn Railway template (line 1463). The web app design's "Stack and look" section (line 223-225) restates the beads-ui design's D-10.
- The 1470 x 956 figure holds but comes from a secondary source. Apple's M3 spec page lists only the native 2560 x 1664 panel and no scaled modes[^2]. Wikipedia's M3 table lists "1470 × 956 (Rendered as 2940 × 1912, default)"[^1]. [VERIFIABLE][^1][^2]
- No web search tool and no Context7 tool reached this leaf (ToolSearch found neither the host's web search tool nor Context7). Discovery used known primary URLs through WebFetch, `ghp api` reads of GitHub, and `npm view` registry reads.

## Q1 Drift inventory

### Findings

D-10 option (a) names "React 19, Vite, TanStack Query, Table and Virtual, Zustand vanilla, shadcn/ui on Base UI, Pragmatic drag and drop, Recharts, cmdk, Frappe Gantt" (`docs/designs/beads-ui-design.md:1366`). Measured state at `cc766ed` [VERIFIABLE] (repository files):

| D-10 library | Installed | Used | Evidence |
|---|---|---|---|
| React 19 | Yes, 19.3.1 | Yes | `apps/web/package.json:25` |
| Vite | Yes, 8.3.6 | Yes | `apps/web/package.json:27` |
| React Compiler | Yes, 1.0.0 | Yes | `apps/web/package.json:23`, `apps/web/vite.config.ts:12` |
| Base UI (`@base-ui/react`) | Yes, 1.9.0 | Partly: Menu, Toast, Dialog only | `packages/web-ui/package.json:28`; `MoveToMenu.tsx:1`, `inline-edit/OwnerPicker.tsx:1`, `Toasts.tsx:1`, `CommandPalette.tsx:1`, `review/BulkApprove.tsx:1` |
| shadcn/ui | No | No | No `components.json` anywhere; no `class-variance-authority`, `clsx`, `tailwind-merge` or `lucide-react` in any manifest or in `package-lock.json` |
| Tailwind CSS | No | No | Absent from all manifests and the lockfile. Styling is about 1,000 lines of hand CSS: `packages/web-ui/src/web-ui.css` (684), `review/review.css` (179), `apps/web/client/app.css` (85), `composer/composer.css` (65), plus `theme.css` (65) |
| TanStack Query | No | No | Hand-rolled equivalent: `useViewRead` refetches on window focus and on an interval (`apps/web/client/App.tsx:550-591`), and `useBoard` polls with `setInterval` (`App.tsx:222`, `App.tsx:280-282`) |
| TanStack Table | No | No | Hand `<table>`s: `Backlog.tsx:197`, `Analytics.tsx:96`, `Sessions.tsx:54`, `review/ShortcutSettings.tsx:43` |
| TanStack Virtual | No | No | No virtualization; the board pages instead (core view models) |
| Zustand | No | No | Not in any manifest, lockfile or source import. D-10's rationale says `zustand/vanilla` "is the view-model store copied into the core" (`beads-ui-design.md:1399`), but no import or vendored copy exists under `plugins/beads-ui/core/src` |
| cmdk | No | No | `CommandPalette.tsx` filters with its own word matcher (`CommandPalette.tsx:40-55`) inside a Base UI Dialog |
| Pragmatic drag and drop | Yes, 4.0.0 | Yes | `packages/web-ui/package.json:26-27`; `Board.tsx:1-11`, `Backlog.tsx:1-10`, `sprint/SprintView.tsx:1` |
| Recharts | Yes, 3.10.1 | Yes | `packages/web-ui/package.json:39`; `Analytics.tsx:25` |
| Frappe Gantt | Yes, 1.2.2 | Yes | `packages/web-ui/package.json:33`; `Roadmap.tsx:3` |

Native controls stand where Base UI has a component. There are native `<select>`s at `App.tsx:962` (store picker), `Backlog.tsx:110`, `Backlog.tsx:125`, `Analytics.tsx:194`, `Analytics.tsx:209`, `queue/QueueView.tsx:120`, `review/ReviewQueue.tsx:120` and `inline-edit/fields.tsx:17`, `:46`. Base UI ships Select, Toolbar, Menubar, Navigation Menu, Drawer, Tooltip and OTP Field among 37 components[^14]. [VERIFIABLE][^14]

The prior research said "D-10's stack holds" on maintenance signals (`docs/research/beads-ui-web-app.md:192`). It measured whether the libraries were maintained, not whether the build used them. The build adopted Base UI primitives with hand CSS and skipped the shadcn layer, Tailwind, TanStack and Zustand. [INFERENCE] from the table above.

#### Why the top bar wraps

The markup is one `<header className="app-bar">` holding, in order, a store `<select>` (or a span), `<nav className="app-nav">` with eight view links, the `as of HH:MM:SS` stamp, an optional "Live updates stale since ..." status, a Commands button and the Sign out button (`apps/web/client/App.tsx:956-1017`; the eight views are `App.tsx:68-77`; the stamp text comes from `plugins/beads-ui/core/src/views/text.ts:23-26`).

The CSS that causes the second row [VERIFIABLE] (repository files):

- `.app-bar { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }` (`app.css:13-16`). The wrap is deliberate. PR 115 keeps it ("Wrap the existing navigation, store picker and freshness/error text", see the conflicts section).
- Only `.app-stamp` has `margin-left: auto` (`app.css:53-54`), which pushes the stamp and what follows it to the right on the first line only.
- `.app-nav { max-width: 100%; overflow-x: auto; }` (`app.css:26-31`) lets the nav scroll only when the nav alone is wider than the bar. It does not stop its siblings from wrapping.
- The only responsive rule hides the stamp below 480 px (`app.css:81-85`).

In a multi-line flex container, line breaking uses each item's outer hypothetical main size, its max-content width here, before any shrinking: "For this step, the size of a flex item is its outer hypothetical main size"[^3]. When the sum exceeds the bar's width, the items left over start a new line at main-start. Sign out is last in source order, so it wraps first and sits alone at the left of line two, because the default `justify-content` is `flex-start` and no auto margin applies on that line. [VERIFIABLE][^3] for the algorithm; the mapping to this markup is [INFERENCE].

Why it wraps at 1470 CSS px and not in the test suite: the desktop Playwright project runs at 1280 x 800 (`apps/web/playwright.config.ts:15-16`) against fixtures with short store names. My rough estimate puts the bar near 1,130 CSS px with "All stores" selected and no stale notice. Three things widen it. The native select sizes to its longest option, a real repository name. The stale notice adds about 260 px while live updates retry. A larger default font in the browser scales everything in rem. With a long store name and the stale notice, the estimate passes 1,500 px. [INFERENCE] from the CSS and font sizes; not measured, because this leg runs no browser. The orchestrator's build leg should measure at 1470 x 956 with a realistic store list and the stale notice shown.

#### What the side panel does today

Nothing: there is no side panel. The shell is the header, error lines and `<main>` (`App.tsx:955-1273`). Issue detail and held detail render inside `<main>` (`App.tsx:1225`, `App.tsx:1251`), not in a drawer. The original plan called for "a left rail of saved views and sprints" and "a right drawer for the selected issue's detail" (`docs/designs/beads-ui-design.md:314`); neither was built. The only `<nav>` besides the header is the sprint picker (`sprint/SprintView.tsx:91`). [VERIFIABLE] (repository files)

### Recommendation (confidence: high)

Treat the gap between D-10 and the code as drift to close, not a new decision: D-10 named shadcn/ui on Base UI and the build never installed it. Fix the top bar's wrap as part of adopting the shell components (Q2, Q3), not with another hand CSS patch.

## Q2 One-row top bar at every zoom and width

### Findings

Browser zoom shrinks the viewport in CSS pixels: "When they do this using browser zooming the content becomes larger, but the viewport size decreases", and "320 CSS pixels is equivalent to a starting viewport width of 1280 CSS pixels wide at 400% zoom"[^4]. So a layout driven by width handles zoom with no zoom-specific code: 1470 CSS px at 100% becomes 735 at 200%. [VERIFIABLE][^4]

Container queries style an element by "The container's size" instead of the viewport, declared with `container-type: inline-size`[^5]. They can hide labels or swap a group for a menu trigger in pure CSS. They cannot decide how many items fit or move the leftovers into a menu, which needs JavaScript measurement (ResizeObserver or IntersectionObserver). [VERIFIABLE][^5] for the definition; the limit is [INFERENCE].

The standard pattern is priority+ (also called overflow menu or "More" menu): items stay on one row in priority order, and those that do not fit move into a trailing menu. How mature systems implement it:

| System | Component | Mechanism | Evidence |
|---|---|---|---|
| GitHub Primer | UnderlineNav (also ActionBar) | A single-row container with `overflow: hidden` and `data-overflow-mode="wrap"`. One IntersectionObserver rooted on that container reports items that wrapped onto the clipped row. Those items render in a "More items" ActionList menu, and the trigger is marked current when the current item has overflowed | [VERIFIABLE][^6][^7][^8] |
| Microsoft Fluent UI v9 | Overflow (`@fluentui/react-overflow`), on `@fluentui/priority-overflow` | A vanilla JS overflow manager with per-item `priority`, `groupId`, `minimumVisible`, `padding` and `overflowAxis`. The stable `@fluentui/react-components` 9.75.2 depends on `@fluentui/react-overflow` ^9.9.5 | [VERIFIABLE][^10][^11] |
| Adobe React Spectrum | ActionGroup | `overflowMode="collapse"`: "the items that do not fit are collapsed into a dropdown menu"; `buttonLabelBehavior="collapse"` hides text "when space is limited" | [VERIFIABLE][^9] |
| IBM Carbon | UI Shell header | No overflow menu. Below a breakpoint, "header links and menus should collapse into a left-panel hamburger menu" | [VERIFIABLE][^12] |
| Shopify Polaris | (React library) | `Shopify/polaris-react` is now `polaris-react-archive`, archived on GitHub. Not a candidate | [VERIFIABLE][^23] |
| Atlassian | `@atlaskit/navigation-system` 12.0.1 | Its peer range is `react ^18.2.0` only, and its docs page returned no content to WebFetch. Behaviour unverified | [VERIFIABLE][^24] for the peer range; [NO SOURCE] for behaviour |

Inside the D-10 stack, Base UI's Toolbar provides Root, Button, Link, Group, Separator and Input with arrow-key movement and `loopFocus`, and its page mentions no overflow, collapsing or measurement[^13]. shadcn's Base UI registry has no toolbar or overflow component: its 63 entries include sidebar, dropdown-menu, menubar, navigation-menu, sheet, tooltip, button-group and input-otp, but nothing that measures fit[^18]. So D-10 has a gap here. [VERIFIABLE][^13][^18]

Options to fill the gap:

1. Fluent's `@fluentui/priority-overflow` 9.4.3 (2026-08-24) has one dependency (`@swc/helpers`) and about 583,000 weekly downloads. It is framework-agnostic and drives Fluent's stable Overflow[^10][^25]. Its README carries Fluent's boilerplate warning: "These are not production-ready components and should never be used in product." The stable `react-overflow` README carries the same text, so the warning looks like unedited boilerplate rather than the package's real status. It is still a red flag the build must record. [VERIFIABLE][^10]; the boilerplate reading is [INFERENCE].
2. Primer's technique, rewritten as one local hook of about 60 lines: a nowrap-looking row built from `flex-wrap: wrap`, a fixed height and `overflow: hidden`, plus an IntersectionObserver rooted on the row. Overflowed items render inside a Base UI Menu. It needs no new dependency, but it is code the repo owns. GitHub ships this approach in production. [VERIFIABLE][^7] for the technique; the size is [INFERENCE].
3. React Spectrum ActionGroup or Blueprint's OverflowList. Each brings a whole second design system, against D-10. [INFERENCE]

The structural fix matters more than the measurement. If view navigation moves into the sidebar (PR 115's D-1 (a), and Q3 here), the top bar keeps only a sidebar trigger, the page title or store switcher, search and Commands, the freshness indicator and an account menu. Sign out, and PR 114's "Sign out everywhere", theme and Help, go in a Base UI Menu (shadcn `dropdown-menu`). That is a short, fixed item set. `flex-wrap: nowrap`, `min-width: 0` with ellipsis on the title, and container queries that drop labels to icons need no overflow measurement. Linear, GitHub and Jira put account actions in an avatar menu (PR 115 cites the Jira and Linear navigation docs). [INFERENCE] from the cited systems.

Minimum sizes: keep the existing 24 px target floor and 44 px on coarse pointers (`packages/web-ui/src/theme.css:38`, `:51`). Priority+ needs a floor such as `minimumVisible` so the bar never collapses to a lone "More". [INFERENCE]

### Recommendation (confidence: medium-high)

- Make `.app-bar` nowrap and move view links into the shadcn Sidebar (Q3). Put Sign out, Sign out everywhere, theme and Help in a shadcn `dropdown-menu` (Base UI Menu) account menu. Let container queries on the bar drop labels to icons with tooltips at narrow widths.
- Wherever a variable set of actions stays in the bar, for example per-view actions, use a priority+ overflow. Prefer Primer's IntersectionObserver technique as a local `useOverflowItems` hook rendering into Base UI Menu. Take `@fluentui/priority-overflow` instead only if the build leg confirms the README warning is boilerplate (for example with a Fluent maintainer statement or the stable suite's docs).
- Add a Playwright spec that asserts a single row (every top-bar control shares one `boundingBox().y` band) at 1470 x 956, 1280 x 800, 735 (200% of 1470), 390 and 320 CSS px.

## Q3 Side panel that collapses to an icon rail

### Findings

shadcn/ui Sidebar has `collapsible` values `offcanvas`, `icon` ("A sidebar that collapses to icons") and `none`, toggles with Cmd+B or Ctrl+B, and on mobile renders as a Sheet. Its docs page offers Base UI, React Aria and Radix versions[^15]. The Base UI source on shadcn main (`bfa64ff`) [VERIFIABLE][^16][^17]:

- Persists open state in a cookie: `SIDEBAR_COOKIE_NAME = "sidebar_state"`, max age 7 days, written with `path=/`.
- Widths: 16rem expanded, 3rem icon rail, 18rem mobile sheet.
- `SidebarMenuButton` takes a `tooltip` prop. The tooltip shows on the right only while collapsed and not on mobile (`hidden={state !== "collapsed" || isMobile}`).
- The trigger and rail carry `aria-label="Toggle Sidebar"` plus an `sr-only` label, and the mobile Sheet has an `sr-only` header.
- `useIsMobile` switches to the Sheet below 768 px through `matchMedia` and `innerWidth` (viewport, not container).
- The toggle shortcut listens on `window` for `b` with Cmd or Ctrl and calls `preventDefault`.

Two fit issues for beads-ui [INFERENCE]:

- The cookie path is `/`. Under the `/beads` mount, and beside other app-portal members, the state cookie would be shared across apps. Scope it to the base path, as PR 115 already asks for its pin preference.
- Cmd+B is bold in the Lexical composer. The sidebar's window-level handler would toggle the sidebar while the user bolds text. Ignore events from editable targets or pick another chord; the remap setting D-12 requires covers this.

Alternatives:

| Library | Icon rail | Notes |
|---|---|---|
| Mantine AppShell | No built-in mini rail. `collapsed: { mobile, desktop }` hides the navbar, paired with a Burger | [VERIFIABLE][^21] |
| MUI Drawer | Mini variant: "Its resting state is as a mini-drawer at the same elevation as the content"; temporary on small screens, permanent on wider | [VERIFIABLE][^22] |
| React Aria Components | No sidebar component. shadcn's Sidebar has a React Aria version | [VERIFIABLE][^15] |
| Carbon UI Shell | SideNav with a rail; header links move into it at narrow widths | [VERIFIABLE][^12] |

PR 115's D-2 (a) asks for more than shadcn's Sidebar does: a hover-reveal panel over the content, a pin that reserves width, and Escape and pointer-departure rules. PR 115 calls the hover preview "exploratory" and "Beads UI's proposal" (PR 115 diff lines 121, 298). [VERIFIABLE][^34]

### Recommendation (confidence: high for the component, medium for hover)

Adopt shadcn's Base UI Sidebar with `collapsible="icon"` and tooltips on every rail item. Scope its cookie to the base path, and guard or remap its shortcut away from the composer's Cmd+B. Treat PR 115's hover preview as a thin extension over `useSidebar()` (`open`, `setOpen`), or drop it if the extension grows. The founding ask names collapse-to-icon, not hover preview. Below the mobile breakpoint the built-in Sheet serves as PR 115's modal drawer.

## Q4 Whole-app strategy

### Findings

Adoption evidence, read 2026-11-22 (stars and last push from the GitHub API[^23]; version, date and React peer range from the npm registry[^24]; weekly downloads for 2026-11-14 to 2026-11-20 from the npm downloads API[^25]):

| System | Version, date | Weekly downloads | Stars, last push | Backing | React peer | Base UI fit | Theming |
|---|---|---|---|---|---|---|---|
| shadcn/ui (CLI `shadcn`) | 4.23.0, 2026-10-27 | 19.2 M | 128,705; 2026-11-21 | Vercel-employed maintainer, community | n/a (code copied into the repo) | Base UI is the default since July 2026[^20] | oklch CSS variables through Tailwind `@theme` (prior research; Tailwind's default palette is oklch[^26]) |
| Base UI `@base-ui/react` | 1.9.0, 2026-10-09 | 32.3 M | 11,468; 2026-11-21 | MUI | ^17, ^18, ^19 | Is Base UI | Unstyled |
| Mantine `@mantine/core` | 9.8.2, 2026-11-20 | 3.8 M | 31,965; 2026-11-21 | Independent maintainer | ^19.2.0 | None (own primitives) | Own CSS variables |
| MUI `@mui/material` | 9.5.0, 2026-10-09 | 15.0 M | 99,379; 2026-11-22 | MUI | ^17, ^18, ^19 | Same company, separate primitives | Emotion theme |
| Chakra `@chakra-ui/react` | 3.38.0, 2026-11-03 | 2.4 M | 40,746; 2026-11-19 | Chakra team | >=18 | None; built on Ark UI and Emotion | Tokens via Panda-style recipes |
| React Aria Components | 1.22.1, 2026-10-09 | 9.9 M | 16,057 (react-spectrum); 2026-11-21 | Adobe | 16.8 to 19 | None; shadcn ships an Aria variant[^20] | Unstyled |
| Ark UI `@ark-ui/react` | 5.40.0, 2026-10-29 | 1.5 M | 5,486; 2026-11-21 | Chakra team | >=18 | None (Zag.js) | Unstyled |
| HeroUI `@heroui/react` | 3.2.7, 2026-10-28 | 1.1 M | 31,278; 2026-11-21 | HeroUI Inc. | >=19 | None; peers `react-aria-components` and `tailwindcss >=4` | Tailwind v4 |
| Radix Themes `@radix-ui/themes` | 3.3.0, 2026-01-31 | 1.6 M | 8,863; last push 2026-04-11 | WorkOS | 16.8 to 19 | None | Own tokens |
| Tailwind CSS | 4.3.5, 2026-11-06 | 190.7 M | 98,698; 2026-11-20 | Tailwind Labs | n/a | Required by shadcn | oklch palette |

React Compiler: the React docs say the compiler works with code that follows the Rules of React and point libraries to a separate "Compiling Libraries" page[^28]. shadcn components are copied into the repository, so the app's existing compiler preset (`apps/web/vite.config.ts:12`) compiles them like app code. For the installed libraries no compatibility statement was found [NO SOURCE]. Uncompiled library code still runs beside compiled app code. [VERIFIABLE][^28]; the shadcn point is [INFERENCE].

shadcn requires Tailwind. Its Vite guide installs `tailwindcss` and `@tailwindcss/vite` and replaces `index.css` with `@import "tailwindcss";`[^19]. Tailwind v4 can drop Preflight by importing only its theme and utilities layers[^27]. That lets the shell migrate without resetting the 1,000 lines of existing CSS at once. [VERIFIABLE][^19][^27]

No 2026 evidence favours replacing D-10. Base UI has the highest downloads of any primitive layer measured, shadcn defaults to it, and shadcn also offers React Aria for any component Base UI lacks. Mantine and MUI are mature but replace Base UI outright and bring their own theming, which would redo D-19's oklch tokens. Chakra and Ark depend on Zag.js. HeroUI is React Aria plus Tailwind, a sidegrade at a tenth of Base UI's downloads. Radix Themes has not been pushed since April. [INFERENCE] from the table.

Migration cost estimate, in agent-execution time (Opus leaf with the repo's gates) [INFERENCE], low-to-medium confidence:

| Step | Scope | Estimate |
|---|---|---|
| 1 | Tailwind v4 without Preflight, `shadcn init` on Base UI, map shadcn's semantic variables to the existing `--bu-*` tokens in `theme.css` (D-19 holds; names stay in core) | 30 to 60 min |
| 2 | Shell: shadcn Sidebar (icon rail), nowrap top bar, account dropdown, tooltips, container-query label collapse, priority+ hook if needed; update `App.tsx:954-1017` and `app.css` | 1.5 to 3 h |
| 3 | Playwright single-row and rail specs at five widths, plus updating `auth.spec.ts:150`, whose Sign out becomes a menu item | 45 to 90 min |
| 4 | TanStack Query replacing `useBoard` and `useViewRead` with the SSE feed invalidating queries | 2 to 4 h |
| 5 | Base UI or shadcn Select for the eight native selects; shadcn Table plus TanStack Table for four tables | 2 to 4 h |
| 6 | Port the remaining hand CSS to shadcn components and utilities view by view, then turn Preflight on | 4 to 8 h |
| 7 | Palette: shadcn Command (cmdk) or Base UI Autocomplete for the hand matcher | 30 to 60 min |

Steps 1 to 3 fix the reported bug and the rail, about 3 to 5 hours. The full migration is about 11 to 21 hours of agent time.

### Recommendation (confidence: high)

Keep D-10 and finish it: shadcn/ui on Base UI with Tailwind v4, shell first. Map shadcn's variables onto D-19's tokens rather than replacing them. Add TanStack Query and Table where the hand code now duplicates them. Record the drift and the plan in the design as an implementation correction to D-10, not a new decision.

## Q5 Upstream and open source

### Findings

- Overflow toolbar: Base UI's Toolbar has no overflow[^13] and shadcn has no overflow component[^18], so a Base UI priority+ toolbar fills a real gap. Base UI's CONTRIBUTING.md says "before working on a large change, it's best to open an issue first to discuss it with the maintainers"[^29]. shadcn's CONTRIBUTING.md asks contributors to "check for open issues and pull requests" before a PR, and its components live under `apps/v4/registry`[^30]. [VERIFIABLE][^29][^30]
- shadcn supports third-party registries. A registry can distribute "custom components, hooks, pages" through the shadcn CLI, with namespaces and a `registry.json` schema[^31]. The Registry Directory lists community registries and links a guide for being added ("Don't see a registry? Learn how to add it here.")[^32]. [VERIFIABLE][^31][^32]
- Sidebar fixes: the base-path cookie and the editable-target shortcut guard (Q3) are general bugs for any app mounted under a path or holding a rich-text editor. They fit an issue and PR against `shadcn-ui/ui`. [INFERENCE]
- Tokens: D-19's semantic names mapped to shadcn variables could ship as a registry theme item. shadcn added "shadcn preset" in April 2026[^20], but this leg did not read its format. [NO SOURCE] for the preset format.

### Recommendation (confidence: medium)

Build the overflow toolbar and sidebar extension as shadcn registry items inside beads-ui first (`registry.json` in `packages/web-ui`). Publish them as a public beads-ui registry once two views use them. Open a Base UI issue proposing Toolbar overflow, linking the registry item as prior art. File the two Sidebar fixes against `shadcn-ui/ui`. Each is an outward-facing act on a third-party repository, so it needs the fleet's per-action gate for external comments and PRs.

## Q6 Testing fit

Base UI and shadcn components render native roles and ARIA state: Menu triggers with `aria-expanded`, menu items with role `menuitem`, the sidebar toggle as a button named "Toggle Sidebar", and rail tooltips that appear only while collapsed[^16]. Playwright's `getByRole` locator "reflects how users and assistive technology perceive the page" through ARIA role, attributes and accessible name[^33]. The suite already uses it 85 times across `apps/web/e2e/*.spec.ts`. A reusable viewport matrix (1470 x 956, 1280 x 800, 735, 390 and 320 CSS px) can therefore assert one row by comparing top-bar control bounding boxes. It can assert that overflowed actions are reachable as `menuitem`s inside the More or account menu, that the rail keeps names through tooltips, and that the mobile Sheet traps focus, all without CSS selectors. The current projects are 1280 x 800 and 390 x 844 only (`apps/web/playwright.config.ts:13-29`). [VERIFIABLE][^16][^33]; the matrix is [INFERENCE].

## Conflicts with the founding ask and prior decisions

1. PR 115 Phase 1B tells the build to "Wrap the existing navigation, store picker and freshness/error text before the shell ships" (PR 115 diff line 113). The founding ask says the bar "should always be ... a signle bar no matter what zoom level", with overflow collapsing into a menu. These conflict directly. PR 115 must replace wrapping with nowrap plus overflow.[^34]
2. PR 115's sidebar (D-2 (a)) is fully hand-specified with no library named, against the ask's "try not to handroll it". The ask is met by building on shadcn's Sidebar and treating hover preview and pin as extensions.[^34]
3. D-10 chose "shadcn/ui on Base UI" plus TanStack and Zustand; the code has Base UI primitives only with hand CSS and hand fetching. The prior research's "D-10 holds" (`docs/research/beads-ui-web-app.md:192`) measured maintenance, not adoption. This is drift against D-10, and the ask asks to "update and pivot / refactor" to fix it.
4. PR 114 chooses to "Implement the RFC counter and truncation locally" for TOTP (PR 114 diff line 126). The ask says its principle "applies to all the work they're doing for beads-ui web app". `otpauth` 9.6.0 (2026-11-02, MIT, one dependency on `@noble/hashes`, 1,491 stars, about 4.5 M weekly downloads) is an established alternative[^24][^23][^25]. PR 114's enrollment UI could also use Base UI's OTP Field or shadcn `input-otp`[^14][^18]. Its added "Sign out everywhere" action belongs in the account menu of Q2.[^35]
5. No requirement of the ask is narrowed by this evidence. One row at every zoom, the overflow menu, the icon rail, established libraries and upstream contribution are each buildable as recommended. The only gap is that no package in the D-10 stack measures overflow. The fill is a borrowed technique or Fluent's package. That decides how the requirement is met, not whether.

## Library adoption table (every library considered)

| Library | Version, release date | Weekly downloads (2026-11-14 to 11-20) | GitHub stars, last push | License | Status for beads-ui |
|---|---|---|---|---|---|
| shadcn (CLI) | 4.23.0, 2026-10-27 | 19,241,060 | 128,705, 2026-11-21 | MIT | Adopt (D-10) |
| @base-ui/react | 1.9.0, 2026-10-09 | 32,340,146 | 11,468, 2026-11-21 | MIT | Installed; extend use |
| tailwindcss | 4.3.5, 2026-11-06 | 190,699,828 | 98,698, 2026-11-20 | MIT | Adopt (shadcn requires it) |
| @tanstack/react-query | 5.108.2, 2026-11-20 | not read | 50,605, 2026-11-21 | MIT | Adopt (D-10) |
| @tanstack/react-table | 9.3.1, 2026-10-12 | not read | 28,599, 2026-11-18 | MIT | Adopt (D-10) |
| @tanstack/react-virtual | 3.14.26, 2026-11-03 | not read | 7,203, 2026-11-21 | MIT | Adopt when a list needs it |
| zustand | 5.1.0, 2026-11-06 | 96,990,849 | 58,972, 2026-11-21 | MIT | D-10 named; not yet needed by the shell |
| cmdk | 1.1.1, 2025-03-14 | 51,066,912 | 13,170, last push 2025-10-29 | MIT | Stale; shadcn Command still wraps it |
| @fluentui/priority-overflow | 9.4.3, 2026-08-24 | 583,294 | (fluentui) 20,424, 2026-11-21 | MIT (package) | Candidate for priority+; README warning to resolve |
| @fluentui/react-overflow | 9.9.5, 2026-10-19 | not read | as above | MIT | Too heavy (Griffel, Fluent theme) |
| @primer/react | 38.46.0, 2026-11-14 | not read | 3,941, 2026-11-21 | MIT | Borrow the technique only |
| @react-spectrum/actiongroup | 3.12.1, 2026-05-28 | not read | (react-spectrum) 16,057 | Apache-2.0 | Reject: whole Spectrum |
| react-aria-components | 1.22.1, 2026-10-09 | 9,924,468 | 16,057, 2026-11-21 | Apache-2.0 | Fallback through shadcn's Aria variant |
| @mantine/core | 9.8.2, 2026-11-20 | 3,830,422 | 31,965, 2026-11-21 | MIT | Mature; would replace Base UI |
| @mui/material | 9.5.0, 2026-10-09 | 14,950,839 | 99,379, 2026-11-22 | MIT | Mature; would replace Base UI |
| @chakra-ui/react | 3.38.0, 2026-11-03 | 2,351,143 | 40,746, 2026-11-19 | MIT | Reject: Emotion runtime, no fit |
| @ark-ui/react | 5.40.0, 2026-10-29 | 1,461,530 | 5,486, 2026-11-21 | MIT | Reject: sidegrade |
| @heroui/react | 3.2.7, 2026-10-28 | 1,097,065 | 31,278, 2026-11-21 | Apache-2.0 | Reject: sidegrade |
| @radix-ui/themes | 3.3.0, 2026-01-31 | 1,636,935 | 8,863, 2026-04-11 | MIT | Reject: slowing |
| radix-ui | 1.8.1, 2026-10-12 | 29,833,403 | (primitives) 19,534, 2026-10-14 | MIT | app-portal's layer; not for beads-ui |
| @fluentui/react-components | 9.75.2, 2026-11-10 | not read | 20,424 | MIT | Reject: second design system |
| @carbon/react | 1.121.0, 2026-11-18 | not read | 9,635, 2026-11-21 | Apache-2.0 | Pattern reference only |
| @atlaskit/navigation-system | 12.0.1, 2026-11-20 | not read | n/a | n/a | Reject: React 18 peer only |
| Shopify polaris-react | archived | n/a | 6,142, archived | n/a | Reject: archived |
| @blueprintjs/core (OverflowList) | 6.23.2, 2026-11-19 | not read | not read | Apache-2.0 | Reject: whole Blueprint |
| otpauth (PR 114) | 9.6.0, 2026-11-02 | 4,503,462 | 1,491, 2026-11-20 | MIT | Candidate over a local TOTP |

## Open factual questions

1. Is the "not production-ready" README text on `@fluentui/priority-overflow` and `@fluentui/react-overflow` stale boilerplate? The stable suite depends on it, but no Fluent statement was read.
2. The exact width at which the bar wraps on the reporter's machine: store names, whether the stale notice was showing, and the browser's default font size. Needs a measured Playwright run at 1470 x 956 with real data.
3. Atlassian navigation-system's top-nav overflow behaviour: its docs page returned empty to WebFetch.
4. React Compiler compatibility statements for Base UI, Mantine and MUI: none found.
5. The format of shadcn presets and the steps to list a registry in the shadcn directory: the linked guides were not read.
6. Container query Baseline dates were not read at source. Current Chromium and Safari support them by common knowledge, not by a cited page.
7. Downloads for TanStack, Primer, Carbon and Fluent were not read, because they were not load-bearing.

## Sources

[^1]: Wikipedia contributors. (2026). [MacBook Air (Apple silicon)](https://en.wikipedia.org/wiki/MacBook_Air_(Apple_silicon)). Wikipedia. Read 2026-11-22. (M3 13-inch "Supported scaled resolutions" row: 1470 × 956 default. Secondary source.)
[^2]: Apple. (2024). [MacBook Air (13-inch, M3, 2024) - Tech Specs](https://support.apple.com/en-us/118551). Apple Support. Read 2026-11-22. (2560-by-1664 native; no scaled resolutions listed.)
[^3]: W3C. (2018, latest TR). [CSS Flexible Box Layout Module Level 1, § 9.3 Main Size Determination](https://www.w3.org/TR/css-flexbox-1/). Read 2026-11-22. ("For this step, the size of a flex item is its outer hypothetical main size.")
[^4]: W3C WAI. (2023). [Understanding SC 1.4.10: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). Read 2026-11-22.
[^5]: MDN. (2026). [CSS container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries). Read 2026-11-22.
[^6]: GitHub. (2026). [primer/react `packages/react/src/UnderlineNav/UnderlineNav.tsx`](https://github.com/primer/react/blob/main/packages/react/src/UnderlineNav/UnderlineNav.tsx), main at `2128032dca6`. Read via the GitHub API 2026-11-22. (Lines 61-152: overflow menu, "More items".)
[^7]: GitHub. (2026). [primer/react `packages/react/src/internal/components/OverflowObserverProvider.tsx`](https://github.com/primer/react/blob/main/packages/react/src/internal/components/OverflowObserverProvider.tsx), main at `2128032dca6`. Read 2026-11-22. (One IntersectionObserver rooted on the clipping row.)
[^8]: GitHub. (2026). [UnderlineNav](https://primer.style/product/components/underline-nav/). Primer docs. Read 2026-11-22. (`hideIconsBreakpoint`; ActionBar listed.)
[^9]: Adobe. (2026). [ActionGroup](https://react-spectrum.adobe.com/react-spectrum/ActionGroup.html). React Spectrum docs. Read 2026-11-22.
[^10]: Microsoft. (2026). [fluentui `packages/react-components/priority-overflow` README, `src/index.ts`, `src/types.ts`](https://github.com/microsoft/fluentui/tree/master/packages/react-components/priority-overflow), master, read via the GitHub API 2026-11-22; and [npm registry entry](https://www.npmjs.com/package/@fluentui/priority-overflow) (9.4.3, 2026-08-24, dependencies) read with `npm view` 2026-11-22.
[^11]: Microsoft. (2026). [@fluentui/react-components on npm](https://www.npmjs.com/package/@fluentui/react-components). Read with `npm view` 2026-11-22. (9.75.2 depends on `@fluentui/react-overflow` ^9.9.5.)
[^12]: IBM. (2026). [UI shell header usage](https://carbondesignsystem.com/components/UI-shell-header/usage/). Carbon Design System. Read 2026-11-22.
[^13]: MUI. (2026). [Toolbar](https://base-ui.com/react/components/toolbar). Base UI docs. Read 2026-11-22.
[^14]: MUI. (2026). [Menubar](https://base-ui.com/react/components/menubar) (site component list). Base UI docs. Read 2026-11-22.
[^15]: shadcn. (2026). [Sidebar](https://ui.shadcn.com/docs/components/sidebar). shadcn/ui docs. Read 2026-11-22.
[^16]: shadcn. (2026). [`apps/v4/registry/bases/base/ui/sidebar.tsx`](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/sidebar.tsx), main at `bfa64ff4d1c`. Read via the GitHub API 2026-11-22. (Lines 28-33 constants; 85-86 cookie; 96-108 shortcut; 548-558 tooltip.)
[^17]: shadcn. (2026). [`apps/v4/registry/bases/base/hooks/use-mobile.ts`](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/hooks/use-mobile.ts), main at `bfa64ff4d1c`. Read 2026-11-22. (768 px breakpoint.)
[^18]: shadcn. (2026). [`apps/v4/registry/bases/base/ui/` tree](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/bases/base/ui), main at `bfa64ff4d1c`. Listed via the GitHub API 2026-11-22.
[^19]: shadcn. (2026). [Vite installation](https://ui.shadcn.com/docs/installation/vite). shadcn/ui docs. Read 2026-11-22.
[^20]: shadcn. (2026). [Changelog](https://ui.shadcn.com/docs/changelog). shadcn/ui docs. Read 2026-11-22. (July 2026 "Base UI as the Default" and "React Aria"; April 2026 "shadcn preset".)
[^21]: Mantine. (2026). [AppShell](https://mantine.dev/core/app-shell/). Mantine docs. Read 2026-11-22.
[^22]: MUI. (2026). [Drawer](https://mui.com/material-ui/react-drawer/). Material UI docs. Read 2026-11-22.
[^23]: GitHub. (2026). [REST API: Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository), queried with `ghp api repos/<owner>/<repo>` for each repository in the tables on 2026-11-22 (stars, `pushed_at`, `archived`, license).
[^24]: npm, Inc. (2026). [npm public registry](https://registry.npmjs.org/), queried with `npm view <pkg> version`, `time[<version>]`, `peerDependencies.react` and `dependencies` for each package in the tables on 2026-11-22.
[^25]: npm, Inc. (2026). [npm downloads API, point/last-week](https://api.npmjs.org/downloads/point/last-week/tailwindcss,zustand,cmdk,shadcn,radix-ui,react-aria-components), plus one call per scoped package. Read 2026-11-22; window 2026-11-14 to 2026-11-20.
[^26]: Tailwind Labs. (2026). [Colors](https://tailwindcss.com/docs/colors). Tailwind CSS docs. Read 2026-11-22.
[^27]: Tailwind Labs. (2026). [Preflight](https://tailwindcss.com/docs/preflight). Tailwind CSS docs. Read 2026-11-22. ("To disable Preflight, simply omit its import while keeping everything else.")
[^28]: React. (2026). [React Compiler introduction](https://react.dev/learn/react-compiler/introduction). React docs. Read 2026-11-22.
[^29]: MUI. (2026). [base-ui CONTRIBUTING.md](https://github.com/mui/base-ui/blob/master/CONTRIBUTING.md). Read via the GitHub API 2026-11-22. (Line 23.)
[^30]: shadcn. (2026). [ui CONTRIBUTING.md](https://github.com/shadcn-ui/ui/blob/main/CONTRIBUTING.md). Read via the GitHub API 2026-11-22. (Lines 5, 135.)
[^31]: shadcn. (2026). [Registry](https://ui.shadcn.com/docs/registry). shadcn/ui docs. Read 2026-11-22.
[^32]: shadcn. (2026). [Registry Directory](https://ui.shadcn.com/docs/directory). shadcn/ui docs. Read 2026-11-22.
[^33]: Microsoft. (2026). [Locators](https://playwright.dev/docs/locators). Playwright docs. Read 2026-11-22.
[^34]: sergeiwallace/beads-ui. (2026). [PR 115: docs(design): responsive layout and app shell](https://github.com/sergeiwallace/beads-ui/pull/115), head `c0e7ca3dd88`, open, updated 2026-11-21T00:59Z. Diff read in full via `ghp pr diff` 2026-11-22. Gated link, repository access required.
[^35]: sergeiwallace/beads-ui. (2026). [PR 114: docs(web): design persistent sign-in, tailnet identity and TOTP](https://github.com/sergeiwallace/beads-ui/pull/114), head `0c4a117266c`, open, updated 2026-11-21T00:48Z. Diff read via `ghp pr diff` 2026-11-22. Gated link, repository access required.
