---
title: "What a Claude Code mod can draw, focus and sync: the ground for the beads-ui task panel"
category: research
tags: [research, beads-ui, claude-code-mods, task-panel, rendering, focus, keybindings, mouse, layout, sync]
status: complete
source: "claude-opus-5-5-2026-10-24"
template_version: "research-1.2.0"
delegation_provenance:
  version: 2
  contributors: []
task: BU-ylx.6
related_docs:
  - docs/designs/beads-ui-design.md
  - docs/research/findings/beads-ui-mods-and-shared-core.md
  - docs/research/findings/beads-ui-task-manager-ux.md
stub: false
---

# What a Claude Code mod can draw, focus and sync: the ground for the beads-ui task panel

## Founding Ask Coverage

`canonical_root_json`: {"blob_oid":"8cddc5147bef5fa7ccca0cf082d6b3728470c891","capture_commit":"3aedc1b38d7700269f6977f3b63808d43418c225","content_sha256":"d798833b2f73c732d0b29a37c11d4b5ae0ed93123eb4b1ddc98104606b2a5903","entry_ids":["A001","A002","A003","A004"],"generation":2,"path":"docs/asks/BU-epic-agentic-ai-native-beads-ylx.md","previous_ref_sha256":"d669898b4dc8a8a75f8791637da4f88d1f517b29ef5f9025c186d997debe04a7","repository":"ai-harness","schema_version":1,"task_id":"BU-epic-agentic-ai-native-beads-ylx"}

`founding_ask_ref_sha256`: 9848bb089d8c6559bb38f682f26304f5d961ced7c35cd069ec12046860ed4655

The raw record lives in ai-harness at `docs/asks/BU-epic-agentic-ai-native-beads-ylx.md`. Entry A005 (2026-10-23T23:51:05Z) was appended to it on an ai-harness PR not yet merged when this doc was written, so it sits outside the root above; its coverage row is included. This index is non-authoritative; the raw record governs.

| Authoritative raw entry | Coverage and disposition |
|---|---|
| A001 | Out of scope here: the band counts and the rename are design tasks T-1.7, T-1.8 and Phase 1B. |
| A002, the task-panel paragraph | "we need to create our own tui claude code mod task panel ... in that same space as the cc task panel ... config file flags / settings to have both of them co-exist, or one or the other": section 4. "navigate up / down to full collapsed tasks ... configure in a config file and also update config from the beads-ui tui components how many beads-ui tasks to display and how many to collapse": sections 3 and 4. "select them to open them up to see details ... edit the fields": sections 1 and 2. "popup options menu ... and also shortcuts, everythign should be able to be done via both surfaces, keyboard and mouse control ... right / left click": section 2. "click a shortcut to move the cursor from the claude code prompt box to the beads ui tui panel and navigate": section 2. "if you need to, then /orchestrate /research-doc to see if / how that's possible": this doc. "auto-committed / pushed / /sync-git ... formatted commits ... fallback alert / hook / context injection to tell the cc session to handle any git conflict resolution ... investigate root cause and /bug-fix": section 5. "kanban board and sprint / backlog view and timeline ... menu bar / side nav bar ... configure settings ... a little mini app inside claude code tui": sections 1 and 3, and the Recommendation. |
| A002, the band and refresh paragraphs | Out of scope here: design D-25 and D-26. |
| A003 | Out of scope here: design T-1B.2. |
| A004 | Out of scope here: design D-24 and T-1B.1. |
| A005 (pending merge into the record) | "why is there no `3` option?": design D-28. "performance and caching or loading fast": section 6 and design D-26, D-29. "dynamically render based on the size of the claude code tui terminal pane and the cc mod beads-ui pane ... ugly text overflow ... wordiness of the button / shortcut options": section 3. "more like buttons and side nav bars / menu bars ... dropdowns and can render icons": sections 1 and 3. "typescript / javascript / css or whtaever and maybe any frameworks ... performant ... aren't resource hogs": sections 1 and 6. "i saw someone load an entire browser in a claude code mod tui": section 7. |

