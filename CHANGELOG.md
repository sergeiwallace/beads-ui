# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[semantic versioning](https://semver.org/spec/v2.0.0.html). While the major version is 0, a minor
release may add a subsystem and may change interfaces; a patch release only fixes defects and
documentation.

## [Unreleased]

### Added

- `beads-ui-web install-service --enable` writes the unit, enables and starts it (restarting it
  when it already runs), and waits until `/healthz` answers 200. It exits 1 with the last probe
  error and the `journalctl` command when the probe times out, and refuses, before writing
  anything, while a transient unit of the same name is live. The `[web]` keys
  `service_probe_timeout_seconds` and `service_probe_interval_seconds` set the probe's wait.

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
