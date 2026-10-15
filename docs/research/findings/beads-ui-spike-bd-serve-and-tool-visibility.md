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

1. `POST /v0/beads/issues` accepts `metadata`, `labels`, `assignee`, `parent_id` and `dependencies` at create, in one transaction, so beads-ui can write `metadata.display_id` with the row. `:batchCreate` does not take `metadata`; `:batchApply` does. [VERIFIABLE][^1]
2. `GET /v0/beads/events:watch` depends on the events journal. With the journal off it answers `409 events_journal_disabled` before any stream byte, and the beads-ui store has the journal off today. [VERIFIABLE][^1][^25]
3. `:casMetadata` swaps one top-level metadata key from `expected` to `value` and defines no `409`. A lost race is a `200` with `swapped: false` and the stored `current` value. [VERIFIABLE][^1]
4. The OpenAPI document on upstream `main` is not the one bd 1.3.x ships. It has 44 operations against 41 at v1.3.0 and v1.3.1, which are byte-identical, so the design should cite the tag. [VERIFIABLE][^1][^2][^25]
5. No Claude Code page or changelog entry says what Claude Code does with a tool whose `_meta.ui.visibility` excludes `model`. The docs say only that MCP Apps UI resources are left out of resource lists. [VERIFIABLE][^13][^14]
6. The MCP Apps specification tells servers to check the client's `io.modelcontextprotocol/ui` capability before registering UI tools. A beads-ui server can therefore register app-only tools only for hosts that advertise the extension, and need not rely on Claude Code filtering them. [VERIFIABLE][^9][^12]
7. No document says whether a bare-name `permissions.deny` entry removes the Task tools in background or cloud sessions. Cloud sessions do not read `~/.claude/settings.json` at all, so a per-machine deny rendered there cannot reach them. [VERIFIABLE][^16][^19]
8. `bd update --metadata` merges top-level keys and does not replace the document, despite its "Set custom metadata" help text. `--set-metadata k=v` types `v` from its spelling, so `rank=0.5` stores a number. The only documented reserved keys are the `bd:` and `_` prefixes. [VERIFIABLE][^5][^6][^7]

## 1. bd serve request schemas: create, PATCH, casMetadata, events:watch, claim, batchCreate, delete and sweep

### 1.1 Which document is the contract

The host runs `bd version 1.3.0 (f45b249ce)`. The spec file at the v1.3.0 and v1.3.1 tags is one file, 497,361 bytes, with 41 `operationId`s. The file on `main` is 587,112 bytes with 44. The extra three are `advanceMolecule`, `batchGetIssues` and `reclaimIssues`. `main` also adds `claim`, `force_notes_overwrite` and `allow_template` to `UpdateIssueRequest`, `persistence` to `IssuePatchBody`, and `wisps-plane` to the sweep tier enum. [VERIFIABLE][^1][^2][^25]

The v1.3.0 release notes give the same count: "41 OpenAPI-specified operations across 35 paths". [VERIFIABLE][^3] The v1.3.1 notes describe a tag that "differs from `v1.3.1-rc.2`" only in version metadata and mention no spec change, which matches the identical bytes. [VERIFIABLE][^4][^25]

The landscape research and its leg C packet read the first 100,000 characters of the `main` file. Everything below is read from the v1.3.0 file in full. Where `main` differs on a member this packet relies on, the difference is named. [INFERENCE]

### 1.2 `POST /v0/beads/issues` (`createIssue`)

The answer is yes for every member the question named, with one spelling change: the parent is `parent_id`. `CreateIssueRequest` is flat, `additionalProperties: false`, and requires `actor` and `title`. Its 26 members are `actor`, `id`, `title`, `description`, `design`, `acceptance_criteria`, `notes`, `issue_type`, `status`, `priority`, `assignee`, `owner`, `labels`, `estimated_minutes`, `external_ref`, `due_at`, `defer_until`, `sender`, `metadata`, `ephemeral`, `no_history`, `parent_id`, `inherit_labels_from_parent`, `dependencies`, `waits_for` and `force_id_prefix`. [VERIFIABLE][^1][^25]

The clauses that settle each named member:

| Member | Type and rule | Quoted clause |
|---|---|---|
| `metadata` | `MetadataValue`, any JSON value | "One metadata value: ANY JSON value" |
| `labels` | array of strings, each up to 255 | "The complete label set the issue is created with." |
| `assignee` | string, up to 255 | (no description beyond `maxLength: 255`) |
| `parent_id` | string, up to 255 | "Creates a typed `parent-child` edge from the new issue to this target." |
| `dependencies` | array of `CreateIssueDependency`, `maxItems: 100` | "The complete set of explicit edges created with the issue." |

[VERIFIABLE][^1]

The operation is atomic. The spec says "Every edge lands in the same transaction as the row: an edge this request could not write is a `400` and the issue is not created either." [VERIFIABLE][^1] A `CreateIssueDependency` carries `target_id`, `type`, `reverse` and its own `metadata`, and `reverse: true` writes an edge into the new row. [VERIFIABLE][^1]

