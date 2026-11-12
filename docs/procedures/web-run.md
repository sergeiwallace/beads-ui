# Run the web app locally

The beads-ui web app serves a Board, a Backlog, a Roadmap, Analytics, Sessions and an Issue
detail view over every Beads store on your machine whose repository is on your allowlist, from a
Node server on your own machine; Roadmap, Analytics and Sessions read one store at a time. It
reads and writes through `bd`, so it needs `bd` on your `PATH` and at least one repository with a
`.beads` store. To run it in a container instead, see [Docker Compose](#docker-compose).

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
allow_repos = ["my-repo", "my-org/my-other-repo"]   # the repositories this host may show

[auth]
hosts = ["127.0.0.1", "localhost"]            # Host values accepted
origins = ["http://127.0.0.1:4810"]           # where your browser opens the app
dispatch_identities = ["you@example.com"]     # tailnet logins that may dispatch
browser_secret = "state:browser-secret"
receiver_token = "state:receiver-tokens.json"
mcp_token = "state:mcp-token"
configured_user = "you"
signing_key = "state:dispatch-signing-key"
signing_key_id = "host-a-20261109"
trusted_keys = "state:trusted-dispatch-keys.json"
```

An `allow_repos` entry names a repository in one of three ways:

| Entry | Names |
|---|---|
| `my-repo` | The repository called `my-repo`: the last segment of its `origin` remote, or its directory's name when it has no remote |
| `my-org/my-repo` | The repository whose `origin` remote ends `my-org/my-repo` (a `host/owner/name` entry works too); a repository with no remote never matches it |
| `/path/to/my-repo` or `~/my-repo` | The repository at that directory (its main working tree) |

Two different repositories never share an identity: the server knows a repository by its
normalized `origin` remote, or by its directory where it has none, so a linked worktree counts as
its repository. When one entry names more than one repository on the host (two clones called
`my-repo` with different owners, say), the server opens none of them through it and the health
line names the entry; name the owner or the path instead.

A `state:` value names a file in the server's state directory,
`$XDG_STATE_HOME/beads-ui/web/` (or `~/.local/state/beads-ui/web/`). The first start generates
the browser secret, the MCP token and an empty receiver token map there, each mode 0600; nothing
is written into a repository.

The dispatch signing key is generated too. When the `state:` file `signing_key` names does not
exist at server start, the server writes a new Ed25519 PKCS #8 PEM there, created with mode
0600, publishes its public key under `signing_key_id`, and prints one line naming the key id
(never the key). To bring your own key instead, put it there before the first start:

```sh
openssl genpkey -algorithm ed25519 -out ~/.local/state/beads-ui/web/dispatch-signing-key
chmod 600 ~/.local/state/beads-ui/web/dispatch-signing-key
```

The server reads the key on every signature. A key file that exists is never overwritten: one
that cannot be read, has a mode wider than 0600 or does not parse leaves the server starting and
serving, printing `dispatches cannot be signed` with the reason, and refusing every new dispatch.
It reads the key only from a `state:` reference; a `secret-store:` reference is reported that way
too, and nothing is generated for it.

## Run it

Run the one command, from any directory:

```sh
node /path/to/beads-ui/apps/web/bin/beads-ui-web.mjs
```

The server reads the stores of your host: every store the host's store inventory lists,
`~/.beads/shared-server/publish-sweep.json` (ai-harness's `bd_publish_sweep.py` writes it;
without it there are none), and the store of the directory you started in. It opens each one
whose repository is on `[hosts] allow_repos` and no other. It prints the stores it opened and the address it serves,
such as `beads-ui web: my-repo, my-org/my-other-repo at http://127.0.0.1:4810/`. To run it by
name from any directory, link it once from the checkout with `npm link --workspace apps/web`, then
run `beads-ui-web`.

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

A store whose repository is not on `[hosts] allow_repos` stays closed: the server runs no `bd`
command against it, and the health line counts it without naming it. When no store is open, or
the list cannot be read, the server still starts but opens no store, and the Board says why.
When the directory it started in is listed but bd finds no store there, it refuses to start. The
list and the inventory are read again on every request, so adding a repository opens its store
without a restart.

## Run it as a service

To keep the server running, supervised, and have it start again after the host reboots, install
it as a systemd user service from the directory you would start it in:

```sh
beads-ui-web install-service [--port <n>]
```

It fills the unit template (`apps/web/service/beads-ui-web.service.in`) from this host, writes
`$XDG_CONFIG_HOME/systemd/user/beads-ui-web.service` (or `~/.config/systemd/user/...`), runs
`systemctl --user daemon-reload`, and prints the unit it wrote and the one command that starts it:

```sh
systemctl --user enable --now beads-ui-web.service
```

The unit runs this checkout's `bin/beads-ui-web.mjs` with this Node, in the current directory, on
`--port`, else `[web] port`, else 4810, with a `PATH` holding the directory of the `bd` it found,
and with `XDG_CONFIG_HOME` and `XDG_STATE_HOME` when they are set. systemd restarts it 5 seconds
after it fails. Running `install-service` again rewrites the same file and reloads, so there is
only ever one unit; it says `wrote`, `rewrote` or `kept`. After a rewrite, restart it with
`systemctl --user restart beads-ui-web.service`. It refuses, writing nothing, when `bd` is not on
`PATH` or the port is not a whole number from 1 to 65535.

A user service starts at boot only when the user has lingering on; `install-service` says so when
it is off. `loginctl enable-linger <user>` turns it on. Follow the server with
`journalctl --user -u beads-ui-web.service`.

To install and start it in one step, add `--enable`:

```sh
beads-ui-web install-service --enable [--port <n>]
```

After writing the unit and reloading, it runs `systemctl --user enable --now beads-ui-web.service`,
and when the service was already running it also runs `systemctl --user restart
beads-ui-web.service`, so a re-run picks up the new unit and code. It then polls
`http://127.0.0.1:<port>/healthz` (the probe that needs no credential; `/api/health` takes a
browser session) until it answers 200, and prints the unit path and the answer. When the probe has
not answered 200 within `[web] service_probe_timeout_seconds` (60 unless set), polling every
`[web] service_probe_interval_seconds` (1 unless set), it exits 1 and prints the last probe error
and the `journalctl` command; the unit stays enabled, so a fix and a restart recover it. Both
settings are read when the command runs.

A server started by hand with `systemd-run --user --unit beads-ui-web` is a transient unit of the
same name, and it shadows the installed unit. `install-service --enable` checks
`systemctl --user show -p Transient` first and, when it reads `yes`, refuses before writing or
enabling anything; it prints `systemctl --user stop beads-ui-web.service` and the command to run
again. Without `--enable` it writes the unit as before and prints the same warning.

To reach the server from another machine, see [Reach the web app from another machine](web-access.md).

## Live updates

While at least one page has its event stream open, the server polls every open store's Dolt
head, every `refresh_seconds` (read before each poll), and reads again only the stores whose head
moved; then it pushes one `change` event naming them
on `/api/events`, and the open page reads its view again. Stores on one Dolt sql-server answer in
one query (`bd sql "SELECT @@<db>_head, ..."`), so a host whose stores share a server costs one
`bd` process per poll; an embedded store answers alone, with `bd vc status`. A store's board read
is kept until its head moves, and any write through the server drops every kept read. With no
stream open the server runs no `bd` for the feed and keeps no read.

When the heads cannot be read, the server keeps what it last read, pushes a `stale` event with the
time it first failed, and tries again after twice the interval, then four times, up to a minute
(or the interval, when that is longer); the page says `Live updates stale since <time>; retrying`
until a poll reads every head.

All the app's tabs in one browser share one event stream: the tab holding a Web Lock opens it and
passes each event to the others over a BroadcastChannel. When that tab closes, the browser grants
the lock to another open tab, which opens the stream at once. A browser without either API gives
each tab its own stream. The page also re-reads on focus and every `refresh_seconds`, as a
fallback while its stream is down.

## Use it

- With no store chosen, the Board and the Backlog show every open store's issues, and each card
  and row names its repository. The store picker in the app bar narrows the view to one store,
  and the choice is in the URL (`?store=my-repo`), so a narrowed view can be shared or reloaded.
  A store that cannot be read is named in an alert with its error, and the others still show.
- An issue is addressed by its store and its id, so the same id in two stores is two cards, and
  every write goes to the issue's own store.
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
- Review lists every held item, blocked task and in-progress task in three sections, Answer,
  Unblock and Prompt, each by priority, then impact, then age. The filters above the list (epic,
  goal, type, size, owner and repository) are in the URL, so a filtered queue can be shared or
  reloaded. J and K move through the list; on a phone one item shows at a time, and Back to the
  list, or U, returns to it.
- A held decision is an option card with the recommended option chosen. Enter takes it, or a
  number key takes that option, and a five-second window follows in which Escape or Undo takes
  it back; then the answer goes to the session holding the item. Without option cards the item's
  body shows with a box for a typed answer. Tick several decisions and pick Approve
  recommendations to answer each with its recommendation, after a confirm that lists them.
- A blocked task takes a resolution and, optionally, a next-step prompt for the same session.
- Every Review item and every task's detail has a composer: Write a prompt opens it, `/` offers
  the work queue's skills, Enter is a new line and Queue prompt sends. Text that looks like a
  credential is refused, naming the kind of credential, never the text. A sent prompt shows its
  session's liveness, its delivery state and the session's response, each with where it comes
  from.
- Single-key shortcuts are on. Turn them off in the command palette or under Keyboard shortcuts
  on the Review page, where each command's key can be changed too; Ctrl and Cmd shortcuts keep
  working with them off.
- Sprints has a picker of the backlog and every open sprint (`?sprint=sprint:<name>` in the URL)
  and shows the chosen one's issues as a board or as a list. Move an issue between the backlog
  and a sprint by dragging it onto a picker entry, from its Move to menu, or from the command
  palette; the move writes the `sprint:<name>` label and drops any other sprint label.
- On a card or a list row, the priority is a picker written in place, and the owner is a button
  that opens the sessions an owner change may name: the work queue's live sessions on an allowed
  repository, or the store's assignees without a queue, narrowed by `[handoff] receivers`. An
  unclaimed task's owner is written at once; a task a session has claimed (assigned and
  `in_progress`) is not reassigned, and a notice says its holder must hand it over. The issue's
  detail has the same owner picker. A list row reorders by drag or by its Up and Down buttons,
  among the rows of its own priority.
