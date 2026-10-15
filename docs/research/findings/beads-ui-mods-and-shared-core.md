---
title: "beads-ui research leg B: Claude Code mods, MCP Apps and the shared core"
category: research
tags: [research, findings, beads-ui]
status: complete
source: "claude-opus-5-5-2026-10-15"
task: BU-mg2.1.2
display_id: BU-research-leg-b-beads-qegu
template_version: "research-findings-1.0.0"
---

# beads-ui research leg B: Claude Code mods, MCP Apps and the shared core

## Summary

1. A mod returns a plain-data element tree, and Claude Code draws it with Ink in the terminal. JSX
   compiles to Claude Code's own `h` function. The module has no React, no DOM and no Node, and it
   may import only `claude-code` and its own files [VERIFIABLE][^1][^2].
2. Drag and drop works inside a `Client` element: after a `down`, the instance holds the pointer
   and gets every `move` until the `up`. It needs fullscreen rendering. Inside tmux, wheel events
   need tmux mouse mode, and a `Client` gets whole cells only [VERIFIABLE][^2][^3].
3. No mod found writes to Beads or drags a Beads card. baselane-sh/mods ships 19 read-only Beads
   mods under MIT with one star. Outside mods, `mantoni/beads-ui` (755 stars) already holds the
   `beads-ui` package name on npm [VERIFIABLE][^4][^5][^6].
4. MCP Apps has been a stable MCP extension since 2026-01-26. Claude Desktop and claude.ai render
   it, and Claude Code does not. Desktop can run a local stdio Beads server; claude.ai reaches only
   a server on the public internet [VERIFIABLE][^7][^8][^9][^10].
5. The layers all three surfaces can share are data access, domain logic, view models and command
   tables, written as DOM-free, timer-free TypeScript. React components can be shared by the web app
   and the MCP App only. opencode, the largest TUI-plus-web codebase found, shares its client and
   schema packages and keeps separate UI code per surface [VERIFIABLE][^11].
6. The defended estimate is 35 to 45 percent of the code shared by all three surfaces, and 75 to 85
   percent shared by at least two. It rests on the mod's runtime limits and on opencode's split
   [INFERENCE].
7. For tooling, `ink-testing-library` does not apply, because a mod is not an Ink app; the mod's
   test runner is `claude plugin test`. tsup now tells users to move to tsdown
   [VERIFIABLE][^1][^12].
8. The mods surface changed twice on 2026-10-14 (2.1.299 and 2.1.300), after the seed docs. A hook
   may now hand `$` to a function declaration imported from another of the mod's files, which makes
   a multi-file shared core loadable [VERIFIABLE][^13].

## 1. What the mods API offers a task-manager mod

The three seed docs describe mods as of 2026-10-12 to 2026-10-14 [VERIFIABLE][^18][^19][^20].
This section re-reads the current pages and the public types file and keeps their three evidence
classes. "Documented" means a page on code.claude.com states it. "Types file only" means only
`mods/types/claude-code.d.ts` states it. "Inferred" means reasoning from those two.

### 1.1 Documented

A mod is a plugin whose hooks module exports `register(on, options)`. Claude Code loads `.js` and
`.ts` files directly, with no bundler or build step [VERIFIABLE][^1]. The module may import its own
files by relative path, and "the one bare import allowed is `claude-code`" [VERIFIABLE][^1]. It
has no Node.js APIs and no timer globals such as `setTimeout`; it reaches files, processes and the
network only through `$` [VERIFIABLE][^16].

Render surfaces a task manager can use, from the reference and the interface guide
[VERIFIABLE][^14][^15]:

| Site or call | What it is | Where it draws |
|---|---|---|
| `Pane` | A sidebar beside the transcript in a wide fullscreen terminal, otherwise a framed region above the prompt; several panes become tabs | Terminal, Desktop |
| `AbovePrompt` (the band) | One strip above the prompt that every mod shares | Terminal, Desktop |
| Claude Code's own rows | `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `Spinner` and others, which a mod can restyle or replace | Terminal, Desktop (some terminal only) |
| `$.ui.status(text)` | One line under the prompt, prefixed with the mod's name | Not stated per surface |
| `$.ui.toast(text)` | A toast for 4 seconds unless `timeoutMs` is set | Not stated per surface |
| `$.ui.log(text)` | A dim transcript line that Claude does not read | Not stated per surface |
| `$.ui.ask` | A question asked from inside a hook; time inside a `$` call does not count against the hook's limit | Not stated per surface |

The permission prompt is not a render site [VERIFIABLE][^15].

Elements a board needs: `Box` (flex layout, borders, hover), `Text`, `Button`, `Input`, `Select`,
`Markdown`, `Code`, `Link` and `Client`. `Raster` and `Image` draw in the terminal only, and `Svg`
in the Desktop app only [VERIFIABLE][^14]. `Client` is "a region drawn by a second file of yours,
for animation and pointer input", and that file "gets no mods API" [VERIFIABLE][^15].

