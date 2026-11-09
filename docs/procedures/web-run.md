# Run the web app locally

The beads-ui web app serves a Board, a Backlog, a Roadmap, Analytics, Sessions and an Issue
detail view for one Beads store, from a Node server on your own machine. It reads and writes
through `bd`, so it needs `bd` on your `PATH` and a repository with a `.beads` store. To run it in
a container instead, see [Docker Compose](#docker-compose).

## Set up once

In a checkout of this repository:

```sh
npm ci
```

Then give your host the two tables the server needs, in your own
`$XDG_CONFIG_HOME/beads-ui/beads-ui.toml` (or `~/.config/beads-ui/beads-ui.toml`). The server reads
them from that file only, never from a repository's `beads-ui.toml`, so a repository can never
widen what your host accepts or shows. A sample to copy, with your own repository names:

```toml
[hosts]
allow_repos = ["my-repo", "my-other-repo"]   # the repositories this host may show

[auth]
hosts = ["127.0.0.1", "localhost"]            # Host values accepted
origins = ["http://127.0.0.1:4810"]           # where your browser opens the app
dispatch_identities = ["you@example.com"]     # tailnet logins that may dispatch
browser_secret = "state:browser-secret"
receiver_token = "state:receiver-tokens.json"
mcp_token = "state:mcp-token"
configured_user = "you"
signing_key = "secret-store:dispatch-signing-key"
signing_key_id = "host-a-20261109"
trusted_keys = "state:trusted-dispatch-keys.json"
```

A `state:` value names a file in the server's state directory,
`$XDG_STATE_HOME/beads-ui/web/` (or `~/.local/state/beads-ui/web/`). The first start generates
the browser secret, the MCP token and an empty receiver token map there, each mode 0600; nothing
is written into a repository.

## Run it

In the repository whose `.beads` store you want to see, run the one command:

```sh
node /path/to/beads-ui/apps/web/bin/beads-ui-web.mjs
```

It prints the address it serves, such as `beads-ui web: my-repo at http://127.0.0.1:4810/`. To
run it by name from any directory, link it once from the checkout with
`npm link --workspace apps/web`, then run `beads-ui-web`.

Then sign in. On the same host, while the server runs:

```sh
beads-ui-web login-link
```

It prints a link; open it in your browser for the Board. The link works once, for five minutes,
and the server trades it for a session cookie (HttpOnly, SameSite=Strict), so the browser's
address bar and storage never hold a token. A session ends 12 hours after sign-in, or after 2
hours with no request; Sign out in the app bar ends it at once. Run `login-link` with
`--port <n>` for a server on another port, and with `--origin <url>` when your browser reaches the
server at another address than the first `[auth] origins` entry (through a port forward, say).

| Flag | What it does |
|---|---|
| `--port <n>` | Serves on port `n`; `0` picks a free port. The default is 4810, or `[web] port` |
| `--open` | Signs this host's browser in and opens the Board |
| `--help` | Prints the usage |

The host's own commands, each run on the server's host as its user:

| Command | What it does |
|---|---|
| `beads-ui-web login-link [--port <n>] [--origin <url>]` | Prints a one-time sign-in link |
| `beads-ui-web sessions [--port <n>]` | Lists the browser sessions: id, sign-in time, last request, tailnet identity |
| `beads-ui-web revoke-session <id> [--port <n>]` | Ends that one session |
| `beads-ui-web rotate-secret` | Replaces the browser secret, which ends every session |
| `beads-ui-web issue-receiver-token <host>` | Issues `<host>`'s receiver token, printed once; it replaces any earlier one |

The first run, and the first run after a change to the client's sources, builds the client
before it serves. Measured on a 16-core host at a load average near 50 (2026-11-09): with a
current build the Board showed its cards 5.0 seconds after the command started; with a rebuild,
9.8 seconds. The end-to-end suite holds the Board to 10 seconds (`apps/web/e2e/run.spec.ts`).

The server binds `127.0.0.1` unless `[web] host` names another address. It refuses to start,
naming the key, when any `[auth]` key is missing, empty or malformed, or a credential file is
unreadable or not mode 0600, on loopback too. To reach it from another machine, forward the port
over SSH or your own tunnel. Ctrl+C stops it.

When the repository it was started in is not on `[hosts] allow_repos`, or that list cannot be
read, the server still starts but opens no store: it runs no `bd` command, and the Board says
why. The list is read again on every request, so adding the repository opens the store without
a restart.

## Use it

- The Board has one column per status `bd statuses` reports, grouped by category. Drag a card to
  another column to change its status. Every card also has a Move to button with the other
  statuses, so nothing needs a drag (WCAG 2.2, 2.5.7).
- To reorder, drag a card above or below another in its own column, or pick Up one place or Down
  one place in its Move to menu. The card gets a `metadata.rank` key between its new neighbours,
  and no other card is renumbered. Rank is on by default in the web app; set
  `[views] rank = false` to keep sorted columns.
- The Backlog lists the open issues by priority, then rank, then age, and writes each row's
  status and priority in place.
- A card's title opens its detail. A read that fails says which `bd` call failed and why, never
  an empty field.
- Ctrl+K, or Cmd+K on a Mac, opens the command palette. Select a card first, then run Move to a
  status to move it without a drag. The palette also goes to every view.
- Roadmap draws the store's epics and milestones with Frappe Gantt, each placed by its due date
  as a bar from its start (a sprint's `sprint.starts_at`, else when work started, else when it
  was created) to its due date, filled by the share of its children, or a sprint's members, that
  are done. A `blocks` dependency between two of them is a solid line, a parent-child one dashed.
  Epics and milestones with no due date are listed under the chart; a dependency with an end
  among them is counted, not drawn. Click a bar for its detail.
- Analytics draws throughput per week, cycle time with the average of the last five done,
  cumulative flow by status category, a count-based burndown of the current sprint and aging work
  in progress, all from `bd history --events`; each chart's numbers are under its Data toggle.
  Pick 4 to 52 weeks and the sprint. A sprint is the `sprint:<name>` label on its members and a
  `Sprint <name>` milestone with a due date and `sprint.starts_at` in its metadata; without both
  dates the burndown says which is missing. Where a cost export is configured, a table gives each
  issue closed with a session id (`bd close --session <id>`) its session's cost and tokens.
- Sessions lists every session with its state, current task, last heartbeat and claim age when
  `[queue] url` names the work queue. Without it the view lists the store's assignees and says
  liveness is unavailable, since only the queue's registry knows whether a session is alive.

Analytics reads `bd history --events` for each issue that is open or was closed in the window
and has been updated inside it, four at a time, and keeps each issue's events until its
`updated_at` moves. An issue untouched since before the window has no event inside it, so its
own `created_at`, `started_at` and `closed_at` carry it and no history is read. A history read
that fails is named above the charts, and that issue's own dates stand in for its events.

Every write is guarded: a status move runs `bd update --status <to> --if-status <shown>`, and a
priority or rank write carries the same `--if-status` guard. When another actor changed the
issue first, bd exits 13 and writes nothing; the card goes back to where it was, a conflict toast
says what happened, and the card is read again.

## The work queue

Where `[queue] url` names a work queue (ai-core's queue service), the Sessions view reads its
registry and a status move on a task the queue holds a lease on goes through the queue instead of
`bd`: `POST /api/queue/tasks/{repo}/{task_id}/status` with the shown status as
`expected_status`. The queue answers that it took the request, and writes Beads when the owning
session's bridge runs, so a toast says the move was requested. When the queue's status for the
task is no longer the shown one, the queue refuses with 409 and the toast names the status it
holds. A task with no lease writes through `bd` as above. If the queue cannot be read, the move
writes through `bd` and a toast says the lease was not checked, and Sessions falls back to the
store's assignees with the failed read named.

Set `[queue]` in your own `beads-ui.toml`, beside `[hosts]`: the server reads it from that file
alone, never a repository's, since the queue it names takes this host's status writes. Every
session and task row the queue returns passes `[hosts] allow_repos` before Sessions shows it, and
the rows it hides are counted in the health line without naming their repositories.

The queue keys each store by its repository name: the name the allowlist knows it by, its main
working tree's directory, so a linked worktree names its repository, unless `[queue] repo` says
otherwise. The queue answers on loopback with no authentication, so point `url` at a queue on
this machine.

## Configuration

The server reads `beads-ui.toml` on every request: the repository's own file first, else
`$XDG_CONFIG_HOME/beads-ui/beads-ui.toml` (or `~/.config/beads-ui/beads-ui.toml`). The port is read
once, at start. `[auth]`, `[hosts]` and `[queue]` come from the user's file alone (Set up once);
`[auth]` is read at start, `[hosts]` and `[queue]` on every request.

```toml
[web]
port = 4810            # --port overrides it
host = "127.0.0.1"     # beyond loopback only with a valid [auth] table

[views]
rank = true            # the web app's default; false keeps columns sorted
soft_wip_limit = { in_progress = 5 }

[stores.default]
refresh_seconds = 10   # how often an open page re-reads the board and Sessions

[queue]                # in your own file only
url = ""               # empty: no work queue; else its base URL, such as http://127.0.0.1:<port>
repo = "my-repo"       # this store's name in the queue; the repository's name when unset

[analytics]
cost_export = ""       # an OTLP JSON Lines file of Claude Code's metrics; empty shows no cost
```

`cost_export` is a file an OpenTelemetry Collector's file exporter writes from Claude Code's
`claude_code.cost.usage` and `claude_code.token.usage` metrics, which carry `session.id`. A
relative path is read from the directory of the `beads-ui.toml` that names it. Delta and
cumulative temporality both read correctly. A session that closed several issues shows its whole
cost on each, with the count beside its id.

## The API

Every route is under `/api/` and answers JSON; an error body is `{ "error": { "kind", "message",
"source", "exitCode" } }`, where `source` names what failed, such as `bd list`.

Every request must carry a Host on `[auth] hosts`, and each route takes one credential, chosen by
its path, and refuses any other route's:

| Path | Credential |
|---|---|
| `/api/receiver/v1/...` | `Authorization: Bearer <the receiving host's token>`; every refusal is an empty 404 |
| `/api/mcp/v1/...` | `Authorization: Bearer <the MCP token>` |
| `/api/admin/v1/...` | The host's admin key, derived from the browser secret; the host commands above use it |
| everything else, the app's pages included | The browser session cookie |

A browser write (any method but GET and HEAD) also needs the `X-Beads-UI` header and
`Sec-Fetch-Site: same-origin`; with no `Sec-Fetch-Site`, its `Origin` must equal an
`[auth] origins` entry. Each browser write is recorded, with any `Tailscale-User-Login` identity,
in `writes.jsonl` in the state directory. A dispatch route also refuses a request whose
`Tailscale-User-Login` is not on `[auth] dispatch_identities`.

| Route | What it does |
|---|---|
| `GET /api/board` | The store's statuses and issues, and the call-time settings |
| `GET /api/health` | Whether the allowlist reads, and how many rows it hid, never naming them |
| `GET /api/events` | The browser's Server-Sent Events stream, on the session cookie |
| `GET /api/auth/v1/exchange?code=` | Trades a one-time code for the session cookie, then redirects to the Board |
| `POST /api/auth/v1/logout` | Ends the session on the server and clears its cookie |
| `GET /api/issues/:id` | One issue and its comments |
| `POST /api/issues/:id/status` | `{ "to", "shown" }`: the guarded status write; 409 on exit 13. On a leased task with `[queue] url` set, 202 with `"via": "queue"`, or the queue's 409 |
| `POST /api/issues/:id/priority` | `{ "priority", "shown" }`: priority, guarded by the shown status |
| `POST /api/issues/:id/rank` | `{ "shown", "above", "below" }`: a rank key between the two neighbours; 422 names a malformed neighbour |
| `GET /api/roadmap` | The Roadmap's bars, dependency lines and undated epics and milestones |
| `GET /api/analytics?weeks=&sprint=` | The charts' data for `weeks` (1 to 52, default 12) and the named sprint, else the current one; `histories.failed` names each failed `bd history` read and `histories.skipped` counts the issues untouched since before the window; `cost` is the cost section |
| `GET /api/sessions` | The Sessions view, from the work queue or the store's assignees; `queueError` names a failed queue read |

## Docker Compose

The repository's `docker-compose.yml` runs the web app in a container with `bd` 1.3.4. It keeps
the checkout it serves, with that checkout's `.beads` Dolt state, on the `beads-ui-work` volume
at `/work`, and the host's `beads-ui.toml` with the server's credentials on the `beads-ui-home`
volume:

```sh
docker compose up --build -d                                    # a new, empty store
BEADS_UI_REPO=https://example.com/you/repo.git docker compose up --build -d   # or clone one
docker compose exec web beads-ui-web login-link                 # open the link it prints
```

On its first start an empty volume gets the clone of `BEADS_UI_REPO` when set, else a new
repository, and `bd init` when the checkout has no `.beads`; a host `beads-ui.toml` is written
that allows that one repository (`work`) with the `[auth]` table above. Every later start serves
what the volumes hold, so issues, the checkout, its Dolt history and the settings survive
`docker compose restart` and `docker compose down`; only `docker compose down --volumes` deletes
them. Run `bd` against the same store with `docker compose exec web bd list`.

The server binds `127.0.0.1` only, so the container uses the host's network and the app answers
on the host's loopback, `http://127.0.0.1:4810/` unless `BEADS_UI_PORT` says otherwise, and on no
other address. This needs a Linux Docker host, or Docker Desktop with host networking turned on.

## Test it

```sh
npm run e2e:install -w apps/web   # once: Chromium into this checkout's node_modules
npm test                          # includes the web server suite and the Playwright specs
```

The Playwright specs under `apps/web/e2e/` run the Board, Backlog, Issue detail, palette,
Roadmap, Analytics and Sessions specs at 1280 px with a mouse and at 390 px on a touch screen;
the pointer drags run at 1280 px and the touch Move to menu at 390 px. Each spec gets its own
server and a temporary store made with `bd init`. The work-queue cases run against an in-process
queue that answers the queue service's routes with its shapes (`apps/web/test/queue-fake.ts`); to
also read a live queue, run the server suite with `BEADS_UI_LIVE_QUEUE_URL` set to its URL.