- Queue lists every open task, in the work queue's order where `[queue] url` is set and otherwise
  by priority, then rank, then age, and says which order it shows. Blocked only shows the blocked
  tasks, each with what blocks it: its open `blocks` dependencies, or its newest comment for a
  task in the blocked status. The epic, goal, type, size, owner and repository filters are in the
  URL, so a filtered queue can be shared.
- A held item's detail (`/held?path=<item path>`, the path `review` prints) shows its whole body
  and, for a decision with structured options, its option cards above the body.
- Descriptions, comments and held bodies are drawn as Markdown with no raw HTML; a link keeps only
  an http, https or mailto URL, or a link to a heading on the same page.

Analytics reads `bd history --events` for each issue that is open or was closed in the window
and has been updated inside it, four at a time, and keeps each issue's events until its
`updated_at` moves. An issue untouched since before the window has no event inside it, so its
own `created_at`, `started_at` and `closed_at` carry it and no history is read. A history read
that fails is named above the charts, and that issue's own dates stand in for its events.

Every write is guarded: a status move runs `bd update --status <to> --if-status <shown>`, and a
priority or rank write carries the same `--if-status` guard. When another actor changed the
issue first, bd exits 13 and writes nothing; the card goes back to where it was, a conflict toast
says what happened, and the card is read again. A rank write reads both neighbours again just
before it writes, and refuses with a conflict when either was reordered or moved in the meantime,
so the new key always lies between them.

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