Input reaches a mod through its controls. A `Button` calls `onPress`, an `Input` calls `onSubmit`
and `onInput`, and a `Select` calls `onSelect`. Each use also raises `ui.press`, `ui.input` or
`ui.select`, which other mods can intercept [VERIFIABLE][^15]. Keys reach a pane only while it has
focus. Tab, the arrows, Enter, Page Up and Page Down keep Claude Code's meaning, and "a mod can't
bind Tab or the arrow keys to anything else" [VERIFIABLE][^15]. A `hotkey` is one digit or one
lowercase letter [VERIFIABLE][^15].

Layout uses `Box` flex props (`flexDirection`, `gap`, `padding`, `width`, `height`, `borderStyle`,
`position`) [VERIFIABLE][^14]. A pane reports its width in `e.props.bodyColumns` and its docked
height in `e.props.scroll.bodyRows`; a taller tree scrolls as a whole [VERIFIABLE][^14]. A `Text`
colour is "a theme key or a color such as `'red'`" [VERIFIABLE][^15].

State has three homes. A module-level variable lasts until the module reloads. `$.state` is reactive
for the session and redraws the sites that read it. `$.store` persists across sessions in a JSON
file per plugin [VERIFIABLE][^15]. `$.store` holds "4 MiB of JSON in total", and "a `get` followed
by a `set` isn't atomic" across sessions [VERIFIABLE][^14][^15].

Processes, files and the network:

| Call | Limit or rule |
|---|---|
| `$.process.run(argv)` | Argument list, no shell; 30 seconds by default, 10 minutes at most; resolves whatever the exit code |
| `$.process.spawn` | Streams a long-running command's output |
| `$.fs.read`, `$.fs.write` | 4 MiB per file; `write` is not atomic |
| `$.http.fetch` | 4 MiB bodies; 30 seconds per call; 5 redirects; cross-origin redirects drop `Authorization` |
| `$.mcp.call` | Calls a tool on a connected MCP server |
| `$.mcp.connect(server)` | Connects an MCP server that the plugin's own manifest lists |
| One hook's own run time | 10 seconds per event, time inside `$` calls excluded |
| Redraws | Throttled to 10 a second, or 30 for the visible pane in the terminal |

Sources for the table: the reference's API and limits tables and the API guide
[VERIFIABLE][^14][^16].

Trust and install: a mod "runs with your permissions", and "Mods aren't sandboxed"
[VERIFIABLE][^17]. It installs as a plugin from a marketplace, loads for one session with
`--plugin-dir`, and `claude plugin validate` lists its hooks and calls before install
[VERIFIABLE][^17]. The terminal floor is v2.1.287 and the Desktop floor v2.1.286
[VERIFIABLE][^17]. Only the terminal and the Desktop app draw; the VS Code chat panel, `claude -p`,
the Agent SDK and cloud sessions run hooks and draw nothing [VERIFIABLE][^17].

### 1.2 Documented in the types file only

The public types file still says "Written by Claude Code 2.1.277", although its last commit is dated
2026-10-13 [VERIFIABLE][^2]. It states facts the pages leave out.

- JSX compiles against two globals, "`h` and `Fragment` (what JSX compiles against)". The suggested
  `tsconfig.json` sets `"jsxFactory": "h"` [VERIFIABLE][^2].
- The environment has "no DOM, no Node", plus web APIs such as `URL`, `TextEncoder` and
  `crypto.subtle` [VERIFIABLE][^2].
- The terminal surface is Ink: "Where a render event's component is drawn: `terminal` is Ink, which
  draws" the tree, and remote surfaces draw it themselves [VERIFIABLE][^2].
- `Box` props are "the layout, position, margin, padding and border props of Ink's Box a tree may
  set", plus hover [VERIFIABLE][^2].