Four rules matter for beads-ui's create form. First, `issue_type` must be sent: "SEND ONE. The member is optional in this schema and the role validates the EMPTY type against the same vocabulary as any other". Second, `inherit_labels_from_parent` defaults to false and "diverges from `bd create --parent`, whose default is to inherit". Third, an explicit `id` is create-only and a taken one is `409 already_exists`. Fourth, "Hooks do not fire and the per-command auto-commit machinery does not run". [VERIFIABLE][^1]

For the fleet's display-id convention this means beads-ui can send `metadata: {"display_id": "<slug>"}` and the `id:<slug>` label in the same create call. The server does not mint the slug; beads-ui or a minting hook must, as the landscape research already concluded. [INFERENCE]

### 1.3 `POST /v0/beads/issues:batchCreate` and `:batchApply`

`BatchCreateRequest` requires `actor` and `items`, with `minItems: 1` and `maxItems: 100`. [VERIFIABLE][^1] Each `BatchCreateItem` has nine members: `title`, `description`, `design`, `acceptance_criteria`, `priority`, `issue_type`, `assignee`, `labels` and `dependencies`. [VERIFIABLE][^1]

The create operation's own description names what batchCreate lacks: "no `status`, no `sender`, no `metadata`, no `ephemeral`, no `no_history`, no `id`." [VERIFIABLE][^1] So a batch create through this operation cannot carry `metadata.display_id`. [INFERENCE]

The operation is all or nothing ("Creates every item in the request, or none of them") and "THE SERVER ASSIGNS EVERY ID". An item cannot be the dependency target of another item in the same request; the spec routes that case to `:batchApply`, where "a create item may NAME itself and later items address it by that name". [VERIFIABLE][^1]

`ApplyCreateItem` on `:batchApply` does carry `metadata`, and its parents and edges travel as separate `dep_add` items. [VERIFIABLE][^1] A beads-ui bulk create (paste a list, split an epic) that must write display ids would use `:batchApply` or one `createIssue` per row. [INFERENCE]

### 1.4 `PATCH /v0/beads/issues/{id}` (`updateIssue`)

At v1.3.0 `UpdateIssueRequest` requires `actor` and `patch` and has five more members: `expected_version`, `expected_status`, `expected_assignee`, `force_close_policy` and `force_assignee_transfer`. [VERIFIABLE][^1]

`IssuePatchBody` has 19 members: `title`, `description`, `design`, `acceptance_criteria`, `notes`, `append_notes`, `priority`, `issue_type`, `status`, `assignee`, `parent_id`, `labels`, `add_labels`, `remove_labels`, `estimated_minutes`, `external_ref`, `due_at`, `defer_until` and `metadata`. [VERIFIABLE][^1] Presence is the signal: "a member present is written, a member absent is untouched. An empty object is a `400`". [VERIFIABLE][^1]

The rules a board client meets on every drag:

| Member | Behaviour |
|---|---|
| `status` | A move into the done category "answers to close policy" and is refused with `409 not_closable` for open children or a live blocker unless `force_close_policy` is set |
| `assignee` | A transfer away from a live foreign in-progress owner is `409 already_claimed` unless `force_assignee_transfer` or a matching `expected_assignee` |
| `parent_id` | Replaces every parent atomically; an empty string removes them; a cycle is `409 dependency_cycle` |
| `labels` | "COMPLETE REPLACEMENT of the label set"; `add_labels` and `remove_labels` apply after it, and "REMOVAL WINS" |
| `estimated_minutes`, `external_ref`, `due_at`, `defer_until` | Explicit `null` clears; `null` on any other member is a `400` |
| `metadata` | An `ApplyMetadataPatch`: `replace`, or any of `merge`, `set` and `unset` |

[VERIFIABLE][^1]

The operation cannot edit `owner`, `persistence`, `closed_by_session`, `close_reason`, `created_at`, `created_by`, `spec_id` or `await_id`. [VERIFIABLE][^1] The response is `{issue, changed, revision}`. `revision` is a string token, and the spec says to send it back verbatim as `expected_version`, because a double-precision JSON parser "rounds anything past 2^53 to a value NEAR the token that is not it". [VERIFIABLE][^1]

The 1.3.0 document contradicts itself on labels. The operation description says "an additive `labels_add`/`labels_remove` pair can join the vocabulary later", while the same file's `IssuePatchBody` already publishes `add_labels` and `remove_labels`. The schema is the generated source, so the schema wins. [VERIFIABLE][^1] [INFERENCE]

For drag and drop this gives beads-ui an optimistic-concurrency write in one call: read `revision`, send `expected_version` with the new `status` and metadata rank, and treat `409 precondition_failed` as "re-read and recompose". The spec says "never retry the same body". [VERIFIABLE][^1] [INFERENCE]

### 1.5 `POST /v0/beads/issues/{id}:casMetadata` (`compareAndSetMetadata`)