The queue keys each store by its repository's bare name: the last segment of the `allow_repos`
entry that opened the store (`name`, `owner/name` and a path all give `name`), unless
`[queue] repo` says otherwise. The queue answers on loopback with no authentication, so point
`url` at a queue on this machine.

## Configuration

The server reads `beads-ui.toml` on every request: the repository's own file first, else
`$XDG_CONFIG_HOME/beads-ui/beads-ui.toml` (or `~/.config/beads-ui/beads-ui.toml`). The port is read
once, at start. `[auth]`, `[hosts]` and `[queue]` come from the user's file alone (Set up once);
`[auth]` is read at start, `[hosts]` and `[queue]` on every request. A `[web]` key in seconds takes
a positive number up to 2147483.647, the longest delay a Node timer holds; a value outside that
range is named on stderr and the default is used.

```toml
[web]
port = 4810            # --port overrides it
host = "127.0.0.1"     # beyond loopback only with a valid [auth] table
base_path = "/beads"   # the path the app is mounted under, such as behind app-portal; "/" unset
bd_queue_wait_seconds = 60  # how long a bd call waits for its store's earlier calls; read at each call
service_probe_timeout_seconds = 60   # how long install-service --enable waits for /healthz; read when it runs
service_probe_interval_seconds = 1   # the wait between its probes; read when it runs

[views]
rank = true            # the web app's default; false keeps columns sorted
soft_wip_limit = { in_progress = 5 }

[stores.default]
refresh_seconds = 10   # how often the server polls the stores' heads, and the fallback re-read

[queue]                # in your own file only
url = ""               # empty: no work queue; else its base URL, such as http://127.0.0.1:<port>
repo = "my-repo"       # this store's name in the queue; the repository's name when unset

[analytics]
cost_export = ""       # an OTLP JSON Lines file of Claude Code's metrics; empty shows no cost

[handoff]              # in your own file only
receivers = ["team-*"] # the session names an owner change may pick; `*` matches any run

[review]               # in your own file only
command = ["held_cli.py"]   # the held store's tool, for a held item's detail
```

