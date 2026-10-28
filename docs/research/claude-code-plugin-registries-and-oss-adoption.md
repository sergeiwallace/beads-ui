---
title: "Where to list a Claude Code mod and other AI plugins, how to publish to each, and how open-source agentic tools get adopted"
category: research
tags: [research, claude-code, plugins, mods, marketplaces, registries, mcp-registry, codex, gemini-cli, antigravity, cursor, copilot, open-source, adoption, launch]
status: complete
source: "claude-orchestrated-2026-10-23"
template_version: "research-1.2.0"
task: BU-ylx.5.1
related_docs:
  - docs/research/beads-mcp-and-cli-dual-surface.md
  - docs/designs/beads-ui-design.md
  - docs/procedures/mod-install.md
stub: false
---

# Where to list a Claude Code mod and other AI plugins, how to publish to each, and how open-source agentic tools get adopted

## Founding Ask Coverage

`canonical_root_json`: {"blob_oid":"66af21d3eb6840c3551bc547aa15c19b12d383ce","capture_commit":"8862c2570993a60c7492599cb4f762fc7b70dece","content_sha256":"061c246d34d310dddf697cd3502a8e5943d9c9f4566e5e3be6e7baf7acb4bfbe","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-epic-agentic-ai-native-beads-ylx.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-epic-agentic-ai-native-beads-ylx"}

`founding_ask_ref_sha256`: d669898b4dc8a8a75f8791637da4f88d1f517b29ef5f9025c186d997debe04a7

The raw record lives in ai-harness at `docs/asks/BU-epic-agentic-ai-native-beads-ylx.md`, capture commit `8862c25`. This index is non-authoritative; the raw record governs.

| Authoritative raw entry | Coverage and disposition |
|---|---|
| A001, paragraph 4 (registries, publishing and publicity; the research question this doc owns) | "use this as a starting point / seed": section 6 checks each seed claim and every URL it named. "remember to do citation validation and claim provenance and adversarial critical review": the Citation Validation Record, the Provenance Ledger and section 7. "go beyond just what the google ai mode output found ... breadth and depth": sections 1 to 3 add the directory portal, the community marketplace, the community indexes, every other AI client and the MCP directories. "how to publish / register to these surfaces and best practies": sections 1 to 4. "how to publicize open source packages / plugins / tooling ... for community adoption ... in general and agentic ai apps / tooling / plugins etc in particular": section 5. "i can share it my twitter and linkedin and substack and relevant sub-reddits and relevant discord servers and whatever other surfaces": section 5.1 covers each named channel and others; which to use and when are decisions D-1 and D-2, left to Sergei. "when this is in a suitable enough and baseline usable / useful state": section 4.1 and D-2 name what "usable" needs before a public launch. |
| A001, "the google prompt" and "google ai mode output" quoted under paragraph 4 | Section 6, claim by claim. |
| A001, paragraphs 1 to 3 (the `/show-beads-ui` rename, the dual-surface question, the fork and packaging) and the closing `/start-goal` line | Out of scope: other tasks own them. Paragraph 3's "publicly post it / register it on whatever public claude / ai plugin registries and claude code mod registries" is answered here, because it is the same question. |

**Status:** complete

**Created:** 2026-10-23

**Task:** BU-ylx.5.1 (display id BU-research-claude-code-rurb), under epic BU-ylx.5.

## Table of Contents

