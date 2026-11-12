# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[semantic versioning](https://semver.org/spec/v2.0.0.html). While the major version is 0, a minor
release may add a subsystem and may change interfaces; a patch release only fixes defects and
documentation.

## [Unreleased]

## [0.26.2]

### Changed

- The plugin's display name is now "beads-ui for Claude Code", in the plugin manifest and in its
  marketplace entry, so a listing tells it apart from the separate beads-ui web UI for Beads.
- The plugin has its own README, `plugins/beads-ui/README.md`: what it does, how to install and
  use it, and the output of `claude plugin validate`.

## [0.26.1]

### Fixed

- A `[web]` seconds setting above 2147483.647 (the longest delay a Node timer holds) is now named
  on stderr and its default is used. Before, such a value fired after about 1 ms, so a large
  `service_probe_interval_seconds` made `install-service --enable` poll `/healthz` in a tight
  loop.

## [0.26.0]

### Added

- `beads-ui-web install-service --enable` writes the unit, enables and starts it (restarting it
  when it already runs), and waits until `/healthz` answers 200. It exits 1 with the last probe
  error and the `journalctl` command when the probe times out, and refuses, before writing
  anything, while a transient unit of the same name is live. The `[web]` keys
  `service_probe_timeout_seconds` and `service_probe_interval_seconds` set the probe's wait.
- The beads-ui MCP server, for Claude Code and Claude Desktop over stdio (Phase W4 of the web app
  design). It lists, shows, creates, closes and changes the status of tasks, and reads the ready
  list, all through the web server, which still holds the store allowlist and the signing key. On
  a host that shows MCP Apps, its board view shows a prompt a model drafted, with a Confirm
  control, and a prompt you type there is sent only after a "Send this prompt?" step. See
  [MCP server setup](docs/procedures/mcp-app-install.md).
- MCP routes on the web server under `/api/mcp/v1/`, taking the MCP token alone. A prompt a model
  asks for is stored as a draft and nothing is sent until you confirm it; the MCP App's own Send
  and the web app's composer go through the same prompt path to the dispatch ladder. Each dispatch
  request carries a request id the server accepts once.
- Drafts in the Review view: a prompt drafted through the MCP server waits there with its text and
  is sent only when you press "Confirm and send". The row then names the dispatch and its target;
  a refusal is named and the draft stays confirmable.

### Fixed

- The web server runs one store's bd calls one at a time, so a call's 10-second timeout covers
  only its own run, not the calls queued ahead of it. A call waits for its store's earlier calls
  for at most a bounded time read from the config at each call, and a read whose request was
  abandoned before it started is dropped.
- A failed read of one issue names its store at once, rather than only after the board read
  finishes.
- A shown receipt that arrives while its carrier command is still exiting marks every dispatch of
  that event shown, so none of them is tried again through the next rung.

## [0.25.0]

### Added

- The web app delivers what you send without keeping sessions awake to poll (Phase W2 of the web
  app design). A prompt, answer or unblock goes to the owning session as addressed Agent Mail,
  then as Buzz and git-inbox pointers, then through the host's own prompt-injection and mod-submit
  commands where the host names them; the session's next tool call or turn end stays the floor.
  Dispatches inside one coalescing window share one notice, a per-session hourly cap holds the
  rest and says so, and a kill switch read at call time stops new sends. While a host's automatic
  wakes are off the mail is still sent and the composer says "waiting: automatic wakes off".
- Changing the owner of a claimed task sends its holder a receiver-first handoff request. The task
  shows "handoff sent", "taken" and "handoff complete" only from the holder's own progress
  reports, and "complete" only after its verify step exits 0. A holder the fleet's liveness check
  proves gone has its claim released through the force path, and the new owner gets a pointer to
  the task. When liveness cannot be read, nothing is reassigned and a retry is offered.
- Goal arming: a prompt, and an answer or unblock with next-step text, asks the receiving session
  to start a goal when none is active, unless you clear that in the composer. A goal paused for a
  usage limit holds new dispatches until it is reported active or its recorded window ends, and
  "deliver now" sends one at once.
- Three receiver API routes for the receiving host: `dispatches/<id>/shown`,
  `dispatches/<id>/progress` and `sessions/goal`.

## [0.24.0]

### Added

- First tagged release. The mod already had a version in `plugin.json`; from here each version
  that reaches `main` also gets a `v` tag and a GitHub Release.