`[handoff]` and `[review]` come from your own file alone, as `[queue]` does: a repository's file
cannot widen who receives its tasks or name a command for the server to run. Without
`[handoff] receivers`, every live session the queue's registry holds may be picked. Without
`[review] command`, a held item's detail says held items are not read.

Every response carries a Content Security Policy: scripts only from the server's own origin, so
no inline script runs, and Trusted Types required for every script sink. The app's default
Trusted Types policy passes HTML through DOMPurify and refuses every script and script URL.

`cost_export` is a file an OpenTelemetry Collector's file exporter writes from Claude Code's
`claude_code.cost.usage` and `claude_code.token.usage` metrics, which carry `session.id`. A
relative path is read from the directory of the `beads-ui.toml` that names it. Delta and
cumulative temporality both read correctly. A session that closed several issues shows its whole
cost on each, with the count beside its id.

## Dispatches and the receiver API

A dispatch is a signed prompt for one session on one host (the web app design, Data Model). The
server keeps dispatches in the work queue's prompt store when `[queue] url` is set in your own
`beads-ui.toml`, and in a local append-only journal in its state directory otherwise:

```toml
[queue]
url = "http://127.0.0.1:<queue port>"   # the work queue; leave the table out for the local store

[dispatch]
record = "queue"                        # optional: "queue" needs [queue] url; "local" ignores it
```

Either way the body lives in the state directory's `bodies/`, never in the queue or a backup.
When the target posts `acted` or `failed`, or the dispatch passes its `expires_at` (24 hours after
it was written), the server deletes the body and appends a tombstone, keeping the record and its
receipts. Expiry runs at every receiver request and every 30 seconds.

A dispatch is written only for a task whose repository is on the target host's published
allowlist, `[hosts.<host>] allow_repos` in your `beads-ui.toml`, read at call time, and is one of
this server's open stores, named as the board names it; any other is refused with nothing stored.

The server publishes two files in its state directory, brought up to date at start and every 30
seconds:

| File | What it holds | Who reads it |
|---|---|---|
| `published-dispatch-keys.json` | This host's public signing keys as a trusted-keys map: `{"version": 1, "keys": [{"key_id", "public_key", "not_before", "not_after", "revoked"}]}` | Each receiving host's installer, which merges it into that host's trusted keys |
| `published-allowlist.json` | This host's `[hosts] allow_repos`: `{"version": 1, "allow_repos": [...]}`, or an empty list with `unreadable` and the reason | The servers that dispatch to this host, for their `[hosts.<this host>]` |

To rotate the signing key, write the new key to a new state file, then point `signing_key` at it
and give it a new `signing_key_id` (`<host>-<yyyymmdd>`). The next sweep, or the next signature,
whichever comes first, publishes the new key before anything is signed with it, and marks the old
key valid for 24 more hours; the old key leaves the file after that. A key id names one key for
its whole life: a key id already published for another key is refused.

Each receiving host gets its own token from `beads-ui-web issue-receiver-token <host>` and calls
these routes with `Authorization: Bearer <token>`:

| Route | Answer |
|---|---|
| `GET /api/receiver/v1/dispatches?session=<s>` | 200 `{"dispatches": [...]}`: the outstanding records, without bodies, addressed to the token's host and session `s` |
| `GET /api/receiver/v1/dispatches/<id>/body?session=<s>` | 200, the body's exact bytes as `text/plain; charset=utf-8`, for the dispatch's own host and session, while the task's repository is on the requesting host's allowlist |
| `POST /api/receiver/v1/dispatches/<id>/receipts` | JSON `{"session", "state": "taken" or "acted" or "failed", "reason"}`; 204 once recorded, for the dispatch's own host and session and a move its state allows |

Every refusal is a 404 with an empty body, whatever its cause: no token, a token this host never
issued, another host's token, another session, an unknown id, a malformed receipt. A store the
server cannot reach, such as a work queue that is down, is an empty 503, which the receiving
client retries at its next boundary instead of dropping its receipt.

## The Review queue's settings

The Review view reads the held store through the same `[review] command` the mod reads (the
held tool's `review`, `options` and `show` verbs, each run with no shell and a 20-second
timeout), and reaches a task's owning session through its assignee. Both come from your own
`beads-ui.toml`, read on every request:

```toml
[review]
command = ["held_cli.py"]               # the held store's tool; unset, the view lists tasks only

[dispatch]
host = "host-b"                         # this host's name as receivers know it, for an owner named with no host
unblock_command = ["bd-unblock"]        # what the server runs to unblock a task no session owns
```

A task's dispatch goes to its assignee: at the host the assignee names (`worker@host-b`), else
the host the work queue's session registry has it on, else `[dispatch] host`; with none of them
the write is refused and says so. A held item's dispatch goes to the session that holds it, at
the machine the item names. A one-key answer is recorded as each decision's option letter and
label, then the line `Chosen with a control in the beads-ui Review queue, not typed: the option
letter above is the answer.`; a typed answer is recorded exactly as typed. The answer
dispatch's body is JSON, `{"version": 1, "item": {"store", "relpath", "path"}, "answer"}`, and
an unblock's is `{"version": 1, "resolution", "to": "in_progress"}`; a prompt's body is its text.
Every dispatch is mirrored as a bd comment on its task naming the dispatch id, and in this phase
it is delivered when the receiving session next lists its dispatches through the receiver API.

An unblock's next-step prompt waits in `dispatch-follow-ups.json` in the state directory and is
sent to the same session once the unblock is acted on; when the unblock fails or expires it is
dropped with the reason, and its text is deleted either way. A task with no assignee is unblocked
by the server itself: it writes the resolution as a bd comment, then runs
`<unblock_command> <id> --to in_progress --why <resolution>` in the task's store, and a refusal
is shown with its exit code.

## The API