- The render surface type lists four values: `terminal`, `desktop`, `mobile` ("the Claude mobile
  app") and `vscode` [VERIFIABLE][^2]. The overview page says only the terminal and Desktop draw.
  The two sources disagree; section "Gaps" records it.
- A `Client` module runs "on the drawing thread, a second per call at most". Its tree keeps the
  bounds of "20,000 nodes, 32 deep, 100,000 characters serialized" or it unmounts
  [VERIFIABLE][^2].
- `$.mcp.call` uses "the engine's own connection and credentials", and "No permission prompt: the
  plugin's call, seen by the hooks above it, is the grant" [VERIFIABLE][^2]. The types file has no
  `$.mcp.connect`; the reference page has it [VERIFIABLE][^14].

### 1.3 Inferred

React cannot run inside a mod. JSX there builds Claude Code's frozen element records, there are no
hooks or reconciler of the mod's own, and the module has no DOM. That follows from §1.2 [INFERENCE].

A third-party npm package can run only if it is copied into the plugin directory as an ES module
and needs nothing the environment lacks. Timers, Node built-ins and the DOM are absent. That follows
from the import rule and the environment line [INFERENCE].

A board with hundreds of cards needs windowing. The 100,000-character tree bound and the 20,000-node
`Client` bound cap one drawing, and redraws are throttled [INFERENCE].

A reliable write path should go through `bd`, the Beads CLI, run with `$.process.run`, or through an
MCP server called with `$.mcp.call`. Both are documented calls; the choice is for the design stage
[INFERENCE].

### 1.4 Changed since the seed docs

The changelog's newest headings are 2.1.300 and 2.1.299, both dated October 14, 2026
[VERIFIABLE][^13]. This host runs 2.1.296 (measured 2026-10-15 00:15Z). Items that bear on a
task-manager mod:

| Version | Change |
|---|---|
| 2.1.299 | `Text` gains `size`, `weight`, `mono` and `tabular`; `Box` gains named spacing steps `xs` to `xl`; `bold` is deprecated [VERIFIABLE][^13] |
| 2.1.299 | A hook may hand `$` to a function declaration imported from another file of the mod [VERIFIABLE][^13] |
| 2.1.299 | Actions a hook can block are refused when the hook cannot be handed them or cannot answer [VERIFIABLE][^13] |
| 2.1.299 | `$.ui.open` no longer reports a pane as placed where no surface draws it, such as VS Code and `claude -p` [VERIFIABLE][^13] |
| 2.1.299 | `turn.start` also fires for subagents' turns; `agent.spawn` fires on resume and carries `resume` [VERIFIABLE][^13] |
| 2.1.300 | `$.ui.view({ agentId })` shows an agent's transcript in the main view; `prompt.change` hook; `virtualText` prompt decorations; a `dir` prop for right-to-left `Text` [VERIFIABLE][^13] |

The 2.1.299 import fix matters for a shared core. The create page still says passing `$` to "a
function you import from another of your files fails validation" [VERIFIABLE][^1]. The changelog
says such mods were "refused" and that this is fixed [VERIFIABLE][^13]. The page lags the release.

### Hand-offs

- To the coordinator's design stage: the minimum Claude Code version. The candidates are 2.1.287
  (mods), 2.1.295 (guard fixes, the fleet's `sec-fleet` floor) and 2.1.299 (multi-file `$`
  passing and `Text` weights) [INFERENCE].
- To the design stage: the write path (bd CLI from the mod, or the Beads MCP server through
  `$.mcp.call`). Section 5 lists both.
- To leg C: how `bd` exposes reads and writes as JSON, and its locking under concurrent sessions.

## 2. Mouse control inside a mod

### 2.1 What a mod receives

Ordinary elements report presses only. A `Button` click runs `onPress`, and a `Box` with a `key`
can restyle itself on hover with no hook running [VERIFIABLE][^2][^15]. Only a `Client` sees raw
pointer events.

A `Client`'s surface module sets one listener with `surface.onPointer`. Each event carries a type
(`down`, `move`, `up`, `enter`, `leave`), the cell `x` and `y`, the button (`left`, `middle`,
`right`) and the held modifiers (`shift`, `alt`, `ctrl`) [VERIFIABLE][^2]. Pointer capture is
documented in the type: "After a `down` in the region the instance holds the pointer until the
`up`: every `move` reaches it, past the edges too" [VERIFIABLE][^2]. That is press, move and
release, which is what a drag needs.

A sub-cell position, `fine`, arrives only where the terminal reports pixels: "kitty, Ghostty,
iTerm2, WezTerm and foot do; tmux passes none through" [VERIFIABLE][^2]. The terminal-browser plugin
README states the opposite: "claude code does not enable pixel coordinate mouse reporting"
[VERIFIABLE][^27]. Neither was measured here. A board needs only cells, so the conflict does not
block it [INFERENCE].

The surface module sends data to the hooks with `surface.post`, at most one post per frame. A
`ui.message` hook may answer with the instance's next props [VERIFIABLE][^2].

### 2.2 Conditions for the pointer to reach the mod

Mouse support comes from fullscreen rendering: "Fullscreen rendering captures mouse events and
handles them inside Claude Code" [VERIFIABLE][^3]. Bedrock sessions fetch no feature flags. On such
a machine whose first Claude Code launch ran v2.1.239 or later, fullscreen is the default
[VERIFIABLE][^3].

| Condition | Effect on a drag |
|---|---|
| Classic renderer (`/tui default`, `CLAUDE_CODE_NO_FLICKER=0`) | No mouse capture; keyboard only [VERIFIABLE][^3] |
| tmux without `set -g mouse on` | Wheel events go to tmux; the docs do not say whether clicks reach Claude Code [VERIFIABLE][^3] |
| iTerm2 `tmux -CC` | "Fullscreen rendering is incompatible with iTerm2's tmux integration mode" [VERIFIABLE][^3] |
| `CLAUDE_CODE_DISABLE_MOUSE=1` or `CLAUDE_CODE_DISABLE_MOUSE_CLICKS=1` | Clicks and drags stop reaching Claude Code [VERIFIABLE][^3] |
| Shift held | Most terminals keep Shift-drag for native selection [VERIFIABLE][^3]; Ghostty does not send Shift with mouse reports by default [VERIFIABLE][^26] |
| Windows Terminal and other ConPTY hosts | Stale fragments on screen; `CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT=1` is the fix [VERIFIABLE][^3] |

### 2.3 Terminal mouse protocols

Claude Code owns the terminal's mouse mode, so a mod never parses escape sequences. The modes still
decide what a terminal can deliver.

| Mode | What it reports |
|---|---|
| 1000 | Button press and release |
| 1002 | Button-event tracking: motion while a button is held, per cell |
| 1003 | Any-event tracking: all motion, even with no button down |
| 1006 | SGR encoding; a release uses its own final character |
| 1016 | SGR-Pixels: "report position in pixels rather than character cells" |

Source: XTerm Control Sequences, patch 411 [VERIFIABLE][^22].

Terminal by terminal:

| Terminal | Evidence |
|---|---|
| kitty, Ghostty, iTerm2, WezTerm, foot | Report pixel positions to a `Client` [VERIFIABLE][^2] |
| iTerm2 | Needs "Enable mouse reporting" per profile for wheel and clicks [VERIFIABLE][^3] |
| VS Code terminal (xterm.js) | Supports 1000, 1002, 1003, 1006 and 1016 [VERIFIABLE][^23] |
| tmux 3.8 | With `mouse` on, tmux "captures the mouse"; no pixel positions reach a `Client` [VERIFIABLE][^2][^24] |
| Windows Terminal | Fixed SGR motion reports in May 2025 to "match what everyone else is doing" [VERIFIABLE][^25] |
| Apple Terminal | Not measured or documented for mods [NO SOURCE] |

Which mode Claude Code enables is not documented. Hover styling on `Box` needs motion with no
button down, which implies mode 1003 [INFERENCE].

### 2.4 What existing mods and TUIs do for drag

Inside Claude Code, the Social Champ calendar mod lets a user "drag posts not yet published to
another day". Every change is previewed and sent only after an explicit "Yes" [VERIFIABLE][^30]. The
seed survey records `codebase-galaxy` using drag to pan a braille graph [VERIFIABLE][^18].
terminal-browser forwards `down`, `move` and `up` from a transparent `Client` to Chromium
[VERIFIABLE][^19].

Outside Claude Code, terminal kanban boards already drag cards. kanban-tui (Python, Textual) says
"Movement between columns and reordering within a column are also supported via mouse drag and
drop" [VERIFIABLE][^28]. rust_kanban (Ratatui) lists "Drag and Drop cards with the mouse"
[VERIFIABLE][^29].

### 2.5 Design consequences

A drag between columns should live inside one `Client` that draws the whole board. Capture belongs
to the instance that saw the `down`, so a second `Client` cannot see the drop [INFERENCE].

The `Client` keeps its own drag state with `setState` and posts only the completed move to the
hooks. The hooks then run the Beads write, behind a confirmation for destructive changes
[INFERENCE].

Every pointer action needs a keyboard path. Tmux without mouse mode, the classic renderer and the
mouse opt-out variables leave the keyboard as the only input, and arrows reach a `Client` only after
a click gives it focus [VERIFIABLE][^2][^3].

### Hand-offs

- To leg A: drag affordances, drop indicators and keyboard reorder patterns from Jira, Linear and
  Trello.
- To the design stage: a live drag check in the fleet's real setup (tmux over SSM, Ghostty or kitty
  locally). No terminal was driven in this run.

