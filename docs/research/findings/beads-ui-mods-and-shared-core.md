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

(filled in the next commit)

## 1. What the mods API offers a task-manager mod

(filled in the next commit)

## 2. Mouse control inside a mod

(filled in the next commit)

## 3. Open-source mods and Beads prior art

(filled in the next commit)

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