Every route but `/healthz` is under `/api/` and answers JSON. With `[web] base_path` set, every
route and page is also served under that path (`/beads/api/board`), and a request with the path
already stripped, as `tailscale serve` sends it, is served the same. Every reply carries
`Referrer-Policy: strict-origin-when-cross-origin` and `X-Content-Type-Options: nosniff`, and the
shell and the API `Cache-Control: no-store`; an error body is `{ "error": { "kind", "message",
"source", "exitCode" } }`, where `source` names what failed, such as `bd list`.

Every request must carry a Host on `[auth] hosts`, and each route takes one credential, chosen by
its path, and refuses any other route's:

| Path | Credential |
|---|---|
| `/api/receiver/v1/...` | `Authorization: Bearer <the receiving host's token>`; every refusal is an empty 404 |
| `/api/mcp/v1/...` | `Authorization: Bearer <the MCP token>`; the MCP server's task reads and writes, drafts and dispatches ([mcp-app-install.md](mcp-app-install.md)) |
| `/api/admin/v1/...` | The host's admin key, derived from the browser secret; the host commands above use it |
| `/healthz` | None; it answers only whether the server is healthy |
| everything else, the app's pages included | The browser session cookie |

A browser write (any method but GET and HEAD) also needs the `X-Beads-UI` header and
`Sec-Fetch-Site: same-origin`; with no `Sec-Fetch-Site`, its `Origin` must equal an
`[auth] origins` entry. Each browser write is recorded, with any `Tailscale-User-Login` identity,
in `writes.jsonl` in the state directory. A dispatch route also refuses a request whose
`Tailscale-User-Login` is not on `[auth] dispatch_identities`.

An issue route names its store with `?store=<repository>`, the repository as the board names it.
With one store open the parameter may be left out; with several, a request without it is refused
with a 400, and a request naming a store that is not open with a 404.