It "Sets `metadata[key]` if and only if it currently holds `expected`, and reports what it found either way." [VERIFIABLE][^1]

`CompareAndSetMetadataRequest` is `additionalProperties: false`, requires `actor` and `key`, and has optional `expected` and `value`, both `MetadataValue`. `key` is 1 to 255 characters in the workspace's key syntax: "a letter or underscore, then letters, digits, underscores, dots and slashes". A dotted key is one top-level key: "ONE KEY, NOT A PATH". [VERIFIABLE][^1]

Omission carries meaning. "OMITTING either member means the key is ABSENT there. So a first-writer-wins acquire omits `expected`, a release omits `value`, and an ordinary hand-off carries both." [VERIFIABLE][^1] The spec warns that serializers which drop nulls turn a write of `null` into a delete. [VERIFIABLE][^1]

`CompareAndSetMetadataResponse` requires `swapped` and may carry `current`. The conflict case is not an error status: "A REFUSED SWAP IS A 200, not a 409." On a refusal "`swapped` is false and `current` carries the value that refused it". [VERIFIABLE][^1] The defined statuses are `200`, `400`, `401`, `404`, `500` and `503`, on v1.3.0 and on `main`. [VERIFIABLE][^1][^25] A `500` means the row's stored metadata is not a JSON object. [VERIFIABLE][^1]

Two more rules bear on a rank key. Numbers compare as their source literal, the store "decodes JSON numbers through a float", and the spec advises "For a coordination token, prefer a STRING". A swap that changes nothing writes nothing. [VERIFIABLE][^1] So a fractional-index rank stored as a string such as `"a0V"` is the shape this operation is built for. [INFERENCE]

The landscape research's candidate row "`metadata.rank` as a fractional index, written with HTTP `:casMetadata`" is therefore sound at the wire level. A drag that also changes `status` is two writes under CAS, or one PATCH with `metadata.set` and `expected_version`. [INFERENCE]

### 1.6 `GET /v0/beads/events:watch` (`watchEvents`) and the journal

The stream is the journal, pushed: "The same journal as `listEvents`, PUSHED: a held-open `text/event-stream` response that emits each committed mutation as it lands". [VERIFIABLE][^1]

The spec states the journal dependency outright. The `409` reads: "The durable events journal is NOT ENABLED on this workspace, so there is nothing to stream and never will be until an operator turns it on (`events-journal true`, or `BD_EVENTS_JOURNAL=1` in the server's environment) and restarts the server." [VERIFIABLE][^1] The capability list does not help a client decide: `events.watch` "says this BUILD serves the operation, not that this workspace has a journal". [VERIFIABLE][^1]

The beads-ui store reports `bd config get events-journal` as `false`, measured twice. [VERIFIABLE][^24][^25] So `events:watch` against the BU store returns `409 events_journal_disabled` today, per the spec. Nothing was run. [INFERENCE]

The frames, in order:

| Frame | Meaning |
|---|---|
| `retry: 3000` | Reconnection delay, sent once |
| `id: <seq>` and `data: <EventRecord>` | One record as an unnamed `message` event; `data` is one JSON line |
| `: heartbeat` | A comment "every ~20 seconds of silence" |
| `event: truncated` and `data: <Problem>` | Code `events_journal_truncated`; the stream closes and the client must re-baseline |

[VERIFIABLE][^1]

`since` is required on every connect, and a `Last-Event-ID` header "REPLACES `since` as the resume point", which makes a browser `EventSource` resume correctly. [VERIFIABLE][^1] `EventRecord.op` is one of "`create`, `update`, `close`, `delete`, `dep_add`, `dep_remove` or `comment`", and `issue` is the full post-mutation issue, `null` on a delete. [VERIFIABLE][^1] Other statuses are `410` for a pruned resume point and `503 events_watch_saturated` when the server holds its cap of streams. [VERIFIABLE][^1]

The spec recommends polling for most consumers: "WATCH OR POLL is a real choice and the answer is usually poll." `GET /v0/beads/events` is "never refused for capacity". [VERIFIABLE][^1]

Coverage limits come from the journal itself. Raw DML through `bd sql` is not journaled. Rows that arrive through `bd dolt pull` or a merge are not journaled, and each replica has its own `seq` space. [VERIFIABLE][^1][^25] The v1.3.0 release notes add the retention floors, "`events-journal-retain-days` 7, `events-journal-retain-rows` 100000". [VERIFIABLE][^3]

On this host every repo's bd writes go to one shared `dolt sql-server`, so the CLI and a `bd serve` would write the same database and both would be journaled. A change made on another machine and pulled in would not be. [INFERENCE] A live board fed by `events:watch` therefore still needs a full re-read after a sync, and a burndown chart cannot use the journal for more than its retention window. [INFERENCE]

### 1.7 Claim, delete and sweep

