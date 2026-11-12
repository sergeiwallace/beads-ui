# Run the beads-ui MCP server

The MCP server (`packages/mcp-server`) gives Claude Desktop and Claude Code the task tools and
the beads-ui board as an MCP App. It runs over stdio and talks to your running beads-ui web
server (see [web-run.md](web-run.md)); it reads no store itself and holds no signing key.

## Before you start

- The web server runs on this machine, and has started once, so the MCP token exists in its
  state directory (`state:mcp-token` by default).
- Node 24 or later: the server runs from its TypeScript sources under Node's type stripping.
- `npm ci` in your beads-ui checkout.

The server finds everything else at call time:

| Setting | Read from | Override |
|---|---|---|
| The web server's URL | `http://127.0.0.1:4810/` | `BEADS_UI_URL` |
| The MCP token | the `state:` file `[auth] mcp_token` names in your `beads-ui.toml` | `BEADS_UI_MCP_TOKEN_FILE` |
| The user each dispatch names | `[auth] configured_user` | `BEADS_UI_USER` |

The URL's host must be on `[auth] hosts`, and a base path (`[web] base_path`) belongs in the URL.

## Claude Code

```sh
claude mcp add beads-ui -- node ~/src/beads-ui/packages/mcp-server/bin/beads-ui-mcp.mjs
```

Add `-e BEADS_UI_URL=http://127.0.0.1:4811/` before `--` when the web server listens elsewhere.

## Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "beads-ui": {
      "command": "node",
      "args": ["/path/to/beads-ui/packages/mcp-server/bin/beads-ui-mcp.mjs"],
      "env": { "BEADS_UI_URL": "http://127.0.0.1:4810/" }
    }
  }
}
```

Claude Desktop starts the server with a small environment, so give the full path to the script,
and to `node` too when it is not on the system path.

## What it offers

| Tool | Who calls it | What it does |
|---|---|---|
| `beads_list`, `beads_ready`, `beads_show` | the model or the app | Reads tasks from the stores your allowlist opens |
| `beads_update_status`, `beads_create`, `beads_close` | the model or the app | Writes a task, guarded on the status it was read in |
| `beads_dispatch` | the model | Drafts a prompt for the session that owns a task; sends nothing |
| `beads_dispatch_send` | the MCP App only | Sends the prompt you typed in the app |
| `beads_dispatch_confirm` | the MCP App only | Sends a draft you confirmed in the app |

A draft waits until you confirm it, in the board the MCP App shows or in the web app's Review
view under Drafts. A host that does not advertise the MCP Apps capability, as Claude Code does
not today, gets no app-only tool, so a dispatch there is always a draft you confirm in the web
app. Every confirmed or sent prompt is a signed dispatch the web server writes and its dispatch
ladder delivers, as it does a prompt from the composer.

A dispatch for a task outside your allowlist is refused without naming the repository. The web
server refuses a request with no valid MCP token, one naming a user other than
`[auth] configured_user`, and one that repeats a request id.
