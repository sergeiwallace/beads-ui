# Reach the web app from another machine

The web server binds loopback on the host that runs it and opens no inbound port. Each machine
pair reaches it through the transport it already has (the web app design, D-16): the work pair
through the pair transport's supervised Session Manager port forward, with an SSH local forward as
the fallback; the personal pair through `tailscale serve`, on its own or as an app-portal member
(D-15). Every request still needs a browser session on both pairs (D-17), so a forwarded port is
never an open door.

The names below are placeholders. host-a and host-c are the work pair's laptop and host; host-f
and host-b are the personal pair's laptop and host. `<web port>` is the port the server listens on
(`[web] port`, 4810 unless set) and `<local port>` the port the laptop's browser opens.

Run the server supervised on the host first: [Run it as a service](web-run.md#run-it-as-a-service).

## The work pair: host-a reaches host-c

### Through the pair transport's forward

The pair transport keeps a Session Manager port forward from host-a to host-c open, restarts it
when it drops, and reads the ports it carries from its `forwards` map. The map carries one entry
for the web app: host-c's `<web port>` to host-a's `<local port>`. With the transport running on
host-a, open:

```text
http://127.0.0.1:<local port>/
```

On host-c, `[auth]` in the server's `beads-ui.toml` must accept what that browser sends:

```toml
[auth]
hosts = ["127.0.0.1", "localhost"]            # a Host entry without a port matches any port
origins = ["http://127.0.0.1:<local port>"]   # the laptop's address for the app
```

Then sign in. On host-c, run the host command with the laptop's origin, and open the link it
prints on host-a:

```sh
beads-ui-web login-link --origin http://127.0.0.1:<local port>
```

The link works once, for five minutes. The session cookie it sets is scoped to the forwarded
origin, so it never reaches another site.

### The SSH fallback

When the transport is not running, an SSH local forward over the same Session Manager route does
the same job, unsupervised. host-a's SSH configuration already has an alias whose `ProxyCommand`
opens a Session Manager session to host-c; forward the web port through it:

```sh
ssh -N -L <local port>:127.0.0.1:<web port> <session-manager alias>
```

Open `http://127.0.0.1:<local port>/` and sign in as above. The forward lasts as long as the
`ssh` command; it is not restarted when it drops, which is why the transport's entry is the
primary route.

## The personal pair: host-f reaches host-b

### On its own, with `tailscale serve`

On host-b, mount the server at `/beads` on the tailnet name, and tell the server its base path:

```sh
tailscale serve --bg --set-path /beads http://127.0.0.1:<web port>
```

```toml
[web]
base_path = "/beads"

[auth]
hosts = ["127.0.0.1", "host-b.<tailnet>.ts.net"]
origins = ["https://host-b.<tailnet>.ts.net"]
dispatch_identities = ["you@example.com"]     # the tailnet logins that may dispatch
```

`tailscale serve` strips `/beads` before it proxies, so the server routes the request as `/`,
and the app shell carries `<base href="/beads/">` so every asset and API call the page makes goes
back under `/beads`. The server also accepts `/beads/...` itself, so the same URL works through an
SSH forward. Sign in from host-b:

```sh
beads-ui-web login-link --origin https://host-b.<tailnet>.ts.net
```

The printed link starts `https://host-b.<tailnet>.ts.net/beads/`; open it on host-f. Tailscale
adds the caller's tailnet identity to each request; the server records it beside the session and
checks it against `dispatch_identities` before a dispatch, but never signs anyone in on it alone.

### As an app-portal member

app-portal publishes its members on the same tailnet origin and lists them in its shell. The
`beads` row in app-portal's `apps.yaml` points `/beads` at the server's loopback upstream with
`kind: portal` and `health: /healthz`; `app-portal serve-sync` then converges the host's
`tailscale serve` rules to it, so the command above is not run by hand. The server performs the
member duties app-portal's FastAPI helper performs for its other members:

| Duty | How the server meets it |
|---|---|
| Base path | `[web] base_path = "/beads"`: routes stay unprefixed, the shell's `<base>` carries the prefix |
| App shell | Any path below the base that is not a file, `/api/` or `/healthz` gets the shell |
| `/healthz` | 200 `{"status":"ok"}` while the allowlist reads, a store is open and, while a page is open, the change feed reads every head; 503 `{"status":"unavailable"}` otherwise. No session is needed and nothing else is said; the Host allowlist still applies, so `[auth] hosts` keeps `127.0.0.1` for the portal's probe |
| Headers | `Cache-Control: no-store`, `Referrer-Policy: strict-origin-when-cross-origin` and `X-Content-Type-Options: nosniff` on every reply (a hashed asset is cached instead); the Content Security Policy is set beside them |
| Manifest | The build emits `manifest.webmanifest`, scoped to the base path; the app registers no service worker, since the portal's shell owns the one service worker |

The app opens both ways: directly at `https://host-b.<tailnet>.ts.net/beads/`, and from the
portal shell's app switcher, which links to the same path.

## Check the route

From the laptop, with no session:

```sh
curl -s http://127.0.0.1:<local port>/healthz                 # the work pair
curl -s https://host-b.<tailnet>.ts.net/beads/healthz         # the personal pair
```

Each answers `{"status":"ok"}` when the server is up and can read its stores. A 403 means the Host
the request carried is not on `[auth] hosts`.