| Operation | Required | Notable rules |
|---|---|---|
| `POST /v0/beads/issues/{id}:claim` | `ClaimRequest.actor` | "The caller always names the actor"; a re-claim by the holder is `200` with `already_claimed: true`; another holder is `409 already_claimed` with `assignee`; a non-claimable state is `409 not_claimable` with `issue_status` |
| `POST /v0/beads/issues:delete` | `ids`, 1 to 1,000 | Also `actor`, `cascade`, `force`, `dry_run`, `expected_version`; an unknown id is `404` and "NOTHING is deleted"; `expected_version` "REQUIRES A SINGLE-ID REQUEST" |
| `POST /v0/beads/issues:sweep` | `tier`, `ephemeral` or `durable` at v1.3.0 | Also `actor`, `closed_before`, `pattern`, `protect_referenced` (default true), `dry_run`; "A `durable` sweep with neither `closed_before` nor `pattern` is refused with `400` / `invalid_argument`" |

[VERIFIABLE][^1]

The delete modes map onto the ask's "are you sure?" flow. Without `cascade` or `force`, a bead with outside dependents is refused with `400`. `force` orphans dependents and reports them in `orphaned`. `cascade` deletes the transitive closure. [VERIFIABLE][^1] `dry_run: true` "answers the same question and changes nothing", including the two refusals. [VERIFIABLE][^1] A confirm page can show a `dry_run` result, then send the real delete with `expected_version` so a row edited in between is refused. [INFERENCE]

Both destructive operations run in one transaction, and a large one "fails whole". [VERIFIABLE][^1] `bd serve --help` adds that "anyone who can reach this address can erase closed work" through `:sweep`, so the server should bind loopback or require a token. [VERIFIABLE][^23]

### 1.8 Reads that shape a board

`GET /v0/beads/issues` serves two sort orders only. "`created` is `(created_at DESC, id ASC)`; `priority` is `(priority ASC, created_at DESC, id ASC)`". [VERIFIABLE][^1] The spec gives the reason: each served order needs a total key for its cursor, and the other orders "are not offered here at all rather than offered behind a cursor that would silently skip and duplicate". [VERIFIABLE][^1]

Filters include `metadata_field` ("Top-level metadata equality filter as `key=value`") and `has_metadata_key`. [VERIFIABLE][^1] No sort by a metadata key exists, so a column ordered by `metadata.rank` is sorted in the client after a filtered read. [INFERENCE] Every request body shares a cap: the spec refers to "the 1 MiB every body on this surface shares". [VERIFIABLE][^1]

### Hand-offs

- Coordinator's design stage: choose between `createIssue` per row and `:batchApply` for bulk creates that carry display ids.
- Coordinator's design stage: decide whether beads-ui needs live push. If yes, enabling the journal on the BU workspace (and on any fleet workspace beads-ui watches) is a config change with retention cost; if no, poll `GET /v0/beads/events` or re-read.
- Coordinator's design stage: pin the generated client to the v1.3.0 spec file, since `main` has moved.
- A later live spike: run `bd serve` against a scratch workspace and confirm the `409 events_journal_disabled`, the CAS `200` refusal and the PATCH `409` codes match the spec. This spike ran nothing.

## 2. MCP app-only tools in Claude Code

### 2.1 What the specification requires

The MCP Apps specification is "Stable (2026-01-26)" and defines `_meta.ui.visibility` on a tool as `Array<"model" | "app">`, defaulting to both. [VERIFIABLE][^9] Its visibility rules read:

- "`"app"`: Tool is callable by the app from the same server connection only"
- "**tools/list behavior:** Host MUST NOT include tools in the agent's tool list when their visibility does not include `"model"` (e.g., `visibility: ["app"]`)"
- "**tools/call behavior:** Host MUST reject `tools/call` requests from apps for tools that don't include `"app"` in visibility"

[VERIFIABLE][^9]

Those duties bind a host that implements the extension. For a host that does not, the specification says "If host does not support MCP Apps, tool behaves as standard tool (text-only fallback)". [VERIFIABLE][^9] Read together, an app-only tool reaching a non-Apps host is an ordinary tool that the model can see and call. [INFERENCE]

The specification also makes support explicit and negotiated. "As an extension, MCP Apps is optional and must be explicitly negotiated between clients and servers through the extension capabilities mechanism". Clients advertise `io.modelcontextprotocol/ui` with a `mimeTypes` list in `initialize`. [VERIFIABLE][^9] Server behaviour: "Servers SHOULD check client capabilities before registering UI-enabled tools", and "Servers MAY register different tool variants based on host capabilities". [VERIFIABLE][^9]

### 2.2 What Claude Code documents

The answer to "what does Claude Code do with a tool whose visibility excludes `model`" is not stated. The MCP page was read in full and does not mention `visibility`, app-only tools or `_meta.ui` on tools. [VERIFIABLE][^13]

The page does state one MCP Apps behaviour, for resources: "MCP Apps UI resources are entries with a `ui://` URI or the `text/html;profile=mcp-app` media type: pages for a host application to render rather than content for Claude to read. They don't appear in the `@` suggestions or in the resource list tool's results". [VERIFIABLE][^13] The changelog dates it to 2.1.281: "Changed MCP resource lists (the resource list tool and @-mention suggestions) to skip MCP Apps UI resources; reading one by URI still works". [VERIFIABLE][^14][^15]

