# Run the web app locally

The beads-ui web app serves a Board, a Backlog and an Issue detail view for one Beads store, from a
Node server on your own machine. It reads and writes through `bd`, so it needs `bd` on your `PATH`
and a repository with a `.beads` store.

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
signing_key = "state:dispatch-signing-key"
signing_key_id = "host-a-20261109"
trusted_keys = "state:trusted-dispatch-keys.json"
```

A `state:` value names a file in the server's state directory,
`$XDG_STATE_HOME/beads-ui/web/` (or `~/.local/state/beads-ui/web/`). The first start generates
the browser secret, the MCP token and an empty receiver token map there, each mode 0600; nothing
is written into a repository.

The dispatch signing key is the one credential the server never generates. Make it once, as an
Ed25519 PKCS #8 PEM of mode 0600, in the state directory:

```sh
openssl genpkey -algorithm ed25519 -out ~/.local/state/beads-ui/web/dispatch-signing-key
chmod 600 ~/.local/state/beads-ui/web/dispatch-signing-key
```

The server reads it on every signature. Until it can, the server still starts and serves, prints
`dispatches cannot be signed` with the reason, and refuses every new dispatch. It reads the key
only from a `state:` reference; a `secret-store:` reference is reported that way too.

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
  status to move it without a drag.

Every write is guarded: a status move runs `bd update --status <to> --if-status <shown>`, and a
priority or rank write carries the same `--if-status` guard. When another actor changed the
issue first, bd exits 13 and writes nothing; the card goes back to where it was, a conflict toast
says what happened, and the card is read again.

## Configuration

The server reads `beads-ui.toml` on every request: the repository's own file first, else
`$XDG_CONFIG_HOME/beads-ui/beads-ui.toml` (or `~/.config/beads-ui/beads-ui.toml`). The port is read
once, at start. `[auth]` and `[hosts]` come from the user's file alone (Set up once); `[auth]` is
read at start, `[hosts]` on every request.

```toml
[web]
port = 4810            # --port overrides it
host = "127.0.0.1"     # beyond loopback only with a valid [auth] table

[views]
rank = true            # the web app's default; false keeps columns sorted
soft_wip_limit = { in_progress = 5 }

[stores.default]
refresh_seconds = 10   # how often an open page re-reads the board
```

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
allowlist, `[hosts.<host>] allow_repos` in your `beads-ui.toml`, read at call time.

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
| `POST /api/issues/:id/status` | `{ "to", "shown" }`: the guarded status write; 409 on exit 13 |
| `POST /api/issues/:id/priority` | `{ "priority", "shown" }`: priority, guarded by the shown status |
| `POST /api/issues/:id/rank` | `{ "shown", "above", "below" }`: a rank key between the two neighbours; 422 names a malformed neighbour |

## Test it

```sh
npm run e2e:install -w apps/web   # once: Chromium into this checkout's node_modules
npm test                          # includes the web server suite and the Playwright specs
```

The Playwright specs under `apps/web/e2e/` run the Board, Backlog, Issue detail and palette specs
at 1280 px with a mouse and at 390 px on a touch screen; the pointer drags run at 1280 px and the
touch Move to menu at 390 px. Each spec gets its own server and a temporary store made with
`bd init`.
