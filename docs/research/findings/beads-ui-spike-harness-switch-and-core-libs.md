---
title: "beads-ui spike: the ai-harness task-panel switch and timer-free state cores"
category: research
tags: [research, findings, beads-ui]
status: complete
source: "claude-opus-5-5-2026-10-15"
task: BU-mg2.2.2
display_id: BU-spike-beads-ui-ai-bfks
template_version: "research-findings-1.0.0"
---

# beads-ui spike: the ai-harness task-panel switch and timer-free state cores

> Researched: 2026-10-15 | Confidence: high for every code reading, medium for runtime behaviour,
> because nothing was installed, built or run.

This packet answers the three questions of the design spike for the beads-ui design doc. It reads
ai-harness at commit `01d5ee82d4`, the base of the read-only ai-harness worktree, on 2026-10-15
between 01:10 and 01:30 UTC. ai-harness `main` moved to `f0189b93` during the run. The GitHub
compare API lists three changed files between the two, and none is cited here.

The library sources were read at their release tags through the GitHub API, and their published
builds through unpkg. The starting evidence was the landscape doc's sections 5.2 and 6.3 [^42],
leg C's sections 3 and 4 [^43] and leg B's section 5 [^44].

<!-- SUMMARY -->

<!-- Q1 -->

<!-- Q2 -->

<!-- Q3 -->

<!-- GAPS -->

## Sources