The changelog was searched in full for `visibility`, `_meta`, `MCP App`, `app-only` and `ui://`. The 2.1.281 line is the only MCP Apps entry; the other `_meta` entries concern `anthropic/maxResultSizeChars` and `anthropic/alwaysLoad`. [VERIFIABLE][^15] The MCP page documents Claude Code's own `_meta` annotations (`anthropic/maxResultSizeChars`, `anthropic/requiresUserInteraction`, `anthropic/alwaysLoad`) and lists one advertised client capability, `elicitation: {form: {}, url: {}}` on protocol 2026-07-28. It does not say Claude Code advertises `io.modelcontextprotocol/ui`. [VERIFIABLE][^13]

The landscape research's leg B packet recorded "Claude Code is not an MCP Apps host". [VERIFIABLE][^26] That statement and the resource filter are consistent: Claude Code recognises UI resources well enough to hide them, without claiming to render them. [INFERENCE]

The installed 2.1.296 binary contains the string `io.modelcontextprotocol/ui` four times, one of them as `offer:io.modelcontextprotocol/ui` beside an MCP discovery cache. [VERIFIABLE][^25] That proves the identifier is in the build. It does not say whether Claude Code advertises the extension or filters app-only tools. [INFERENCE]

### 2.3 What the ext-apps SDK and its reference host do

The README does not answer the question for non-Apps hosts. It says "There's no _supported_ host implementation in this repo (beyond the examples/basic-host example)" and "Host support varies". It says nothing about what a host without MCP Apps should do with app-only tools. [VERIFIABLE][^10]

`basic-host` is an Apps host, and it filters. Its `isToolVisibleToModel` carries the comment "Tools with `visibility: ["app"]` should not be shown in tool lists." and returns `visibility.includes("model")`, defaulting to visible when `_meta.ui` is absent or does not parse. The function is applied in three `.filter` calls. [VERIFIABLE][^11]

The server helpers implement the specification's advice. `EXTENSION_ID` is `"io.modelcontextprotocol/ui"`, and `getUiCapability` returns the client's extension settings "or `undefined` if not supported". Its documented example registers an app-enhanced tool when the capability is present and a "Text-only fallback" otherwise. [VERIFIABLE][^12] The same file shows an app-only tool registered with `visibility: ["app"]`. [VERIFIABLE][^12]

### 2.4 What follows for beads-ui

The server can avoid depending on Claude Code's behaviour. If the beads-ui MCP server registers its app-only write tools only when `getUiCapability(clientCapabilities)` returns a value with `text/html;profile=mcp-app`, a host that does not advertise the extension never sees those tools. [INFERENCE]

That leaves one risk. If Claude Code does advertise the extension, and does not apply the `tools/list` rule, the app-only tools would reach its model. The binary string means that case cannot be ruled out by reading. [INFERENCE]

Claude Code users have a documented second guard. A bare-name or glob deny rule removes a tool from context, and MCP tools are named `mcp__<server>__<tool>`. [VERIFIABLE][^13][^17] The changelog at 2.1.78 fixed "`deny: ["mcp__servername"]` permission rules not removing MCP server tools before sending to the model". [VERIFIABLE][^15] A beads-ui install for Claude Code could ship a deny for `mcp__beads-ui__app_*` if the tools share a prefix. [INFERENCE]

### Hand-offs

- A live spike for the design stage: start a stdio MCP server that logs the `initialize` request's `capabilities.extensions`, register one tool with `visibility: ["app"]`, and check `/mcp` and the model's tool list in Claude Code 2.1.29x. This settles both unknowns in under ten minutes of agent time.
- Coordinator's design stage: adopt capability-gated registration of app-only tools, with a deny-rule fallback for Claude Code, or record why not.
- Sibling leg (MCP Apps rendering in Claude Desktop and claude.ai): unchanged by this packet.

## 3. Task-tool deny rules in background and cloud sessions

### 3.1 What the docs say about deny rules

The permissions page states the general rule: "A bare tool name like `Bash` removes the tool from Claude's context entirely, so Claude never sees it." A glob behaves the same: "A tool matched by a bare-name glob deny rule is removed from Claude's context, the same as a bare tool name". [VERIFIABLE][^17] Precedence is deny-first across levels: "If a tool is denied at any level, no other level can allow it." [VERIFIABLE][^17]

The page names no exception for background sessions, cloud sessions, headless runs or subagents. It also does not say the rule applies to them by name. [VERIFIABLE][^17]

The tools reference's sentence is about model gating, not about permissions: "In background sessions and in cloud sessions, Claude Code provides the same tools on every model, listed or not." It follows the list of models that get the Task tools by default. [VERIFIABLE][^16] Read in place, "listed or not" means the model list does not apply there. It does not say whether a deny rule removes the tools. [INFERENCE]

