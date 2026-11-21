# 0005. Web authentication and receiver boundaries

## Status

Accepted.

## Context

The browser, MCP server and receiving sessions share a web server but
hold different credentials. The signed dispatch format is verified by a
separate repository.

## Decision

- `apps/web/client/api.ts` sends `X-Beads-UI` on browser writes. A
  cross-site form cannot set it. Without the header the same-site cookie
  case receives 403, while a request without the cookie receives 401.
  `apps/web/server/auth.ts` serializes session-file replacement so an
  older snapshot cannot overwrite a newer one. Consumers must account
  for an atomic replacement changing the inode even if size and mtime
  agree.
- `apps/web/server/config.ts` takes the owner rule and held command from
  the user's config. A repo's config cannot widen owner permissions or
  name the executable. Store and queue reads, including MCP tool reads,
  pass the host's repository allowlist. Only the queue session registry
  supplies liveness. Without it, assignees remain visible without a
  liveness claim.
- `apps/web/server/mcp.ts` authenticates MCP requests with the host's MCP
  token, configured user and a request ID accepted once. The MCP helper
  rereads host config and credentials at call time. It holds no signing
  key. The web server signs dispatches and runs the shared delivery
  ladder. A model-created prompt is a draft until the user confirms it
  in either UI. Only a capable host exposes app-only controls to its app.
  The Web API adapter returns even a transport failure as a tool reply.
- `apps/web/server/envelope.ts` signs the UTF-8 RFC 8785 JSON of exactly
  `SIGNED_FIELDS` with Ed25519. Unicode-mode matching detects unpaired
  surrogates while treating a pair as one code point. The verifier's
  golden vectors pin the bytes at both ends. A missing configured
  `state:` key is created with mode 0600 and a configured ID. Existing
  files, including invalid ones, are preserved. Publish a rotated key
  before its first signature and keep older public keys for verification.
- `apps/web/server/receiver-api.ts` restricts reads and receipts to the
  authenticated receiving host and named session. Every refusal is the
  same empty 404 to avoid disclosing a dispatch's existence. Store
  outages return empty 503 for retry. An acted receipt requires taken.

## Consequences

Browser session, MCP and receiver credentials remain separate. A key
rotation preserves verification for outstanding dispatches.