[^1]: Wallace, S. (2026). [src/ai_harness/settings_merge.py](https://github.com/sergeiwallace/ai-harness/blob/main/src/ai_harness/settings_merge.py), lines 1-370. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4, unchanged at main f0189b93. Verified accessible (HTTP 200, GitHub API with the owner's credential) 2026-10-15. (The four-layer settings merge.)
[^2]: Wallace, S. (2026). [src/ai_harness/cli.py](https://github.com/sergeiwallace/ai-harness/blob/main/src/ai_harness/cli.py), lines 637-695, 725-863, 1255-1300, 1415-1530. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (The settings step, the mouse precedent, plan and doctor.)
[^3]: Wallace, S. (2026). [install.sh](https://github.com/sergeiwallace/ai-harness/blob/main/install.sh), lines 4053-4271. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Step 4 hand-off and the Step 4b machine fragment merge.)
[^4]: Wallace, S. (2026). [src/ai_harness/defaults/settings.template.json](https://github.com/sergeiwallace/ai-harness/blob/main/src/ai_harness/defaults/settings.template.json), lines 1-42. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Byte-identical to `.claude/settings.template.json`, blob `7b825e1a10`.)
[^5]: Wallace, S. (2026). [.claude/settings.acn-mac.json and the three other machine fragments](https://github.com/sergeiwallace/ai-harness/blob/main/.claude/settings.acn-mac.json). sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Fragments exist for acn-mac, sem-kg-ec2, sem-kg-sagemaker and sem-kg-windows.)
[^6]: Wallace, S. (2026). [projects-wide-session-config/ai-harness.toml](https://github.com/sergeiwallace/ai-harness/blob/main/projects-wide-session-config/ai-harness.toml), lines 1-135 and 1355-1618. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Overlays, the machine registry and its schema.)
[^7]: Wallace, S. (2026). [src/ai_harness/machine_registry.py](https://github.com/sergeiwallace/ai-harness/blob/main/src/ai_harness/machine_registry.py), lines 1-389. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Schema-generic loader, required attributes, digest and export.)
[^8]: Wallace, S. (2026). [src/ai_harness/config.py](https://github.com/sergeiwallace/ai-harness/blob/main/src/ai_harness/config.py), lines 64-96 and 198-264. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (`[[site.machine]]` and its `settings_fragment` key.)
[^9]: Wallace, S. (2026). [docs/procedures/machine-install-contract.md](https://github.com/sergeiwallace/ai-harness/blob/main/docs/procedures/machine-install-contract.md), lines 1-334. sergeiwallace/ai-harness (private), GitHub. Read in full at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Verbs, idempotency oracle, shared data, sync-prompt triggers.)
[^10]: Wallace, S. (2026). [docs/procedures/new-machine-bootstrap.md](https://github.com/sergeiwallace/ai-harness/blob/main/docs/procedures/new-machine-bootstrap.md), lines 260-270. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (What needs a restart after an install.)
[^11]: Anthropic. (2026). [Tools reference](https://code.claude.com/docs/en/tools-reference.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-15. (Section "Task tool availability" and the tool table rows.)
[^12]: Anthropic. (2026). [Environment variables](https://code.claude.com/docs/en/env-vars.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-15. (Rows for `CLAUDE_CODE_ENABLE_TODO_TOOLS` and `CLAUDE_CODE_ENABLE_TASKS`; read to character 100,000 of 171,035.)
[^13]: Anthropic. (2026). [Configure permissions](https://code.claude.com/docs/en/permissions.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-15. (Bare-name deny rules, evaluation order, scopes.)
[^14]: Codex research leaf for Wallace, S. (2026). [Threading the needle: Task tools, native cross-session messaging, and Remote Control under one GrowthBook gate](https://github.com/sergeiwallace/ai-harness/blob/main/docs/research/cross-session-messaging-vs-task-tools-vs-remote-control-growthbook-tension.md), lines 98-380. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Feature-flag gates on the Task tools.)
[^15]: Wallace, S. (2026). [sergeiwallace/ai-harness repository tree](https://github.com/sergeiwallace/ai-harness/tree/main). GitHub (private). Searched with `git grep` over tracked files at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API recursive tree, 6,716 blobs, not truncated) 2026-10-15. (The Task-symbol inventory in section 2.)
[^16]: Wallace, S. (2026). [scripts/chief_of_staff_cli.py](https://github.com/sergeiwallace/ai-harness/blob/main/scripts/chief_of_staff_cli.py), lines 1414-1455. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (The per-session in-progress count.)
[^17]: Wallace, S. (2026). [src/ai_harness/shadow_watcher.py](https://github.com/sergeiwallace/ai-harness/blob/main/src/ai_harness/shadow_watcher.py), lines 1-34 and 238-290. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Direct task-row writer for shadow Codex watchers.)
[^18]: Wallace, S. (2026). [docs/designs/autonomous-work-queue-coordinator-and-pwa-dashboard.md](https://github.com/sergeiwallace/ai-harness/blob/main/docs/designs/autonomous-work-queue-coordinator-and-pwa-dashboard.md), lines 628-642. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (The `wq next` panel reconciliation as designed.)
[^19]: Wallace, S. (2026). [src/ai_harness/context_supervisor.py](https://github.com/sergeiwallace/ai-harness/blob/main/src/ai_harness/context_supervisor.py), lines 236-261 and 9400-9411. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Force-gate tool allow-list and the session-key fallback.)
[^20]: Wallace, S. (2026). [projects-wide-session-config/hooks-manifest.json](https://github.com/sergeiwallace/ai-harness/blob/main/projects-wide-session-config/hooks-manifest.json), lines 970-1005. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (Hook matchers naming Task tools, and the per-hook `machines` field.)
[^21]: Wallace, S. (2026). [projects-wide-session-config/modules/claude-delta.md](https://github.com/sergeiwallace/ai-harness/blob/main/projects-wide-session-config/modules/claude-delta.md), lines 17-19. sergeiwallace/ai-harness (private), GitHub. Read at commit 01d5ee82d4. Verified accessible (HTTP 200, GitHub API tree listing) 2026-10-15. (The panel-mirror and one-row-per-agent rules every machine compiles.)
[^22]: Anthropic. (2026). [Use the mods API](https://code.claude.com/docs/en/plugins/mods/api.md). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-15. (The `$` argument, `$.clock`, and the hooks module's environment.)
[^23]: Anthropic. (2026). [mods/types/claude-code.d.ts](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts), lines 1-40, 1275-1290, 2897-2940, 9960-9974 and 11570-11705. anthropics/claude-code, GitHub. Read in full through the GitHub API (517,451 bytes; header "Written by Claude Code 2.1.277"; last commit to the path `bf2323b302`, 2026-10-13). Verified accessible (HTTP 200) 2026-10-15. (The hooks and surface module globals, `$.clock` and `surface.every`.)
[^24]: npm. (2026). [@tanstack/query-core, latest](https://registry.npmjs.org/@tanstack/query-core/latest). npm registry. Verified accessible (HTTP 200) 2026-10-15. (Version 5.104.2, no runtime dependencies.)
[^25]: TanStack. (2026). [query/packages/query-core/src at @tanstack/query-core@5.104.2](https://github.com/TanStack/query/tree/%40tanstack/query-core%405.104.2/packages/query-core/src). GitHub. All 23 source files read through the GitHub API at commit `b699b52d60` (2026-10-11). Verified accessible (HTTP 200) 2026-10-15. (The `grep` results in section 3.3.)
[^26]: TanStack. (2026). [timeoutManager reference](https://tanstack.com/query/latest/docs/reference/timeoutManager). TanStack Query Docs. Verified accessible (HTTP 200) 2026-10-15.
[^27]: TanStack. (2026). [environmentManager reference](https://tanstack.com/query/latest/docs/reference/environmentManager). TanStack Query Docs. Verified accessible (HTTP 200) 2026-10-15.
[^28]: TanStack. (2026). [notifyManager reference](https://tanstack.com/query/latest/docs/reference/notifyManager). TanStack Query Docs. Verified accessible (HTTP 200) 2026-10-15.
[^29]: TanStack. (2026). [build/modern/timeoutManager.js in @tanstack/query-core@5.104.2](https://unpkg.com/@tanstack/query-core@5.104.2/build/modern/timeoutManager.js). unpkg. Verified accessible (HTTP 200) 2026-10-15. (Published build; read through WebFetch, whose model quoted the lines.)
[^30]: TanStack. (2026). [build/modern/query.js in @tanstack/query-core@5.104.2](https://unpkg.com/@tanstack/query-core@5.104.2/build/modern/query.js). unpkg. Verified accessible (HTTP 200) 2026-10-15. (Published build; read through WebFetch, whose model quoted the lines.)
[^31]: Bundlephobia. (2026). [@tanstack/query-core@5.104.2 size](https://bundlephobia.com/api/size?package=@tanstack/query-core@5.104.2). Bundlephobia API. Verified accessible (HTTP 200) 2026-10-15. (40,039 bytes minified, 11,427 gzipped.)
[^32]: npm. (2026). [zustand, latest](https://registry.npmjs.org/zustand/latest). npm registry. Verified accessible (HTTP 200) 2026-10-15. (Version 5.0.15; every peer dependency optional.)
[^33]: pmndrs. (2026). [esm/vanilla.mjs in zustand@5.0.15](https://unpkg.com/zustand@5.0.15/esm/vanilla.mjs). unpkg. Verified accessible (HTTP 200) 2026-10-15. (The whole 25-line published file, reproduced by the fetch.)
[^34]: pmndrs. (2026). [src/vanilla.ts at v5.0.15](https://github.com/pmndrs/zustand/blob/v5.0.15/src/vanilla.ts). GitHub. Read through the GitHub API at commit `2115efb9e2` (2026-08-13), 100 lines. Verified accessible (HTTP 200) 2026-10-15.
[^35]: pmndrs. (2026). [createStore](https://zustand.docs.pmnd.rs/reference/apis/create-store). Zustand documentation. Verified accessible (HTTP 200) 2026-10-15. (The older `/apis/create-store` path returned 404.)
[^36]: pmndrs. (2026). [esm/middleware.mjs in zustand@5.0.15](https://unpkg.com/zustand@5.0.15/esm/middleware.mjs). unpkg. Verified accessible (HTTP 200) 2026-10-15. (Line numbers approximate, from the fetch model.)
[^37]: npm. (2026). [xstate, latest](https://registry.npmjs.org/xstate/latest). npm registry. Verified accessible (HTTP 200) 2026-10-15. (Version 5.33.2, no dependencies.)
[^38]: Stately. (2026). [xstate/packages/core/src at xstate@5.33.2](https://github.com/statelyai/xstate/tree/xstate%405.33.2/packages/core/src). GitHub. Release tarball read through the GitHub API at commit `fbee62e7c1` (2026-09-15). Verified accessible (HTTP 200) 2026-10-15. (The `grep` results in section 3.4.)
[^39]: Stately. (2026). [dist/xstate.esm.js in xstate@5.33.2](https://unpkg.com/xstate@5.33.2/dist/xstate.esm.js). unpkg. Verified accessible (HTTP 200) 2026-10-15. (Published entry and its chunk imports, quoted by the fetch model.)
[^40]: Stately. (2026). [dist/raise-97446fd4.esm.js in xstate@5.33.2](https://unpkg.com/xstate@5.33.2/dist/raise-97446fd4.esm.js). unpkg. Verified accessible (HTTP 200) 2026-10-15. (The chunk holding `createActor`, quoted by the fetch model.)
[^41]: Bundlephobia. (2026). [xstate@5.33.2 size](https://bundlephobia.com/api/size?package=xstate@5.33.2). Bundlephobia API. Verified accessible (HTTP 200) 2026-10-15. (46,874 bytes minified, 14,559 gzipped.)
[^42]: Wallace, S. (2026). [beads-ui: task-manager surfaces, the Claude Code mods ecosystem and one shared core](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/beads-ui-task-manager-landscape.md). sergeiwallace/beads-ui, GitHub. Read at main `f68067e`. Verified accessible (HTTP 200, GitHub API) 2026-10-15. (Sections 5.2 and 6.3.)
[^43]: Wallace, S. (2026). [beads-ui research leg C: Beads, the work queue and the task panel](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-beads-queue-and-panel.md). sergeiwallace/beads-ui, GitHub. Read at main `f68067e`. Verified accessible (HTTP 200, GitHub API) 2026-10-15. (Sections 3 and 4.)
[^44]: Wallace, S. (2026). [beads-ui research leg B: Claude Code mods, MCP Apps and the shared core](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-mods-and-shared-core.md). sergeiwallace/beads-ui, GitHub. Read at main `f68067e`. Verified accessible (HTTP 200, GitHub API) 2026-10-15. (Sections 1.2 and 5.)

<!-- LEDGER -->