The changelog was searched in full for deny rules together with background or cloud sessions and holds no such entry. [VERIFIABLE][^15] The direct answer to Question 3 is `not stated`. [NO SOURCE]

### 3.2 Which settings reach each session kind

Background sessions read normal settings. "A background session reads its settings from the directory it runs in, the same as if you had started `claude` there". [VERIFIABLE][^20] So user-level deny rules in `~/.claude/settings.json` apply there by the same rule as in a terminal session. [INFERENCE]

Cloud sessions do not. The settings page says user and project-local settings are "not read. Both stay on your machine". Shared project settings are read only "in a session with one repository"; a multi-repository Anthropic-hosted session reads "only the `enabledPlugins` and `extraKnownMarketplaces` keys from each repository's `.claude/settings.json`, not permission rules". Device managed settings do not reach a cloud session; server-managed settings do. [VERIFIABLE][^19] The cloud page gives the same two routes for any setting: "set an environment variable on the environment, or in a session with one repository, commit the key to that repository's `.claude/settings.json`". [VERIFIABLE][^21]

ai-harness renders per-machine settings into `~/.claude/settings.json`, and its template sets the Task-tool opt-in there. [VERIFIABLE][^24] A per-machine-profile retirement switch built on that file therefore covers terminal and background sessions on that machine and never reaches a cloud session. [INFERENCE]

For cloud sessions the documented routes are a deny rule committed to a repo's `.claude/settings.json` (single-repository sessions only) or the organisation's server-managed settings. Both are repo-wide or org-wide, not per machine. [VERIFIABLE][^19] [INFERENCE]

### 3.3 The two environment variables, verbatim

`CLAUDE_CODE_ENABLE_TASKS`: "Selects which task-tracking tools Claude Code provides in [sessions that have them](/docs/en/tools-reference#task-tool-availability). By default, Claude Code provides the Task tools `TaskCreate`, `TaskUpdate`, `TaskGet`, and `TaskList`. Set to `0` to get the legacy `TodoWrite` tool instead. See [Task list](/docs/en/interactive-mode#task-list)" [VERIFIABLE][^18]

`CLAUDE_CODE_ENABLE_TODO_TOOLS`: "Set to `1` to get the task-tracking tools on every model. Without it, Claude Code provides them by default only on the models listed under [Task tool availability](/docs/en/tools-reference#task-tool-availability). `CLAUDE_CODE_ENABLE_TASKS` still selects the Task tools or `TodoWrite`. Requires Claude Code v2.1.233 or later" [VERIFIABLE][^18]

Neither variable removes the tools. `CLAUDE_CODE_ENABLE_TASKS=0` swaps the four Task tools for `TodoWrite`, and the TODO variable only adds them on unlisted models. [VERIFIABLE][^16][^18]

The version floors in the docs differ. The env-var row says v2.1.233; the tools reference says "The default set described here applies in Claude Code v2.1.268 and later". [VERIFIABLE][^16][^18] The changelog explains both: 2.1.233 removed the tools on "Opus 4.8, Sonnet 5, Fable 5, Mythos 5, and newer models", and 2.1.268 narrowed the default to "Claude 3.x, Opus 4.0–4.7, Sonnet 4.0–4.6, Haiku 4.5". [VERIFIABLE][^15]

### 3.4 Other opt-in routes a retirement must close

The tools reference lists three opt-ins besides the env var: naming a Task tool in `--allowedTools`, listing it in `--tools`, and the Agent SDK's `allowedTools` and `tools` options. [VERIFIABLE][^16][^22] Subagents follow the parent: "Claude Code gives a subagent the tools only when your session has them". [VERIFIABLE][^16]

A deny rule outranks all of these, by the "denied at any level" rule. [VERIFIABLE][^17] [INFERENCE] One exception to deny precedence is documented for mods: outside managed settings and Team or Enterprise sign-in, "the mod can approve a call that a deny rule refuses". [VERIFIABLE][^17] A bare-name deny removes the tool from the model's context first, so there is no call for a mod to approve. [INFERENCE]

### 3.5 What follows for the retirement switch

For terminal and background sessions on a retired machine profile, dropping `CLAUDE_CODE_ENABLE_TODO_TOOLS` is not enough, because background sessions get the tools on every model. A bare-name deny for `TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate` and `TodoWrite` in the rendered user settings is the documented removal. [INFERENCE]

For cloud sessions the switch cannot be per machine. If Sergei wants the panel gone there too, it is a committed project deny in each repo or a server-managed deny. This is a scope fact the design should state next to the "per machine profile" wording in the ask. [INFERENCE]

### Hand-offs

- Sibling spike (ai-harness settings renderer): carry the five-tool bare-name deny list and the finding that `~/.claude/settings.json` never reaches cloud sessions.
- Coordinator's design stage: decide whether cloud sessions are in scope for retirement, and if so which repo-level or org-level route.
- A live check: in a `claude --bg` session on a retired profile, ask "What tools do you have access to?", the check the tools reference recommends, and confirm the Task tools are absent.