## 3. Open-source mods and Beads prior art

### 3.1 Galleries, lists and marketplaces

| Source | Reading on 2026-10-15 |
|---|---|
| claude-mods.com, human-checked directory | "211 mods listed", updated Oct 14, 2026 [VERIFIABLE][^31] |
| mods.aidojo.si, automated scanner | "3836 mods", last scanned Oct 13, 2026 [VERIFIABLE][^32] |
| GitHub topic `claude-mods` | 112 repositories; 5 match task, board or kanban, each with 0 stars [VERIFIABLE][^33] |

The seed docs list the other indexes and marketplaces, among them `wh000wh000/awesome-claude-mods`,
`hamzafer/claude-code-mods` and Anthropic's community marketplace [VERIFIABLE][^19]. This run did not
re-read them.

### 3.2 The baselane-sh/mods Beads family

baselane-sh/mods ships 19 Beads mods: bars above the prompt, panes, slash commands, a guard and
reminders. They need `bd` 1.2 or later [VERIFIABLE][^4]. The README states "No beads mod creates,
changes or closes a bead" [VERIFIABLE][^4].

The pane reads Beads through one helper. It runs `bd -C <cwd> --readonly <args> --json` with
`$.process.run`, and turns every failure into one dim line [VERIFIABLE][^4]. The source comments
that "bd reads an embedded database: at most one load every 10 seconds", and the pane throttles to
that gap [VERIFIABLE][^4].

