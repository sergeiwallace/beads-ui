---
title: "beads-ui design spike: bd serve request schemas, MCP app-only tool visibility and Task-tool deny rules"
category: research
tags: [research, findings, beads-ui]
status: complete
source: "claude-opus-5-5-2026-10-15"
task: BU-mg2.2.1
display_id: BU-spike-beads-ui-bd-dvdg
template_version: "research-findings-1.0.0"
---

# beads-ui design spike: bd serve request schemas, MCP app-only tool visibility and Task-tool deny rules

Founding ask: `canonical_root_json` blob `f5025e8233d0e9cf98d5247ca1b32fae6055072c`, content
sha256 `2c141587e57f0b478ffe5af64d48d3162949575f0353f15075909b1194423eb3` (re-hashed 2026-10-15
01:06Z, match), `founding_ask_ref_sha256`
`d7668b63750bbee3253a47d99a0b4106aede21e1952bdce105a15f6a01dde937`, entries A001 to A004.

This packet answers Open Questions 3, 4 and 5 of
`docs/research/beads-ui-task-manager-landscape.md` and the request-schema questions that doc left
for the design stage. It is input to the coordinator's design doc and decides nothing.

## Summary

(scaffold; filled in the next commit)

## Sources

[^1]: steveyegge and contributors. (2026). [openapi.v0.yaml at tag v1.3.0](https://raw.githubusercontent.com/steveyegge/beads/v1.3.0/internal/httpapi/spec/openapi.v0.yaml). steveyegge/beads (now served as gastownhall/beads), GitHub. Verified accessible (HTTP 200) 2026-10-15. (The `bd serve` wire contract shipped in bd 1.3.0. Read in full from a byte copy fetched through the GitHub REST API, 497,361 bytes, sha256 `9a33a349…`; the v1.3.1 tag holds a byte-identical file. Quotes in this packet were substring-checked against that copy.)

[^2]: steveyegge and contributors. (2026). [openapi.v0.yaml on main](https://raw.githubusercontent.com/steveyegge/beads/main/internal/httpapi/spec/openapi.v0.yaml). steveyegge/beads, GitHub. Verified accessible (HTTP 200) 2026-10-15. (587,112 bytes on 2026-10-15, three operations and four schema members ahead of v1.3.0; the copy the landscape research read the first 100,000 characters of.)

[^3]: steveyegge and contributors. (2026). [Release v1.3.0](https://github.com/steveyegge/beads/releases/tag/v1.3.0). GitHub. Verified accessible (HTTP 200) 2026-10-15; released 2026-09-15. (bd serve's 41 operations, the events journal, the `--set-metadata` typing fix.)

[^4]: steveyegge and contributors. (2026). [Release v1.3.1](https://github.com/steveyegge/beads/releases/tag/v1.3.1). GitHub. Verified accessible (HTTP 200) 2026-10-15; released 2026-09-30. (Proxied-server fixes; no OpenAPI change.)

[^5]: steveyegge and contributors. (2026). [Issue Metadata](https://github.com/steveyegge/beads/blob/v1.3.0/docs/core-concepts/metadata.md). beads documentation at tag v1.3.0, GitHub. Verified accessible (HTTP 200) 2026-10-15. (Metadata as the extension point, reserved key prefixes, the tracker round-trip example.)

[^6]: steveyegge and contributors. (2026). [internal/storage/metadata.go at v1.3.0](https://github.com/steveyegge/beads/blob/v1.3.0/internal/storage/metadata.go). GitHub. Verified accessible (HTTP 200) 2026-10-15. (Key syntax, top-level merge, `--set-metadata` value typing, metadata schema field types.)

[^7]: steveyegge and contributors. (2026). [cmd/bd/update.go at v1.3.0](https://github.com/steveyegge/beads/blob/v1.3.0/cmd/bd/update.go). GitHub. Verified accessible (HTTP 200) 2026-10-15. (`--metadata` passed as a merge operation; the `--metadata` and `--set-metadata` exclusion.)

[^8]: steveyegge and contributors. (2026). [internal/config/config.go at v1.3.0](https://github.com/steveyegge/beads/blob/v1.3.0/internal/config/config.go). GitHub. Verified accessible (HTTP 200) 2026-10-15. (The `validation.metadata.mode` default and the `validation.metadata.fields` key.)

[^9]: Salomon, I., Yosef, L., Chafik, O., Swannack, J., Hefner, J., Pidkuiko, A., Cooper, N., Ashley, B., & Christakis, A. (2026). [SEP-1865: MCP Apps: Interactive User Interfaces for MCP](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx). Model Context Protocol, ext-apps repository, status Stable (2026-01-26). Verified accessible (HTTP 200) 2026-10-15. (Read in full, 1,768 lines, from a REST API copy.)

[^10]: Model Context Protocol. (2026). [ext-apps README](https://github.com/modelcontextprotocol/ext-apps/blob/main/README.md). GitHub. Verified accessible (HTTP 200) 2026-10-15. (Supported clients, the SDK packages, the basic-host note.)

[^11]: Model Context Protocol. (2026). [examples/basic-host/src/index.tsx](https://github.com/modelcontextprotocol/ext-apps/blob/main/examples/basic-host/src/index.tsx). ext-apps repository, GitHub. Verified accessible (HTTP 200) 2026-10-15. (`isToolVisibleToModel` and its three filters.)

[^12]: Model Context Protocol. (2026). [src/server/index.ts](https://github.com/modelcontextprotocol/ext-apps/blob/main/src/server/index.ts). ext-apps repository, GitHub. Verified accessible (HTTP 200) 2026-10-15. (`EXTENSION_ID`, `getUiCapability` and its text-only fallback example, the app-only `registerAppTool` example.)

[^13]: Anthropic. (2026). [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15. (Read in two WebFetch chunks covering all 122,798 characters. MCP Apps UI resources, `_meta["anthropic/…"]` annotations, client capabilities on protocol 2026-07-28.)

[^14]: Anthropic. (2026). [Changelog](https://code.claude.com/docs/en/changelog.md). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15; newest heading 2.1.300 (2026-10-14). (The 2.1.281 entry on MCP Apps UI resources, read at offset 180,000.)

[^15]: Anthropic. (2026). [CHANGELOG.md](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md). anthropics/claude-code, GitHub. Verified accessible (HTTP 200) 2026-10-15. (The same changelog as one 9,073-line file, fetched through the REST blob API and searched in full.)

[^16]: Anthropic. (2026). [Tools reference](https://code.claude.com/docs/en/tools-reference.md). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15. (Task tool availability, the background and cloud session sentence, subagent inheritance.)

[^17]: Anthropic. (2026). [Configure permissions](https://code.claude.com/docs/en/permissions.md). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15. (Bare-name and glob deny rules, precedence, mods and deny rules.)

[^18]: Anthropic. (2026). [Environment variables](https://code.claude.com/docs/en/env-vars.md). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15. (The `CLAUDE_CODE_ENABLE_TASKS` and `CLAUDE_CODE_ENABLE_TODO_TOOLS` rows; the first 100,000 of 171,035 characters were read.)

[^19]: Anthropic. (2026). [Settings files and precedence](https://code.claude.com/docs/en/settings.md). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15. (Settings in cloud sessions.)

[^20]: Anthropic. (2026). [Agent view and background sessions](https://code.claude.com/docs/en/agent-view.md). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15. (Where a background session reads its settings; the first 100,000 of 137,050 characters were read.)

[^21]: Anthropic. (2026). [Use Claude Code in the cloud](https://code.claude.com/docs/en/claude-code-on-the-web.md). Claude Code Documentation. Verified accessible (HTTP 200) 2026-10-15. (Cloud session configuration and the pointer to settings in cloud sessions.)

[^22]: Anthropic. (2026). [Track todos](https://code.claude.com/docs/en/agent-sdk/todo-tracking.md). Claude Code Agent SDK Documentation. Verified accessible (HTTP 200) 2026-10-15. (Model availability and the SDK opt-in routes.)

[^23]: Claude Opus 5.5 researcher leaf for aih-3 (beads-ui). (2026). [bd 1.3.0 help output: delete and update](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/evidence/bd-1.3.0-delete-and-update-help.md). sergeiwallace/beads-ui, tracked on main. Read from the worktree 2026-10-15. (`bd update --help`, `bd serve --help`, `bd batch --help`, captured 2026-10-15 00:16Z to 00:40Z.)

[^24]: Claude Opus 5.5 researcher leaf for aih-3 (beads-ui). (2026). [Measurements behind the leg C findings packet](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/evidence/beads-ui-beads-queue-and-panel-measurements.md). sergeiwallace/beads-ui, tracked on main. Read from the worktree 2026-10-15. (M-2 store config, M-9 the fleet's Task tool opt-in.)

[^25]: Claude Opus 5.5 researcher leaf for aih-3 (beads-ui). (2026). [Measurements behind the bd serve and tool-visibility spike](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/evidence/bd-1.3.0-create-events-help-and-spec-versions.md). sergeiwallace/beads-ui, added in this packet's pull request. (E-1 to E-6: versions, spec diff across refs, `bd create --help`, `bd events --help`, `bd events tail --help`, Claude Code binary strings.)