## 4. `--metadata` and `--set-metadata` for keys such as `rank` and `display_id`

### 4.1 `bd update --metadata` merges

The help text reads "Set custom metadata (JSON string or @file.json to read from file)". [VERIFIABLE][^23] The v1.3.0 source passes that value as a merge: "Passed as a merge OPERATION, not a pre-merged value: the storage layer re-reads and merges inside the mutation transaction so a concurrent writer's keys survive (lost-update fix)." [VERIFIABLE][^7]

The merge is shallow. `MergeMetadataJSON` documents "Top-level keys from incoming overwrite keys in existing; keys only in existing are preserved. Both inputs must be JSON objects (or empty/null)." [VERIFIABLE][^6] So `bd update X --metadata '{"rank":"a1"}'` keeps `display_id` and replaces only `rank`. [INFERENCE]

The CLI refuses the two styles together: "cannot combine --metadata with --set-metadata or --unset-metadata". [VERIFIABLE][^7]

### 4.2 `bd create --metadata` sets the first document

`bd create` has `--metadata` and no `--set-metadata`. [VERIFIABLE][^25] The HTTP `Issue.metadata` description warns that the store "validates only that the value is WELL-FORMED JSON: a row created with a non-object (e.g. `bd create --metadata '[1,2]'`) can carry an array or a scalar here." [VERIFIABLE][^1] A later `:casMetadata` on such a row is a `500`. [VERIFIABLE][^1]

### 4.3 `--set-metadata key=value` types the value

`--set-metadata` writes one top-level key per flag and keeps the rest. [VERIFIABLE][^6][^23] The value is typed from its spelling. `MetadataEditValue` documents: "`null` is JSON null, `true`/`false` are booleans, anything that scans as a float AND is valid JSON on its own is emitted as that literal (so 5 -> 5, 1e3 -> 1e3, while 05, +5 and NaN stay strings because they are not valid JSON), and everything else is a string." [VERIFIABLE][^6] The v1.3.0 release notes record the same contract: "`--set-metadata k=5` stores the typed scalar `5`". [VERIFIABLE][^3]

| Command | Stored value | Type |
|---|---|---|
| `--set-metadata rank=a0V` | `"a0V"` | string |
| `--set-metadata rank=0.5` | `0.5` | number |
| `--set-metadata rank=1e3` | `1e3` | number |
| `--set-metadata rank=05` | `"05"` | string |
| `--set-metadata display_id=BU-spike-beads-ui-bd-dvdg` | `"BU-spike-beads-ui-bd-dvdg"` | string |
| `--set-metadata display_id=123` | `123` | number |

[INFERENCE] (each row applies the quoted rule; none was run)

Numbers then pass through the float decode the CAS section describes, so `1.0` is stored as `1` and integers past 2^53 are rounded. [VERIFIABLE][^1] A rank key written through the CLI should be a non-numeric string, or written as JSON through `--metadata` so its type is explicit. [INFERENCE]

### 4.4 Key syntax and size

Keys must match `^[a-zA-Z_][a-zA-Z0-9_./]*$`. [VERIFIABLE][^6] A dotted key such as `jira.sprint` is a top-level key: the JSON path helper quotes it so that `gc.routed_to` is not read as a nested path. [VERIFIABLE][^6] `rank` and `display_id` both pass. [INFERENCE]

No metadata-specific size limit is documented in the CLI help or the user docs. The HTTP surface bounds a key at 255 characters on `:casMetadata` and on `unset`, and every request body at 1 MiB. [VERIFIABLE][^1] The storage column type was not read. [NO SOURCE]

### 4.5 Reserved and indexed keys

Upstream reserves two prefixes. The metadata page's table gives `bd:` for "Beads internal use" and `_` for "Internal/private keys", followed by "Avoid these prefixes in user-defined keys to prevent conflicts with future Beads features." [VERIFIABLE][^5] The key regex rejects `:`, so a `bd:`-prefixed key cannot be written through `--set-metadata` or `:casMetadata` at all. [INFERENCE]

The same page advises namespacing and shows a tracker round-trip example holding `board_id`, `sprint_id` and `remote_type` under one integration key, with "Prefer namespaced keys and keep tracker-specific policy in the integration." [VERIFIABLE][^5] That is upstream's own precedent for keeping sprint data in metadata. [INFERENCE]

No document names an indexed metadata key. The list sort cannot use metadata (section 1.8), and the filters are equality and presence over top-level keys. [VERIFIABLE][^1] The source builds them as JSON path expressions, which reads as a scan, not an index lookup. [INFERENCE]

The v1.3.0 source does carry optional metadata validation that the user docs describe as future. `config.go` defaults `validation.metadata.mode` to `none` and reads `validation.metadata.fields`; `storage/metadata.go` defines field types `string`, `int`, `float`, `bool` and `enum` with `required`, `min` and `max`. [VERIFIABLE][^6][^8] The metadata doc's Related list still calls `#1416` "Optional schema enforcement (future)". [VERIFIABLE][^5] A beads-ui workspace could declare `rank` as a string and `display_id` as required in `error` mode. This is unverified in a live store. [INFERENCE]