The repo builds each plugin folder from shared engines with `scripts/build.mjs`. Generated folders
carry a `.generated` marker, and "Each mod has its own copy of its engine" [VERIFIABLE][^4]. That is
the same monorepo problem beads-ui faces: plugin code cannot import outside its own folder.

Route A signals: 1 star, 0 forks, created 2026-10-04, last push 2026-10-06, no releases
[VERIFIABLE][^4]. By the fleet's source-vetting rule it is exploratory. Its MIT licence allows
copying with attribution [INFERENCE].

### 3.3 Other task, board and issue-tracker mods

The directory lists task-shaped mods. A `Linear` pane shows projects and issues. `storybloq` draws a
ticket board over a `.story/` folder. `pull-request-pane` shows a session's PRs and issues
[VERIFIABLE][^31]. None of the directory's task-shaped listings read in this run names kanban,
Jira or Beads. That reading came through an extraction of the page, so it is [INFERENCE].
The seed doc lists `claude-code-kanban`, `claude-tasknotes-renderer-mod` and `bead-band`, all with 0
or 1 star [VERIFIABLE][^19].

No mod found writes to Beads or drags a card. The seed doc reached the same result: "None of these
writes to Beads, and none was found that drags cards with the mouse" [VERIFIABLE][^19].

### 3.4 Beads boards outside the mods ecosystem

A GitHub search for Beads UIs returned 95 repositories [VERIFIABLE][^5]. The ones with activity:

| Project | Kind | Stack | Stars | Last push | Licence |
|---|---|---|---|---|---|
| mantoni/beads-ui | Local web UI; npm `beads-ui`, bin `bdui` | JavaScript, express, ws, lit-html, esbuild | 755 | 2026-08-11 | MIT |
| zjrosen/perles | Terminal kanban with a Beads query language | Go | 191 | 2026-10-13 | MIT |
| brendan-appstart/bead-me-up-scotty | Web board with drag and drop, writes through `bd` | Next.js 16, TypeScript | 150 | 2026-10-14 | MIT |
| assimelha/bdui | Terminal UI with kanban, tree and graph views | Ink (React) | 118 | 2025-11-26 | not checked |
| ChrisEdwards/abacus | Terminal UI | Go | 44 | 2026-07-19 | MIT |
| vanderheijden86/b9s | Keyboard-driven terminal UI | Go | 13 | 2026-10-14 | MIT |
| cuongbphv/beads-ui-vscode-ext | VS Code extension with kanban and roadmap | TypeScript | 4 | 2026-10-03 | MIT |

Sources: search and repository metadata [VERIFIABLE][^5], npm and package.json [VERIFIABLE][^6].

bead-me-up-scotty already does what A001 asks of the board. Users can "drag them between columns,
and change their status directly in the UI" [VERIFIABLE][^34]. It writes with `bd update --status`,
`bd close` and `bd delete`, the last behind a confirmation [VERIFIABLE][^34].

The name `beads-ui` is taken on npm by mantoni's package [VERIFIABLE][^6]. A public monorepo here
would publish under a scope, or under other names [INFERENCE].

### 3.5 Doc viewers and browser mods

The browser seed doc covers these in full. One mod, terminal-browser, shows a live Chromium page. It
needs kitty or Ghostty outside tmux. Markdown and PDF readers exist under MIT [VERIFIABLE][^19].
Nothing new was looked for here. They belong to the doc-editor epic.

### 3.6 Reuse, fork or borrow

| Project | Licence | Maintenance | Verdict |
|---|---|---|---|
| baselane-sh/mods Beads family | MIT | Exploratory, days old | Borrow the read helper and the build-per-plugin pattern; copying with attribution is allowed |
| mantoni/beads-ui | MIT | Most adopted Beads UI; releases | Borrow the board and epic views and the live-update approach; its lit-html stack does not match a React plan |
| bead-me-up-scotty | MIT | Active, weekly pushes | Borrow the drag-to-status mapping and the archive and delete flows |
| perles, abacus, b9s | MIT | Active Go TUIs | Patterns only; Go code cannot run in a mod |
| kanban-tui, rust_kanban | MIT | Active | Patterns for terminal drag and drop |
| Social Champ calendar mod | MIT | One vendor, new | Pattern for drag plus preview-then-approve in a mod |

The verdicts are [INFERENCE] from the licence and activity figures above.

### Hand-offs

- To leg A: the UX of the Beads boards above, and Jira and Linear patterns for board, backlog and
  sprint views.
- To leg C: how each Beads UI reads and writes the store (bd CLI, JSON envelope, polling).
- To the coordinator: the package naming question raised by the npm collision.

## 4. MCP Apps for a Beads app

(filled in the next commit)

## 5. The shared core across the TUI mod, the MCP App and the web app

(filled in the next commit)

## 6. Monorepo tooling

(filled in the next commit)