- [Founding Ask Coverage](#founding-ask-coverage)
- [Context](#context)
- [Temporal Scope](#temporal-scope)
- [Executive Summary](#executive-summary)
- [1. Claude Code's own channels](#1-claude-codes-own-channels)
  - [1.1 Three Anthropic marketplaces and one directory](#11-three-anthropic-marketplaces-and-one-directory)
  - [1.2 Submitting to Anthropic's directory](#12-submitting-to-anthropics-directory)
  - [1.3 Your own marketplace](#13-your-own-marketplace)
  - [1.4 What a mod is, for listing purposes](#14-what-a-mod-is-for-listing-purposes)
- [2. Community directories and indexes for Claude Code](#2-community-directories-and-indexes-for-claude-code)
- [3. Other AI clients, MCP directories and cross-client formats](#3-other-ai-clients-mcp-directories-and-cross-client-formats)
  - [3.1 AI coding clients](#31-ai-coding-clients)
  - [3.2 MCP server directories](#32-mcp-server-directories)
  - [3.3 Cross-client formats and tools](#33-cross-client-formats-and-tools)
- [4. Publishing path for beads-ui](#4-publishing-path-for-beads-ui)
  - [4.1 Before any listing](#41-before-any-listing)
  - [4.2 Listing, in order of effort](#42-listing-in-order-of-effort)
  - [4.3 Risks in that path](#43-risks-in-that-path)
- [5. Adoption playbook for open-source agentic tooling](#5-adoption-playbook-for-open-source-agentic-tooling)
  - [5.1 Channels](#51-channels)
  - [5.2 Precedents with numbers](#52-precedents-with-numbers)
  - [5.3 Practices the evidence supports](#53-practices-the-evidence-supports)
  - [5.4 Contrarian evidence](#54-contrarian-evidence)
- [6. The Google seed, claim by claim](#6-the-google-seed-claim-by-claim)
- [7. Adversarial critical review](#7-adversarial-critical-review)
  - [7.1 The case against listing and launching now](#71-the-case-against-listing-and-launching-now)
  - [7.2 The audience is narrower than "Claude Code users"](#72-the-audience-is-narrower-than-claude-code-users)
  - [7.3 It is not alone](#73-it-is-not-alone)
  - [7.4 Every number in this doc is someone's own counter](#74-every-number-in-this-doc-is-someones-own-counter)
  - [7.5 Where the sources disagree](#75-where-the-sources-disagree)
  - [7.6 Five-perspective critic pass](#76-five-perspective-critic-pass)
- [Gaps, blindspots and emergent findings](#gaps-blindspots-and-emergent-findings)
- [Comparison](#comparison)
- [Recommendation](#recommendation)
- [Open Decisions for Sergei](#open-decisions-for-sergei)
  - [D-1: Which channels to share on, and in what order](#d-1-which-channels-to-share-on-and-in-what-order)
  - [D-2: When to launch](#d-2-when-to-launch)
  - [D-3: Whether and when to submit to Anthropic's directory](#d-3-whether-and-when-to-submit-to-anthropics-directory)
  - [D-4: Keep the name beads-ui for listings and posts](#d-4-keep-the-name-beads-ui-for-listings-and-posts)
- [Open Questions](#open-questions)
- [Sources](#sources)
- [Ambiguous Items from Auto-Remediation (Post-Run Review)](#ambiguous-items-from-auto-remediation-post-run-review)
- [Appendix: Research Prompt](#appendix-research-prompt)
- [Appendix: Measurements](#appendix-measurements)
- [Appendix: Provenance Ledger](#appendix-provenance-ledger)
- [Appendix: Citation Validation Record](#appendix-citation-validation-record)
- [Run History](#run-history)
  - [2026-10-23, run 1 (orchestrated /research-doc, BU-ylx.5.1)](#2026-10-23-run-1-orchestrated-research-doc-bu-ylx51)

<!-- doc:region name="context" kind="immutable" -->

## Context

Sergei pasted a Google AI Mode answer about Claude Code mod registries and asked for it to be used as a seed, verified, and gone beyond. He asked for every public registry, marketplace and listing site for Claude Code mods and plugins, how to publish to each and the best practices, and how to publicise open-source tooling, agentic AI tooling in particular, so that he can share beads-ui on Twitter, LinkedIn, Substack, subreddits and Discord servers once it is usable. He asked for citation validation, claim provenance and an adversarial critical review.

The product this research serves is beads-ui, a Beads task board that ships today as one Claude Code mod from its own repository marketplace, with an MCP UI app and a web app planned. The prior research this doc refines, read rather than re-derived:

- ai-harness `docs/research/cc-plugin-harness-landscape-survey.md`, sections 4.7 and 4.8 (2026-09-03 and 2026-09-07): skills.sh mechanics, Agent Plugins 1.0, awesome-copilot, Cursor Marketplace, APM, SkillMD and ClawHub as publish channels for a skills catalog.
- ai-harness `docs/research/cc-ecosystem-adoption-survey-2026-08.md`, section 2.4: the official and community marketplaces as of August 2026.
- ai-harness `docs/research/ai-native-knowledge-substrate-oss-adoption.md`, section 5: an earlier OSS-portfolio lens.
- beads-ui `docs/research/beads-mcp-and-cli-dual-surface.md` (2026-10-23): each client's plugin format, and the fact that upstream Beads already ships a Claude, Codex and Copilot plugin.

**Primary period:** 2026, current through 2026-10-23
**Source weighting:** 2026 primary, 2025 secondary, earlier work as background. Vendor documentation and the listing sites' own pages above all; launch write-ups and peer-reviewed work on GitHub stars as adoption evidence.

<!-- /doc:region name="context" -->

<!-- doc:region name="body" kind="replaceable" -->

## Temporal Scope

Every web page cited here was fetched on 2026-10-23 between 19:04Z and 20:12Z by this run, and every repository count was read from the GitHub REST API in the same window. The verifier re-fetched the first 168 footnotes between about 19:55Z and 20:13Z. The Claude Code facts come from code.claude.com and claude.com pages as served that day; both sites change often, and the mods feature only went live in October 2026, so anything here about mods is weeks old at most [VERIFIABLE][^1]. Older sources appear only as background: the open-source guide on finding users carries no date, and Superpowers' launch post is from 2025-10-09.

Two subtopics had thin post-2024 evidence. Subreddit rules could not be read at all, because reddit.com does not answer this host's fetcher. Independent measurements of whether a listing produces users, rather than a listing's own counters, were not found for any directory in this doc.

## Executive Summary

A Claude Code mod is a plugin, so it is published the way every plugin is: a `.claude-plugin/marketplace.json` in a git repository is already a published marketplace, with no form and no review [VERIFIABLE][^2]. beads-ui has that today. Anthropic's directory on claude.ai is the one official channel open to anyone on a paid plan; it lists a mod for Claude Code only, scans every version, has a person review the first listing, and is the only source of usage numbers for a public plugin [VERIFIABLE][^3][^4][^5][^6]. Community indexes rank by GitHub stars, installs or their own scans, and most of them find a public mod without being asked. One of them, the mods catalogue at mods.aidojo.si, already lists a dozen Beads mods from other authors [VERIFIABLE][^7].

The MCP registries and the directories for Codex, Gemini CLI, Antigravity, Cursor and Copilot fit the planned MCP app and a possible skills layer, not today's mod. Their public directories exclude hooks or carry them only as client-specific extras [VERIFIABLE][^8][^9], and a mod's hooks module runs only inside Claude Code [INFERENCE: it calls Claude Code's own mods API].

The Google answer was right in outline and wrong in several specifics. Of its 23 checked claims, 16 are confirmed, 6 corrected and 1 unverified (section 6). Its largest error is placing Anthropic's directory "inside the claude.ai admin console": submissions go through a developer portal at claude.ai/directory/manage, the official marketplace takes no portal submissions, and the earlier Console form is retired [VERIFIABLE][^2][^4].

On adoption, the evidence does not show a listing or a launch post creating traction on its own. The largest Claude Code list tells authors to get users before submitting [VERIFIABLE][^10], and fake GitHub stars buy under two months of attention [VERIFIABLE][^11]. The best-documented Claude Code success, Superpowers, shipped the morning Anthropic released plugins [VERIFIABLE][^12], grew slowly to roughly 11K to 14K stars by the start of 2026, and then climbed steeply to about 290K by October, after the official marketplace that lists it was created on 2025-11-20 [VERIFIABLE][^13][^121]. That one dated placement event is the strongest growth signal in the evidence, and its effect is not measured [INFERENCE]. Show HN posts for Claude Code plugins have a median of 2 points, Hacker News has temporarily restricted Show HN after a flood of posts from new accounts and bans AI-edited posts, and claude-mem passed 100K stars with only two 2-point HN posts [VERIFIABLE][^14][^15][^16][^17][^106]. The playbook in section 5 starts with the Beads community, which is the exact audience, and ends with the wide channels once there are users and a recording. Its first problem is positioning: another Beads web UI already ships as `beads-ui` on npm and in the Beads list (D-4).

The publishing path in section 4 has one blocking gap for the directory: the plugin folder has no README of at least 40 words [VERIFIABLE][^18]. The decisions that are Sergei's (which channels, when to launch, whether to submit to Anthropic's directory, and whether to rename before listing) are written as open decisions D-1 to D-4 with options and a recommendation.

## 1. Claude Code's own channels

### 1.1 Three Anthropic marketplaces and one directory

Anthropic publishes three general-purpose marketplaces, each a GitHub repository with its own `marketplace.json`: `claude-plugins-official`, which Claude Code adds on first start; `claude-community`, from `anthropics/claude-plugins-community`, which "Third-party plugins that their authors submitted to Anthropic" fill and which users add by hand; and the demo marketplace in `anthropics/claude-code` [VERIFIABLE][^19]. Topic marketplaces such as `anthropics/skills` sit beside them [VERIFIABLE][^19].

The directory is a separate thing. It is "the catalog on claude.ai", and a plugin added from it reaches Claude Code through account sync as `<name>@synced` [VERIFIABLE][^2][^19]. Claude Code users can also browse it with `/plugin directory` from v2.1.287 [VERIFIABLE][^5]. The public web catalog at claude.com/marketplace/plugins showed 342 plugins on 2026-10-23, some marked "Anthropic verified", with a "Submit a plugin" button that leads to the directory's submission docs [VERIFIABLE][^20]. Claude Code's docs say that page shows install counts; the fetched copy showed none, and this run did not settle which is current [VERIFIABLE][^19][^20].

The community repository is "a read-only mirror" synced nightly from Anthropic's internal review pipeline; pull requests to it "are closed automatically", and its route in is clau.de/plugin-directory-submission [VERIFIABLE][^21]. That link answers with a 302 to claude.com/docs/directory/publish, the directory's own submission page, so the community marketplace and the directory share one way in [VERIFIABLE][^22]. It had 4,754 stars on 2026-10-23 [VERIFIABLE][^23]. Whether every accepted directory plugin also appears in the `claude-community` marketplace is not stated on any page fetched [NO SOURCE].

### 1.2 Submitting to Anthropic's directory

Pro and Max users submit from their own account, and on Team and Enterprise an Owner, or a member an Enterprise Owner grants the Directory permission, submits; "Free accounts can't submit", and "there's no partner program to apply to first" [VERIFIABLE][^4]. The official marketplace "doesn't take submissions through the directory portal"; a partner contact is the only route named into it [VERIFIABLE][^2].

The portal flow, as documented [VERIFIABLE][^3]:

1. Connect GitHub on claude.ai; the portal checks that the account can push to the repository.
2. In claude.ai/directory/manage choose **Submit new**, then **Plugin bundle**.
3. Enter the repository, the plugin path when the plugin is not at the root, and the tracked branch or tag.
4. Run **Validate**, fix blocking findings, push and validate again; a result applies to one commit.
5. Check the listing details, which come from `plugin.json` and the README.
6. Answer the data-handling questions and the four compliance acknowledgements.
7. Choose the GitHub push webhook or a scheduled check, and submit for review.

Each version then gets automated validation and a security scan, and "a person reviews a new listing before it goes live"; review time "isn't fixed" [VERIFIABLE][^4]. By default a reviewer publishes each passing version; a reviewer can switch a plugin to auto-publish later versions [VERIFIABLE][^3]. After listing, merging to the tracked branch is the release process, and an organisation may make 10 submissions in 24 hours [VERIFIABLE][^3][^4]. The portal's Usage tab covers up to 90 days, exports CSV, and shows installs by surface and source, active accounts and retention, use of each hook and skill, load errors by Claude Code version, and a directory funnel from listing views to installs [VERIFIABLE][^24].

The checklist's rules that matter for a mod [VERIFIABLE][^18]:

- A README of at least 40 words in the plugin folder, words in code blocks not counting, blocks submission when missing; so does a missing licence, which `license` in `plugin.json` satisfies.
- Every file must sit inside the plugin folder; symbolic links, submodules and LFS pointers block wherever the plugin loads them.
- A file over 256 KiB, more than 512 files, or a binary other than images and fonts holds the version for a reviewer.
- `package.json` beside a lockfile in the plugin folder's root is always held, because Claude Code installs that lockfile on the user's machine.
- `hooks/hooks.json` may carry "a `modules` array for a mod"; the security scan holds code it cannot read, so commit readable source rather than minified code.
- A name that "may be confused with an existing listing" or a well-known brand is held, and a fork that keeps the upstream name is held.

The mods catalogue's front end showed an "In Anthropic directory" filter with 58 mods on 2026-10-23, against 6,092 it found on GitHub, so few mod authors have taken this route yet [VERIFIABLE][^25]. The directory "lists a mod ... for Claude Code", and chat ignores hooks, so a mod-only plugin reaches Claude Code users and nobody on claude.ai chat [VERIFIABLE][^5]. Desktop extensions (`.mcpb`) are no longer accepted as listings; a local MCP server must ride inside a plugin bundle [VERIFIABLE][^4].

### 1.3 Your own marketplace

"Once the file is in the repository, the plugin is published, with no submission form" [VERIFIABLE][^2]. Users run `claude plugin marketplace add owner/repo` and `claude plugin install name@marketplace`, or one command, `claude plugin install name --marketplace owner/repo`, from v2.1.292 [VERIFIABLE][^2]. Auto-update is off for a third-party marketplace, and a plugin that sets `version` reaches existing installs only when that version rises [VERIFIABLE][^2]. A marketplace may host its plugins from a relative path, GitHub, any git URL, a git subdirectory, npm, a zip archive or a command [VERIFIABLE][^26], so the seed's "powered by GitHub repositories" describes the common case, not a rule.

An own marketplace gives its author no usage numbers. "Claude Code doesn't report a plugin's usage back to its author"; usage stays on each user's machine, and a plugin in a non-official marketplace has its name redacted to `third-party` even in an organisation's own telemetry [VERIFIABLE][^6]. A directory listing is the only route to install and run counts for a public plugin [VERIFIABLE][^4][^6]. The CLI install hint, `<claude-code-hint />` on stderr, works only for plugins in a marketplace with an official name, and `claude-community` is not one [VERIFIABLE][^27].

Anthropic reserves official-looking names, any name with a non-ASCII character, `npm`, `pip`, `uv`, `cargo`, `github` and `gh`, and names starting `claudeai-` [VERIFIABLE][^26]. `beads-ui` is not on that list. Anthropic says plainly that it "doesn't review third-party marketplaces" [VERIFIABLE][^19].

### 1.4 What a mod is, for listing purposes

A mod is "a plugin that changes how Claude Code looks and behaves", written as JavaScript or TypeScript handlers that run inside Claude Code; it installs as a plugin from a marketplace, and `claude plugin validate` lists its hooks and calls before install [VERIFIABLE][^28]. Mods run in the terminal from v2.1.287, the Desktop app's Code tab from v2.1.286, and the VS Code extension's panel from extension 2.1.299 (2.1.304 where feature flags are not fetched, as on Bedrock), and draw nothing in `claude -p` or cloud sessions [VERIFIABLE][^28]. Anthropic's sample mods live in `anthropics/claude-code-playground` and its built-in mods' source in `anthropics/claude-code/mods`; neither is a submission channel [VERIFIABLE][^28]. The feature began as issue #91870 on 2026-09-03, which went live in October and which many authors use to show their mods [VERIFIABLE][^1].

## 2. Community directories and indexes for Claude Code

Each site below was fetched on 2026-10-23. "Reach" is the site's own number, which none of them audits [INFERENCE: every count is self-reported or self-computed, and no fetched page names an outside check].

| Site | What it lists | How a listing happens | Review | Reach on the day |
|---|---|---|---|---|
| ClaudeMod, claudemod.com | Mods, skills, MCP servers, hooks, plugins, agents, harnesses [VERIFIABLE][^29] | A "Submit a Mod" button; the process is not described [VERIFIABLE][^29] | Not stated [NO SOURCE] | "172 mods and growing"; footer "Community-maintained", "Not affiliated with Anthropic" [VERIFIABLE][^29] |
| Claude Marketplaces, claudemarketplaces.com | Skills, MCP servers, plugin marketplaces [VERIFIABLE][^30] | "Crawlers discover listings and refresh install counts and GitHub stars on a schedule"; no submission form [VERIFIABLE][^30] | Editor sweeps that "delist spam and off-topic entries" [VERIFIABLE][^30] | 23,683 skills, 12,869 MCP servers, 2,734 marketplaces; a Monday newsletter, "This week in Claude" [VERIFIABLE][^30] |
| Build with Claude, buildwithclaude.com | Plugins, skills, subagents, commands, hooks [VERIFIABLE][^31] | A contribute page backed by the MIT repo `davepoon/buildwithclaude`, itself a marketplace (`/plugin marketplace add davepoon/buildwithclaude`) [VERIFIABLE][^31] | Not stated [NO SOURCE] | Headline "30,000+ plugins"; browse view 156 plugins [VERIFIABLE][^31] |
| AI Templates, aitmpl.com | Skills, agents, commands, settings, hooks, MCPs, mods, plugin collections [VERIFIABLE][^32] | Repo `davila7/claude-code-templates`; process not shown [VERIFIABLE][^32] | Not stated [NO SOURCE] | 34 collections; 30.8k next to the GitHub link [VERIFIABLE][^32] |
| awesome-claude-code-mods (karanb192), catalogue at mods.aidojo.si | Claude Code mods only, with each mod's validated access footprint [VERIFIABLE][^7] | A daily GitHub code scan for `hooks/hooks.json` with `modules`, a three-hourly scan of repos with the `claude-code-mod` topic, or a seed PR to `data/seeds.txt` [VERIFIABLE][^7] | Seeds must clone and pass `claude plugin validate`; Featured picks are the maintainer's [VERIFIABLE][^7] | 6,092 mods, 727 stars, "Last scanned 2026-10-22" [VERIFIABLE][^7][^23] |
| awesome-claude-code-mods (whyashthakker) | 70 bundled mods plus 14 community entries, itself a marketplace [VERIFIABLE][^33] | CONTRIBUTING.md, not read in detail [NO SOURCE] | Not stated | 92 stars [VERIFIABLE][^33] |
| awesome-claude-code (hesreallyhim) | Curated Claude Code resources [VERIFIABLE][^10] | Web issue form only; "Do not open a PR"; the `gh` CLI cannot submit; the recommendation must be made by a human [VERIFIABLE][^10] | A resource must be 14 days old with continued commits, or have 100 stars; one recommendation at a time [VERIFIABLE][^10] | 56,335 stars [VERIFIABLE][^23] |
| skills.sh (Vercel) | Agent skills for many agents [VERIFIABLE][^34] | Ranked by installs; the page names no submission route [VERIFIABLE][^34] | Not stated on the page | Top skill 4.0M installs [VERIFIABLE][^34] |
| Beads community tools list, in `gastownhall/beads` | Community UIs and integrations for Beads, "ranked by maturity" [VERIFIABLE][^35] | "Open a PR to add it to this list or comment on discussion #276" [VERIFIABLE][^35] | Maintainers' PR review [INFERENCE: a PR to the upstream repository] | The upstream repo has 28,149 stars [VERIFIABLE][^23] |
| awesome-claude-plugins (quemsah) | An automated index of Claude Code plugin repositories [VERIFIABLE][^36] | Automatic: its crawler searches for `marketplace.json` under `.claude-plugin` [VERIFIABLE][^36] | None | "50927 total repositories indexed"; the README shows the top 100 by stars [VERIFIABLE][^36] |
| claude-plugins.dev | Claude Code plugins with skills [VERIFIABLE][^37] | Not stated [VERIFIABLE][^37] | Not stated | Unlabelled per-entry numbers [VERIFIABLE][^37] |
| SkillMD, skillmd.ai | Cross-agent skills; GitHub skills "not reviewed by SkillMD.ai" [VERIFIABLE][^38] | A submit page (HTTP 502 on the day) or a claimed creator page [VERIFIABLE][^38] | None for crawled skills | "111,000+ skills", up from 25,848 on 2026-09-06 in the prior survey [VERIFIABLE][^38] |
| ClawHub | Skills and plugins for OpenClaw agents [VERIFIABLE][^39] | `clawhub skill publish` or `clawhub package publish`; "All skills published on ClawHub are licensed under `MIT-0`" [VERIFIABLE][^40] | Not stated | Repository 9,527 stars [VERIFIABLE][^39] |
| Skillselion | Skills, MCP servers and marketplaces, "a catalog, not a package registry" [VERIFIABLE][^41] | Crawled from public repositories [VERIFIABLE][^41] | None | Self-reported 59,000+ skills; the site returned HTTP 403 [VERIFIABLE][^41] |
| VoltAgent lists (awesome-agent-skills and others) | Skills and subagents [VERIFIABLE][^42] | A README PR; "Brand new skills that were just created are not accepted" [VERIFIABLE][^42] | Requires "real community usage" [VERIFIABLE][^42] | 36,221 stars for the skills list [VERIFIABLE][^43] |
| composio-community/awesome-claude-plugins and ccplugins/awesome-claude-code-plugins | Claude Code plugins | README PRs | Maintainers | 1,961 and 986 stars; last pushes 2026-07-26 and 2026-08-12 [VERIFIABLE][^44][^45] |

Three findings change what to do with these sites:

- Most of them need no submission. The mods catalogue, Claude Marketplaces and skills.sh build themselves from GitHub, so the actions that matter are the repository topic `claude-code-mod`, a valid `hooks/hooks.json`, and a push [VERIFIABLE][^7][^30][^34]. beads-ui already carries the `claude-code-mod` topic and a `modules` entry, and on 2026-10-23 the scanner had found it and held it in its `deferred` queue, not yet published [VERIFIABLE][^7][^23]. The next publication run or a seed PR lists it.
- The mods catalogue already lists twelve Beads mods from `baselane-sh/mods` and one from a second author, among them `beads-pane` ("A live side pane of your beads") and `beads-band` [VERIFIABLE][^7]. beads-ui will be read beside them, so its listing should say what a full board, backlog and quick-add add over a pane and a band [INFERENCE].
- The two lists with the most reach say a listing should follow use. awesome-claude-code's maintainer writes that the likely order is "Build something awesome; Get users; Submit", and that "If 'getting on the list' is any part of a promotional strategy for your project, you should be prepared to have a backup plan" [VERIFIABLE][^10].

No site in this section shows likes or comments. Every ranking found uses GitHub stars, installs, a scan grade or a maintainer's pick [VERIFIABLE][^7][^29][^30][^31][^34].

## 3. Other AI clients, MCP directories and cross-client formats

None of the clients below loads a Claude Code mod: hooks modules are a Claude Code feature, Agent Plugins 1.0 treats hooks as a non-portable, client-namespaced component, and OpenAI's public directory excludes plugins with lifecycle hooks [VERIFIABLE][^9][^46]. These channels matter for beads-ui's planned MCP server and web app, and for a skills layer if one is added.

### 3.1 AI coding clients

| Client | Where listings live | How to get listed | Review | Reach on the day | Fit for beads-ui |
|---|---|---|---|---|---|
| OpenAI Codex and ChatGPT | One public plugin catalog for both [VERIFIABLE][^47] | The portal at platform.openai.com/plugins, "Skills only" or "With MCP"; a Claude archive with `.claude-plugin/plugin.json` uploads directly if it has "at least one skill at `skills/<skill-name>/SKILL.md`", and the portal "converts it to `.codex-plugin/plugin.json`" [VERIFIABLE][^8][^48] | Automated checks then OpenAI review; MCP plugins need five positive and three negative test cases and a video; "Remove lifecycle hooks before public directory submission" [VERIFIABLE][^8][^48] | None published [NO SOURCE] | The MCP app later; the mod never [INFERENCE: hooks are excluded] |
| Codex repo marketplaces | `.agents/plugins/marketplace.json`, and the ChatGPT desktop app, where Codex desktop runs, also reads a legacy `.claude-plugin/marketplace.json` [VERIFIABLE][^46] | `codex plugin marketplace add owner/repo` [VERIFIABLE][^46] | None | None | Codex could add beads-ui's marketplace, but would not run a Claude mod [INFERENCE] |
| Google Antigravity (app, IDE, `agy` CLI) | `antigravity-plugins-official`, "curated plugins" [VERIFIABLE][^49] | "Fill out this interest form to learn more about how to get your plugin listed"; anyone can self-distribute with `agy plugin install` from a GitHub URL [VERIFIABLE][^49][^50] | Not documented [NO SOURCE] | Catalog size not stated | The MCP app later, as a plugin with `mcp_config.json` [INFERENCE] |
| Gemini CLI | Extensions gallery at geminicli.com | Add the GitHub topic `gemini-cli-extension` and keep `gemini-extension.json` at the root; "Our system crawls tagged repositories daily" [VERIFIABLE][^51] | Validation only [VERIFIABLE][^51] | 1,795 repositories carry the topic [VERIFIABLE][^52] | The MCP app later. Gemini CLI now serves paid API-key users; consumer and free Code Assist users moved to Antigravity CLI on 2026-06-18 [VERIFIABLE][^51][^53] |
| Cursor | Cursor Marketplace | Submit at cursor.com/marketplace/publish; "All plugins must be open source, and we review each update before publishing" [VERIFIABLE][^54] | Manual, every listing and every update [VERIFIABLE][^54] | About 300 plugins visible, no install counts [VERIFIABLE][^55] | The MCP app later |
| GitHub Copilot CLI and VS Code | awesome-copilot, "one marketplace already registered by default" in Copilot CLI [VERIFIABLE][^56] | An external-plugin issue form naming a tag and a full 40-character SHA, public GitHub repositories only; never a direct PR to `plugins/external.json` [VERIFIABLE][^57] | Intake bot, `vally lint`, an install smoke test, then a maintainer's `/approve`; a rejection is final for that issue [VERIFIABLE][^57] | 40,353 stars; 78 external entries [VERIFIABLE][^57][^58] | The MCP app later |
| VS Code agent plugins | Any git marketplace a user adds in the experimental `chat.plugins.marketplaces`; reads "existing Copilot, Claude, and legacy OpenPlugin formats" [VERIFIABLE][^59] | No submission [VERIFIABLE][^59] | None | Page dated 2026-10-21 [VERIFIABLE][^59] | A user could add beads-ui's marketplace; mods do not run there [INFERENCE] |
| JetBrains AI Assistant | No catalog; a user adds a GitHub repository as a skills source, and the IDE offers to import skills it finds in other agents' configuration [VERIFIABLE][^60] | None | None | None | Skills only |
| OpenCode | Ecosystem page in the docs | "Submit a PR" to the ecosystem page [VERIFIABLE][^61] | Maintainer PR review | 31 plugins listed [VERIFIABLE][^61] | Not before a skills or MCP layer |
| Pi | pi.dev/packages, 5,359 packages [VERIFIABLE][^62] | Publish to npm with the keyword `pi-package` [VERIFIABLE][^63] | None documented | 5,359 packages | Not before an npm package |
| Kiro | kiro.dev/powers, 76 powers in Agent Plugins format [VERIFIABLE][^64][^91] | A form with a public repository URL; "If your power is a good fit for our registry, we will reach out" [VERIFIABLE][^65] | Kiro's choice | 76 powers | The MCP app later |
| Zed | `zed-industries/extensions` | A PR per the publishing guide; "every submission is reviewed, and not all of them make the cut" [VERIFIABLE][^66] | Maintainers | None | MCP server only |
| goose | A JSON directory in the docs site, 57 entries [VERIFIABLE][^67] | A PR to that file, inferred from its shape [INFERENCE] | Not documented | Repository 55,591 stars [VERIFIABLE][^68] | MCP server only |
| Amp, Cline, Warp, Windsurf | No public registry found; Cline installs plugins and Amp installs skills from a git URL, and Amp reads `.claude/skills/` [VERIFIABLE][^69][^70][^71][^72] | n/a | n/a | n/a | Skills only; Windsurf's "plugins" are its JetBrains plugin [VERIFIABLE][^73] |

### 3.2 MCP server directories

The official MCP Registry "only hosts metadata, not artifacts": a server is published to npm, PyPI or another package registry first, then registered with `mcp-publisher` after proving the namespace through GitHub or DNS [VERIFIABLE][^74][^75]. It is in preview, and announced a v0.1 API freeze on 2025-10-24 [VERIFIABLE][^74]. Its design calls aggregators "sub-registries" that add curation on top [VERIFIABLE][^76], so publishing once to the official registry is the step the others build on.

| Directory | How to get listed | Review | Reach on the day |
|---|---|---|---|
| Official MCP Registry, registry.modelcontextprotocol.io | `mcp-publisher init`, `login github`, `publish`; `mcpName` in `package.json` or `mcp-name:` in a PyPI README must match `server.json`; description at most 100 characters [VERIFIABLE][^75] | Namespace proof only [VERIFIABLE][^74] | The API answers; no total is published [VERIFIABLE][^77] |
| GitHub MCP Registry, github.com/mcp | Not documented; GitHub calls it "a curated list of MCP servers from partners and the community" [VERIFIABLE][^78] | Curated [VERIFIABLE][^78] | 604 servers [VERIFIABLE][^79] |
| Docker MCP Catalog | A PR to `docker/mcp-registry` adding `servers/<name>/server.yaml`; a local server needs a Dockerfile and is built as an image "with enhanced security features (signatures, provenance, SBOMs, automatic updates)" [VERIFIABLE][^80] | "Every pull request requires a review from the Docker team"; GPL is called out as not acceptable [VERIFIABLE][^80] | 328 servers [VERIFIABLE][^80] |
| Smithery | smithery.ai/new or `smithery mcp publish <url>` for a Streamable HTTP server, or an `.mcpb` bundle for stdio [VERIFIABLE][^81] | An automated scan; no manual review described [VERIFIABLE][^81] | "27,365+ MCPs" [VERIFIABLE][^82] |
| Glama | Crawled; an owner claims a listing with a `glama.json` naming GitHub maintainers [VERIFIABLE][^83][^84] | Letter grades for licence, quality and maintenance [VERIFIABLE][^83] | 109,186 servers, 8,478 claimed [VERIFIABLE][^83] |
| PulseMCP | Paused: "We are not accepting new MCP server or client submissions right now"; PulseMCP advises publishing to the official registry first [VERIFIABLE][^85] | n/a | 21,649 servers [VERIFIABLE][^86] |
| mcp.so | A comment on issue 1 of `chatmcp/mcpso`; the site returned HTTP 403 [VERIFIABLE][^87] | Not documented | 1,475 comments on that issue [VERIFIABLE][^87] |
| mcpservers.org | A web form; free review "within 2 weeks", or $39 for review "within 24 hours", a badge and a "Dofollow link (DR 72)" [VERIFIABLE][^88] | Paid priority [VERIFIABLE][^88] | None shown |
| awesome-mcp-servers (punkpeye) | A README PR for servers with a public repository [VERIFIABLE][^89] | Maintainer; agent-written PRs marked "🤖🤖🤖" are fast-tracked [VERIFIABLE][^89] | 96,794 stars [VERIFIABLE][^89] |
| LobeHub MCP market | Unresolved: every route returned HTTP 403 [NO SOURCE] | Unresolved | Unresolved |

### 3.3 Cross-client formats and tools

Two formats cross clients. Agent Skills defines a `SKILL.md` with a `name` of at most 64 characters and a `description` of at most 1,024, checked by `skills-ref validate` [VERIFIABLE][^90]. Agent Plugins 1.0 is "an open, vendor-neutral standard" with a root `plugin.json`, `skills/` and `mcp.json`; its first steering committee "includes Core Maintainers from Amazon, Cursor, Microsoft, OpenAI, and Vercel", and hooks appear only under a client's reverse-domain namespace [VERIFIABLE][^9]. Anthropic and Google are not on that list [VERIFIABLE][^9]. Cursor and Kiro read Agent Plugins, and VS Code, Codex and OpenAI's portal also accept Claude layouts as legacy or import input [VERIFIABLE][^8][^54][^59][^91].

The tools that publish across clients:

- `gh skill publish` validates against the Agent Skills spec, offers the `agent-skills` topic, and "creates a GitHub release with auto-generated notes"; `gh skill search` searches code for `SKILL.md`, so any public skill is findable. The command group is "in preview and subject to change without notice" [VERIFIABLE][^92][^93][^94].
- Microsoft APM is a "dependency manager for AI agents" driven by `apm.yml`, targeting nine clients including Claude Code, Copilot, Cursor and Codex [VERIFIABLE][^95][^96].
- `wshobson/agents` keeps one source in Claude Code format and generates the other clients' manifests; it commits native registries for Claude, Codex and Cursor and generates the rest [VERIFIABLE][^97][^98]. With 41,611 stars it is the strongest maintained precedent for one repository serving seven harnesses [VERIFIABLE][^23].
- A `.agents/` directory is becoming a shared home: Codex reads `.agents/plugins/marketplace.json`, Antigravity reads `.agents/plugins` and `.agents/skills`, goose reads `~/.agents/plugins`, and Amp and OpenCode read `.agents/skills` and `.claude/skills` [VERIFIABLE][^46][^50][^70][^99][^100][^101].
- NVIDIA's OCI agent-package proposal calls itself "not an adopted standard" and is exploratory [VERIFIABLE][^102].

For beads-ui the answer is direct. One repository can serve Claude Code, Codex, Cursor and Copilot, as `wshobson/agents` shows, but only for skills and MCP servers [VERIFIABLE][^9][^97]. The mod stays Claude Code only. A skills layer, such as a `beads-board` skill that tells an agent how to drive `bd`, or the planned MCP server, is what would put beads-ui into the OpenAI, Cursor, Copilot and MCP directories [INFERENCE: each of those directories accepts skills or MCP servers and none accepts a Claude hooks module].

## 4. Publishing path for beads-ui

The repository was measured on 2026-10-23 at `origin/main` `d331375`: public, MIT, with the topics `beads`, `claude-code`, `claude-code-mod`, `mcp`, `mcp-ui`, `open-source`, `task-manager`, `tui`, `typescript` and `web-app`, 0 stars, a root marketplace named `beads-ui` listing `./plugins/beads-ui`, and a plugin at version 0.1.1 whose `hooks/hooks.json` names `./register.ts` under `modules` [VERIFIABLE][^23]. The plugin folder holds 97 tracked files, the largest 54,185 bytes, a `package.json` with no lockfile beside it, and no README [INFERENCE: measured with `git ls-files` and `stat` in this run; Appendix: Measurements].

### 4.1 Before any listing

1. Add `plugins/beads-ui/README.md` of at least 40 words outside code blocks: what the mod draws, the commands, what it runs (`bd` through `$.process`), that it sends nothing over the network, and the Claude Code floor. The directory blocks without it, and its listing text comes from it [VERIFIABLE][^3][^18]. The directory policy also asks for documentation and troubleshooting, "at least three working examples of prompts or use cases", "verified contact information and support channels", and a privacy policy link for software that collects user data or connects to a remote service [VERIFIABLE][^103]. Three worked uses in the README and the repository's issues page as the support channel cover those [INFERENCE].
2. Move the marketplace description to the top-level `description` key or keep it under `metadata.description`; both are read, and validate warns only when neither is set [VERIFIABLE][^26].
3. Keep raising `version` on every release, because an unchanged version installs nothing for existing users [VERIFIABLE][^2]. This repository's pre-push hook already enforces it [INFERENCE: from `docs/procedures/releasing.md`].
4. Optionally run `claude plugin tag --push` from the plugin folder to tag `beads-ui--v0.1.1`, which matters once another plugin declares a range on this one [VERIFIABLE][^2].
5. Record a 20 to 40 second terminal recording of the board, for the README and every post [HEURISTIC].

### 4.2 Listing, in order of effort

1. Own marketplace: live today. Keep the two-line install in the README [VERIFIABLE][^2].
2. Mods catalogue: push once with the topic in place, or open a seed PR adding `sergeiwallace/beads-ui` to `data/seeds.txt` in alphabetical order; a seed must clone and validate [VERIFIABLE][^7]. A Featured nomination needs a recording, install steps and access notes, and self-nominations must disclose the relationship [VERIFIABLE][^7].
3. Beads community tools list: a PR to `docs/community-tools.md` under Terminal UIs, or a comment on discussion #276 [VERIFIABLE][^35]. This is the audience that already runs `bd`. Upstream Beads also has its own Claude Code marketplace, `beads-marketplace`, which today lists only the `beads` plugin and describes itself as a "Local marketplace for beads plugin development" [VERIFIABLE][^169]. A PR adding beads-ui there, or a pointer from the `beads` plugin's README, would put it one install away from every Beads plugin user; the maintainers may decline, and it is Sergei's act.
4. Anthropic's directory: the seven portal steps in section 1.2, with plugin path `plugins/beads-ui` and the tracked branch `main` or a release tag. Answer the data-handling questions from what the README discloses. Expect a person to review the first version [VERIFIABLE][^3][^4].
5. ClaudeMod: its Submit a Mod form [VERIFIABLE][^29].
6. awesome-claude-code: from 2026-10-28, 14 days after the first commit on the default branch, made on 2026-10-14 [INFERENCE: measured with `git log --reverse`, Appendix: Measurements M-9], provided commits continue, through the web issue form, by Sergei himself [VERIFIABLE][^10][^23].

Claude Marketplaces and skills.sh need no action for a mod; skills.sh lists skills, and beads-ui has none [VERIFIABLE][^30][^34].

### 4.3 Risks in that path

The directory's name check holds a name "that may be confused with an existing listing" [VERIFIABLE][^18]. `mantoni/beads-ui` is a 761-star Beads web UI published on npm as `beads-ui` and listed second under Web UIs in the Beads community list [VERIFIABLE][^23][^35]. Whether it has a directory listing is unknown [NO SOURCE]. The design doc already records the npm collision and resolves the npm name as `@sergeiwallace/beads-ui` [INFERENCE: from `docs/designs/beads-ui-design.md` D-7]. A look-alike is held for a reviewer, which is a delay, but the same name already used by another organisation's plugin "Blocks" [VERIFIABLE][^18]. A portal Validate run, or a search of the directory for `beads-ui`, settles which applies before D-4 is decided [INFERENCE]. Renaming later is worse, because "a renamed plugin is a different plugin to every existing install" [VERIFIABLE][^2]. That is decision D-4.

The plugin folder lives one level down, which brings the subfolder rules into play. For a plugin in a subfolder, the checklist holds hook commands, MCP and LSP server commands and `!` lines that run non-shell files [VERIFIABLE][^18]. A mod's `modules` entry is none of those, so the hold should not apply to `register.ts` [INFERENCE: the rule's list of triggers does not include `modules`; untested against the portal].

## 5. Adoption playbook for open-source agentic tooling

The evidence points at positioning before channels. Another Beads web UI already ships as `beads-ui` on npm, the Beads community list holds 60 tools, and the mods catalogue already lists Beads mods [VERIFIABLE][^7][^35][^104][^105]. The precedents that reached tens of thousands of stars grew over months through marketplace placement, an author with an audience, or other people's write-ups, not through one launch post (section 5.2).

### 5.1 Channels

Platform rules are quoted where they could be read. Subreddit and per-Discord-server rules could not be read from this host, so a person must read them before posting [NO SOURCE].

| Channel | The rule that matters, quoted | What the evidence shows | Fit for beads-ui |
|---|---|---|---|
| Hacker News, Show HN | "Please don't use HN primarily for promotion"; "Don't solicit upvotes, comments, or submissions"; "Don't post generated text or AI-edited text" [VERIFIABLE][^14]. Show HN is "temporarily" restricted after "a massive influx, mostly by users who aren't yet familiar with the site or its culture" [VERIFIABLE][^15][^106]. Show HN must be something people can try, not a landing page [VERIFIABLE][^107] | The top 40 "claude code plugin" Show HNs have a median of 2 points; a tool that names a whole category did better, such as Vibe Kanban at 195 [VERIFIABLE][^16][^108] | Medium, and only with a post Sergei writes himself; a second submission later is allowed and has worked (section 5.2) |
| X | The ranking is "Σ (weight_i × P(action_i))", and "posts from accounts the viewer does not follow are multiplied by a factor below 1"; the open-link weight is a positive 0.2 [VERIFIABLE][^109][^110] | Reach depends on the author's followers; Yegge had 49,823 when Beads spread [VERIFIABLE][^111] | High if Sergei's followers include Claude Code users; a 20 to 40 second recording carries the post [INFERENCE] |
| LinkedIn | "Don't do things to artificially increase engagement with your content", and "don't agree with others ahead of time to like or re-share each other's content" [VERIFIABLE][^112] | No outcome data found [NO SOURCE] | Medium, for enterprise developers and his professional network |
| Substack | The Acceptable Use Policy bans running "any form of auto-responder or “spam” on Substack"; no self-promotion rule was found [VERIFIABLE][^170] | No outcome data found [NO SOURCE] | Sergei's own channel; a build write-up fits it better than an announcement [INFERENCE] |
| Reddit: r/ClaudeAI, r/ClaudeCode, r/SideProject, r/opensource | Rule text not obtained [NO SOURCE]. r/ClaudeCode's most used flairs are "Help/Question" and "Built with Claude" [VERIFIABLE][^113] | r/ClaudeAI about 1.2M members, r/ClaudeCode about 460k and growing 1,112.8% a year, r/SideProject about 878k, r/opensource 391k, all from a third-party statistics site [VERIFIABLE][^113][^114][^115][^116] | High for r/ClaudeCode with the "Built with Claude" flair, after reading the rules [INFERENCE] |
| Discord: the Claude server and the Beads (Gas Town) server | Discord-wide: "Do not send unsolicited bulk messages (or spam) to others", and no "artificially inflating server membership, manipulating engagement metrics" [VERIFIABLE][^117] | The Claude server has about 133,000 members [VERIFIABLE][^118]; the Beads server had "over two thousand members" by 2026-04-24 [VERIFIABLE][^119] | Highest for the Beads server, whose members already run `bd` [INFERENCE] |
| Anthropic's community programmes | "Share projects you've built with Claude to be considered for a feature on Claude's social channels or marketing" [VERIFIABLE][^120] | Superpowers sits in the official marketplace and on claude.com/plugins with 1,009,371 installs [VERIFIABLE][^121][^122] | High; the showcase form is free, and a directory listing is the step before it [INFERENCE] |
| Lobsters | "self-promo should be less than a quarter of one's stories and comments in the last year"; "New users (first 70 days) are not allowed to submit self-promo" [VERIFIABLE][^123] | A thread calling the vibecoding tag "harmful" reached 332 votes [VERIFIABLE][^124] | Poor |
| Product Hunt | "you cannot ask people directly to upvote your product" [VERIFIABLE][^125] | No result for an open-source Claude Code plugin found [NO SOURCE] | Low |
| dev.to | DEV "is not designed primarily for the purposes of promotion or creating backlinks"; "Posts must contain substantial content" [VERIFIABLE][^126] | Most top posts on the #claudecode tag had no comments [VERIFIABLE][^127] | Low, unless the post is a full tutorial |
| Bluesky | Not obtained | ccusage asked users to share on Bluesky as well as X [VERIFIABLE][^128] | Secondary |
| Newsletters | TLDR AI has 1.1 million readers and an Advertise link only; Ben's Bites has 117,000 subscribers and no route; Latent Space takes "stories and tips" at tips@latent.space [VERIFIABLE][^129][^130][^131] | No newsletter pick of a Claude Code plugin found [NO SOURCE] | Low until there is a story; "This week in Claude" could not be reached [NO SOURCE] |
| YouTube creators and podcasts | Not obtained [NO SOURCE] | Not obtained | Unmeasured |
| Conferences | AI Engineer Code Summit, 10 to 12 November 2026 in San Francisco, is "application-based" [VERIFIABLE][^132] | Slow | A demo after users exist |
| GitHub trending | No rule | The weekly list on 2026-10-23 was led by agent repositories gaining thousands of stars a week [VERIFIABLE][^133] | Out of reach until stars arrive fast [INFERENCE] |
| Beads' own channels and the mods catalogue | Section 4.2 | The audience that already runs Beads, and mod hunters | Highest, and first |

### 5.2 Precedents with numbers

Star counts are GitHub REST API reads on 2026-10-23. The curves are read by eye off star-history charts and are approximate [VERIFIABLE][^13].

| Project | Launch and channel | What the numbers show | Lesson for beads-ui |
|---|---|---|---|
| Superpowers | Shipped 2025-10-09, the morning plugins launched, from its own marketplace [VERIFIABLE][^12] | About 11K to 14K stars at the start of 2026, about 290K on the chart in October, and 304,187 by the API on 2026-10-23; "more than 1.1M installs"; 1,009,371 installs on its claude.com page; never an HN launch thread, the largest story a third party's review at 50 points [VERIFIABLE][^13][^122][^134][^135] | Launch-day timing did not make the curve; most growth came in 2026, after the official marketplace existed [INFERENCE: the repo `anthropics/claude-plugins-official` was created 2025-11-20 and ranks it prominently, but causation is unmeasured] |
| claude-mem | A plugin with a README in 30+ languages [VERIFIABLE][^136] | About 9K stars in January 2026, about 100K by October, 102,523 by the API; two 2-point HN posts [VERIFIABLE][^17][^137] | 100K stars came without HN [INFERENCE] |
| Beads | Yegge's Medium post on 2025-10-13, selling it as a one-line `AGENTS.md` change [VERIFIABLE][^138] | Launch-week HN posts 12 and 19 points; a third party's repost on 2025-11-28 scored 111; "Beads crossed 20k stars on GitHub this week" on 2026-04-03 [VERIFIABLE][^119][^139] | A known author and a Discord carried it, and someone else's repost beat the launch [INFERENCE] |
| ccusage | Launched 2025-05-29 from the author's site, asking users to share with "#ccusage" on X and Bluesky [VERIFIABLE][^128] | 870,995 npm downloads in the month to 2026-10-18 against 19,151 stars; a third party's HN post scored 75 [VERIFIABLE][^140][^141] | A daily-use tool spreads through its users' screenshots; downloads measure use better than stars [INFERENCE] |
| claude-code-router | The same submitter posted the same URL to HN twice: 2 points on 2025-07-24, 160 on 2025-07-28 [VERIFIABLE][^142] | The steepest star rise ran from mid-July to late August 2025 [VERIFIABLE][^143] | The one precedent where an HN spike lines up with growth; one HN attempt says little [INFERENCE] |
| wshobson/agents | One 2-point HN post [VERIFIABLE][^144] | 41,611 stars, 40K by October 2026 [VERIFIABLE][^145] | Multi-harness reach grew without HN [INFERENCE] |
| awesome-claude-code | A curated list | About 2.3K stars in July 2025 to 54.9K in October 2026 [VERIFIABLE][^146] | Grows with the ecosystem; a place to be seen once there is use |
| terminal-browser (zenbu-labs), a terminal app that also ships a Claude Code plugin | A README that opens with a video and two one-line installs [VERIFIABLE][^147] | About 300 stars in early August to 4,181 by the API on 2026-10-23; its Show HN scored 4 [VERIFIABLE][^148][^149] | Not a mod precedent: its August jump came before mods went live on 2026-10-01 [VERIFIABLE][^1][^148]. Its README pattern still applies |

### 5.3 Practices the evidence supports

Sequencing. Ship listings that cost nothing first, collect a few real users from the Beads community, then try the wide channels [INFERENCE: the catalogue scan is automatic, the Beads audience is exact, and no precedent above grew mainly from a launch-day post]. Mods are new: a Show HN for a mod on 2026-10-22 scored 25 points and ModVet, on 2026-10-20, scored 1; two posts are an observation, not a base rate [VERIFIABLE][^150]. A first HN post that fails is not the last chance: two precedents scored on a later submission [VERIFIABLE][^139][^142].

README and demo. Lead with a recording and a two-line install, as terminal-browser does [VERIFIABLE][^147]. Terminal recorders are mature: `charmbracelet/vhs` had 21,185 stars and asciinema 17,907 [VERIFIABLE][^151]. Put the `claude plugin validate` output in the README, because Anthropic tells users to "Install mods only from authors and marketplaces you trust" and that output lists every hook and call before install [VERIFIABLE][^28]. The mods catalogue's Featured slot asks for "a real recording or screenshot, installation steps and access notes" [VERIFIABLE][^7].

Agent-era discoverability. AGENTS.md is "used by over 60k open-source projects" and is stewarded by the Agentic AI Foundation [VERIFIABLE][^152]. llms.txt is "a proposal", not an adopted standard [VERIFIABLE][^153]. On Context7, "Anyone can add a public library — you don't need to own it" [VERIFIABLE][^154]. Repository topics feed the mods catalogue's three-hourly scan directly [VERIFIABLE][^7]; GitHub allows up to 20 topics of at most 50 characters each [VERIFIABLE][^155]. The older open-source guidance still holds as background: one "home" URL to point people to, and going where the audience already is, helping first [VERIFIABLE][^156]. Of these, the topic and a clear README are the ones with a measured path to a listing; the rest are cheap and unmeasured [INFERENCE].

Measurement. GitHub traffic covers only "the last 14 days", needs write access, and its referrer list excludes "search engines and GitHub itself" [VERIFIABLE][^157][^158]. beads-ui showed 1 view against 1,097 clones in 14 days, so clones count scanners and the owner's machines, not users [VERIFIABLE][^159]. Claude Code gives a marketplace author no usage data at all, and the directory's Usage tab does (section 1.3). Snapshot stars and traffic on a schedule, since the history expires [INFERENCE].

After launch. Superpowers links a Discord, Issues and a release signup and keeps Discussions off [VERIFIABLE][^160]. beads-ui has Issues on and Discussions off, with no homepage set [VERIFIABLE][^136]. Joining the Beads Discord reaches that community without building a new one [HEURISTIC]. For open-source adoption in general, the long-standing guidance is to "Clearly explain how to contribute" in a CONTRIBUTING file, label "issues that are simple enough for beginners to tackle", reply promptly because "If you don't respond to their issue for a month, chances are, they've already forgotten about your project", and credit every contributor [VERIFIABLE][^171]. beads-ui already has a CONTRIBUTING file; beginner-labelled issues and a contributors list are the gaps [INFERENCE: from the repository tree].

### 5.4 Contrarian evidence

- Fake stars concentrate in AI repositories: a review of the StarScout study names AI and LLM repositories as the largest non-malicious group receiving them, at "$0.03–$0.10 per star" at the cheapest tier [VERIFIABLE][^161]. The suggested organic watcher-to-star band did not separate Superpowers, claude-mem and Beads from each other, so the heuristic is not usable here [VERIFIABLE][^136][^161].
- Slop fatigue is measurable: 22% of about 1,590 recent Show HN landing pages scored high on AI design patterns [VERIFIABLE][^162]. HN now bans AI-edited posts outright [VERIFIABLE][^14].
- Supply is enormous: claudescode.dev counts 1,865,055 active repositories with Claude Code commits, and an HN story titled "90% of Claude-linked output going to GitHub repos w <2 stars" scored 337 [VERIFIABLE][^163][^164].
- Star counts can be spectacular and unexplained: one repository gained 106,341 stars in a week [VERIFIABLE][^133].

## 6. The Google seed, claim by claim

Every URL the seed named was fetched on 2026-10-23. Confirmed means the fetched primary source says the same; corrected means a primary source says something different, with the correction; unverified means no fetched source settles it.

| # | Seed claim (quoted or closely paraphrased) | Verdict | What the fetched source says |
|---|---|---|---|
| S-1 | Community marketplaces let you "browse, upload, download, and interact" with mods, including likes and comments | Corrected | Browsing, submitting and installing exist; no site fetched shows likes or comments [VERIFIABLE][^7][^29][^30][^31] |
| S-2 | ClaudeMod is "A dedicated community hub for Claude Code mods, plugins, skills, and Model Context Protocol (MCP) servers" | Confirmed | "The community hub for Claude Code Mods ... skills, MCP servers, hooks, and more" [VERIFIABLE][^29] |
| S-3 | ClaudeMod shows "category tags, download/view counts, and author attributions" | Unverified | Tags and "by" authors are there; each listing also shows a number the page never labels, so the counts part cannot be settled [VERIFIABLE][^29] |
| S-4 | Developers "Browse and Submit mods through the portal" | Confirmed | A "Submit a Mod" button links to /submit; the process is undocumented [VERIFIABLE][^29] |
| S-5 | ClaudeMarketplaces "uses an automated crawler to refresh install counts and GitHub star metrics" | Confirmed | "Crawlers discover listings and refresh install counts and GitHub stars on a schedule" [VERIFIABLE][^30] |
| S-6 | ClaudeMarketplaces is "Another open registry" | Corrected | It is a crawled directory with editor sweeps and no submission form, "Not affiliated with Anthropic" [VERIFIABLE][^30] |
| S-7 | Build with Claude is "A centralized web directory to discover community-contributed skills and plugins" | Confirmed | Plugins, skills, subagents, commands and hooks; also a marketplace repo [VERIFIABLE][^31] |
| S-8 | aitmpl.com/plugins is a source for Build with Claude | Corrected | aitmpl.com is a separate site, AI Templates, from `davila7/claude-code-templates` [VERIFIABLE][^32] |
| S-9 | Claude Code uses "an open, decentralized architecture ... rather than a single monolithic website registry" | Confirmed | Each marketplace is its own `marketplace.json`; the claude.ai directory is one catalog among them [VERIFIABLE][^19][^26] |
| S-10 | "Claude Code marketplaces are powered by GitHub repositories" | Corrected | GitHub is common; a marketplace can also come from any git host, a URL, a file or a directory, and plugins from npm, archives or commands [VERIFIABLE][^26] |
| S-11 | "To publish, you create a public GitHub repo with a .claude-plugin/marketplace.json" | Confirmed | "Once the file is in the repository, the plugin is published"; a private repo makes a private marketplace [VERIFIABLE][^2] |
| S-12 | Community registries "scan these JSON files or accept submissions" | Confirmed | The mods catalogue scans GitHub and validates each plugin; ClaudeMod takes submissions; Claude Marketplaces crawls [VERIFIABLE][^7][^29][^30] |
| S-13 | Likes, comments and stars "are usually anchored to the mod's native GitHub repository" | Confirmed | Rankings use GitHub stars, installs or scans; feedback goes through each repo's issues [VERIFIABLE][^7][^10][^30] |
| S-14 | Install with `/plugin marketplace add <owner>/<repo>` then `/plugin install <mod-name>@<marketplace-name> --scope user` | Confirmed | The same two steps, with scope chosen at install [VERIFIABLE][^2][^19] |
| S-15 | Example: `claude plugin marketplace add whyashthakker/awesome-claude-code-mods` | Confirmed | The README gives that command [VERIFIABLE][^33] |
| S-16 | `karanb192/awesome-claude-code-mods` is a community registry | Confirmed | 6,092 mods with a scan and a website [VERIFIABLE][^7] |
| S-17 | "Anthropic provides an official directory inside the claude.ai admin console" | Corrected | The directory is at claude.ai/directory and submissions go through the developer portal at claude.ai/directory/manage; the old Console form "is no longer supported" [VERIFIABLE][^2][^4] |
| S-18 | "If you have a paid plan, you can submit your extensions directly" | Confirmed | Pro, Max, Team or Enterprise; "Free accounts can't submit" [VERIFIABLE][^4] |
| S-19 | "Once approved, plugins sync seamlessly from your web account down to your terminal Claude Code sessions" | Confirmed | A plugin added from the directory on claude.ai reaches Claude Code as `<name>@synced` [VERIFIABLE][^2][^5] |
| S-20 | The boilerplate files are "plugin.json or hooks.ts" | Corrected | A mod is `.claude-plugin/plugin.json`, `hooks/hooks.json` naming a module, and the module (for example `register.js`) [VERIFIABLE][^28] |
| S-21 | The two code.claude.com pages it cites exist and describe the model | Confirmed | Both answered HTTP 200 and describe marketplaces as the seed says [VERIFIABLE][^19][^26] |
| S-22 | The Firecrawl post and the YouTube video are sources on mods | Confirmed | Firecrawl's 2026-10-06 post covers building mods and points to issue #91870; the video is "Mods in Claude Code: change how Claude Code works" from the Claude channel [VERIFIABLE][^165][^166] |
| S-23 | Extensions are submitted "directly through Anthropic's developer pipeline" and then approved | Confirmed | The developer portal, a scan on each version and a person on the first listing; the community marketplace's form link redirects to the same directory submission page [VERIFIABLE][^3][^4][^22] |

The seed also cited pages that do not support the sentences beside them. The eSEOspace post, cited for web-to-terminal sync, does not describe syncing a personal claude.ai account's plugins to Claude Code [VERIFIABLE][^167]. The MindStudio guide, cited for the install lifecycle, names no registry and points at Anthropic's playground repository instead [VERIFIABLE][^168]. The seed missed the community marketplace, the developer portal, claude.com/marketplace, skills.sh, awesome-claude-code, the Beads community list and every non-Claude client.

## 7. Adversarial critical review

### 7.1 The case against listing and launching now

The strongest objection is that beads-ui has no users to show. It had 0 stars on 2026-10-23, nine days after the repository was created [VERIFIABLE][^23]. The largest Claude Code list expects users before a listing and refuses anything younger than 14 days with fewer than 100 stars [VERIFIABLE][^10]. A mod also asks more trust than a skill: it "runs with your permissions", is not sandboxed, and can approve tool calls [VERIFIABLE][^28]. Strangers grant that to a zero-star repository rarely [INFERENCE: the mods catalogue exists largely to show each mod's access footprint before install, which is a response to exactly that hesitation].

The objection changes the order, not the plan. Listings that build themselves cost nothing and should happen now. The directory listing is the only source of usage numbers, so it should also come early. The broad social launch is what should wait for a README, a recording and a first few users from the Beads community [INFERENCE].

### 7.2 The audience is narrower than "Claude Code users"

A mod runs only in Claude Code v2.1.287 or later, in the terminal, the Desktop Code tab and the VS Code extension, and draws nothing in `claude -p` or cloud sessions [VERIFIABLE][^28]. beads-ui further needs `bd` on `PATH`, a Beads store and v2.1.299 [INFERENCE: from this repository's README and `docs/procedures/mod-install.md`]. The real audience is people who already run Beads inside Claude Code [INFERENCE]. That points the first launch at the Beads community list and discussion #276, and away from general AI-tool channels.

### 7.3 It is not alone

The mods catalogue already lists thirteen Beads mods from two authors, including a live pane and a counts band [VERIFIABLE][^7]. The Beads community list ranks at least six terminal UIs, among them Mardi Gras, perles, LazyBeads and b9s, and one web UI already named `beads-ui` [VERIFIABLE][^35]. A launch post that does not say what beads-ui does that these do not will read as a duplicate [INFERENCE].

### 7.4 Every number in this doc is someone's own counter

Install counts, star counts, "uses" and "visitors" all come from the site that shows them [INFERENCE: no fetched page names an outside audit]. Peer-reviewed work found about six million suspected fake GitHub stars from 2019 to 2024, a surge in 2024, AI and LLM repositories among the promoted kinds, and a boost that lasts "less than two months" [VERIFIABLE][^11]. Large star counts on young AI repositories in the GitHub search results this run read, such as 174,673 stars on a repository created on 2026-06-12, should be read with that in mind; nothing here says those particular stars are fake [VERIFIABLE][^23].

### 7.5 Where the sources disagree

- The official marketplace's README still says "Third-party partners can submit plugins for inclusion" through the clau.de form, while the newer publish page says the official marketplace "doesn't take submissions through the directory portal" and names a partner contact as the route [VERIFIABLE][^2][^121]. This doc follows the publish page, as the more specific and more recent text [INFERENCE].
- The `wshobson/agents` matrix shows no Codex lifecycle hooks; OpenAI's build page supports them for manual installs in Codex desktop [VERIFIABLE][^46][^98].
- Claude Code's docs say claude.com/marketplace shows install counts; the fetched copy showed none, while claude.com/plugins/superpowers did [VERIFIABLE][^19][^20][^122].

### 7.6 Five-perspective critic pass

| Perspective | Challenge | Severity | Resolution in this doc |
|---|---|---:|---|
| Developer relations | A list of 60 places to post is not a launch plan | High | Section 4.2 orders listings by effort and D-1 orders channels; most rows are marked low fit |
| Contrarian | beads-ui may not need wide reach at all; its users are Beads users | High | D-1 (a) and 7.2 put the Beads community first |
| Skeptic and source vetting | Every reach number is self-reported, and AI repositories attract fake stars | High | 7.4 and 5.4; no listing is called a proven driver of users |
| Brand and naming | The name collides in the exact audience | High | D-4, with a rename recommended if Sergei is open to one |
| Security and trust | A zero-star mod asks for full user permissions | Medium | 5.3 puts the `claude plugin validate` output in the README; the catalogue shows the access footprint |

Each high and medium challenge changed a section or a decision above.

## Gaps, blindspots and emergent findings

1. Hooks travel only partly. Agent Plugins has no portable hooks, OpenAI bars hooked plugins from its public directory, and the `wshobson/agents` matrix shows no hook output for Codex, Cursor or Copilot, though it does for OpenCode, Antigravity and Pi [VERIFIABLE][^9][^48][^98]. None of those carries a Claude Code mod, so every non-Claude listing for beads-ui needs a different artifact [INFERENCE: a mod calls Claude Code's own mods API].
2. Sources disagree on Codex hooks. The `wshobson/agents` matrix marks Codex lifecycle hooks unsupported, while OpenAI says "Lifecycle hooks are supported for plugins installed manually in Codex desktop" [VERIFIABLE][^46][^98]. The matrix is probably older than the page [INFERENCE].
3. Discovery without submission is the norm. quemsah's index, Claude Marketplaces, Glama, Skillselion, the mods catalogue and `gh skill search` all crawl GitHub [VERIFIABLE][^7][^30][^36][^41][^83][^94]. Claiming a listing and keeping repository metadata right matters more than filing forms [INFERENCE].
4. Paid priority has arrived. mcpservers.org sells a 24-hour review, a badge and a "Dofollow link (DR 72)" for $39 [VERIFIABLE][^88]. That is search-ranking sale, not curation [INFERENCE].
5. Some lists gate on traction and say so: awesome-claude-code, VoltAgent's skills list [VERIFIABLE][^10][^42]. Others invite agent-written PRs, which weakens what a listing signals [VERIFIABLE][^89].
6. Catalog counts inflate fast. SkillMD went from 25,848 skills on 2026-09-06 to "111,000+" by 2026-10-23 [VERIFIABLE][^38]. A count is not installs [INFERENCE].
7. ClawHub relicenses every published skill to MIT-0 with no attribution [VERIFIABLE][^40]. Publishing beads-ui there would drop the MIT attribution clause [INFERENCE].
8. Gemini CLI's audience shrank. Since 2026-06-18 it serves paid API-key users, and extensions continue "(now as Antigravity plugins)" [VERIFIABLE][^53]. A Gemini-only listing reaches fewer people than in 2025 [INFERENCE].
9. The community marketplace's submission link redirects to the directory's submission page [VERIFIABLE][^22], but no page says whether every directory plugin also joins the `claude-community` marketplace, which matters because only official-named marketplaces get install hints and named telemetry [VERIFIABLE][^6][^27].
10. Blindspots this run could not resolve: subreddit rules (reddit.com does not answer this host), the GitHub MCP Registry's listing route, Cursor's publish form fields, LobeHub, SkillMD's submit flow, Open VSX as a channel for editor extensions, and whether the claude.com marketplace shows install counts [NO SOURCE].
11. The mods catalogue's scanner already had beads-ui in its `deferred` queue, found with a push time of 2026-10-21, so a public listing may appear before Sergei decides when to launch [VERIFIABLE][^7].
12. Every precedent author whose audience could be measured had one before the launch; Sergei's audience on X, LinkedIn and Substack was not measured [NO SOURCE].
13. Multi-harness reach is a growth factor in the precedents: Superpowers lists install routes for 16 agents [VERIFIABLE][^160]. beads-ui is Claude Code only until the MCP app or a skills layer exists [INFERENCE].
14. Anchor-bias counter: the seed and the brief framed the question as "which registries"; the legs measured HN base rates and star curves instead of trusting launch stories, which is where the finding that launch day does not drive growth came from.

## Comparison

The surfaces that can list beads-ui as it is today, a Claude Code mod with no MCP server and no skills. Adoption signals follow the source-vetting rule: a listing site's own counter is an observed number, not proof of users.

| # | Criterion | Own marketplace | Anthropic directory | Mods catalogue (mods.aidojo.si) | Beads community list | awesome-claude-code | ClaudeMod |
|---|---|---|---|---|---|---|---|
| 1 | Takes a mod today | Yes [VERIFIABLE][^2] | Yes, Claude Code only [VERIFIABLE][^5] | Yes, mods only [VERIFIABLE][^7] | Yes, any Beads tool [VERIFIABLE][^35] | Yes, after its age or star bar [VERIFIABLE][^10] | Yes [VERIFIABLE][^29] |
| 2 | Effort to list | Done | Portal form, README fix, a review [VERIFIABLE][^3][^18] | None, or a one-line seed PR [VERIFIABLE][^7] | One PR or a discussion comment [VERIFIABLE][^35] | One human-filed issue form [VERIFIABLE][^10] | A form [VERIFIABLE][^29] |
| 3 | Gatekeeping | None | Scan on every version, a person on the first [VERIFIABLE][^4] | Must clone and validate [VERIFIABLE][^7] | Maintainer PR review [INFERENCE] | Maintainer's choice, best effort [VERIFIABLE][^10] | Not stated [NO SOURCE] |
| 4 | Usage numbers back to the author | None [VERIFIABLE][^6] | Installs, runs, errors [VERIFIABLE][^4] | A "reach" badge, method not read [NO SOURCE] | None | None | An unlabelled number [VERIFIABLE][^29] |
| 5 | Audience fit | People who already know the repo | Every Claude Code user browsing `/plugin directory` [VERIFIABLE][^5] | Mod hunters; thirteen Beads mods already there [VERIFIABLE][^7] | Beads users, the exact audience [INFERENCE] | Broad Claude Code readership, 56,335 stars [VERIFIABLE][^23] | Mod hunters; 172 entries across all categories, 12 of them under Mods [VERIFIABLE][^29] |
| 6 | Independent adoption evidence | Not applicable | None found [NO SOURCE] | None found [NO SOURCE] | Upstream Beads has 28,149 stars [VERIFIABLE][^23] | None beyond stars [NO SOURCE] | None found [NO SOURCE] |



## Recommendation

For listing, the recommendation is to list where it is free and where the audience is exact before anything broad, and to treat Anthropic's directory as the measurement channel. In order:

1. Fix the directory blockers now: a plugin-folder README of 40 or more words that discloses what the mod runs, three worked uses, and the issues page as support [VERIFIABLE][^18][^103].
2. Let the crawlers find it: keep the `claude-code-mod` topic, push, and add a seed line to the mods catalogue if it has not appeared within a day [VERIFIABLE][^7].
3. Open the PR to the Beads community tools list under Terminal UIs, and post in discussion #276 [VERIFIABLE][^35]. These are outward-facing acts, so they are Sergei's.
4. Submit to Anthropic's directory (D-3): it is the only route to usage numbers for a public plugin [VERIFIABLE][^6][^24].
5. File awesome-claude-code and ClaudeMod after 2026-10-28 and once the first users exist [VERIFIABLE][^10].
6. Leave the other clients, the MCP directories and skills registries until the MCP server or a skills layer exists; then publish the MCP server once to the official MCP Registry and claim it on Glama, and submit one skills-plus-MCP artifact to OpenAI, Cursor and awesome-copilot [VERIFIABLE][^48][^54][^57][^75][^76][^84].

These are recommendations from the evidence; source vetting holds that no listing site here has independent adoption data, so none of them is called an established best practice for producing users [INFERENCE].

For adoption, the recommendation is D-1 (a) and D-2 (b): settle the name, ship the README with the validate output and a recording, list in the free and exact places, get a few Beads users, and only then post widely, with every post written by Sergei himself. Measure from the directory's Usage tab and scheduled snapshots of stars and traffic, not from clones [VERIFIABLE][^24][^159]. None of the channels has independent evidence that it produces users, so the plan is a sequence of cheap experiments rather than an established best practice [INFERENCE].

## Open Decisions for Sergei

These four are Sergei's under the decision framework: each is an outward-facing act or concerns what is published under his name, which no agent decides. Each carries the research's recommendation. None is resolved here.

### D-1: Which channels to share on, and in what order

`⏳ PENDING (human)`

Options:

- (a) Beads-first, then wide. Week one: the Beads community list PR, discussion #276, a PR to upstream Beads' own `beads-marketplace`, the Beads Discord and the mods catalogue's Featured nomination. Then, with a few users and their feedback in hand, r/ClaudeCode with the "Built with Claude" flair, X, LinkedIn and a Substack build write-up, and Show HN last [VERIFIABLE][^35][^113][^119][^169]. The cost is a slower start.
- (b) One coordinated day on every channel Sergei named. It spends every channel's first impression at once, before any user feedback, on a product that 7.1 and 7.3 say needs a stated difference [INFERENCE].
- (c) Claude-specific channels only: the directory, the Claude Discord, r/ClaudeAI and r/ClaudeCode, and Anthropic's showcase form [VERIFIABLE][^120]. Skips the Beads audience, which is the exact one.

Recommendation: (a). No precedent in 5.2 grew mainly from a launch-day post, the Beads channels hold the people who can use beads-ui today, and HN rewards a later, better post more than a first one [VERIFIABLE][^139][^142]. Two constraints hold under any option: HN posts must not be "generated text or AI-edited text" [VERIFIABLE][^14], and each subreddit's and Discord server's rules must be read by a person first, because this run could not read them [NO SOURCE].

### D-2: When to launch

`⏳ PENDING (human)`

Options:

- (a) Now, on the mod as it is. Two Show HN posts about mods so far scored 25 and 1, too few to call a base rate [VERIFIABLE][^150], and the catalogue will list beads-ui soon whatever Sergei does [VERIFIABLE][^7]. But the plugin folder has no README, there is no recording, and D-4 is open.
- (b) After a short readiness bar: the plugin README with the `claude plugin validate` output, a recording, three worked uses, D-4 settled, the directory submission filed, and a few Beads users' feedback. On the evidence that is days of work, not weeks [INFERENCE: each item is a document or a recording, not a feature].
- (c) After the MCP app or the web app ships, so one launch reaches claude.ai, other clients and the web as well as the terminal. That trades the mods timing for a wider audience, and the precedents show growth over months either way (5.2).

Recommendation: (b). It answers Sergei's own condition, "when this is in a suitable enough and baseline usable / useful state", with a concrete bar, and keeps the early-mods timing that (c) gives up.

### D-3: Whether and when to submit to Anthropic's directory

`⏳ PENDING (human)`

Options:

- (a) Submit now, after the plugin README lands. The listing is Claude Code only while the plugin holds just a mod [VERIFIABLE][^5]. It puts beads-ui in `/plugin directory` and gives the portal's usage figures from the first install [VERIFIABLE][^4]. A person reviews the first version, with no fixed time [VERIFIABLE][^4].
- (b) Wait until the MCP app ships in the same plugin. A local MCP server loads in Cowork only when the session runs on the user's computer and is ignored in claude.ai chat, so chat reach needs a hosted remote (`http` or `sse`) server, which Anthropic also wants submitted separately as an MCP connector [VERIFIABLE][^4][^5]. beads-ui reads a local `bd` store, so its MCP server is most likely local [INFERENCE]. Updates need no resubmission, so (a) gets the same reach later without a second listing [VERIFIABLE][^3].
- (c) Do not submit; rely on the repository marketplace and community indexes.

Recommendation: (a). The submission's repository and folder cannot change after submitting, and the plugin folder is planned to stay at `plugins/beads-ui` [VERIFIABLE][^3], so nothing in the roadmap invalidates an early listing [INFERENCE: the design keeps the plugin folder fixed and moves only the core]. The cost is one review cycle now.

### D-4: Keep the name beads-ui for listings and posts

`⏳ PENDING (human)`

Sergei chose the name `beads-ui`, so changing it is his call. The evidence on the collision is stronger than the design doc recorded. `mantoni/beads-ui` has 761 stars, sits in the Beads community list as "Run with `npx beads-ui start`", and its npm package had 2,351 downloads in the month to 2026-10-18 [VERIFIABLE][^35][^104][^105]. Every post sends readers to search the name, and the first result in the exact audience is the other project [INFERENCE].

Options:

- (a) Keep `beads-ui` everywhere and set a `displayName` that names the surface, such as "beads-ui for Claude Code". A directory look-alike hold is a delay, not a rejection, but a name another organisation's listed plugin already uses "Blocks" [VERIFIABLE][^18]; no fetched page shows `mantoni/beads-ui` in the directory [NO SOURCE]. Posts must then say up front how it differs from `mantoni/beads-ui`.
- (b) Rename the plugin and marketplace, and optionally the repository, before any listing or post. Today there are 0 stars and no directory installs, so the rename costs least now; after installs, a `renames` entry migrates users, [VERIFIABLE][^2][^23], and GitHub redirects a renamed repository's old URL [HEURISTIC].
- (c) Keep the name and tell the `mantoni/beads-ui` maintainer before listing, with descriptions on both sides that say how the two differ. This is an outward-facing message, so it is Sergei's to send.

Recommendation: (b) if Sergei is open to a new name, because the collision lands in the one audience the launch depends on and the price of renaming only rises; otherwise (a) with (c). No candidate name is proposed here, since the name is his to choose.

## Open Questions

1. Does every accepted directory plugin also join the `claude-community` marketplace, and does that change its telemetry naming? The community repository says each plugin it lists "has been submitted via claude.ai, passed automated security scanning, and been approved for distribution" [VERIFIABLE][^21], which shows the direction of flow but not that every listing is included.
2. Will the directory hold the name `beads-ui` as a look-alike? Only a portal Validate run answers it, and running one is Sergei's act.
3. What do the subreddits beads-ui would post in allow for self-promotion today? reddit.com did not answer this host; the rules must be read by hand before any post.
4. What does the mods catalogue's "reach" badge count? Its method was not read.
5. How does the GitHub MCP Registry choose servers, and does it pull from the official registry? No documented route was found.
6. Does Codex read a Claude-layout plugin manifest itself? The build page says "OpenAI also accepts legacy and Claude-compatible manifests" but names only the marketplace file as a legacy location [VERIFIABLE][^46].
7. How old is Sergei's Hacker News account? Show HN is restricted for new accounts [VERIFIABLE][^15].
8. Which mod-only project, if any, has grown since mods went live on 2026-10-01? None of the precedents here is one.

## Sources

[^1]: poteat. (2026, September 3). [Mods - make Claude 10x more extensible (#91870)](https://github.com/anthropics/claude-code/issues/91870). anthropics/claude-code, GitHub issue, open. Verified accessible (HTTP 200) 2026-10-23. (Origin of mods, October go-live, authors showing mods.)

[^2]: Anthropic. (2026). [Publish and distribute a plugin](https://code.claude.com/docs/en/plugins/publish). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-23. (Distribution routes, release checklist, own marketplace, directory submission summary, versions, renames.)

[^3]: Anthropic. (2026). [Submit your plugin](https://claude.com/docs/plugins/submit). Claude Docs. Verified accessible (HTTP 200) 2026-10-23. (Developer portal steps, private repositories, scans, publish settings, updates, delisting, limits.)

[^4]: Anthropic. (2026). [Publish to the directory](https://claude.com/docs/directory/publish). Claude Docs. Verified accessible (HTTP 200) 2026-10-23. (Who can submit, plugin bundle versus connector, review, retired Console form, what a listing gives.)

[^5]: Anthropic. (2026). [Plugin feature support across platforms](https://claude.com/docs/plugins/platform-support). Claude Docs. Verified accessible (HTTP 200) 2026-10-23. (Component support by app; mods listed for Claude Code; `/plugin directory`.)

[^6]: Anthropic. (2026). [Measure plugin cost and usage](https://code.claude.com/docs/en/plugins/measure). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-23. (No usage reported to authors; third-party names redacted in telemetry.)

[^7]: karanb192. (2026). [awesome-claude-code-mods](https://github.com/karanb192/awesome-claude-code-mods), with [contributing.md](https://github.com/karanb192/awesome-claude-code-mods/blob/main/contributing.md) and [catalogue.md](https://github.com/karanb192/awesome-claude-code-mods/blob/main/catalogue.md). GitHub. Verified accessible (HTTP 200; files, including `data/discovery.json` and `SCANNING.md`, read via the GitHub REST API) 2026-10-23. (6,092 mods, scan rules, seed PRs, Featured nominations, the `baselane-sh/mods` Beads entries, beads-ui in the `deferred` queue.)

[^8]: OpenAI. (2026). [Submit a Claude Code plugin](https://developers.openai.com/plugins/guides/submit-claude-plugin). OpenAI Developers. Verified accessible (HTTP 200, after a 308 from learn.chatgpt.com) 2026-10-23.

[^9]: Agent Plugins. (2026). [Agent Plugins](https://agent-plugins.org/). Verified accessible (HTTP 200) 2026-10-23.

[^10]: hesreallyhim. (2026). [CONTRIBUTING.md](https://github.com/hesreallyhim/awesome-claude-code/blob/main/CONTRIBUTING.md). awesome-claude-code, GitHub. Read via the GitHub REST API (HTTP 200) 2026-10-23; the blob URL under `docs/` returned 404. (Age and star bar, issue form only, human-made recommendations, "Get users" before submitting.)

[^11]: He, H., Yang, H., Burckhardt, P., Kapravelos, A., Vasilescu, B., & Kästner, C. (2025). [Six Million (Suspected) Fake Stars in GitHub: A Growing Spiral of Popularity Contests, Spams, and Malware](https://arxiv.org/abs/2412.13459). arXiv:2412.13459 v2; ICSE 2026. Verified accessible (HTTP 200) 2026-10-23. (StarScout, 2019 to 2024, 2024 surge, under-two-month effect.)

[^12]: Vincent, J. (2025, October 9). [Superpowers: How I'm using coding agents in October 2025](https://blog.fsck.com/2025/10/09/superpowers/). Massively Parallel Procrastination. Verified accessible (HTTP 200) 2026-10-23. (Shipped the morning plugins launched; marketplace install.)

[^13]: Star History. (2026). [Chart: obra/superpowers](https://api.star-history.com/chart?repos=obra/superpowers&type=date). Verified accessible (HTTP 200) 2026-10-23. Values read from an SVG by eye.

[^14]: Y Combinator. (2026). [Hacker News guidelines](https://news.ycombinator.com/newsguidelines.html). Verified accessible (HTTP 200) 2026-10-23.

[^15]: Y Combinator. (2026). [Show HN limits](https://news.ycombinator.com/showlim). Verified accessible (HTTP 200) 2026-10-23.

[^16]: HN Algolia. (2026). [Search: "claude code plugin", show_hn](https://hn.algolia.com/api/v1/search?query=claude%20code%20plugin&tags=show_hn&hitsPerPage=40). Verified accessible (HTTP 200) 2026-10-23.

[^17]: HN Algolia. (2026). [Search: "claude-mem", story](https://hn.algolia.com/api/v1/search?query=claude-mem&tags=story&hitsPerPage=20). Verified accessible (HTTP 200) 2026-10-23.

[^18]: Anthropic. (2026). [Plugin pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist). Claude Docs. Verified accessible (HTTP 200) 2026-10-23. (Blocking and held findings, README and licence, file limits, launchers, mods in `hooks.json`, the security scan.)

[^19]: Anthropic. (2026). [Anthropic's marketplaces](https://code.claude.com/docs/en/plugins/anthropic-marketplaces). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-23. (Official, community and demo marketplaces; the directory is separate; third-party marketplaces are not reviewed.)

[^20]: Anthropic. (2026). [Claude Marketplace: Plugins](https://claude.com/marketplace/plugins). claude.com. Verified accessible (HTTP 200) 2026-10-23. (342 plugins, "Anthropic verified" badges, Submit a plugin link.)

[^21]: Anthropic. (2026). [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community). GitHub. Verified accessible (HTTP 200) 2026-10-23. (Read-only mirror, nightly sync, submission form, PRs closed automatically.)

[^22]: Anthropic. (2026). [clau.de/plugin-directory-submission](https://clau.de/plugin-directory-submission). Short link. Answered HTTP 302 to https://claude.com/docs/directory/publish on 2026-10-23. (The community marketplace's submission route is the directory's.)

[^23]: GitHub. (2026). [Search repositories API](https://docs.github.com/en/rest/search/search#search-repositories), queried for 12 named repositories and for "awesome claude code" and "claude code marketplace directory". GitHub REST API (HTTP 200) 2026-10-23 19:1xZ. (Star, fork, creation-date and topic snapshots; Appendix: Measurements M-6.)

[^24]: Anthropic. (2026). [Manage your listing after publishing](https://claude.com/docs/connectors/building/after-publishing). Claude Docs. Verified accessible (HTTP 200) 2026-10-23. (Usage tab metrics, 90 days, CSV, directory funnel.)

[^25]: karanb192. (2026). [Claude Code mods catalogue](https://mods.aidojo.si/). Verified accessible (HTTP 200) 2026-10-23.

[^26]: Anthropic. (2026). [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-23. (`marketplace.json` fields, plugin and marketplace source types, reserved names.)

[^27]: Anthropic. (2026). [Recommend your plugin from your CLI](https://code.claude.com/docs/en/plugins/cli-hints). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-23. (Hints only for official-named marketplaces; not `claude-community`.)

[^28]: Anthropic. (2026). [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview). Claude Code Docs. Verified accessible (HTTP 200) 2026-10-23. (What a mod is, install, trust, where mods run, sample and built-in mods.)

[^29]: ClaudeMod. (2026). [ClaudeMod](https://www.claudemod.com/). claudemod.com. Verified accessible (HTTP 200) 2026-10-23. (Categories, 172 mods, Submit a Mod, not affiliated with Anthropic.)

[^30]: Claude Marketplaces. (2026). [Claude Marketplaces](https://claudemarketplaces.com/). claudemarketplaces.com. Verified accessible (HTTP 200) 2026-10-23. (Crawled directory, counts, editor sweeps, newsletter.)

[^31]: Poon, D. (2026). [Build with Claude: Plugin Marketplace](https://buildwithclaude.com/). buildwithclaude.com. Verified accessible (HTTP 200) 2026-10-23. (Catalog, counts, `davepoon/buildwithclaude` marketplace.)

[^32]: AI Templates. (2026). [Plugins and marketplaces](https://www.aitmpl.com/plugins/). aitmpl.com. Verified accessible (HTTP 200) 2026-10-23. (34 collections; `davila7/claude-code-templates`.)

[^33]: whyashthakker. (2026). [awesome-claude-code-mods](https://github.com/whyashthakker/awesome-claude-code-mods). GitHub. Verified accessible (HTTP 200) 2026-10-23. (70 bundled and 14 community mods; marketplace add command.)

[^34]: Vercel. (2026). [skills.sh: The Agent Skills Directory](https://skills.sh/). skills.sh. Verified accessible (HTTP 200) 2026-10-23. (Leaderboard, top installs, install command.)

[^35]: Beads contributors. (2026). [Community Tools](https://github.com/gastownhall/beads/blob/main/docs/community-tools.md). gastownhall/beads, GitHub. Read via the GitHub REST API (HTTP 200) 2026-10-23. (Ranked UIs and integrations; `mantoni/beads-ui` under Web UIs; PR or discussion #276 to add a tool.)

[^36]: quemsah. (2026). [awesome-claude-plugins README and crawler searchFamilies.ts](https://github.com/quemsah/awesome-claude-plugins). Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^37]: claude-plugins.dev. (2026). [Claude Code plugins](https://claude-plugins.dev/). Verified accessible (HTTP 200) 2026-10-23.

[^38]: SkillMD. (2026). [SkillMD](https://skillmd.ai/). Verified accessible (HTTP 200) 2026-10-23. (skillmd.ai/submit returned HTTP 502.)

[^39]: OpenClaw. (2026). [ClawHub](https://clawhub.ai/). Verified accessible (HTTP 200) 2026-10-23.

[^40]: OpenClaw. (2026). [skill-format.md](https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md). openclaw/clawhub. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^41]: Skillselion. (2026). [skillselion-plugin README](https://github.com/skillselion/skillselion-plugin). Read via the GitHub contents API (HTTP 200) 2026-10-23. (skillselion.com returned HTTP 403.)

[^42]: VoltAgent. (2026). [CONTRIBUTING.md](https://github.com/VoltAgent/awesome-agent-skills/blob/main/CONTRIBUTING.md). awesome-agent-skills. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^43]: GitHub. (2026). [Repository search: user:VoltAgent awesome](https://api.github.com/search/repositories?q=user:VoltAgent+awesome). GitHub REST API. Verified accessible (HTTP 200) 2026-10-23.

[^44]: composio-community. (2026). [awesome-claude-plugins](https://github.com/composio-community/awesome-claude-plugins). GitHub REST API metadata. Verified accessible (HTTP 200) 2026-10-23.

[^45]: ccplugins. (2026). [awesome-claude-code-plugins](https://github.com/ccplugins/awesome-claude-code-plugins). GitHub REST API metadata. Verified accessible (HTTP 200) 2026-10-23.

[^46]: OpenAI. (2026). [Build plugins](https://developers.openai.com/plugins/build/plugins). OpenAI Developers. Verified accessible (HTTP 200) 2026-10-23. (Root `plugin.json`, `.agents/plugins/marketplace.json`, legacy `.claude-plugin/marketplace.json`, hooks excluded from the public directory.)

[^47]: OpenAI. (2026). [Plugins](https://learn.chatgpt.com/docs/plugins). ChatGPT Learn, reached by a 308 redirect from developers.openai.com/codex/plugins. Verified accessible (HTTP 200) 2026-10-23. (One catalog for ChatGPT and Codex; `/plugins` in Codex CLI.)

[^48]: OpenAI. (2026). [Submit your plugin](https://developers.openai.com/plugins/deploy/submission). OpenAI Developers. Verified accessible (HTTP 200) 2026-10-23.

[^49]: Google. (2026). [Marketplace](https://antigravity.google/docs/marketplace). Antigravity Documentation. Verified accessible (HTTP 200) 2026-10-23.

[^50]: Google. (2026). [Plugins](https://antigravity.google/docs/plugins). Antigravity Documentation. Verified accessible (HTTP 200) 2026-10-23.

[^51]: Google. (2026). [Release extensions](https://geminicli.com/docs/extensions/releasing/). Gemini CLI documentation. Verified accessible (HTTP 200) 2026-10-23. (Gallery crawls the `gemini-cli-extension` topic daily; no submission; Antigravity CLI replacement banner.)

[^52]: GitHub. (2026). [Repository search: topic:gemini-cli-extension](https://api.github.com/search/repositories?q=topic:gemini-cli-extension). GitHub REST API. Verified accessible (HTTP 200) 2026-10-23. (Also used for antigravity-plugin 91, antigravity-extension 37, pi-package 1,733, claude-code-plugin 11,746.)

[^53]: Google. (2026, May 19). [An important update: transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli). Google Developers Blog. Verified accessible (HTTP 200) 2026-10-23.

[^54]: Cursor. (2026). [Plugins](https://cursor.com/docs/plugins). Cursor Docs. Verified accessible (HTTP 200) 2026-10-23.

[^55]: Cursor. (2026). [Marketplace](https://cursor.com/marketplace). Verified accessible (HTTP 200) 2026-10-23.

[^56]: GitHub. (2026). [Finding and installing plugins for GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-finding-installing). GitHub Docs. Verified accessible (HTTP 200) 2026-10-23.

[^57]: GitHub. (2026). [CONTRIBUTING.md](https://github.com/github/awesome-copilot/blob/main/CONTRIBUTING.md). github/awesome-copilot. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^58]: GitHub. (2026). [github/awesome-copilot repository metadata and external.json](https://github.com/github/awesome-copilot). GitHub REST API. Verified accessible (HTTP 200) 2026-10-23.

[^59]: Microsoft. (2026, October 21). [Agent plugins in VS Code](https://code.visualstudio.com/docs/copilot/customization/agent-plugins). Visual Studio Code Docs. Verified accessible (HTTP 200) 2026-10-23.

[^60]: JetBrains. (2026). [Agent skills](https://www.jetbrains.com/help/ai-assistant/agent-skills.html). AI Assistant Help. Verified accessible (HTTP 200) 2026-10-23.

[^61]: OpenCode. (2026). [Ecosystem](https://opencode.ai/docs/ecosystem/). OpenCode Docs. Verified accessible (HTTP 200) 2026-10-23.

[^62]: Pi. (2026). [Packages](https://pi.dev/packages). Verified accessible (HTTP 200) 2026-10-23.

[^63]: badlogic. (2026). [packages.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md). pi-mono. Read via the GitHub contents API (HTTP 200) 2026-10-23. (pi.dev/docs/packages returned HTTP 404.)

[^64]: Kiro. (2026). [Powers registry](https://kiro.dev/powers/). Verified accessible (HTTP 200) 2026-10-23.

[^65]: Kiro. (2026). [Submit a power](https://kiro.dev/powers/submit/). Verified accessible (HTTP 200) 2026-10-23.

[^66]: Zed Industries. (2026). [README](https://github.com/zed-industries/extensions). zed-industries/extensions. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^67]: aaif-goose. (2026). [servers.json](https://github.com/aaif-goose/goose/blob/main/documentation/static/servers.json). goose. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^68]: aaif-goose. (2026). [goose repository metadata](https://github.com/aaif-goose/goose). GitHub REST API (block/goose resolves here). Verified accessible (HTTP 200) 2026-10-23.

[^69]: Amp. (2026). [Plugins](https://ampcode.com/docs/markdown/customize/plugins). Amp Docs. Verified accessible (HTTP 200) 2026-10-23.

[^70]: Amp. (2026). [Skills](https://ampcode.com/docs/markdown/customize/skills). Amp Docs. Verified accessible (HTTP 200) 2026-10-23.

[^71]: Warp. (2026). [Agents documentation text](https://docs.warp.dev/_llms-txt/agents.txt). Warp Docs. Verified accessible (HTTP 200) 2026-10-23. (First 100,000 of 542,969 characters read.)

[^72]: Cline. (2026). [Plugins](https://docs.cline.bot/customization/plugins.md). Cline Docs. Verified accessible (HTTP 200) 2026-10-23.

[^73]: Cognition. (2026). [Windsurf plugin compatibility](https://docs.devin.ai/windsurf/plugins/compatibility). Devin Docs. Verified accessible (HTTP 200, after a 307 from docs.windsurf.com) 2026-10-23.

[^74]: Model Context Protocol. (2026). [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry). GitHub. Verified accessible (HTTP 200) 2026-10-23. (Preview status, API freeze v0.1, publishing through `mcp-publisher`, namespace verification.)

[^75]: Model Context Protocol. (2026). [Quickstart: publish a server](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx). modelcontextprotocol/registry, GitHub. Verified accessible (HTTP 200) 2026-10-23. (Metadata only, `mcpName`, `server.json`, `mcp-publisher login github`, `publish`.)

[^76]: Model Context Protocol. (2026). [Ecosystem vision](https://github.com/modelcontextprotocol/registry/blob/main/docs/design/ecosystem-vision.md). modelcontextprotocol/registry. Verified accessible (HTTP 200) 2026-10-23.

[^77]: Model Context Protocol. (2026). [Registry API v0 servers](https://registry.modelcontextprotocol.io/v0/servers?limit=1). Verified accessible (HTTP 200) 2026-10-23.

[^78]: GitHub. (2026). [About Model Context Protocol](https://docs.github.com/en/copilot/concepts/context/mcp). GitHub Docs. Verified accessible (HTTP 200) 2026-10-23.

[^79]: GitHub. (2026). [MCP Registry](https://github.com/mcp). GitHub. Verified accessible (HTTP 200) 2026-10-23. (604 servers; no listing route stated.)

[^80]: Docker. (2026). [CONTRIBUTING.md](https://github.com/docker/mcp-registry/blob/main/CONTRIBUTING.md). docker/mcp-registry. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^81]: Smithery. (2026). [Publish](https://smithery.ai/docs/build/publish). Smithery Docs. Verified accessible (HTTP 200) 2026-10-23.

[^82]: Smithery. (2026). [Smithery](https://smithery.ai/). smithery.ai. Verified accessible (HTTP 200) 2026-10-23. (27,365+ MCPs, Publish MCP Server, proxy shut down October 31.)

[^83]: Glama. (2026). [MCP servers](https://glama.ai/mcp/servers). glama.ai. Verified accessible (HTTP 200) 2026-10-23. (109,186 servers, grades, claimed and official filters.)

[^84]: Glama. (2026). [MCP server schema](https://glama.ai/mcp/schemas/server.json). Verified accessible (HTTP 200) 2026-10-23.

[^85]: PulseMCP. (2026, September 3). [Submit](https://www.pulsemcp.com/submit). Verified accessible (HTTP 200) 2026-10-23.

[^86]: PulseMCP. (2026). [MCP servers](https://www.pulsemcp.com/servers). pulsemcp.com. Verified accessible (HTTP 200) 2026-10-23. (21,649 servers; submissions paused.)

[^87]: chatmcp. (2025–2026). [Submit Your MCP Servers here (issue 1)](https://github.com/chatmcp/mcpso/issues/1). chatmcp/mcpso. Read via the GitHub API (HTTP 200) 2026-10-23. (mcp.so returned HTTP 403.)

[^88]: mcpservers.org. (2026). [Submit Your MCP Server](https://mcpservers.org/submit). Verified accessible (HTTP 200) 2026-10-23.

[^89]: punkpeye. (2026). [CONTRIBUTING.md](https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md). awesome-mcp-servers. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^90]: Agent Skills. (2026). [Specification](https://agentskills.io/specification). Verified accessible (HTTP 200) 2026-10-23.

[^91]: Kiro. (2026). [Powers](https://kiro.dev/docs/powers/). Kiro Docs. Verified accessible (HTTP 200) 2026-10-23.

[^92]: GitHub. (2026). [gh skill](https://cli.github.com/manual/gh_skill). GitHub CLI Manual. Verified accessible (HTTP 200) 2026-10-23.

[^93]: GitHub. (2026). [gh skill publish](https://cli.github.com/manual/gh_skill_publish). GitHub CLI Manual. Verified accessible (HTTP 200) 2026-10-23.

[^94]: GitHub. (2026). [gh skill search](https://cli.github.com/manual/gh_skill_search). GitHub CLI Manual. Verified accessible (HTTP 200) 2026-10-23.

[^95]: Microsoft. (2026, October 22). [APM](https://microsoft.github.io/apm/). Verified accessible (HTTP 200) 2026-10-23.

[^96]: Microsoft. (2026). [microsoft/apm](https://github.com/microsoft/apm). GitHub REST API metadata. Verified accessible (HTTP 200) 2026-10-23.

[^97]: wshobson. (2026). [ARCHITECTURE.md](https://github.com/wshobson/agents/blob/main/ARCHITECTURE.md). wshobson/agents. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^98]: wshobson. (2026). [Cross-harness capability matrix](https://github.com/wshobson/agents/blob/main/docs/harnesses.md). wshobson/agents. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^99]: Google. (2026). [Migration from Gemini CLI](https://antigravity.google/docs/cli/gcli-migration). Antigravity Documentation. Verified accessible (HTTP 200) 2026-10-23.

[^100]: OpenCode. (2026). [Agent Skills](https://opencode.ai/docs/skills/). OpenCode Docs. Verified accessible (HTTP 200) 2026-10-23.

[^101]: aaif-goose. (2026). [Plugins](https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/context-engineering/plugins.md). goose documentation. Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^102]: NVIDIA. (2026). [agent-package-spec](https://github.com/NVIDIA/agent-package-spec). Read via the GitHub contents API (HTTP 200) 2026-10-23.

[^103]: Anthropic. (2026, April 15). [Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy). Claude Help Center. Verified accessible (HTTP 200) 2026-10-23. (Privacy, disclosure, examples, support contact, no ads, plugin connector exception.)

[^104]: mantoni. (2026). [beads-ui](https://github.com/mantoni/beads-ui). GitHub. Verified accessible (HTTP 200) 2026-10-23.

[^105]: npm. (2026). [Downloads, last month: beads-ui](https://api.npmjs.org/downloads/point/last-month/beads-ui). Verified accessible (HTTP 200) 2026-10-23.

[^106]: Gackle, D. (2026, October 2). [Comment 49938039 on "Show HN: Made an open-source Lego AI generator"](https://hn.algolia.com/api/v1/items/49938039). HN Algolia API. Verified accessible (HTTP 200) 2026-10-23.

[^107]: Y Combinator. (n.d.). [Show HN Guidelines](https://news.ycombinator.com/showhn.html). Hacker News. Verified accessible (HTTP 200) 2026-10-23. (What qualifies, no landing pages, no upvote requests, be present.)

[^108]: HN Algolia. (2026). [Search: "kanban agents", show_hn](https://hn.algolia.com/api/v1/search?query=kanban%20agents&tags=show_hn&hitsPerPage=30). Verified accessible (HTTP 200) 2026-10-23.

[^109]: xAI. (2026). [x-algorithm README](https://github.com/xai-org/x-algorithm/blob/main/README.md). GitHub. Verified accessible (HTTP 200) 2026-10-23.

[^110]: xAI. (2026). [home-mixer/params/param.rs](https://github.com/xai-org/x-algorithm/blob/main/home-mixer/params/param.rs). GitHub. Verified accessible (HTTP 200) 2026-10-23.

[^111]: FxTwitter. (2026). [Profile: Steve_Yegge](https://api.fxtwitter.com/Steve_Yegge). Verified accessible (HTTP 200) 2026-10-23. Third-party X mirror.

[^112]: LinkedIn. (2026). [Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies). Verified accessible (HTTP 200) 2026-10-23.

[^113]: GummySearch. (2026). [r/ClaudeCode](https://gummysearch.com/r/ClaudeCode/). Verified accessible (HTTP 200) 2026-10-23.

[^114]: GummySearch. (2026). [r/ClaudeAI](https://gummysearch.com/r/ClaudeAI/). Verified accessible (HTTP 200) 2026-10-23. Third-party Reddit statistics.

[^115]: GummySearch. (2026). [r/SideProject](https://gummysearch.com/r/SideProject/). Verified accessible (HTTP 200) 2026-10-23.

[^116]: GummySearch. (2026). [r/opensource](https://gummysearch.com/r/opensource/). Verified accessible (HTTP 200) 2026-10-23.

[^117]: Discord. (2026). [Community Guidelines](https://discord.com/guidelines). Verified accessible (HTTP 200) 2026-10-23.

[^118]: Discord. (2026). [Invite 6PPFFzqPDZ, guild "Claude"](https://discord.com/invite/6PPFFzqPDZ), via [the invite API](https://discord.com/api/v9/invites/6PPFFzqPDZ?with_counts=true), reached from anthropic.com/discord. Verified accessible (HTTP 200) 2026-10-23. (approximate_member_count 133,041; presence 25,356.)

[^119]: Yegge, S. (2026). [Medium RSS feed](https://steve-yegge.medium.com/feed). Verified accessible (HTTP 200) 2026-10-23. Posts of 2026-04-03 and 2026-04-24.

[^120]: Anthropic. (2026). [Claude Community](https://claude.com/community). Verified accessible (HTTP 200) 2026-10-23.

[^121]: Anthropic. (2026). [claude-plugins-official README and marketplace.json](https://github.com/anthropics/claude-plugins-official). GitHub. Verified accessible (HTTP 200) 2026-10-23.

[^122]: Anthropic. (2026). [Superpowers plugin page](https://claude.com/plugins/superpowers). Verified accessible (HTTP 200) 2026-10-23.

[^123]: Lobsters. (2026). [About](https://lobste.rs/about). Verified accessible (HTTP 200) 2026-10-23.

[^124]: Lobsters. (2026). [Tag: vibecoding](https://lobste.rs/t/vibecoding). Verified accessible (HTTP 200) 2026-10-23. The story pages and search sat behind Anubis "Access Denied".

[^125]: Product Hunt. (2026). [Launch guide](https://www.producthunt.com/launch). Verified accessible (HTTP 200) 2026-10-23.

[^126]: DEV Community. (2026). [Terms of use](https://dev.to/terms). Verified accessible (HTTP 200) 2026-10-23.

[^127]: DEV Community. (2026). [Tag: claudecode](https://dev.to/t/claudecode). Verified accessible (HTTP 200) 2026-10-23.

[^128]: ryoppippi. (2025, May 29). [How ccusage began (Japanese)](https://ryoppippi.com/blog/2025-05-29-zenn-6c9a8fe6629cd6-ja/). Verified accessible (HTTP 200) 2026-10-23.

[^129]: TLDR. (2026). [TLDR AI](https://tldr.tech/ai). Verified accessible (HTTP 200) 2026-10-23. tldr.tech/ai/submit returned HTTP 404.

[^130]: Ben's Bites. (2026). [Ben's Bites](https://www.bensbites.com/). Verified accessible (HTTP 200) 2026-10-23.

[^131]: Latent Space. (2026). [About](https://www.latent.space/about). Verified accessible (HTTP 200) 2026-10-23.

[^132]: AI Engineer. (2026). [AI Engineer events](https://www.ai.engineer/). Verified accessible (HTTP 200) 2026-10-23.

[^133]: GitHub. (2026). [Trending, weekly](https://github.com/trending?since=weekly). Verified accessible (HTTP 200) 2026-10-23.

[^134]: Vincent, J. (2026, October 9). [What a year](https://blog.fsck.com/2026/10/09/what-a-year/). Verified accessible (HTTP 200) 2026-10-23.

[^135]: HN Algolia. (2026). [Search: "superpowers claude", story](https://hn.algolia.com/api/v1/search?query=superpowers%20claude&tags=story&hitsPerPage=20). Verified accessible (HTTP 200) 2026-10-23.

[^136]: GitHub. (2026). [REST API repository metadata and README contents](https://docs.github.com/en/rest/repos/repos#get-a-repository) for obra/superpowers, thedotmack/claude-mem, gastownhall/beads, ccusage/ccusage, musistudio/claude-code-router, wshobson/agents, hesreallyhim/awesome-claude-code, morluto/rea, sergeiwallace/beads-ui. Read via `ghp api` 2026-10-23.

[^137]: Star History. (2026). [Chart: thedotmack/claude-mem](https://api.star-history.com/chart?repos=thedotmack/claude-mem&type=date). Verified accessible (HTTP 200) 2026-10-23.

[^138]: Yegge, S. (2025, October 13). [Introducing Beads: a coding agent memory system](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a). Medium. Original HTTP 403; read via [Freedium mirror](https://freedium-mirror.cfd/https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a), HTTP 200 2026-10-23.

[^139]: HN Algolia. (2026). [Search: "beads", story](https://hn.algolia.com/api/v1/search?query=beads&tags=story&hitsPerPage=30). Verified accessible (HTTP 200) 2026-10-23.

[^140]: npm. (2026). [Downloads, last month: ccusage](https://api.npmjs.org/downloads/point/last-month/ccusage). Verified accessible (HTTP 200) 2026-10-23.

[^141]: HN Algolia. (2026). [Search: "ccusage", story](https://hn.algolia.com/api/v1/search?query=ccusage&tags=story&hitsPerPage=20). Verified accessible (HTTP 200) 2026-10-23.

[^142]: HN Algolia. (2026). [Search: "claude-code-router", story](https://hn.algolia.com/api/v1/search?query=claude-code-router&tags=story&hitsPerPage=15). Verified accessible (HTTP 200) 2026-10-23.

[^143]: Star History. (2026). [Chart: musistudio/claude-code-router](https://api.star-history.com/chart?repos=musistudio/claude-code-router&type=date). Verified accessible (HTTP 200) 2026-10-23.

[^144]: HN Algolia. (2026). [Search: "wshobson agents", story](https://hn.algolia.com/api/v1/search?query=wshobson%20agents&tags=story&hitsPerPage=15). Verified accessible (HTTP 200) 2026-10-23.

[^145]: Star History. (2026). [Chart: wshobson/agents](https://api.star-history.com/chart?repos=wshobson/agents&type=date). Verified accessible (HTTP 200) 2026-10-23.

[^146]: Star History. (2026). [Chart: hesreallyhim/awesome-claude-code](https://api.star-history.com/chart?repos=hesreallyhim/awesome-claude-code&type=date). Verified accessible (HTTP 200) 2026-10-23.

[^147]: zenbu-labs. (2026). [terminal-browser](https://github.com/zenbu-labs/terminal-browser). GitHub. Verified accessible (HTTP 200) 2026-10-23.

[^148]: Star History. (2026). [Chart: zenbu-labs/terminal-browser](https://api.star-history.com/chart?repos=zenbu-labs/terminal-browser&type=date). Verified accessible (HTTP 200) 2026-10-23.

[^149]: HN Algolia. (2026). [Search: "terminal-browser", story](https://hn.algolia.com/api/v1/search?query=terminal-browser&tags=story&hitsPerPage=10). Verified accessible (HTTP 200) 2026-10-23.

[^150]: HN Algolia. (2026). [Search by date: "claude code mod", show_hn](https://hn.algolia.com/api/v1/search_by_date?query=claude%20code%20mod&tags=show_hn&hitsPerPage=30). Verified accessible (HTTP 200) 2026-10-23.

[^151]: GitHub. (2026). Repository metadata for [charmbracelet/vhs](https://github.com/charmbracelet/vhs) and [asciinema/asciinema](https://github.com/asciinema/asciinema). Read via `ghp api` 2026-10-23.

[^152]: Agentic AI Foundation. (2026). [AGENTS.md](https://agents.md/). Verified accessible (HTTP 200) 2026-10-23.

[^153]: Howard, J. (2026). [llms.txt](https://llmstxt.org/). Verified accessible (HTTP 200) 2026-10-23.

[^154]: Upstash. (2026). [Adding libraries](https://context7.com/docs/adding-libraries). Context7 Docs. Verified accessible (HTTP 200) 2026-10-23.

[^155]: GitHub. (2026). [Classifying your repository with topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics). GitHub Docs. Verified accessible (HTTP 200) 2026-10-23. (Topics aid discovery; at most 20, 50 characters each.)

[^156]: GitHub and contributors. (n.d.). [Finding Users for Your Project](https://opensource.guide/finding-users/). Open Source Guides. Verified accessible (HTTP 200) 2026-10-23. Background source, undated. (Clear message, one home URL, go where the audience is, reputation.)

[^157]: GitHub. (2026). [Viewing traffic to a repository](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository). GitHub Docs. Verified accessible (HTTP 200) 2026-10-23.

[^158]: GitHub. (2026). [REST API endpoints for repository traffic](https://docs.github.com/en/rest/metrics/traffic). GitHub Docs. Verified accessible (HTTP 200) 2026-10-23.

[^159]: GitHub. (2026). [Traffic API: sergeiwallace/beads-ui views and clones](https://api.github.com/repos/sergeiwallace/beads-ui/traffic/clones). Read via `ghp api` with the owner's token 2026-10-23; needs write access.

[^160]: Vincent, J. (2026). [Superpowers README](https://github.com/obra/superpowers/blob/main/README.md). GitHub. Verified accessible (HTTP 200) 2026-10-23.

[^161]: Marchetti, E. (2026, April 13). [Inside GitHub's fake star economy](https://awesomeagents.ai/news/github-fake-stars-investigation/). Awesome Agents. Verified accessible (HTTP 200) 2026-10-23.

[^162]: Krebs, A. (2026, April 20). [Scoring Show HN submissions for AI design patterns](https://www.adriankrebs.ch/blog/design-slop/). Verified accessible (HTTP 200) 2026-10-23.

[^163]: claudescode.dev. (2026). [Claude Code activity, since launch](https://www.claudescode.dev/?window=since_launch). Verified accessible (HTTP 200) 2026-10-23.

[^164]: HN Algolia. (2026). [Search: "github stars", story, points > 100, since 2024](https://hn.algolia.com/api/v1/search?query=github%20stars&tags=story&hitsPerPage=25&numericFilters=created_at_i>1704067200,points>100). Verified accessible (HTTP 200) 2026-10-23.

[^165]: Firecrawl. (2026, October 6). [Claude Mods: What They Are and How to Build One in TypeScript](https://www.firecrawl.dev/blog/claude-mods). Firecrawl Blog. Verified accessible (HTTP 200) 2026-10-23. (Built-in mods, issue #91870 as an index, community mods.)

[^166]: Claude. (2026). [Mods in Claude Code: change how Claude Code works](https://www.youtube.com/watch?v=yUuFvL1lK4k). YouTube. Title and channel verified through YouTube oEmbed (HTTP 200) 2026-10-23; the watch page did not render its content. (Seed-cited video.)

[^167]: Shvaya, I. (2026, October 14). [Claude Code plugins and marketplaces: sharing a team's setup safely](https://eseospace.com/blog/claude-code-plugins-and-marketplaces/). eSEOspace Blog. Verified accessible (HTTP 200) 2026-10-23. (Directory submission summary; no personal web-to-terminal sync described.)

[^168]: Chavez-Mattos, L. (2026, October 20). [7 Claude Code Mods That Actually Fix Real Workflow Problems](https://www.mindstudio.ai/blog/claude-code-mods-guide). MindStudio Blog. Verified accessible (HTTP 200) 2026-10-23. (Install pattern; no registry named; playground marketplace.)

[^169]: Beads contributors. (2026). [.claude-plugin/marketplace.json](https://github.com/gastownhall/beads/blob/main/.claude-plugin/marketplace.json). gastownhall/beads, GitHub. Read via the GitHub REST API (HTTP 200) 2026-10-23. (`beads-marketplace`, one plugin, `beads` 1.3.0.)

[^170]: Substack. (2026). [Terms of Use and Acceptable Use Policy](https://substack.com/tos). Verified accessible (HTTP 200) 2026-10-23. (Auto-responder and spam ban.)

[^171]: GitHub and contributors. (n.d.). [Building Welcoming Communities](https://opensource.guide/building-community/). Open Source Guides. Verified accessible (HTTP 200) 2026-10-23. Background source, undated. (CONTRIBUTING, beginner issues, responsiveness, credit.)

<!-- /doc:region name="body" -->

<!-- doc:region name="ambiguous_items" kind="replaceable" -->

## Ambiguous Items from Auto-Remediation (Post-Run Review)

(none yet; auto-populated by verify_and_remediate node)

<!-- /doc:region name="ambiguous_items" -->

<!-- doc:region name="appendix_research_prompt" kind="immutable" -->

## Appendix: Research Prompt

**Registry ID:** not registered. The run's scope bound it to this one deliverable, so no entry was added to `docs/research/prompts/research-prompt-registry.md`.
**Model:** `us.anthropic.claude-opus-5-5[1m]` (coordinator and all three legs)
**Date:** 2026-10-23

The run had four prompts: the coordinator's task, set by its launcher, and the three leg briefs the coordinator wrote. Each leg's launch prompt also carried, inline, the founding-ask carrier, the alignment obligation and the destructive-operation floor shown in the first brief; legs 2 and 3 read the rest of their brief from a file. The time stamps "19:05-19:50 UTC" and "19:45" and "19:50" inside the leg briefs were wrong when written: the coordinator's fetches ran from 19:04Z and leg 1 launched at about 19:14Z. The briefs are reproduced as sent.

````text
=== Coordinator task (from the launcher's filled orchestrator prompt, TASK block) ===
Objective: One research doc that answers the founding-ask excerpt in the carrier above: every registry, marketplace and directory for Claude Code plugins and mods and for other AI clients (Codex, Gemini CLI, Antigravity, MCP registries, Anthropic's official directory), how to publish and list on each (manifests, submission, review), best practices, and how to publicise open-source packages and agentic AI tooling for community adoption (Twitter, LinkedIn, Substack, subreddits, Discord servers and more). The Google AI mode answer quoted in the excerpt is a SEED to verify and go beyond, never a source to cite as fact: re-fetch every URL it names.
Success criteria: the doc names every registry and directory found with its URL (fetched this run), what it lists, how to submit, its review process and its reach signal; a step-by-step publishing path for a Claude Code plugin marketplace repo; an adoption playbook for OSS agentic AI tooling with cited precedents; the seed's claims each marked confirmed, corrected or unverified; every cited URL fetched in this run; decisions that are Sergei's (which channels, when to launch) written as open decisions with options and a recommendation.
Scope boundaries: no publishing, posting, registering or submitting anything anywhere; no accounts or repos; no other doc edited; no tests, builds or pytest; at most one research leg alive at a time; WebSearch unavailable (Bedrock), so WebFetch on primary sources and `ghp api` read-only for discovery.

=== Leg 1 brief (bx-reg-leg-clients), launched with the carrier, stage framing, floor and scope inline ===
## FOUNDING ASK — fidelity tier 2

canonical_root_json: {"blob_oid":"66af21d3eb6840c3551bc547aa15c19b12d383ce","capture_commit":"8862c2570993a60c7492599cb4f762fc7b70dece","content_sha256":"061c246d34d310dddf697cd3502a8e5943d9c9f4566e5e3be6e7baf7acb4bfbe","entry_ids":["A001"],"generation":1,"path":"docs/asks/BU-epic-agentic-ai-native-beads-ylx.md","previous_ref_sha256":null,"repository":"ai-harness","schema_version":1,"task_id":"BU-epic-agentic-ai-native-beads-ylx"}
founding_ask_ref_sha256: d669898b4dc8a8a75f8791637da4f88d1f517b29ef5f9025c186d997debe04a7
resolved_record_path: /data/projects/ai-harness/.worktrees/ops-vm-3/docs/asks/BU-epic-agentic-ai-native-beads-ylx.md
relevant_verbatim_excerpts_incomplete:
```text
also, on the topic of open source public registries / central open source marketplaces / listing repositories for claude code mods / plugins, here's what google ai mode said (use this as a starting point / seed for forther /orchestrate /research-doc (including the other /delegate opus 5.5 /research-doc --refine earlier) to research all this stuff as appropriate and remember to do citation validation and claim provenance and adversarial critical review and go beyond just what the google ai mode output found, so do further breadth and depth exploratory deep dive resaech on all this and how to publish / register to these surfaces and best practies etc and also how to publicize open source packages / plugins / tooling etc to get community adoption for open source software in general and agentic ai apps / tooling / plugins etc in particular. when this is in a suitable enough and baseline usable / useful state, i can share it my twitter and linkedin and substack and relevant sub-reddits and relevant discord servers and whatever other surfaces to share and try to gain traction and adoption from agentic ai coding developers and others).
```

## STAGE FRAMING — non-authoritative

You are research leg 1 of 3 in an Opus coordinator's /research-doc run (beads-ui research issue "Research: Claude Code and AI plugin registries and marketplaces, how to publish and list, and how to grow adoption of open-source agentic AI tooling"). The coordinator authors the research doc; you gather and verify evidence and return findings. Your slice is the registries, marketplaces and directories for AI clients OTHER than the Claude Code core channels, plus the cross-client package formats. The coordinator already fetched (2026-10-23 19:05-19:40 UTC) and does NOT need again: Anthropic's three marketplaces, the claude.ai directory and developer portal, claude-plugins-community, claude.com/marketplace/plugins, the mods overview, claudemod.com, claudemarketplaces.com, buildwithclaude.com, aitmpl.com, karanb192 and whyashthakker awesome-claude-code-mods, hesreallyhim/awesome-claude-code CONTRIBUTING, skills.sh home, the official MCP Registry repo and quickstart, Smithery home, Glama directory home, PulseMCP servers page, github.com/mcp, github/awesome-copilot README, geminicli.com releasing page, learn.chatgpt.com/docs/plugins. Do not re-fetch those unless a claim of yours depends on a detail beyond what is listed here.

The product being published: beads-ui (github.com/sergeiwallace/beads-ui, MIT), a Beads task manager that today ships one Claude Code mod (a plugin with a TypeScript hooks module) from its own repo marketplace; an MCP UI app for Claude Desktop/claude.ai and a web app are planned. Read /data/projects/beads-ui/.worktrees/ops-vm-3-agents/bx-registry-research/README.md for one minute of context.

## ALIGNMENT OBLIGATION

Read every raw ask entry. Compare both the produced artifact and exact proposed successor brief; surface dropped, narrowed, broadened, rejected, deferred, or unverified requirements with evidence.

## DESTRUCTIVE-OPERATION FLOOR (binding)

These bounds hold for every step of this task. They are not advisory, and nothing in the
stage framing above relaxes them. If a bound blocks the task, stop and report rather than
working around it.

- **Never `pkill` or `killall` on a pattern.** Kill one specific PID, or a whole process
  group by its pgid. A pattern kill has already taken out processes beyond its intent and
  caused a host-wide incident.
- **No `rm -rf`. No destructive or irreversible operation.**
- **Confirm every deletion against the actual target before it runs**, and look at what you
  are about to overwrite before you overwrite it.
- **Keep your scratch in your own `mktemp -d` directory or your worktree**, never under your
  launcher's session-name prefix in a shared directory such as `/tmp`; remove it with
  `rm -r <that dir>`. A glob over such a prefix once deleted a launcher's own files.
- **No `sysctl`, and no edit anywhere under `/etc`.**
- **Never print secrets, ever, including indirectly** -- a file redirect, a throwaway
  subshell or shell tracing (`-x`, `set -x`, `setopt xtrace`) is not a loophole. Safe: `[[ -n "${KEY:-}" ]] && echo set`.
- **Never set `HTTP_PROXY` or `HTTPS_PROXY`.**
- **`uv` only; never `pip install` anywhere.**
- **Never `--no-verify`.**

## 1. Objective

Find and verify every registry, marketplace, gallery and directory where a developer can list a plugin, extension, skill or MCP server for these AI clients, and how to publish to each: OpenAI Codex and ChatGPT plugins (the OpenAI submission flow), Google Antigravity and Antigravity CLI (which replaced Gemini CLI for unpaid users on 2026-06-18, per geminicli.com), Gemini CLI extensions gallery, Cursor Marketplace, VS Code Agent Plugins and the awesome-copilot marketplace (its CONTRIBUTING/AGENTS rules for external plugins), GitHub's `gh skill` commands, the Agent Skills spec and Agent Plugins 1.0 format, JetBrains, OpenCode, Pi (pi.dev/packages), Kiro, Amp, Zed, Goose, Warp, Cline, Windsurf, and the MCP directories (official MCP Registry sub-registries, GitHub MCP Registry listing route, Docker MCP Catalog, mcp.so, mcpservers.org, LobeHub, Smithery publish route, Glama add/claim route, PulseMCP submission status), plus Claude-side community indexes not in the list above (quemsah/awesome-claude-plugins, claude-plugins.dev, SkillMD, ClawHub, mods.aidojo.si, Skillselion, VoltAgent lists, composio-community/awesome-claude-plugins, ccplugins). Also find cross-client publishing tools (Microsoft APM, wshobson/agents multi-harness marketplace pattern) and whether one repo can serve Claude Code, Codex, Cursor and Copilot at once.

## Scope note — questions, examples, and named references are a starting point, not a checklist
The questions, topics, and named examples below are illustrative anchors and a FLOOR for this
research — not an exhaustive list to answer only or evaluate only. Reason independently: survey the
landscape broadly, follow the evidence where it leads, expand scope where warranted, and surface
relevant work, factors, and failure modes not named here. Actively resist answering only the listed
questions or evaluating only the named approaches — an output that merely fills in the listed items
has NOT met the research goal.

## Independent exploration (gaps, blindspots, emergent threads) — required
Treat the question list as a FLOOR, not a ceiling. As you research, actively surface what this
framing may be missing and pursue each promising thread to a logical conclusion:
- Adjacent or upstream factors the questions don't capture.
- Contrarian / disconfirming evidence — report it even when it challenges the premise.
- Emerging 2025–2026 practices, tools, or research not anchored by the named examples.
- Known failure modes and second-order effects.
Whenever a load-bearing thread surfaces mid-research, follow it to its conclusion and report it in a
dedicated "Gaps, blindspots & emergent findings" subsection. Explicitly NAME any blindspot you
suspect but cannot resolve (and why) rather than omitting it. Anchor bias — over-fitting to the
listed questions and example approaches — is a known failure mode; counter it deliberately and say
where you did.

## Retrieval enforcement
For each load-bearing claim make at least one WebFetch (or `ghp api` read) call in this session; never return [VERIFIABLE] without a URL you fetched in this session. Do not stop after one round: if no source is found for a sub-question, try alternate URLs (official docs index files such as /llms.txt, GitHub repos via `ghp api repos/<o>/<r>/contents/<path> -H 'Accept: application/vnd.github.raw'`, `ghp api -X GET search/repositories -f q=...`) before tagging it [NO SOURCE]. WebSearch is unavailable on this host and DuckDuckGo returns a bot challenge, so use known doc URLs, llms.txt indexes and `ghp api` search for discovery. reddit.com is unreachable from WebFetch here.

```text
<grounding_instructions>
You are a developer-relations engineer who has shipped and listed developer tools on the VS Code Marketplace, npm, PyPI and the MCP Registry, and who audits plugin ecosystems for a living. You have strong opinions backed by evidence. When you cannot find a source, you say so explicitly.

Temporal scope: Weight sources by recency — 2026 (primary) → 2025 → 2024.
Pre-2024 sources are background context only unless foundational to the topic.
If post-2024 literature is genuinely sparse for a subtopic, state
"[subtopic]: no significant post-2024 developments found" rather than
backfilling with older sources. Backfilling is a failure mode, not a hedge.

Before generating your final output, execute a Chain-of-Verification (CoVe)
to ensure factual fidelity over compliance.

Inside your thought process:
1. Isolate the core facts required.
2. Draft a tentative response.
3. Hostile Cross-Examination: flag any claim where you are citing a source because
   the prompt implied you should, rather than because you verified it.
4. Strip away any claim that cannot be empirically verified.

When generating your final output, classify every major claim. Write your rationale
before appending the tag — writing the tag first causes post-hoc rationalization.
Rationale → evidence check → tag.

- [VERIFIABLE]: backed by documentation, peer-reviewed research, or official
  tech blogs (2024–2026). Carry an inline footnote ref to the source: [VERIFIABLE][^N].
- [HEURISTIC]: widely accepted best practice without a specific citation.
- [INFERENCE]: a logical conclusion drawn from context. Provide your reasoning
  in-text. Do not fabricate a source. Tier tag only — NO footnote ref.
- [NO SOURCE]: explicitly state when you cannot find verifiable data. Tier tag
  only — NO footnote ref.

Citation format (mandatory for every externally-sourced claim):
- Inline: append the GFM footnote ref directly after the tier tag — [VERIFIABLE][^N].
  A claim citing multiple sources carries ascending separate refs — [VERIFIABLE][^3][^7]
  (never grouped [^3,^7]; never out of order).
- Footnote definitions live once, under ## Sources, in APA form with a clickable
  URL or DOI and an access-verification stamp. Worked example:
    [^1]: LangChain. (2026). [Threads](https://docs.langchain.com/langsmith/threads).
    LangSmith Documentation. Verified accessible (HTTP 200) 2026-06-03. (Scope note.)
- URL-or-DOI ALWAYS: every source entry carries a clickable URL or a doi.org link —
  paywalled/gated is fine (link it anyway; stamp the access status). Only the
  truly-irreducible case (no online catalog presence anywhere) gets an explicit
  [no online source located] marker with a one-line justification.
- Integrity: footnote refs are contiguous from [^1], every [^N] ref has a matching
  definition, and every definition is referenced — no gaps, no orphans.
- [INFERENCE] / [NO SOURCE] claims carry the tier tag with NO footnote ref.

Hard constraint (overrides all formatting preferences): never invent a citation
to satisfy a formatting instruction. Accuracy > completeness.

When evaluating an externally sourced idea, feature, repository, package, tool, or pattern for
adoption, apply `docs/procedures/source-vetting-and-corroboration.md`: record concrete
adoption/maintenance signals or independently corroborate the underlying pattern. If neither
route passes, call it exploratory rather than an established best practice.

Format architecture, workflow, sequence, data-flow, and lifecycle/state diagrams with the
`archify` skill by default. Named Mermaid exception: a teammate-visible document reviewed on GitHub
uses a Mermaid fence for an inline, reviewable diagram because GitHub displays Archify HTML as
source; it may additionally link the Archify HTML for exploration. An architecture diagram instead embeds its `archify_print` SVG, which GitHub renders.
Everything else uses Archify.
Format math using LaTeX. Never use ASCII diagrams.
NEVER generate binary images.

<!-- doc:writing-rules:mirror:begin -->
Writing rules: answer first, no preamble. Plain sentences. No em dashes, snappy or punchy lines,
rule-of-three padding, bolded verdict openers or hedging words. No private dev-tracking ids in
anything others see. Opus 5.5: no bold lead-in labels, no three-part lists, no hedges.
Fable 5.1: one idea per paragraph, no sentence over 25 words, no metaphor for a plain statement.
Also for Fable 5.1: define every label once, no arrow chains, quote or cite every borrowed passage.
Before you report, run the pre-ship pass in `docs/procedures/ai-writing-anti-patterns.md` over what
you wrote. A model that did not write a passage reviews it.
<!-- doc:writing-rules:mirror:end -->
</grounding_instructions>
```

## 2. Context / inputs

Repo facts (measured 2026-10-23 19:45 UTC): beads-ui marketplace name `beads-ui`, plugin `beads-ui` version 0.1.1, at `plugins/beads-ui`; GitHub repo sergeiwallace/beads-ui. Prior fleet research you may read (read-only) for background, not as evidence: /data/projects/ai-harness/docs/research/cc-plugin-harness-landscape-survey.md section 4.8 (lines 693-762, a 2026-09-07 channel survey: Agent Plugins 1.0, awesome-copilot, Cursor, APM, SkillMD, ClawHub). Re-fetch anything you carry forward from it; its claims are six weeks old.

These repo facts are a snapshot taken at the times stamped above. Re-verify anything load-bearing against `origin/main` before acting on it; if it has moved, say so and work from what you measured, not from this brief.

## 3. Output contract

Write your full findings to the evidence file `scratchpad/leg-clients-findings.md` inside your worktree (path below), and write it incrementally: create it after your first five fetches and append as you go, so the coordinator can read partial progress between its own steps. Shape:

1. A table, one row per surface: name | URL fetched | client(s) | what it lists | how to get listed (exact mechanism: form URL, PR, topic, CLI command, crawler) | review process | reach signal (a number from the page, with its date) | tag + footnote.
2. "Publishing mechanics" notes per surface where the steps are non-obvious (manifest file names, commands quoted verbatim).
3. "Gaps, blindspots & emergent findings".
4. "Flagged for coordinator": up to 8 items you could not resolve, each with the raw excerpt and URL.
5. `## Sources` with APA footnote definitions per the grounding block, each stamped "Verified accessible (HTTP 200) 2026-10-23" or with the actual status.

Your final message: at most 350 words: the evidence file's absolute path, the count of surfaces covered, the count of URLs fetched and how many failed, the 5 findings most likely to change a publishing plan, and the flagged items' one-line titles.

## 4. Tools and scope

You are read-only research. Allowed: WebFetch, `ghp api` GET calls (read-only GitHub API; never a POST, PATCH, PUT or DELETE, never `ghp issue`/`ghp pr` create or comment), Read/Grep/Glob on local files. Never run raw `curl` or `wget` (this host gates every such command on a human). Never post, submit, register, star, comment or sign up anywhere. No tests, builds or pytest. Never run pytest with `--showlocals` or `-l`, and never print a process environment.

Writable repos (one isolated worktree each — no repo may be written via its main tree):
- ai-harness: /data/projects/ai-harness/.worktrees/ops-vm-3-agents/bx-reg-leg-clients

Never commit against a repo's main working tree. Write only inside the worktree paths listed above; if the work requires a repo not listed, stop and report it rather than editing that repo's main tree — that races any session live there and silently loses work.

Write only the evidence file. Do not commit it; the coordinator reads it in place and folds it into its doc.

You are a leaf: do NOT spawn sub-agents. A long fetch is not a reason to idle: do the next piece of your own work; never `sleep`-poll, and never end a turn with nothing to do.

## 5. Boundaries and definition of done

Done when the evidence file covers every named surface (or says why one could not be reached), every [VERIFIABLE] row cites a URL fetched this session, and the final message is sent. Out of scope: the adoption and promotion playbook (another leg), the Claude Code core channels listed in the stage framing, any public act.

Delegated execution provenance (for reference; you make no commit): Delegated-to: claude/researcher; tier: opus; model: us.anthropic.claude-opus-5-5[1m]; effort: high; persona: auditor profile used as a read-only research leaf (no Agent tool); worktree: /data/projects/ai-harness/.worktrees/ops-vm-3-agents/bx-reg-leg-clients; launch name: bx-reg-leg-clients.

## 6. Failure and escalation

If a surface's page will not load after two alternate URLs, record it as unreachable with the error text and move on. If you need the coordinator's answer mid-run, load SendMessage with ToolSearch (`select:SendMessage`) and send to "main"; if the tool will not load, put the question in your final message.

=== Leg 2 brief (bx-reg-leg-adoption), read from file; carrier, floor and scope were inline in the launch prompt ===
## Leg 2 task brief (the carrier, floor and alignment blocks are inline in your launch prompt)

## 1. Objective

Build the evidence base for an adoption playbook: how to publicise an open-source developer tool so that agentic AI coding developers find, try and keep using it, in general and for agentic AI tooling and Claude Code plugins in particular. The product is beads-ui (github.com/sergeiwallace/beads-ui, MIT, 0 stars, public since 2026-10-14, measured 2026-10-23 19:45 UTC): a Beads task board that runs inside the Claude Code terminal as a mod (Claude Code mods went live in October 2026). The owner plans to share it on Twitter/X, LinkedIn, Substack, relevant subreddits and relevant Discord servers. Cover each of those channels and every other credible one (Hacker News Show HN, Lobsters, Product Hunt, dev.to, newsletters such as TLDR AI, Ben's Bites, Latent Space, Simon Willison's weblog and "This week in Claude", YouTube creators, podcasts, conferences and meetups, Anthropic community programs and showcases, GitHub trending, the Beads project's own community channels, awesome lists). For each: audience fit, the channel's own rules on self-promotion (quote them), what a post that works there looks like, and evidence of results.

Also cover: launch sequencing and timing (riding a platform launch, a soft launch before a big one), README and demo practice (GIFs, one-line install, quickstart), agent-era discoverability (llms.txt, AGENTS.md, Context7, skills.sh find-skills, being installable by an agent), measuring adoption (GitHub traffic API, directory Usage tab, install counters versus real use), community building after launch (issues, discussions, Discord), and the contrarian evidence (fake stars, star counts versus usage, self-promotion bans, AI-slop fatigue, launch posts that backfired).

Find documented precedents with numbers: how Superpowers (obra, launched the day Claude Code plugins shipped, 2025-10-09), claude-mem, ccusage, claude-code-router, Beads itself (Steve Yegge's posts), wshobson/agents, awesome-claude-code and the zenbu-labs terminal-browser mod grew. Prefer the author's own launch write-ups and star-history data you can fetch.

## Scope note — questions, examples, and named references are a starting point, not a checklist
The questions, topics, and named examples below are illustrative anchors and a FLOOR for this
research — not an exhaustive list to answer only or evaluate only. Reason independently: survey the
landscape broadly, follow the evidence where it leads, expand scope where warranted, and surface
relevant work, factors, and failure modes not named here. Actively resist answering only the listed
questions or evaluating only the named approaches — an output that merely fills in the listed items
has NOT met the research goal.

## Independent exploration (gaps, blindspots, emergent threads) — required
Treat the question list as a FLOOR, not a ceiling. As you research, actively surface what this
framing may be missing and pursue each promising thread to a logical conclusion:
- Adjacent or upstream factors the questions don't capture.
- Contrarian / disconfirming evidence — report it even when it challenges the premise.
- Emerging 2025–2026 practices, tools, or research not anchored by the named examples.
- Known failure modes and second-order effects.
Whenever a load-bearing thread surfaces mid-research, follow it to its conclusion and report it in a
dedicated "Gaps, blindspots & emergent findings" subsection. Explicitly NAME any blindspot you
suspect but cannot resolve (and why) rather than omitting it. Anchor bias — over-fitting to the
listed questions and example approaches — is a known failure mode; counter it deliberately and say
where you did.

## Retrieval enforcement
For each load-bearing claim make at least one WebFetch (or `ghp api` read) call in this session; never return [VERIFIABLE] without a URL you fetched in this session. Do not stop after one round: if no source is found, try alternate URLs (official help centres, GitHub repos via `ghp api repos/<o>/<r>/contents/<path> -H 'Accept: application/vnd.github.raw'`, `ghp api -X GET search/repositories -f q=...`, the HN Algolia API at https://hn.algolia.com/api/v1/search?query=...&tags=show_hn) before tagging it [NO SOURCE]. WebSearch is unavailable on this host, DuckDuckGo returns a bot challenge, and reddit.com, old.reddit.com and redditinc.com are unreachable from WebFetch here: find subreddit rules through another fetchable copy (a subreddit wiki mirror, a GitHub-hosted copy, a moderator post quoted on a fetchable site) or tag them [NO SOURCE] and say so.

Already fetched by the coordinator (2026-10-23 19:05-19:50 UTC), do not redo: news.ycombinator.com/showhn.html; arxiv.org/abs/2412.13459 (Six Million (Suspected) Fake Stars in GitHub, ICSE'26); opensource.guide/finding-users; blog.fsck.com/2025/10/09/superpowers; GitHub docs on repository topics; the Claude Discord invite (guild "Claude", about 133,000 members); hesreallyhim/awesome-claude-code CONTRIBUTING (14 days old or 100 stars, web issue form only, human-made recommendations only); gastownhall/beads docs/community-tools.md (open a PR or comment on discussion #276). The Medium post "Introducing Beads" returned HTTP 403; try another route.

```text
<grounding_instructions>
You are a developer-relations lead who has launched open-source developer tools that reached thousands of GitHub stars, who has run Show HN and Product Hunt launches, moderated developer subreddits and Discord servers, and who distrusts vanity metrics. You have strong opinions backed by evidence. When you cannot find a source, you say so explicitly.

Temporal scope: Weight sources by recency — 2026 (primary) → 2025 → 2024.
Pre-2024 sources are background context only unless foundational to the topic.
If post-2024 literature is genuinely sparse for a subtopic, state
"[subtopic]: no significant post-2024 developments found" rather than
backfilling with older sources. Backfilling is a failure mode, not a hedge.
[Broadened for this leg: foundational OSS-marketing sources from before 2024 may be cited as background when no newer source covers the point; label them background.]

Before generating your final output, execute a Chain-of-Verification (CoVe)
to ensure factual fidelity over compliance.

Inside your thought process:
1. Isolate the core facts required.
2. Draft a tentative response.
3. Hostile Cross-Examination: flag any claim where you are citing a source because
   the prompt implied you should, rather than because you verified it.
4. Strip away any claim that cannot be empirically verified.

When generating your final output, classify every major claim. Write your rationale
before appending the tag — writing the tag first causes post-hoc rationalization.
Rationale → evidence check → tag.

- [VERIFIABLE]: backed by documentation, peer-reviewed research, or official
  tech blogs (2024–2026). Carry an inline footnote ref to the source: [VERIFIABLE][^N].
- [HEURISTIC]: widely accepted best practice without a specific citation.
- [INFERENCE]: a logical conclusion drawn from context. Provide your reasoning
  in-text. Do not fabricate a source. Tier tag only — NO footnote ref.
- [NO SOURCE]: explicitly state when you cannot find verifiable data. Tier tag
  only — NO footnote ref.

Citation format (mandatory for every externally-sourced claim):
- Inline: append the GFM footnote ref directly after the tier tag — [VERIFIABLE][^N].
  A claim citing multiple sources carries ascending separate refs — [VERIFIABLE][^3][^7]
  (never grouped [^3,^7]; never out of order).
- Footnote definitions live once, under ## Sources, in APA form with a clickable
  URL or DOI and an access-verification stamp. Worked example:
    [^1]: LangChain. (2026). [Threads](https://docs.langchain.com/langsmith/threads).
    LangSmith Documentation. Verified accessible (HTTP 200) 2026-06-03. (Scope note.)
- URL-or-DOI ALWAYS: every source entry carries a clickable URL or a doi.org link —
  paywalled/gated is fine (link it anyway; stamp the access status). Only the
  truly-irreducible case (no online catalog presence anywhere) gets an explicit
  [no online source located] marker with a one-line justification.
- Integrity: footnote refs are contiguous from [^1], every [^N] ref has a matching
  definition, and every definition is referenced — no gaps, no orphans.
- [INFERENCE] / [NO SOURCE] claims carry the tier tag with NO footnote ref.

Hard constraint (overrides all formatting preferences): never invent a citation
to satisfy a formatting instruction. Accuracy > completeness.

When evaluating an externally sourced idea, feature, repository, package, tool, or pattern for
adoption, apply `docs/procedures/source-vetting-and-corroboration.md`: record concrete
adoption/maintenance signals or independently corroborate the underlying pattern. If neither
route passes, call it exploratory rather than an established best practice.

Format architecture, workflow, sequence, data-flow, and lifecycle/state diagrams with the
`archify` skill by default. Named Mermaid exception: a teammate-visible document reviewed on GitHub
uses a Mermaid fence for an inline, reviewable diagram because GitHub displays Archify HTML as
source; it may additionally link the Archify HTML for exploration. An architecture diagram instead embeds its `archify_print` SVG, which GitHub renders.
Everything else uses Archify.
Format math using LaTeX. Never use ASCII diagrams.
NEVER generate binary images.

<!-- doc:writing-rules:mirror:begin -->
Writing rules: answer first, no preamble. Plain sentences. No em dashes, snappy or punchy lines,
rule-of-three padding, bolded verdict openers or hedging words. No private dev-tracking ids in
anything others see. Opus 5.5: no bold lead-in labels, no three-part lists, no hedges.
Fable 5.1: one idea per paragraph, no sentence over 25 words, no metaphor for a plain statement.
Also for Fable 5.1: define every label once, no arrow chains, quote or cite every borrowed passage.
Before you report, run the pre-ship pass in `docs/procedures/ai-writing-anti-patterns.md` over what
you wrote. A model that did not write a passage reviews it.
<!-- doc:writing-rules:mirror:end -->
</grounding_instructions>
```

## 2. Context / inputs

Background, read-only and not evidence: /data/projects/ai-harness/docs/research/ai-native-knowledge-substrate-oss-adoption.md section 5 (an earlier OSS-portfolio lens). Product context: /data/projects/beads-ui/.worktrees/ops-vm-3-agents/bx-registry-research/README.md.

These repo facts are a snapshot taken at the times stamped above. Re-verify anything load-bearing against `origin/main` before acting on it; if it has moved, say so and work from what you measured, not from this brief.

## 3. Output contract

Write your full findings to the evidence file `scratchpad/leg-adoption-findings.md` inside your worktree, incrementally (create it after your first five fetches, then append). Shape:

1. A channel table: channel | URL fetched | audience fit for a Claude Code mod | self-promotion rule (quoted) | what works there | evidence of results | tag + footnote.
2. Precedents: one short entry per project with dates, numbers and the source of each number.
3. Practices: launch sequencing, README and demo, agent-era discoverability, measurement, post-launch community, each with tagged claims.
4. "Contrarian evidence" and "Gaps, blindspots & emergent findings".
5. "Flagged for coordinator": up to 8 unresolved items with the raw excerpt and URL.
6. `## Sources` with APA footnote definitions per the grounding block, each stamped "Verified accessible (HTTP 200) 2026-10-23" or with the actual status.

Final message: at most 350 words: the evidence file's absolute path, the count of channels and precedents covered, the count of URLs fetched and how many failed, the 5 findings most likely to change a launch plan, and the flagged items' one-line titles.

## 4. Tools and scope

Read-only research: WebFetch, `ghp api` GET calls only (never POST/PATCH/PUT/DELETE, never create, star or comment on anything), Read/Grep/Glob. Never run raw `curl` or `wget`. Never post, submit, register, sign up or message anyone. No tests, builds or pytest; never print a process environment. Write only the evidence file; do not commit it.

You are a leaf: do NOT spawn sub-agents. A long fetch is not a reason to idle: do the next piece of your own work; never sleep-poll, and never end a turn with nothing to do.

## 5. Boundaries and definition of done

Done when the evidence file covers every channel named in the objective (or says why one could not be reached), every [VERIFIABLE] item cites a URL fetched this session, and the final message is sent. Out of scope: registries and publishing mechanics (another leg), drafting posts, any public act. Which channels to use and when to launch are the owner's decisions: give evidence and options, not a decision.

Delegated execution provenance (for reference; you make no commit): Delegated-to: claude/researcher; tier: opus; model: us.anthropic.claude-opus-5-5[1m]; persona: auditor profile used as a read-only research leaf (no Agent tool); launch name: bx-reg-leg-adoption.

## 6. Failure and escalation

If a source will not load after two alternate URLs, record it as unreachable with the error text and move on. If you need the coordinator's answer mid-run, load SendMessage with ToolSearch (`select:SendMessage`) and send to "main"; if the tool will not load, put the question in your final message.

=== Leg 3 brief (bx-reg-leg-verify), read from file; carrier, floor and scope were inline in the launch prompt ===
## Leg 3 task brief: fresh-context citation verifier (carrier, floor and alignment blocks are inline in your launch prompt)

## 1. Objective

Verify the finished research doc at /data/projects/beads-ui/.worktrees/ops-vm-3-agents/bx-registry-research/docs/research/claude-code-plugin-registries-and-oss-adoption.md against its sources. You did not write it and have not seen the run that did; read it cold. For every footnote definition under `## Sources`, fetch its URL in this session (WebFetch, or `ghp api` for GitHub API URLs) and record the HTTP outcome. For every claim tagged [VERIFIABLE] in the body, check that at least one of its cited sources supports it: the quoted words appear in the source, numbers match, and the claim does not say more than the source. Also check footnote integrity: refs contiguous from [^1], every ref defined, every definition referenced, multi-refs ascending.

Then do an adversarial read: name up to 6 places where the doc's recommendation or a decision's options rest on a claim weaker than the doc admits, or where a load-bearing alternative is missing.

## 2. Context

The doc was written on 2026-10-23 by an Opus coordinator from its own fetches and two research legs. Fetch times in the doc are UTC. Pages change; a mismatch caused by a page changing since the doc's fetch is still a finding, labelled "moved".

These repo facts are a snapshot taken at the times stamped above. Re-verify anything load-bearing against `origin/main` before acting on it; if it has moved, say so and work from what you measured, not from this brief.

```text
<grounding_instructions>
You are a fact-checker for a technical publication who has verified thousands of citations in developer documentation and who reports every mismatch, however small. You have strong opinions backed by evidence. When you cannot find a source, you say so explicitly.

Temporal scope: Weight sources by recency — 2026 (primary) → 2025 → 2024.
Pre-2024 sources are background context only unless foundational to the topic.
If post-2024 literature is genuinely sparse for a subtopic, state
"[subtopic]: no significant post-2024 developments found" rather than
backfilling with older sources. Backfilling is a failure mode, not a hedge.

Before generating your final output, execute a Chain-of-Verification (CoVe)
to ensure factual fidelity over compliance.

Inside your thought process:
1. Isolate the core facts required.
2. Draft a tentative response.
3. Hostile Cross-Examination: flag any claim where you are citing a source because
   the prompt implied you should, rather than because you verified it.
4. Strip away any claim that cannot be empirically verified.

When generating your final output, classify every major claim. Write your rationale
before appending the tag — writing the tag first causes post-hoc rationalization.
Rationale → evidence check → tag.

- [VERIFIABLE]: backed by documentation, peer-reviewed research, or official
  tech blogs (2024–2026). Carry an inline footnote ref to the source: [VERIFIABLE][^N].
- [HEURISTIC]: widely accepted best practice without a specific citation.
- [INFERENCE]: a logical conclusion drawn from context. Provide your reasoning
  in-text. Do not fabricate a source. Tier tag only — NO footnote ref.
- [NO SOURCE]: explicitly state when you cannot find verifiable data. Tier tag
  only — NO footnote ref.

Citation format (mandatory for every externally-sourced claim):
- Inline: append the GFM footnote ref directly after the tier tag — [VERIFIABLE][^N].
  A claim citing multiple sources carries ascending separate refs — [VERIFIABLE][^3][^7]
  (never grouped [^3,^7]; never out of order).
- Footnote definitions live once, under ## Sources, in APA form with a clickable
  URL or DOI and an access-verification stamp. Worked example:
    [^1]: LangChain. (2026). [Threads](https://docs.langchain.com/langsmith/threads).
    LangSmith Documentation. Verified accessible (HTTP 200) 2026-06-03. (Scope note.)
- URL-or-DOI ALWAYS: every source entry carries a clickable URL or a doi.org link —
  paywalled/gated is fine (link it anyway; stamp the access status). Only the
  truly-irreducible case (no online catalog presence anywhere) gets an explicit
  [no online source located] marker with a one-line justification.
- Integrity: footnote refs are contiguous from [^1], every [^N] ref has a matching
  definition, and every definition is referenced — no gaps, no orphans.
- [INFERENCE] / [NO SOURCE] claims carry the tier tag with NO footnote ref.

Hard constraint (overrides all formatting preferences): never invent a citation
to satisfy a formatting instruction. Accuracy > completeness.

When evaluating an externally sourced idea, feature, repository, package, tool, or pattern for
adoption, apply `docs/procedures/source-vetting-and-corroboration.md`: record concrete
adoption/maintenance signals or independently corroborate the underlying pattern. If neither
route passes, call it exploratory rather than an established best practice.

Format architecture, workflow, sequence, data-flow, and lifecycle/state diagrams with the
`archify` skill by default. Named Mermaid exception: a teammate-visible document reviewed on GitHub
uses a Mermaid fence for an inline, reviewable diagram because GitHub displays Archify HTML as
source; it may additionally link the Archify HTML for exploration. An architecture diagram instead embeds its `archify_print` SVG, which GitHub renders.
Everything else uses Archify.
Format math using LaTeX. Never use ASCII diagrams.
NEVER generate binary images.

<!-- doc:writing-rules:mirror:begin -->
Writing rules: answer first, no preamble. Plain sentences. No em dashes, snappy or punchy lines,
rule-of-three padding, bolded verdict openers or hedging words. No private dev-tracking ids in
anything others see. Opus 5.5: no bold lead-in labels, no three-part lists, no hedges.
Fable 5.1: one idea per paragraph, no sentence over 25 words, no metaphor for a plain statement.
Also for Fable 5.1: define every label once, no arrow chains, quote or cite every borrowed passage.
Before you report, run the pre-ship pass in `docs/procedures/ai-writing-anti-patterns.md` over what
you wrote. A model that did not write a passage reviews it.
<!-- doc:writing-rules:mirror:end -->
</grounding_instructions>
```

## Scope note — questions, examples, and named references are a starting point, not a checklist
The questions, topics, and named examples below are illustrative anchors and a FLOOR for this
research — not an exhaustive list to answer only or evaluate only. Reason independently: survey the
landscape broadly, follow the evidence where it leads, expand scope where warranted, and surface
relevant work, factors, and failure modes not named here. Actively resist answering only the listed
questions or evaluating only the named approaches — an output that merely fills in the listed items
has NOT met the research goal.

## Independent exploration (gaps, blindspots, emergent threads) — required
Treat the question list as a FLOOR, not a ceiling. As you research, actively surface what this
framing may be missing and pursue each promising thread to a logical conclusion:
- Adjacent or upstream factors the questions don't capture.
- Contrarian / disconfirming evidence — report it even when it challenges the premise.
- Emerging 2025–2026 practices, tools, or research not anchored by the named examples.
- Known failure modes and second-order effects.
Whenever a load-bearing thread surfaces mid-research, follow it to its conclusion and report it in a
dedicated "Gaps, blindspots & emergent findings" subsection. Explicitly NAME any blindspot you
suspect but cannot resolve (and why) rather than omitting it. Anchor bias — over-fitting to the
listed questions and example approaches — is a known failure mode; counter it deliberately and say
where you did.

## 3. Output contract

Write the full record to `scratchpad/verify-findings.md` in your worktree, incrementally (start it after your first ten fetches). Shape:

1. A source table: footnote | URL | HTTP outcome | supports its claims? (yes / partly / no / moved) | note.
2. A mismatch list: location (section and a quoted phrase) | the doc's claim | what the source says (quoted) | proposed minimal fix.
3. Integrity check results.
4. Adversarial findings (up to 6), each sorted MUST-FIX, WORTH-CONSIDERING or TAKE-IT-OR-LEAVE-IT, with evidence. "No change warranted" is a valid outcome for any of them.

Final message: at most 300 words: the file's absolute path; counts of sources fetched, answering, failing; claims checked, supported, partly supported, unsupported; the MUST-FIX items in one line each.

## 4. Tools and scope

Read-only: WebFetch, `ghp api` GET calls only, Read/Grep/Glob. Never run raw `curl` or `wget`. Never edit the doc; report. Never post or submit anything. No tests, builds or pytest; never print a process environment. Write only your findings file; do not commit it.

You are a leaf: do NOT spawn sub-agents. Never sleep-poll; never end a turn with nothing to do.

## 5. Definition of done

Every footnote fetched or recorded as failing with its error, every [VERIFIABLE] claim checked, integrity checked, and the final message sent.

## 6. Failure and escalation

If a URL fails, try it once more and once through an alternate route (the site's llms.txt, the GitHub API) before recording it as failing. Questions for the coordinator go through SendMessage to "main" (load it with ToolSearch `select:SendMessage`); otherwise put them in your final message.
````

<!-- /doc:region name="appendix_research_prompt" -->

## Appendix: Measurements

Local measurements this run made, each command run once on 2026-10-23 on host-c.

| # | Command | Result |
|---|---|---|
| M-1 | `git -C <beads-ui worktree> log -1 --format='%H %cI' origin/main` | `d331375e4d770056444cdffc5248d99593142456 2026-10-23T14:28:43-04:00` |
| M-2 | `git ls-files plugins/beads-ui \| wc -l` | `97` |
| M-3 | `git ls-files -z plugins/beads-ui \| xargs -0 stat -c '%s %n' \| sort -n \| tail -3` | largest three: 39,366 (`core/test/fixtures/bd-list.json`), 42,194 (`core/test/fixtures/bd-list.json.ts`), 54,185 (`hooks/pane.ts`) bytes |
| M-4 | `ls plugins/beads-ui` | `client core hooks package.json test validate-allowlist.json vitest.config.ts`: no README, no lockfile |
| M-5 | `cat plugins/beads-ui/hooks/hooks.json` | `"modules": ["./register.ts"]` |
| M-6 | `ghp api -X GET search/repositories -f q='repo:... (12 repos)'` | stars, forks, creation dates and topics cited as [^23] |
| M-7 | `ghp api repos/karanb192/awesome-claude-code-mods/contents/catalogue.md` grepped for `sergeiwallace` and `beads` | no `sergeiwallace` line; ten `baselane-sh/mods` lines matched; the verifier leg later counted twelve from that author and one from a second |
| M-8 | `machine-contention status` before each leg | HOLD from 19:03Z; leg 1 launched on LOOK at about 19:14Z; HOLD again until ADMIT at 19:28Z, when leg 2 launched; LOOK at 19:54Z before leg 3, though the launch hook read HOLD 11 seconds later and did not refuse |
| M-9 | `git -C <beads-ui worktree> log --reverse --format='%cI %h' origin/main \| head -1` | `2026-10-14T19:09:53-04:00 00eeeaa` |

## Appendix: Provenance Ledger

Load-bearing claims tied to the verbatim text of the source fetched in this run. Verdicts are the coordinator's own reading of the fetched page (SUPPORTED means the quote appears and carries the claim). No NLI model was run.

| # | Claim | Source | Verbatim quote | Verdict |
|---|---|---|---|---|
| P-1 | An own marketplace needs no form | [^2] | "Once the file is in the repository, the plugin is published, with no submission form." | SUPPORTED |
| P-2 | Directory submission needs a paid plan | [^4] | "Plan: Pro, Max, Team, or Enterprise. Free accounts can't submit" | SUPPORTED |
| P-3 | The official marketplace takes no portal submissions | [^2] | "Anthropic's official marketplace, `claude-plugins-official`, doesn't take submissions through the directory portal." | SUPPORTED |
| P-4 | A person reviews a new listing | [^4] | "every version gets automated validation and a security scan, and a person reviews a new listing before it goes live" | SUPPORTED |
| P-5 | The plugin folder needs a 40-word README | [^18] | "Put a README of at least 40 words in the plugin folder, preferably named `README.md`. Words inside code blocks don't count." | SUPPORTED |
| P-6 | The directory lists a mod for Claude Code | [^5] | "The directory lists a mod, which is code a plugin names under `modules` in `hooks/hooks.json`, for Claude Code." | SUPPORTED |
| P-7 | Authors get no usage data from Claude Code | [^6] | "Claude Code doesn't report a plugin's usage back to its author." | SUPPORTED |
| P-8 | The community marketplace is a mirror fed by review | [^21] | "A read-only mirror of the community plugin marketplace ... synced nightly from Anthropic's internal review pipeline." | SUPPORTED |
| P-9 | Claude Marketplaces crawls | [^30] | "Crawlers discover listings and refresh install counts and GitHub stars on a schedule" | SUPPORTED |
| P-10 | The mods catalogue scans by topic every three hours | [^7] | "Every three hours, a faster scan also checks repositories pushed since the last complete search that have the topic `claude-code-mod`" | SUPPORTED |
| P-11 | awesome-claude-code's bar | [^10] | "(i) Be at least 14 days old ... AND show signs of active development ... (ii) Have at least 100 stars." | SUPPORTED |
| P-12 | Listing follows users | [^10] | "If 'getting on the list' is any part of a promotional strategy for your project, you should be prepared to have a backup plan." | SUPPORTED |
| P-13 | Fake stars give a short boost | [^11] | "less than two months" (abstract, on the promotional effect) | SUPPORTED |
| P-14 | Show HN excludes landing pages and asks for no upvote requests | [^107] | "Don't post landing pages or fundraisers." "Please don't ask friends to upvote or comment." | SUPPORTED |
| P-15 | Superpowers shipped with the plugin system | [^12] | "Anthropic released Claude's new `plugins` system this morning and it seemed like the right impetus to ship." | SUPPORTED |
| P-16 | The Beads list takes PRs | [^35] | "Found or built a tool? Open a PR to add it to this list or comment on discussion #276." | SUPPORTED |
| P-17 | OpenAI takes a Claude archive with a skill and no hooks | [^8] | "A direct Claude archive upload must include at least one skill at `skills/<skill-name>/SKILL.md`." "Remove lifecycle hooks before public directory submission." | SUPPORTED (coordinator re-fetched) |
| P-18 | Antigravity's marketplace offers third parties an interest form | [^49] | "Fill out this interest form to learn more about how to get your plugin listed in the Antigravity Marketplace." | SUPPORTED (coordinator re-fetched) |
| P-19 | Agent Plugins' steering committee | [^9] | "initial Technical Steering Committee includes Core Maintainers from Amazon, Cursor, Microsoft, OpenAI, and Vercel" | SUPPORTED (coordinator re-fetched) |
| P-20 | The official marketplace README names the clau.de form for partners | [^121] | "Third-party partners can submit plugins for inclusion in the marketplace. ... use the plugin directory submission form" | SUPPORTED (coordinator read via the GitHub API) |
| P-21 | HN bans AI-edited posts | [^14] | "Don't post generated text or AI-edited text." | Leg 2 quote; checked by the verifier leg |
| P-22 | Show HN for plugins rarely lands | [^16] | Median 2 points over the top 40 "claude code plugin" Show HNs (computed by leg 2 from the API result) | Leg 2 computation; checked by the verifier leg |

Rows P-1 to P-20 were read by the coordinator. Other leg findings carry the legs' own quotes in their evidence files, which were working files and are not cited as evidence; each claim here rests on the public URL in its footnote.

## Appendix: Citation Validation Record

A fresh-context verifier (Claude Opus 5.5, leg 3, same family as the author) re-fetched every footnote of the 168-footnote draft on 2026-10-23 between about 19:55Z and 20:13Z, and checked about 200 of its 347 `[VERIFIABLE]` claims: every claim in sections 1, 2, 4, 5 and 6, the Comparison, the Recommendation and the Open Decisions, and at least one claim per row in section 3.

| Check | Result |
|---|---|
| Footnote URLs fetched | 168 of 168 answered; [^22] is the recorded 302; none failed |
| Claims checked | About 200: 161 supported, 27 partly supported, 9 unsupported, 3 moved |
| Footnote integrity | Contiguous, no duplicates, no orphans, every multi-ref run ascending |
| Placeholders | Two unfilled at the time; both filled before commit |

How the coordinator disposed of the findings:

- Fixed, the nine unsupported claims: the Superpowers plateau (the chart shows slow growth, not a flat stretch), claude-mem's star count and its HN presence, the position of `mantoni/beads-ui` in the Beads list, the ccpm score (dropped; neither cited query returns it), the llms.txt wording, a paraphrase shown as a quote in section 6, the pre-push hook claim (now tagged as inference from this repository), and the repository-rename redirect (now tagged heuristic).
- Fixed, the decision-critical partial findings: D-3 (b)'s chat reach now depends on a hosted remote server; D-4 and section 4.3 now state that an exact name already used by another organisation's plugin blocks; the Executive Summary's adoption thesis now says the evidence does not show a listing creating traction and names the one dated placement event; terminal-browser is no longer called a mod precedent; upstream Beads' own `beads-marketplace` is added to section 4.2 and D-1.
- Fixed, the other partial findings: submitter roles on Team and Enterprise, the symlink rule's scope, per-surface mod version floors, VS Code's formats, the ChatGPT desktop app as the reader of the legacy marketplace file, Smithery, PulseMCP, the registry freeze, the Gemini quote, ClawHub's scope, hooks in OpenCode, Antigravity and Pi, ClaudeMod's 172 entries, the Kiro citation, Amp's git installs, the privacy-policy trigger, the awesome-claude-code clock, Open Questions 1, 6 and 8, the Substack rule, and the thin general-OSS coverage.
- Left as measured: counts that moved after the coordinator's read (Pi 5,359 to 5,350, Glama 109,186 to 109,233, small star drifts). They are dated readings.
- Added after verification, fetched by the coordinator and not re-checked by the verifier: [^169], [^170] and [^171].

The verifier also confirmed provenance rows P-21 and P-22. Its working file was a scratch record and is not cited as evidence.

<!-- doc:region name="run_history" kind="append_only" -->

## Run History

### 2026-10-23, run 1 (orchestrated /research-doc, BU-ylx.5.1)

- Coordinator: Claude Opus 5.5 (`us.anthropic.claude-opus-5-5[1m]`), author of this doc, run on host-c under the employer-API profile.
- Concurrency cap: one research leg at a time, depth 1, set by the host chief. The host read HOLD from 19:03Z, so the coordinator fetched the Claude Code channels, the seed URLs and part of the adoption evidence itself before the first leg could launch.
- Leg 1, `bx-reg-leg-clients`: family claude, role researcher (the `auditor` profile used as a read-only leaf with no Agent tool), tier opus, model `us.anthropic.claude-opus-5-5[1m]`, effort medium, the `auditor` profile's default (no effort was set at launch, so the research default of high did not apply). About 19:14Z to 19:27Z; 84 WebFetch calls (14 failed), about 38 `ghp api` reads; 42 surfaces; its evidence supplied most of section 3.
- Leg 2, `bx-reg-leg-adoption`: same family, role, tier, model and effort. 19:28Z to about 19:49Z; about 83 WebFetch calls (23 failed or empty), about 30 `ghp api` reads; 19 channels and 8 precedents; its evidence supplied most of section 5.
- Leg 3, `bx-reg-leg-verify`: same family, role, tier, model and effort, fresh context, read-only. About 19:55Z to 20:13Z; re-fetched all 168 footnotes and checked about 200 claims. Its result and the coordinator's dispositions are in the Citation Validation Record.
- Cross-family review: none. The legs and the verifier are the same family as the author, which is a weaker check than a Codex review; on this host Codex is reserved for review and was not run because the concurrency cap of one was spent on the verifier.
- The coordinator re-fetched the load-bearing leg claims it relied on (OpenAI's Claude-archive rules, Antigravity's interest form, the Agent Plugins steering committee, the official marketplace README) before writing them.

<!-- /doc:region name="run_history" -->
