# Run the web app locally

The beads-ui web app serves a Board, a Backlog and an Issue detail view for one Beads store, from a
Node server on your own machine. It reads and writes through `bd`, so it needs `bd` on your `PATH`
and a repository with a `.beads` store.

## Set up once

In a checkout of this repository:

```sh
npm ci
```

## Run it

In the repository whose `.beads` store you want to see, run the one command:

```sh
node /path/to/beads-ui/apps/web/bin/beads-ui-web.mjs
```

It prints the address it serves, such as `beads-ui web: my-repo at http://127.0.0.1:4810/`; open
that address for the Board. To run it by name from any directory, link it once from the checkout
with `npm link --workspace apps/web`, then run `beads-ui-web`.

| Flag | What it does |
|---|---|
| `--port <n>` | Serves on port `n`; `0` picks a free port. The default is 4810, or `[web] port` |
| `--open` | Opens the Board in the default browser |
| `--help` | Prints the usage |

The first run, and the first run after a change to the client's sources, builds the client
before it serves. Measured on a 16-core host at a load average near 50 (2026-11-09): with a
current build the Board showed its cards 5.0 seconds after the command started; with a rebuild,
9.8 seconds. The end-to-end suite holds the Board to 10 seconds (`apps/web/e2e/run.spec.ts`).

The server binds `127.0.0.1` and nothing else, and refuses to start when `[web] host` names any
other address. To reach it from another machine, forward the port over SSH or your own tunnel.
Ctrl+C stops it.

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
once, at start.

```toml
[web]
port = 4810            # --port overrides it
host = "127.0.0.1"     # any other value refuses the start

[views]
rank = true            # the web app's default; false keeps columns sorted
soft_wip_limit = { in_progress = 5 }

[stores.default]
refresh_seconds = 10   # how often an open page re-reads the board
```

## The API

Every route is under `/api/` and answers JSON; an error body is `{ "error": { "kind", "message",
"source", "exitCode" } }`, where `source` names what failed, such as `bd list`.

| Route | What it does |
|---|---|
| `GET /api/board` | The store's statuses and issues, and the call-time settings |
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