## Gaps, blindspots and emergent findings

(filled in the next commit)

## Sources

[^1]: Anthropic. (2026). [Create a mod](https://code.claude.com/docs/en/plugins/mods/create.md). Claude Code Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (No build step; import rules for a hooks module; generated type files; `claude plugin validate` rules; `claude plugin test`.)
[^2]: Anthropic. (2026). [claude-code: mods/types/claude-code.d.ts](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts). GitHub. Read in full via the GitHub REST API (HTTP 200) 2026-10-15; 517,451 bytes; header "Written by Claude Code 2.1.277"; last commit to the path `bf2323b302`, 2026-10-13. (JSX factory, runtime environment, `ClientModule`, `ClientSurface`, `ClientPointerEvent`, render surfaces, `$.mcp.call`.)
[^3]: Anthropic. (2026). [Fullscreen rendering](https://code.claude.com/docs/en/fullscreen.md). Claude Code Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Mouse capture, tmux mouse mode, `tmux -CC`, default renderer table, mouse opt-out variables, native selection keys.)
[^4]: Baselane. (2026). [baselane-sh/mods](https://github.com/baselane-sh/mods). GitHub. README, tree, `engines/pane/hooks/beads.ts` and `plugins/bead-chime/.generated` read via the GitHub REST API (HTTP 200) 2026-10-15; 1 star, 0 forks, MIT, created 2026-10-04, last push 2026-10-06, 0 releases.
[^5]: GitHub. (2026). [Repository search: "beads ui"](https://api.github.com/search/repositories?q=beads+ui+in:name,description&sort=stars&per_page=15) and a repo-qualified search for six Beads projects. GitHub REST API (HTTP 200) 2026-10-15; `total_count` 95. (Stars, forks, language, licence and dates for mantoni/beads-ui, zjrosen/perles, brendan-appstart/bead-me-up-scotty, ChrisEdwards/abacus, vanderheijden86/b9s, cuongbphv/beads-ui-vscode-ext; assimelha/bdui README read separately.)
[^6]: Antoni, M. (2026). [beads-ui on npm](https://registry.npmjs.org/beads-ui/latest) and [mantoni/beads-ui package.json](https://github.com/mantoni/beads-ui/blob/main/package.json). npm registry and GitHub. Verified accessible (HTTP 200) 2026-10-15; version 0.12.6, bin `bdui`, latest release 2026-08-11.
[^7]: Salomon, I., Yosef, L., Chafik, O., et al. (2026). [SEP-1865: MCP Apps: Interactive User Interfaces for MCP](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx). modelcontextprotocol/ext-apps. Read in full via the GitHub REST API (HTTP 200) 2026-10-15; 59,181 bytes; status "Stable (2026-01-26)"; a `draft` directory also exists.
[^8]: Anthropic. (2026). [Get started with MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started). Claude Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Local stdio example servers in Claude Desktop, the display permission prompt, `ui.domain` for Claude, the MCP Apps skills plugin.)
[^9]: Anthropic. (2026). [Build an MCP server for Claude](https://claude.com/docs/connectors/building/index). Claude Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Remote versus local servers, Streamable HTTP, OAuth, size and timeout limits per surface, unsupported MCP features.)
[^10]: Model Context Protocol. (2026). [Extension Support Matrix](https://modelcontextprotocol.io/extensions/client-matrix). modelcontextprotocol.io. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (MCP Apps clients; no Claude Code row.)
[^11]: Anomaly. (2026). [anomalyco/opencode](https://github.com/anomalyco/opencode). GitHub. Root and per-package `package.json` files (`tui`, `app`, `client`, `ui`, `theme`) and a code search of `packages/tui/src` read via the GitHub REST API (HTTP 200) 2026-10-15; 213,531 stars, MIT, last push 2026-10-14.
[^12]: egoist. (2026). [tsup](https://github.com/egoist/tsup). GitHub. README verified accessible (HTTP 200, WebFetch) 2026-10-15. (Maintenance notice recommending tsdown.)
[^13]: Anthropic. (2026). [Claude Code changelog](https://code.claude.com/docs/en/changelog.md). Claude Code Documentation. Verified accessible (HTTP 200, WebFetch, first 100,000 characters) 2026-10-15. (Entries 2.1.299 and 2.1.300, both dated October 14, 2026; no 2.1.297 or 2.1.298 heading.)
[^14]: Anthropic. (2026). [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md). Claude Code Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. ("As of v2.1.290"; files, events, API namespaces, render sites, elements by surface, limits, settings.)
[^15]: Anthropic. (2026). [Draw in the interface with a mod](https://code.claude.com/docs/en/plugins/mods/interface.md). Claude Code Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Panes, the band, elements, JSX, keyboard focus, hotkeys, `Raster`, redraws, `$.state`, `$.store`.)
[^16]: Anthropic. (2026). [Use the mods API](https://code.claude.com/docs/en/plugins/mods/api.md). Claude Code Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Commands, tools, model calls, timers, status line, toasts, messaging, files, processes, network.)
[^17]: Anthropic. (2026). [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview.md). Claude Code Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Where mods run and draw, version floor, trust model, install, built-in mods.)
[^18]: ai-harness. (2026). [Claude Code mods: capabilities, ecosystem and fit for the fleet](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/claude-code-mods.md). ai-harness `docs/research/claude-code-mods.md`, 1,148 lines. Read in full from the local main tree 2026-10-15. (Seed doc; refreshed 2026-10-12.)
[^19]: ai-harness. (2026). [A working web browser inside the Claude Code TUI through mods](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/claude-code-mods-web-browser-in-the-tui.md). ai-harness `docs/research/claude-code-mods-web-browser-in-the-tui.md`, 680 lines. Read in full from the local main tree 2026-10-15. (Seed doc, 2026-10-14.)
[^20]: ai-harness. (2026). [Claude Code mods for ai-harness and every project](https://github.com/sergeiwallace/ai-harness/blob/main/docs/designs/aih-xhc5u-claude-code-mods.md). ai-harness `docs/designs/aih-xhc5u-claude-code-mods.md`, 1,401 lines. Read in full from the local main tree 2026-10-15. (Seed design doc.)
[^21]: poteat (Anthropic) and commenters. (2026). [Mods - make Claude 10x more extensible (issue #91870)](https://github.com/anthropics/claude-code/issues/91870). GitHub, anthropics/claude-code. All comments read via the GitHub REST API (HTTP 200) 2026-10-15; open. (The 1 MB module report and practitioner bundling notes.)
[^22]: Dickey, T. (2026). [XTerm Control Sequences](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html). invisible-island.net. Verified accessible (HTTP 200, WebFetch, two reads) 2026-10-15; "updated for XTerm Patch #411 (2026/08/23)". (Mouse modes 1000, 1002, 1003, 1006, 1016.)
[^23]: xterm.js. (2026). [Supported Terminal Sequences](https://xtermjs.org/docs/api/vtfeatures/). xtermjs.org. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (DECSET 1000, 1002, 1003, 1006 and 1016 marked supported.)
[^24]: tmux. (2026). [tmux.1 manual page source](https://github.com/tmux/tmux/blob/master/tmux.1) and [releases](https://github.com/tmux/tmux/releases). GitHub. Read via the GitHub REST API (HTTP 200) 2026-10-15; latest release 3.8, 2026-09-09. (The `mouse` option.)
[^25]: Microsoft. (2025). [Fix SGR mouse movement reports (pull request #18864)](https://github.com/microsoft/terminal/pull/18864). GitHub, microsoft/terminal. Read via the GitHub REST API (HTTP 200) 2026-10-15; merged 2025-05-02.
[^26]: Ghostty. (2026). [Configuration reference](https://ghostty.org/docs/config/reference). ghostty.org. Verified accessible (HTTP 200, WebFetch, first 100,000 characters) 2026-10-15. (`mouse-reporting`, `mouse-shift-capture`.)
[^27]: zenbu-labs. (2026). [terminal-browser: claude-code-plugin README](https://github.com/zenbu-labs/terminal-browser/blob/main/claude-code-plugin/README.md). GitHub. Read via the GitHub REST API (HTTP 200) 2026-10-15. (Multiplexer caveat; pixel mouse reporting caveat.)
[^28]: Zaloog. (2026). [kanban-tui](https://github.com/Zaloog/kanban-tui). GitHub. README read via the GitHub REST API (HTTP 200) 2026-10-15; 286 stars, Python, last push 2026-08-28.
[^29]: yashs662. (2025). [rust_kanban](https://github.com/yashs662/rust_kanban). GitHub. README read via the GitHub REST API (HTTP 200) 2026-10-15; 272 stars, Rust, last push 2025-02-13.
[^30]: Social Champ. (2026). [socialchamp-claude-mods](https://github.com/SocialChamp/socialchamp-claude-mods). GitHub. README read via the GitHub REST API (HTTP 200) 2026-10-15. (Drag to reschedule; preview-then-approve writes; Claude Code 2.1.293 floor.)
[^31]: Claude Mods. (2026). [Claude Mods directory](https://claude-mods.com/). claude-mods.com. Verified accessible (HTTP 200, WebFetch) 2026-10-15. ("211 mods listed", updated Oct 14, 2026; task-shaped listings.) The listing page for the Linear mod at `/linear/` returned HTTP 404, so only the directory entry is cited.
[^32]: karanb192. (2026). [Claude Code mods scanner](https://mods.aidojo.si/). mods.aidojo.si. Verified accessible (HTTP 200, WebFetch, first 100,000 characters) 2026-10-15. ("3836 mods", last scanned Oct 13, 2026.)
[^33]: GitHub. (2026). [Search API: topic:claude-mods](https://api.github.com/search/repositories?q=topic:claude-mods&per_page=1) and a task, board and kanban query on the same topic. GitHub REST API (HTTP 200) 2026-10-15; `total_count` 112 and 5.
[^34]: brendan-appstart. (2026). [bead-me-up-scotty](https://github.com/brendan-appstart/bead-me-up-scotty). GitHub. README read via the GitHub REST API (HTTP 200) 2026-10-15; 150 stars, TypeScript, MIT, last push 2026-10-14.
[^35]: Model Context Protocol. (2026). [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview). modelcontextprotocol.io. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (How MCP Apps work, security model, framework support, client list, examples.)
[^36]: Model Context Protocol. (2026). [modelcontextprotocol/ext-apps](https://github.com/modelcontextprotocol/ext-apps) and its [v2.0.0 release notes](https://github.com/modelcontextprotocol/ext-apps/releases/tag/v2.0.0). GitHub. Read via the GitHub REST API (HTTP 200) 2026-10-15; 2,957 stars, 404 forks, latest release v2.0.3 2026-09-25; root `package.json` read for tooling.
[^37]: Anthropic. (2026). [Design guidelines for MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines). Claude Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Display modes, mobile WebView, gestures, CSP in Claude, style variables.)
[^38]: Anthropic. (2026). [Troubleshoot MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting). Claude Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Developer tools, the 150,000-character threshold, iOS `Referer`, `ui.domain` and local stdio servers.)
[^39]: Anthropic. (2026). [Test your connector](https://claude.com/docs/connectors/building/testing). Claude Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Custom connectors on every plan; tunnelling a local server.)
[^40]: Anthropic. (2026). [Build a desktop extension with MCPB](https://claude.com/docs/connectors/building/mcpb). Claude Documentation. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Local stdio bundles for Claude Desktop, bundled Node.js, platforms.)
[^41]: Model Context Protocol. (2026, January 26). [MCP Apps: Bringing UI capabilities to MCP clients](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/). MCP blog. Verified accessible (HTTP 200, WebFetch) 2026-10-15.
[^42]: Anthropic. (2026, January 26). [Interactive tools in Claude](https://claude.com/blog/interactive-tools-in-claude). Claude blog. Verified accessible (HTTP 200, WebFetch) 2026-10-15. (Launch apps including Asana; surfaces and plans.)
[^43]: MCP-UI. (2026). [MCP-UI](https://mcpui.dev/). mcpui.dev. Verified accessible (HTTP 200, WebFetch) 2026-10-15.
[^44]: Anomaly. (2026). [anomalyco/opentui](https://github.com/anomalyco/opentui) README and [packages/keymap README](https://github.com/anomalyco/opentui/blob/main/packages/keymap/README.md). GitHub. Read via the GitHub REST API (HTTP 200) 2026-10-15; 13,537 stars, MIT, last push 2026-10-14.
[^45]: Demedes, V. (2026). [Ink](https://github.com/vadimdemedes/ink) README and [v8.0.0 release notes](https://github.com/vadimdemedes/ink/releases/tag/v8.0.0). GitHub. Read via the GitHub REST API (HTTP 200) 2026-10-15; 40,102 stars; v8.0.0 2026-10-03.
[^46]: Ratatui. (2026). [ratzilla](https://github.com/ratatui/ratzilla). GitHub. README read via the GitHub REST API (HTTP 200) 2026-10-15; 1,470 stars, Apache-2.0, last push 2026-07-04.
[^47]: Textualize. (2025). [textual-serve](https://github.com/Textualize/textual-serve). GitHub. README read via the GitHub REST API (HTTP 200) 2026-10-15; 407 stars, last push 2025-11-01.
[^48]: Charm. (2026). [wish](https://github.com/charmbracelet/wish). GitHub. README read via the GitHub REST API (HTTP 200) 2026-10-15; 5,554 stars, last push 2026-10-04.
[^49]: GitHub. (2026). Repository metadata via a repo-qualified search for bubbletea, textual, ratatui, react-blessed, react-nil, textual-web, textual-serve, wish, ratzilla, ink, opentui and opencode. GitHub REST API (HTTP 200) 2026-10-15. (Stars, language, licence, last push, archived flag.)
[^50]: GitHub. (2026). Repository metadata via a repo-qualified search for pnpm, turborepo, nx, vite, tsup, tsdown, esbuild, vitest, playwright, ink-testing-library, changesets, biome, eslint, prettier and oxc. GitHub REST API (HTTP 200) 2026-10-15.
[^51]: npm. (2026). [Download counts, last week](https://api.npmjs.org/downloads/point/last-week/turbo,nx,vitest,tsdown,tsup,ink-testing-library,eslint,prettier,oxlint,vite,esbuild,ink), plus single queries for `@biomejs/biome` and `@changesets/cli`. api.npmjs.org. Verified accessible (HTTP 200, WebFetch) 2026-10-15; window 2026-10-06 to 2026-10-12.

## Appendix: Provenance Ledger

(filled in the last commit)

## Run History

(filled in the last commit)