### Hand-offs

- Coordinator's design stage: fix the rank key's name, type (string fractional index) and namespace, for example `beads_ui.rank` or plain `rank`, and record that `_` and `bd:` are reserved.
- Coordinator's design stage: decide whether to enable `validation.metadata` on beads-ui's own workspace.
- Sibling leg or ai-harness: `bd-new` and `bdx` write `display_id` through the CLI. A purely numeric slug would be stored as a number; the fleet's prefixed slugs avoid that.

## Gaps, blindspots and emergent findings

### Emergent findings

The prior research read the wrong version of the spec. The first 100,000 characters of `main` are close to v1.3.0, but `main` is ahead by three operations and four members, and a client generated from `main` would call `issues:batchGet` and `issues:reclaim`, which bd 1.3.0 does not serve. [VERIFIABLE][^1][^2][^25] [INFERENCE]

`bd update --metadata` merges. The help text alone suggests replacement, and a designer reading only `--help` would build a read-modify-write that the CLI already does safely. [VERIFIABLE][^7][^23]

Cloud sessions ignore user settings. The ask's "config file setting ... per machine profile" covers local sessions only. [VERIFIABLE][^19] [INFERENCE]

The 1.3.0 spec's `updateIssue` description and `IssuePatchBody` disagree about additive label edits. A generated client follows the schema. [VERIFIABLE][^1]

### Blindspots I could not resolve

Claude Code's handling of `visibility: ["app"]` and whether it advertises `io.modelcontextprotocol/ui`. No source states either, and the binary strings are not behaviour. A ten-minute live probe answers both; it was out of scope for a read-only spike. [NO SOURCE]

Whether a deny rule removes the Task tools in a background or cloud session. The general rule and the settings-loading rules support an inference for background sessions only. [NO SOURCE]

Whether `permissions.allow: ["TaskCreate"]` in a settings file opts a session in, the way `--allowedTools TaskCreate` does. The tools reference names the flag and the SDK option only. A stale allow rule in some settings file could re-enable the tools on a retired profile. [NO SOURCE]

`bd serve` behaviour on this host. The spec describes the contract; nothing was run, the host is in proxied-server mode on a shared Dolt server, and v1.3.1 notes several proxied-server fixes for `bd serve`. [VERIFIABLE][^4] [NO SOURCE]

The metadata column's size and type. Not read. [NO SOURCE]

Three Claude Code pages were read partly. The env-vars page was read to 100,000 of 171,035 characters, agent view to 100,000 of 137,050, and the docs changelog in two chunks; the GitHub changelog was searched in full. A clause on the unread part of the first two could change section 3. [VERIFIABLE][^18][^20]

WebFetch output for Claude Code pages passes through an extraction model. Quotes from the tools reference, permissions and settings pages came back as raw page text and were substring-checked; quotes from the env-vars page came back as an extracted table row and match the leg C packet's independent fetch. [HEURISTIC]

### Critic pass

Conventional: the spec is explicit and the schemas answer every member question in section 1. No change.

Contrarian: capability gating does nothing if Claude Code advertises the extension and ignores visibility. Section 2.4 records this as the open risk, with the deny-rule fallback and the live probe.

Historical: the version drift in 1.1. Earlier findings that cite `main` should be re-read against v1.3.0 before the design cites them.

Adjacent: the cloud-settings rule in 3.2. The question did not ask about it, and it changes the retirement design.

Skeptic: whether "listed or not" was over-read. Section 3.1 quotes the sentence in its place after the model list and reads it as model gating only. That narrows the landscape research's caveat.

### Alignment with the founding ask

| Entry | What this packet covers | Changes to the requirement |
|---|---|---|
| A001 | Drag, reorder and sort persistence (1.4, 1.5, 1.8, 4); create, update and delete with a confirm step (1.2 to 1.7); live views and burndown inputs (1.6); retiring the Claude Code task panel per machine profile (3) | Narrowed: per-machine retirement cannot reach cloud sessions (3.2). Narrowed: journal-fed burndown history is bounded by the 7-day or 100,000-row floors unless retention is raised (1.6) |
| A002 | The MCP UI app sharing tools with the Claude Code surface (2) | Unverified: Claude Code's app-only tool handling (2.4) |
| A003 | Research for the TUI, MCP UI app and web app | Covered for the substrate questions only |
| A004 | Not covered; the queue was out of this spike's scope | None |

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

[^26]: Claude Opus 5.5 researcher leaf for aih-3 (beads-ui). (2026). [beads-ui research leg B: Claude Code mods, MCP Apps and the shared core](https://github.com/sergeiwallace/beads-ui/blob/main/docs/research/findings/beads-ui-mods-and-shared-core.md). sergeiwallace/beads-ui, tracked on main. Read from the worktree 2026-10-15. (Its section on MCP Apps in Claude Code, which states "Claude Code is not an MCP Apps host" from its own sources.)