**Status:** complete

**Created:** 2026-10-24

**Task:** BU-ylx.6 (display id BU-beads-ui-band-v2-per-zbad), under epic BU-ylx; resolves Open Question 10 of `docs/designs/beads-ui-design.md`.

## Table of Contents

- [Context](#context)
- [Temporal Scope](#temporal-scope)
- [Executive Summary](#executive-summary)
- [1. What a mod can draw](#1-what-a-mod-can-draw)
  - [When to use](#when-to-use)
- [2. Focus, keys and the mouse](#2-focus-keys-and-the-mouse)
  - [When to use](#when-to-use-1)
- [3. Layout and reflow](#3-layout-and-reflow)
- [4. Living beside the Claude Code task panel](#4-living-beside-the-claude-code-task-panel)
- [5. Edits that commit and sync themselves](#5-edits-that-commit-and-sync-themselves)
- [6. Speed and resource limits](#6-speed-and-resource-limits)
- [7. "An entire browser in a mod"](#7-an-entire-browser-in-a-mod)
- [Gaps, blindspots and emergent findings](#gaps-blindspots-and-emergent-findings)
- [Comparison](#comparison)
- [Recommendation](#recommendation)
- [Open Questions](#open-questions)
- [Sources](#sources)
- [Appendix: Research Prompt](#appendix-research-prompt)
- [Appendix: Provenance Ledger](#appendix-provenance-ledger)
- [Run History](#run-history)

<!-- doc:region name="context" kind="immutable" -->

## Context

Sergei wants the beads-ui pane to become a task panel that sits where Claude Code's own task panel sits, navigable and editable by keyboard and mouse, with menus, a prompt-to-panel shortcut, edits that commit and sync themselves, and later kanban, sprint, backlog, timeline and settings views behind a nav bar. He also wants it to reflow to its size, look like a real interface, load fast, and use a richer stack if that is fast and light. The design's Open Question 10 asks what the panel should be drawn with and how edits should sync. This doc answers from Claude Code's own mods documentation and type declarations, read on 2026-10-23 and 2026-10-24 for the build installed on sem-kg-ec2 (Claude Code 2.1.310), and from the fleet's measured setup: every session on that host runs inside tmux over AWS SSM.

**Primary period:** 2026
**Source weighting:** Claude Code's mods docs and public type declarations as of 2.1.310 are primary; GitHub mods are secondary; nothing earlier than 2026 applies, because mods shipped in 2026.

<!-- /doc:region name="context" -->

<!-- doc:region name="body" kind="replaceable" -->

## Temporal Scope

Primary focus: the mods API as documented on 2026-10-23 and 2026-10-24 (reference entries cover the CLI and Desktop as of v2.1.290 and VS Code as of v2.1.299 [VERIFIABLE][^1]). The mods surface changes between releases (design Risk 1), so every capability below is re-checked against the installed build's types before the code that relies on it ships.

## Executive Summary

Build the task panel from Claude Code's element tree, which already gives buttons, a dropdown (`Select`), one-line inputs, Markdown, borders and hover styles, and draw the dense, pointer-heavy region (the task list and the board) as a `Client`, a component module Claude Code draws on its drawing thread that receives left, middle and right clicks, drags and keys. Reflow by width tiers read from the pane's `bodyColumns`, with labels that shorten to a key and a glyph in a narrow pane. Do not render a browser or images: `Image` shows only its alt text inside tmux, where the fleet's sessions run, and the "browser in a mod" Sergei saw is most likely a picture in kitty or Ghostty, or a mod that opens the system browser. For focus, Claude Code already provides the route: the user binds a chord to `command:bu` in `keybindings.json` to open or close the pane from the prompt, and Ctrl+X then Tab (`abovePrompt:focus`) moves focus into the band and each open pane. For edit sync, the mod writes through `bd`, runs the configured publish command, and on a conflict starts a turn in the session with `$.prompt.submit` so the session resolves it.

## 1. What a mod can draw

A mod draws by returning a tree of elements from a `ui.render` hook; each place it can draw is a render site, among them a pane, the band above the prompt and the spinner [VERIFIABLE][^2]. In a wide fullscreen terminal a pane is a sidebar beside the transcript; in a narrower one it sits above the prompt [VERIFIABLE][^2].

The element table, with what each app draws [VERIFIABLE][^1]:

| Element | What it gives the panel | Terminal | Desktop | VS Code |
|---|---|:-:|:-:|:-:|
| `Box` | Flex layout, borders (`round`, `single`, `bold`, `quote` and others), padding and gap steps, `backgroundColor`, absolute `position`, `overflow`, and `hover` style overrides | yes | yes | yes |
| `Text` | Colour, background, bold or weight, italic, underline, dim, inverse, `wrap` | yes | yes | yes |
| `Button` | `label`, `onPress`, `hotkey`, `plain`, `autoFocus`, `action`, `hover` | yes | yes | yes |
| `Select` | A dropdown: closed it shows its label and current option with a down arrow; open it lists the options [VERIFIABLE][^3] | yes | yes | yes |
| `Input` | A one-line field with a submit label | yes | yes | yes |
| `Markdown`, `Code`, `Link` | Formatted text, syntax-coloured code and diffs, links | yes | yes | yes |
| `Client` | "A region drawn by a second file of yours, for animation and pointer input" [VERIFIABLE][^2] | yes | yes | no |
| `Raster` | A grid of coloured character cells, repainted in place with `$.ui.blit` | yes | no | no |
| `Image` | A PNG or raw pixels | kitty, Ghostty, iTerm2 only | no | no |
| `Svg` | SVG markup | no | yes | yes |

A `Client` module exports one component, `(props, surface) => RenderElement`, drawn with `h` and `Fragment`; `surface.setState` schedules one more call on the next frame, `surface.every` runs a callback on the frame clock, `surface.onPointer` and `surface.onKey` set its listeners, and `surface.post` sends plain data to the hooks module as a `ui.message` event [VERIFIABLE][^4]. It "Runs on the drawing thread, a second per call at most" [VERIFIABLE][^4], has no mods API of its own, and when it fails the terminal shows a dimmed line in its place while the rest of the drawing stays [VERIFIABLE][^2].

Icons: the terminal draws characters, so an icon in a narrow pane is a Unicode glyph in a `Text` or a `Button` label. `Image` cannot serve as an icon inside tmux (section 7) [INFERENCE].

A framework: the hooks module has no Node APIs and no timer globals, only standard JavaScript and web APIs [VERIFIABLE][^5], and the design's earlier spike found `zustand/vanilla` runs in a mod unmodified while `xstate` cannot load [VERIFIABLE][^6]. React, CSS and a DOM do not exist in the terminal surface; the `Client`'s `h` is the component model there [INFERENCE].

### When to use

The element tree for structure, forms, menus and the nav bar, because it draws on every surface and gives focus and Tab order for free. A `Client` for the task list and the board, where right-click menus, hover, drag and dense drawing matter, in the terminal and Desktop only, with the element tree as its fallback in VS Code and on `ui.fault`.

## 2. Focus, keys and the mouse

Focus enters a pane three ways: the mod opens it with `focus: true` from a command or a press, the user presses Ctrl+X then Tab, or the user clicks it, which in the terminal needs fullscreen rendering [VERIFIABLE][^2]. Claude Code grants `focus: true` only while the prompt is empty and nothing else holds focus [VERIFIABLE][^2]. Esc returns focus to the prompt and, with `closeOnEscape: true`, also closes the pane; Ctrl+X then X closes it even while a field has focus [VERIFIABLE][^2].

Keys a pane receives while focused: Tab moves to the next control, Up and Down move between controls or scroll, Enter presses or submits, a button's hotkey presses it, and Ctrl+X then an arrow resizes the pane [VERIFIABLE][^2]. "A mod can't bind Tab or the arrow keys to anything else" [VERIFIABLE][^2]. Outside focus, only a band button's digit hotkey (typed alone into an empty prompt, then a pause) and a button's `action` binding reach the mod [VERIFIABLE][^1].

The prompt-to-panel shortcut already exists in Claude Code's keybindings [VERIFIABLE][^7]:

- `command:<name>` in the `Chat` context runs a command from a key: `"meta+b": "command:bu"` makes one chord open or close the beads-ui pane from the prompt.
- `abovePrompt:focus` (Ctrl+X Tab by default) moves focus "into the band, then to each open pane, and from the last pane back to the prompt".
- `pane:next` and `pane:previous` (unbound) switch between open panes; `pane:close` is Ctrl+X X.
- A `Button`'s `action` names one of these actions, so the user's chord for it presses that button [VERIFIABLE][^1].

The mods API also has `$.ui.focus`, which "Moves the focus ring of one of this plugin's sites onto an element" and resolves `{}` or `{ deny }`, and `$.ui.panes`, which lists the plugin's open panes [VERIFIABLE][^4].

Mouse: a `Client` receives pointer events of type `down`, `move`, `up`, `enter` and `leave`, with the column and row inside its region, `button` of `left`, `middle` or `right`, and the modifier keys; after a `down` it holds the pointer until `up` [VERIFIABLE][^4]. A `Box` or `Button` takes `hover` styles that the surface applies with no hook call [VERIFIABLE][^4]. A `Button` is pressed by a click, its hotkey, its `action` chord or Enter under focus [VERIFIABLE][^4]. A right-click menu therefore lives in a `Client`: on a `right` `down`, it draws a menu box at the pointer and posts the chosen item to the hooks [INFERENCE]. Whether clicks reach a `Client` inside tmux over SSM with `set -g mouse on` is the design's Open Question 2, still unmeasured.

### When to use

`command:bu` plus Ctrl+X Tab for focus from the keyboard, documented with a ready `keybindings.json` block; a click for mouse users. Every menu item also carries a hotkey, and every hotkey also appears in a menu, so both surfaces reach every capability, as A002 asks.

## 3. Layout and reflow

A pane's render props carry `bodyColumns` (its drawable width), `placement` (`dock` beside the transcript or `inline` above the prompt), `scroll.bodyRows` for a docked pane's height, `isFocused` and `view` [VERIFIABLE][^1]. Claude Code re-runs the `ui.render` hook "when the site's props change or the terminal's width changes" [VERIFIABLE][^2], so a layout chosen from `bodyColumns` reflows on every resize with no timer. A docked pane stops widening at 45% of the terminal's width; `$.ui.open` asks for `columns` and `rows`, and a user resize wins after that [VERIFIABLE][^2]. A tree taller than the pane scrolls as a whole [VERIFIABLE][^1].

So the panel picks a layout tier from `bodyColumns`: a wide tier with a side nav, full labels and two columns; a middle tier with a top menu bar and short labels; a narrow tier with key-plus-glyph labels and one column [INFERENCE]. Each tier is a pure function in core, so the line-width check runs under Vitest at fixed widths (design T-1B.9) [INFERENCE].

Collapsed tasks and the shown count: the shown and collapsed counts are view preferences, read from `beads-ui.toml` at call time and changed from the panel; a change made in the panel is written to `$.store` (shared by every session on the machine) and, when the user asks, back to the file [INFERENCE]. Claude Code also lets a mod describe `/config` rows (`config.describe`, `config.set`) [VERIFIABLE][^1], a second place a setting can be changed without editing the file.

## 4. Living beside the Claude Code task panel

Claude Code's own to-do list is toggled by `app:toggleTodos` (Ctrl+T) [VERIFIABLE][^7], and the design's D-21 retires it per machine profile by dropping `CLAUDE_CODE_ENABLE_TODO_TOOLS` and denying the Task tools [VERIFIABLE][^8]. A mod cannot draw inside Claude Code's panel; it draws in its own pane or band [VERIFIABLE][^2]. "In that same space" therefore means a docked pane on the same side, opened at session start when the profile says so [INFERENCE]. The co-existence flag is a beads-ui setting with three values: the beads-ui panel only, the Claude Code panel only, or both; the cutover is D-21's switch, turned on profile by profile after the beads-ui panel has run beside the old one [INFERENCE]. A pane the mod opens without being asked appears only from 144 terminal columns, 110 after the user has opened it once [VERIFIABLE][^1], so an automatic open at session start must fall back to the band in a narrow terminal, as the mod already does.

## 5. Edits that commit and sync themselves

Every write already goes through `bd` (design D-4), and Beads keeps the data in Dolt; on the fleet, publishing means `bd_dolt_publish.py --repo <repo> --attest --json`, whose exit codes distinguish published (0), unverified (2), refused (3), pull failed (4), conflict aborted (5) and push failed (6) [VERIFIABLE][^9]. The panel therefore runs a configured publish command after each write, through `$.process.run` with an argument list and no shell [VERIFIABLE][^5], and reads its exit code. An outside user configures their own command or none.

On a conflict or any other failure, the mod has three ways to reach the session [VERIFIABLE][^5]:

- `$.prompt.submit({ text })` starts a turn once the session is idle, with a sentence naming the mod as the sender, so Claude reads the conflict and resolves it; a refused or dropped submit is retried from a `turn.complete` hook.
- `$.ui.notify` sends a terminal notification; `$.ui.toast` and `$.ui.status` show it in Claude Code.
- `$.session.send` messages another session, for example the fleet's coordinator.

The root-cause loop Sergei asked for follows from the first: the submitted text tells the session to resolve the conflict and to file a bug against beads-ui's sync automation with the exact failure, which a delegate or the session then fixes [INFERENCE].

Formatted commits: a Beads write is a Dolt commit inside bd, not a git commit; the git side is the store's tracked mirror, if the repository tracks one. The panel names the edit in the publish call where the command accepts a message, and leaves git formatting to the repository's own export path [INFERENCE].

## 6. Speed and resource limits

The limits that shape the panel [VERIFIABLE][^1]:

| Limit | Value |
|---|---|
| A hook's own execution time | 10 seconds |
| `$.process.run` default timeout | 30 seconds |
| `$.fs.read`, `$.fs.write` | 4 MiB per file |
| `$.store` | 4 MiB of JSON in total |
| Text drawn from one tree | the first 100,000 characters |
| `$.ui.invalidate('ui.render')` | at most 10 redraws a second, 30 in the terminal for the visible pane |
| A `Client` call | "a second per call at most" [VERIFIABLE][^4] |

Measured on sem-kg-ec2 (2026-10-24T00:27Z, design D-26): the pane's whole-store `bd list` returns 7.2 MB from the ai-harness store, above the 4 MiB file limit, and the board re-reads it every 10 s; open issues alone are 2.1 MB. A panel that paints from a snapshot of drawn fields and redraws only on change stays well inside these limits; a framework adds nothing the `Client` model does not already give, and the hooks module could not load most of them anyway [INFERENCE].

## 7. "An entire browser in a mod"

The ten results of one GitHub repository search for Claude Code mods and browsers (2026-10-24) include no mod that runs a browser inside the terminal; this is not a survey of every mod catalogue. The results include a diagrams mod whose "browser view" launches the system browser with `open` or `xdg-open`, and whose pictures show only in terminals that speak the kitty graphics protocol [VERIFIABLE][^10][^11]. The closest in-terminal route is `Image`: a mod could screenshot a headless browser and draw the PNG. `Image` draws only in kitty 0.28 or later, Ghostty and iTerm2 3.5 or later; inside tmux or screen, in background sessions and in iTerm2 outside fullscreen rendering, the user sees the alt text instead [VERIFIABLE][^3]. The fleet's sessions run in tmux over SSM, so that route would show nothing there; and a headless browser per session costs hundreds of megabytes [HEURISTIC]. What Sergei saw was most likely an `Image` in a local kitty or Ghostty session, or a mod opening the system browser [INFERENCE].

## Gaps, blindspots and emergent findings

- The type declarations file on GitHub was read only to its first 100,000 of 517,399 characters; the `h` element set a `Client` may return and `UiFocusArgs` were not in that span [VERIFIABLE][^4]. The build reads the installed build's own types before relying on either.
- Whether a `$.process.spawn` child outlives its session is undocumented; the docs say Claude Code stops a withheld spawn that is still running, and nothing about session end [VERIFIABLE][^5]. Design D-26 works either way.
- Mouse inside tmux over SSM (design Open Question 2) and `Client` pointer capture are unmeasured; the keyboard path stays complete either way.
- `command:bu` from the prompt toggles the pane; it cannot also move focus into an already open pane, because the prompt holds focus when the command runs [INFERENCE]. Ctrl+X Tab covers that case.

## Comparison

| # | Criterion | Element tree only | Element tree plus a `Client` for the list and board | `Image` of a rendered web page |
|---|---|---|---|---|
| 1 | Draws in tmux over SSM | yes | yes | no, alt text only |
| 2 | Right-click menus and drag | no | yes, `button: 'right'` and pointer capture | no input |
| 3 | Hover feedback | yes, `hover` styles | yes | no |
| 4 | Reflow to `bodyColumns` | yes | yes | re-render per size |
| 5 | Works in VS Code and Desktop | yes | Desktop yes, VS Code falls back | no |
| 6 | Cost | lowest | low; runs on the drawing thread | a headless browser per session |
| 7 | Tests | `claude plugin test` presses buttons | `Client` logic in core under Vitest; the region by a live check | none in the kit |

## Recommendation

Use the element tree for the panel's frame, nav bar, menus, forms and detail view, and a `Client` for the task list and the board, with the element tree as the fallback wherever a `Client` cannot draw or faults. Pick one of three layout tiers from `bodyColumns`, with glyph labels in the narrow tier. Do not draw a browser or images. Make focus a documented keybinding (`command:bu` in `Chat`) plus Claude Code's own Ctrl+X Tab, and draw every hotkey in its menu. Sync edits by running the configured publish command after each write, and send a conflict to the session with `$.prompt.submit`, with `$.ui.notify` as the alert. Put the co-existence setting in `beads-ui.toml` with three values and leave the cutover to D-21's per-profile switch. These are recommendations from the vendor's own documentation, not adoption claims about outside tools; no external package is recommended.

## Open Questions

1. Do clicks and drags reach a `Client` inside tmux over SSM with `set -g mouse on`? (Design Open Question 2; a live check in Phase 2B's exit gate.)
2. Does a `$.process.spawn` child outlive its session? (Design Open Question 11; measured at the start of Phase 1B.)
3. Which elements may a `Client`'s `h` return, and what does `UiFocusArgs` take? Read from the installed build's types before the Phase 2B build.

## Sources

[^1]: Anthropic. (2026). [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-23. (Elements by surface, render-site props, limits, settings.)
[^2]: Anthropic. (2026). [Draw in the interface with a mod](https://code.claude.com/docs/en/plugins/mods/interface.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-23. (Panes, keyboard focus and hotkeys, `Client`, `Raster`, redraw rules.)
[^3]: Anthropic. (2026). [Interface gallery for mods](https://code.claude.com/docs/en/plugins/mods/gallery.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-24. (`Select` rendering; `Image` terminals and the tmux alt-text rule.)
[^4]: Anthropic. (2026). [claude-code.d.ts, mods types](https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts). GitHub. Verified accessible (HTTP 200) 2026-10-24. (First 100,000 characters read: `ClientModule`, `ClientSurface`, pointer and key events, `$.ui.focus`, `$.ui.panes`, `hover`.)
[^5]: Anthropic. (2026). [Use the mods API](https://code.claude.com/docs/en/plugins/mods/api.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-24. (`$.prompt.submit`, `$.ui.notify`, `$.session.send`, `$.process.run` and `spawn`, the hooks module's globals.)
[^6]: beads-ui. (2026). [Spike: harness switch and core libraries](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-spike-harness-switch-and-core-libs.md). GitHub. Verified accessible (repository file) 2026-10-24. (zustand vanilla runs in a mod; xstate cannot load.)
[^7]: Anthropic. (2026). [Customize keyboard shortcuts](https://code.claude.com/docs/en/keybindings.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-24. (`command:<name>`, `abovePrompt:focus`, pane actions, `app:toggleTodos`.)
[^8]: beads-ui. (2026). [beads-ui design, D-21](https://github.com/sergeiwallace/beads-ui/blob/main/docs/designs/beads-ui-design.md#d-21). GitHub. Verified accessible (repository file) 2026-10-24. (The per-profile retirement switch for the task panel.)
[^9]: Sergei Wallace. (2026). [beads-task skill, publish step](https://github.com/sergeiwallace/ai-harness/blob/main/skills/beads-task/SKILL.md). GitHub. Verified accessible (repository file) 2026-10-24. (`bd_dolt_publish.py` exit codes 0 to 6.)
[^10]: GitHub. (2026). [Repository search: "claude code mod browser"](https://api.github.com/search/repositories?q=claude+code+mod+browser&sort=stars&per_page=10). GitHub REST API. Verified accessible (HTTP 200) 2026-10-24. (Ten results; none runs a browser inside the terminal.)
[^11]: tomasvarga. (2026). [claude-code-diagrams README](https://raw.githubusercontent.com/tomasvarga/claude-code-diagrams/main/README.md). GitHub. Verified accessible (HTTP 200) 2026-10-24. ("browser view" uses `open` or `xdg-open`; pictures need the kitty graphics protocol.)

<!-- /doc:region name="body" -->

<!-- doc:region name="ambiguous_items" kind="replaceable" -->

## Ambiguous Items from Auto-Remediation (Post-Run Review)

(none yet; auto-populated by verify_and_remediate node)

<!-- /doc:region name="ambiguous_items" -->

<!-- doc:region name="appendix_research_prompt" kind="immutable" -->

## Appendix: Research Prompt

**Registry ID:** N/A (ad hoc, orchestrator-owned research for the design's Open Question 10)
**Model:** `us.anthropic.claude-opus-5-5[1m]`
**Date:** 2026-10-24

```text
Role: the Opus coordinator for the beads-ui band, pane and task-panel run, acting as the
research author for the design's Open Question 10.

Question: what can a Claude Code mod (2.1.310) draw, how does keyboard focus and the mouse reach
a mod pane, how does a pane reflow to its size, how can a mod's panel live beside the Claude
Code task panel, and how can edits made in the panel commit and sync themselves with a conflict
fallback to the session? Check the claim that a whole browser can run inside a mod pane.

Sources: Claude Code's mods docs (overview, interface, gallery, api, reference), its keybindings
page, the public mods type declarations, the beads-ui design and spikes, the ai-harness
beads-task skill, and a GitHub search for mods that render a browser. Temporal scope: 2026 only.

Scope note: the questions are a floor, not a ceiling; report what the framing misses, including
the tmux constraint the fleet's sessions run under. Tag every claim [VERIFIABLE] with a footnote
to a page read in this session, or [HEURISTIC], [INFERENCE] or [NO SOURCE]; never invent a
citation.
```

<!-- /doc:region name="appendix_research_prompt" -->

<!-- doc:region name="appendix_provenance" kind="replaceable" -->

## Appendix: Provenance Ledger

(none yet; auto-populated at commit from the validated provenance ledger)

<!-- /doc:region name="appendix_provenance" -->

<!-- doc:region name="run_history" kind="append_only" -->

## Run History

- 2026-10-24, run `beads-ui-band-pane-panel-2026-10-24-aih-ec2-3`, written directly by the Opus coordinator (no research child: the host's contention reading held launches to one child, which was running the install fix). Pages read with WebFetch between 2026-10-23T23:48Z and 2026-10-24T00:45Z.

<!-- /doc:region name="run_history" -->
