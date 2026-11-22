# 0002. Node runtime and portal packaging

## Status

Accepted.

## Context

The apps and refresher load the plugin's core TypeScript directly with
Node. The web app can run behind app-portal. MCP Apps hosts render a
single resource document inside their sandbox.

## Decision

- The terminal, web and MCP `bin/resolve-core.mjs` loaders and
  `plugins/beads-ui/refresher/resolve-core.mjs` resolve the workspace core
  alias and map core-relative `.js` specifiers to `.ts`. Claude Code's
  mod validator expects `.js` specifiers and Node type stripping does
  not perform the extension mapping. Shared modules such as
  `core/src/parsers.ts`, `review.ts` and `snapshot.ts` use erasable
  syntax, including explicit assignments in place of parameter properties.
  Claude Code generates the plugin's types on load. Route-block modules
  use type-only imports of `routes.ts` to avoid a runtime cycle.
- `apps/web/server/portal.ts` implements the FastAPI member helper's
  responsibilities in Node. The server applies its member and CSP headers
  before every handler can write. Relative Vite assets and API paths
  follow the shell's same-origin `<base>`. The browser can also make its
  own root favicon request. The app serves a manifest without a service
  worker. Vite copies the public favicon to the built client root.
- `apps/web/docker/entrypoint.sh` initializes empty `/work` from
  `BEADS_UI_REPO` when set, or makes a new repo and store, then creates a
  host allowlist for that repo. Later starts reuse the volumes. Compose
  uses the host network for the loopback bind. Start with
  `docker compose up --build -d` and request a browser link via
  `docker compose exec web beads-ui-web login-link`. The working store and
  host-state volumes survive restart and ordinary down. Compose's
  `down --volumes` removes both. The admin CLI proves host access by
  reading the browser secret locally.
- `apps/web/server/service.ts` restarts an already running service after
  installation. systemd's `enable --now` leaves that process on old code.
- `packages/mcp-server/src/view.ts` inlines the view and the published
  `app-with-deps` bundle because the host cannot fetch subsidiary files.
  The view script uses the bundle through `globalThis.McpApps`. Hosts
  lacking the MCP Apps capability still receive text tools. On capable
  hosts, user controls confirm writes before calling an app-only tool.
  View text goes through `textContent`.
- `apps/web/vite.config.ts` uses React Compiler for the dense board.

## Consequences

The [web run guide](../procedures/web-run.md) covers service and Compose
setup. Runtime resolution tests and TypeScript must exercise the same
core files.
