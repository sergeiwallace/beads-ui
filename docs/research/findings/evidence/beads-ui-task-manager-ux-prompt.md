# Research prompt: beads-ui leg A (task-manager UX, components and web hosting)

This is the research prompt the aih-3 Fable coordinator gave the leg A researcher on 2026-10-15 for
BU-mg2.1.1. It is the "RESEARCH PROMPT" block of the coordinator's brief, reproduced verbatim. The
brief's founding-ask excerpts, stage framing, alignment obligation, destructive-operation floor and
six-field brief also bounded the run; they are summarised in the packet's Run History.

Registry ID: none (coordinator brief; no research-prompt registry entry was created for this leg)
Model: `us.anthropic.claude-opus-5-5`
Date: 2026-10-15

```text
<grounding_instructions>
You are a principal product designer and front-end architect who has shipped task-management and project-tracking products (board, backlog, sprint, roadmap and analytics surfaces) and who evaluates open-source component libraries for production use. You have strong opinions backed by evidence. When you cannot find a source, you say so explicitly.

Temporal scope: Weight sources by recency — 2026 (primary) → 2025 → 2024.
Pre-2024 sources are background context only unless foundational to the topic.
If post-2024 literature is genuinely sparse for a subtopic, state
"[subtopic]: no significant post-2024 developments found" rather than
backfilling with older sources. Backfilling is a failure mode, not a hedge.
Distributed systems, databases, cloud defaults do not apply; this is product UX and front-end tooling. Weight 2026 and 2025 sources first; 2024 and 2023 sources are acceptable for component libraries and UX patterns that have not changed. Older sources are background only.

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
source; it may additionally link the Archify HTML for exploration. Everything else uses Archify.
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

## Retrieval enforcement (mandatory)
For each load-bearing claim, make at least one live fetch; never return `[VERIFIABLE]` without a URL you actually fetched in this session. Do not stop after one round. If no source is found for a sub-question, run additional searches across alternate framings before tagging it `[NO SOURCE]`; that tag is reserved for genuine evidence absence, not retrieval avoidance. Cross-reference each load-bearing claim across at least two independent sources. Fetch every citation you record; classify a failure instead of dropping it: DNS failure or malformed URL = likely fabricated, downgrade hard and flag; 404 or 410 = dead, downgrade out of VERIFIABLE and try `https://archive.org/wayback/available?url=<url>`; 401 or 403 = paywalled or bot-blocked, keep the citation and flag it; timeout or 5xx = transient, keep, flag, retry once. Stamp every source "Verified accessible (HTTP <code>) <date>". For a provenance row, the quote must literally appear in the fetched text (check it yourself with a whitespace-normalized substring test).

## Search recipe on this host
Native WebSearch does not exist on this machine. If the host's web-search tool is available to you, use it for discovery. Otherwise discover with WebFetch on `https://www.bing.com/search?q=<url-encoded query>` (DuckDuckGo returns a bot challenge), then WebFetch the result pages themselves. Use specific multi-word queries; a bare product name returns dictionary entries. Never set HTTP_PROXY or HTTPS_PROXY. Do not curl arbitrary hosts; WebFetch is your network route.

## Questions (floor, not ceiling)
1. For Jira, Linear, Todoist and Asana, and for at least four more widely adopted or open-source task managers you choose (candidates: GitHub Projects, Trello, Monday, ClickUp, Height, Shortcut, Plane, Huly, Focalboard, Planka, Taiga, Vikunja, OpenProject, Leantime): what do their board, backlog, sprint and roadmap or timeline views do that users and reviewers praise, and what do they get wrong. Cover swimlanes, grouping, sub-tasks, WIP limits, saved views and filters, bulk edit, quick-add parsing (Todoist's natural-language entry), the keyboard-first command palette (Linear), and inline editing.
2. Drag semantics: moving a card across columns, reordering within a column, cross-view drag (backlog to sprint, timeline bar drag to reschedule), multi-select drag, touch and keyboard-accessible alternatives, optimistic update and conflict handling when two clients move the same item.
3. Create, edit and delete flows, including the are-you-sure step Sergei asked for: modal confirmation versus undo toast, soft delete and trash, cascade behaviour for an epic with children, and what the better-regarded products do today.
4. Sprint burndown, velocity, cumulative flow, cycle time and throughput, dashboards and widgets: which metrics, how they are drawn, and which matter when the "assignees" are autonomous Claude Code sessions rather than people.
5. Cross-assignee views: "my work", team and workload views, people or assignee swimlanes, activity feeds; how these map to a view of every Claude Code session's assigned, in-progress and done tasks.
6. Open-source React building blocks with license and maintenance signals (stars, last release, open issues, maintainers): drag and drop (dnd-kit, Atlassian pragmatic-drag-and-drop, others), tables and virtualization (TanStack Table, TanStack Virtual), data fetching and state (TanStack Query, Zustand, Jotai, XState), UI primitives (shadcn/ui, Radix, Base UI, Mantine), command palette (cmdk), timeline and gantt (frappe-gantt, vis-timeline, svar gantt, planby, others), charts (Recharts, visx, Observable Plot, Tremor, ECharts), calendars.
7. Open-source Jira or Linear clones (Plane, Huly, Focalboard, Planka, Taiga, Vikunja, OpenProject, Leantime, others you find): license, stack, what UI patterns and code are worth borrowing, and whether any ships a terminal or CLI surface.
8. Web app hosting for a small open-source single-user or small-team app: the local run path (one command, npx, a single binary, Docker Compose), and infra-as-config quick starts (Docker Compose, Fly.io, Railway, Render blueprints, Cloudflare Pages or Workers, Vercel, AWS CDK, Copilot or App Runner, Helm). What maintainers of comparable apps actually ship as "deploy" buttons and templates, and how a self-hosted single-user app handles auth (Tailscale, basic auth, OAuth proxy, passkeys).
9. Terminal parallels: how terminal task and kanban TUIs (kanban-tui, taskwarrior-tui, dooit, kanban-python, lazygit, k9s, others) handle columns, mouse clicks and drags, modal confirmation and keyboard navigation; which of these patterns translate into a Claude Code mod pane that has no DOM.
```