| Route | What it does |
|---|---|
| `GET /api/board[?store=]` | Every open store's statuses and issues, or one store's, each issue with its `repository`; `reads` gives each store's issue count or its error, and the call-time settings follow. Only when every store failed is the reply itself the failure |
| `GET /api/health` | Whether the allowlist reads, which stores are open, and how many stores and rows it hid, never naming them |
| `GET /api/events` | The browser's Server-Sent Events stream, on the session cookie: `change` (`{ "stores", "asOf" }`, the stores whose head moved) and `stale` (`{ "since", "message", "retryInMs" }`) |
| `GET /healthz` | No credential: 200 `{"status":"ok"}` while the allowlist reads, a store is open and the change feed, while a page is open, reads every head; else 503 `{"status":"unavailable"}` |
| `GET /api/auth/v1/exchange?code=` | Trades a one-time code for the session cookie, then redirects to the Board |
| `POST /api/auth/v1/logout` | Ends the session on the server and clears its cookie |
| `GET /api/issues/:id?store=` | One issue, its comments and its `repository` |
| `POST /api/issues/:id/status?store=` | `{ "to", "shown" }`: the guarded status write; 409 on exit 13. On a leased task with `[queue] url` set, 202 with `"via": "queue"`, or the queue's 409 |
| `POST /api/issues/:id/priority?store=` | `{ "priority", "shown" }`: priority, guarded by the shown status |
| `POST /api/issues/:id/rank?store=` | `{ "shown", "above", "below", "aboveStore", "belowStore" }`: a rank key between the two neighbours, each read in its own store (the card's unless named); 409 when either moved before the write; 422 names a malformed neighbour |
| `GET /api/roadmap?store=` | The Roadmap's bars, dependency lines and undated epics and milestones |
| `GET /api/analytics?weeks=&sprint=&store=` | The charts' data for `weeks` (1 to 52, default 12) and the named sprint, else the current one; `histories.failed` names each failed `bd history` read and `histories.skipped` counts the issues untouched since before the window; `cost` is the cost section |
| `GET /api/sessions?store=` | The Sessions view, from the work queue or the store's assignees; `queueError` names a failed queue read |
| `GET /api/review` | The Review queue: `held` (the open, current held items the allowlist permits, each with its joined issue, or the failed read with its exit code, or why none are read), `options` (the options command's output for those items), and every open store's blocked and in-progress `tasks` |
| `GET /api/review/body?path=` | A held item's Markdown body through the held tool's `show`; only for an item the Review queue holds |
| `POST /api/dispatch/prompt` | `{ "repo", "task", "text" }` or `{ "item", "text" }`: a prompt to the task's owner or the item's holder; 201 with the dispatch |
| `POST /api/dispatch/answer` | `{ "item", "choices": [{ "decision", "key" }] }` or `{ "item", "text" }`: an answer to the item's holder; 201 with the dispatch and the exact answer text |
| `POST /api/dispatch/unblock` | `{ "repo", "task", "resolution", "followUp" }`: an unblock dispatch to the task's owner (201), or the server's own unblock for a task with no owner (200, `"via": "server"`) |
| `GET /api/dispatch/:id` | The dispatch's three indicators, `liveness`, `delivery` and `response`, each with its `source`, and an unblock's `followUp` |
| `GET /api/dispatch/skills` | The work queue's skill catalog, for the composer's typeahead |
| `POST /api/issues/:id/sprint?store=` | `{ "to", "from", "shown" }`, each of `to` and `from` `backlog` or `sprint:<name>`: the sprint label, guarded by the shown status; 409 when the status or the sprint moved first |
| `POST /api/issues/:id/owner?store=` | `{ "to", "shown", "status" }`: an unclaimed task's assignee, guarded by the shown assignee and status; 400 for a session the handoff rule does not allow; 409 `handoff-required` for a claimed task, with nothing written |
| `POST /api/issues/:id/list-rank?store=` | `{ "shown", "priority", "above", "below", "aboveStore", "belowStore" }`: a list row's rank key between its neighbours of the same priority; 409 when one moved first |
| `GET /api/owners?store=` | The owner picker's sessions, with their `source` and the `rule` that narrowed them; `queueError` names a failed registry read |
| `GET /api/queue-view[?blocked=1]` | The Queue view's rows across every open store, each with its blockers, and the `order` they are in |
| `GET /api/held/item?path=` | A held item `review` lists in an open store: its `body`, its `options` and the read errors of each |

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
Roadmap, Analytics, Sessions, Sprints and Queue specs at 1280 px with a mouse and at 390 px on a touch screen; the
pointer drags run at 1280 px and the touch Move to menu at 390 px. Each spec gets its own server
and a temporary store made with `bd init`; the store registry's spec (`stores.spec.ts`) serves
several such stores from a private home's store inventory. The change feed's suite
(`apps/web/test/heads-feed.test.ts`) also starts its own Dolt sql-server on a free loopback port,
when `dolt` is on `PATH`, to read two stores' heads in one query; without `dolt` that case is
skipped and the embedded-store cases still run. The work-queue cases run against an
in-process queue that answers the queue service's routes with its shapes
(`apps/web/test/queue-fake.ts`); to also read a live queue, run the server suite with
`BEADS_UI_LIVE_QUEUE_URL` set to its URL.

One setting bounds how many test processes a run starts: `BEADS_UI_TEST_JOBS`, a whole number
from 1 to 2, default 1 when unset. It sets turbo's `--concurrency` (package test tasks at once),
each Vitest config's `maxWorkers`, Playwright's `workers` and how many mod test files
`scripts/plugin-test.mjs` runs at once (one by one at 1). The bounds multiply: turbo runs up to
`BEADS_UI_TEST_JOBS` package tasks and each runs up to `BEADS_UI_TEST_JOBS` workers, so one run
starts at most `BEADS_UI_TEST_JOBS` squared test processes, 1 by default and 4 at the maximum of 2.
A value outside 1 to 2 fails the run before any test starts.

```sh
BEADS_UI_TEST_JOBS=2 npm test     # a faster run on a quiet host, at most 4 test processes
```

The pre-commit test hooks skip a commit whose staged paths are all under `docs/` or end in `.md`,
and run the suite for any other staged path, a deleted or renamed one included. The pre-push test
gate still runs the Vitest suites, the ones that read documentation included.
